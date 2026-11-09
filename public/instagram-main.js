// Gump.io — Instagram Downloader (mundo MAIN)
// O player do Instagram usa <video src="blob:...">, então a URL real da CDN só
// pode ser observada dentro da própria página. Este script roda no mundo MAIN
// (mesmo contexto do site), intercepta fetch/XHR e captura as URLs de mídia que
// o próprio Instagram carrega, incluindo o blob que ele cria a partir delas.
(() => {
  if (window.__gumpInstaHooked) return;
  window.__gumpInstaHooked = true;

  const MEDIA_RE = /\.(mp4|mov|m4v|webm|jpg|jpeg|png|webp|heic)(\?|$)/i;
  const CDN_HOST_RE = /(^|\.)cdninstagram\.com$|(^|\.)fbcdn\.net$/i;
  const VIDEO_RE = /(\.mp4|video)/i;
  const IMAGE_RE = /\.(jpg|jpeg|png|webp|heic)(\?|$)/i;
  const found = new Map();
  const blobs = new Map(); // blob: -> url real
  const MAX = 400;
  let lastVideoUrl = '';

  const quality = (url) => {
    try {
      const u = new URL(url, location.href);
      const p = u.pathname + u.search;
      // Prioriza vídeos (variante _a.mp4, mais alta do IG) e exclui manifestos DASH/HLS.
      const isVideo = VIDEO_RE.test(p);
      const notDash = !/m3u8|dash|manifest/i.test(p);
      return (isVideo ? 100 : 0) + (notDash ? 20 : 0);
    } catch { return 0; }
  };

  const add = (raw) => {
    if (!raw || typeof raw !== 'string' || raw.startsWith('blob:')) return;
    let url;
    try { url = new URL(raw, location.href); } catch { return; }
    if (!CDN_HOST_RE.test(url.hostname)) return;
    const absolute = url.href;
    if (!MEDIA_RE.test(url.pathname)) return;
    if (found.has(absolute)) { found.get(absolute).last = Date.now(); return; }
    if (found.size >= MAX) return;
    const isVideo = !IMAGE_RE.test(url.pathname);
    found.set(absolute, {
      url: absolute,
      kind: isVideo ? 'video' : 'image',
      first: Date.now(),
      last: Date.now(),
    });
    notify({ type: 'gump-insta-media' });
  };

  const notify = (payload) => {
    try { window.postMessage(payload, '*'); } catch {}
  };

  const mapBlob = (blobUrl, realUrl) => {
    if (!blobUrl || !blobUrl.startsWith('blob:')) return;
    const previous = blobs.get(blobUrl);
    if (previous === realUrl) return;
    blobs.set(blobUrl, realUrl);
    notify({ type: 'gump-insta-blob' });
  };

  // Hook do createObjectURL: é aqui que o blob do player nasce a partir da URL real.
  const nativeCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    const blobUrl = nativeCreateObjectURL.call(URL, obj);
    try {
      if (obj instanceof MediaSource) {
        // MediaSource (MSE): a mídia chega por segmentos; mantém o blob mapeado quando houver URL.
        mapBlob(blobUrl, lastVideoUrl || '');
      }
    } catch {}
    return blobUrl;
  };

  // fetch
  const nativeFetch = window.fetch;
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    try {
      const input = args[0];
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      add(url);
      const type = response.headers?.get?.('content-type') || '';
      if (/video|mp4/i.test(type) && CDN_HOST_RE.test(new URL(url, location.href).hostname)) { add(url); lastVideoUrl = url; }
    } catch {}
    return response;
  };

  // XHR
  const nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try { add(typeof url === 'string' ? url : String(url)); } catch {}
    return nativeOpen.call(this, method, url, ...rest);
  };

  // src/href de elementos (o Instagram aponta <video src=blob:> mas mantém atributos data / sources)
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

  document.addEventListener('play', (event) => {
    const el = event.target;
    if (el?.tagName !== 'VIDEO') return;
    const source = el.currentSrc || el.src || '';
    if (source.startsWith('blob:')) {
      // A URL real do blob normalmente já foi vista via fetch/XHR; pede ao content script
      // que considere o item mais recente de vídeo como "o que está tocando".
      notify({ type: 'gump-insta-playing' });
    } else add(source);
  }, true);

  // Quando o painel pede, devolve tudo que já vimos (incluindo mapeamentos blob -> url real).
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== 'gump-insta-get') return;
    const media = [...found.values()].sort((a, b) => quality(b.url) - quality(a.url) || b.last - a.last);
    window.postMessage({ type: 'gump-insta-list', media, blobs: [...blobs.entries()] }, '*');
  });
})();
