# Sistema para restaurantes (SaaS white label)

> Next.js 16: leia também @AGENTS.md (mudanças de API, ex.: `middleware` agora é `proxy`).
> Por que as coisas são como são (quem pediu, quando, por quê): `docs/decisoes.md`.
> Deploy e variáveis de ambiente: `docs/deploy.md`.

Este arquivo é o contexto permanente do projeto: **o que vale hoje**. Leia antes de qualquer
tarefa. Histórico de decisões não entra aqui — vai para `docs/decisoes.md`.

## O que é

Um SaaS multi-restaurante e white label para espetinhos, hamburguerias e similares. Cada
restaurante (tenant) tem a sua marca, cardápio, mesas e equipe, todos no mesmo sistema e no mesmo
banco. O primeiro cliente (cliente zero) é um espetinho/hamburgueria artesanal em Porto Velho, que
usa o sistema no serviço.

Em produção hoje:

- **Painel da equipe** (caixa, salão, delivery, cozinha, gestão e configuração), um app só, com
  barra lateral no computador e abas no rodapé no celular.
- **Site de delivery** por restaurante, com conta de cliente opcional, cupom, acompanhamento do
  pedido, avisos por push e conversa com o restaurante.
- **Pedido pela mesa** pelo QR code (plano Completo).
- **Cozinha e impressão**: tela da cozinha por setor, app de impressão para Windows (ESC/POS e
  driver), fila de impressão com reenvio.
- **Cadastro self-service** (landing, criar conta, criar restaurante), assinatura e cobrança pelo
  Asaas, e **painel da plataforma** (super admin).

Fora do escopo: modo offline do PWA e NFC-e.

## Stack

- Next.js (App Router) + TypeScript estrito
- Tailwind CSS + shadcn/ui (`@base-ui/react`, `lucide-react`, `sonner`)
- Supabase: Postgres, Auth, Realtime, Storage (logos, capas, fotos de produto, avatares)
- `@supabase/ssr` para sessão no servidor
- Migrações versionadas com Supabase CLI em `supabase/migrations/`
- Tipos gerados do banco em `src/types/database.ts` (regenerar após cada migração)
- Deploy em VPS da Hostinger com Coolify, **não na Vercel**: imagem Docker montada no GitHub
  (`.github/workflows/imagem.yml`), build `output: "standalone"`. Não usar recursos exclusivos da
  Vercel (Edge Config, Vercel KV, Cron da Vercel).

## Estrutura de pastas

```
src/
  app/
    (publico)/[slug]/            site de delivery, carrinho, acompanhamento, conta do cliente
    (publico)/[slug]/mesa/[token]  cardápio e pedido pelo QR code da mesa
    (site)/                      marca da plataforma: landing, /cadastro, /comecar, /admin
    (staff)/login, /inicio, /selecionar, /recuperar-senha, /nova-senha, /assinatura, /sem-acesso
    (staff)/painel/...           o app da equipe
    (staff)/painel/_inicio/      peças da tela de Início (pasta privada)
    (staff)/cozinha/             tela cheia da cozinha (tablet/TV)
    (staff)/garcom/...           só redireciona endereços antigos para o painel
    api/                         rotas de servidor (agente de impressão, pedidos, webhooks, CEP)
    pwa/[restauranteId]/         manifest e ícone por restaurante
    downloads/impressao/         instalador e latest.yml do app de impressão
  modulos/                       código de staff que mais de uma tela usa (ver src/modulos/README.md)
    mesas/ cozinha/ delivery/ caixa/ estoque/ assinatura/
  components/
    staff/                       peças genéricas do painel (Chave, Stepper, BotaoImprimir, ...)
    ui/                          shadcn/ui
    adicionais/                  seletor de opções (site e painel)
  lib/                           regra de negócio e infraestrutura
    auth/ supabase/ impressao/
  types/database.ts              gerado do banco
```

Regras de lugar:

- **`src/app`** tem rota e tela. `page.tsx` monta a tela; a consulta vai no `dados.ts` (da tela ou
  do módulo) e a escrita no `actions.ts`.
- **`src/modulos/<assunto>`** é o que mais de uma tela usa. Tela não importa da pasta de outra
  tela. Nada ali é roteável (fica fora de `src/app`).
- **Pasta privada `_nome`** dentro de `src/app` para o que só aquela tela usa e polui a raiz.
- **`src/components/staff`** para peça genérica (botão, chave, formulário); se é do assunto, é
  módulo.
- `agente/` (app Electron de impressão) fica fora do build do Next: ignorado no tsconfig, no
  eslint e no Docker.

