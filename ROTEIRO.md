# Roteiro de construção do MVP

Use um prompt por vez. Só passe para o próximo quando o atual estiver funcionando e testado. Todos assumem que o `CLAUDE.md` está na raiz do projeto.

## Etapa 0 — Projeto base

> Leia o CLAUDE.md. Crie o projeto Next.js com TypeScript, Tailwind e shadcn/ui, configure o Supabase com `@supabase/ssr` (clientes para server, browser e middleware), a estrutura de pastas e grupos de rotas descrita, e o Supabase CLI com a pasta `supabase/migrations`. Crie `.env.example` com as variáveis necessárias. Não crie nenhuma tabela ainda.

## Etapa 1 — Inspeção do Supabase existente

> Antes de qualquer migração, inspecione o projeto Supabase conectado: liste tabelas, funções, triggers (principalmente em `auth.users`), buckets de storage e policies existentes. Registre tudo em `docs/supabase-existente.md` e me diga se há colisão de nomes ou triggers que afetem o nosso sistema. Não altere nada.

## Etapa 2 — Banco de dados e segurança

> Crie as migrações do MVP conforme o CLAUDE.md: tabelas, índices, constraints (uma comanda aberta por mesa, uma sessão de caixa aberta por restaurante, pagamento ligado a exatamente uma comanda ou pedido), funções `eh_membro` e `tem_papel`, RLS e policies de todas as tabelas, view `restaurantes_publicos`, triggers de cálculo de totais e as RPCs `criar_pedido_delivery` e `consultar_pedido_publico`. Depois rode os advisors de segurança e corrija os alertas. Gere os tipos TypeScript.

> Crie um seed de desenvolvimento com 3 restaurantes, cada um com cardápio, mesas, bairros e usuários (dono, caixa e dois garçons). Escreva testes SQL ou um script que confirme que um usuário do restaurante A não lê nem altera nada do restaurante B.

## Etapa 3 — Login e área de staff

> Implemente login com e-mail e senha, a resolução do restaurante ativo pela tabela `membros` (com seletor se houver mais de um, guardado em cookie e validado no servidor), proteção de rotas por papel (`/painel` para dono e caixa, `/garcom` para garçom, dono e caixa) e o layout base do painel com as cores do restaurante.

## Etapa 4 — Cadastros no painel

> No painel, crie as telas de cadastro (somente dono): dados e marca do restaurante (nome, logo, cores, horários, delivery), categorias (com ordenação), produtos (com foto no bucket `rest-produtos`, disponibilidade no salão e no delivery), mesas, bairros de entrega e equipe (convidar membro com papel).

## Etapa 5 — PWA do garçom

> Crie o PWA do garçom em `/garcom`, mobile-first com botões grandes: manifest dinâmico com nome e cor do restaurante; mapa de mesas mostrando livre/ocupada/conta pedida (status derivado das comandas) e atualizando em tempo real; abrir comanda; lançar itens por categoria com quantidade e observação; ver itens da comanda com total; cancelar item com motivo; pedir conta; registrar pagamento (forma e valor, permitindo dividir em várias formas); fechar comanda quando quitada.

## Etapa 6 — Painel do caixa

> No painel, crie: abertura de caixa com valor inicial (bloquear operações sem caixa aberto); lista de comandas abertas em tempo real com detalhe, registro de pagamento e fechamento; fechamento de caixa com valor contado e diferença; resumo da sessão (total vendido, por forma de pagamento, por origem, quem recebeu cada pagamento, itens mais vendidos, cancelamentos).

## Etapa 7 — Site de delivery

> Crie o site público em `/[slug]` com a marca do restaurante: cardápio por categoria com fotos, carrinho com observação por item, checkout (nome, telefone, bairro, endereço, forma de pagamento na entrega e troco) usando a RPC `criar_pedido_delivery`, aviso de fechado fora do horário, e página de acompanhamento do pedido. No painel, mostre os pedidos de delivery em tempo real com alerta sonoro e botões para mudar o status.

## Etapa 8 — Revisão e deploy

> Revise o projeto: rode os advisors de segurança e performance do Supabase, confira que nenhuma tela mostra a marca da plataforma, teste o fluxo completo com dois restaurantes do seed em navegadores diferentes e faça o deploy na Vercel.

## Antes da noite de teste

- Cadastrar o cardápio real, mesas e equipe do cliente zero.
- Instalar o PWA nos celulares dos garçons e testar com o Wi-Fi do restaurante.
- Usar em paralelo com a comanda de papel e anotar tudo que atrapalhar durante o serviço.
