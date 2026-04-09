// content.js — Oracle CC Narrator
//
// Fluxo:
//   1. bootObservers() sobe no load — independente de readerActive
//   2. TextTrack API (Brightcove/VJS) + MutationObserver como fallback
//   3. pipeline() traduz e envia { type: "SPEAK" } para o service worker
//      (chrome.tts nao funciona em content scripts no Brave — fix v1.2.0)
//   4. Service worker executa chrome.tts e devolve TTS_DONE para drenar a fila

(function () {
  if (window.__oracleCCLoaded) return;
  window.__oracleCCLoaded = true;

  console.log("[Oracle CC] Content script iniciado (v1.2.0).");

  // =========================================================================
  // ESTADO
  // =========================================================================
  let isEnabled  = false;
  let ttsVoice   = "pt-BR";
  let ttsRate    = 1.1;
  let ttsVolume  = 1.0;
  let sourceLang = "auto";

  const speakQueue  = [];
  let   isSpeaking  = false;
  const spokenCache = new Set();

  // =========================================================================
  // safeSet — wrapper storage com tratamento de cota
  // =========================================================================
  function safeSet(data) {
    chrome.storage.local.set(data, () => {
      if (!chrome.runtime.lastError) return;
      const msg = chrome.runtime.lastError.message ?? "";
      if (msg.includes("QUOTA_BYTES") || msg.toLowerCase().includes("quota")) {
        console.warn("[Oracle CC] Storage: cota estourada.", Object.keys(data).join(", "));
      } else {
        console.error("[Oracle CC] Storage erro:", msg);
      }
    });
  }

  let storageWriteTimer = null;
  function scheduleStorageWrite(original, translated) {
    clearTimeout(storageWriteTimer);
    storageWriteTimer = setTimeout(() => safeSet({ lastOriginal: original, lastTranslated: translated }), 80);
  }

  // =========================================================================
  // CARREGA CONFIG — depois inicia observers
  // =========================================================================
  chrome.storage.local.get(
    ["readerActive", "ttsVoice", "ttsRate", "ttsVolume", "sourceLang"],
    (r) => {
      if (chrome.runtime.lastError) {
        console.error("[Oracle CC] Falha ao ler storage:", chrome.runtime.lastError.message);
      } else {
        if (r.readerActive !== undefined) isEnabled  = r.readerActive;
        if (r.ttsVoice     !== undefined) ttsVoice   = r.ttsVoice;
        if (r.ttsRate      !== undefined) ttsRate    = r.ttsRate;
        if (r.ttsVolume    !== undefined) ttsVolume  = r.ttsVolume;
        if (r.sourceLang   !== undefined) sourceLang = r.sourceLang;
        console.log(`[Oracle CC] Config — enabled:${isEnabled} voz:${ttsVoice} rate:${ttsRate} lang:${sourceLang}`);
      }
      bootObservers();
    }
  );

  // Reage a mudancas do popup
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.readerActive) {
      isEnabled = changes.readerActive.newValue;
      if (!isEnabled) {
        speakQueue.length = 0;
        isSpeaking = false;
        chrome.runtime.sendMessage({ type: "STOP" }).catch(() => {});
        safeSet({ readerStatus: "off" });
        console.log("[Oracle CC] Narrador desligado.");
      } else {
        console.log("[Oracle CC] Narrador ligado — varrendo videos existentes.");
        document.querySelectorAll("video").forEach(attachVideo);
        safeSet({ readerStatus: "waiting" });
      }
    }
    if (changes.ttsVoice)   ttsVoice   = changes.ttsVoice.newValue;
    if (changes.ttsRate)    ttsRate    = changes.ttsRate.newValue;
    if (changes.ttsVolume)  ttsVolume  = changes.ttsVolume.newValue;
    if (changes.sourceLang) sourceLang = changes.sourceLang.newValue;
  });

  // Recebe TTS_DONE do service worker para drenar a fila
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
    } catch (err) {
      console.warn("[Oracle CC] Traducao falhou, usando original.", err.message);
      return text;
    }
  }

  // =========================================================================
  // FILA TTS — envia para service worker via sendMessage
  // =========================================================================
  function enqueue(text) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean || spokenCache.has(clean)) return;
    spokenCache.add(clean);
    setTimeout(() => spokenCache.delete(clean), 10000);
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
      rate:   ttsRate,
      volume: ttsVolume,
    }).catch((err) => {
      // Service worker pode estar dormindo — tenta acordar e re-enqueue
      console.warn("[Oracle CC] sendMessage falhou, re-enfileirando:", err.message);
      isSpeaking = false;
      speakQueue.unshift(text);
      setTimeout(drainQueue, 500);
    });
  }

  // =========================================================================
  // PIPELINE PRINCIPAL
  // =========================================================================
  async function pipeline(text, sourceEl) {
    if (!isEnabled) return;
    if (!text || text.trim().length < 2) return;
    if (sourceEl && isUIElement(sourceEl)) return;
    if (isUIText(text)) return;

    const original = text.trim();
    const lang     = resolveLang(original);
    let   final    = original;

    if (lang !== "pt") {
      final = await translateToPT(original, lang);
      scheduleStorageWrite(original, final);
    } else {
      scheduleStorageWrite(original, original);
    }

    enqueue(final);
  }

  // =========================================================================
  // FONTE 1 — TextTrack API (Brightcove/VJS)
  // =========================================================================
  const observedTracks = new WeakSet();
  const observedVideos = new WeakSet();

  function attachTrack(track) {
    if (!track || observedTracks.has(track)) return;
    observedTracks.add(track);
    track.mode = "hidden";
    track.addEventListener("cuechange", () => {
      if (!isEnabled) return;
      const cues = track.activeCues;
      if (!cues || cues.length === 0) return;
      for (const cue of cues) {
        if (!cue?.text) continue;
        const text = cue.text
          .replace(/<[^>]+>/g, " ")
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<")
          .replace(/&gt;/g,  ">").replace(/&nbsp;/g, " ");
        pipeline(text, null);
      }
    });
    console.log(`[Oracle CC] TextTrack: lang="${track.language ?? "?"}" label="${track.label ?? ""}"`);
  }

  function attachVideo(video) {
    if (!video || observedVideos.has(video)) return;
    observedVideos.add(video);
    for (const track of video.textTracks) attachTrack(track);
    video.textTracks.addEventListener("addtrack", (e) => {
      console.log(`[Oracle CC] addtrack: "${e?.track?.label ?? "?"}"`);
      attachTrack(e?.track);
    });
    console.log(`[Oracle CC] Video anexado.`);
  }

  // =========================================================================
  // FONTE 2 — MutationObserver DOM (.vjs-text-track-cue fallback)
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
    console.log("[Oracle CC] MutationObserver DOM ativo.");
  }

  // =========================================================================
  // BOOT — observers sobem SEMPRE no load
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
      console.log("[Oracle CC] videoScanObserver ativo.");
    }

    startDOMObserver();

    if (isEnabled) safeSet({ readerStatus: "waiting" });
  }

})();