O restaurante do site público vem do `slug` na URL. No futuro um proxy vai mapear subdomínio e
domínio próprio para o mesmo `slug`, então **toda a lógica depende do restaurante resolvido, nunca
do formato da URL**. Na área de staff o restaurante vem da tabela `membros` do usuário logado; com
mais de um, há seletor, e o ativo fica em cookie, sempre validado contra `membros` no servidor.

## Navegação do painel (três grupos)

`src/app/(staff)/painel/navegacao.ts` tem três listas. Cada item carrega o próprio ícone, usado no
menu, nas abas do rodapé e nos cartões de Configurações.

| Grupo | Quando se usa | Itens |
|---|---|---|
| **Operação** | durante o serviço | Início, Delivery, Conversas, Mesas (Mesas/Pedidos), Caixa, Tela da cozinha |
| **Gestão** | fora do serviço, toda semana | Cardápio (Produtos/Categorias/Adicionais/Cardápios), Estoque, Cupons, Entregadores, Relatórios, Histórico |
| **Configurações** | ajusta uma vez | Restaurante, Cadastro de mesas (Cadastro/QR code), Setores da cozinha, Impressoras, Equipe (Pessoas/Funções), Assinatura |

- **Computador**: barra lateral com Operação, depois Gestão com título de seção, terminando na
  porta "Configurações" (`/painel/configuracoes`, os cartões do terceiro grupo).
- **Celular**: `<BarraApp>` com as áreas de **Operação** em abas no rodapé (até 5; senão 4 +
  "Mais", que abre o menu completo). Quando não cabe todo mundo, as abas são escolhidas por
  `PRIORIDADE_ABAS` e mostradas na ordem do menu; o contador do que ficou escondido aparece sobre
  o "Mais". Quem tem poucas áreas de Operação (ex.: garçom) vê as abas de dentro delas (Mesas,
  Pedidos). A barra sai da frente na mesa e no lançamento (`TELA_COM_BARRA_PROPRIA`).
- Páginas irmãs ficam no mesmo item, como abas (`<AbasSecao>`). Tela de **Configurações** mostra
  "‹ Configurações / Nome" (`<TopoConfiguracao>`); tela de **Gestão** com abas mostra o nome do
  grupo (`<TituloGestao>`), e sem abas tem título próprio na página.
- O cadeado do que o plano não tem (`itensBloqueadosPeloPlano`) aparece no menu para Operação e
  Gestão, e na tela de Configurações para o resto.
- Quem só atende mesas não tem Início (`PERMISSOES_INICIO`; `rotaInicial` manda para
  `/painel/comandas`). Avisos do garçom (`<AvisoPronto>`, `<AvisoChamado>`,
  `<AvisoPedidoCliente>`) ficam no layout do painel para quem tem `garcom_app`. A tela da cozinha
  continua separada (`/cozinha`, tela cheia) além de aparecer dentro do painel
  (`/painel/cozinha`).
- Manifest do app em `/pwa/[id]/manifest`, `start_url` `/painel`, mesmo `id` de quando era só do
  garçom (para não duplicar o app instalado).

## Regras de multi-tenant (não negociáveis)

- Toda tabela de dados de restaurante tem `restaurante_id uuid not null references restaurantes(id)`.
- Toda chave primária é `uuid default gen_random_uuid()`. Nunca expor IDs sequenciais.
- RLS ativado em todas as tabelas. Nenhuma tabela sem policy.
- Policies usam funções auxiliares `security definer` com `search_path` fixo:
  `eh_membro(restaurante_id)`, `tem_papel(restaurante_id, papeis[])` e
  `rest_privado.tem_permissao(restaurante_id, permissoes[])`.
- Índices compostos sempre começam por `restaurante_id`.
- O frontend nunca envia `restaurante_id` confiando nele para autorização; o banco valida via RLS.
- Seed de desenvolvimento com **3 restaurantes** para pegar vazamento entre tenants
  (`supabase/tests/isolamento.sql`).
- Restaurantes não são apagados: `ativo boolean` e `excluido_em timestamptz`.

## Regras de negócio

**Dinheiro e histórico**

- **Dinheiro em centavos** (`integer`). Nunca `float`. Formatar só na interface (BRL).
- **Preço congelado no item**: `itens_pedido` guarda `nome_produto`, `preco_unitario`, o retrato
  dos `adicionais` e a rota de preparo (`etapas`) do momento do lançamento.
- **Nada é apagado**: itens e pedidos são cancelados com `cancelado_em`, `cancelado_por` e
  `motivo_cancelamento`.
- **Totais calculados no banco** (função/trigger), nunca confiando no valor do cliente.
- **Conta encerrada não muda** (migração `historico_imutavel`): comanda fechada/cancelada e
  delivery entregue/cancelado não mudam valores, situação nem entregador — para o dono também. O
  estorno de um delivery entregue continua possível (devolução real), registrado, sem mudar o
  pedido.
