# Configuração de código por e-mail — Center Cúpulas

**IMPORTANTE:** guardar este arquivo no GitHub não altera automaticamente os e-mails do Supabase hospedado. É necessário configurar no painel de autenticação do projeto `nygjkojgvbdhemvfsqug`.

1. Acesse https://supabase.com/dashboard/project/nygjkojgvbdhemvfsqug/auth/templates .
2. Em **Magic Link**, use o assunto `Seu código de acesso | Center Cúpulas` e copie o conteúdo de `supabase/templates/customer-email-otp.html` para o corpo HTML.
3. Em **Confirm signup** (confirmação de cadastro), aplique o **mesmo HTML** para que novos usuários também recebam `{{ .Token }}` e não somente um link.
4. Em Auth > URL Configuration, configure **Site URL** como `https://www.centercupulas.com.br` e permita o Redirect URL `https://www.centercupulas.com.br/meus-pedidos.html`.
5. Salve. O Supabase continuará criando/verificando os códigos; o site usa `signInWithOtp` e `verifyOtp`. Não crie código aleatório no navegador.
6. Para envio em escala/produção, configure um serviço SMTP próprio e revise limites/rate limiting; o remetente padrão do Supabase pode ser limitado.

## Segurança
- Nunca usar service role no navegador.
- Não armazenar códigos ou senhas no banco de pedidos.
- Não mostrar emails completos, dados do provedor ou segredos em URLs públicas.
- Compra como visitante permanece disponível.
- A rota `/api/account/orders` só aceita sessão válida + e-mail confirmado.

## Verificação sem pagar
Solicite um código ao seu próprio e-mail, abra o e-mail, confira que contém seis dígitos, digite no site e veja se consegue entrar; não precisa fazer pedido nem Pix.
