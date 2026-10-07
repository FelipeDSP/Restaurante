# Deploy (VPS Hostinger com Coolify)

O app roda como **um container Docker** (Next.js `standalone`), construído a partir do `Dockerfile` na raiz.
Banco, login, tempo real e imagens ficam no Supabase (não rodam na VPS).

## 1. Pré-requisitos

- Repositório no GitHub com este código.
- Um **domínio ou subdomínio** apontando para a VPS (registro `A` com o IP da VPS). O app do garçom (PWA) só instala com **HTTPS**, que o Coolify gera sozinho (Let's Encrypt).
- No Supabase, em *Project Settings → API Keys*: a URL do projeto, a chave **publicável** (`sb_publishable_...`) e a chave **secreta** (`sb_secret_...`).

## 2. Criar o app no Coolify

1. *Projects → (seu projeto) → + New → Application → Public/Private Repository (GitHub)* e escolha o repositório, branch `main`.
2. **Build Pack: Dockerfile** (o arquivo já está na raiz).
3. **Ports Exposes:** `3000`.
4. **Domains:** `https://seu-dominio.com.br` (o Coolify emite o certificado).
5. **Health check:** caminho `/api/saude`, porta `3000` (o Dockerfile também tem `HEALTHCHECK`).

## 3. Variáveis de ambiente

Em *Environment Variables* do app:

| Variável | Valor | Build? | Runtime? |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | **sim** (marcar *Build Variable*) | sim |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` | **sim** | sim |
| `SUPABASE_SECRET_KEY` | `sb_secret_...` | não | sim |
| `NEXT_PUBLIC_SITE_URL` | `https://seu-dominio.com.br` | **sim** | sim |

- As `NEXT_PUBLIC_*` são embutidas no código do navegador **durante o build**: sem marcar como *Build Variable*, o site abre mas não conecta ao banco. Se mudar alguma delas, faça **redeploy** (rebuild).
- `SUPABASE_SECRET_KEY` nunca vai para o navegador; é usada só no servidor (cadastro de equipe, troca de senha e as rotas `/api/agente` do app de impressão). **Não** marque como build variable. Sem ela, a impressão automática não funciona.
- `NEXT_PUBLIC_SITE_URL` é a origem pública, usada no link de confirmação de e-mail do cadastro. Sem ela, o app usa o host da requisição.

## 3.1 App de impressão (instalador e atualizações)

O painel (Impressoras) tem o link "Baixar o app de impressão", e o app instalado procura atualizações em `https://seu-dominio.com.br/downloads/impressao/latest.yml`. Os arquivos ficam **fora da imagem**, num volume, para publicar versão nova sem redeploy:

1. No Coolify: *Persistent Storage → + Add → Volume*, destino `/app/downloads`.
2. No seu computador (Windows), em `agente/`: suba `version` no `package.json` e rode `npm install` (primeira vez) e `npm run dist`.
3. Copie para o volume, na pasta `impressao/`, os arquivos de `agente/dist/`: `Impressao-Setup-<versão>.exe`, `Impressao-Setup-<versão>.exe.blockmap` e `latest.yml` (por último). Ex.: `scp agente/dist/{*.exe,*.blockmap,latest.yml} root@vps:/caminho/do/volume/impressao/` (o caminho real do volume aparece no Coolify; o usuário do container, uid 1001, precisa conseguir ler).
4. Confira `https://seu-dominio.com.br/downloads/impressao/instalador` (baixa o .exe). Os apps já instalados se atualizam sozinhos em até 6 h, ou ao reabrir, quando não estiverem imprimindo.

Opcional: `PASTA_DOWNLOADS` muda a pasta (padrão `/app/downloads`).

O instalador não tem assinatura de código (certificado custa caro): o Windows avisa "O Windows protegeu o computador" na primeira vez. Clique em *Mais informações → Executar assim mesmo*. Com um certificado no futuro, configure `win.signtoolOptions` no `agente/package.json`.

## 4. Supabase (uma vez)

- *Authentication → URL Configuration → Site URL*: `https://seu-dominio.com.br`.
- *Authentication → URL Configuration → Redirect URLs*: adicionar `https://seu-dominio.com.br/auth/confirmar`.
- *Authentication → Sign In / Providers → Email*: decidir se o cadastro exige confirmação de e-mail ("Confirm email").
  O app funciona dos dois jeitos: sem confirmação, o dono entra direto em `/comecar`; com confirmação, o link do e-mail leva a `/auth/confirmar` e depois a `/comecar`.
  Com confirmação ligada, configurar um SMTP próprio (*Authentication → Emails → SMTP*): o e-mail padrão do Supabase tem limite baixo de envios por hora e sai com remetente genérico.
- Migrações: já aplicadas no projeto atual. Em um projeto novo, rodar `npx supabase link --project-ref <ref>` e `npx supabase db push` (sem o `seed.sql`).

## 5. Antes de abrir para o público (IMPORTANTE)

O projeto Supabase atual tem o **seed de desenvolvimento**: 3 restaurantes de exemplo e contas `@exemplo.com` com a senha pública `senha123`.

1. Criar o restaurante real e a conta do dono, pelo cadastro do site (`/cadastro`) ou pelo script:
   ```bash
   node --env-file=.env.local scripts/criar-restaurante.mjs \
     --slug nome-do-restaurante --nome "Nome do Restaurante" \
     --dono "Nome do Dono" --email dono@email.com --senha "senha-forte"
   ```
   (precisa de `SUPABASE_SECRET_KEY` no `.env.local`)
2. Desativar o seed: colar `supabase/scripts/desativar-seed.sql` no *SQL Editor* do Supabase e executar.
   Os restaurantes de exemplo saem do ar e as contas `@exemplo.com` ficam bloqueadas (nada é apagado).
3. O dono entra em `/login` e cadastra marca, cardápio, mesas, bairros, horários e equipe.

## 6. Conferência pós-deploy

- `https://seu-dominio.com.br/api/saude` responde `{"ok":true}`.
- `/login` abre; o dono entra e vê o painel com a cor do restaurante.
- `/<slug>` mostra o cardápio público.
- `/downloads/impressao/instalador` baixa o app de impressão; no painel *Impressoras*, conectar o computador e usar *Imprimir teste*.
- No celular do garçom: abrir `/garcom` no Chrome → menu → *Adicionar à tela inicial* (ícone e nome do restaurante).

## Observações

- Um único container. O limite de pedidos do site fica em memória (5 pedidos criados a cada 10 min por telefone e 20 por IP, por restaurante): com várias réplicas, precisaria de armazenamento compartilhado (Redis).
- O limite por IP depende do proxy repassar o IP do cliente (`X-Forwarded-For`/`X-Real-IP`; o Traefik do Coolify faz isso por padrão). Sem o cabeçalho, o site só limita por telefone. No cadastro e no pareamento do app, IP desconhecido conta como um só.
- Logs: aba *Logs* do app no Coolify.
- Atualizar: push no `main` + *Redeploy* (ou ativar *Auto Deploy* no Coolify).
