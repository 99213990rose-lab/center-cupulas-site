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
| `CENTER_SHIPPING_VALIDATED` | `true` somente após conferência presencial de dimensões, peso, embalagem, transportadora e custos. Até lá, ausente ou `false`. |
| `CENTER_CHECKOUT_ENABLED` | `false` até homologação; `true` para liberar após testes |

O frete não usa mais CEP de origem presumido. Sem Frenet/token/CEP válido ou sem `CENTER_SHIPPING_VALIDATED=true` o pagamento fica bloqueado; os pedidos de orçamento continuam funcionando.

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

## Trava adicional de embalagem e frete — 16/10/2026
- A fábrica precisa confirmar as condições logísticas das embalagens padronizadas e o peso de expedição, não apenas o peso volumétrico estimado.
- O endpoint `/api/frete` informa `calibration:true` até aprovação expressa via `CENTER_SHIPPING_VALIDATED=true`.
- `GET /api/mercadopago/status`, a criação de preferência e a Edge Function `public-cart-checkout` (v6) recusam cobrar sem essa aprovação.
- `CENTER_SHIPPING_VALIDATED` **não foi ativado**; não presumir que os valores da Frenet estão homologados.
- São necessárias **duas** autorizações de produção, `CENTER_SHIPPING_VALIDATED=true` e `CENTER_CHECKOUT_ENABLED=true`, com nova publicação na Vercel após os testes.


## Orçamento interno de caixas por faixa — 16/10/2026

**Diretriz da Center Cúpulas:** não cadastrar medidas físicas de cada caixa nem depender de aprovação individual de embalagens para estimar seu custo de compra. A organização irá adquirir modelos padronizados.

- Pequena: **R$ 10** (faixa de aquisição informada: R$ 7–10).
- Média: **R$ 12** (faixa informada: R$ 11–12).
- Grande: **R$ 15**.
- Regra inicial **ajustável** por maior dimensão da própria cúpula: até **35 cm** pequena; até **65 cm** média; acima disso grande. Esses cortes **não** representam dimensões físicas de caixa nem homologação logística.
- Quantidade de volumes segue prévia de agrupamento; o custo é por **volume previsto**, não necessariamente por cúpula.
- Dados em `public.packaging_rules`: `box_small_cost_brl`, `box_medium_cost_brl`, `box_large_cost_brl`, `box_small_product_max_cm`, `box_medium_product_max_cm`.
- Orçamentos novos registram `quotes.shipping.box_purchase_budget` com totais por categoria. A informação é **interna**; não é somada ao preço de venda nem à tarifa de transporte.
- Para modelos que exigem revisão, o custo fica `requires_review` em vez de assumir R$ 0.
- A integração real de frete ainda exige dados operacionais aceitos por uma transportadora. Custo de caixa não é valor de envio; o bloqueio de cobranças reais continua.
- A antiga implementação experimental de medições de caixas foi abandonada e **não deve ser publicada**.

**Exemplos:** uma caixa prevista para uma cúpula de 30 cm → R$ 10; 50 cm → R$ 12; 75 cm → R$ 15. A fábrica pode redefinir as faixas no banco quando padronizar suas compras.

## Política de preço com caixa embutida — atualização de 16/10/2026

**Decisão da Center Cúpulas:** o custo previsto de compra das caixas passa a integrar o preço das cúpulas. Não criar taxa, item adicional nem linha de embalagem cobrada à parte.

