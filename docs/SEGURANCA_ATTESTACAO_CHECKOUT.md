# Center Cúpulas — proteção da preparação de pagamento

Esta arquitetura não muda preços, frete, aparência do carrinho, promoções nem a forma de cobrança. Os compradores continuam usando o Checkout Pro do Mercado Pago. A mudança protege exclusivamente o caminho **servidor Vercel → função pública de cotação do Supabase**.

## Risco corrigido

Atualmente a função pública `public-cart-checkout` atende `preview`, `submit` e `payment`. Como chamadas HTTP e cabeçalhos `Origin` podem ser reproduzidos fora de um navegador, um agente externo poderia chamar diretamente `action: payment` e produzir cotações preparatórias sem passar pela API própria de checkout da Vercel. Os cálculos de preço e frete ainda são validados, mas a autorização da operação estava incompleta.

## Como funciona o protocolo de autorização

1. O navegador solicita pagamento à API da Vercel, como antes.
2. A Vercel valida o pedido e monta o corpo JSON usado na preparação da cotação.
3. A Vercel calcula o SHA-256 do **corpo HTTP exato** e pede ao PostgreSQL, como `service_role`, um token UUID aleatório, com validade de 120 segundos.
4. Somente a Vercel encaminha o token no cabeçalho `x-center-checkout-attestation` para a Edge Function.
5. **Antes de consultar preço, cotar frete ou criar CRM/cotação**, a Edge Function calcula o mesmo SHA-256 e consome o token em uma atualização atômica no banco.
6. Token ausente, inválido, expirado, reutilizado ou emitido para outro payload é recusado. A mesma tentativa de compra pode ser refeita: a Vercel emite outro token, enquanto a idempotência de cotação existente evita preparar um pedido duplicado.
7. `preview` e o fluxo manual `submit` permanecem disponíveis para os usos já existentes; autenticação por token só é obrigatória para `payment`.

Os tokens não vão para o navegador, URL de pagamento ou logs. O banco armazena apenas o hash do payload, nunca o endereço, telefone ou conteúdo do carrinho nesse mecanismo.

## Ordem de implantação OBRIGATÓRIA

1. Executar `20261113_checkout_server_attestation.sql` e verificar que `anon` e `authenticated` **não** podem emitir/consumir tokens, enquanto `service_role` pode.
2. Validar CI, testes de payload alterado, replay e expiração. Executar testes apenas com respostas simuladas; nenhum pagamento real é necessário.
3. Integrar o código da Vercel primeiro, confirmar deployment `READY` e que o RPC `center_issue_checkout_attestation` está respondendo. **A versão antiga da Edge ainda ignora o cabeçalho extra**, portanto o checkout permanece compatível durante esta etapa.
4. Só então publicar a nova versão da Edge Function com o helper `checkout-attestation.mjs` e `verify_jwt=false` (a autorização do pagamento é verificada dentro da função; o preview continua público).
5. Após publicação, conferir recusa imediata de uma chamada `action=payment` sem token e comprovar via teste controlado que uma preparação emitida pela Vercel continua funcionando. Não interpretar apenas `checkout_enabled=true` como prova do fluxo completo.
6. Se ocorrer falha, **reimplantar primeiro a versão anterior da Edge**, liberando a rota anterior sem criar cobrança/duplicação; revisar o erro antes de tentar novamente. A migration da tabela pode permanecer, pois não altera pedidos existentes.

## Cobertura de segurança

- **Mitiga:** chamadas públicas diretas ao caminho de preparo de pagamento, replay de tokens e adulteração do corpo entre Vercel e Supabase.
- **Não resolve:** volume abusivo de chamadas à API pública da própria Vercel, tentativas de spam no fluxo manual, problemas de entrega de e-mail, pagamentos ainda não reconciliados, nem a ausência de uma homologação isolada.
- Todos os valores de compra continuam sendo recalculados no backend. O token **não prova que houve pagamento**: somente o webhook assinado e a conciliação financeira podem confirmar isso.

Este rollout exige verificação cuidadosa: adicionar um cabeçalho e um RPC não constitui garantia suficiente de que o checkout de produção permaneceu funcional.
