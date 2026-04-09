// content.js — content script injetado na aba capturada.
// Recebe audio TTS do service worker e toca via Web Audio API.
// Fila FIFO: Fernando nao para de falar, cada audio espera o anterior terminar.

(function () {
  if (window.__dubladorContentLoaded) return;
  window.__dubladorContentLoaded = true;

  console.log("[content] Dublador content script carregado.");

  let ttsCtx  = null;
  let ttsGain = null;
  let ttsVolume = 1.0;

  chrome.storage.local.get(["ttsVolume"], (result) => {
    if (result.ttsVolume !== undefined) ttsVolume = result.ttsVolume;
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.ttsVolume) {
      ttsVolume = changes.ttsVolume.newValue;
      if (ttsGain) ttsGain.gain.value = ttsVolume;
    }
  });

  async function ensureContext() {
    if (!ttsCtx) {
      ttsCtx  = new AudioContext({ latencyHint: "playback" });
      ttsGain = ttsCtx.createGain();
      ttsGain.gain.value = ttsVolume;
      ttsGain.connect(ttsCtx.destination);
    }
    if (ttsCtx.state === "suspended") await ttsCtx.resume();
  }

  // Fila FIFO — Fernando nao para, nao descarta, nao pula
  const audioQueue = [];
  let isPlaying = false;

  async function playNext() {
    if (isPlaying || audioQueue.length === 0) return;
    isPlaying = true;

    const { audio } = audioQueue.shift();

    try {
      await ensureContext();
      ttsGain.gain.value = ttsVolume;

      const byteChars = atob(audio);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);

      const audioBuffer = await ttsCtx.decodeAudioData(bytes.buffer);
      const source = ttsCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ttsGain);

      chrome.runtime.sendMessage({ action: "tts-started" }).catch(() => {});

      source.addEventListener("ended", () => {
        isPlaying = false;
        chrome.runtime.sendMessage({ action: "tts-ended" }).catch(() => {});
        console.log(`[content] ✅ TTS reproduzido. Fila: ${audioQueue.length} restante(s).`);
        playNext();
      }, { once: true });

      source.start(0);
      console.log(`[content] 🔊 Tocando (${(bytes.length / 1024).toFixed(1)}KB, fila: ${audioQueue.length}).`);

    } catch (err) {
      isPlaying = false;
      console.error(`[content] ❌ Erro TTS: ${err.message}`);
      chrome.runtime.sendMessage({ action: "tts-ended" }).catch(() => {});
      playNext();
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "tts.audio") {
      if (!msg.audio) {
        sendResponse({ ok: false });
        return true;
      }
      audioQueue.push({ audio: msg.audio });
      console.log(`[content] 📥 Audio enfileirado. Fila: ${audioQueue.length}.`);
      playNext();
      sendResponse({ ok: true });
      return true;
    }
  });

})();
