# Checkout Mercado Pago — Center Cúpulas (somente desenvolvimento)

Estado em 08/10/2026: **planejamento técnico**, não liberado para cobrança. Esta branch não deve ser mesclada na `main` antes dos testes e da validação comercial.

## Decisões confirmadas com o responsável comercial

- Reaproveitar a estrutura existente do projeto `metodos-digitais` (Pix, Checkout Pro e confirmação por webhook).
- Utilizar provisoriamente a conta de Mercado Pago indicada pelo responsável comercial, após verificar titularidade e autorização. Não misturar cadastros nem pedidos dos dois negócios.
- Não exigir conta nova nesta etapa. A eventual troca de credenciais no futuro deverá ser possível via variáveis de ambiente.
- Cobranças reais somente depois da validação de autorização para uso da conta, revisão financeira/fiscal e aprovação da implementação pela operação.
- Não alterar nem publicar o site atual até que os testes de preço, frete e fluxo estejam concluídos.

## Diagnóstico verificado

- Front-end de catálogo configura modelo, tecido, medidas, quantidade e exibe cotação estimada; carrinho em `carrinho.html` / `carrinho.js`.
- A função Supabase `public-cart-checkout` recalcula preços no servidor e hoje produz orçamento com `status: draft`; não gera preferência nem cobrança Mercado Pago.
- Resposta do checkout inclui `calibration: true` e a observação de confirmação de frete/valor pela fábrica.
- Há cenários com cotação de frete indisponível, embalagem em revisão e confiança de preço inferior à alta; **nenhum deles pode ser cobrado automaticamente**.
- O projeto Vercel da Center já possui a variável sensível `MERCADO_PAGO_ACCESS_TOKEN` em preview e produção. A titularidade da credencial não foi verificada; nunca imprimir, transferir para front-end ou colocar a chave no Git.
- O projeto Métodos Digitais usa `/api/checkout` (Pix), `/api/checkout-pro` (Checkout Pro) e `/api/mercadopago/webhook` com validação da assinatura; adaptar, não copiar endpoints nem banco de pedidos diretamente.

## Projeto de implementação

1. Validar regras de preço de fábrica, margem mínima, faixas de medidas permitidas e orçamento por quantidade no servidor.
2. Definir embalagem/frete real, valor fechado e prazo; quando não houver transporte automático, oferecer retirada com custo confirmado ou atendimento humano. O preço final não pode mudar após a aprovação do cliente sem seu aceite.
3. Criar registro exclusivo do pedido Center no banco Center antes da cobrança, com itens, medidas, total validado no servidor, frete, preço, identificador único e status `aguardando_pagamento`.
4. Criar preferência do Mercado Pago **somente no servidor**, com `external_reference` exclusiva do pedido Center, valor calculado no servidor, URLs de retorno da Center, idempotência e notificações Center; usar credenciais por ambiente. Pix e cartão pelo checkout seguro do Mercado Pago.
5. Webhook próprio da Center: verificar assinatura, buscar pagamento pelo ID na API do Mercado Pago e confrontar identificação, valor, moeda e status com pedido persistido; aplicar atualização idempotente e proteção contra repetição/reversão. Não usar retorno do navegador como confirmação.
6. Estado de produção: somente quando o pagamento estiver aprovado e a configuração/frete válidos. Registrar cancelamento, estorno, divergência e contestação.
7. Mensagem automática da compra aprovada + canal humano para dúvidas, mantendo números oficiais e atendimento no site.

## Regras de bloqueio obrigatórias

- Cotações em calibração, baixa confiança ou fora dos limites de medidas e formatos aprovados: **não criar pagamento**.
- Embalagem para revisão manual, frete indisponível ou valor final não calculado: **não criar pagamento**.
- Custos/margem não aprovados, cupom/manual alterando preço e quantidade fora dos limites: **não criar pagamento**.
- Falha de rede, webhook não confirmado ou status pendente do Mercado Pago: **não liberar produção**.
- Nenhuma chave secreta no JavaScript do navegador ou repositório.

## Testes antes da publicação

- Compra padrão (Pix), cartão aprovado/recusado, pagamento pendente, cancelado, estornado; webhook repetido e fora de ordem.
- Medida personalizada validada e inválida, tecido com custo adicional, desconto por quantidade, mínimo de margem.
- Frete calculado, retirada válida, frete indisponível, embalagem especial, endereço/CEP inválido.
- Confirmação de que Métodos Digitais não recebe pedidos da Center e vice-versa.
- Validar dados do recebedor sem expor credenciais; testar com pagamentos de teste antes de habilitar dinheiro real.

## Entrega de teste

Uma versão prévia isolada da Center com botão de pagamento habilitado apenas quando preço e logística estiverem aprovados. Nenhuma publicação na versão de produção ou cobrança real por esta branch.


## Implementado em 2026-10-08 — embalagem padronizada (somente branch de testes)

- Branch: `feat/mercadopago-checkout-testes-20261008`; o `main` e o site em produção não foram alterados.
- Novos arquivos: `lib/center-packaging.cjs` e `api/checkout/preview.js`. O carrinho consulta a prévia pelo backend e apresenta custo de produto + embalagem + frete estimado.
- **Preços de caixas são provisórios**: P30 (30 × 30 × 30 cm) R$ 6; M45 (45 × 45 × 45 cm) R$ 16; G60 (60 × 60 × 60 cm) R$ 30; GG70 (70 × 70 × 70 cm) R$ 45. Dimensões internas, ainda sem confirmação do fornecedor.
- Seleção automática: menor caixa cuja aresta interna comporte maior medida da cúpula + 5 cm de folga total estimada. Uma caixa por peça neste primeiro teste; não presumir que produtos encaixam uns nos outros. Formatos especiais, volumes >30 e peças que não cabem exigem revisão.
- Motor de preço da cúpula consultado novamente no Supabase pelo servidor. Nenhum `unit_price`, `total` ou `shipping_price` recebido do navegador é aceito como preço do produto.
- O frete de prévia ainda usa o endpoint Frenet do projeto, com cálculo em calibração; **as medidas externas e o peso real das caixas ainda não foram medidos**. Não usar cotação provisória para cobrança final. Melhor Envio ainda não foi integrado.
- Frontend da branch foi alterado apenas para **prévia**, deixando envio/pagamento desabilitado enquanto as regras não forem aprovadas. O endpoint antigo do Supabase continua gerando orçamento e não faz cobrança.
- CI: `node --test tests/center-packaging.test.cjs` na branch, com testes de formatos, limites, quantidade, preço e seleção; GitHub Actions `test-packaging.yml` concluído com sucesso em 2026-10-08.
- Não existe cobrança automática ou webhook Mercado Pago habilitado neste protótipo. O token MP previamente configurado na Vercel não foi usado nesta etapa.

### Próximos bloqueios antes da cobrança

1. Confirmar custos reais das caixas (fabricantes próximos de Itaquera); medir dimensões externas e peso de cada caixa montada com proteção interna.
2. Calibrar tabela de fábrica, margens, formatos/cores, descontos e estoque/capacidade para medida personalizada; garantir produção viável.
3. Definir provedor de frete efetivo (Frenet atual ou Melhor Envio), com credenciais server-side e cotação final no servidor.
4. Criar pedidos e transações específicos da Center no Supabase (não misturar com Métodos Digitais), checkout Pix/cartão com total server-side, assinatura de webhook e confirmação real antes de liberar produção.
5. Testar simulações de recusa, estorno, frete indisponível, caixa especial, duplicidade e pagamento pendente em ambiente seguro. Não publicar em produção sem autorização do responsável.
