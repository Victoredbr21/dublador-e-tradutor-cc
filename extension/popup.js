// popup.js
// Gerencia o estado do popup: toggle narrador, selects de voz/idioma, slider volume.
// v1.8.0 — remove slider de velocidade (rate fixo=2.0 no background.js)
//           adiciona dica visual quando sourceLang === 'pt'

(function () {
  // ── refs ──────────────────────────────────────────────────────────────────
  const btnToggle    = document.getElementById("btn-toggle");
  const switchIcon   = document.getElementById("switch-icon");
  const statusBar    = document.getElementById("status-bar");
  const statusDot    = document.getElementById("status-dot");
  const statusText   = document.getElementById("status-text");
  const ccOriginal   = document.getElementById("cc-original");
  const ccTranslated = document.getElementById("cc-translated");
  const labelTrans   = document.getElementById("label-translated");
  const selectVoice  = document.getElementById("select-voice");
  const selectLang   = document.getElementById("select-lang");
  const langHint     = document.getElementById("lang-hint");
  const sliderVol    = document.getElementById("slider-volume");
  const labelVol     = document.getElementById("label-volume");

  let isActive = false;

  // ── carregar estado inicial ───────────────────────────────────────────────
  chrome.storage.local.get(
    ["readerActive", "ttsVoice", "ttsVolume", "sourceLang",
     "readerStatus", "lastOriginal", "lastTranslated"],
    (r) => {
      isActive = r.readerActive ?? false;
      applyToggleUI(isActive);

      if (r.ttsVoice)  selectVoice.value = r.ttsVoice;
      if (r.ttsVolume !== undefined) {
        sliderVol.value = r.ttsVolume;
        labelVol.textContent = Math.round(r.ttsVolume * 100) + "%";
      }
      if (r.sourceLang) {
        selectLang.value = r.sourceLang;
        updateLangHint(r.sourceLang);
      }

      if (r.readerStatus) applyStatusUI(r.readerStatus);
      if (r.lastOriginal)  ccOriginal.textContent   = r.lastOriginal;
      if (r.lastTranslated && r.lastTranslated !== r.lastOriginal) {
        ccTranslated.textContent = r.lastTranslated;
        ccTranslated.style.display = "block";
        labelTrans.style.display   = "block";
      }
    }
  );

  // ── toggle on/off ─────────────────────────────────────────────────────────
  btnToggle.addEventListener("click", () => {
    isActive = !isActive;
    chrome.storage.local.set({ readerActive: isActive });
    applyToggleUI(isActive);
    if (!isActive) {
      applyStatusUI("off");
      ccOriginal.textContent     = "\u2014";
      ccTranslated.textContent   = "\u2014";
      ccTranslated.style.display = "none";
      labelTrans.style.display   = "none";
    } else {
      applyStatusUI("waiting");
    }
  });

  // ── voz ───────────────────────────────────────────────────────────────────
  selectVoice.addEventListener("change", () => {
    chrome.storage.local.set({ ttsVoice: selectVoice.value });
  });

  // ── idioma fonte ──────────────────────────────────────────────────────────
  selectLang.addEventListener("change", () => {
    const val = selectLang.value;
    chrome.storage.local.set({ sourceLang: val });
    updateLangHint(val);
  });

  function updateLangHint(val) {
    if (langHint) langHint.style.display = val === "pt" ? "block" : "none";
  }

  // ── volume ────────────────────────────────────────────────────────────────
  sliderVol.addEventListener("input", () => {
    const v = parseFloat(sliderVol.value);
    labelVol.textContent = Math.round(v * 100) + "%";
    chrome.storage.local.set({ ttsVolume: v });
  });

  // ── escuta mudancas de storage (legenda sendo lida) ───────────────────────
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.readerStatus) applyStatusUI(changes.readerStatus.newValue);

    if (changes.lastOriginal) {
      ccOriginal.textContent = changes.lastOriginal.newValue ?? "\u2014";
    }
    if (changes.lastTranslated) {
      const t = changes.lastTranslated.newValue;
      const o = changes.lastOriginal?.newValue ?? ccOriginal.textContent;
      if (t && t !== o) {
        ccTranslated.textContent   = t;
        ccTranslated.style.display = "block";
        labelTrans.style.display   = "block";
      } else {
        ccTranslated.style.display = "none";
        labelTrans.style.display   = "none";
      }
    }
  });

  // ── helpers de UI ─────────────────────────────────────────────────────────
  function applyToggleUI(active) {
    btnToggle.classList.toggle("on",  active);
    btnToggle.classList.toggle("off", !active);
    switchIcon.innerHTML = active ? "&#9646;&#9646;" : "&#9654;";
    btnToggle.setAttribute("aria-label", active ? "Desativar narrador" : "Ativar narrador");
  }

  function applyStatusUI(status) {
    statusBar.className = "status-bar " + (status ?? "idle");
    statusDot.className = "status-dot " + (status ?? "idle");
    const MAP = {
      off:      "Desativado",
      waiting:  "Aguardando legenda...",
      speaking: "Narrando...",
    };
    statusText.textContent = MAP[status] ?? "Desativado";
  }

})();