- **Resumo é por sessão de caixa**, não por dia do calendário (o restaurante pode fechar depois da
  meia-noite). Datas exibidas no fuso do restaurante (`restaurantes.fuso_horario`, padrão
  `America/Porto_Velho`). Antes das 5h ainda é a noite anterior (vale também para
  `produtos.dias`).
- Número amigável do pedido (`pedidos.numero`) é sequencial por restaurante por sessão de caixa, só
  para exibição. O ID real é uuid.

**Mesas e comandas**

- **Status da mesa é derivado**: ocupada se existe comanda `aberta` ou `conta_pedida`. Não guardar
  status em `mesas`.
- Só pode existir **uma comanda aberta por mesa** (índice único parcial).
- **Comanda só fecha quitada**: soma dos pagamentos >= total.
- Mesa sem consumo (abriu por engano, tudo cancelado, sem pagamento): "Liberar mesa" **cancela** a
  comanda vazia (migração `garcom_libera_mesa`); não vira conta de R$ 0 no resumo.
- A comanda congela `servico_percentual` e `couvert_unitario` ao abrir. `subtotal` + `servico` +
  `couvert` = `total`. Garçom e caixa tiram ou voltam a cobrar; o banco recusa se o total ficar
  abaixo do já pago.
- **Entregue por item**: `itens_pedido.entregue_em`/`entregue_por` (a equipe manda só "entregue" ou
  null; hora e quem vêm do trigger; só com a comanda aberta). Quando todos os itens com preparo do
  pedido foram entregues, o trigger deixa os tickets prontos e retirados.
- Mesa sem garçom: qualquer um assume (`assumirMesa`); trocar depois exige `comandas_gerenciar`.

**Pagamentos**

- Pagamento registra **quem recebeu** (`registrado_por`) e **forma**. Garçom e caixa podem
  registrar.
- **Pagamento nunca passa do que falta**: o trigger trava a comanda (ou o pedido) com `for update`
  e recusa valor acima do saldo (dois aparelhos cobrando a mesma mesa). O troco do dinheiro não é
  pagamento. Estorno exige `motivo_estorno`.
- **Pagamento por item** (migração `pagamento_por_item`): `pagamentos.itens`
  `[{item_id, quantidade}]`; o trigger recusa item já pago, de outra mesa ou acima da quantidade.
  Estorno libera.
- **Pagamento combinado**: várias formas num envio; o trigger confere cada parte somando as
  anteriores e, se passar do saldo, nada é gravado.
- **Sangria e suprimento** em `movimentos_caixa` (ligados à sessão aberta pelo banco; só caixa e
  dono; não se alteram — erro se corrige com o movimento contrário). Entram no esperado da gaveta e
  no resumo.

**Delivery**

- **Pedido criado por RPC** `criar_pedido_delivery(...)` `security definer`, chamável pelo usuário
  anônimo: busca preços no banco, valida produtos disponíveis, restaurante aberto e bairro
  atendido, e calcula subtotal, taxa e total.
- **Envio seguro**: `criar_pedido_delivery`, `lancar_itens_comanda` e `pedir_pela_mesa` recebem a
  chave do envio (`chave_idempotencia`, uuid do aparelho) e o total que a pessoa viu. Preço mudado
  é recusado; a mensagem termina com `(precos_mudaram)`, `(indisponivel)` ou `(cupom)`, que o app
  usa para recarregar e não mostra.
- **Status só anda para frente** (`recebido` → `em_preparo` → `pronto` → `saiu_entrega` →
  `entregue`, pulos para frente permitidos depois do aceite; cancelar a qualquer momento). Ao ficar
  `pronto`/`saiu_entrega`/`entregue`, os tickets pendentes da cozinha são encerrados.
- **Cliente cancela só antes do aceite** (migração `cliente_cancela_pedido`): enquanto o status é
  `recebido`, pela página de acompanhamento → `/api/pedidos/[id]/cancelar` → RPC
  `cliente_cancelar_pedido` (anon; o id do pedido é a senha). `pedidos.cancelado_pelo_cliente` só o
  banco define.
- `pedidos.aceito_em`: hora do aceite (só o banco define); o cronômetro da cozinha conta dela.
- **Taxa de entrega**: `restaurantes.taxa_entrega_modo` = `fixa` (padrão; `taxa_entrega_fixa` para
  qualquer endereço, cliente digita o CEP e `/api/cep/[cep]` consulta o ViaCEP pelo servidor) ou
  `bairro` (lista `bairros_entrega`). **O painel só oferece a taxa fixa**: o modo `bairro` continua
  no banco e no checkout, mas sem tela (`/painel/bairros` redireciona). Bairro mostrado em qualquer
  tela = `bairro.nome` da lista ou `endereco.bairro`.
