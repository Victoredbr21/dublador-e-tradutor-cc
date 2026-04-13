// content.js — Oracle CC Narrator
//
// v1.9.1 — fix loop safetyTimer + dedup por startTime + MAX_QUEUE=1
//
// Fluxo:
//   1. bootObservers() sobe no load — independente de readerActive
//   2. TextTrack API (Brightcove/VJS) + MutationObserver como fallback
//   3. pipeline() traduz e envia { type: "SPEAK" } para o service worker
//   4. Service worker executa chrome.tts e devolve TTS_DONE para drenar a fila
//
// Dedup de cues: spokenCueIds identifica cues por "trackId:startTime".
// O player Oracle re-dispara cuechange pro mesmo cue N vezes (ABR, re-render).
// Barrar pelo startTime e mais confiavel que cache de texto com TTL.

(function () {
  if (window.__oracleCCLoaded) return;
  window.__oracleCCLoaded = true;

  // =========================================================================
  // ESTADO
  // =========================================================================
  let isEnabled  = false;
  let ttsVoice   = "pt-BR";
  let ttsVolume  = 1.0;
  let sourceLang = "auto";

  const speakQueue    = [];
  let   isSpeaking    = false;
  const spokenCueIds  = new Set(); // dedup por trackId:startTime (v1.9.1)
  const spokenCache   = new Set(); // dedup por texto traduzido
  const rawSeenCache  = new Set(); // dedup pre-buffer

  let hasActiveTextTrack = false;

  // =========================================================================
  // BUFFER DE CHUNKS (v1.8.0)
  // =========================================================================
  const CHUNK_BUFFER_MS = 350;
  let chunkBuffer = [];
  let chunkTimer  = null;

  function flushChunkBuffer() {
    if (!chunkBuffer.length) return;
    const joined = chunkBuffer.join(" ").replace(/\s+/g, " ").trim();
    chunkBuffer  = [];
    pipelineFinal(joined);
  }

  function bufferChunk(text) {
    chunkBuffer.push(text);
    clearTimeout(chunkTimer);
    chunkTimer = setTimeout(flushChunkBuffer, CHUNK_BUFFER_MS);
  }

  // =========================================================================
  // safeSet
  // =========================================================================
  function safeSet(data) {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {} // silencioso em producao
    });
  }

  let storageWriteTimer = null;
  function scheduleStorageWrite(original, translated) {
    clearTimeout(storageWriteTimer);
    storageWriteTimer = setTimeout(() => safeSet({ lastOriginal: original, lastTranslated: translated }), 80);
  }

  // =========================================================================
  // CARREGA CONFIG
  // =========================================================================
  chrome.storage.local.get(
    ["readerActive", "ttsVoice", "ttsVolume", "sourceLang"],
    (r) => {
      if (!chrome.runtime.lastError) {
        if (r.readerActive !== undefined) isEnabled  = r.readerActive;
        if (r.ttsVoice     !== undefined) ttsVoice   = r.ttsVoice;
        if (r.ttsVolume    !== undefined) ttsVolume  = r.ttsVolume;
        if (r.sourceLang   !== undefined) sourceLang = r.sourceLang;
      }
      bootObservers();
    }
  );

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.readerActive) {
      isEnabled = changes.readerActive.newValue;
      if (!isEnabled) {
        speakQueue.length = 0;
        isSpeaking = false;
        hasActiveTextTrack = false;
        chunkBuffer = [];
        clearTimeout(chunkTimer);
        chrome.runtime.sendMessage({ type: "STOP" }).catch(() => {});
        safeSet({ readerStatus: "off" });
      } else {
        speakQueue.length = 0;
        isSpeaking = false;
        hasActiveTextTrack = false;
        chunkBuffer = [];
        clearTimeout(chunkTimer);
        spokenCueIds.clear();
        spokenCache.clear();
        rawSeenCache.clear();
        document.querySelectorAll("video").forEach(video => {
          for (const track of video.textTracks) attachTrack(track, video);
        });
        safeSet({ readerStatus: "waiting" });
      }
    }
    if (changes.ttsVoice)   ttsVoice   = changes.ttsVoice.newValue;
    if (changes.ttsVolume)  ttsVolume  = changes.ttsVolume.newValue;
    if (changes.sourceLang) sourceLang = changes.sourceLang.newValue;
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "TTS_DONE") {
      isSpeaking = false;
      if (speakQueue.length === 0) safeSet({ readerStatus: "waiting" });
      drainQueue();
    }
  });

  // =========================================================================
  // FILTRO DE UI
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
  // DETECCAO DE IDIOMA
  // =========================================================================
  const PT_MARKERS = /\b(que|de|para|com|uma|um|em|ao|na|no|as|os|se|por|mais|mas|isto|isso|este|esta|como|quando|onde|porque|voce|ele|ela|eles|elas|nos|meu|minha|seu|sua|esse|aqui|ali|la|ja|tambem|ainda|muito|pouco|sempre|nunca|agora|depois|antes|durante|entre|sobre|cada|todo|toda|todos|todas|qualquer)\b/i;
  const EN_MARKERS = /\b(the|is|are|was|were|will|would|could|should|have|has|had|this|that|these|those|with|from|into|onto|upon|about|above|below|between|through|during|before|after|where|when|which|while|because|although|however|therefore|furthermore|nevertheless|meanwhile|otherwise|instead|unless|until|whether|both|either|neither|each|every|another|other|such|same|different|often|always|never|already|just|still|even|only|also|too|very|quite|rather|really|actually|basically|generally|usually|typically|specifically|particularly|especially|certainly|definitely|probably|possibly|perhaps|maybe)\b/i;

  function detectLang(text) {
    if (PT_MARKERS.test(text)) return "pt";
    if (EN_MARKERS.test(text)) return "en";
    if (/[\u00C0-\u00FF]/.test(text)) return "pt";
    return "en";
  }

  function resolveLang(text) {
    if (sourceLang === "auto") return detectLang(text);
    return sourceLang;
  }

  // =========================================================================
  // TRADUCAO
  // =========================================================================
  const translateCache = new Map();

  async function translateToPT(text, fromLang) {
    const key = `${fromLang}:${text}`;
    if (translateCache.has(key)) return translateCache.get(key);
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=pt-BR&dt=t&q=${encodeURIComponent(text)}`;
      const res  = await fetch(url, { signal: AbortSignal.timeout(3000) });
      const json = await res.json();
      const out  = json[0].map(s => s[0]).join("");
      translateCache.set(key, out);
      return out;
    } catch {
      return text;
    }
  }

  // =========================================================================
  // FILA TTS
  // MAX_QUEUE_SIZE = 1 — narrador sempre no presente, sem acumulo de frases
  // =========================================================================
  const MAX_QUEUE_SIZE = 1;

  function enqueue(text) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean || spokenCache.has(clean)) return;
    spokenCache.add(clean);
    setTimeout(() => spokenCache.delete(clean), 30000);

    while (speakQueue.length >= MAX_QUEUE_SIZE) speakQueue.shift();

    speakQueue.push(clean);
    drainQueue();
  }

  function drainQueue() {
    if (isSpeaking || speakQueue.length === 0 || !isEnabled) return;
    isSpeaking = true;
    const text = speakQueue.shift();
    safeSet({ readerStatus: "speaking" });

    chrome.runtime.sendMessage({
      type:   "SPEAK",
      text,
      voice:  ttsVoice,
      volume: ttsVolume,
    }).catch(() => {
      isSpeaking = false;
      speakQueue.unshift(text);
      setTimeout(drainQueue, 500);
    });
  }

  // =========================================================================
  // PIPELINE PRINCIPAL
  // =========================================================================
  async function pipelineFinal(raw) {
    if (!isEnabled) return;
    if (!raw || raw.length < 2) return;

    if (rawSeenCache.has(raw)) return;
    rawSeenCache.add(raw);
    setTimeout(() => rawSeenCache.delete(raw), 30000);

    if (isUIText(raw)) return;

    const lang  = resolveLang(raw);
    let   final = raw;

    if (lang !== "pt") {
      final = await translateToPT(raw, lang);
      scheduleStorageWrite(raw, final);
    } else {
      scheduleStorageWrite(raw, raw);
    }

    enqueue(final);
  }

  function pipeline(text, sourceEl) {
    if (!isEnabled) return;
    const raw = text?.trim();
    if (!raw || raw.length < 2) return;
    if (sourceEl && isUIElement(sourceEl)) return;
    bufferChunk(raw);
  }

  // =========================================================================
  // FONTE 1 — TextTrack API
  // Dedup por cueId = "trackIndex:startTime" — imune a re-disparo do player
  // =========================================================================
  const observedTracks = new WeakSet();
  const observedVideos = new WeakSet();

  function attachTrack(track, video, trackIndex) {
    if (!track || observedTracks.has(track)) return;
    observedTracks.add(track);
    track.mode = "hidden";

    track.addEventListener("cuechange", () => {
      if (!isEnabled) return;
      const cues = track.activeCues;
      if (!cues || cues.length === 0) return;

      for (const cue of cues) {
        if (!cue?.text) continue;

        // Dedup por identidade do cue — imune a re-disparo do player Oracle
        const cueId = `${trackIndex ?? 0}:${cue.startTime}`;
        if (spokenCueIds.has(cueId)) continue;
        spokenCueIds.add(cueId);

        if (video) {
          const now = video.currentTime;
          if (now < cue.startTime - 0.3 || now > cue.endTime + 0.3) continue;
        }

        hasActiveTextTrack = true;

        const text = cue.text
          .replace(/<[^>]+>/g, " ")
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<")
          .replace(/&gt;/g,  ">").replace(/&nbsp;/g, " ");
        pipeline(text, null);
      }
    });
  }

  function attachVideo(video) {
    if (!video) return;
    Array.from(video.textTracks).forEach((track, i) => attachTrack(track, video, i));
    if (observedVideos.has(video)) return;
    observedVideos.add(video);
    video.textTracks.addEventListener("addtrack", (e) => {
      const i = Array.from(video.textTracks).indexOf(e?.track);
      attachTrack(e?.track, video, i);
    });
  }

  // =========================================================================
  // FONTE 2 — MutationObserver DOM (fallback)
  // =========================================================================
  const CC_SELECTORS = [
    ".vjs-text-track-cue",
    ".vjs-text-track-display",
    "[class*='caption']", "[class*='subtitle']", "[class*='transcript']",
    "[class*='cc-']", "[class*='-cc']",
    ".st-subtitle", ".st-caption", "[data-cue]",
    ".player-caption", ".oj-video-caption",
  ];

  let domObserver = null;
  let lastDomText = "";

  function matchesCC(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    try { return CC_SELECTORS.some(sel => node.matches?.(sel) || node.closest?.(sel)); }
    catch { return false; }
  }

  function startDOMObserver() {
    if (domObserver) return;
    domObserver = new MutationObserver((mutations) => {
      if (hasActiveTextTrack) return;
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
  }

  // =========================================================================
  // BOOT
  // =========================================================================
  let videoScanObserver = null;

  function bootObservers() {
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
    if (isEnabled) safeSet({ readerStatus: "waiting" });
  }

})();
