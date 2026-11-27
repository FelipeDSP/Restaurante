# `src/modulos`

Código de staff que **mais de uma tela** usa: mesas, cozinha, delivery, caixa, estoque e
assinatura. Antes cada tela importava da pasta da outra (`painel/conversas` puxava
`painel/delivery/cartao-pedido`, `painel/comandas` puxava `garcom/dados`), e as rotas de
`/garcom` viraram só `redirect` sem o código sair de lá.

Regras:

- Nada aqui é roteável: fica fora de `src/app`.
- Um módulo por assunto, com `dados.ts` (consultas, `server-only`), `actions.ts` (Server
  Actions) e os componentes do assunto.
- A `page.tsx` da tela só chama o módulo e monta a tela.
- Peça genérica (botão, chave, formulário) não é módulo: vai para `src/components/staff/`.
