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
