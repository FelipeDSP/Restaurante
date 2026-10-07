# Sistema para restaurantes (SaaS white label) — MVP

> Next.js 16: leia também @AGENTS.md (mudanças de API, ex.: `middleware` agora é `proxy`).

Este arquivo é o contexto permanente do projeto. Leia antes de qualquer tarefa.

## O que é

Um SaaS multi-restaurante e white label para espetinhos, hamburguerias e similares. Cada restaurante (tenant) tem sua própria marca, cardápio, mesas e equipe, todos no mesmo sistema e no mesmo banco. O primeiro cliente (cliente zero) é um espetinho/hamburgueria artesanal que vai usar o MVP em uma noite de teste.

## Escopo do MVP

Entra:
1. **Painel (caixa + admin)**: cadastro de cardápio, mesas, bairros de entrega e marca do restaurante; comandas abertas; pedidos de delivery em tempo real; registrar pagamentos; abrir/fechar caixa; resumo da sessão de caixa.
2. **PWA do garçom**: mapa de mesas, abrir comanda, lançar/editar/cancelar itens (com opções e adicionais), pedir conta, marcar como pago, fechar comanda.
3. **Site de delivery** (demonstração): cardápio público com a marca do restaurante, carrinho, checkout sem pagamento online, acompanhamento do pedido.

Não entra agora (mas o desenho não pode impedir):
- Impressão automática, agente local de impressão e leitor de QR code (fase 2).
- Praças de produção (churrasqueira/cozinha), dependência entre praças e tarefas de produção (fase 2).
- Pagamento online via Asaas (subcontas + split) e cobrança de assinatura (fase 3).
- Painel super admin, subdomínio e domínio próprio por restaurante (fase 3).
- Modo offline do PWA, NFC-e.

## Stack

- Next.js (App Router) + TypeScript estrito
- Tailwind CSS + shadcn/ui
- Supabase: Postgres, Auth, Realtime, Storage (logos e fotos)
- `@supabase/ssr` para sessão no servidor
- Migrações versionadas com Supabase CLI em `supabase/migrations/`
- Tipos gerados do banco em `src/types/database.ts` (regenerar após cada migração)
- Deploy em VPS da Hostinger (preferência: Coolify; alternativa: VPS Ubuntu KVM 8 que já roda outros serviços), não na Vercel. Build `output: "standalone"` em container Docker. Não usar recursos exclusivos da Vercel (Edge Config, Vercel KV, Cron da Vercel, etc.).

Um único app Next.js com grupos de rotas:

```
src/app/
  (publico)/[slug]/            -> site de delivery do restaurante
  (publico)/[slug]/pedido/[id] -> acompanhamento do pedido
  (staff)/login
  (staff)/painel/...           -> caixa + admin
  (staff)/garcom/...           -> PWA do garçom (layout mobile-first)
```

O restaurante do site público é resolvido pelo `slug` na URL. No futuro, um middleware vai mapear subdomínio/domínio próprio para o mesmo `slug`, então toda a lógica deve depender do restaurante resolvido, nunca do formato da URL.

Na área de staff, o restaurante vem da tabela `membros` do usuário logado. Se o usuário pertencer a mais de um restaurante, mostrar seletor; o restaurante ativo fica em cookie, sempre validado contra `membros` no servidor.

## Regras de multi-tenant (não negociáveis)

- Toda tabela de dados de restaurante tem `restaurante_id uuid not null references restaurantes(id)`.
- Toda chave primária é `uuid default gen_random_uuid()`. Nunca expor IDs sequenciais.
- RLS ativado em todas as tabelas. Nenhuma tabela sem policy.
- Policies usam funções auxiliares `security definer` com `search_path` fixo:
  - `eh_membro(restaurante_id)` -> o `auth.uid()` é membro ativo do restaurante
  - `tem_papel(restaurante_id, papeis text[])` -> membro com um dos papéis
- Índices compostos sempre começam por `restaurante_id`.
- O frontend nunca envia `restaurante_id` confiando nele para autorização; o banco valida via RLS.
- Seed de desenvolvimento com **3 restaurantes** para pegar vazamento entre tenants.
- Restaurantes não são apagados: `ativo boolean` e `excluido_em timestamptz`.

## Regras de negócio importantes

- **Dinheiro em centavos** (`integer`). Nunca `float`. Formatar só na interface (BRL).
- **Preço congelado no item**: `itens_pedido` guarda `nome_produto` e `preco_unitario` do momento do lançamento.
- **Nada é apagado**: itens e pedidos são cancelados com `cancelado_em`, `cancelado_por` e `motivo_cancelamento`.
- **Totais calculados no banco** (função/trigger), nunca confiando no valor do cliente.
- **Pedido de delivery** é criado por uma função RPC `criar_pedido_delivery(...)` `security definer`, chamável pelo usuário anônimo, que busca preços no banco, valida produtos disponíveis, restaurante aberto e bairro atendido, e calcula subtotal, taxa e total.
- **Status da mesa é derivado**: a mesa está ocupada se existe comanda com status `aberta` ou `conta_pedida`. Não guardar status na tabela `mesas`.
- Só pode existir **uma comanda aberta por mesa** (índice único parcial).
- **Comanda só fecha quitada**: soma dos pagamentos >= total. Exceção futura: fechar com pendência, com permissão.
- Pagamento registra **quem recebeu** (`registrado_por`) e **forma**. Garçom e caixa podem registrar.
- **Resumo é por sessão de caixa**, não por dia do calendário (o restaurante pode fechar depois da meia-noite). Datas exibidas no fuso do restaurante (`restaurantes.fuso_horario`, padrão `America/Porto_Velho` para o cliente zero).
- Número amigável do pedido (`numero`) sequencial por restaurante por sessão de caixa, só para exibição. O ID real é uuid.

