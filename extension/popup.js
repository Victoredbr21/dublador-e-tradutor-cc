// popup.js — Fernando CC Reader
// Gerencia a UI do popup: toggle on/off, sliders, select de voz, display de CC.
// Nao tem service worker: se comunica diretamente com o content script via
// chrome.tabs.sendMessage e persiste config no chrome.storage.local.

(function () {

  // --- Elementos DOM ---
  const btnToggle      = document.getElementById("btn-toggle");
  const statusBar      = document.getElementById("status-bar");
  const statusText     = document.getElementById("status-text");
  const statusDot      = document.getElementById("status-dot");
  const ccOriginal     = document.getElementById("cc-original");
  const ccTranslated   = document.getElementById("cc-translated");
  const labelTranslated = document.getElementById("label-translated");
  const selectVoice    = document.getElementById("select-voice");
  const sliderRate     = document.getElementById("slider-rate");
  const labelRate      = document.getElementById("label-rate");
  const sliderVolume   = document.getElementById("slider-volume");
  const labelVolume    = document.getElementById("label-volume");
  const chkTranslate   = document.getElementById("chk-translate");

  // --- Estado local ---
  let isEnabled = false;

  // --- Utilitarios ---
  function setStatus(state) {
    statusBar.className = "status-bar " + state;
    const labels = {
      active:    "▶ Narrando",
      listening: "👂 Aguardando legenda...",
      idle:      "Desativado",
    };
    statusText.textContent = labels[state] || "Desativado";
  }

  function setToggleUI(enabled) {
    btnToggle.classList.toggle("on",  enabled);
    btnToggle.classList.toggle("off", !enabled);
    btnToggle.setAttribute("aria-label", enabled ? "Desativar narrador" : "Ativar narrador");
    setStatus(enabled ? "listening" : "idle");
  }

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] ?? null;
  }

  async function sendToContent(message) {
    const tab = await getActiveTab();
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, message).catch(() => {});
  }

  // --- Carrega config salva ---
  chrome.storage.local.get(
    ["enabled", "ttsVoice", "ttsRate", "ttsVolume", "translateEN", "lastOriginal", "lastTranslated"],
    (r) => {
      isEnabled = r.enabled ?? false;
      setToggleUI(isEnabled);

      if (r.ttsVoice) {
        // Tenta selecionar a voz salva; se nao existir no select, mantem o primeiro
        const opt = selectVoice.querySelector(`option[value="${r.ttsVoice}"]`);
        if (opt) selectVoice.value = r.ttsVoice;
      }

      if (r.ttsRate !== undefined) {
        sliderRate.value   = r.ttsRate;
        labelRate.textContent = Number(r.ttsRate).toFixed(2) + "\u00d7";
      }

      if (r.ttsVolume !== undefined) {
        sliderVolume.value = r.ttsVolume;
        labelVolume.textContent = Math.round(r.ttsVolume * 100) + "%";
      }

      chkTranslate.checked = r.translateEN !== false; // default true

      // Restaura ultima legenda exibida (UX: popup reabre e mostra o ultimo CC)
      if (r.lastOriginal) {
        ccOriginal.textContent = r.lastOriginal;
        if (r.lastTranslated && r.lastTranslated !== r.lastOriginal) {
          ccTranslated.textContent   = r.lastTranslated;
          ccTranslated.style.display = "block";
          labelTranslated.style.display = "block";
        }
      }
    }
  );

  // --- Toggle principal (on/off) ---
  btnToggle.addEventListener("click", () => {
    isEnabled = !isEnabled;
    chrome.storage.local.set({ enabled: isEnabled });
    setToggleUI(isEnabled);
    sendToContent({ action: isEnabled ? "enable" : "disable" });
  });

  // --- Voz ---
  selectVoice.addEventListener("change", () => {
    const voice = selectVoice.value;
    chrome.storage.local.set({ ttsVoice: voice });
    sendToContent({ action: "set-config", ttsVoice: voice });
  });

  // --- Velocidade ---
  sliderRate.addEventListener("input", () => {
    const rate = parseFloat(sliderRate.value);
    labelRate.textContent = rate.toFixed(2) + "\u00d7";
    chrome.storage.local.set({ ttsRate: rate });
    sendToContent({ action: "set-config", ttsRate: rate });
  });

  // --- Volume ---
  sliderVolume.addEventListener("input", () => {
    const vol = parseFloat(sliderVolume.value);
    labelVolume.textContent = Math.round(vol * 100) + "%";
    chrome.storage.local.set({ ttsVolume: vol });
    sendToContent({ action: "set-config", ttsVolume: vol });
  });

  // --- Checkbox tradutor ---
  chkTranslate.addEventListener("change", () => {
    const val = chkTranslate.checked;
    chrome.storage.local.set({ translateEN: val });
    sendToContent({ action: "set-config", translateEN: val });
  });

  // --- Recebe atualizacoes do content script (legenda detectada) ---
  // O content script nao tem acesso ao popup diretamente, mas podemos
  // puxar o ultimo CC do storage quando o popup e aberto (ja feito acima).
  // Para atualizacoes em tempo real enquanto o popup esta aberto,
  // ouvimos mudancas no storage.local.
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.lastOriginal) {
      const orig = changes.lastOriginal.newValue;
      ccOriginal.textContent = orig || "\u2014";
      setStatus("active");
      // Volta para listening apos 2s sem nova legenda
      clearTimeout(window._ccIdleTimer);
      window._ccIdleTimer = setTimeout(() => {
        if (isEnabled) setStatus("listening");
      }, 2000);
    }
    if (changes.lastTranslated) {
      const trans = changes.lastTranslated.newValue;
      const orig  = document.getElementById("cc-original").textContent;
      if (trans && trans !== orig) {
        ccTranslated.textContent      = trans;
        ccTranslated.style.display    = "block";
        labelTranslated.style.display = "block";
      } else {
        ccTranslated.style.display    = "none";
        labelTranslated.style.display = "none";
      }
    }
    if (changes.enabled) {
      isEnabled = changes.enabled.newValue;
      setToggleUI(isEnabled);
    }
  });

})();
