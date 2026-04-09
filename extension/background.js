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
// v1.3.1 fix:
//   O campo "voice" do storage armazena o voiceName completo (ex: "pt-BR-AntonioNeural"
//   ou "Microsoft Antonio Online (Natural) - Portuguese (Brazil)").
//   O chrome.tts.speak() espera { lang, voiceName } separados — passar o voiceName
//   no campo lang fazia o TTS silenciar sem erro nenhum.
//   Agora resolveVoice() extrai o lang correto e passa voiceName quando disponivel.

// Mapa de prefixos de voiceName para lang BCP-47 usado pelo chrome.tts
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

/**
 * Dado o valor de "voice" salvo no storage (pode ser um lang simples como "pt-BR",
 * ou um voiceName como "pt-BR-AntonioNeural" ou
 * "Microsoft Antonio Online (Natural) - Portuguese (Brazil)"),
 * retorna { lang, voiceName } prontos para chrome.tts.speak().
 *
 * Logica:
 *  1. Se o valor bate exatamente com um lang do mapa -> usa so o lang (sem voiceName),
 *     deixando o chrome.tts escolher a melhor voz disponivel para o idioma.
 *  2. Se comeca com um prefixo conhecido (ex: "pt-BR-Antonio...") -> extrai o lang
 *     e passa o valor completo como voiceName para tentar a voz especifica.
 *  3. Fallback: lang "pt-BR" sem voiceName.
 */
function resolveVoice(voice) {
  if (!voice) return { lang: "pt-BR" };

  // Caso 1: e exatamente um lang BCP-47 valido (ex: "pt-BR", "en-US")
  const exactMatch = VOICE_LANG_MAP.find(({ prefix }) => prefix === voice);
  if (exactMatch) return { lang: exactMatch.lang };

  // Caso 2: voiceName que comeca com prefixo reconhecivel (ex: "pt-BR-AntonioNeural")
  const prefixMatch = VOICE_LANG_MAP.find(({ prefix }) => voice.startsWith(prefix));
  if (prefixMatch) return { lang: prefixMatch.lang, voiceName: voice };

  // Caso 3: voiceName opaco (ex: "Microsoft Antonio Online (Natural) - Portuguese (Brazil)")
  // Tenta extrair o lang do parentese final, senao usa pt-BR como fallback
  const parenLang = voice.match(/\(([a-z]{2}[-_][A-Z]{2})\)\s*$/);
  if (parenLang) return { lang: parenLang[1].replace("_", "-"), voiceName: voice };

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

    // So inclui voiceName se foi resolvido — evita rejeicao por nome inexistente
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

console.log("[Oracle CC BG] Service worker iniciado.");
