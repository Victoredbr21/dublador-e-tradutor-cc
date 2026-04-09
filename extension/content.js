// content.js — Fernando CC Reader
//
// Fluxo principal:
//   1. Detecta legendas via TextTrack API (VTT nativo) ou MutationObserver no DOM
//   2. Filtra texto de UI (botoes, menus, labels) para o narrador nao perder foco
//   3. Detecta idioma do cue: se PT-BR, fala direto. Se EN, traduz antes.
//   4. Fila FIFO com chrome.tts — Fernando nao interrompe, nao pula, nao repete.

(function () {
  if (window.__fernandoCCLoaded) return;
  window.__fernandoCCLoaded = true;

  console.log("[Fernando CC] Content script iniciado.");

  // ─── Estado ──────────────────────────────────────────────────────────────
  let isEnabled    = false;
  let ttsVoice     = "pt-BR";
  let ttsRate      = 1.1;
  let ttsVolume    = 1.0;
  let translateEN  = true; // se false, nao traduz (modo so PT-BR)

  const speakQueue  = [];   // fila FIFO de textos ja prontos para falar
  let   isSpeaking  = false;
  const spokenCache = new Set(); // evita repetir o mesmo cue imediatamente

  // ─── Carrega config do storage ───────────────────────────────────────────
  chrome.storage.local.get(
    ["enabled", "ttsVoice", "ttsRate", "ttsVolume", "translateEN"],
    (r) => {
      if (r.enabled    !== undefined) isEnabled   = r.enabled;
      if (r.ttsVoice   !== undefined) ttsVoice    = r.ttsVoice;
      if (r.ttsRate    !== undefined) ttsRate     = r.ttsRate;
      if (r.ttsVolume  !== undefined) ttsVolume   = r.ttsVolume;
      if (r.translateEN !== undefined) translateEN = r.translateEN;
      if (isEnabled) attachAll();
      console.log(`[Fernando CC] Config carregada — enabled:${isEnabled} voz:${ttsVoice} rate:${ttsRate}`);
    }
  );

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled)    { isEnabled   = changes.enabled.newValue;    isEnabled ? attachAll() : stopAll(); }
    if (changes.ttsVoice)   { ttsVoice    = changes.ttsVoice.newValue; }
    if (changes.ttsRate)    { ttsRate     = changes.ttsRate.newValue; }
    if (changes.ttsVolume)  { ttsVolume   = changes.ttsVolume.newValue; }
    if (changes.translateEN){ translateEN = changes.translateEN.newValue; }
  });

  // ─── Mensagens do popup (enable/disable direto) ───────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "enable")  { isEnabled = true;  chrome.storage.local.set({ enabled: true });  attachAll(); }
    if (msg.action === "disable") { isEnabled = false; chrome.storage.local.set({ enabled: false }); stopAll(); }
    if (msg.action === "status")  return; // ignorado aqui
  });

  // =========================================================================
  // SECAO 1 — FILTRO DE TEXTO DE UI
  // Objetivo: ignorar textos que vieram de elementos interativos ou de
  // navegacao, para o narrador nao ler "Play", "Pause", tooltips, etc.
  // Mesma logica que o Narrador do Windows usa internamente.
  // =========================================================================

  // Tags que NUNCA devem ser lidas como legenda de video
  const BLOCKED_TAGS = new Set([
    "BUTTON", "A", "NAV", "HEADER", "FOOTER", "SELECT", "OPTION",
    "LABEL", "INPUT", "TEXTAREA", "SUMMARY", "DETAILS",
  ]);

  // Atributos que indicam elemento de UI interativo
  const BLOCKED_ATTRS = ["aria-label", "title", "placeholder", "data-tooltip"];

  // Palavras-chave tipicas de UI que nao devem ser narradas
  const UI_PATTERNS = /^(play|pause|stop|mute|unmute|cc|subtitles|settings|fullscreen|volume|next|previous|skip|replay|resume|loading|buffering|\d+:\d+|\d+%|close|cancel|ok|yes|no|submit|save|delete|edit|add|remove|menu|home|back|forward|search|help|info|share|download|upload|log.?in|log.?out|sign.?in|sign.?out)$/i;

  function isUIElement(el) {
    if (!el) return true;
    let cur = el;
    // sobe ate 5 niveis na arvore para verificar o contexto do elemento
    for (let i = 0; i < 5; i++) {
      if (!cur || cur === document.body) break;
      if (BLOCKED_TAGS.has(cur.tagName)) return true;
      if (cur.getAttribute("role") === "button") return true;
      if (cur.getAttribute("role") === "menuitem") return true;
      if (cur.getAttribute("role") === "navigation") return true;
      if (cur.getAttribute("aria-hidden") === "true") return true;
      cur = cur.parentElement;
    }
    return false;
  }

  function isUIText(text) {
    const t = text.trim();
    if (t.length < 2 || t.length > 500) return true;  // muito curto ou longo demais
    if (UI_PATTERNS.test(t)) return true;
    return false;
  }

  // =========================================================================
  // SECAO 2 — DETECCAO DE IDIOMA
  // Heuristica leve: conta palavras tipicamente inglesas vs portuguesas.
  // Nao usa biblioteca externa — funciona offline, latencia zero.
  // =========================================================================

  // Stopwords PT-BR muito comuns — se o texto tiver qualquer uma, ja e PT
  const PT_MARKERS = /\b(que|de|para|com|uma|um|em|ao|na|no|as|os|se|por|mais|mas|isto|isso|este|esta|como|quando|onde|porque|voce|ele|ela|eles|elas|nos|meu|minha|seu|sua|este|esse|aqui|ali|la|ja|tambem|ainda|muito|pouco|sempre|nunca|agora|depois|antes|durante|entre|sobre|cada|todo|toda|todos|todas|qualquer)\b/i;

  // Palavras tipicamente inglesas que raramente aparecem em PT
  const EN_MARKERS = /\b(the|is|are|was|were|will|would|could|should|have|has|had|this|that|these|those|with|from|into|onto|upon|about|above|below|between|through|during|before|after|where|when|which|while|because|although|however|therefore|furthermore|nevertheless|meanwhile|otherwise|instead|unless|until|whether|both|either|neither|each|every|another|other|such|same|different|often|always|never|already|just|still|even|only|also|too|very|quite|rather|really|actually|basically|generally|usually|typically|specifically|particularly|especially|certainly|definitely|probably|possibly|perhaps|maybe|probably)\b/i;

  function detectLang(text) {
    if (PT_MARKERS.test(text)) return "pt";
    if (EN_MARKERS.test(text)) return "en";
    // Fallback: se tiver acento, provavelmente PT
    if (/[\u00C0-\u00FF]/.test(text)) return "pt";
    return "en"; // default conservador: traduz se nao souber
  }

  // =========================================================================
  // SECAO 3 — TRADUCAO (Google Translate API publica, sem chave)
  // Apenas acionada quando detectLang() retorna "en" e translateEN === true.
  // Cache em Map para nao traduzir o mesmo texto duas vezes.
  // =========================================================================

  const translateCache = new Map();

  async function translateToPT(text) {
    if (translateCache.has(text)) return translateCache.get(text);

    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt-BR&dt=t&q=${encodeURIComponent(text)}`;
      const res  = await fetch(url, { signal: AbortSignal.timeout(3000) });
      const json = await res.json();
      // A resposta e um array aninhado: [["texto traduzido", "original"], ...]
      const translated = json[0].map(seg => seg[0]).join("");
      translateCache.set(text, translated);
      return translated;
    } catch (err) {
      console.warn("[Fernando CC] Falha na traducao, usando texto original.", err.message);
      return text; // fallback: fala em ingles se traducao falhar
    }
  }

  // =========================================================================
  // SECAO 4 — FILA TTS (chrome.tts)
  // chrome.tts e sincrono por natureza: onEvent "end" dispara o proximo.
  // Usamos chrome.tts.speak com enqueue:false e gerenciamos a fila manualmente
  // para ter controle total sobre cancelamento e estado.
  // =========================================================================

  function enqueue(text) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return;

    // Cache de cues: nao repete o mesmo texto em menos de 10 segundos
    if (spokenCache.has(clean)) {
      console.log(`[Fernando CC] ⏭ Ignorado (repetido): "${clean.slice(0, 40)}"`)
      return;
    }
    spokenCache.add(clean);
    setTimeout(() => spokenCache.delete(clean), 10000);

    speakQueue.push(clean);
    console.log(`[Fernando CC] 📥 Enfileirado: "${clean.slice(0, 60)}" (fila: ${speakQueue.length})`);
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
          if (event.type === "error") console.error("[Fernando CC] Erro TTS:", event.errorMessage);
          drainQueue();
        }
      }
    });
    console.log(`[Fernando CC] 🔊 Falando: "${text.slice(0, 60)}"`);
  }

  function stopAll() {
    speakQueue.length = 0;
    isSpeaking = false;
    chrome.tts.stop();
    console.log("[Fernando CC] ⏹ TTS parado.");
  }

  // =========================================================================
  // SECAO 5 — PIPELINE PRINCIPAL
  // Recebe texto cru, filtra UI, detecta idioma, traduz se necessario, enfileira.
  // =========================================================================

  async function pipeline(text, sourceEl) {
    if (!isEnabled) return;
    if (!text || text.trim().length < 2) return;
    if (sourceEl && isUIElement(sourceEl)) return;
    if (isUIText(text)) return;

    const lang = detectLang(text);
    let final = text.trim();

    if (lang === "en" && translateEN) {
      final = await translateToPT(final);
    }

    enqueue(final);
  }

  // =========================================================================
  // SECAO 6 — FONTE 1: TextTrack API (VTT nativo)
  // O player Storyline/Oracle usa <track> com WebVTT.
  // Observamos o evento "cuechange" em todas as TextTracks do video.
  // Funciona tanto na janela principal quanto dentro de iframes same-origin.
  // =========================================================================

  const observedTracks  = new WeakSet();
  const observedVideos  = new WeakSet();

  function attachTrack(track) {
    if (observedTracks.has(track)) return;
    observedTracks.add(track);
    track.mode = "hidden"; // precisa estar hidden ou showing para disparar cuechange
    track.addEventListener("cuechange", () => {
      const cues = track.activeCues;
      if (!cues || cues.length === 0) return;
      for (const cue of cues) {
        const text = cue.text
          .replace(/<[^>]+>/g, " ") // remove tags HTML dentro do VTT
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&nbsp;/g, " ");
        pipeline(text, null);
      }
    });
    console.log(`[Fernando CC] 🎞 TextTrack anexado: lang=${track.language} label="${track.label}"`);
  }

  function attachVideo(video) {
    if (observedVideos.has(video)) return;
    observedVideos.add(video);

    // Tenta anexar tracks ja existentes
    for (const track of video.textTracks) attachTrack(track);

    // Observa novas tracks adicionadas dinamicamente
    video.textTracks.addEventListener("addtrack", (e) => attachTrack(e.track));
    console.log(`[Fernando CC] 🎬 Video monitorado (${video.textTracks.length} track(s) iniciais).`);
  }

  // =========================================================================
  // SECAO 7 — FONTE 2: MutationObserver no DOM
  // Fallback para players que injetam legendas como <div> ou <span> no DOM
  // em vez de usar a TextTrack API nativa (ex: players customizados Oracle JET).
  // Observa apenas nos containers suspeitos de legenda, nao no body inteiro.
  // =========================================================================

  // Seletores CSS que tipicamente contém legendas na Oracle MyLearn
  // baseado na analise do escopo HTML do repositorio oracle-escopo
  const CC_SELECTORS = [
    ".vjs-text-track-display",          // VideoJS (base de varios players)
    ".vjs-text-track-cue",
    "[class*='caption']",               // Qualquer classe com 'caption'
    "[class*='subtitle']",
    "[class*='transcript']",
    "[class*='cc-']",
    "[class*='-cc']",
    ".st-subtitle",                     // Storyline
    ".st-caption",
    "[data-cue]",
    ".player-caption",
    ".oj-video-caption",                // Oracle JET
  ];

  let domObserver = null;
  let lastDomText = "";

  function startDOMObserver() {
    if (domObserver) return;

    domObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (isUIElement(node)) continue;
          const text = node.textContent?.trim();
          if (!text || text === lastDomText) continue;
          // Verifica se o elemento que mudou corresponde a algum seletor CC
          if (CC_SELECTORS.some(sel => node.matches?.(sel) || node.closest?.(sel))) {
            lastDomText = text;
            pipeline(text, node);
          }
        }
        // Tambem observa mudancas de characterData (texto editado no lugar)
        if (mutation.type === "characterData") {
          const el = mutation.target.parentElement;
          if (!el || isUIElement(el)) continue;
          if (CC_SELECTORS.some(sel => el.matches?.(sel) || el.closest?.(sel))) {
            const text = mutation.target.textContent?.trim();
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
    console.log("[Fernando CC] 👁 MutationObserver ativo.");
  }

  function stopDOMObserver() {
    if (domObserver) { domObserver.disconnect(); domObserver = null; }
  }

  // =========================================================================
  // SECAO 8 — ORQUESTRADOR
  // attachAll: liga tudo. stopAll: desliga tudo.
  // Tambem observa novos <video> adicionados dinamicamente (ex: SPA).
  // =========================================================================

  let videoScanObserver = null;

  function attachAll() {
    if (!isEnabled) return;
    console.log("[Fernando CC] ▶ Iniciando monitoramento.");

    // Escaneia videos ja presentes
    document.querySelectorAll("video").forEach(attachVideo);

    // Observa novos <video> adicionados (Oracle usa SPA)
    if (!videoScanObserver) {
      videoScanObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            if (node.tagName === "VIDEO") attachVideo(node);
            node.querySelectorAll?.("video").forEach(attachVideo);
          }
        }
      });
      videoScanObserver.observe(document.body, { childList: true, subtree: true });
    }

    // Inicia fallback DOM observer
    startDOMObserver();
  }

  function stopAll() {
    stopDOMObserver();
    if (videoScanObserver) { videoScanObserver.disconnect(); videoScanObserver = null; }
    speakQueue.length = 0;
    isSpeaking = false;
    chrome.tts.stop();
    console.log("[Fernando CC] ⏹ Monitoramento parado.");
  }

  // Inicia se ja estava habilitado
  chrome.storage.local.get(["enabled"], (r) => {
    if (r.enabled) { isEnabled = true; attachAll(); }
  });

})();