- **Pausar o delivery** (`restaurantes.aceita_delivery`) é controle de serviço, não campo de
  formulário: `<ChaveDelivery>` no topo do quadro do Delivery e no "Precisa de você" do Início,
  para quem tem a permissão `restaurante`.
- Restaurante novo nasce aberto das 18h às 23h todos os dias (padrão de `horarios`); o primeiro
  bairro cadastrado liga o delivery.
- **Editar pedido em andamento**: só pela RPC `editar_pedido_delivery` (marca a transação com
  `rest.edicao_pedido`; fora dela os triggers travam os campos). Cada mudança vira linha em
  `pedidos_alteracoes`, com o selo "Editado" nos detalhes.
- **Cupom**: `cupons` (percentual sobre itens, valor em centavos ou frete grátis; pedido mínimo,
  janela, limite de usos, um por cliente pelo telefone). `pedidos.desconto` é recalculado pelo
  trigger; total = subtotal + taxa − desconto. O "vendido" dos relatórios já vem sem ele, com
  `descontos` à parte.
- **Entregadores**: `entregadores` (`recebe_taxa` ou `valor_por_entrega`). `pedidos.entregador_id`
  só dono/caixa mudam; `valor_entregador` vem do cadastro pelo trigger. Acerto no resumo do caixa e
  nos relatórios. Pedido cancelado não conta.
- **Conversa** (`pedidos_mensagens`): aberta enquanto o pedido anda e até 24 h depois de
  entregue/cancelado (`pedidos.finalizado_em`, só o banco define). Só quem tem `delivery` lê;
  escrever só pelas RPCs. Painel › Conversas, com o cartão do pedido ao lado.

**Cozinha e preparo**

- `estacoes` são os **setores** (nome, ordem, ativa — na interface sempre "setor") e
  `produto_etapas` é a rota de preparo do produto (setor + ordem; mesma ordem = ao mesmo tempo,
  ordem maior = depois; sem etapas = não vai para a cozinha).
- `tarefas_producao`: uma por pedido, setor e **etapa** (migração `tickets_por_etapa`), criada por
  trigger. O ticket que depende de setor anterior aparece "aguardando" e o Pronto só libera quando
  ele termina. A equipe só muda `status` (`pendente`|`pronto`); quem e quando vêm do banco. No
  delivery, o último setor pronto leva o pedido de `em_preparo` para `pronto`.
- Setor sem tela: o ticket sai no papel e o **garçom** marca na aba **Pedidos**
  (`/painel/comandas/pracas`; para ele é "o que a cozinha tem para eu pegar" — "Setores" ficou
  sendo só o cadastro). `tarefas_producao.retirada` registra "entreguei na mesa"; "Retirei"
  marca pronto e entregue de uma vez.
- Cada item da comanda anda pelo **próprio caminho** (`src/lib/preparo.ts`): Na cozinha → Pronto ·
  levar → Entregue, pelos tickets das etapas da rota dele.
- Comanda fechada ou cancelada encerra os tickets pendentes dela (trigger `t25_encerrar_tarefas`).
- Delivery só aparece na cozinha depois do aceite.
- "Pra viagem": `produtos.para_viagem` (padrão do dono), `itens_pedido.para_viagem` (o garçom muda
  por item; delivery é sempre true, decidido pelo trigger).

**Cardápio, adicionais e estoque**

- `cardapios` (nome, `dias`, `abre`, `fecha` — `fecha <= abre` cruza a meia-noite —, ativo, ordem) e
  `cardapios_produtos`. Produto **sem cardápio** aparece sempre; **com cardápio**, só nas janelas
  dele. Cardápio sem produto não conta como "o de agora".
- `produtos.dias` é o dia da semana (prato do dia que repete), pelo **dia do serviço**.
- O filtro de cardápio vale **para o cliente** (RLS de `produtos`, `cardapio_salao_publico` e o
  trigger do item). **A equipe nunca é impedida**: o que é de outro horário desce para o fim da
  categoria com o aviso "só no cardápio Almoço" / "só qua" (`src/lib/cardapios.ts`).
- `pedidos.cardapio_id`: o cardápio que valia quando o pedido entrou (só o banco define). Os
  relatórios mostram "Por cardápio" quando há mais de um. **Não existe preço por cardápio**:
  executivo e à la carte são dois produtos.
- `grupos_adicionais` / `adicionais` / `produtos_grupos_adicionais`: um grupo serve vários
  produtos. Quem lança manda só os ids das opções; o trigger valida (opção do produto, disponível,
  mínimo/máximo do grupo) e monta o retrato em `itens_pedido.adicionais`, com a soma em
  `preco_adicionais`. Total do item = (preco_unitario + preco_adicionais) × quantidade. Opção não
  muda depois de lançada: cancela e lança de novo.
