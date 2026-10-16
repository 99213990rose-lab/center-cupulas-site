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

## Prévia de frete por média de transportadoras — decisão operacional de 16/10/2026

A Center Cúpulas prefere não exigir o peso medido individualmente em todos os pedidos. A equipe autorizou **usar média das tarifas cotadas pelas transportadoras como referência de orçamento**, sem convertê-la em tarifa final automática.

- Com origem `08265220`, destino informado e dimensões estimadas do pedido, `/api/frete` obtém as tarifas atuais dos serviços efetivamente oferecidos pela **Frenet** e devolve `indicative_estimate`: número de serviços, **média aritmética**, menor e maior preço.
- Essa é uma **média das ofertas da consulta atual**, não uma pesquisa genérica de mercado nem promessa de que qualquer serviço custará esse valor. Ex.: o serviço mais barato pode ter prazo e cobertura distintos do mais caro.
- Durante `calibration=true`, a interface apresenta a média e a faixa de valores apenas para orientação. **Não** cria opção de frete selecionável, **não** soma a média ao pedido pagável e **não** autoriza `CENTER_SHIPPING_VALIDATED=true` ou `CENTER_CHECKOUT_ENABLED=true`.
- O peso enviado no protótipo continua aproximado usando o volume; isso serve a cotações preliminares, **não** é medição física e será revisado quando houver dados representativos da fábrica. A Frenet pode recalcular cubagem pela transportadora e o custo final pode variar. Nunca apresentar o peso como real.
- Com ausência de ofertas, CEP sem cobertura ou falha do serviço, manter **frete sob consulta**. Para cúpulas grandes e várias caixas, confirmar custo e restrições manualmente.
- O custo de compra da embalagem (R$ 10/12/15) continua **embutido no preço das cúpulas**, sem cobrança em separado.
- Comprovantes de SEDEX da fábrica de 14/10/2026 são evidência histórica: R$ 64,12 em 28×37×39 cm e R$ 29,04 em 32×47×47 cm. Eles não devem ser usados para calcular média de qualquer destino sem CEP comparável.


## Compra direta com transportadora escolhida (16/10/2026)
A Center Cúpulas aceita o preço ao vivo da opção retornada pela Frenet mesmo com possível diferença futura na despesa de transporte. Não cobrar média: o cliente escolhe o serviço e vê o respectivo valor e o total com entrega.
- `CENTER_USE_LIVE_FRENET_RATES=true`: usa serviços disponíveis para o CEP; `CENTER_CHECKOUT_ENABLED=true`: libera Checkout Pro após testes.
- O servidor reconsulta a Frenet e reavalia produtos antes de criar a preferência de pagamento. Se o total mudou desde que o cliente viu, retorna HTTP 409 (`price_changed`), sem cobrar; o carrinho atualiza os preços.
- Sem cobertura, erro da Frenet ou embalagem acima dos limites, fica disponível o orçamento, nunca um frete inventado.
- A massa de cálculo do protótipo é estimada por volume e não uma pesagem real; a fábrica aceita o risco comercial.
- Os custos das caixas (R$10/12/15) seguem dentro das cúpulas, nunca incluídos novamente no frete.
- Notificações assinadas e conciliação idempotente são mantidas. `CENTER_SHIPPING_VALIDATED` antigo não é mais a autorização de tarifa; não confundir com validação física.


## Diagnóstico de falha na primeira passagem ao pagamento (16/10/2026)

- A captura de tela mostra falha após selecionar SEDEX R$ 23,64; Supabase registrou três orçamentos em `draft` com produtos R$ 47,23 + frete R$ 23,64 = R$ 70,87. `shipping.status=quoted`, `packaging.status=estimated`. **Nenhum pagamento foi registrado**.
- O navegador apresentava texto genérico sem distinguir falha de credencial, pendência cadastral ou erro na criação da preferência do Mercado Pago.
- `GET /api/mercadopago/status?diagnose=connection` executa **somente GET read-only** na API de métodos de pagamento do Mercado Pago e devolve categorias limitadas `authorized`, `unauthorized`, `rate_limited`, `provider_error`, `unavailable`; não retorna token, dados da conta ou método de pagamento.
- A criação de preferência classifica códigos conhecidos do MP, registra nos logs somente categoria e HTTP status sem dados de pagamento ou cliente e apresenta mensagem recuperável. A conta precisa corrigir eventual pendência de identidade/credencial no próprio Mercado Pago.
- Os orçamentos em draft de tentativas anteriores **não são pagamento e não se devem marcar como pagos**. Não gerar pagamentos fictícios na investigação.


### Leitura de conectividade aprofundada
Em teste GET read-only, `provider_connection=unavailable`: a função Vercel não obteve resposta HTTP do Mercado Pago. Adicionado `connection_issue` com categorias fechadas (DNS, timeout, reset, TLS), sem divulgar segredos ou mensagens brutas. Não atribuir automaticamente o problema ao token nem pedir troca de credenciais antes de classificar a conexão. Sem pagamento criado.


### Recuperação de conexão Mercado Pago — cliente HTTPS nativo
Os testes de conexão em produção mostraram `provider_connection=unavailable` e `connection_issue=request_failed` pelo `fetch` do Node na Vercel; o retorno ocorreu **antes de HTTP**, sem prova de erro de credencial. Adicionado transporte alternativo em `api/mercadopago/transport.cjs` com `node:https`, destinado **somente** a `https://api.mercadopago.com`, sem envio de token a outros hosts e com limite de tempo e tamanho de resposta.

- A consulta read-only aceita `?diagnose=native` para testar o transporte alternativo sem pedido, preferência ou pagamento.
- A preferência Checkout Pro tenta `fetch`; se houver falha de conexão, tenta uma vez o transporte nativo mantendo idempotency key, total e referência do orçamento.
- O webhook de confirmação também tem recuperação de transporte. Continua recusando assinaturas inválidas e conferindo dados por RPC atômica. Em indisponibilidade, retorna 503 para reentrega.
- Testes unitários validam o fallback e a restrição rígida de host. Não interpretar diagnóstico bem-sucedido como pagamento integral homologado até uma transação real verificada.
