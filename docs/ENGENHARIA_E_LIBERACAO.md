# Center Cúpulas — padrão interno de engenharia e publicação

Esta política prioriza integridade financeira e continuidade operacional. O site público, seus preços e os pedidos existentes só podem ser modificados quando isso fizer parte explicitamente do escopo.

## Critérios para publicar

1. Toda mudança de backend deve nascer em branch própria e passar pelos testes de checkout e integridade. Não realizar alterações diretas em `main`.
2. Mudança de banco: preparar uma migration não destrutiva, aplicar antes de publicar código que depende da nova função e confirmar as permissões de `anon`, `authenticated` e `service_role`.
3. Para o plano Vercel Hobby, manter **no máximo 12 funções serverless**. O teste `vercel-function-budget.test.mjs` impede ultrapassar a cota.
4. Não publicar alteração no valor do carrinho, regra de descontos ou cálculo de frete sem um teste de regressão que comprove o valor real esperado.
5. Após cada merge: confirmar build `READY`, validar integridade do checkout e ausência de erros novos em runtime. Uma compilação bem-sucedida não prova o fluxo de pagamento.
6. A compra de homologação requer ambiente e credenciais de teste; **nunca usar clientes reais, enviar notificações antigas nem realizar cobranças reais** apenas para testar.

## Teste de fumaça da produção

`node scripts/production-smoke.mjs` efetua **somente GET**, sem credenciais:
- disponibilidade das três páginas críticas;
- disponibilidade e configuração pública do checkout Mercado Pago;
- recusa de acesso anônimo às rotas administrativas;
- recusa de GET em endpoints que só aceitam POST, como criação de pagamento e webhook.

Este teste é executado automaticamente pelo GitHub Actions no monitoramento diário. Falhas tornam o workflow vermelho; isso **não significa que um WhatsApp ou e-mail será enviado** automaticamente.

## Critérios de incidente

| Prioridade | Condição | Resposta da equipe |
| --- | --- | --- |
| P0 | Pagamento aprovado sem pedido, cobrança duplicada, divergência de valor | Interromper mudanças no checkout, confirmar lançamento no Mercado Pago e conciliar sem criar nova cobrança |
| P1 | Checkout indisponível ou auditoria privada inacessível | Conferir último deployment READY, segredos, Supabase e logs, sem mexer nos preços |
| P1 | Pedido pago com ficha incompleta | Confirmar encaixe por item com a fábrica; não atribuir valor padrão automaticamente |
| P2 | Aviso de e-mail pendente | Conferir outbox/provedor; não marcar `sent` sem aceitação real do provedor |
| P2 | Falta de rastreamento após postagem | Conferir etiqueta e código real da transportadora; registrar apenas em API autorizada |

## Proteção de branch no GitHub

O repositório ainda não possui a branch `main` protegida. Isso **não é resolvido** apenas por adicionar novos testes: a configuração deve ser efetivada em **Settings → Rules → Rulesets** (ou Branch protection) no próprio GitHub e validada no repositório.

Configuração recomendada:
- branch alvo `main`, impedir push direto;
- exigir PR e a aprovação dos testes `Checkout validation` e `Center Cupulas - Checkout Health`;
- impedir bypass comum; exigir resolução de conversas;
- permitir exceções administrativas apenas em incidentes documentados.

Confirmar que o plano do GitHub suporta a política desejada antes de ativar, e não aplicar regras que impeçam a correção urgente de produção.

## Próximas limitações de arquitetura

- A função pública do Supabase ainda possui um fluxo de preparação de cotação paga que necessita autenticação exclusiva entre Vercel e Supabase, separada das requisições anônimas de prévia.
- Falta ambiente de homologação isolado do banco e das credenciais financeiras reais.
- Faltam testes integrados de ponta a ponta do Mercado Pago em ambiente de teste e testes de carga/retry com conexões interrompidas.
- Alertas reais de notificações requerem um provedor autenticado e remetente/domínio verificado. Não inferir que histórico de incidentes equivale a entrega de alertas.
- A especificação de encaixe ainda exige confirmação manual; nunca inventar a escolha em pedidos pagos.

Esses bloqueios são documentados para evitar a impressão de que a operação já é completamente autônoma.
