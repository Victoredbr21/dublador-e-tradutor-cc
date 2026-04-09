// Popup — UI com controle WS, captura de audio e controles de audio ao vivo.
let wsState = "disconnected";
let captureActive = false;

const btnConnect        = document.getElementById("btn-connect");
const btnDisconnect     = document.getElementById("btn-disconnect");
const btnCapture        = document.getElementById("btn-capture");
const btnStopCapture    = document.getElementById("btn-stop-capture");
const wsStatusEl        = document.getElementById("ws-status");
const captureStatusEl   = document.getElementById("capture-status");
const messageEl         = document.getElementById("message");
const transcriptEl      = document.getElementById("transcript");
const translationEl     = document.getElementById("translation");
const selectVoice       = document.getElementById("select-voice");

// Sliders
const sliderSpeaker     = document.getElementById("slider-speaker");
const labelSpeaker      = document.getElementById("label-speaker");
const sliderTtsVol      = document.getElementById("slider-tts-vol");
const labelTtsVol       = document.getElementById("label-tts-vol");
const sliderRate        = document.getElementById("slider-rate");
const labelRate         = document.getElementById("label-rate");

// --- Carrega configuracoes salvas ---
chrome.storage.local.get(["ttsVoice", "speakerGain", "ttsVolume", "ttsRate"], (result) => {
  if (result.ttsVoice) selectVoice.value = result.ttsVoice;

  if (result.speakerGain !== undefined) {
    const pct = Math.round(result.speakerGain * 100);
    sliderSpeaker.value = pct;
    labelSpeaker.textContent = pct + "%";
  }
  if (result.ttsVolume !== undefined) {
    const pct = Math.round(result.ttsVolume * 100);
    sliderTtsVol.value = pct;
    labelTtsVol.textContent = pct + "%";
  }
  if (result.ttsRate !== undefined) {
    const num = parseInt(result.ttsRate);
    sliderRate.value = num;
    labelRate.textContent = (num >= 0 ? "+" : "") + num + "%";
  }
});

// --- Voz TTS ---
selectVoice.addEventListener("change", () => {
  const voice = selectVoice.value;
  chrome.storage.local.set({ ttsVoice: voice });
  chrome.runtime.sendMessage({ action: "set-config", voice }, (response) => {
    if (response?.success) setMessage(`🔊 Voz: ${selectVoice.options[selectVoice.selectedIndex].text}`);
  });
});

// --- Slider: volume do video (speaker only — Whisper NAO e afetado) ---
sliderSpeaker.addEventListener("input", () => {
  const pct = parseInt(sliderSpeaker.value);
  const gain = pct / 100;
  labelSpeaker.textContent = pct + "%";
  chrome.storage.local.set({ speakerGain: gain });
  chrome.runtime.sendMessage({ action: "set-config", speakerGain: gain });
});

// --- Slider: volume do narrador TTS ---
sliderTtsVol.addEventListener("input", () => {
  const pct = parseInt(sliderTtsVol.value);
  const vol = pct / 100;
  labelTtsVol.textContent = pct + "%";
  chrome.storage.local.set({ ttsVolume: vol });
  chrome.runtime.sendMessage({ action: "set-config", ttsVolume: vol });
});

// --- Slider: velocidade do narrador ---
sliderRate.addEventListener("input", () => {
  const num = parseInt(sliderRate.value);
  const rateStr = (num >= 0 ? "+" : "") + num + "%";
  labelRate.textContent = rateStr;
  chrome.storage.local.set({ ttsRate: rateStr });
  chrome.runtime.sendMessage({ action: "set-config", ttsRate: rateStr }, (response) => {
    if (response?.success) setMessage(`⏩ Velocidade: ${rateStr}`);
  });
});

// --- WebSocket ---
btnConnect.addEventListener("click", () => {
  setMessage("");
  chrome.runtime.sendMessage({ action: "start" }, (response) => {
    if (response?.success) setMessage(response.message);
  });
});

btnDisconnect.addEventListener("click", () => {
  setMessage("");
  chrome.runtime.sendMessage({ action: "stop" }, (response) => {
    if (response?.success) setMessage(response.message);
  });
});

