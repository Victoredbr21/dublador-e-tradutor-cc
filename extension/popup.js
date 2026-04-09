// popup.js — Fernando CC Reader
//
// POP-1: HTML limpo, sem WS/captura/ducking
// POP-2: sliders usam "input" so para label, "change" para safeSet
// POP-3: master switch salva readerActive, cor verde/vermelho
// POP-4: ZERO sendMessage — popup e gravador de config; content.js reage via storage.onChanged
// EX-1:  sendToContent removido por completo
// EX-4:  safeSet() com catch de cota
//
// v1.3.0 fix:
//   - Bug #1: selectVoice agora e populado dinamicamente via speechSynthesis.getVoices()
//             + evento voiceschanged — exibe as vozes reais do browser (filtradas pt/en)

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
  // EX-4: Escrita segura no storage (sem estouro de cota silencioso)
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
  // FIX Bug #1 — Vozes dinamicas via speechSynthesis
  //
  // getVoices() e assincrono no Chrome/Brave: as vozes chegam so apos o
  // evento voiceschanged. Populamos o <select> nesse momento, priorizando
  // vozes pt-* e en-* (fallback: exibe todas se nenhuma for encontrada).
  // =========================================================================
  function populateVoices(savedVoice) {
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return; // ainda nao carregou — voiceschanged vai chamar de novo

    const preferred = voices.filter(v => v.lang.startsWith("pt") || v.lang.startsWith("en"));
    const list = preferred.length ? preferred : voices;

    selectVoice.innerHTML = "";
    list.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.lang})`;
      if (v.name === savedVoice) opt.selected = true;
      selectVoice.appendChild(opt);
    });

    // Se nenhuma voz bateu com o salvo, forca o valor para restaurar
    if (savedVoice && !selectVoice.value) {
      // voz salva nao esta disponivel — seleciona a primeira pt-BR se existir
      const ptBR = list.find(v => v.lang === "pt-BR");
      if (ptBR) selectVoice.value = ptBR.name;
    }
  }

  // Evento assincrono do browser (Chrome/Brave carregam vozes async)
  speechSynthesis.addEventListener("voiceschanged", () => {
    chrome.storage.local.get(["ttsVoice"], r => {
      populateVoices(r.ttsVoice ?? "");
    });
  });

  // Tentativa sincrona (Firefox e alguns contextos carregam na hora)
  populateVoices("");

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

  // POP-3: master switch visual — verde (on) / vermelho (off)
  function setToggleUI(enabled) {
    btnToggle.classList.toggle("on",  enabled);
    btnToggle.classList.toggle("off", !enabled);
    btnToggle.setAttribute("aria-label", enabled ? "Desativar narrador" : "Ativar narrador");
    // Icone: pause quando ativo, play quando inativo
    switchIcon.innerHTML = enabled ? "&#9646;&#9646;" : "&#9654;";
    setStatus(enabled ? "listening" : "idle");
  }

  // =========================================================================
  // Inicializacao: carrega config salva
  // EX-4: verifica lastError na leitura
  // =========================================================================
  chrome.storage.local.get(
    ["readerActive", "ttsVoice", "ttsRate", "ttsVolume", "sourceLang", "lastOriginal", "lastTranslated"],
    (r) => {
      if (chrome.runtime.lastError) {
        console.error("[Fernando CC] Falha ao ler storage:", chrome.runtime.lastError.message);
        return;
      }

      // POP-3: restaura estado do master switch
      isEnabled = r.readerActive ?? false;
      setToggleUI(isEnabled);

      // FIX Bug #1: popula vozes com o valor salvo
      // (populateVoices ja foi chamada sem savedVoice; chama de novo com o salvo)
      if (r.ttsVoice) populateVoices(r.ttsVoice);

      // Idioma fonte salvo
      if (r.sourceLang) {
        const opt = selectLang.querySelector(`option[value="${CSS.escape(r.sourceLang)}"]`);
        if (opt) selectLang.value = r.sourceLang;
      }

      // Velocidade
      if (r.ttsRate !== undefined) {
        sliderRate.value      = r.ttsRate;
        labelRate.textContent = Number(r.ttsRate).toFixed(2) + "\u00d7";
      }

      // Volume
      if (r.ttsVolume !== undefined) {
        sliderVolume.value      = r.ttsVolume;
        labelVolume.textContent = Math.round(r.ttsVolume * 100) + "%";
      }

      // Restaura ultimo CC
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
  // POP-3 + POP-4: Master Switch — so salva no storage, content.js reage
  // =========================================================================
  btnToggle.addEventListener("click", () => {
    isEnabled = !isEnabled;
    setToggleUI(isEnabled);
    safeSet({ readerActive: isEnabled }); // POP-4: sem sendMessage
  });

  // =========================================================================
  // POP-4: Todos os controles apenas dao safeSet no storage
  // O content.js ouve via storage.onChanged e reage
  // =========================================================================

  // Voz: change — salva o nome da voz selecionada
  selectVoice.addEventListener("change", () => {
    safeSet({ ttsVoice: selectVoice.value });
  });

  // Idioma fonte: change
  selectLang.addEventListener("change", () => {
    safeSet({ sourceLang: selectLang.value });
  });

  // POP-2: Rate — "input" so atualiza label, "change" salva no storage
  sliderRate.addEventListener("input", () => {
    labelRate.textContent = parseFloat(sliderRate.value).toFixed(2) + "\u00d7";
  });
  sliderRate.addEventListener("change", () => {
    safeSet({ ttsRate: parseFloat(sliderRate.value) });
  });

  // POP-2: Volume — "input" so atualiza label, "change" salva no storage
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
    // Se o content.js alterar readerActive (ex: auto-desligar), reflete no popup
    if (changes.readerActive) {
      isEnabled = changes.readerActive.newValue;
      setToggleUI(isEnabled);
    }
  });

})();
