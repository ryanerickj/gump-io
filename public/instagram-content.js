// Gump.io — Instagram Downloader (content script, mundo ISOLATED)
// Injeta o interceptor no mundo MAIN, recebe as URLs de mídia detectadas e
// desenha o painel flutuante com os downloads. Nada é enviado para fora: o
// download é feito pelo service worker da extensão, direto da CDN do Instagram.
(() => {
  const IS_INSTAGRAM = /(^|\.)instagram\.com$/.test(location.hostname);
  if (IS_INSTAGRAM) injectMain();
  else if (location.protocol.startsWith('http')) setupBridge();

  function injectMain() {
    const inject = () => {
      if (document.getElementById('gump-insta-main')) return;
      const script = document.createElement('script');
      script.id = 'gump-insta-main';
      script.src = chrome.runtime.getURL('instagram-main.js');
      (document.head || document.documentElement).appendChild(script);
    };
    if (document.documentElement) inject();
    else document.addEventListener('DOMContentLoaded', inject, { once: true });

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'gump-insta-open-panel') {
        openPanel();
        sendResponse({ ok: true });
      }
      return false;
    });

    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.data?.type === 'gump-insta-list') renderPanel(event.data);
      if ((event.data?.type === 'gump-insta-media' || event.data?.type === 'gump-insta-blob') && panel) {
        requestList();
      }
      if (event.data?.type === 'gump-insta-request-list') {
        // Reencaminha para o mundo MAIN
        window.postMessage({ type: 'gump-insta-get' }, '*');
      }
    });

    // Depois do carregamento, pede a lista para exibir o badge se já houver mídia.
    setTimeout(() => { if (!panel) { requestList(); ensureBadge(); } }, 2500);
  }

  let panel = null;

  function setupBridge() {
    // Em outras páginas, permite o botão "Enviar para a Gump.io" via menu de contexto
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'gump-insta-open-panel') { sendResponse({ ok: true }); }
      return false;
    });
  }

  const css = `
#gump-insta-panel{position:fixed;right:16px;bottom:16px;width:328px;max-width:calc(100vw - 32px);background:#1a1a23;border:1px solid #343444;border-radius:14px;color:#f3f3f6;font:13px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;z-index:2147483647;box-shadow:0 18px 60px rgba(0,0,0,.55);display:flex;flex-direction:column;max-height:min(560px,calc(100vh - 32px))}
#gump-insta-panel .gump-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #343444;font-weight:800;letter-spacing:1px;font-size:12px}
#gump-insta-panel .gump-head .gump-title{color:#948fff}
#gump-insta-panel .gump-count{margin-left:auto;color:#aaaabb;font-weight:600;letter-spacing:0}
#gump-insta-panel .gump-close{background:none;border:0;color:#aaaabb;font-size:16px;cursor:pointer;padding:0 2px;line-height:1}
#gump-insta-panel .gump-close:hover{color:#f3f3f6}
#gump-insta-panel .gump-body{overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
#gump-insta-panel .gump-item{display:flex;gap:10px;align-items:center;background:#111119;border:1px solid #343444;border-radius:9px;padding:8px}
#gump-insta-panel .gump-thumb{width:52px;height:52px;border-radius:7px;object-fit:cover;background:#000;flex-shrink:0}
#gump-insta-panel .gump-thumb.gump-video{display:flex;align-items:center;justify-content:center;font-size:20px;background:linear-gradient(135deg,#202035,#111119)}
#gump-insta-panel .gump-meta{flex:1;min-width:0}
#gump-insta-panel .gump-name{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#gump-insta-panel .gump-sub{font-size:10px;color:#aaaabb;margin-top:2px}
#gump-insta-panel .gump-dl{background:#635bff;border:0;border-radius:7px;color:#fff;font:600 12px inherit;padding:7px 11px;cursor:pointer;flex-shrink:0}
#gump-insta-panel .gump-dl:hover{filter:brightness(1.12)}
#gump-insta-panel .gump-dl:disabled{opacity:.55;cursor:default}
#gump-insta-panel .gump-empty{color:#aaaabb;font-size:12px;text-align:center;padding:14px 6px;line-height:1.5}
#gump-insta-panel .gump-foot{padding:9px 12px;border-top:1px solid #343444;display:flex;gap:8px;align-items:center}
#gump-insta-panel .gump-foot .gump-note{font-size:10px;color:#aaaabb;flex:1;line-height:1.4}
#gump-insta-panel .gump-refresh{background:#30303e;border:0;border-radius:7px;color:#fff;font:600 11px inherit;padding:6px 10px;cursor:pointer}
#gump-insta-badge{position:fixed;right:16px;bottom:16px;width:44px;height:44px;border-radius:50%;background:#635bff;border:0;color:#fff;font-size:19px;cursor:pointer;z-index:2147483647;box-shadow:0 8px 26px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center}
#gump-insta-badge:hover{filter:brightness(1.12)}
`;

  function ensureStyles() {
    if (document.getElementById('gump-insta-style')) return;
    const style = document.createElement('style');
    style.id = 'gump-insta-style';
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function ensureBadge() {
    ensureStyles();
    if (document.getElementById('gump-insta-badge') || panel) return;
    const badge = document.createElement('button');
    badge.id = 'gump-insta-badge';
    badge.title = 'Gump.io — Instagram Downloader';
    badge.textContent = '⇩';
    badge.addEventListener('click', () => { requestList(); openPanel(); });
    document.documentElement.appendChild(badge);
  }

  function removeBadge() {
    document.getElementById('gump-insta-badge')?.remove();
  }

  function requestList() {
    window.postMessage({ type: 'gump-insta-get' }, '*');
  }

  function openPanel() {
    ensureStyles();
    removeBadge();
    if (panel) return;
    panel = document.createElement('div');
    panel.id = 'gump-insta-panel';
    panel.innerHTML = `
<div class="gump-head"><span class="gump-title">GUMP.IO</span><span>Instagram</span><span class="gump-count" id="gump-insta-count"></span><button class="gump-close" title="Fechar">×</button></div>
<div class="gump-body" id="gump-insta-body"><div class="gump-empty">Nenhuma mídia detectada ainda.<br>Role o feed, abra um reel ou dê play em um vídeo.</div></div>
<div class="gump-foot"><span class="gump-note">Somente mídia que sua conta já pode ver. Os arquivos são baixados por esta extensão, sem serviços externos.</span><button class="gump-refresh">Atualizar</button></div>`;
    panel.querySelector('.gump-close').addEventListener('click', closePanel);
    panel.querySelector('.gump-refresh').addEventListener('click', () => { requestList(); });
    document.documentElement.appendChild(panel);
    requestList();
  }

  function closePanel() {
    panel?.remove();
    panel = null;
    ensureBadge();
  }

  function refreshBadge() {
    if (panel || document.getElementById('gump-insta-badge')) return;
    if (!mediaCount) return;
    ensureBadge();
  }

  let mediaCount = 0;

  function renderPanel({ media = [], blobs = [] }) {
    mediaCount = media.length;
    ensureBadge();
    if (!panel) return;
    const body = panel.querySelector('#gump-insta-body');
    const count = panel.querySelector('#gump-insta-count');
    const blobMap = new Map(blobs);
    count.textContent = media.length ? `${media.length} arquivo${media.length > 1 ? 's' : ''}` : '';
    if (!media.length) {
      body.innerHTML = `<div class="gump-empty">Nenhuma mídia detectada ainda.<br>Role o feed, abra um reel ou dê play em um vídeo.</div>`;
      return;
    }
    body.replaceChildren(...media.map((item, index) => {
      const row = document.createElement('div');
      row.className = 'gump-item';
      const thumb = document.createElement('div');
      thumb.className = 'gump-thumb' + (item.kind === 'video' ? ' gump-video' : '');
      if (item.kind === 'image') thumb.style.background = `url("${item.url}") center/cover`;
      else thumb.textContent = '▶';
      const meta = document.createElement('div');
      meta.className = 'gump-meta';
      const name = document.createElement('div');
      name.className = 'gump-name';
      name.textContent = filenameFor(item, index, blobMap);
      const sub = document.createElement('div');
      sub.className = 'gump-sub';
      sub.textContent = item.kind === 'video' ? 'Vídeo MP4 · CDN do Instagram' : 'Imagem · CDN do Instagram';
      meta.append(name, sub);
      const button = document.createElement('button');
      button.className = 'gump-dl';
      button.textContent = 'Baixar';
      button.addEventListener('click', () => {
        button.disabled = true;
        const previous = button.textContent;
        button.textContent = '…';
        chrome.runtime.sendMessage({ type: 'gump-insta-download', url: item.url, kind: item.kind, filename: name.textContent }, (response) => {
          button.disabled = false;
          button.textContent = response?.ok ? '✓' : '!';
          setTimeout(() => { button.textContent = previous; }, 1600);
        });
      });
      row.append(thumb, meta, button);
      return row;
    }));
  }

  function pageContext() {
    const path = location.pathname;
    const shortcode = path.match(/\/(p|reel|reels|tv)\/([\w-]+)/)?.[2];
    const username = document.querySelector('header a[href^="/"]:not([href^="/p"]):not([href^="/reel"])')?.getAttribute('href')?.replace(/\//g, '');
    const kind = path.includes('/reel') || path.includes('/reels') ? 'reel' : 'post';
    return { username, shortcode, kind };
  }

  function filenameFor(item, index, blobMap) {
    const { username, shortcode, kind } = pageContext();
    const ext = item.url.match(/\.(\w{3,4})(\?|$)/)?.[1]?.toLowerCase() || (item.kind === 'video' ? 'mp4' : 'jpg');
    const parts = ['gump', username || 'instagram', kind, shortcode || String(index + 1).padStart(2, '0')];
    if (item.kind === 'image') parts.push(String(index + 1));
    return `${parts.filter(Boolean).join('-')}.${ext}`;
  }
})();
