# Corrigir confirmação de e-mail abrindo localhost:3000

Configure o redirecionamento no painel do Supabase:

1. Abra o projeto Supabase.
2. Vá em **Authentication → URL Configuration**.
3. Em **Site URL**, coloque:

```text
https://erwinklein1994.github.io/Coord-Trecho-2/
```

4. Em **Redirect URLs** ou **Additional Redirect URLs**, adicione:

```text
https://erwinklein1994.github.io/Coord-Trecho-2/
https://erwinklein1994.github.io/Coord-Trecho-2/**
```

5. Salve.
6. Gere um novo e-mail de confirmação.

Observação: e-mails já enviados continuam com o link antigo. Depois de salvar a configuração, clique novamente em **Criar acesso / primeiro acesso** ou crie o usuário manualmente em **Authentication → Users**.

Se aparecer `email rate limit exceeded`, aguarde o limite liberar ou configure um SMTP próprio no Supabase.
