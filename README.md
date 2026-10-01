# Restaurante — MVP

Contexto do projeto em `CLAUDE.md` e plano em `ROTEIRO.md`.

## Rodar localmente

```bash
cp .env.example .env.local   # preencher com as chaves do Supabase
npm install
npm run dev
```

## Scripts

- `npm run dev` / `npm run build` / `npm run lint` / `npm run typecheck`
- `npm run db:push` — aplica as migrações de `supabase/migrations` no projeto linkado
- `npm run db:types` — regenera `src/types/database.ts` (usa `SUPABASE_PROJECT_REF`)

## Banco local (Docker)

```bash
npx supabase start          # sobe o Supabase local e aplica migrações + seed
npm run db:test:local       # testes de isolamento entre restaurantes e regras de negócio
npm run db:reset:local      # recria o banco local do zero
npm run db:types:local      # regenera src/types/database.ts
npm run dev:local           # app apontando para o Supabase local (inclui a chave secreta local)
```

Usuários do seed: `dono.brasa@exemplo.com`, `caixa.brasa@exemplo.com`, `garcom1.brasa@exemplo.com`, ... (veja `supabase/seed.sql`). Senha: `senha123`.
