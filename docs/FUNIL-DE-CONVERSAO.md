# Funil de conversão — Center Cúpulas

Início do monitoramento: 19/10/2026. Sem iniciar cobrança de teste e sem alterar pedidos reais.

## Diagnóstico inicial (Supabase)

Dados de 05 a 16/10/2026 na tabela `crm_web_events`: 96 eventos no total: 40 `page_view` (40 sessões distintas) e 56 `contact_click`; 53 desses cliques eram do download do catálogo, **não** pedidos ou vendas. Nenhum estágio de compra foi registrado. Diagnóstico da causa: a Edge Function `center-web-event` aceitava apenas `page_view`, `whatsapp_click`, `configurator_submit`, `contact_click`, embora o frontend já emitisse `pricing_estimate_view`, `cart_add`, `cart_checkout_started` e `cart_checkout_submitted`. Essas requisições recebiam `invalid_event_type` (400).

## Etapas medidas, mediante consentimento de analytics

1. `page_view`: visita à página; **não** é usuário único global.
2. `configurator_started` e `configurator_step_completed`: interação e progresso no formulário.
3. `pricing_estimate_view`: preço visível na última etapa.
4. `cart_add` e `cart_view`: inclusão e acesso ao carrinho.
5. `shipping_option_selected`: seleção de frete calculado.
6. `checkout_attempt`: envio do formulário válido; **não** é pagamento iniciado nem venda.
7. `cart_checkout_started`: URL válida do Mercado Pago obtida, antes de redirecionar; **não** indica pagamento aprovado.
8. `checkout_error`: falha na preparação do pagamento; sem detalhes pessoais.
9. **Venda aprovada, fonte única da verdade:** pagamento com `reconciliation_status='applied'` na tabela `center_checkout_payments`, reconciliado ao pedido e à produção. Não calcular vendas por eventos do navegador.

## Regras de interpretação

- Sessões/eventos só são contados quando a pessoa consente com analytics. Não generalizar conversão para todos os visitantes.
- `contact_click` de download de catálogo não é lead nem venda; separar por `placement`.
- Não usar dados pessoais (nome, WhatsApp, e-mail, CEP, endereço, observações) nos eventos.
- Eventos podem ser bloqueados por rede, redirecionamento, navegador ou consentimento; consultar também dados do carrinho no back-end e pagamentos reais.
- Não tirar conclusões estatísticas de A/B com amostras pequenas. Priorizar correções de defeitos verificáveis; comparar etapas após volume suficiente.

## Próxima revisão

Após tráfego real, comparar contagens e sessões por etapa, localizar maior perda, analisar em mobile e desktop **quando existir medição confiável por dispositivo**, criar uma hipótese por mudança e verificar vendas pagas. Não alterar token, Frenet, webhook ou confirmação automática de pagamento por causa desta tarefa.

SQL de acompanhamento (somente leitura):

```sql
SELECT event_type, page, count(*) AS eventos, count(DISTINCT session_id) AS sessoes
FROM public.crm_web_events
WHERE organization_id='e3cb8002-ebaa-4d3a-acd3-46a678815e7b'
  AND occurred_at >= now() - interval '14 days'
GROUP BY event_type, page
ORDER BY eventos DESC;
```
