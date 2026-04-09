// content.js — Oracle CC Narrator
//
// v2.1.0 — fixes: isSpeaking guard, scheduleStorageWrite order,
//          STOP antes de trocar voz, popup usa chrome.tts voices
//
// Arquitetura:
//   - Loop requestAnimationFrame le video.currentTime a cada frame
//   - Para cada TextTrack ativa, busca o VTTCue cujo startTime <= currentTime < endTime
//   - So fala se o cue mudou (key = startTime:text) — nunca adianta, nunca atrasa
//   - Se o video pausa -> TTS para imediatamente
//   - Se o usuario volta no video -> activeCueKey muda e o narrador recomeca do ponto certo
//   - Fonte 2 (MutationObserver DOM) REMOVIDA: causava leitura de UI em ingles
//   - translateCache pre-aquece ao carregar cada track (warm-up silencioso)

(function () {
  if (window.__oracleCCLoaded) return;
  window.__oracleCCLoaded = true;

  console.log("[Oracle CC] Content script iniciado (v2.1.0).");

  // ===========================================================================
  // ESTADO GLOBAL
  // ===========================================================================
  let isEnabled  = false;
  let ttsVoice   = "pt-BR";
  let ttsRate    = 1.1;
  let ttsVolume  = 1.0;
  let sourceLang = "auto";

  // Chave do cue que esta sendo narrado agora: "<startTime>:<rawText>"
  // Separada por video element para suportar multiplos videos na pagina
  const activeCueKey = new Map(); // videoEl -> string

  // FIX #1: isSpeaking agora e uma guard de reentrada para speak()
  // Deve ser setado ANTES do await, nao depois
  let isSpeaking = false;

  // rAF handle
  let rafHandle = null;

  // Videos observados
  const observedVideos = new WeakSet();
  const observedTracks = new WeakSet();

  // Lista de videos ativos (para o loop rAF)
  const activeVideos = new Set();

  // ===========================================================================
  // STORAGE HELPERS
  // ===========================================================================
  function safeSet(data) {
    chrome.storage.local.set(data, () => {
      if (!chrome.runtime.lastError) return;
      const msg = chrome.runtime.lastError.message ?? "";
      if (!msg.includes("QUOTA_BYTES") && !msg.toLowerCase().includes("quota")) {
        console.error("[Oracle CC] Storage erro:", msg);
      }
    });
  }

  let storageWriteTimer = null;
  function scheduleStorageWrite(original, translated) {
    clearTimeout(storageWriteTimer);
    storageWriteTimer = setTimeout(() => safeSet({ lastOriginal: original, lastTranslated: translated }), 80);
  }

  // ===========================================================================
  // CARREGA CONFIG
  // ===========================================================================
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
      if (isEnabled) startLoop();
    }
  );

  // Reage a mudancas do popup em tempo real
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.readerActive) {
      isEnabled = changes.readerActive.newValue;
      if (!isEnabled) {
        stopAll();
      } else {
        console.log("[Oracle CC] Narrador ligado.");
        activeCueKey.clear();
        isSpeaking = false;
        safeSet({ readerStatus: "waiting" });
        startLoop();
      }
    }

    // FIX #3: para o TTS antes de trocar voz, evita voz antiga continuar
    // e novo cue cair no activeCueKey como "ja narrado"
    if (changes.ttsVoice) {
      chrome.runtime.sendMessage({ type: "STOP" }).catch(() => {});
      isSpeaking = false;
      activeCueKey.clear();
      ttsVoice = changes.ttsVoice.newValue;
    }

    if (changes.ttsRate)    ttsRate    = changes.ttsRate.newValue;
    if (changes.ttsVolume)  ttsVolume  = changes.ttsVolume.newValue;
    if (changes.sourceLang) sourceLang = changes.sourceLang.newValue;
  });

  // Recebe TTS_DONE do background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "TTS_DONE") {
      isSpeaking = false;
    }
  });

  // ===========================================================================
  // STOP TOTAL
  // ===========================================================================
  function stopAll() {
    isSpeaking = false;
    activeCueKey.clear();
    stopLoop();
    chrome.runtime.sendMessage({ type: "STOP" }).catch(() => {});
    safeSet({ readerStatus: "off" });
    console.log("[Oracle CC] Narrador desligado.");
  }

  // ===========================================================================
  // LOOP rAF — le currentTime a cada frame e fala o cue ativo
  // ===========================================================================
  function startLoop() {
    if (rafHandle !== null) return; // ja rodando
    function tick() {
      if (!isEnabled) { rafHandle = null; return; }
      rafHandle = requestAnimationFrame(tick);
      for (const video of activeVideos) {
        processVideo(video);
      }
    }
    rafHandle = requestAnimationFrame(tick);
    console.log("[Oracle CC] Loop rAF iniciado.");
  }

  function stopLoop() {
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
  }

  // ===========================================================================
  // PROCESSA UM VIDEO A CADA FRAME
  // ===========================================================================
  function processVideo(video) {
    if (!video || video.paused || video.ended) {
      // Video pausado: para TTS se estava falando deste video
      if (isSpeaking && activeCueKey.has(video)) {
        chrome.runtime.sendMessage({ type: "STOP" }).catch(() => {});
        isSpeaking = false;
        activeCueKey.delete(video);
      }
      return;
    }

    const now = video.currentTime;

    for (const track of video.textTracks) {
      if (track.mode === "disabled") continue;
      if (!track.cues) continue;

      // Busca o cue cujo intervalo cobre o currentTime
      let activeCue = null;
      for (const cue of track.cues) {
        if (cue.startTime <= now && now < cue.endTime) {
          activeCue = cue;
          break;
        }
      }

      if (!activeCue) continue;

      const rawText = activeCue.text
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ").trim();

      if (!rawText || rawText.length < 2) continue;

      // Chave unica para este cue: startTime + texto
      const key = `${activeCue.startTime.toFixed(3)}:${rawText}`;
      if (activeCueKey.get(video) === key) continue; // ja esta narrando este cue

      // FIX #1: so dispara speak() se nao ha outro em andamento
      if (isSpeaking) continue;

      // Novo cue detectado — atualiza chave e fala
      activeCueKey.set(video, key);
      speak(rawText, video, key);
    }
  }

  // ===========================================================================
  // FALA UM CUE (traduz se necessario e envia ao background)
  // ===========================================================================
  async function speak(rawText, video, spokenKey) {
    if (!isEnabled) return;

    // FIX #1: seta isSpeaking ANTES do await para bloquear reentrada
    isSpeaking = true;
    safeSet({ readerStatus: "speaking" });

    const lang = resolveLang(rawText);
    let final  = rawText;

    if (lang !== "pt") {
      final = await translateToPT(rawText, lang);
    }

    // FIX #2: verifica validade ANTES de escrever no storage e falar
    if (!isEnabled) { isSpeaking = false; return; }
    if (video && video.paused) { isSpeaking = false; return; }

    // Se o cue expirou durante o await (seek manual ou video avancou rapido)
    if (activeCueKey.get(video) !== spokenKey) {
      isSpeaking = false;
      return;
    }

    // FIX #2: scheduleStorageWrite so roda apos todas as validacoes
    scheduleStorageWrite(rawText, final);

    chrome.runtime.sendMessage({
      type:   "SPEAK",
      text:   final,
      voice:  ttsVoice,
      rate:   ttsRate,
      volume: ttsVolume,
    }).catch((err) => {
      console.warn("[Oracle CC] sendMessage falhou:", err.message);
      isSpeaking = false;
    });
  }

  // ===========================================================================
  // DETECCAO DE IDIOMA
  // ===========================================================================
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

  // ===========================================================================
  // TRADUCAO com cache
  // ===========================================================================
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

  // Pre-aquece o cache de traducao para todos os cues de uma track
  async function warmUpTrackCache(track) {
    if (!track.cues) return;
    for (const cue of track.cues) {
      const raw = cue.text
        .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!raw || raw.length < 2) continue;
      const lang = resolveLang(raw);
      if (lang !== "pt") {
        translateToPT(raw, lang).catch(() => {});
        await new Promise(r => setTimeout(r, 30));
      }
    }
    console.log(`[Oracle CC] Cache pre-aquecido para track "${track.label ?? track.language ?? "?"}".`);
  }

  // ===========================================================================
  // ATTACH TRACK / VIDEO
  // ===========================================================================
  function attachTrack(track, video) {
    if (!track || observedTracks.has(track)) return;
    observedTracks.add(track);
    if (track.mode === "disabled") track.mode = "hidden";
    console.log(`[Oracle CC] TextTrack: lang="${track.language ?? "?"}" label="${track.label ?? ""}"`);
    if (track.cues && track.cues.length > 0) {
      warmUpTrackCache(track);
    } else {
      track.addEventListener("load", () => warmUpTrackCache(track), { once: true });
    }
  }

  function attachVideo(video) {
    if (!video) return;
    activeVideos.add(video);
    for (const track of video.textTracks) attachTrack(track, video);
    if (observedVideos.has(video)) return;
    observedVideos.add(video);
    video.textTracks.addEventListener("addtrack", (e) => {
      console.log(`[Oracle CC] addtrack: "${e?.track?.label ?? "?"}"`);
      attachTrack(e?.track, video);
    });
    new MutationObserver((_, obs) => {
      if (!document.contains(video)) {
        activeVideos.delete(video);
        activeCueKey.delete(video);
        obs.disconnect();
      }
    }).observe(document.body, { childList: true, subtree: true });
    console.log(`[Oracle CC] Video anexado.`);
  }

  // ===========================================================================
  // BOOT — sobe observers de video
  // ===========================================================================
  function bootObservers() {
    document.querySelectorAll("video").forEach(attachVideo);

    const videoScanObserver = new MutationObserver((mutations) => {
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

    if (isEnabled) safeSet({ readerStatus: "waiting" });
  }

})();
