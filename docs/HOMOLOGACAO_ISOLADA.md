# Homologação isolada e publicação segura — Center Cúpulas

## Estado verificado em 15/11/2026
- Existe somente um Supabase de produção usado pela loja: `nygjkojgvbdhemvfsqug`. Não há branch de homologação.
- O projeto Vercel tem configurações Preview que ainda mencionam o Supabase e provedor de pagamento usados em produção. **Preview de Vercel não equivale a homologação isolada**.
- O código agora bloqueia criação de preferências de checkout na Vercel Preview/Development independentemente de configuração, evitando tentativas de pagamentos reais a partir dessas publicações.
- A criação de branch Supabase exige confirmação prévia de custo; nenhuma branch foi criada.
- A branch GitHub `main` ainda precisa de Ruleset que realmente exija aprovação e checks antes de merge.

## Homologação de pagamentos (inativa até obter ambiente isolado)
1. Criar ambiente Supabase de staging **após aprovação explícita do custo**, sem copiar dados reais de clientes.
2. Apontar exclusivamente as configurações do Preview/staging Vercel para o banco separado e credenciais **de teste** do Mercado Pago e do serviço de frete.
3. Criar usuários e pedidos fictícios. Não enviar e-mails, WhatsApp nem webhooks aos clientes reais.
4. Configurar URL e segredo de webhook próprios de homologação; usar exclusivamente provedores de sandbox.
5. Validar: carrinho → frete → preferência → webhook assinado → pedido único → ficha de produção, incluindo duplicação, falha de provedor, timeout, reembolso simulado e acesso negado de usuário não autorizado.
6. Rever permissões RLS/anon/authenticated/service_role e executar advisers de segurança.
7. Realizar publicação por PR revisado + CI verde; registrar evidências. Nunca misturar credenciais das duas operações.

## Proteção da branch principal (configuração GitHub pendente)
Em GitHub Settings → Rules → Rulesets (ou Branch protection):
- Escopo: `main`; exigir PR e impedir push direto.
- Exigir os checks `checkout-tests` e `checkout-regressions` (nomes reais dos jobs existentes).
- Exigir resolução de conversas, branch atualizada e uma revisão quando houver outro colaborador autorizado.
- Nunca permitir mesclar PR de banco/checkout antes da homologação; garantir opção documentada de correção de incidentes.
- Após configurar, verificar na UI se uma alteração sem CI verde está realmente bloqueada; somente adicionar documentação/CI não cria proteção no GitHub.

## Operação / jornada do pedido
A nova aba **Operação** no SalesOps exibe projeção apenas de leitura dos registros já existentes no banco:
- Pagamento pendente ou parcial — sem supor venda aprovada.
- Pago sem ficha de produção — pendência de reconciliação.
- Na fila, em fabricação, produção pronta/concluída.
- Código de rastreio registrado — **não equivale a entrega confirmada**.

Os dados continuam sob a autenticação e RLS existentes do SalesOps; o painel não muda status, pagamento, valores, frete ou encaixes. Atualização manual por botão ou novo carregamento. Etapas finais como transportadora em trânsito e entregue requerem integração com evento verificado do transportador, ainda pendente.

## Regras de rollout
- Este PR não altera preços, Mercado Pago de produção, Supabase de produção ou usuários.
- Rejeitar alterações se os testes falharem. Não publicar recursos que dependam de ambiente pago não criado.
- É necessário validar visualmente o novo painel com conta autorizada, depois de CI verde, antes de produção.
