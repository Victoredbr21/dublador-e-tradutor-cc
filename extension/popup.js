// popup.js — Fernando CC Reader
// Gerencia a UI do popup: toggle on/off, sliders, select de voz, display de CC.
//
// EX-1: sendToContent usa Promise + catch filtrando "Receiving end does not exist"
// EX-4: safeSet() envelopa chrome.storage.local.set com catch de quota

(function () {

  // --- Elementos DOM ---
  const btnToggle       = document.getElementById("btn-toggle");
  const statusBar       = document.getElementById("status-bar");
  const statusText      = document.getElementById("status-text");
  const ccOriginal      = document.getElementById("cc-original");
  const ccTranslated    = document.getElementById("cc-translated");
  const labelTranslated = document.getElementById("label-translated");
  const selectVoice     = document.getElementById("select-voice");
  const sliderRate      = document.getElementById("slider-rate");
  const labelRate       = document.getElementById("label-rate");
  const sliderVolume    = document.getElementById("slider-volume");
  const labelVolume     = document.getElementById("label-volume");
  const chkTranslate    = document.getElementById("chk-translate");

  // --- Estado local ---
  let isEnabled = false;

  // =========================================================================
  // EX-4: Wrapper de escrita no storage com tratamento de cota
  // Mapeia QUOTA_BYTES_PER_ITEM e QUOTA_BYTES para log descritivo.
  // =========================================================================
  function safeSet(data) {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message ?? "";
        if (msg.includes("QUOTA_BYTES") || msg.includes("quota")) {
          console.warn("[Fernando CC] Storage: cota estourada. Dado descartado:", Object.keys(data).join(", "));
        } else {
          console.error("[Fernando CC] Storage: erro inesperado ao salvar —", msg);
        }
      }
    });
  }

  // =========================================================================
  // EX-1: Envio de mensagem ao content script com tratamento de conexao
  // Filtra silenciosamente o erro esperado "Receiving end does not exist"
  // (aba restrita chrome://, aba sem content script carregado ainda).
  // Outros erros reais sao logados com nivel [warn].
  // =========================================================================
  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] ?? null;
  }

  async function sendToContent(message) {
    let tab;
    try {
      tab = await getActiveTab();
    } catch (err) {
      console.warn("[Fernando CC] Nao foi possivel obter aba ativa:", err.message);
      return;
    }

    if (!tab?.id) return;

    // URLs restritas: extensoes nao podem injetar nem enviar mensagens
    const restricted = /^(chrome|chrome-extension|edge|about|data):/i;
    if (restricted.test(tab.url ?? "")) return;

    chrome.tabs.sendMessage(tab.id, message).catch((err) => {
      const msg = err?.message ?? "";
      // Erro esperado: content script ainda nao carregou ou pagina nao suportada
      if (msg.includes("Receiving end does not exist") ||
          msg.includes("Could not establish connection")) {
        return; // silencioso
      }
      console.warn("[Fernando CC] sendMessage falhou —", msg);
    });
  }

  // --- Utilitarios de UI ---
  function setStatus(state) {
    statusBar.className = "status-bar " + state;
    const labels = {
      active:    "\u25b6 Narrando",
      listening: "\ud83d\udc42 Aguardando legenda...",
      idle:      "Desativado",
    };
    statusText.textContent = labels[state] ?? "Desativado";
  }

  function setToggleUI(enabled) {
    btnToggle.classList.toggle("on",   enabled);
    btnToggle.classList.toggle("off", !enabled);
    btnToggle.setAttribute("aria-label", enabled ? "Desativar narrador" : "Ativar narrador");
    setStatus(enabled ? "listening" : "idle");
  }

  // --- Carrega config salva ---
  // EX-4: verifica chrome.runtime.lastError apos get tambem
  chrome.storage.local.get(
    ["enabled", "ttsVoice", "ttsRate", "ttsVolume", "translateEN", "lastOriginal", "lastTranslated"],
    (r) => {
      if (chrome.runtime.lastError) {
        console.error("[Fernando CC] Falha ao ler storage na abertura:", chrome.runtime.lastError.message);
        return;
      }

      isEnabled = r.enabled ?? false;
      setToggleUI(isEnabled);

      if (r.ttsVoice) {
        const opt = selectVoice.querySelector(`option[value="${r.ttsVoice}"]`);
        if (opt) selectVoice.value = r.ttsVoice;
      }

      if (r.ttsRate !== undefined) {
        sliderRate.value      = r.ttsRate;
        labelRate.textContent = Number(r.ttsRate).toFixed(2) + "\u00d7";
      }

      if (r.ttsVolume !== undefined) {
        sliderVolume.value      = r.ttsVolume;
        labelVolume.textContent = Math.round(r.ttsVolume * 100) + "%";
      }

      chkTranslate.checked = r.translateEN !== false; // default true

      // Restaura ultimo CC exibido
      if (r.lastOriginal) {
        ccOriginal.textContent = r.lastOriginal;
        if (r.lastTranslated && r.lastTranslated !== r.lastOriginal) {
          ccTranslated.textContent      = r.lastTranslated;
          ccTranslated.style.display    = "block";
          labelTranslated.style.display = "block";
        }
      }
    }
  );

  // --- Toggle principal ---
  btnToggle.addEventListener("click", () => {
    isEnabled = !isEnabled;
    safeSet({ enabled: isEnabled }); // EX-4
    setToggleUI(isEnabled);
    sendToContent({ action: isEnabled ? "enable" : "disable" }); // EX-1
  });

  // --- Voz ---
  selectVoice.addEventListener("change", () => {
    const voice = selectVoice.value;
    safeSet({ ttsVoice: voice }); // EX-4
    sendToContent({ action: "set-config", ttsVoice: voice }); // EX-1
  });

  // --- Velocidade ---
  sliderRate.addEventListener("input", () => {
    const rate = parseFloat(sliderRate.value);
    labelRate.textContent = rate.toFixed(2) + "\u00d7";
    safeSet({ ttsRate: rate }); // EX-4
    sendToContent({ action: "set-config", ttsRate: rate }); // EX-1
  });

  // --- Volume ---
  sliderVolume.addEventListener("input", () => {
    const vol = parseFloat(sliderVolume.value);
    labelVolume.textContent = Math.round(vol * 100) + "%";
    safeSet({ ttsVolume: vol }); // EX-4
    sendToContent({ action: "set-config", ttsVolume: vol }); // EX-1
  });

  // --- Checkbox tradutor ---
  chkTranslate.addEventListener("change", () => {
    const val = chkTranslate.checked;
    safeSet({ translateEN: val }); // EX-4
    sendToContent({ action: "set-config", translateEN: val }); // EX-1
  });

  // --- Recebe atualizacoes em tempo real do content script via storage ---
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.lastOriginal) {
      const orig = changes.lastOriginal.newValue;
      ccOriginal.textContent = orig || "\u2014";
      setStatus("active");
      clearTimeout(window._ccIdleTimer);
      window._ccIdleTimer = setTimeout(() => {
        if (isEnabled) setStatus("listening");
      }, 2000);
    }
    if (changes.lastTranslated) {
      const trans = changes.lastTranslated.newValue;
      const orig  = ccOriginal.textContent;
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
