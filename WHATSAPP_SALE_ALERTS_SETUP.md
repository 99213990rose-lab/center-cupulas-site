# Alertas de novas vendas pelo WhatsApp — Center Cúpulas

O webhook assinado do Mercado Pago confirma o pagamento, cria o pedido e registra um alerta único no Supabase. A API oficial da Meta envia um template aprovado ao número particular do responsável (não ao comprador). O WhatsApp do celular mostra a notificação conforme as preferências do aparelho.

## Configuração escolhida (28/10/2026)
- Remetente **previsto**: WhatsApp comercial Center Cúpulas, +55 12 98321-6069.
- Destinatário das notificações: WhatsApp pessoal do responsável, +55 11 91954-8038.
- A Vercel guarda CENTER_SALE_ALERT_RECIPIENT e CENTER_SALE_ALERT_SENDER_CANDIDATE, mas o remetente ainda não foi validado na Meta.
- O WhatsApp pessoal fica **somente recebendo**, sem migração.
- Antes de vincular o número comercial, verificar se ele já usa o WhatsApp Business app; quando elegível usar a modalidade **Coexistence** da Meta, sem apagar nem desinstalar o app ou perder o atendimento.
- A conexão genérica de Meta existente no painel NÃO está comprovada como fluxo de Coexistence: não autorizar migração padrão sem esta confirmação.
- Depois da verificação, obter Phone Number ID real e token de envio autorizado do número 12; não substituir por ID do número de teste.

## Situação verificada 27/10/2026
O canal Meta encontrado no banco é "Meta test number", com registro de falha 403 (131005) na tentativa de envio. Isso não é prova de um remetente de produção funcional. As variáveis de envio de WhatsApp ainda não estão configuradas na Vercel do site.

## Etapas obrigatórias para ativar
1. Aplicar a migration supabase/migrations/20261027_center_sale_whatsapp_alerts.sql ao projeto Supabase Center nygjkojgvbdhemvfsqug (não ao projeto Métodos Digitais).
2. Validar um remetente na WhatsApp Business Platform Cloud API, com acesso válido para envio.
3. Submeter à Meta e obter aprovação de um template UTILIDADE pt_BR de corpo:
   Center Cúpulas: nova venda confirmada! Pedido {{1}}, valor {{2}}, quantidade de cúpulas {{3}}. Consulte o painel para produção.
4. Confirmar o número destinatário privado do responsável, diferente do remetente, no formato 55DDDNUMERO e que aceitou receber os avisos.
5. Configurar na Vercel, somente Production e somente no servidor:
   CENTER_SALE_ALERT_RECIPIENT=55DDDNUMERO
   CENTER_SALE_ALERT_TEMPLATE=nome_aprovado_exato
   META_WA_PHONE_NUMBER_ID=identificador_numerico_remetente
   META_WA_ACCESS_TOKEN=token_meta_valido
   META_GRAPH_API_VERSION=v25.0
   CENTER_SALE_ALERT_ENABLED=true
6. Verificar as variáveis existentes SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e CRON_SECRET; não revelar seus valores. Ativar CENTER_SALE_ALERT_ENABLED por último.
7. Implantar, testar com compra real autorizada ou fluxo de pagamento em ambiente de teste, e verificar envio, confirmação da Meta e recebimento real no aparelho.

## Operação
- Cada pagamento único aprovado cria somente um item da fila.
- O envio imediato ocorre no webhook, depois de o pagamento ter sido conciliado.
- O cron protegido /api/alerts/sale-whatsapp reprocessa falhas certas diariamente às 09h de Brasília (12:00 UTC).
- Se houver resultado de rede ambíguo, o aviso fica needs_review em vez de tentar enviar duas vezes.
- Status sent significa que a API Meta aceitou o envio; não comprova que o aparelho apresentou o banner.
- Garantir notificações permitidas no WhatsApp, conversa não silenciada e modo Não Perturbe desligado.
- Nenhum pagamento ou pedido anterior é reinserido automaticamente na fila (inclusive o teste de R$ 32,46).
- Sem as configurações completas, o recurso fica desligado e o checkout continua operando.
- Para desabilitar rapidamente: definir CENTER_SALE_ALERT_ENABLED=false e publicar novamente.
