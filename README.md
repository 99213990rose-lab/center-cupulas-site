# Center Cúpulas

Site institucional B2B e catálogo configurável da Center Cúpulas. O projeto usa somente HTML, CSS e JavaScript, sem etapa de build ou dependências externas.

## Páginas

- `index.html`: homepage institucional para fabricação sob encomenda no atacado.
- `modelos.html`: catálogo com 40 referências, disponíveis nos formatos redondo e quadrado/retangular.

## Estrutura

- `styles.css`: identidade visual, componentes, animações e responsividade compartilhados.
- `script.js`: navegação, scroll reveal e carrosséis.
- `catalogo.js`: referências, filtros, busca, configurador e integração com WhatsApp.
- `assets/`: imagens existentes recuperadas e organizadas, com derivados JPEG otimizados para uso na homepage.
- `robots.txt` e `sitemap.xml`: arquivos de rastreamento.

## Contatos oficiais

- WhatsApp: +55 12 98321-6069
- E-mail: centercupulas@gmail.com

## Troca futura das imagens

As representações do catálogo são geradas por classes CSS e não estão acopladas aos dados das referências. Fotos reais podem ser incorporadas alterando a função `createCard` em `catalogo.js`, sem mudar filtros, busca ou configurador.

## Execução local

Abra o diretório em um servidor HTTP local. Exemplo:

```powershell
python -m http.server 8000
```

Depois acesse `http://localhost:8000/`.

## URL pública

O `sitemap.xml` e o `robots.txt` usam provisoriamente a URL esperada do GitHub Pages deste repositório. Se a publicação usar um domínio próprio, substitua essa base nos dois arquivos e inclua URLs canônicas nas páginas antes de publicar.
