# Decisões

Por que o sistema é como é. O `CLAUDE.md` diz **o que vale hoje**; aqui fica **quem pediu, quando
e por quê** — para não refazer discussão já encerrada nem desfazer sem querer uma decisão do
cliente. Entrada nova vai no fim do assunto, com a data.

Datas em dia/mês de 2026. "Cliente" é o dono do cliente zero (espetinho e hamburgueria artesanal,
Porto Velho), que usa o sistema no serviço.

## Sumário

- [Produto e planos](#produto-e-planos)
- [Cobrança e acesso](#cobrança-e-acesso)
- [Painel e navegação](#painel-e-navegação)
- [Mesas e salão](#mesas-e-salão)
- [Delivery](#delivery)
- [Cliente do delivery](#cliente-do-delivery)
- [Cardápio e estoque](#cardápio-e-estoque)
- [Cozinha e impressão](#cozinha-e-impressão)
- [Equipe e permissões](#equipe-e-permissões)
- [Avisos e som](#avisos-e-som)
- [Segurança](#segurança)
- [Painel da plataforma (super admin)](#painel-da-plataforma-super-admin)
- [Organização do código](#organização-do-código)

---

## Produto e planos

**Sem depender de outro produto.** O uau funciona sozinho. WhatsApp e Chatyou ficam como
integração opcional no futuro; o aviso ao cliente do delivery é por Web Push, não por WhatsApp.

**29/10 — Planos reais** (documento de marketing). Quatro planos, todos sem limite de usuários e
de pedidos: Delivery, Delivery + Presencial, Avançado e Completo. Teste grátis libera tudo.
Valores e o que cada um inclui ficam em `src/lib/planos.ts`; o que cada um **libera** fica no
banco (`rest_privado.permissoes_do_plano`), porque o plano precisa bloquear de verdade, inclusive
para o dono.

**24/11 — Estoque entra no Avançado.** Não virou plano novo nem cobrança separada.

**24/11 — Agente de IA ficou de fora.** Boa ideia, barrada pelo custo por restaurante. Não voltar
ao assunto sem um teto de custo definido.

## Cobrança e acesso

**03/11 — Falta de pagamento suspende** (migração `suspensao_pagamento`). Teste grátis acabado
suspende na hora, sem tolerância (migração `teste_sem_tolerancia`); assinatura atrasada ou
cancelada suspende 5 dias depois do vencimento. Cortesia nunca suspende. Suspenso: nenhum módulo,
nenhuma permissão (dono inclusive), pedido novo recusado pelo banco e site fora do ar. Pagou,
libera na hora. O dono vê a faixa "O acesso será suspenso em N dias" antes de acontecer.

**Atraso não bloqueia na hora.** `atrasada` só avisa o dono; o restaurante continua trabalhando
até a tolerância acabar. Quem está no meio do serviço não pode perder o caixa por causa de um
boleto.

**Cobrança pelo Asaas, sem escolher forma.** A assinatura é criada com `billingType UNDEFINED`:
Pix, boleto ou cartão, o cliente escolhe na fatura. No teste, a primeira cobrança vence no fim do
teste.

## Painel e navegação

**24/11 — Menu do dia a dia e porta única das configurações.** O cliente: "segmentar em
funcionalidades da plataforma e uma aba de configurações", porque o menu com tudo junto "fica com
muita informação em um lugar só". O menu tinha 14 itens de assuntos diferentes.

**27/11 — Menu em três grupos** (Operação, Gestão, Configurações). A porta única resolveu o menu,
mas jogou funções do dia a dia (cardápio, estoque, cupons, entregadores, relatórios, histórico)
para dentro de Configurações, junto das impressoras e da assinatura. Agora: **Operação** é o que
se abre durante o serviço, **Gestão** é o que se faz fora dele mas toda semana, **Configurações**
é o que se ajusta uma vez. Nenhum endereço mudou.

**27/11 — O Cardápio fica em Gestão.** Decisão do dono: produto é ligado e desligado no meio do
serviço, não é configuração. Se ele não gostar ao ver na tela, volta mudando só de lista em
`painel/navegacao.ts`.

**Um app só para a equipe.** O app do garçom virou o painel: no computador, barra lateral; no
celular, abas no rodapé. `/garcom/*` redireciona. O manifest mantém o mesmo `id` de quando era só
do garçom, para não duplicar o app já instalado nos celulares.

**Abas do rodapé por importância.** Quando não cabe todo mundo, as abas são escolhidas por
`PRIORIDADE_ABAS` (mesas, caixa, delivery, início) e mostradas na ordem do menu. Antes valia a
ordem da lista, e o Caixa caía dentro do "Mais" — inclusive para a função Caixa.

**Painel do dono sem poluição.** Nada de parágrafo explicando a tela: o rótulo e o controle
precisam bastar. Formulário de "novo" fica atrás de um botão; listas longas recolhidas.

**04/11 — "Primeiros passos" só com o essencial.** Cardápio, delivery, mesas (se o plano tem) e
abrir o caixa. Logo, equipe e impressora são opcionais e ficam no menu.

**27/11 — Controle de serviço não mora em formulário de configuração.** Pausar o delivery era um
checkbox no meio do formulário grande de Painel › Restaurante, onde salvar o formulário desfazia a
pausa; virou uma chave no quadro do Delivery e no "Precisa de você". "Clientes pedem pelo celular"
(QR da mesa) também aparece no mapa de Mesas. Quem pode continua sendo quem tem a permissão
`restaurante`.

**27/11 — Um nome por conceito.** "Mesas" no menu é o mapa do salão; o cadastro é "Cadastro de
mesas". O que a tela chamava de "Setores da cozinha", a rota de `praças` e a aba do garçom de
"Praças" agora é **Setores** em toda a interface (decisão do dono, mesmo a equipe estando
acostumada com "praças"), com a rota `/painel/setores` e `redirect` em `/painel/pracas`. O banco
continua com a tabela `estacoes`.

## Mesas e salão

**Status da mesa é derivado.** A mesa está ocupada se existe comanda `aberta` ou `conta_pedida`.
Não guardar status em `mesas`: dois aparelhos cobrando a mesma mesa deixariam o campo mentindo.

**29/10 — Fechar sem burocracia.** O botão principal da mesa é "Receber R$ X" (não precisa pedir
conta antes); o pagamento que quita vira "Receber R$ X e fechar mesa". "Pedir conta" ficou
secundário.

**18/11 — Cada pagamento pede a forma** (noite simulada). Nenhuma forma vem marcada, e na conta
dividida "1 de N" a próxima pessoa já vem com a parte dela: antes, depois da primeira pessoa, um
toque a mais cobrava o resto no Pix e fechava a mesa, sem estorno possível.

**28/10 — Entregue por item** (migração `itens_entregues`). O cliente: "quer o refri agora e o
lanche depois". Cada item a levar tem "Entreguei"; o pedido com mais de um tem "Entreguei tudo".

**Mesa sem consumo libera sem virar conta de R$ 0** (migração `garcom_libera_mesa`). Abriu por
engano: "Liberar mesa" cancela a comanda vazia. Com consumo, continua exigindo itens cancelados e
pagamentos estornados.

**28/10 — Pedido pelo QR da mesa vai direto para a comanda e para a cozinha.** Sem fila de
aprovação: mesmas regras do lançamento do garçom (preço, opções e rota pelos triggers). Mesa livre
abre sozinha, sem garçom.

**28/10 — "Agora ou junto com a comida"** (migração `servir_com_comida`). No pedido pela mesa que
mistura comida com bebida, a revisão pergunta quando trazer o que não passa pela cozinha.

**Só o garçom da mesa vibra com o pedido do cliente.** Mesa sem garçom aparece na tela de todos
sem vibrar: decisão do cliente, porque muitas mesas sobrecarregariam a equipe.

**Sem QR code para retirar no setor** (decisão do cliente). O garçom marca o setor como pronto na
aba Setores; nada de ler código no meio do serviço.

## Delivery

**17/11 — Cliente cancela só antes do aceite** (migração `cliente_cancela_pedido`). "Cancelar
pedido" na página de acompanhamento enquanto o status é `recebido`. Depois do aceite, só pela
conversa. O painel bipa "O cliente cancelou o delivery nº X".

**26/10 — Por enquanto, só taxa fixa.** O cliente: "por bairro ainda tem que ser melhor pensado".
O modo `bairro` continua no banco e no checkout, mas sem tela (`/painel/bairros` redireciona), e
salvar o formulário do restaurante grava `fixa`. O cliente digita o CEP e o servidor consulta o
ViaCEP.

**Status só anda para frente**, com pulos permitidos depois do aceite. Cancelar, a qualquer
momento.

**Quem tem `delivery` marca Pronto mesmo com setor pendente.** O banco encerra os tickets. Quem
cuida do delivery decide; travar aqui só atrasaria a entrega.

**03/11 — Conversa com o cliente, no painel** (migração `conversa_pedido`). O cliente: "a conversa
na comanda é ruim". A conversa ficou numa área própria (Painel › Conversas), com o pedido ao lado,
e não dentro do cartão. Aberta enquanto o pedido anda e até 24 h depois de terminar.

## Cliente do delivery

**04/11 — Cadastro normal, sem SMS, sem código e sem captcha para o cliente.** Nome, e-mail,
celular e senha. Pedir sem conta continua igual. O Supabase cobra o Turnstile em todo login pela
chave pública, então o servidor cria a conta e confere a senha com a **chave secreta**, que
dispensa o captcha (conferido em 04/11); a proteção é bloqueio por senha errada e limite por IP.
Equipe e super admin continuam com captcha.

**O e-mail do cliente é neutro.** "Esqueci minha senha" do cliente sai pelo SMTP do app, sem a
marca da plataforma. Conta da equipe usa `/recuperar-senha`.

**O envio do código por SMS ficou legado.** A tela de entrar não usa mais; o gancho e
`src/lib/mensagens.ts` continuam no código.

**Avisos no celular por Web Push**, não por WhatsApp. No iPhone só com o site na tela de início
(iOS 16.4+).

## Cardápio e estoque

**30/10 — Importar produtos por planilha.** .xlsx ou .csv lido no navegador, sem biblioteca, com
prévia por linha antes de gravar. Nada é apagado: produto com o mesmo nome só tem preço e
descrição atualizados.

**24/11 — Dois cardápios no mesmo restaurante** (almoço e janta). Duas perguntas, dois campos:
**cardápio** é a que horas o produto aparece; **`produtos.dias`** é em que dias da semana (a
feijoada de quarta). Produto sem cardápio aparece sempre, para nenhum restaurante de antes mudar
de comportamento.

**24/11 — Não existe calendário de cardápio rotativo.** O que troca toda noite (o acompanhamento
do dia) continua sendo opção de adicional, que congela no item e sai impressa.

**24/11 — Não existe preço por cardápio.** Executivo e à la carte são dois produtos, para não
mexer no congelamento de preço do item.

**A equipe nunca é impedida pelo cardápio.** O que é de outro horário desce para o fim da
categoria com o aviso "só no cardápio Almoço" / "só qua". O filtro vale para o **cliente**.

**24/11 — Controle de estoque, um modelo só.** O que se conta é o item de estoque; o produto
consome itens pela ficha. "Estoque por produto" é a ficha de 1 para 1; ficha técnica é a mesma
coisa com vários itens. Não existem duas contabilidades.

**24/11 — Faltou insumo, o produto some do cardápio do cliente** e volta sozinho quando o estoque
é reposto. **A equipe continua lançando**: contagem errada é comum, e travar o salão no meio do
serviço é pior. Saldo negativo aparece em vermelho no painel.

**25/11 — O caminho simples é a caixa "Controlar estoque deste produto"** no formulário do
produto. O cliente, olhando o concorrente: "literalmente na criação do produto ele determina a
quantidade e pronto". Por baixo é o mesmo modelo (cria o item com o nome do produto e a ficha de 1
por venda), mas quem só conta unidade nunca ouve falar em item nem em ficha.

**24/11 — Ligação se edita dos dois lados.** O cliente: "ao criar um adicional, pela própria aba
de adicionais poder ver em quais produtos ele está e aplicar em outros". N:N marca dos dois lados
(adicionais ↔ produtos, cardápio ↔ produtos, setor ↔ produtos, impressora ↔ setores); 1:N é
"trazer para cá", nunca "marcar" (categoria ← produtos, função ← pessoas).

## Cozinha e impressão

**Ticket por etapa** (migração `tickets_por_etapa`, 18/11). O burger que só vai na Chapa sai num
ticket próprio e não fica "Aguardando Churrasqueira" junto com outro item do pedido.

**Setor sem tela sai no papel e o garçom marca.** Churrasqueira e chapa com gordura não ganham
tablet: o ticket sai impresso e quem retira o prato marca na aba Setores. Mesmo efeito da tela da
cozinha.

**Entregue na mesa** (migração `tarefas_retirada`). "Retirei" nas Setores marca pronto e entregue
(o garçom já está com o prato). Cada item da comanda anda pelo **próprio caminho**: o espeto
pronto não espera o burger que ainda está na chapa.

**Comanda fechada ou cancelada encerra os tickets pendentes dela.** Assim nada fica "pendente"
para sempre quando ninguém marca.

**Delivery só aparece na cozinha depois do aceite.**

**14/10 — Impressora comum também serve.** Testado numa HP Smart Tank 790 (teste e via do
delivery): conexão "Instalada no Windows", modo driver e papel A4. O app desenha o ticket numa
coluna centralizada e manda sem a janela de imprimir.

**29/10 — Via do cliente ao fechar a mesa** (migração `via_ao_fechar`). Chip desligado por padrão;
com a comanda fechada, o papel sai "CONTA PAGA · MESA X".

**29/10 — Assistente de impressora.** O cliente: dono leigo não sabe IP nem nome do Windows. As
impressoras que o app informou viram cartões; a pessoa toca numa, diz "De cupom" ou "Comum", e o
sistema cadastra, liga tudo e manda o teste. "Saiu certinho / Não saiu nada / Letras estranhas"
ajusta o resto. IP e nome digitado ficam em "Não está na lista".

**Instalador sem assinatura de código.** O Windows mostra "O Windows protegeu o computador"; o
painel explica isso em vez de esconder.

**18/11 — Impressão automática só do que está na tela.** Na cozinha, ticket de outro setor conta
como já impresso ali: trocar para "Todas" não solta tudo de uma vez.

## Equipe e permissões

**27/10 — O dono não é impedido.** O que ele quer fazer, faz: fecha o caixa com mesa aberta ou
delivery em andamento (migração `dono_fecha_caixa`, com aviso do que fica e passagem para o
próximo caixa). Trava só para o resto da equipe ou para manter o dinheiro certo.

**Função, não papel.** Todo restaurante nasce com Caixa, Garçom e Cozinha; o dono edita e cria
outras (ex.: Gerente). Permissões = (da função + extras da pessoa) − removidas da pessoa, e tudo
isso ∩ o que o plano libera. Os papéis `caixa`/`garcom`/`cozinha` ficaram em cadastros antigos,
sem efeito.

**30/10 — Meu perfil** (migração `perfil_membro`). Foto, nome, celular, e-mail e senha pela
própria pessoa. Função, permissões e ativo continuam só com o dono.

**"Nova senha" só para conta criada pelo próprio restaurante.** Conta que já existia é da pessoa:
ela usa "Esqueci minha senha".

## Avisos e som

**03/11 — Som dos avisos por pessoa.** O cliente: um bipe só passava despercebido. Cada um escolhe
em Meu perfil o som, o volume e quantas vezes toca (padrão: Bipe, alto, 2 vezes), e vale em
qualquer aparelho.

**17/11 — Avisos revisados** (teste com 6 telas ao mesmo tempo): chamado fechado não volta;
"pronto para sair" só na primeira vez; "está indo" busca o nome do garçom; a cozinha só bipa
ticket novo de verdade; `avancarPedido` no mesmo status não avisa o cliente de novo;
`/api/pedidos/[id]` responde 503 em falha do banco (o aparelho só esquece o pedido com 404); a
conversa para de consultar com a aba escondida.

**18/11 — Rede ruim não pode perder aviso.** O lembrete de delivery "recebido" só bipa para pedido
das últimas 3 h; a conferência de 30 s (e a volta da conexão) recupera mensagem de cliente,
delivery pronto e cancelamento pelo cliente da última hora que o tempo real perdeu; o áudio é
recriado ao voltar para a tela (o iPhone suspende ao bloquear).

## Segurança

**16/10 — Revisão de papéis** (migração `endurecer_papeis`). Pedido não muda depois de criado;
andamento do delivery só para dono/caixa (a cozinha só `em_preparo` → `pronto`); pedido com
pagamento ativo não cancela; delivery limitado no banco (5 por telefone em 10 min, 40 esperando
aceite); `membros` não aceita insert pela API.

**04/11 — Conta encerrada não muda** (migração `historico_imutavel`). O cliente: "o cliente
poderia alegar que o restaurante editou o pedido depois". Comanda fechada e delivery terminado não
mudam valores, situação nem entregador — para o dono também. O estorno de um delivery entregue
continua possível (devolução real), registrado, sem mudar o pedido.

**30/10 — Bloqueio de senha errada** (migração `bloqueio_login`). Por conta e por IP, com espera
crescente. E-mail que não existe conta igual, para não revelar quem tem conta.

**Anti-robô (Turnstile) onde o Supabase cobra**: login da equipe, `/admin/entrar`, cadastro,
"esqueci a senha", senha atual de "Meu perfil" e código do cliente. Ordem para ligar: publicar o
código → variável no Coolify → só então ligar o captcha no Supabase.

**O repositório no GitHub é público**: nada de IP, caminho de servidor ou segredo em arquivo
versionado.

## Painel da plataforma (super admin)

**Entrada própria em `/admin/entrar`.** Quem não é admin recebe "E-mail ou senha incorretos" (não
revela quem é admin) e, logado sem ser admin, 404.

**30/10 — Duas etapas no super admin** (migração `admin_dois_fatores`). Depois da senha, código de
6 números por e-mail. Só com a senha, nenhuma função `admin_*` funciona, nem pela API. "Lembrar
deste computador por 30 dias" guarda só o hash de uma chave no banco.

**Gestão de qualquer restaurante** (migração `admin_gestao`), "como o super admin do Chatwoot":
módulos liberados/bloqueados por restaurante, equipe (criar conta, trocar senha, desativar),
restaurante novo e "Entrar como o dono" por link de uso único, com a faixa "Modo suporte" no
painel e volta para a ficha.

**Desativar tira só o site público do ar.** A equipe continua no painel.

**30/10 — Os e-mails de conta levam a marca uau foods.** Única exceção ao white label: confirmar
cadastro, redefinir senha, troca de e-mail, link, convite e o código do super admin saem com logo,
cores e o WhatsApp do suporte. As telas do restaurante nunca citam a plataforma.

## Organização do código

**27/11 — `src/modulos` para o que mais de uma tela usa.** As rotas de `/garcom` só redirecionam
desde que o app do garçom virou o painel, mas o código das mesas continuava lá, e as telas
importavam da pasta uma da outra (conversas → delivery, produtos → estoque, assinatura → painel).
Um módulo por assunto (mesas, cozinha, delivery, caixa, estoque, assinatura), fora de `src/app`.

**27/11 — Consulta no `dados.ts`, a `page.tsx` só chama.** Começou pelo Estoque, que fazia cinco
consultas na própria página.

**27/11 — As listas que vivem nos dois lados são conferidas por script.** Permissões, módulos e
planos existem no TypeScript e no banco, e foi aí que o módulo `estoque` se perdeu (entrou no
banco e na navegação, mas não na tela do super admin). `npm run conferir:listas` compara os dois
lados, e a CI roda antes de montar a imagem.
