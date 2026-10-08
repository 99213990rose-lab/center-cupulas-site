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
