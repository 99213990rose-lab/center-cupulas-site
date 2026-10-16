# Checkout Pro — operação da Center Cúpulas

## Estado de implantação (16/10/2026)
- O checkout online é protegido por `CENTER_CHECKOUT_ENABLED` (atualmente **false**).
- Enquanto estiver desligado, o carrinho mantém o fluxo de orçamento/WhatsApp.
- O novo `GET /api/mercadopago/status` só responde `checkout_enabled: true`
  quando todas as credenciais e a configuração do frete estiverem presentes.
- O novo webhook e a migração de banco NÃO dependem do status dessa chave:
  pagamentos antigos ainda precisam ser conciliados após uma desativação.

## Ambientes e credenciais
Cadastrar somente na Vercel (Production), sem colocar segredos no GitHub ou no navegador:

| Variável | Propósito |
| --- | --- |
| `MERCADO_PAGO_ACCESS_TOKEN` | Acesso do vendedor ao Mercado Pago |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Assinatura do webhook de **produção** da aplicação |
| `SUPABASE_URL` | Projeto Supabase da Center, nunca o do Métodos Digitais |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave secreta do servidor Center (`sb_secret_...` aceita) |
| `FRENET_TOKEN` | Token do cálculo de entrega |
| `CENTER_CUPULAS_ORIGIN_CEP` | CEP real de coleta/expedição, exatamente oito números |
| `CENTER_CHECKOUT_ENABLED` | `false` até homologação; `true` para liberar após testes |

O frete não usa mais CEP de origem presumido. Sem Frenet/token/CEP válido o pagamento fica bloqueado; os pedidos de orçamento continuam funcionando.

**Importante:** não trocar a URL global do webhook da aplicação Métodos Digitais de forma cega: ela pode receber pagamentos daquele projeto. As preferências da Center incluem `notification_url` específica:
`https://www.centercupulas.com.br/api/mercadopago/webhook`.
Verificar no Mercado Pago quais notificações efetivamente chegam a este endpoint.

## Regras de confirmação
1. O servidor calcula o valor e frete novamente usando a função `public-cart-checkout`, ação `payment`. Ela recusa pagamento sem embalagem estimada e frete válido.
2. Checkout Pro recebe o valor final em BRL e `external_reference=CENTER_CUPULAS:<uuid>`.
3. Apenas o webhook assinado e validado consulta o pagamento no Mercado Pago.
4. O webhook chama a função SQL `confirm_center_checkout_payment` para conferir valor, moeda, organização, registrar o ID, marcar o orçamento pago, **criar o pedido confirmado e uma entrada na fila de produção** na mesma transação.
5. A tabela `center_checkout_payments` guarda o ID único. Duas notificações do mesmo pagamento são idempotentes; um segundo pagamento aprovado para um orçamento já pago gera `duplicate_charge` e exige revisão humana.
6. Voltar à página de sucesso do navegador **não** altera o status do pedido.

**Banco:** a migração de auditoria e a função SQL foram implantadas no projeto Supabase Center em 16/10/2026. Não rodar novamente sem primeiro verificar o esquema.

## Testes e ativação
- Executar `node --test test/checkout.test.mjs` ou aguardar os checks do GitHub Actions.
- Confirmar origem da expedição e token da Frenet com a empresa.
- Verificar preços de produtos (inclusive descontos), CEP, embalagem estimada e opções de frete.
- Confirmar em produção que o webhook recebe a assinatura correta e que o pagamento aprovado insere registro em `center_checkout_payments`, atualiza `quotes.status='paid'`, e não repete atualizações.
- Validar eventos pendentes, falha, notificação repetida, erro do provedor e CEP sem opção de entrega.
- Ativar `CENTER_CHECKOUT_ENABLED=true` **somente depois** do teste com credenciais e notificações de produção; fazer redeploy para aplicar a variável.

## Monitoramento e reversão
- Em falha, retornar `CENTER_CHECKOUT_ENABLED=false` e fazer redeploy. O carrinho volta a receber orçamentos.
- **Não** desativar webhook quando o checkout estiver suspenso: pagamentos já iniciados ainda podem ser aprovados.
- Inspecionar logs da Vercel para `center-webhook` e a tabela `center_checkout_payments`.
- Consultar periodicamente `reconciliation_status='duplicate_charge'` e reconciliar manualmente; isso pode indicar cobrança dupla que requer atendimento.

Ajustes visuais e automações de acompanhamento podem continuar depois, sem flexibilizar a verificação de pagamentos e frete.

## Automatização de pedido e produção — 16/10/2026
- A migração `center_checkout_atomic_orders_and_production_queue` foi aplicada no Supabase da Center.
- Apenas pagamentos validados e aplicados criam registros em `orders` (`status=confirmed`, `payment_status=paid`) e `production_jobs` (`status=queued`, `review_required=true`).
- A fila **não autoriza fabricar sem revisão humana** das medidas, acabamentos, encaixes, embalagens e prazo.
- Índice único em `(organization_id,quote_id)` evita duplicação de pedidos. Reenvio do webhook devolve o mesmo pedido.
- Teste transacional no banco confirmou criação, vínculo e idempotência. Todas as alterações do teste foram revertidas com `ROLLBACK`; nenhum pagamento nem pedido fictício permaneceu.
- Nenhum pedido antigo foi alterado. O fluxo Checkout Pro permanece desativado em produção até homologação de frete e webhook.
