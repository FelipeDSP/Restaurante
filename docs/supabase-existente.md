# Supabase existente (projeto temporário)

Inspeção feita em 2026-10-01, somente leitura, antes da primeira migração deste sistema.

- Projeto: `formacao-salmistas` — ref `uzhpxwgkchccckaoshfh`
- Região: `sa-east-1` (São Paulo) · Postgres 17.6
- Outro projeto na mesma organização (não usado): `Boteco ACIA` — ref `fsuomzzniervtkibtjbn`

## O que já existe (NÃO ALTERAR)

### Tabelas (`public`)

| Tabela | Linhas | RLS | Observação |
|---|---|---|---|
| `inscricoes_salmistas` | 0 | ativada, **sem policies** | Inscrições — Formação para Salmistas 26-27/09/2026 |

Colunas de `inscricoes_salmistas`: `id bigint generated always as identity`, `created_at timestamptz default now()`, `nome_completo text`, `data_nascimento date`, `telefone text`, `comunidades text`, `tempo_ministerio text` (todas `not null`).

Grants: `anon` e `authenticated` têm todos os privilégios padrão do Supabase, mas, como a RLS está ativa sem policies, nenhum dos dois consegue ler ou gravar (só `service_role`).

### Migrações registradas

| Versão | Nome |
|---|---|
| `20260916150254` | `create_inscricoes_salmistas` |

Atenção: essa migração existe no histórico remoto (`supabase_migrations.schema_migrations`), mas não em `supabase/migrations/` deste repositório. Antes do `supabase db push`, marcar como já aplicada no histórico local ou usar `supabase migration repair` só para ela, sem recriar nada.

### Funções, views, tipos e sequências em `public`

Nenhuma (além do tipo de linha da própria tabela).

### Triggers

- `auth.users`: **nenhum trigger**. Criar usuários deste sistema não dispara nada do outro sistema.
- `public`: nenhum.
- `storage`: apenas os triggers internos do Supabase (`update_objects_updated_at`, `protect_*`, `enforce_bucket_name_length_trigger`).

### Policies

Nenhuma em `public` nem em `storage`.

### Storage

Nenhum bucket. Os buckets deste sistema serão `rest-logos` e `rest-produtos`.

### Auth

0 usuários em `auth.users`.

### Realtime

Publicação `supabase_realtime` vazia.

### Extensões instaladas

`pgcrypto`, `uuid-ossp`, `pg_stat_statements` (schema `extensions`), `supabase_vault`, `plpgsql`. `gen_random_uuid()` é nativo do Postgres 17.

### Event triggers

Apenas os padrões do Supabase (`pgrst_ddl_watch`, `pgrst_drop_watch`, `issue_*`).

## Conclusões para o nosso sistema

- **Sem colisão de nomes**: nenhuma tabela planejada (`restaurantes`, `membros`, `categorias`, `produtos`, `mesas`, `bairros_entrega`, `caixa_sessoes`, `comandas`, `pedidos`, `itens_pedido`, `pagamentos`) nem função (`eh_membro`, `tem_papel`, `criar_pedido_delivery`, `consultar_pedido_publico`) nem view (`restaurantes_publicos`) existe hoje.
- **Sem trigger em `auth.users`**: podemos criar usuários do seed sem efeito colateral.
- **Sem buckets**: os prefixos `rest-` ficam livres.
- **Cuidado com o histórico de migrações** (ver acima).
- Os advisors de segurança podem mostrar alertas sobre `inscricoes_salmistas`. Esses alertas pertencem ao outro sistema e não serão corrigidos por nós.

## Aplicado deste sistema (2026-10-01)

Migrações aplicadas via MCP; os arquivos em `supabase/migrations/` têm as mesmas versões do histórico remoto:

| Versão | Nome |
|---|---|
| `20261001210303` | `estrutura` |
| `20261001210410` | `regras` |
| `20261001210442` | `rls` |
| `20261001210544` | `rpc_delivery` |
| `20261001210546` | `storage_realtime` |
| `20261001210808` | `ajustes_advisors` |
| `20261001211853` | `equipe` |
| `20261001213847` | `garcom` |
| `20261003124714` | `resumo_caixa` |
| `20261003131922` | `delivery` |
| `20261007134517` | `cadastro` (assinaturas; restaurantes existentes viraram `cortesia`) |
| `20261007142344` | `adicionais` (grupos de opções; `itens_pedido.adicionais` e `preco_adicionais`) |
| `20261007154237` | `cozinha` (praças, `tarefas_producao`, papel `cozinha`, `/cozinha` reservado) |
| `20261007155855` | `preparo` (rota de preparo por produto em `produto_etapas`; "pra viagem" no produto e no item) |
| `20261007181637` | `impressao` (impressoras, computadores pareados, fila de impressão e RPCs do app) |

Seed de desenvolvimento aplicado (3 restaurantes, 13 usuários `@exemplo.com`, senha `senha123`).

### Advisors após as migrações

- Segurança, aceitos: RPCs públicas `security definer` do delivery (intencionais); `inscricoes_salmistas` sem policy (outro sistema).
- Segurança, pendente de configuração no painel: "Leaked password protection" (Auth > Providers > Email). Recurso de plano pago; avaliar ao migrar para o projeto definitivo.
- Performance: só "unused index" (banco novo, sem tráfego).
