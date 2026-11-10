// Gump.io — Instagram Downloader (mundo MAIN)
// O player do Instagram usa <video src="blob:...">, então a URL real da CDN só
// pode ser observada dentro da própria página. Este script roda no mundo MAIN
// (mesmo contexto do site), intercepta fetch/XHR e captura as URLs de mídia que
// o próprio Instagram carrega — incluindo as variantes de alta qualidade que
// vêm embutidas nos JSONs de dados da página.
(() => {
  if (window.__gumpInstaHooked) return;
  window.__gumpInstaHooked = true;

  const MEDIA_RE = /\.(mp4|mov|m4v|webm|jpg|jpeg|png|webp|heic)(\?|$)/i;
  const CDN_HOST_RE = /(^|\.)cdninstagram\.com$|(^|\.)fbcdn\.net$/i;
  const IMAGE_RE = /\.(jpg|jpeg|png|webp|heic)(\?|$)/i;
  const BAD_RE = /\.(m3u8|m4s|mpd)(\?|$)|bytestring|segment/i;
  const found = new Map();
  const MAX = 400;
  let lastVideoUrl = '';
  let lastVideoAt = 0;

  const notify = (payload) => {
    try { window.postMessage(payload, '*'); } catch {}
  };

  // Pontuação para escolher sempre a melhor variante disponível.
  const score = (item) => {
    let s = item.kind === 'video' ? 200 : 0;
    if (item.source === 'json') s += 80;      // video_url dos dados da página = progressiva completa
    if (/(_a|_1)\.mp4/i.test(item.url)) s += 40;
    if (BAD_RE.test(item.url)) s -= 200;
    return s;
  };

  const classify = (url, contentType = '') => {
    if (/video|mp4/i.test(contentType)) return 'video';
    return IMAGE_RE.test(url) ? 'image' : /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url) ? 'video' : 'image';
  };

  const add = (raw, contentType = '', source = 'stream') => {
    if (!raw || typeof raw !== 'string' || raw.startsWith('blob:')) return;
    let url;
    try { url = new URL(raw, location.href); } catch { return; }
    if (!CDN_HOST_RE.test(url.hostname)) return;
    if (BAD_RE.test(url.pathname + url.search)) return;
    const absolute = url.href;
    const kind = classify(absolute, contentType);
    if (kind !== 'video' && !MEDIA_RE.test(url.pathname)) return;
    if (found.has(absolute)) { found.get(absolute).last = Date.now(); return; }
    if (found.size >= MAX) return;
    found.set(absolute, { url: absolute, kind, source, first: Date.now(), last: Date.now() });
    if (kind === 'video') { lastVideoUrl = absolute; lastVideoAt = Date.now(); }
    notify({ type: 'gump-insta-media' });
  };

  const decodeJsonString = (value) => {
    try { return JSON.parse(`"${value}"`); } catch { return value.replace(/\\u0026/g, '&').replace(/\\\//g, '/'); }
  };

  // Extrai URLs .mp4 de textos JSON da página (video_url / video_versions).
  const scanJson = (text) => {
    if (!text || text.length < 10) return;
    const matches = text.match(/https:\\?\/\\?\/[^"'\\\s]+?\.mp4[^"'\\\s]*/g) || [];
    for (const match of matches) add(decodeJsonString(match), 'video/mp4', 'json');
  };

  // fetch
  const nativeFetch = window.fetch;
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    try {
      const input = args[0];
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      const type = response.headers?.get?.('content-type') || '';
      if (/json/i.test(type) && /instagram\.com$/i.test(new URL(url, location.href).hostname)) {
        response.clone().text().then(scanJson).catch(() => {});
      } else {
        add(url, type);
      }
    } catch {}
    return response;
  };

  // XHR
  const nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    const call = this;
    call.addEventListener('load', function () {
      try {
        const finalUrl = call.responseURL || (typeof url === 'string' ? url : String(url));
        const type = call.getResponseHeader?.('content-type') || '';
        if (/json/i.test(type) && typeof call.responseText === 'string') scanJson(call.responseText);
        else add(finalUrl, type);
      } catch {}
    });
    return nativeOpen.call(this, method, url, ...rest);
  };

  // src/href de elementos
  const inspect = (el) => {
    for (const attr of ['src', 'data-video-url', 'data-src']) {
      const value = el.getAttribute?.(attr);
      if (value) add(value);
    }
  };
  new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType !== 1) continue;
      inspect(node);
      node.querySelectorAll?.('video, source, img').forEach(inspect);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Ao dar play, associa a melhor URL recente de vídeo ao elemento (para o botão sobre o vídeo).
  document.addEventListener('play', (event) => {
    const el = event.target;
    if (el?.tagName !== 'VIDEO') return;
    if (lastVideoUrl && Date.now() - lastVideoAt < 30_000) {
      try { el.dataset.gumpVideo = lastVideoUrl; } catch {}
    }
    notify({ type: 'gump-insta-media' });
  }, true);

  // Quando o painel pede, devolve tudo que já vimos ordenado pela melhor qualidade.
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== 'gump-insta-get') return;
    const media = [...found.values()]
      .sort((a, b) => score(b) - score(a) || b.last - a.last);
    window.postMessage({ type: 'gump-insta-list', media }, '*');
  });
})();
