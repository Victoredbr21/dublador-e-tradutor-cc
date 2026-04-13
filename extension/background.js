// background.js — Service Worker
//
// Motivo: chrome.tts NAO funciona em content scripts no Brave (e em alguns builds do Chrome).
// O content.js envia mensagens { type: "SPEAK" | "STOP" } para ca,
// e o service worker executa o chrome.tts.
//
// Arquitetura:
//   content.js  -->  chrome.runtime.sendMessage({ type: "SPEAK", text, voice, volume })
//   background  -->  chrome.tts.speak()
//
// v1.3.1 fix:
//   O campo "voice" do storage armazena o voiceName completo (ex: "pt-BR-AntonioNeural"
//   ou "Microsoft Antonio Online (Natural) - Portuguese (Brazil)").
//   O chrome.tts.speak() espera { lang, voiceName } separados — passar o voiceName
//   no campo lang fazia o TTS silenciar sem erro nenhum.
//   Agora resolveVoice() extrai o lang correto e passa voiceName quando disponivel.
//
// v1.8.0:
//   rate fixo = 2.0 (hardcoded aqui, removido do popup e do content.js).
//   Velocidade 2x sincroniza melhor o narrador com as legendas fragmentadas
//   do player Brightcove/VJS. Sem controle externo, sem risco de dessincronizar.
//
// v1.9.0:
//   Fix loop isSpeaking: TTS_DONE agora vai para sender.tab.id em vez de tabs[0].id.
//   Fix voz errada: speakWithBestVoice() usa getVoices() + match exato/fuzzy antes de falar.

// Taxa de fala fixa — nao exposta no popup (v1.8.0)
const TTS_RATE = 2.0;

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
  const parenLang = voice.match(/\(([a-z]{2}[-_][A-Z]{2})\)\s*$/);
  if (parenLang) return { lang: parenLang[1].replace("_", "-"), voiceName: voice };

  console.warn(`[Oracle CC BG] Voice nao reconhecida: "${voice}" — usando pt-BR`);
  return { lang: "pt-BR" };
}

function notifyTab(tabId, payload) {
  chrome.tabs.sendMessage(tabId, payload).catch(() => {});
}

/**
 * v1.9.0 — speakWithBestVoice
 * Antes de falar, lista as vozes instaladas e tenta:
 *   1. Match exato pelo voiceName salvo no storage
 *   2. Match fuzzy: voiceName contem o nome da voz desejada (ex: "antonio")
 *   3. Se nao achar nada, usa apenas lang sem voiceName (evita fallback feminino)
 */
function speakWithBestVoice(text, voiceValue, ttsOptions, tabId) {
  const { lang, voiceName: resolvedName } = resolveVoice(voiceValue);
  ttsOptions.lang = lang;

  chrome.tts.getVoices((voices) => {
    const ptVoices = voices.filter(v => v.lang?.startsWith("pt"));

    // Match exato
    let matched = ptVoices.find(v => v.voiceName === resolvedName);

    // Match fuzzy: procura pelo nome dentro do voiceName (case-insensitive)
    if (!matched && resolvedName) {
      const needle = resolvedName.toLowerCase();
      matched = ptVoices.find(v => v.voiceName?.toLowerCase().includes(
        // extrai a parte humana do nome (ex: "antonio" de "pt-BR-AntonioNeural")
        needle.replace(/^pt-br-|^pt-pt-|^pt-/i, "").replace(/neural$/i, "")
      ));
    }

    if (matched) {
      ttsOptions.voiceName = matched.voiceName;
      ttsOptions.lang      = matched.lang ?? lang;
    } else if (resolvedName) {
      // Passa o voiceName original como ultima tentativa
      ttsOptions.voiceName = resolvedName;
    }
    // Se nao achou nada, nao seta voiceName — chrome.tts escolhe a melhor para lang

    chrome.tts.stop();
    chrome.tts.speak(text, {
      ...ttsOptions,
      onEvent: (ev) => {
        if (ev.type === "end" || ev.type === "cancelled") {
          if (tabId) notifyTab(tabId, { type: "TTS_DONE" });
        }
        if (ev.type === "error") {
          const code = ev.errorMessage ?? "unknown";
          console.error(`[Oracle CC BG] TTS erro: ${code} | lang:${ttsOptions.lang} voiceName:${ttsOptions.voiceName ?? "auto"}`);
          if (tabId) notifyTab(tabId, { type: "TTS_DONE", error: code });
        }
      }
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // v1.9.0: usa sender.tab.id para garantir que TTS_DONE vai para a aba certa
  // (antes usava tabs[0].id que podia ser o popup quando ele estava aberto)
  const senderTabId = sender?.tab?.id ?? null;

  if (msg.type === "SPEAK") {
    const ttsOptions = {
      rate:   TTS_RATE,
      volume: msg.volume ?? 1.0,
    };

    speakWithBestVoice(msg.text, msg.voice, ttsOptions, senderTabId);

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
    return true;
  }
});