// --- Capture ---
btnCapture.addEventListener("click", () => {
  setMessage("");
  setCaptureState("capturing");
  chrome.runtime.sendMessage({ action: "start-capture" }, (response) => {
    if (response?.success) {
      captureActive = true;
      setCaptureState("active");
      setMessage(response.message);
    } else {
      setCaptureState("idle");
      setMessage(response?.message || "Erro ao capturar.");
    }
  });
});

btnStopCapture.addEventListener("click", () => {
  setMessage("");
  chrome.runtime.sendMessage({ action: "stop-capture" }, (response) => {
    if (response?.success) {
      captureActive = false;
      setCaptureState("idle");
      setMessage(response.message);
    } else {
      setMessage(response?.message || "Erro ao parar captura.");
    }
  });
});

// --- Mensagens do SW ---
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "ws-state") {
    wsState = message.state;
    updateWsUI();
  }
  if (message.type === "server-response") {
    const d = message.data;
    if (d.type === "pong")        setMessage("Pong recebido!");
    if (d.type === "chunk_ok")    { setMessage("Chunk enviado ✅"); setTimeout(() => { if (messageEl.textContent.includes("✅")) setMessage(""); }, 1500); }
    if (d.type === "tts.playing") setMessage("🔊 Falando: " + d.text);
    if (d.type === "tts.done")    setMessage("✔️ TTS conclуído.");
    if (d.type === "tts.error")   setMessage("❌ Erro TTS: " + d.error);
  }
  if (message.type === "capture-lost") {
    captureActive = false;
    setCaptureState("idle");
    setMessage("⚠️ " + message.message);
  }
  if (message.type === "stt-result") {
    if (message.sttType === "transcript.partial")  updateTranscript(message.text, false);
    else if (message.sttType === "transcript.final") updateTranscript(message.text, true);
  }
  if (message.type === "stt-error") setMessage("STT error: " + message.text);
  if (message.type === "translation" && message.data) {
    const d = message.data;
    if (d.type === "translation.final")        updateTranslation(`${d.source} \u2192 ${d.target}`, true);
    else if (d.type === "translation.partial") updateTranslation(`[Parcial] ${d.target}`);
    else if (d.type === "translation.error")   updateTranslation("Erro ao traduzir: " + d.original);
  }
});

// --- Estado visual ---
function updateWsUI() {
  btnConnect.disabled    = wsState !== "disconnected";
  btnDisconnect.disabled = wsState !== "connected";
  btnCapture.disabled    = wsState !== "connected" || captureActive;
  wsStatusEl.className   = "ws-status " + wsState;
  switch (wsState) {
    case "connected":  wsStatusEl.textContent = "🟢 Conectado"; break;
    case "connecting": wsStatusEl.textContent = "🟡 Conectando..."; break;
    default:           wsStatusEl.textContent = "🔴 Desconectado";
  }
}

function setCaptureState(state) {
  captureStatusEl.className = "capture-status " + state;
  switch (state) {
    case "capturing":
      captureStatusEl.textContent = "Captura: Iniciando...";
      btnCapture.disabled = true;
      btnStopCapture.disabled = false;
      break;
    case "active":
      captureStatusEl.textContent = "Captura: Enviando chunks...";
      btnCapture.disabled = true;
      btnStopCapture.disabled = false;
      break;
    default:
      captureStatusEl.textContent = "Captura: Parada";
      btnCapture.disabled = wsState !== "connected";
      btnStopCapture.disabled = true;
  }
}

function setMessage(text) {
  messageEl.textContent = text;
  if (text) setTimeout(() => { if (messageEl.textContent === text) messageEl.textContent = ""; }, 4000);
}

function updateTranscript(text, isFinal) {
  if (!transcriptEl) return;
  if (isFinal) transcriptEl.textContent += (transcriptEl.textContent ? " " : "") + text;
  else transcriptEl.textContent = text;
}

function updateTranslation(text, isFinal) {
  if (!translationEl) return;
  if (isFinal) translationEl.textContent += (translationEl.textContent ? "\n" : "") + text;
  else translationEl.textContent = text;
  translationEl.scrollTop = translationEl.scrollHeight;
}

// Estado inicial
chrome.runtime.sendMessage({ action: "status" }, (res) => {
  if (res) {
    wsState = res.wsState;
    captureActive = res.capturePort;
    updateWsUI();
    setCaptureState(res.capturePort ? "active" : "idle");
  }
});
