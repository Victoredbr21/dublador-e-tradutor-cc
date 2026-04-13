// background.js — Service Worker
//
// v1.9.1 — zero console spam, sender.tab.id, speakWithBestVoice sincrono
//
// Arquitetura:
//   content.js  -->  chrome.runtime.sendMessage({ type: "SPEAK", text, voice, volume })
//   background  -->  chrome.tts.speak()
//   TTS_DONE    -->  sender.tab.id (nunca tabs[0] que pode ser o popup)

const TTS_RATE = 2.0;

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

function resolveVoice(voice) {
  if (!voice) return { lang: "pt-BR" };
  const exactMatch = VOICE_LANG_MAP.find(({ prefix }) => prefix === voice);
  if (exactMatch) return { lang: exactMatch.lang };
  const prefixMatch = VOICE_LANG_MAP.find(({ prefix }) => voice.startsWith(prefix));
  if (prefixMatch) return { lang: prefixMatch.lang, voiceName: voice };
  const parenLang = voice.match(/\(([a-z]{2}[-_][A-Z]{2})\)\s*$/);
  if (parenLang) return { lang: parenLang[1].replace("_", "-"), voiceName: voice };
  return { lang: "pt-BR" };
}

function notifyTab(tabId, payload) {
  chrome.tabs.sendMessage(tabId, payload).catch(() => {});
}

// Cache de vozes — carregado uma vez, evita getVoices() a cada SPEAK
let cachedVoices = null;

function getBestVoice(voiceValue) {
  const { lang, voiceName: resolvedName } = resolveVoice(voiceValue);
  if (!cachedVoices || !resolvedName) return { lang, voiceName: resolvedName };

  const ptVoices = cachedVoices.filter(v => v.lang?.startsWith("pt"));

  // Match exato
  let matched = ptVoices.find(v => v.voiceName === resolvedName);

  // Match fuzzy — extrai nome humano ("antonio" de "pt-BR-AntonioNeural")
  if (!matched) {
    const needle = resolvedName.toLowerCase()
      .replace(/^pt-br-|^pt-pt-|^pt-/i, "")
      .replace(/neural$/i, "");
    if (needle.length > 1) {
      matched = ptVoices.find(v => v.voiceName?.toLowerCase().includes(needle));
    }
  }

  if (matched) return { lang: matched.lang ?? lang, voiceName: matched.voiceName };
  return { lang, voiceName: resolvedName };
}

// Pre-carrega vozes na inicializacao do service worker
chrome.tts.getVoices((voices) => { cachedVoices = voices; });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const senderTabId = sender?.tab?.id ?? null;

  if (msg.type === "SPEAK") {
    const { lang, voiceName } = getBestVoice(msg.voice);

    const ttsOptions = {
      lang,
      rate:   TTS_RATE,
      volume: msg.volume ?? 1.0,
      onEvent: (ev) => {
        if (ev.type === "end" || ev.type === "cancelled" || ev.type === "error") {
          if (senderTabId) notifyTab(senderTabId, { type: "TTS_DONE" });
        }
      }
    };

    if (voiceName) ttsOptions.voiceName = voiceName;

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
      cachedVoices = voices;
      sendResponse({ voices });
    });
    return true;
  }
});
