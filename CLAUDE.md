# Sistema para restaurantes (SaaS white label) — MVP

> Next.js 16: leia também @AGENTS.md (mudanças de API, ex.: `middleware` agora é `proxy`).

Este arquivo é o contexto permanente do projeto. Leia antes de qualquer tarefa.

## O que é

Um SaaS multi-restaurante e white label para espetinhos, hamburguerias e similares. Cada restaurante (tenant) tem sua própria marca, cardápio, mesas e equipe, todos no mesmo sistema e no mesmo banco. O primeiro cliente (cliente zero) é um espetinho/hamburgueria artesanal que vai usar o MVP em uma noite de teste.

## Escopo do MVP

Entra:
1. **Painel (caixa + admin)**: cadastro de cardápio, mesas, bairros de entrega e marca do restaurante; comandas abertas; pedidos de delivery em tempo real; registrar pagamentos; abrir/fechar caixa; resumo da sessão de caixa.
2. **PWA do garçom**: mapa de mesas, abrir comanda, lançar/editar/cancelar itens, pedir conta, marcar como pago, fechar comanda.
3. **Site de delivery** (demonstração): cardápio público com a marca do restaurante, carrinho, checkout sem pagamento online, acompanhamento do pedido.

Não entra agora (mas o desenho não pode impedir):
- Impressão automática, agente local de impressão e leitor de QR code (fase 2).
- Praças de produção (churrasqueira/cozinha), dependência entre praças e tarefas de produção (fase 2).
- Adicionais com preço e grupos de opções (fase 2; no MVP só observação livre).
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
- Deploy na Vercel

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

Na fase 2 entram `estacoes`, `produto_componentes`, `tarefas_producao`, `impressoras`, `agentes_impressao`, `fila_impressao`, `grupos_adicionais`, `adicionais`. Na fase 3, `configuracoes_pagamento` (subconta Asaas), `planos`, `assinaturas`, `dominios`.

## Acesso público (anon)

- Leitura de `restaurantes` (apenas colunas públicas, via view `restaurantes_publicos`), `categorias` ativas, `produtos` disponíveis para delivery e `bairros_entrega` ativos, somente de restaurantes ativos.
- Criação de pedido apenas pela RPC `criar_pedido_delivery`.
- Acompanhamento do pedido por RPC `consultar_pedido_publico(pedido_id)` retornando só status, itens e totais.

## Tempo real

- Painel escuta `pedidos` (novos deliveries com alerta sonoro) e `comandas` do restaurante ativo.
- PWA do garçom escuta `comandas` e `itens_pedido` do restaurante.
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
- Server Actions ou Route Handlers para escrita; validação com Zod em toda entrada.
- Componentes de UI acessíveis e mobile-first; o PWA do garçom deve ser usável com uma mão e botões grandes.
- Após cada migração: regenerar tipos, rodar os advisors de segurança do Supabase e corrigir alertas de RLS.
- Commits pequenos, um por funcionalidade.
