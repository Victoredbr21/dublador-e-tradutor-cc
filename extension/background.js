// background.js — Service Worker
//
// Motivo: chrome.tts NAO funciona em content scripts no Brave (e em alguns builds do Chrome).
// O content.js envia mensagens { type: "SPEAK" | "STOP" } para ca,
// e o service worker executa o chrome.tts.
//
// Arquitetura:
//   content.js  -->  chrome.runtime.sendMessage({ type: "SPEAK", text, voice, rate, volume })
//   background  -->  chrome.tts.speak()

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "SPEAK") {
    // Para qualquer fala anterior antes de comecar a nova
    chrome.tts.stop();
    chrome.tts.speak(msg.text, {
      lang:    msg.voice  ?? "pt-BR",
      rate:    msg.rate   ?? 1.1,
      volume:  msg.volume ?? 1.0,
      onEvent: (ev) => {
        if (ev.type === "end" || ev.type === "cancelled") {
          // Avisa o content.js que terminou para drenar a fila
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
              chrome.tabs.sendMessage(tabs[0].id, { type: "TTS_DONE" }).catch(() => {});
            }
          });
        }
        if (ev.type === "error") {
          const code = ev.errorMessage ?? "unknown";
          console.error(`[Oracle CC BG] TTS erro: ${code}`);
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
              chrome.tabs.sendMessage(tabs[0].id, { type: "TTS_DONE", error: code }).catch(() => {});
            }
          });
        }
      }
    });
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