- **Estoque, um modelo só**: `estoque_itens` é o que se conta; `produto_insumos` é a ficha do
  produto. O **saldo vem do extrato** (`estoque_movimentos`, imutável): entrada, baixa e contagem
  só pelas RPCs `movimentar_estoque` e `ajustar_estoque`, que travam a linha do item. O app não tem
  insert em `estoque_movimentos`.
- Venda baixa no lançamento e o cancelamento **devolve exatamente o que saiu**
  (`rest_privado.estoque_devolver`, uma vez só).
- Faltou insumo, o produto some do cardápio **do cliente** (entra em
  `rest_privado.produto_no_cardapio`, a mesma função do horário e do dia) e volta sozinho quando o
  estoque é reposto. **A equipe continua lançando**; saldo negativo aparece em vermelho.
- O caminho simples é a caixa "Controlar estoque deste produto" no formulário do produto
  (`definirEstoqueDoProduto`): cria o item com o nome do produto e a ficha de 1 por venda. O bloco
  de ingredientes só aparece no produto que já usa vários insumos.

**Pedido pela mesa (QR code)**

- Opcional: `restaurantes.pedido_mesa_qr` ("Clientes pedem pelo celular", padrão desligado), ligado
  em Cadastro de mesas › QR code e no mapa de Mesas; exige a permissão `restaurante` e o módulo
  `qr`. Desligado ou caixa fechado, o QR só mostra o cardápio.
- Um QR por mesa: `mesas.qr_token` (uuid; "Trocar código" invalida o impresso). Endereço
  `/[slug]/mesa/[token]`, conferido contra o restaurante do slug.
- `pedir_pela_mesa(token, itens, lote, total)` (security definer, anon) vai **direto para a comanda
  e para a cozinha**, com as mesmas regras do lançamento do garçom. Mesa livre abre sozinha, sem
  garçom. Até 8 pedidos do cliente por mesa em 10 min (+ limite por IP). Pedido do cliente =
  origem `mesa` com `criado_por` nulo.
- `itens_pedido.servir_com_comida` (migração `servir_com_comida`): item sem rota, de mesa, que
  espera a comida.
- `pedidos.visto_em`/`visto_por` pela RPC `marcar_pedido_visto`; o aviso some nos outros aparelhos.

## Papéis, funções e permissões

- `dono` (`membros.papel = 'dono'`): tudo, sempre. Equipe e Assinatura são só dele.
- **O dono não é impedido**: o que ele quer fazer, faz (fecha o caixa com mesa aberta ou delivery em
  andamento, com aviso do que fica; migração `dono_fecha_caixa`). Trava só para o resto da equipe
  ou para manter o dinheiro certo.
- Resto da equipe (`papel = 'equipe'`): vale a **função** (`membros.funcao_id` → `funcoes`, por
  restaurante) mais o ajuste da pessoa (`permissoes_extras`, `permissoes_removidas`). Permissões =
  (da função + extras) − removidas. Os papéis `caixa`/`garcom`/`cozinha` ficam em cadastros
  antigos, sem efeito.
- Todo restaurante nasce com Caixa, Garçom e Cozinha (`funcoes.padrao`, trigger em `restaurantes`);
  o dono edita e cria outras em Configurações › Equipe › Funções. Função com gente não é excluída.
- Permissões (`src/lib/auth/papeis.ts` e `rest_privado.permissoes_validas()`):
  - Operação: `caixa_operar` (abrir/fechar, sangria/suprimento; ver e testar impressoras),
    `caixa_estornar`, `delivery` (andamento, edição, entregador, clientes, conversas),
    `comandas_painel`, `comandas_gerenciar`, `garcom_app`, `cozinha_tela`.
  - Gestão: `relatorios`, `cardapio`, `mesas`, `estoque`, `cupons`, `entregadores`, `impressao`,
    `restaurante`.
- Banco: `rest_privado.tem_permissao(restaurante, permissoes[])` em políticas e funções;
  `permissoes_membro(membro)` faz a conta. App: `Vinculo.permissoes`/`funcao` (`obterVinculos`),
  `exigirPermissao(area, ...permissoes)`, `exigirAlgumaPermissao` e `temPermissao()`
  (`src/lib/auth/dal.ts`). O painel abre com qualquer permissão que não seja só
  `garcom_app`/`cozinha_tela`/`comandas_gerenciar`.
- **O plano bloqueia de verdade**: `rest_privado.permissoes_membro` = (permissões da pessoa) ∩
  `permissoes_do_plano(restaurante)`, então vale em todas as políticas e para o dono também. QR por
  `plano_tem_qr`. App: `meus_planos()` em `obterVinculos` (`Vinculo.plano`).
