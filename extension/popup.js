// popup.js — Fernando CC Reader
//
// POP-1: HTML limpo, sem WS/captura/ducking
// POP-2: sliders usam "input" so para label, "change" para safeSet
// POP-3: master switch salva readerActive, cor verde/vermelho
// POP-4: ZERO sendMessage — popup e gravador de config; content.js reage via storage.onChanged
// EX-1:  sendToContent removido por completo
// EX-4:  safeSet() com catch de cota
//
// v1.4.0 fix:
//   FIX #4: populateVoices() agora usa chrome.runtime.sendMessage({ type: 'GET_VOICES' })
//           que retorna chrome.tts.getVoices() — catalogo correto para o TTS da extensao.
//           speechSynthesis.getVoices() listava vozes do browser HTML5, catalogo diferente.

(function () {

  // --- Elementos DOM ---
  const btnToggle       = document.getElementById("btn-toggle");
  const switchIcon      = document.getElementById("switch-icon");
  const statusBar       = document.getElementById("status-bar");
  const statusText      = document.getElementById("status-text");
  const ccOriginal      = document.getElementById("cc-original");
  const ccTranslated    = document.getElementById("cc-translated");
  const labelTranslated = document.getElementById("label-translated");
  const selectVoice     = document.getElementById("select-voice");
  const selectLang      = document.getElementById("select-lang");
  const sliderRate      = document.getElementById("slider-rate");
  const labelRate       = document.getElementById("label-rate");
  const sliderVolume    = document.getElementById("slider-volume");
  const labelVolume     = document.getElementById("label-volume");

  // --- Estado local ---
  let isEnabled = false;

  // =========================================================================
  // EX-4: Escrita segura no storage
  // =========================================================================
  function safeSet(data) {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message ?? "";
        if (msg.includes("QUOTA_BYTES") || msg.toLowerCase().includes("quota")) {
          console.warn("[Fernando CC] Storage: cota estourada. Chaves descartadas:", Object.keys(data).join(", "));
        } else {
          console.error("[Fernando CC] Storage: erro inesperado —", msg);
        }
      }
    });
  }

  // =========================================================================
  // FIX #4 — Vozes via chrome.tts.getVoices() (API correta para a extensao)
  //
  // A API speechSynthesis.getVoices() lista vozes do browser HTML5 — catalogo
  // diferente do chrome.tts usado pelo background.js. Os nomes nao batem.
  // Agora pedimos as vozes ao background via GET_VOICES, que chama
  // chrome.tts.getVoices() e retorna o catalogo real do TTS da extensao.
  // =========================================================================
  function populateVoices(savedVoice) {
    chrome.runtime.sendMessage({ type: "GET_VOICES" }, (response) => {
      if (chrome.runtime.lastError || !response?.voices) {
        console.warn("[Fernando CC] GET_VOICES falhou:", chrome.runtime.lastError?.message);
        return;
      }

      const voices = response.voices;
      const preferred = voices.filter(v =>
        v.lang && (v.lang.startsWith("pt") || v.lang.startsWith("en"))
      );
      const list = preferred.length ? preferred : voices;

      selectVoice.innerHTML = "";

      // Opcao padrao — deixa o chrome.tts escolher automaticamente
      const autoOpt = document.createElement("option");
      autoOpt.value = "pt-BR";
      autoOpt.textContent = "Automatico (pt-BR)";
      selectVoice.appendChild(autoOpt);

      list.forEach(v => {
        const opt = document.createElement("option");
        opt.value = v.voiceName;
        opt.textContent = `${v.voiceName} (${v.lang ?? "?"})` ;
        if (v.voiceName === savedVoice) opt.selected = true;
        selectVoice.appendChild(opt);
      });

      // Se nenhuma voz bateu com o salvo, tenta selecionar pt-BR automatico
      if (savedVoice && selectVoice.value !== savedVoice) {
        selectVoice.value = "pt-BR";
      }

      console.log(`[Fernando CC] ${list.length} vozes carregadas do chrome.tts.`);
    });
  }

  // =========================================================================
  // UI helpers
  // =========================================================================
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
    btnToggle.classList.toggle("on",  enabled);
    btnToggle.classList.toggle("off", !enabled);
    btnToggle.setAttribute("aria-label", enabled ? "Desativar narrador" : "Ativar narrador");
    switchIcon.innerHTML = enabled ? "&#9646;&#9646;" : "&#9654;";
    setStatus(enabled ? "listening" : "idle");
  }

  // =========================================================================
  // Inicializacao: carrega config salva
  // =========================================================================
  chrome.storage.local.get(
    ["readerActive", "ttsVoice", "ttsRate", "ttsVolume", "sourceLang", "lastOriginal", "lastTranslated"],
    (r) => {
      if (chrome.runtime.lastError) {
        console.error("[Fernando CC] Falha ao ler storage:", chrome.runtime.lastError.message);
        return;
      }

      isEnabled = r.readerActive ?? false;
      setToggleUI(isEnabled);

      // FIX #4: carrega vozes do chrome.tts com o valor salvo
      populateVoices(r.ttsVoice ?? "");

      if (r.sourceLang) {
        const opt = selectLang.querySelector(`option[value="${CSS.escape(r.sourceLang)}"]`);
        if (opt) selectLang.value = r.sourceLang;
      }

      if (r.ttsRate !== undefined) {
        sliderRate.value      = r.ttsRate;
        labelRate.textContent = Number(r.ttsRate).toFixed(2) + "\u00d7";
      }

      if (r.ttsVolume !== undefined) {
        sliderVolume.value      = r.ttsVolume;
        labelVolume.textContent = Math.round(r.ttsVolume * 100) + "%";
      }

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

  // =========================================================================
  // POP-3 + POP-4: Master Switch
  // =========================================================================
  btnToggle.addEventListener("click", () => {
    isEnabled = !isEnabled;
    setToggleUI(isEnabled);
    safeSet({ readerActive: isEnabled });
  });

  // =========================================================================
  // Controles — apenas safeSet no storage
  // =========================================================================
  selectVoice.addEventListener("change", () => {
    safeSet({ ttsVoice: selectVoice.value });
  });

  selectLang.addEventListener("change", () => {
    safeSet({ sourceLang: selectLang.value });
  });

  sliderRate.addEventListener("input", () => {
    labelRate.textContent = parseFloat(sliderRate.value).toFixed(2) + "\u00d7";
  });
  sliderRate.addEventListener("change", () => {
    safeSet({ ttsRate: parseFloat(sliderRate.value) });
  });

  sliderVolume.addEventListener("input", () => {
    labelVolume.textContent = Math.round(parseFloat(sliderVolume.value) * 100) + "%";
  });
  sliderVolume.addEventListener("change", () => {
    safeSet({ ttsVolume: parseFloat(sliderVolume.value) });
  });

  // =========================================================================
  // Recebe atualizacoes em tempo real do content script via storage.onChanged
  // =========================================================================
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
    if (changes.readerActive) {
      isEnabled = changes.readerActive.newValue;
      setToggleUI(isEnabled);
    }
  });

})();