## Produto (marca da plataforma)

- Grupo `src/app/(site)/`: landing (`/`), `/cadastro` (conta do dono) e `/comecar` (cria o restaurante). Só aqui aparece a marca **uau foods** (cores e fontes `uau-*` do `globals.css`).
- Fluxo: `/cadastro` → (confirmação de e-mail opcional, via `/auth/confirmar`) → `/comecar` → `/painel` com "Primeiros passos" e aviso de teste.
- No painel, a assinatura aparece só para o dono e sem citar a marca da plataforma.

## Papéis

- `dono`: tudo no restaurante, incluindo marca, equipe e cadastros.
- `caixa`: painel do caixa, pagamentos, sessão de caixa, pedidos de delivery.
- `garcom`: PWA do garçom (mesas, comandas, itens, pagamentos das suas mesas).

## Banco de dados (MVP)

Global:
- `restaurantes`: id, slug (único), nome, logo_url, cor_primaria, cor_secundaria, telefone, whatsapp, endereco (jsonb), fuso_horario, horarios (jsonb por dia da semana), aceita_delivery, pedido_minimo, tempo_estimado_entrega_min, ativo, excluido_em, criado_em
- `membros`: id, restaurante_id, user_id (auth.users), nome, papel (`dono`|`caixa`|`garcom`), ativo, criado_em. Único (restaurante_id, user_id)

Por restaurante:
- `categorias`: id, restaurante_id, nome, ordem, ativa
- `produtos`: id, restaurante_id, categoria_id, nome, descricao, preco (centavos), foto_url, disponivel, disponivel_delivery, ordem, criado_em
- `mesas`: id, restaurante_id, numero (texto, ex. "5" ou "Varanda 2"), ativa, ordem. Único (restaurante_id, numero)
- `bairros_entrega`: id, restaurante_id, nome, taxa (centavos), ativo
- `caixa_sessoes`: id, restaurante_id, aberta_por, aberta_em, valor_inicial, fechada_por, fechada_em, valor_contado, observacao. No máximo uma aberta por restaurante
- `comandas`: id, restaurante_id, mesa_id, garcom_id (membros), caixa_sessao_id, status (`aberta`|`conta_pedida`|`fechada`|`cancelada`), pessoas, aberta_em, fechada_em, total (calculado)
- `pedidos`: id, restaurante_id, numero, origem (`mesa`|`delivery`|`balcao`), comanda_id (null fora de mesa), caixa_sessao_id, status (`recebido`|`em_preparo`|`pronto`|`saiu_entrega`|`entregue`|`cancelado`), cliente_nome, cliente_telefone, endereco (jsonb), bairro_id, taxa_entrega, forma_pagamento_prevista, troco_para, observacao, subtotal, total, criado_por (null no delivery), criado_em, cancelado_em, cancelado_por, motivo_cancelamento
- `itens_pedido`: id, restaurante_id, pedido_id, produto_id, nome_produto, preco_unitario, quantidade, observacao, total, criado_em, cancelado_em, cancelado_por, motivo_cancelamento
- `pagamentos`: id, restaurante_id, comanda_id ou pedido_id (exatamente um), caixa_sessao_id, valor, forma (`dinheiro`|`pix`|`credito`|`debito`|`outro`), registrado_por, criado_em, estornado_em, estornado_por

Na fase 2 entram `estacoes`, `produto_componentes`, `tarefas_producao`, `impressoras`, `agentes_impressao`, `fila_impressao`. Na fase 3, `configuracoes_pagamento` (subconta Asaas), `planos`, `dominios`.

Já existe (cadastro self-service):
- `assinaturas`: id, restaurante_id (único), plano (`essencial`|`completo`), status (`teste`|`ativa`|`atrasada`|`cancelada`|`cortesia`), teste_termina_em, periodo_termina_em, provedor (`kiwify`), provedor_assinatura_id. Criada por trigger com 14 dias de teste a cada restaurante novo; só o dono lê; ninguém escreve pelo app (a cobrança, provavelmente Kiwify, vai atualizar por webhook no servidor).
- RPCs `criar_meu_restaurante(...)` (usuário logado vira dono; limite de 3 por conta) e `slug_disponivel(slug)`.
- Endereços reservados em `rest_privado.slug_reservado()`: ao criar uma rota nova no primeiro nível do app (`/algo`), acrescentar o nome lá numa migração.
- Planos e preços (provisórios, mock) ficam em `src/lib/planos.ts`.