- "Chamar garçom" vai para quem tem `garcom_app` (e não é dono).

## Banco de dados

Global:

- `restaurantes`: id, slug (único), nome, logo_url, capa_url, descricao, instagram, facebook,
  cor_primaria, cor_secundaria, telefone, whatsapp, endereco (jsonb), fuso_horario, horarios (jsonb
  por dia), aceita_delivery, pedido_minimo, tempo_estimado_entrega_min, taxa_entrega_modo,
  taxa_entrega_fixa, servico_percentual, couvert_valor, couvert_dias, pedido_mesa_qr, ativo,
  excluido_em, criado_em
- `membros`: id, restaurante_id, user_id (auth.users), nome, papel (`dono`|`equipe`), funcao_id,
  permissoes_extras, permissoes_removidas, foto_url, telefone, ativo, criado_em. Único
  (restaurante_id, user_id)
- `funcoes`: id, restaurante_id, nome, permissoes, padrao (`caixa`|`garcom`|`cozinha`|null)
- `assinaturas`: id, restaurante_id (único), plano, status
  (`teste`|`ativa`|`atrasada`|`cancelada`|`cortesia`), teste_termina_em, periodo_termina_em,
  provedor, provedor_cliente_id, provedor_assinatura_id, fatura_url, modulos_liberados,
  modulos_bloqueados. Criada por trigger com 14 dias de teste; só o dono lê; ninguém escreve pelo
  app.

Por restaurante: `categorias`, `produtos` (preco em centavos, disponivel, disponivel_delivery,
dias, para_viagem), `cardapios`, `cardapios_produtos`, `grupos_adicionais`, `adicionais`,
`produtos_grupos_adicionais`, `mesas` (numero texto, qr_token), `bairros_entrega`, `cupons`,
`entregadores`, `estacoes`, `produto_etapas`, `caixa_sessoes`, `movimentos_caixa`, `comandas`,
`pedidos`, `itens_pedido`, `pagamentos`, `tarefas_producao`, `pedidos_alteracoes`,
`pedidos_mensagens`, `pedidos_avisos`, `chamados_garcom`, `clientes`, `clientes_enderecos`,
`estoque_itens`, `produto_insumos`, `estoque_movimentos`, `impressoras`, `agentes_impressao`,
`fila_impressao`.

Esquema `rest_privado` (fora da API): `administradores`, `admin_sessoes`, `admin_aparelhos`,
`admin_registros`, `admin_notas`, `cobranca_eventos`, `tentativas_login` e as funções auxiliares.

Detalhes de colunas estão em `src/types/database.ts` (gerado) e nas migrações.

**Projeto Supabase compartilhado (atenção):** durante o desenvolvimento o projeto também contém
outro sistema ("formacao salmistas"). Nunca alterar, renomear ou apagar tabelas, funções,
triggers, buckets ou policies que já existiam (inventário em `docs/supabase-existente.md`).
Buckets deste sistema têm prefixo `rest-` (`rest-logos`, `rest-capas`, `rest-produtos`,
`rest-avatares`). Tudo deste sistema vem de migrações em `supabase/migrations/`.

**Endereços reservados** em `rest_privado.slug_reservado()`: ao criar uma rota nova no primeiro
nível do app (`/algo`), acrescentar o nome lá numa migração.

## Acesso público (anon)

- Leitura de `restaurantes` (só colunas públicas, via view `restaurantes_publicos`), `categorias`
  ativas, `produtos` disponíveis para delivery e `bairros_entrega` ativos, somente de restaurantes
  ativos.
- Criação de pedido apenas pelas RPCs `criar_pedido_delivery` e `pedir_pela_mesa`.
- Acompanhamento por `consultar_pedido_publico(pedido_id)`, que devolve só status, itens e totais
  (mais troco e motivo do cancelamento; nunca nome, telefone, endereço ou observação — o link é
  repassado). A tela consulta `/api/pedidos/[id]` de tempos em tempos e sobrevive a queda de rede;
  os pedidos ficam no aparelho (`meus-pedidos:<restaurante>`, até 20).
- Conta de cliente é opcional (`clientes`, criada só pela RPC `entrar_como_cliente`). Conta da
  equipe não vira cliente. `pedidos.cliente_id` só o banco define, pela sessão de quem pediu —
  por isso `enviarPedido` chama a RPC com a sessão do navegador, não com o cliente anônimo.
  Excluir a conta (LGPD) apaga cadastro e endereços; os pedidos ficam sem vínculo.

## Tempo real

- Painel escuta `pedidos`, `comandas`, `pagamentos`, `tarefas_producao` e `pedidos_mensagens` do
  restaurante ativo; a cozinha escuta `tarefas_producao`, `itens_pedido` e `pedidos`.
