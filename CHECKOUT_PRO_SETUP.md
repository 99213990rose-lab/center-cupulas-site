# Checkout Pro — Center Cúpulas

Este desenvolvimento é separado do Métodos Digitais. O valor dos produtos é recalculado no backend da Center, o frete é validado e o Checkout Pro recebe o total. A conta Mercado Pago pode ser a mesma, mas os registros de pedidos continuam no banco da Center.

## Arquivos
- `carrinho.html`, `carrinho.js`: início do checkout e mensagens de retorno.
- `api/mercadopago/create-checkout.js`: cria a preferência após confirmar preço, frete e embalagem. Retorna apenas a URL do checkout.
- `api/mercadopago/webhook.js`: valida assinatura da notificação, consulta o pagamento no Mercado Pago, compara valor e moeda e marca o orçamento da Center como `paid`.

## Variáveis de ambiente da Center Cúpulas (Vercel)
- `MERCADO_PAGO_ACCESS_TOKEN` — segredo, servidor; usar a conta autorizada.
- `MERCADO_PAGO_WEBHOOK_SECRET` — segredo de assinatura de webhook da **aplicação de checkout usada pela Center**.
- `SUPABASE_URL` — URL do Supabase da Center.
- `SUPABASE_SERVICE_ROLE_KEY` — segredo do backend da Center. **Não** colocar em frontend.
- `CENTER_CHECKOUT_ENABLED` — `true` somente depois dos testes; ausente ou `false` impede cobranças novas.

## Antes de publicar
1. Revisar e testar preço final das cúpulas, desconto, frete da Frenet e embalagem; itens sem frete válido ficam bloqueados.
2. Confirmar com o titular autorizado as credenciais do Mercado Pago e cadastrar webhook HTTPS em `https://www.centercupulas.com.br/api/mercadopago/webhook`, evento Pagamentos.
3. Configurar todas as variáveis na Vercel, preservando a separação dos pedidos do Métodos Digitais.
4. Testar em ambiente de testes: aprovação, pendência, falha, webhook duplicado, assinatura inválida, alteração de preços pelo cliente, CEP sem transportadora e erro de cotação.
5. Verificar que um retorno do navegador **nunca** confirma pagamento; somente o webhook validado atualiza o orçamento.
6. Conferir se o painel de pedidos reconhece o status `paid` e não inicia produção antes da aprovação.
7. Revisar o PR e publicar. Só então definir `CENTER_CHECKOUT_ENABLED=true` na produção.

**Status:** implementação em branch e PR de rascunho. Não está pronta para habilitação de cobrança real antes da validação de credenciais, ambiente e fluxo de ponta a ponta.
