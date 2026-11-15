## Objetivo comercial
- [ ] Explica qual problema da operação esta mudança resolve.

## Segurança e integridade
- [ ] Não mudou preço, frete, descontos ou status de pagamento sem teste de regressão.
- [ ] Não usa dados reais de clientes em testes.
- [ ] Banco e ambientes isolados; nenhuma credencial de produção no Preview.
- [ ] Permissões / RLS e rotas privadas revisadas.
- [ ] GitHub Actions `checkout-tests` e `checkout-regressions` verdes.
- [ ] Plano de rollback e verificação depois da publicação definidos.

> Este checklist não substitui o Ruleset de proteção de `main` no GitHub.