- Usar `<AtualizarEmTempoReal>` ou o hook `useMudancasRealtime` (`src/lib/realtime.ts`), que passam
  o token da sessão ao Realtime antes de inscrever; sem isso o canal entra como anônimo e a RLS não
  entrega eventos. O hook informa a queda (`<FaixaConexao>`) e chama `aoReconectar` quando volta:
  os eventos da queda se perderam, então **recarregue**.
- `<AlertaPedidos>` também confere a cada 30 s (delivery novo, delivery pronto, mensagem de cliente
  e cancelamento pelo cliente da última hora).
- Ativar Realtime só nas tabelas necessárias e sempre filtrar por `restaurante_id`.

## Impressão

- `impressoras` (rede: IP + porta 9100; windows: nome da impressora no Windows; papel 58/80/210;
  acentos cp850/cp1252/sem; `modo` `escpos` ou `driver`), `estacoes.impressora_id`, `imprime_conta`,
  `imprime_via_delivery`, `imprime_ao_fechar`. A4 (`largura = 210`) só no modo driver.
- `agentes_impressao`: computador pareado. Pareia com código de 6 dígitos gerado no painel (RPC
  `definir_codigo_pareamento`, 10 min, único entre restaurantes; até 10 por restaurante); depois usa
  chave própria. O banco guarda só hashes, e o navegador não os lê (grants por coluna).
- `fila_impressao`: só referências (tarefa/pedido/comanda/item). Entra por trigger ou RPC
  (`imprimir_conta`, `imprimir_teste`, `reimprimir`). Falha volta para a fila esperando
  10 s × tentativas; na 5ª fica `erro`.
- O app fala só com `/api/agente/*` (parear, trabalhos, trabalhos/[id], estado), sempre filtrando
  pelo agente autenticado (`autenticarAgente`). O servidor monta o papel
  (`src/lib/impressao/tickets.ts`) e converte em ESC/POS (`escpos.ts`); no modo driver manda o
  `documento` em HTML. Texto que vai para a impressora passa por `codificar()`.
- `agente/`: app Electron para Windows, fora do build do Next. Bandeja, abre com o Windows, chave
  cifrada (`safeStorage`), fila a cada 2 s, atualização sozinha pelo `latest.yml`. `npm run dist`
  gera o instalador; `src/app/downloads/impressao/[arquivo]/route.ts` serve de
  `PASTA_DOWNLOADS/impressao` (fora do git). Só aceita `https://` (http só localhost).
- Testar sem impressora: `node scripts/impressora-falsa.mjs` + `node scripts/agente-teste.mjs
  --servidor http://localhost:3000 --codigo <código do painel>`.

## Produto (marca da plataforma)

- Grupo `src/app/(site)/`: landing (`/`), `/cadastro` (conta do dono), `/comecar` (cria o
  restaurante) e `/admin` (painel da plataforma). Só aqui aparece a marca **uau foods** (cores e
  fontes `uau-*` do `globals.css`).
- Fluxo: `/cadastro` → (confirmação de e-mail opcional, via `/auth/confirmar`) → `/comecar` →
  `/painel` com "Primeiros passos". RPCs `criar_meu_restaurante(...)` (limite de 3 por conta) e
  `slug_disponivel(slug)`.
- No painel, a assinatura aparece só para o dono e sem citar a marca da plataforma.
- Contato (vendas e suporte, mesmo número) só em `src/lib/contato.ts` (`linkWhatsapp`,
  `linkAjuda`). Painel e cozinha: "Ajuda pelo WhatsApp" no menu do usuário.
- Super admin: telas em `src/app/(site)/admin/(painel)/` (Visão geral, Restaurantes e ficha,
  Financeiro, Administradores). Tudo por RPCs `admin_*` `security definer` que chamam
  `rest_privado.exigir_admin()`; sem chave secreta, exceto contas de login
  (`gestao-actions.ts`, sempre depois de `exigirAdmin()`). Duas etapas obrigatória: senha + código
  de 6 números por e-mail (SMTP próprio). Primeiro admin, uma vez, no SQL do Supabase:
  `insert into rest_privado.administradores (user_id) select id from auth.users where email = '...';`
- Módulos liberados/bloqueados por restaurante na ficha (`assinaturas.modulos_liberados` /
  `modulos_bloqueados`). A lista fica em `src/app/(site)/admin/modulos.ts` e no banco em
  `rest_privado.modulos_validos()` — as duas são conferidas por `npm run conferir:listas`.

## White label

- Nenhuma menção à marca da plataforma nas telas do restaurante, títulos de aba, manifest do PWA ou
  mensagens.
