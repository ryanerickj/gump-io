# Gump.io

Extensão Chrome para extrair e selecionar frames de proxies locais do Frame.io.

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