Já existe (adicionais e opções):
- `grupos_adicionais` (nome, minimo, maximo, ordem, ativo), `adicionais` (grupo_id, nome, preco, disponivel, ordem) e `produtos_grupos_adicionais` (produto_id, grupo_id). Um grupo serve para vários produtos.
- `itens_pedido.adicionais` (jsonb) guarda o retrato das opções `[{id, grupo_id, grupo, nome, preco}]` e `preco_adicionais` a soma. Total do item = (preco_unitario + preco_adicionais) × quantidade.
- Quem lança manda só os ids das opções (`"adicionais": [uuid, ...]` no item das RPCs `lancar_itens_comanda` e `criar_pedido_delivery`); o trigger valida (opção do produto, disponível, mínimo/máximo de cada grupo ativo) e monta o retrato. As opções não mudam depois de lançadas: cancela e lança de novo.
- Interface: tipos e regras em `src/lib/adicionais.ts`, carga em `src/lib/adicionais-dados.ts`, seletor `<EscolherOpcoes>` em `src/components/adicionais/` (site e garçom).

## Acesso público (anon)

- Leitura de `restaurantes` (apenas colunas públicas, via view `restaurantes_publicos`), `categorias` ativas, `produtos` disponíveis para delivery e `bairros_entrega` ativos, somente de restaurantes ativos.
- Criação de pedido apenas pela RPC `criar_pedido_delivery`.
- Acompanhamento do pedido por RPC `consultar_pedido_publico(pedido_id)` retornando só status, itens e totais.

## Tempo real

- Painel escuta `pedidos` (novos deliveries com alerta sonoro) e `comandas` do restaurante ativo.
- PWA do garçom escuta `comandas`, `itens_pedido` e `pagamentos` do restaurante.
- Ativar Realtime só nas tabelas necessárias e sempre filtrar por `restaurante_id`.

## White label

- Nenhuma menção à marca da plataforma nas telas do restaurante, títulos de aba, manifest do PWA ou mensagens.
- Cores do restaurante aplicadas por CSS variables no layout (`--cor-primaria`, `--cor-secundaria`).
- `manifest` do PWA gerado dinamicamente por restaurante (nome, ícone, cor).

## Projeto Supabase temporário (ATENÇÃO)

Durante o desenvolvimento usamos um projeto Supabase que já contém outro sistema pequeno ("formacao salmistas").
- **Nunca alterar, renomear ou apagar tabelas, funções, triggers, buckets ou policies que já existiam.**
- Antes da primeira migração, listar o que existe (tabelas, funções, triggers em `auth.users`, buckets) e registrar em `docs/supabase-existente.md`.
- Se houver trigger em `auth.users` (ex.: criação automática de perfil), avisar antes de criar usuários, porque ele vai disparar para os usuários deste sistema.
- Conferir se algum nome de tabela deste sistema colide com os existentes.
- Buckets deste sistema com prefixo `rest-` (ex.: `rest-logos`, `rest-produtos`).
- Tudo deste sistema deve vir de migrações em `supabase/migrations/`, para poder ser recriado num projeto novo depois.

## Convenções

- Nomes de tabelas e colunas em português, snake_case, sem acento.
- Código (variáveis, componentes) em inglês ou português, mas consistente por arquivo; textos da interface em português do Brasil.
- Server Actions ou Route Handlers para escrita; validação com Zod em toda entrada. IDs com `z.guid()` (não `z.uuid()`, que rejeita os uuids do seed).
- Toda página e Server Action de staff chama `exigirAcesso(area)` de `src/lib/auth/dal.ts` (layouts não reexecutam a cada navegação).
- Consultas de staff sempre com `.eq("restaurante_id", acesso.restaurante.id)`: a RLS também libera o cardápio público (categorias, produtos, bairros, restaurantes) de outros restaurantes.
- Formulários: Server Action retorna `ResultadoAcao` (`src/lib/acoes.ts`); o `<form>` usa `key={estado?.chave}` e `valorCampo()` para manter o que foi digitado após erro (React 19 reseta o form).
- Escrita com a chave secreta (`createAdminClient`) só para o que a sessão do usuário não consegue (criar contas, trocar senha), sempre após `exigirDono()`.
- Inserts em tabelas com colunas preenchidas por trigger (`caixa_sessao_id`, `numero`, `registrado_por`, `aberta_por`) usam `novoRegistro()` de `src/lib/supabase/insercao.ts`.
- Tempo real: usar `<AtualizarEmTempoReal>` ou o hook `useMudancasRealtime` (`src/lib/realtime.ts`), que passam o token da sessão ao Realtime antes de inscrever; sem isso o canal entra como anônimo e a RLS não entrega eventos.
- Site público: dados via `createPublicClient()` (anon, sem cookies), sempre filtrando pelo restaurante resolvido do slug; o restaurante nunca vem de id enviado pelo navegador.
- Componentes de UI acessíveis e mobile-first; o PWA do garçom deve ser usável com uma mão e botões grandes.
- Após cada migração: regenerar tipos, rodar os advisors de segurança do Supabase e corrigir alertas de RLS.
- Commits pequenos, um por funcionalidade.