- Valores de custo internos em `packaging_rules`: **pequena R$ 10**, **média R$ 12**, **grande R$ 15**. São custos iniciais e podem ser atualizados.
- Classificação inicial por tamanho da cúpula (não medidas físicas das caixas): maior medida até **35 cm = pequena**; acima de 35 até **65 cm = média**; acima = grande.
- O sistema estima **quantos volumes** serão usados com a lógica existente de agrupamento e embute a soma do custo desses volumes nas linhas das cúpulas. Isso permite repartir uma caixa entre várias peças sem cobrar uma caixa inteira por unidade.
- **Desconto de volume** continua apenas sobre a parte de fabricação, preservando o valor incorporado das caixas. O catálogo e o carrinho usam o mesmo módulo de cálculo (`price-with-box.mjs`). Os textos comerciais explicam o desconto sobre fabricação.
- O `subtotal_before_discount`, `product_total` e os `line_total` já incluem o orçamento das caixas; o `finalTotal` adiciona **somente frete da transportadora** a esse total de produtos.
- Informações de custo de embalagem permanecem **internas** em `quotes.shipping.box_purchase_budget` com `included_in_products: true`. Os clientes veem a informação "embalagem incluída" e não uma cobrança separada.
- Regras de preço base da fábrica (`pricing_reference_prices`) **não foram alteradas**, assim como cotações já registradas anteriormente.
- O novo orçamento exige classificação válida; formatos/volumes não estimáveis retornam para avaliação manual, nunca custo R$ 0 presumido.
- Custos das caixas **não substituem o frete**: cotação com transportadora permanece pendente. `CENTER_CHECKOUT_ENABLED=false` continua em produção até homologação.

## Frenet como transportadora principal — 16/10/2026

**Decisão:** usar a Frenet para obter opções de transporte; preços de caixas pequenas/médias/grandes (R$ 10/R$ 12/R$ 15) **continuam incluídos nos preços das cúpulas**. Não somar esses custos ao frete nem apresentar uma linha extra de embalagem.

### Configuração que falta na conta
1. Acessar o painel Frenet usando a conta da empresa e habilitar os serviços/transportadoras desejados.
2. Consultar o **API Token** em Dados Cadastrais → Chaves de Acesso, conforme a Central de Ajuda Frenet. Configurar o token **somente na variável secreta** `FRENET_TOKEN` da Vercel (Production). Não colocar token no GitHub, WhatsApp ou mensagens.
3. Conferir o CEP real de origem já configurado como `CENTER_CUPULAS_ORIGIN_CEP`; a operação deve confirmar que a postagem/coleta efetiva ocorre nesse CEP.
4. Revisar as estimativas logísticas de cubagem e peso fornecidas à Frenet. **Custos padronizados de compra das caixas não substituem dimensões e peso exigidos pela transportadora.** O site não pede medição física individual a cada pedido; a fábrica precisa confirmar apenas as condições práticas das embalagens padronizadas utilizadas, para evitar cobrar frete menor do que o real.
5. Cotar vários CEPs e modelos, incluindo pedidos com múltiplos volumes, regiões distantes, serviço indisponível e tamanho acima do aceito. Conferir o preço efetivo de etiqueta/coleta e eventuais acréscimos antes da liberação.
6. Somente quando as cotações forem consideradas confiáveis, autorizar `CENTER_SHIPPING_VALIDATED=true`. Em etapa **separada**, homologar um pagamento real e autorizar `CENTER_CHECKOUT_ENABLED=true`. Nunca ativar ambas as flags apenas por ter criado o token.

### Segurança e experiência
- A API `/api/frete` consulta a Frenet diretamente com token secreto no servidor; o visitante não recebe a credencial.
- Serviços com erros, preços nulos, respostas malformadas e códigos duplicados/ambíguos não ficam disponíveis para compra.
- Durante a fase de calibração/homologação, a interface **não exibe tarifas provisórias como opções selecionáveis**. O cliente segue recebendo orçamento manual, sem cobrança automática.
- Não existe cobrança de embalagem em separado. `CENTER_CHECKOUT_ENABLED` permanece `false` até a homologação completa.
- A referência oficial da API é `https://docs.frenet.com.br/reference/calculateshippingquote` e a obtenção do token é explicada em `https://ajuda.frenet.com.br/knowledge-base/api-frenet`.

### Verificação
Executar `node --test test/frenet-options.test.mjs test/freight.test.mjs` e a suíte de checkout. Não fazer chamadas com o token real em testes automatizados públicos.
