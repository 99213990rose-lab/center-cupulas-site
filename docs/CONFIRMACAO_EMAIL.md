# Center Cúpulas — ativação segura do envio de confirmações

Este serviço é **somente de envio de recibos por e-mail de pedidos online pagos**, sem alterações de preço, frete, checkout ou aparência. O webhook do Mercado Pago mantém prioridade sobre a notificação: um e-mail jamais confirma pagamento.

## Estado atual

- A tabela privada `center_order_email_outbox` e o gatilho para novos pedidos pagos já existem no banco.
- O worker `api/internal/order-email-cron.js` foi preparado, mas **o envio fica desabilitado até a ativação consciente**.
- Existe histórico com quatro avisos pendentes, anteriores ao início do worker. Eles **não serão enviados automaticamente**.
- O worker é acionado por cron diário, não envia imediatamente após o pagamento. Confirmar essa limitação com a operação antes de anunciar confirmações instantâneas.

## Configuração no Vercel Production

Estas quatro variáveis são obrigatórias. Não colocar valores no repositório ou em tickets:

- `CENTER_ORDER_EMAIL_ENABLED=true` — libera o worker somente após validação do domínio, teste e aprovação do remetente.
- `RESEND_API_KEY` — chave de envio do provedor Resend. Usar permissão mínima e não registrar o valor em logs.
- `CENTER_ORDER_EMAIL_FROM` — remetente válido no domínio verificado, como `Center Cúpulas <pedidos@centercupulas.com.br>`, **apenas se o domínio estiver realmente autorizado**.
- `CENTER_ORDER_EMAIL_NOT_BEFORE` — ISO 8601 em UTC, o instante a partir do qual os pedidos novos podem ser notificados. **Definir na ativação**, para impedir envios tardios do histórico.

`CRON_SECRET` e credenciais Supabase service_role devem continuar privadas e já pertencem à infraestrutura de backend.

## Prevenção de duplicatas

- Uma entrada na fila por `order_id`. O worker reserva o registro antes de enviar.
- O provedor recebe um cabeçalho `Idempotency-Key` estável para cada pedido.
- Mensagens `sending` só são recuperadas automaticamente quando ainda estão dentro da janela conservadora de idempotência de 23 horas; tentativas antigas ficam para revisão humana.
- As mensagens nunca são enviadas se não existir um e-mail no snapshot original do checkout; jamais inferir a partir do telefone/CRM.
- Recibos `sent` significam resposta aceita pelo provedor, **não prova de entrega na caixa de entrada**.
- Limite automático de três tentativas; erros permanecem registrados sem dados pessoais no log.

## Ativação e validação

1. Validar SPF/DKIM no provedor de e-mails e confirmar que o domínio pode enviar.
2. Usar uma compra de homologação controlada com endereço da equipe, nunca reenviar um lote antigo.
3. Configurar as variáveis e a marca temporal `CENTER_ORDER_EMAIL_NOT_BEFORE` somente após esse teste.
4. Conferir o cron, a fila `center_order_email_outbox` e o painel do provedor.
5. Se ocorrer atraso, revisar estados `retry`, `sending` e `skipped` antes de agir; nunca alterar o banco para fingir que mensagens foram enviadas.

**Próxima evolução**: notificações perto de tempo real por fila assíncrona e alertas internos via WhatsApp Business oficial, após configuração dos provedores. A publicação deste código, sozinha, não ativa essas integrações.
