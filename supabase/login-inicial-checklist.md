# Checklist para resolver login inicial

## Se o e-mail abre localhost:3000

No Supabase, vá em **Authentication → URL Configuration** e configure:

```text
Site URL:
https://erwinklein1994.github.io/Coord-Trecho-2/

Redirect URLs / Additional Redirect URLs:
https://erwinklein1994.github.io/Coord-Trecho-2/
https://erwinklein1994.github.io/Coord-Trecho-2/**
```

Salve e gere um novo e-mail de confirmação. O e-mail antigo não muda.

## Se aparece email rate limit exceeded

O Supabase bloqueou novos e-mails temporariamente. Para continuar sem esperar, crie o usuário manualmente em **Authentication → Users** e marque a opção de confirmar/auto-confirmar o usuário, se estiver disponível. Depois use o SQL de promoção para Coordenação.

## Passo a passo normal

1. Rode `schema-and-seed.sql` no SQL Editor do Supabase.
2. Abra o site, preencha e-mail e senha com pelo menos 6 caracteres.
3. Clique em **Criar acesso / primeiro acesso**.
4. Confirme o e-mail se o Supabase exigir.
5. Clique em **Entrar**.
6. Promova o usuário para Coordenação:

```sql
update public.profiles
set role = 'coordenacao'
where email = 'SEU_EMAIL_CORPORATIVO@empresa.com';
```

Se o usuário foi criado no painel Auth manualmente e não apareceu em `public.profiles`, rode:

```sql
insert into public.profiles (user_id, nome, email, role)
select id, coalesce(raw_user_meta_data->>'nome', email), email, 'coordenacao'
from auth.users
where email = 'SEU_EMAIL_CORPORATIVO@empresa.com'
on conflict (user_id) do update
set role = 'coordenacao', email = excluded.email, nome = excluded.nome;
```
