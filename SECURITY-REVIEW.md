# Revisao de seguranca

Data: 09/10/2026

## Escopo e validacao

Revisao estatica do fluxo de observacoes do delivery ate a impressao ESC/POS,
incluindo os pontos de entrada, montagem do ticket e envio ao agente.

`npm run lint`, `npm run typecheck`, `npm run build` e
`npm --prefix agente run teste` passaram. O teste SQL de isolamento nao foi
executado porque o daemon do Docker nao estava disponivel. Nao foi feito teste
com impressora fisica.

## Achados

### SEC-1 — Comandos ESC/POS injetaveis em texto do pedido

- **Severidade:** Media
- **Confianca:** 9/10
- **Arquivos:** `src/lib/impressao/escpos.ts` (linhas 37–40 e 92),
  `src/lib/impressao/tickets.ts` (linhas 169–173),
  `src/app/(publico)/[slug]/carrinho/actions.ts` (linhas 21–24),
  `src/app/api/agente/trabalhos/route.ts` (linhas 40–45) e
  `supabase/migrations/20261008120000_envio_seguro.sql` (linhas 118–138).

Observacoes de itens enviadas pelo cliente podem conter caracteres de controle.
O fluxo de codificacao ESC/POS copia caracteres ASCII sem filtra-los e envia os
bytes resultantes ao agente de impressao. Em impressoras compativeis, uma
sequencia de controle pode ser interpretada como comando da impressora (por
exemplo, pulso de gaveta, se houver uma gaveta conectada).

O impacto depende da configuracao fisica do restaurante e do uso do modo
ESC/POS. Nao houve validacao em equipamento real.

**Recomendacao:** remover ou neutralizar caracteres de controle de texto nao
confiavel antes da codificacao; produzir comandos ESC/POS somente a partir da
estrutura interna do ticket.
