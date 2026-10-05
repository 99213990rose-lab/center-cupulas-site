# Center Cúpulas

Site institucional B2B e catálogo configurável da Center Cúpulas. O projeto usa somente HTML, CSS e JavaScript, sem etapa de build ou dependências externas.

## Páginas

- `index.html`: homepage institucional e comercial.
- `modelos.html`: catálogo de medidas sugeridas e configuradores para formato, material, cor e dimensões personalizadas.
- `reformas.html`: landing page dedicada ao serviço de reforma de cúpulas.
- `/catalogo`: download rastreável do catálogo PDF, preservando a experiência de download.

## Estrutura

- `styles.css`: identidade visual, componentes, animações e responsividade compartilhados.
- `script.js`: navegação, scroll reveal e carrosséis.
- `catalogo.js`: referências, busca, cards, configuradores e integração com WhatsApp.
- `assets/`: imagens existentes recuperadas e organizadas.
- `assets/catalogo/`: fotografias de apresentação dos formatos e futuras imagens exclusivas das referências.
- `catalogo-assets.json`: manifesto técnico das imagens exclusivas planejadas para as 40 referências.
- `robots.txt` e `sitemap.xml`: arquivos de rastreamento.

## Medição e atribuição

A medição comercial usa uma arquitetura complementar:

- **Google Ads**: tag de conversão para cliques no WhatsApp.
- **Vercel Web Analytics**: pageviews e eventos de interação.
- **Supabase**: histórico próprio de eventos do site para atribuição por página, origem, mídia e posição do CTA.
- **UTM / referrer / Google click ID presente**: usados para classificar a origem sem interromper a navegação.
- **Código de atendimento `CC-XXXXXXXX`**: anexado às mensagens iniciadas pelo site e preparado para vincular o clique ao lead quando o WhatsApp de produção estiver conectado ao CRM.
- **Configurador**: envio ao WhatsApp medido separadamente de um clique simples.
- **Catálogo PDF**: downloads por `/catalogo` são registrados antes do redirecionamento para o arquivo.

Os eventos de medição não armazenam nome, telefone ou conteúdo digitado pelo visitante no site.

## Contatos oficiais

- WhatsApp: +55 12 98321-6069
- E-mail: centercupulas@gmail.com

## Imagens do catálogo

O configurador resolve fotografias por formato, material e cor a partir do registro `catalogImages` em `catalogo.js`. Os cards das medidas aceitam um arquivo próprio por referência no campo `image`; quando ele estiver ausente, exibem somente um tratamento gráfico neutro. O planejamento e o status desses arquivos ficam registrados em `catalogo-assets.json`.

## Execução local

Abra o diretório em um servidor HTTP local. Exemplo:

```powershell
python -m http.server 8000
```

Depois acesse `http://localhost:8000/`.

## URL pública

O endereço oficial utilizado em URLs canônicas, `robots.txt` e `sitemap.xml` é `https://www.centercupulas.com.br/`.
