# Gump.io

Extensão Chrome para extrair e selecionar frames de proxies locais do Frame.io e baixar vídeos e fotos do Instagram — tudo localmente, sem upload adicional.

## Fonte canônica
Edite este projeto somente no Google Drive:

`G4/Developer/gump-io-dev`

## Fluxo de trabalho

1. Edite `src/` e `public/` nesta pasta.
2. Rode `bash ~/Developer/sync-projects.sh`.
3. No Chrome, acesse `chrome://extensions` e recarregue a Gump.io.

O script espelha esta fonte em `~/Developer/gump-io-dev`, gera o bundle em `dist/` e copia o bundle para a raiz local, que é a pasta carregada pelo Chrome.

## Desenvolvimento

```bash
bun run build
```

O bundle gerado fica em `dist/`. Não edite `dist/` nem a cópia em `~/Developer/gump-io-dev` diretamente.

## Módulo Instagram Downloader

Funciona enquanto você está logado no Instagram pelo Chrome. A extensão observa as
mídias que o próprio Instagram carrega no navegador (fetch/XHR, elementos e blobs do
player) e oferece o download direto da CDN — nada passa por serviços externos.

- **Reels, vídeos de feed e carrosséis** em MP4; **fotos** em JPG/PNG/WebP.
- **Painel flutuante** no canto inferior direito da página do Instagram, com badge
  quando há mídia detectada. Também abre pelo ícone da extensão ou pelo menu de
  contexto "Gump.io — abrir Instagram Downloader".
- **Nome de arquivo organizado**: `gump-perfil-reel-XXXX.mp4` (perfil, tipo e shortcode).
- Os downloads ficam em `~/Downloads/Gump.io/`.

### Limites

- Funciona para conteúdo que sua conta **já consegue assistir**, inclusive privado
  com acesso — a sessão logada do navegador é usada no download.
- Não contorna login, conteúdo pago, DRM ou permissões de outras contas.
- URLs da CDN expiram; se um download falhar, atualize a página e dê play no vídeo
  novamente antes de baixar.
