// content.js — Fernando CC Reader
//
// Fluxo principal:
//   1. Detecta legendas via TextTrack API (VTT nativo) ou MutationObserver no DOM
//   2. Filtra texto de UI (botoes, menus, labels)
//   3. Detecta idioma do cue OU usa sourceLang fixo do popup (mais rapido)
//   4. Traduz para PT-BR se necessario
//   5. Fila FIFO com chrome.tts
//   6. Grava lastOriginal/lastTranslated no storage para o popup
//
// EX-1: sem sendMessage vulneravel
// EX-2: handleTTSError() com switch/case nos codigos oficiais
// EX-3: Guards e optional chaining no MutationObserver
// EX-4: safeSet() com catch de cota

(function () {
  if (window.__fernandoCCLoaded) return;
  window.__fernandoCCLoaded = true;

  console.log("[Fernando CC] Content script iniciado.");

  // --- Estado ---
  let isEnabled   = false;
  let ttsVoice    = "pt-BR-FranciscaNeural";
  let ttsRate     = 1.1;
  let ttsVolume   = 1.0;
  // sourceLang: "auto" = detecta heuristica, "en"/"es"/etc = pula deteccao, "pt" = sem traducao
  let sourceLang  = "auto";

  const speakQueue  = [];
  let   isSpeaking  = false;
  const spokenCache = new Set();

  // =========================================================================
  // EX-4: Wrapper de escrita no storage com tratamento de cota
  // =========================================================================
  function safeSet(data) {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message ?? "";
        if (msg.includes("QUOTA_BYTES") || msg.toLowerCase().includes("quota")) {
          console.warn("[Fernando CC] Storage: cota estourada. Chaves descartadas:", Object.keys(data).join(", "));
        } else {
          console.error("[Fernando CC] Storage: erro inesperado ao salvar —", msg);
        }
      }
    });
  }

  // Debounce para escrita de legenda no storage (80ms)
  let storageWriteTimer = null;
  function scheduleStorageWrite(original, translated) {
    clearTimeout(storageWriteTimer);
    storageWriteTimer = setTimeout(() => {
      safeSet({ lastOriginal: original, lastTranslated: translated });
    }, 80);
  }

  // --- Carrega config ---
  chrome.storage.local.get(
    ["readerActive", "ttsVoice", "ttsRate", "ttsVolume", "sourceLang"],
    (r) => {
      if (chrome.runtime.lastError) {
        console.error("[Fernando CC] Falha ao ler storage:", chrome.runtime.lastError.message);
        return;
      }
      if (r.readerActive !== undefined) isEnabled  = r.readerActive;
      if (r.ttsVoice     !== undefined) ttsVoice   = r.ttsVoice;
      if (r.ttsRate      !== undefined) ttsRate    = r.ttsRate;
      if (r.ttsVolume    !== undefined) ttsVolume  = r.ttsVolume;
      if (r.sourceLang   !== undefined) sourceLang = r.sourceLang;
      if (isEnabled) attachAll();
      console.log(`[Fernando CC] Config — enabled:${isEnabled} voz:${ttsVoice} rate:${ttsRate} lang:${sourceLang}`);
    }
  );

  // POP-4: reage a mudancas do storage (popup escreveu, content.js le)
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.readerActive) {
      isEnabled = changes.readerActive.newValue;
      isEnabled ? attachAll() : stopAll();
    }
    if (changes.ttsVoice)   ttsVoice   = changes.ttsVoice.newValue;
    if (changes.ttsRate)    ttsRate    = changes.ttsRate.newValue;
    if (changes.ttsVolume)  ttsVolume  = changes.ttsVolume.newValue;
    if (changes.sourceLang) sourceLang = changes.sourceLang.newValue;
  });

  // =========================================================================
  // SECAO 1 — FILTRO DE TEXTO DE UI
  // =========================================================================
  const BLOCKED_TAGS = new Set([
    "BUTTON", "A", "NAV", "HEADER", "FOOTER", "SELECT", "OPTION",
    "LABEL", "INPUT", "TEXTAREA", "SUMMARY", "DETAILS",
  ]);

  const UI_PATTERNS = /^(play|pause|stop|mute|unmute|cc|subtitles|settings|fullscreen|volume|next|previous|skip|replay|resume|loading|buffering|\d+:\d+|\d+%|close|cancel|ok|yes|no|submit|save|delete|edit|add|remove|menu|home|back|forward|search|help|info|share|download|upload|log.?in|log.?out|sign.?in|sign.?out)$/i;

  function isUIElement(el) {
    if (!el) return true;
    let cur = el;
    for (let i = 0; i < 5; i++) {
      if (!cur || cur === document.body) break;
      if (BLOCKED_TAGS.has(cur.tagName))               return true;
      if (cur.getAttribute("role") === "button")       return true;
      if (cur.getAttribute("role") === "menuitem")     return true;
      if (cur.getAttribute("role") === "navigation")   return true;
      if (cur.getAttribute("aria-hidden") === "true")  return true;
      cur = cur.parentElement;
    }
    return false;
  }

  function isUIText(text) {
    const t = text.trim();
    if (t.length < 2 || t.length > 500) return true;
    if (UI_PATTERNS.test(t)) return true;
    return false;
  }

  // =========================================================================
  // SECAO 2 — DETECCAO DE IDIOMA (usada apenas quando sourceLang === "auto")
  // =========================================================================
  const PT_MARKERS = /\b(que|de|para|com|uma|um|em|ao|na|no|as|os|se|por|mais|mas|isto|isso|este|esta|como|quando|onde|porque|voce|ele|ela|eles|elas|nos|meu|minha|seu|sua|esse|aqui|ali|la|ja|tambem|ainda|muito|pouco|sempre|nunca|agora|depois|antes|durante|entre|sobre|cada|todo|toda|todos|todas|qualquer)\b/i;
  const EN_MARKERS = /\b(the|is|are|was|were|will|would|could|should|have|has|had|this|that|these|those|with|from|into|onto|upon|about|above|below|between|through|during|before|after|where|when|which|while|because|although|however|therefore|furthermore|nevertheless|meanwhile|otherwise|instead|unless|until|whether|both|either|neither|each|every|another|other|such|same|different|often|always|never|already|just|still|even|only|also|too|very|quite|rather|really|actually|basically|generally|usually|typically|specifically|particularly|especially|certainly|definitely|probably|possibly|perhaps|maybe)\b/i;

  function detectLang(text) {
    if (PT_MARKERS.test(text)) return "pt";
    if (EN_MARKERS.test(text)) return "en";
    if (/[\u00C0-\u00FF]/.test(text)) return "pt";
    return "en";
  }

  // =========================================================================
  // SECAO 3 — RESOLUCAO DE IDIOMA
  // Centraliza a logica: sourceLang fixo ou auto-deteccao.
  // Retorna o codigo do idioma fonte ("pt", "en", "es", etc.)
  // =========================================================================
  function resolveLang(text) {
    if (sourceLang === "auto") return detectLang(text);
    return sourceLang; // idioma fixo: pula regex, ganha velocidade
  }

  // =========================================================================
  // SECAO 4 — TRADUCAO (Google Translate API publica, sem chave)
  // sl = idioma fonte resolvido | tl = pt-BR sempre
  // =========================================================================
  const translateCache = new Map();

  async function translateToPT(text, fromLang) {
    const cacheKey = `${fromLang}:${text}`;
    if (translateCache.has(cacheKey)) return translateCache.get(cacheKey);
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=pt-BR&dt=t&q=${encodeURIComponent(text)}`;
      const res  = await fetch(url, { signal: AbortSignal.timeout(3000) });
      const json = await res.json();
      const translated = json[0].map(seg => seg[0]).join("");
      translateCache.set(cacheKey, translated);
      return translated;
    } catch (err) {
      console.warn("[Fernando CC] Falha na traducao, usando texto original.", err.message);
      return text;
    }
  }

  // =========================================================================
  // SECAO 5 — FILA TTS + EX-2: handleTTSError com codigos oficiais
  // =========================================================================
  const TTS_ERROR_MESSAGES = {
    "network":               "Erro de rede ao sintetizar voz.",
    "not-allowed":           "Autoplay bloqueado — usuario nao interagiu com a pagina.",
    "voice-unavailable":     "Voz selecionada nao disponivel neste dispositivo.",
    "language-unavailable":  "Idioma da voz nao disponivel.",
    "invalid-argument":      "Argumento invalido passado ao TTS.",
    "interrupted":           "Narrador interrompido (outra aba ou acao do usuario).",
    "audio-busy":            "Audio ocupado por outro processo.",
    "synthesis-failed":      "Falha interna na sintese de voz.",
    "synthesis-unavailable": "Motor de sintese de voz nao disponivel.",
  };

  function handleTTSError(errorMessage) {
    const code = (errorMessage ?? "").toLowerCase().trim();
    const desc = TTS_ERROR_MESSAGES[code];
    const isExpected = ["interrupted", "not-allowed", "voice-unavailable"].includes(code);
    if (desc) {
      isExpected
        ? console.warn(`[Fernando CC] TTS — ${desc}`)
        : console.error(`[Fernando CC] TTS — ${desc} (code: ${code})`);
    } else {
      console.error(`[Fernando CC] TTS — erro desconhecido: "${errorMessage}"`);
    }
  }

  function enqueue(text) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return;
    if (spokenCache.has(clean)) return;
    spokenCache.add(clean);
    setTimeout(() => spokenCache.delete(clean), 10000);
    speakQueue.push(clean);
    drainQueue();
  }

  function drainQueue() {
    if (isSpeaking || speakQueue.length === 0 || !isEnabled) return;
    isSpeaking = true;
    const text = speakQueue.shift();
    chrome.tts.speak(text, {
      lang:    ttsVoice,
      rate:    ttsRate,
      volume:  ttsVolume,
      onEvent: (event) => {
        if (event.type === "end" || event.type === "error" || event.type === "cancelled") {
          isSpeaking = false;
          if (event.type === "error") handleTTSError(event.errorMessage);
          drainQueue();
        }
      }
    });
  }

  // =========================================================================
  // SECAO 6 — PIPELINE PRINCIPAL
  // =========================================================================
  async function pipeline(text, sourceEl) {
    if (!isEnabled) return;
    if (!text || text.trim().length < 2) return;
    if (sourceEl && isUIElement(sourceEl)) return;
    if (isUIText(text)) return;

    const original = text.trim();
    const lang     = resolveLang(original); // usa sourceLang fixo ou auto-detecta

    let final = original;

    if (lang !== "pt") {
      // Qualquer idioma nao-PT: traduz passando o lang resolvido como sl
      final = await translateToPT(original, lang === "auto" ? "auto" : lang);
      scheduleStorageWrite(original, final);
    } else {
      // Ja e PT-BR: narra direto, popup mostra so uma linha
      scheduleStorageWrite(original, original);
    }

    enqueue(final);
  }

  // =========================================================================
  // SECAO 7 — FONTE 1: TextTrack API (VTT nativo)
  // =========================================================================
  const observedTracks = new WeakSet();
  const observedVideos = new WeakSet();

  function attachTrack(track) {
    if (!track || observedTracks.has(track)) return;
    observedTracks.add(track);
    track.mode = "hidden";
    track.addEventListener("cuechange", () => {
      const cues = track.activeCues;
      if (!cues || cues.length === 0) return;
      for (const cue of cues) {
        if (!cue?.text) continue;
        const text = cue.text
          .replace(/<[^>]+>/g, " ")
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&nbsp;/g, " ");
        pipeline(text, null);
      }
    });
    console.log(`[Fernando CC] TextTrack: lang=${track.language ?? "?"} label="${track.label ?? ""}"`);
  }

  function attachVideo(video) {
    if (!video || observedVideos.has(video)) return;
    observedVideos.add(video);
    for (const track of video.textTracks) attachTrack(track);
    video.textTracks.addEventListener("addtrack", (e) => attachTrack(e?.track));
  }

  // =========================================================================
  // SECAO 8 — FONTE 2: MutationObserver (EX-3: guards + optional chaining)
  // =========================================================================
  const CC_SELECTORS = [
    ".vjs-text-track-display", ".vjs-text-track-cue",
    "[class*='caption']", "[class*='subtitle']", "[class*='transcript']",
    "[class*='cc-']", "[class*='-cc']",
    ".st-subtitle", ".st-caption", "[data-cue]",
    ".player-caption", ".oj-video-caption",
  ];

  let domObserver = null;
  let lastDomText = "";

  function matchesCC(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    try {
      return CC_SELECTORS.some(sel => node.matches?.(sel) || node.closest?.(sel));
    } catch { return false; }
  }

  function startDOMObserver() {
    if (domObserver) return;
    domObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!node || node.nodeType !== Node.ELEMENT_NODE) continue;
          if (isUIElement(node)) continue;
          const text = node.textContent?.trim();
          if (!text || text === lastDomText) continue;
          if (matchesCC(node)) { lastDomText = text; pipeline(text, node); }
        }
        if (mutation.type === "characterData") {
          const el = mutation.target?.parentElement;
          if (!el || isUIElement(el)) continue;
          if (matchesCC(el)) {
            const text = mutation.target?.textContent?.trim();
            if (text && text !== lastDomText) { lastDomText = text; pipeline(text, el); }
          }
        }
      }
    });
    domObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    console.log("[Fernando CC] MutationObserver ativo.");
  }

  function stopDOMObserver() {
    if (domObserver) { domObserver.disconnect(); domObserver = null; }
  }

  // =========================================================================
  // SECAO 9 — ORQUESTRADOR
  // =========================================================================
  let videoScanObserver = null;

  function attachAll() {
    if (!isEnabled) return;
    document.querySelectorAll("video").forEach(attachVideo);
    if (!videoScanObserver) {
      videoScanObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) continue;
            if (node.tagName === "VIDEO") attachVideo(node);
            node.querySelectorAll?.("video").forEach(attachVideo);
          }
        }
      });
      videoScanObserver.observe(document.body, { childList: true, subtree: true });
    }
    startDOMObserver();
  }

  function stopAll() {
    stopDOMObserver();
    if (videoScanObserver) { videoScanObserver.disconnect(); videoScanObserver = null; }
    speakQueue.length = 0;
    isSpeaking = false;
    chrome.tts.stop();
    console.log("[Fernando CC] Monitoramento parado.");
  }

  chrome.storage.local.get(["readerActive"], (r) => {
    if (chrome.runtime.lastError) return;
    if (r.readerActive) { isEnabled = true; attachAll(); }
  });

})();
