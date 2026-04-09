// background.js — Service Worker
//
// Motivo: chrome.tts NAO funciona em content scripts no Brave (e em alguns builds do Chrome).
// O content.js envia mensagens { type: "SPEAK" | "STOP" } para ca,
// e o service worker executa o chrome.tts.
//
// Arquitetura:
//   content.js  -->  chrome.runtime.sendMessage({ type: "SPEAK", text, voice, rate, volume })
//   background  -->  chrome.tts.speak()
//
// v1.4.0 fix:
//   FIX #5: resolveVoice() Caso 3 expandido com mapa de nomes por extenso
//   (ex: "Portuguese (Brazil)", "English (United States)") antes do fallback.
//   O regex anterior /\(([a-z]{2}[-_][A-Z]{2})\)/ nao batia com nomes Microsoft
//   que usam nome do idioma por extenso no parentese final.

// Mapa de prefixos de voiceName para lang BCP-47
const VOICE_LANG_MAP = [
  { prefix: "pt-BR", lang: "pt-BR" },
  { prefix: "pt-PT", lang: "pt-PT" },
  { prefix: "pt",    lang: "pt-BR" },
  { prefix: "en-US", lang: "en-US" },
  { prefix: "en-GB", lang: "en-GB" },
  { prefix: "en",    lang: "en-US" },
  { prefix: "es",    lang: "es-ES" },
  { prefix: "fr",    lang: "fr-FR" },
  { prefix: "de",    lang: "de-DE" },
  { prefix: "it",    lang: "it-IT" },
  { prefix: "ja",    lang: "ja-JP" },
  { prefix: "ko",    lang: "ko-KR" },
  { prefix: "zh",    lang: "zh-CN" },
];

// FIX #5: mapa de nomes por extenso (parentese final de vozes Microsoft/Google)
// ex: "Microsoft Daniel - Portuguese (Brazil)" -> "pt-BR"
const VOICE_NAME_MAP = [
  { pattern: /Portuguese\s*\(Brazil\)/i,           lang: "pt-BR" },
  { pattern: /Portuguese\s*\(Portugal\)/i,         lang: "pt-PT" },
  { pattern: /English\s*\(United\s*States\)/i,     lang: "en-US" },
  { pattern: /English\s*\(United\s*Kingdom\)/i,    lang: "en-GB" },
  { pattern: /English\s*\(Australia\)/i,           lang: "en-AU" },
  { pattern: /Spanish\s*\(Spain\)/i,               lang: "es-ES" },
  { pattern: /Spanish\s*\(Mexico\)/i,              lang: "es-MX" },
  { pattern: /Spanish\s*\(United\s*States\)/i,     lang: "es-US" },
  { pattern: /French\s*\(France\)/i,               lang: "fr-FR" },
  { pattern: /French\s*\(Canada\)/i,               lang: "fr-CA" },
  { pattern: /German\s*\(Germany\)/i,              lang: "de-DE" },
  { pattern: /Italian\s*\(Italy\)/i,               lang: "it-IT" },
  { pattern: /Japanese\s*\(Japan\)/i,              lang: "ja-JP" },
  { pattern: /Korean\s*\(Korea\)/i,                lang: "ko-KR" },
  { pattern: /Chinese\s*\(China\)/i,               lang: "zh-CN" },
  { pattern: /Chinese\s*\(Taiwan\)/i,              lang: "zh-TW" },
];

/**
 * Dado o valor de "voice" salvo no storage, retorna { lang, voiceName }
 * prontos para chrome.tts.speak().
 *
 * Logica:
 *  1. Exatamente um lang BCP-47 do mapa -> usa so o lang (sem voiceName)
 *  2. Comeca com prefixo conhecido -> extrai lang, passa voiceName completo
 *  3a. Regex BCP-47 no parentese final: /\(([a-z]{2}[-_][A-Z]{2})\)/
 *  3b. FIX #5: nome por extenso no parentese: "Portuguese (Brazil)" etc
 *  4. Fallback: lang "pt-BR" sem voiceName
 */
function resolveVoice(voice) {
  if (!voice) return { lang: "pt-BR" };

  // Caso 1: lang BCP-47 exato
  const exactMatch = VOICE_LANG_MAP.find(({ prefix }) => prefix === voice);
  if (exactMatch) return { lang: exactMatch.lang };

  // Caso 2: voiceName com prefixo reconhecivel (ex: "pt-BR-AntonioNeural")
  const prefixMatch = VOICE_LANG_MAP.find(({ prefix }) => voice.startsWith(prefix));
  if (prefixMatch) return { lang: prefixMatch.lang, voiceName: voice };

  // Caso 3a: parentese final com BCP-47 (ex: "Voz (pt-BR)")
  const parenBCP = voice.match(/\(([a-z]{2}[-_][A-Z]{2})\)\s*$/);
  if (parenBCP) return { lang: parenBCP[1].replace("_", "-"), voiceName: voice };

  // Caso 3b: FIX #5 — nome por extenso (ex: "Microsoft Daniel - Portuguese (Brazil)")
  for (const { pattern, lang } of VOICE_NAME_MAP) {
    if (pattern.test(voice)) return { lang, voiceName: voice };
  }

  console.warn(`[Oracle CC BG] Voice nao reconhecida: "${voice}" — usando pt-BR`);
  return { lang: "pt-BR" };
}

function notifyTab(tabId, payload) {
  chrome.tabs.sendMessage(tabId, payload).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "SPEAK") {
    const { lang, voiceName } = resolveVoice(msg.voice);

    const ttsOptions = {
      lang,
      rate:   msg.rate   ?? 1.1,
      volume: msg.volume ?? 1.0,
      onEvent: (ev) => {
        if (ev.type === "end" || ev.type === "cancelled") {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) notifyTab(tabs[0].id, { type: "TTS_DONE" });
          });
        }
        if (ev.type === "error") {
          const code = ev.errorMessage ?? "unknown";
          console.error(`[Oracle CC BG] TTS erro: ${code} | lang:${lang} voiceName:${voiceName ?? "auto"}`);
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) notifyTab(tabs[0].id, { type: "TTS_DONE", error: code });
          });
        }
      }
    };

    if (voiceName) ttsOptions.voiceName = voiceName;

    console.log(`[Oracle CC BG] SPEAK lang:${lang} voiceName:${voiceName ?? "auto"} rate:${ttsOptions.rate}`);

    chrome.tts.stop();
    chrome.tts.speak(msg.text, ttsOptions);

    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "STOP") {
    chrome.tts.stop();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "GET_VOICES") {
    chrome.tts.getVoices((voices) => {
      sendResponse({ voices });
    });
    return true; // async
  }
});

console.log("[Oracle CC BG] Service worker iniciado (v1.4.0).");
