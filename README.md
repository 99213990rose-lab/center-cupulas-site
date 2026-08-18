# Center Cúpulas

Site institucional B2B e catálogo configurável da Center Cúpulas. O projeto usa somente HTML, CSS e JavaScript, sem etapa de build ou dependências externas.

## Páginas

- `index.html`: homepage institucional para fabricação sob encomenda no atacado.
- `modelos.html`: catálogo de medidas sugeridas e configuradores para formato, material, cor e dimensões personalizadas.

## Estrutura

- `styles.css`: identidade visual, componentes, animações e responsividade compartilhados.
- `script.js`: navegação, scroll reveal e carrosséis.
- `catalogo.js`: referências, filtros, busca, controles rápidos, configuradores e integração com WhatsApp.
- `assets/`: imagens existentes recuperadas e organizadas.
- `assets/catalogo/`: imagens-base oficiais provisórias, separadas por formato.
- `robots.txt` e `sitemap.xml`: arquivos de rastreamento.

## Contatos oficiais

- WhatsApp: +55 12 98321-6069
- E-mail: centercupulas@gmail.com

## Imagens do catálogo

Os cards e configuradores resolvem as imagens por formato, material e cor a partir do registro `catalogImages` em `catalogo.js`. Cada formato possui uma imagem-base; futuras fotografias específicas podem ser adicionadas ao mapa `variants` sem alterar filtros, busca ou regras do configurador.

## Execução local

Abra o diretório em um servidor HTTP local. Exemplo:

```powershell
python -m http.server 8000
```

Depois acesse `http://localhost:8000/`.

## URL pública

O endereço oficial utilizado em URLs canônicas, `robots.txt` e `sitemap.xml` é `https://center-cupulas-site.vercel.app/`.
