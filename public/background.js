// Gump.io — service worker
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL('app.html') }));

// Instagram Downloader: baixa a mídia direto da CDN usando a sessão do navegador.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'gump-insta-download') return false;
  (async () => {
    try {
      const name = message.filename || `gump-instagram-${Date.now()}.${message.kind === 'image' ? 'jpg' : 'mp4'}`;
      // 1) Caminho direto: o Chrome baixa da CDN com os cookies do próprio perfil
      //    (necessário para mídia privada) e preserva streaming de arquivos grandes.
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
      // 2) Fallback: busca manualmente com cookies explícitos e entrega como data URL.
      const cookies = await chrome.cookies.getAll({ domain: '.instagram.com' });
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      const response = await fetch(message.url, {
        headers: { 'Referer': 'https://www.instagram.com/', 'Cookie': cookieHeader },
        credentials: 'omit',
      });
      if (!response.ok) throw new Error(`CDN respondeu ${response.status}`);
      const buffer = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < buffer.length; i += CHUNK) {
        binary += String.fromCharCode(...buffer.subarray(i, i + CHUNK));
      }
      const downloadId = await chrome.downloads.download({
        url: `data:application/octet-stream;base64,${btoa(binary)}`,
        filename: `Gump.io/${name}`,
        saveAs: false,
      });
      sendResponse({ ok: true, downloadId });
    } catch (error) {
      sendResponse({ ok: false, error: String(error?.message || error) });
    }
  })();
  return true; // resposta assíncrona
});

// Menu de contexto: baixar mídia de qualquer página aberta do Instagram
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'gump-insta-open', title: 'Gump.io — abrir Instagram Downloader', contexts: ['page'], documentUrlPatterns: ['https://www.instagram.com/*'] });
});
chrome.contextMenus?.onClicked?.addListener((info, tab) => {
  if (info.menuItemId === 'gump-insta-open' && tab?.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: 'gump-insta-open-panel' }, () => void chrome.runtime.lastError);
  }
});

// Clique no ícone da extensão numa página do Instagram abre o painel; fora dela, abre o app.
chrome.action.onClicked.addListener((tab) => {
  if (tab?.url && /instagram\.com/.test(tab.url) && tab.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: 'gump-insta-open-panel' }, () => void chrome.runtime.lastError);
  }
});
