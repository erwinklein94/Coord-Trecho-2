# Se o site não mostrar dados do Supabase

1. No Supabase, abra **SQL Editor**.
2. Rode o arquivo `supabase/setup-completo-corrigido.sql` inteiro.
3. O resultado final precisa mostrar:

```text
limpeza | 133
obras   | 15
```

4. Também precisa mostrar seu usuário com `role = coordenacao`.
5. Depois suba os arquivos deste pacote no GitHub e abra o site com **Ctrl + F5**.

Se ainda aparecer 0 registros, confira se o site publicado está usando o mesmo projeto Supabase:

```text
https://nvfewxgtjenyawxyroqk.supabase.co
```
