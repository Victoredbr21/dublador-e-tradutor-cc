// content.js — Fernando CC Reader
//
// Fluxo principal:
//   1. Detecta legendas via TextTrack API (VTT nativo) ou MutationObserver no DOM
//   2. Filtra texto de UI (botoes, menus, labels)
//   3. Detecta idioma do cue: se PT-BR, fala direto. Se EN, traduz antes.
//   4. Fila FIFO com chrome.tts
//   5. Grava lastOriginal/lastTranslated no storage.local para o popup
//
// EX-1: sendMessage protegido contra "Receiving end does not exist"
// EX-2: utterance.onerror com switch/case nos codigos oficiais da Web Speech API
// EX-3: Guards e optional chaining no MutationObserver
// EX-4: safeSet() com catch de cota no storage

(function () {
  if (window.__fernandoCCLoaded) return;
  window.__fernandoCCLoaded = true;

  console.log("[Fernando CC] Content script iniciado.");

  // --- Estado ---
  let isEnabled   = false;
  let ttsVoice    = "pt-BR";
  let ttsRate     = 1.1;
  let ttsVolume   = 1.0;
  let translateEN = true;

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
        if (msg.includes("QUOTA_BYTES") || msg.includes("quota")) {
          console.warn("[Fernando CC] Storage: cota estourada. Dado descartado:", Object.keys(data).join(", "));
        } else {
          console.error("[Fernando CC] Storage: erro inesperado ao salvar —", msg);
        }
      }
    });
  }

  // Debounce para escrita de legenda no storage
  let storageWriteTimer = null;
  function scheduleStorageWrite(original, translated) {
    clearTimeout(storageWriteTimer);
    storageWriteTimer = setTimeout(() => {
      safeSet({ lastOriginal: original, lastTranslated: translated }); // EX-4
    }, 80);
  }

  // --- Carrega config ---
  chrome.storage.local.get(
    ["enabled", "ttsVoice", "ttsRate", "ttsVolume", "translateEN"],
    (r) => {
      // EX-4: verifica erro de leitura
      if (chrome.runtime.lastError) {
        console.error("[Fernando CC] Falha ao ler storage:", chrome.runtime.lastError.message);
        return;
      }
      if (r.enabled     !== undefined) isEnabled   = r.enabled;
      if (r.ttsVoice    !== undefined) ttsVoice    = r.ttsVoice;
      if (r.ttsRate     !== undefined) ttsRate     = r.ttsRate;
      if (r.ttsVolume   !== undefined) ttsVolume   = r.ttsVolume;
      if (r.translateEN !== undefined) translateEN = r.translateEN;
      if (isEnabled) attachAll();
      console.log(`[Fernando CC] Config carregada — enabled:${isEnabled} voz:${ttsVoice} rate:${ttsRate}`);
    }
  );

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled)     { isEnabled   = changes.enabled.newValue;    isEnabled ? attachAll() : stopAll(); }
    if (changes.ttsVoice)    { ttsVoice    = changes.ttsVoice.newValue; }
    if (changes.ttsRate)     { ttsRate     = changes.ttsRate.newValue; }
    if (changes.ttsVolume)   { ttsVolume   = changes.ttsVolume.newValue; }
    if (changes.translateEN) { translateEN = changes.translateEN.newValue; }
  });

  // --- Mensagens do popup ---
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "enable") {
      isEnabled = true;
      safeSet({ enabled: true }); // EX-4
      attachAll();
    }
    if (msg.action === "disable") {
      isEnabled = false;
      safeSet({ enabled: false }); // EX-4
      stopAll();
    }
    if (msg.action === "set-config") {
      if (msg.ttsVoice    !== undefined) ttsVoice    = msg.ttsVoice;
      if (msg.ttsRate     !== undefined) ttsRate     = msg.ttsRate;
      if (msg.ttsVolume   !== undefined) ttsVolume   = msg.ttsVolume;
      if (msg.translateEN !== undefined) translateEN = msg.translateEN;
    }
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
  // SECAO 2 — DETECCAO DE IDIOMA
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
  // SECAO 3 — TRADUCAO
  // =========================================================================
  const translateCache = new Map();

  async function translateToPT(text) {
    if (translateCache.has(text)) return translateCache.get(text);
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt-BR&dt=t&q=${encodeURIComponent(text)}`;
      const res  = await fetch(url, { signal: AbortSignal.timeout(3000) });
      const json = await res.json();
      const translated = json[0].map(seg => seg[0]).join("");
      translateCache.set(text, translated);
      return translated;
    } catch (err) {
      console.warn("[Fernando CC] Falha na traducao, usando texto original.", err.message);
      return text;
    }
  }

  // =========================================================================
  // SECAO 4 — FILA TTS (chrome.tts)
  //
  // EX-2: chrome.tts usa callbacks de evento, nao try/catch.
  //   onEvent.type === "error" carrega event.errorMessage com o codigo oficial.
  //   Mapeamos os codigos documentados para mensagens descritivas.
  //   Referencia: https://developer.chrome.com/docs/extensions/reference/api/tts#type-TtsEvent
  // =========================================================================

  // Codigos de erro oficiais do chrome.tts (espelho dos codigos Web Speech API)
  const TTS_ERROR_MESSAGES = {
    "network":             "Erro de rede ao sintetizar voz.",
    "not-allowed":         "Erro: usuario nao interagiu com a pagina — autoplay bloqueado.",
    "voice-unavailable":   "Erro: voz selecionada nao esta disponivel neste dispositivo.",
    "language-unavailable":"Erro: idioma da voz nao esta disponivel.",
    "invalid-argument":    "Erro: argumento invalido passado ao TTS.",
    "interrupted":         "Narrador interrompido por outra aba ou acao do usuario.",
    "audio-busy":          "Audio ocupado por outro processo.",
    "synthesis-failed":    "Falha interna na sintese de voz.",
    "synthesis-unavailable": "Motor de sintese de voz nao disponivel.",
  };

  function handleTTSError(errorMessage) {
    const code = (errorMessage ?? "").toLowerCase().trim();
    const desc = TTS_ERROR_MESSAGES[code];
    if (desc) {
      // Erros esperados: log como warn, nao como error
      const isExpected = ["interrupted", "not-allowed", "voice-unavailable"].includes(code);
      if (isExpected) {
        console.warn(`[Fernando CC] TTS — ${desc}`);
      } else {
        console.error(`[Fernando CC] TTS — ${desc} (codigo: ${code})`);
      }
    } else {
      // Codigo desconhecido: loga o original para debug
      console.error(`[Fernando CC] TTS — erro desconhecido: "${errorMessage}"`);
    }
  }

  function enqueue(text) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return;
    if (spokenCache.has(clean)) {
      console.log(`[Fernando CC] \u23ed Ignorado (repetido): "${clean.slice(0, 40)}"`);
      return;
    }
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
      lang:   ttsVoice,
      rate:   ttsRate,
      volume: ttsVolume,
      onEvent: (event) => {
        if (event.type === "end" || event.type === "error" || event.type === "cancelled") {
          isSpeaking = false;
          if (event.type === "error") {
            handleTTSError(event.errorMessage); // EX-2
          }
          drainQueue();
        }
      }
    });
  }

  // =========================================================================
  // SECAO 5 — PIPELINE PRINCIPAL
  // =========================================================================
  async function pipeline(text, sourceEl) {
    if (!isEnabled) return;
    if (!text || text.trim().length < 2) return;
    if (sourceEl && isUIElement(sourceEl)) return;
    if (isUIText(text)) return;

    const original = text.trim();
    const lang     = detectLang(original);
    let   final    = original;

    if (lang === "en" && translateEN) {
      final = await translateToPT(original);
      scheduleStorageWrite(original, final);
    } else {
      scheduleStorageWrite(original, original);
    }

    enqueue(final);
  }

  // =========================================================================
  // SECAO 6 — FONTE 1: TextTrack API
  // =========================================================================
  const observedTracks = new WeakSet();
  const observedVideos = new WeakSet();

  function attachTrack(track) {
    if (!track || observedTracks.has(track)) return; // EX-3: guard
    observedTracks.add(track);
    track.mode = "hidden";
    track.addEventListener("cuechange", () => {
      const cues = track.activeCues;
      if (!cues || cues.length === 0) return;
      for (const cue of cues) {
        if (!cue?.text) continue; // EX-3: guard
        const text = cue.text
          .replace(/<[^>]+>/g, " ")
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&nbsp;/g, " ");
        pipeline(text, null);
      }
    });
    console.log(`[Fernando CC] \ud83c\udf9e TextTrack: lang=${track.language ?? "?"} label="${track.label ?? ""}"`);
  }

  function attachVideo(video) {
    if (!video || observedVideos.has(video)) return; // EX-3: guard
    observedVideos.add(video);
    for (const track of video.textTracks) attachTrack(track);
    video.textTracks.addEventListener("addtrack", (e) => attachTrack(e?.track));
  }

  // =========================================================================
  // SECAO 7 — FONTE 2: MutationObserver no DOM
  //
  // EX-3: Todos os acessos ao DOM usam optional chaining (?.) e guards
  //   explicitamente antes de ler .textContent ou .matches.
  //   Isso previne TypeError em elementos removidos mid-mutation.
  // =========================================================================
  const CC_SELECTORS = [
    ".vjs-text-track-display",
    ".vjs-text-track-cue",
    "[class*='caption']",
    "[class*='subtitle']",
    "[class*='transcript']",
    "[class*='cc-']",
    "[class*='-cc']",
    ".st-subtitle",
    ".st-caption",
    "[data-cue]",
    ".player-caption",
    ".oj-video-caption",
  ];

  let domObserver = null;
  let lastDomText = "";

  // EX-3: helper que testa seletores de forma segura num no que pode ser nulo
  function matchesCC(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    try {
      return CC_SELECTORS.some(sel => node.matches?.(sel) || node.closest?.(sel));
    } catch {
      return false; // seletor invalido nunca deve quebrar o observer
    }
  }

  function startDOMObserver() {
    if (domObserver) return;
    domObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {

        // --- Nos adicionados ---
        for (const node of mutation.addedNodes) {
          // EX-3: guard — node pode ser Text, Comment, etc.
          if (!node || node.nodeType !== Node.ELEMENT_NODE) continue;
          if (isUIElement(node)) continue;

          const text = node.textContent?.trim(); // EX-3: optional chaining
          if (!text || text === lastDomText) continue;

          if (matchesCC(node)) { // EX-3: safe matcher
            lastDomText = text;
            pipeline(text, node);
          }
        }

        // --- Mudancas de characterData ---
        if (mutation.type === "characterData") {
          const el = mutation.target?.parentElement; // EX-3: optional chaining
          if (!el || isUIElement(el)) continue;

          if (matchesCC(el)) { // EX-3: safe matcher
            const text = mutation.target?.textContent?.trim(); // EX-3
            if (text && text !== lastDomText) {
              lastDomText = text;
              pipeline(text, el);
            }
          }
        }
      }
    });

    domObserver.observe(document.body, {
      childList:     true,
      subtree:       true,
      characterData: true,
    });
    console.log("[Fernando CC] \ud83d\udc41 MutationObserver ativo.");
  }

  function stopDOMObserver() {
    if (domObserver) { domObserver.disconnect(); domObserver = null; }
  }

  // =========================================================================
  // SECAO 8 — ORQUESTRADOR
  // =========================================================================
  let videoScanObserver = null;

  function attachAll() {
    if (!isEnabled) return;
    document.querySelectorAll("video").forEach(attachVideo);
    if (!videoScanObserver) {
      videoScanObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) continue; // EX-3: guard
            if (node.tagName === "VIDEO") attachVideo(node);
            node.querySelectorAll?.("video").forEach(attachVideo); // EX-3
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
    console.log("[Fernando CC] \u23f9 Monitoramento parado.");
  }

  chrome.storage.local.get(["enabled"], (r) => {
    if (chrome.runtime.lastError) return; // EX-4
    if (r.enabled) { isEnabled = true; attachAll(); }
  });

})();
