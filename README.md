# Restaurante — MVP

Sistema white label para restaurantes (espetinhos, hamburguerias): painel do dono e do caixa,
app do garçom (PWA) e site de delivery, com vários restaurantes no mesmo banco.

- Contexto e regras do projeto: `CLAUDE.md`
- Plano de construção: `ROTEIRO.md`
- **Deploy (Coolify/Hostinger) e checklist de produção: `docs/deploy.md`**
- Supabase existente no projeto temporário: `docs/supabase-existente.md`

## Áreas

| Rota | Quem usa |
|---|---|
| `/login` | equipe |
| `/painel` | dono e caixa: caixa, comandas, delivery, cadastros |
| `/garcom` | garçom (PWA, mobile) |
| `/<slug>` | clientes: cardápio, carrinho e acompanhamento do pedido |

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
- `node --env-file=.env.local scripts/criar-restaurante.mjs ...` — cria um restaurante com a conta do dono

## Banco local (Docker)

```bash
npx supabase start          # sobe o Supabase local e aplica migrações + seed
npm run db:test:local       # testes de isolamento entre restaurantes e regras de negócio
npm run db:reset:local      # recria o banco local do zero
npm run db:types:local      # regenera src/types/database.ts
npm run dev:local           # app apontando para o Supabase local (inclui a chave secreta local)
```

Usuários do seed (só desenvolvimento): `dono.brasa@exemplo.com`, `caixa.brasa@exemplo.com`,
`garcom1.brasa@exemplo.com`, ... (veja `supabase/seed.sql`). Senha: `senha123`.
Em produção, desative-os com `supabase/scripts/desativar-seed.sql`.
