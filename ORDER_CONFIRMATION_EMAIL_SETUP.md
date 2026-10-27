# Confirmação automática de pedidos pagos

Implementação de e-mail transacional para as compras aprovadas pelo Mercado Pago, sem mudar as regras atuais de pagamento ou frete.

## Estado e pré-requisitos para ativação

- A conciliação do Mercado Pago continua sendo a única forma de confirmar um pagamento. O navegador nunca dispara e-mail nem confirma pagamento.
- **Antes de liberar**, aplicar a migração `supabase/migrations/20261027_center_order_email_outbox.sql` no Supabase da Center Cúpulas.
- Criar uma conta no provedor de e-mails Resend e **verificar um domínio remetente** (DNS SPF/DKIM indicado pelo provedor); endereço sugerido: `Center Cúpulas <pedidos@centercupulas.com.br>`, **somente se o domínio estiver verificado**.
- Definir as variáveis secretas da Vercel em **Production**, sem copiar valores para o GitHub:
  - `RESEND_API_KEY`: chave restrita a envio de e-mails, obtida no painel do provedor.
  - `CENTER_ORDER_EMAIL_FROM`: remetente do domínio verificado.
  - `CRON_SECRET`: segredo aleatório, forte e único (mínimo 16 caracteres).
- O Cron Vercel dispara `GET /api/internal/order-email-cron` diariamente às 12h15 UTC como recuperação. O webhook tenta enviar imediatamente após a conciliação.
- Se essas variáveis não estiverem configuradas, o pagamento segue normal, mas nenhum e-mail será enviado.
- O histórico antigo **não é enfileirado automaticamente**, evitando confirmações tardias de compras antigas.

## Como funciona

1. O webhook assinado valida o pagamento e chama a função atômica `confirm_center_checkout_payment` existente.
2. O gatilho no banco cria uma entrada na fila somente para pedidos pagos do checkout que informaram e-mail.
3. O servidor reserva a notificação e envia ao e-mail do cliente via HTTPS para o provedor, com `Idempotency-Key` por pedido.
4. A entrega bem-sucedida grava `status='sent'` e o identificador do provedor; falhas permanecem para reenvio seguro.
5. O e-mail contém código, valor pago, itens e link de acesso à área Meus Pedidos. Não promete prazo de fabricação: a data é definida pela equipe. O prazo da transportadora conta **após postagem**.
6. A página Meus Pedidos exige autenticação por e-mail verificado e mostra somente compras feitas com aquele endereço.

## Consultas operacionais privadas

```sql
select o.code, n.status, n.attempts, n.last_error_code, n.sent_at
from public.center_order_email_outbox n
join public.orders o on o.id=n.order_id
order by n.created_at desc limit 30;
```

`status='sent'` significa que o provedor **aceitou a solicitação**; não comprova chegada à caixa de entrada. Para entregabilidade, conferir o painel do provedor.

## Verificação sem cobrança

- `node --test test/order-email.test.mjs test/checkout.test.mjs test/customer-account.test.mjs`
- Confirmar autenticação do Cron (401 sem token, 200 com credenciais habilitadas).
- Com remetente verificado, criar uma notificação de teste para um pedido pago **de teste e e-mail sob controle da equipe**, nunca inventar pagamento real nem reenviar para clientes antigos sem decisão explícita.
- Conferir no painel do provedor o envio do teste e a atualização da fila para `sent`.
- Só publicar depois de verificar os testes e as variáveis necessárias.

## Cuidado com notificações duplicadas

- A fila usa `order_id` como chave primária: reentregas do webhook não geram novo registro.
- A API de e-mail recebe chave de idempotência estável por pedido. O provedor mantém uma janela de idempotência limitada (atualmente 24h); por isso conferir notificações com status `retry` e `skipped`.
- Para um pedido já pago e antigo, uma confirmação manual não precisa gerar nova compra ou segunda cobrança.
