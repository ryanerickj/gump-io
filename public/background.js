// Gump.io — service worker
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL('app.html') }));

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchWithCookies(url) {
  // Cookies da sessão logada do Instagram (necessários para mídia privada).
  const cookies = await chrome.cookies.getAll({ domain: '.instagram.com' });
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  return fetch(url, {
    headers: { 'User-Agent': UA, 'Referer': 'https://www.instagram.com/' },
    credentials: 'omit',
    redirect: 'follow',
  });
}

// Instagram Downloader: baixa a mídia direto da CDN com a sessão do navegador.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'gump-insta-download') {
    (async () => {
      try {
        if (!message.url) throw new Error('nenhuma URL de vídeo capturada — dê play no vídeo e tente de novo');
        const name = message.filename || `gump-instagram-${Date.now()}.${message.kind === 'image' ? 'jpg' : 'mp4'}`;
        // Caminho direto: o Chrome baixa da CDN com os cookies do próprio perfil.
        try {
          const downloadId = await chrome.downloads.download({
            url: message.url,
            filename: `Gump.io/${name}`,
            saveAs: false,
          });
          sendResponse({ ok: true, downloadId });
          return;
        } catch (directError) {
          console.warn('[Gump.io] Download direto falhou, tentando via fetch:', directError);
        }
        // Fallback: busca manual com User-Agent de navegador e cookies da sessão.
        const response = await fetchWithCookies(message.url);
        if (!response.ok) throw new Error(`CDN respondeu ${response.status}`);
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const buffer = new Uint8Array(await response.arrayBuffer());
        if (buffer.length < 100_000 && /html|json/i.test(contentType)) {
          throw new Error('a CDN devolveu uma página em vez do vídeo — URL expirada; atualize o Instagram e dê play de novo');
        }
        let binary = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < buffer.length; i += CHUNK) {
          binary += String.fromCharCode(...buffer.subarray(i, i + CHUNK));
        }
        const downloadId = await chrome.downloads.download({
          url: `data:${contentType};base64,${btoa(binary)}`,
          filename: `Gump.io/${name}`,
          saveAs: false,
        });
        sendResponse({ ok: true, downloadId });
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message || error) });
      }
    })();
    return true;
  }

  if (message?.type === 'gump-insta-open-in-gump') {
    (async () => {
      try {
        // Abre a Gump.io com a URL da CDN: a página do app baixa o vídeo ela mesma
        // (tem host permission) e já carrega no player para extração de frames.
        const appUrl = `${chrome.runtime.getURL('app.html')}?src=${encodeURIComponent(message.url)}`;
        await chrome.tabs.create({ url: appUrl });
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message || error) });
      }
    })();
    return true;
  }

  return false;
});

// Menu de contexto no Instagram
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'gump-insta-open', title: 'Gump.io — abrir Instagram Downloader', contexts: ['page'], documentUrlPatterns: ['https://www.instagram.com/*'] });
});
chrome.contextMenus?.onClicked?.addListener((info, tab) => {
  if (info.menuItemId === 'gump-insta-open' && tab?.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: 'gump-insta-open-panel' }, () => void chrome.runtime.lastError);
  }
});

// Ícone da extensão: no Instagram abre o painel; fora, abre o app.
chrome.action.onClicked.addListener((tab) => {
  if (tab?.url && /instagram\.com/.test(tab.url) && tab.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: 'gump-insta-open-panel' }, () => void chrome.runtime.lastError);
  }
});