- **Exceção**: os e-mails de conta (Supabase Auth: confirmar cadastro, redefinir senha, troca de
  e-mail, link, convite) e o código do super admin saem com a marca **uau foods**. Modelos em
  `supabase/templates/`; os do app usam `emailUau()` de `src/lib/email-modelo.ts`. Remetente pelo
  SMTP próprio.
- Cores do restaurante por CSS variables no layout (`--cor-primaria`, `--cor-secundaria`).
- `manifest` do PWA gerado por restaurante (nome, ícone, cor). O ícone só baixa logo do bucket
  `rest-logos`.

## Convenções

**Banco e nomes**

- Tabelas e colunas em português, snake_case, sem acento.
- Código (variáveis, componentes) em inglês ou português, mas consistente por arquivo; textos da
  interface em português do Brasil.
- Nomes de status (pedido e mesa) só em `src/lib/rotulos.ts`.
- Um nome por conceito na interface: "Mesas" é o mapa, "Cadastro de mesas" é o cadastro, "Setores"
  é o que o banco chama de `estacoes`.
- Após cada migração: regenerar tipos, rodar os advisors de segurança do Supabase e corrigir
  alertas de RLS.

**Servidor**

- Server Actions ou Route Handlers para escrita; validação com Zod em toda entrada. IDs com
  `z.guid()` (não `z.uuid()`, que rejeita os uuids do seed).
- Toda página e Server Action de staff chama `exigirAcesso(area)` / `exigirPermissao(...)` de
  `src/lib/auth/dal.ts` (layouts não reexecutam a cada navegação).
- Consultas de staff sempre com `.eq("restaurante_id", acesso.restaurante.id)`: a RLS também libera
  o cardápio público de outros restaurantes.
- Tudo exportado de um arquivo `"use server"` vira endpoint: carga de dados vai em `dados.ts`
  (`import "server-only"`), não em `actions.ts`.
- Escrita com a chave secreta (`createAdminClient`) só para o que a sessão do usuário não consegue
  (criar contas, trocar senha), sempre após `exigirDono()` ou `exigirAdmin()`.
- Inserts em tabelas com colunas preenchidas por trigger (`caixa_sessao_id`, `numero`,
  `registrado_por`, `aberta_por`) usam `novoRegistro()` de `src/lib/supabase/insercao.ts`.
- Site público: dados via `createPublicClient()` (anon, sem cookies), sempre filtrando pelo
  restaurante resolvido do slug; o restaurante nunca vem de id enviado pelo navegador.
- Redirecionar depois de login/link: `caminhoInterno()` (`src/lib/caminho-seguro.ts`). IP para
  limites: último endereço do `X-Forwarded-For` (`ipDoCliente`).

**Interface**

- Formulários: Server Action retorna `ResultadoAcao` (`src/lib/acoes.ts`); o `<form>` usa
  `key={estado?.chave}` e `valorCampo()` para manter o que foi digitado após erro (React 19 reseta
  o form).
- Rede ruim não pode apagar o que foi digitado: ações fora de formulário usam `useAcao`
  (`src/components/staff/acoes-cliente.tsx`); formulários longos do cliente guardam rascunho com
  `useRascunho`. Cada área tem `error.tsx` com `<TelaErro>`.
- Ação destrutiva ou sem volta (excluir, desativar, fechar caixa/comanda, estornar) pede
  confirmação: `<BotaoConfirmar>` ou confirmação no lugar com motivo.
- Controle que vale na hora (liga/desliga) é `<Chave>`, não checkbox de formulário.
- Botões crescem para 44 px em telas de toque (`pointer-coarse:min-h-11` nos tamanhos do
  `button.tsx`); não use `size="sm"` achando que fica pequeno no celular.
- Cor de texto sobre a cor da marca: `corDeContraste()` (`src/lib/cores.ts`), pela razão de
  contraste WCAG. Avisos (toasts) ficam embaixo, acima das barras fixas.
- Componentes acessíveis e mobile-first; a tela da mesa deve ser usável com uma mão.
- Campos de valor selecionam o texto ao tocar (o "0,00" do troco não vira "0,00100").
- Som dos avisos: `novoContextoDeSom()` e `tocarAlerta()` (`src/lib/som.ts`), com a preferência da
  pessoa (`<PreferenciaSom>` nos layouts do painel e da cozinha).
- Seletor de produtos é um componente só: `<EscolherProdutos>`. A escolha fica num componente filho
  com `key` = lista salva, para nascer de novo depois de salvar.

**Processo**

- Commits pequenos, um por funcionalidade.
- `npm run lint`, `npm run typecheck` e `npm run conferir:listas` precisam passar; a CI
  (`.github/workflows/imagem.yml`) roda os três antes de montar a imagem.
- Isolamento entre tenants: `npm run db:reset:local && npm run db:test:local` (precisa do Supabase
  local em Docker).
