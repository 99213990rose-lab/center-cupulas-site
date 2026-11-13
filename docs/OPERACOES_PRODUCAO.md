# Center Cúpulas — Operações e segurança (backend)

Este documento descreve controles técnicos invisíveis no site de produção. Não altera aparência, preços ou textos comerciais.

## Fluxo de pagamento

1. O navegador solicita frete e total; o servidor calcula preços e embalagem de novo.
2. A preferência Mercado Pago usa o total validado no servidor.
3. Apenas uma notificação com assinatura válida e a função atômica `confirm_center_checkout_payment` confirmam pagamento.
4. Retorno da página do Mercado Pago **não** aprova sozinho um pedido.
5. `production_jobs` registra o serviço após a confirmação. Pedidos históricos manuais não devem ser confundidos com falhas do checkout.

**Atenção:** se um pagamento aparecer como `duplicate_charge`, há possibilidade de duas cobranças aprovadas para a mesma cotação. Investigar no painel do provedor; nunca compensar, estornar ou marcar automaticamente sem conciliação individual.

## Auditoria automática

`GET /api/internal/checkout-audit` requer `Authorization: Bearer <CRON_SECRET>` configurado na Vercel. A execução diária é programada em `vercel.json`.

Os resultados contêm somente contagens. A auditoria é **somente leitura** e identifica:
- cotação paga sem pedido pago;
- pedido online pago sem ficha de produção;
- pagamento registrado no Supabase sem cotação/pedido pago;
- registro de cobrança duplicada;
- notificações de e-mail pendentes, antigas e nunca tentadas;
- pedidos online pagos em produção ainda sem encaixe documentado de forma estruturada.

**Encaixe não pode ser presumido:** a sinalização exige conferência humana com a ficha/cliente. Não atribuir automaticamente "nacional" ou outro tipo de encaixe a vendas existentes.

O endpoint **não** compara diretamente a conta Mercado Pago com o banco. A conciliação bancária completa requer uma integração de leitura autenticada separada e controles de acesso.

Se retornar `503`, verificar logs e integridade antes de intervir. Se retornar `attention`, investigar notificações.

## E-mails e privacidade

`center_order_email_outbox` armazena a fila, mas **a fila sozinha não envia e-mails**. Um serviço de entrega com autenticação, política de repetição segura e confirmação do provedor ainda precisa ser configurado.

E-mail de pedido é um dado fornecido no checkout. Não preencher retroativamente com o e-mail de um lead encontrado apenas pelo telefone: pessoas diferentes podem compartilhar ou reutilizar o número.

Ao atualizar um contato do CRM, omitir um e-mail no checkout não pode apagar o valor anteriormente guardado. Erros de enriquecimento do CRM devem aparecer em logs sem bloquear uma compra válida.

## Proteção da visão do CRM

Em 2026-11-12, foi aplicada no banco de produção a alteração:

```sql
ALTER VIEW public.crm_morning_queue SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON TABLE public.crm_morning_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.crm_morning_queue TO service_role;
```

Verificação posterior: `anon_can_read=false`, `authenticated_can_read=false`, `service_role_can_read=true`. Não alterar esta permissão sem revisar acesso por organização e RLS.

## Verificação e rollback

Executar `node --test test/*.test.mjs` para validar checkout, cotação, frete, promoções, contas e integridade. Atualizações no checkout também exigem validar a Edge Function `public-cart-checkout` no Supabase.

Manter produção com o último commit aprovado; em incidente, restaurar a última implantação íntegra na Vercel. Mudanças de banco exigem rollback SQL separado, nunca são revertidas automaticamente por rollback da Vercel.

Não registrar tokens, endereços de clientes, dados pessoais nem cargas completas de pagamentos nos logs.
