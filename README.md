# Trecho 2 — Dashboard PDM Infraestrutura com Supabase

Site estático pronto para GitHub Pages, agora integrado ao **Supabase** para banco de dados, autenticação, perfis de acesso e auditoria.

## O que mudou

- A importação local de Excel foi removida do site.
- A planilha `1. UNIFILAR T2 DR (1).xlsx` foi convertida para carga inicial no arquivo `supabase/schema-and-seed.sql`.
- Os dados são lidos das tabelas `public.limpeza` e `public.obras` no Supabase.
- A manutenção dos dados é feita pela aba **Gestão**, conforme o perfil do usuário.
- A aba **Auditoria** fica disponível somente para o perfil **Coordenação** e também permite ajustar o perfil dos usuários.

## Perfis de acesso

| Perfil | Visualiza | Adiciona | Edita | Exclui | Auditoria |
|---|---:|---:|---:|---:|---:|
| Coordenação | Sim | Sim | Sim | Sim | Sim |
| Analista | Sim | Sim | Sim | Sim | Não |
| Fiscalização | Sim | Não | Não | Não | Não |

## Como configurar no Supabase

1. Abra o projeto Supabase.
2. Vá em **SQL Editor**.
3. Cole e execute todo o conteúdo do arquivo:

```text
supabase/schema-and-seed.sql
```

Esse script cria:

- `public.profiles`
- `public.limpeza`
- `public.obras`
- `public.audit_logs`
- funções de perfil/permissão
- políticas RLS
- gatilhos de auditoria
- carga inicial com 133 registros de limpeza e 15 obras da planilha anexada

4. A chave **anon/public** já está configurada em `script.js`.

> A URL do projeto já está configurada como `https://nvfewxgtjenyawxyroqk.supabase.co`.

## Configuração obrigatória do link de confirmação

Se o e-mail de confirmação abrir `localhost:3000`, o problema está na configuração de Auth do Supabase, não no GitHub Pages.

No Supabase, vá em **Authentication → URL Configuration** e configure:

```text
Site URL:
https://erwinklein1994.github.io/Coord-Trecho-2/

Redirect URLs / Additional Redirect URLs:
https://erwinklein1994.github.io/Coord-Trecho-2/
https://erwinklein1994.github.io/Coord-Trecho-2/**
```

Depois salve, publique este ZIP no GitHub Pages e gere um novo e-mail de confirmação. E-mails antigos continuarão apontando para o endereço antigo.

O `script.js` também envia `emailRedirectTo` automaticamente para a URL onde o site estiver aberto, mantendo o caminho `/Coord-Trecho-2/` do GitHub Pages.



## Login inicial: passo a passo

1. Antes de tentar entrar, rode `supabase/schema-and-seed.sql` no **SQL Editor**.
2. No site, preencha e-mail e senha. A senha precisa ter pelo menos 6 caracteres.
3. Clique em **Criar acesso / primeiro acesso**.
4. Se o Supabase enviar confirmação por e-mail, confirme o cadastro no link recebido. Enquanto o e-mail não for confirmado, o botão **Entrar** pode retornar erro de credenciais ou e-mail não confirmado.
5. Depois do cadastro confirmado, clique em **Entrar**.
6. Promova o primeiro usuário para Coordenação no SQL Editor:

```sql
update public.profiles
set role = 'coordenacao'
where email = 'SEU_EMAIL_CORPORATIVO@empresa.com';
```

### Erros comuns no primeiro login

- **Invalid login credentials**: o usuário ainda não foi criado, a senha está incorreta ou o e-mail ainda não foi confirmado. Use **Criar acesso / primeiro acesso** antes de **Entrar**.
- **Email not confirmed**: confirme o cadastro no e-mail enviado pelo Supabase ou desative confirmação obrigatória no painel de Auth do Supabase.
- **relation public.profiles does not exist**: o arquivo `supabase/schema-and-seed.sql` ainda não foi executado.
- **Signup disabled**: o cadastro público por e-mail está desativado no Supabase; ative no painel de Auth ou crie o usuário manualmente.

## Primeiro acesso de Coordenação

Depois que o primeiro usuário criar acesso ou entrar no site, promova esse usuário para Coordenação no **SQL Editor**:

```sql
update public.profiles
set role = 'coordenacao'
where email = 'SEU_EMAIL_CORPORATIVO@empresa.com';
```

A partir daí, esse perfil poderá acessar a auditoria, administrar dados e alterar perfis dos demais usuários pela aba **Auditoria**.

## Como usar

1. Publique o site no GitHub Pages ou abra localmente em um servidor estático.
2. Entre com e-mail e senha.
3. Use as abas:
   - **Visão geral** para KPIs.
   - **Limpeza Geral** para consulta e edição por equipamento, se permitido.
   - **Obras** para consulta e edição por obra, se permitido.
   - **Gestão** para adicionar/editar/excluir dados, disponível para Coordenação e Analista.
   - **Auditoria** para Coordenação ver quem alterou dados e gerenciar perfis de usuários.
   - **Banco de dados** para status e matriz de permissões.

## Arquivos principais

```text
index.html
styles.css
script.js
supabase/schema-and-seed.sql
tools/generate_supabase_seed.py
data/seed-preview.json
```

## Observações importantes

- O frontend usa a chave `anon/public`, que pode ficar no navegador. A proteção real está nas políticas RLS do Supabase.
- O usuário de Fiscalização consegue apenas consultar dados.
- O usuário de Analista consegue manter dados, mas não vê auditoria.
- O usuário de Coordenação consegue manter dados e visualizar auditoria.
- Se quiser que Analista não possa adicionar registros, altere a política `can_write_pdm()` e esconda os botões de criação na aba Gestão.
