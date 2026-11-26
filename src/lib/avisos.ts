// Quais avisos cada pessoa recebe. Fica nos dados da conta (vale em qualquer aparelho em que ela
// entrar), ao lado do som escolhido em "Meu perfil" — o toque é um só para tudo; o que muda por
// evento é receber ou não, e vibrar ou não.
//
// `obrigatorio`: não desliga. São os dois avisos em que alguém está esperando uma pessoa se mexer
// — o caixa que chamou e o prato esfriando no balcão. Silenciar isso não é preferência de quem
// recebe, é problema de quem está do outro lado.
//
// `permissao`: quem não pode receber o aviso não vê a linha dele na tela (cozinheiro não precisa
// decidir sobre "prato pronto para levar").

import type { Permissao } from "@/lib/auth/papeis";

type Definicao = {
  rotulo: string;
  detalhe: string;
  permissao: Permissao;
  obrigatorio?: true;
  // Vibrar por padrão: hoje só os avisos do garçom vibram, e é o que se mantém para quem já usa.
  vibraPorPadrao: boolean;
};

export const EVENTOS = {
  chamado: {
    rotulo: "Chamaram você",
    detalhe: "O caixa chamou você para uma mesa. Insiste até você tocar em “Vou”.",
    permissao: "garcom_app",
    obrigatorio: true,
    vibraPorPadrao: true,
  },
  prato_pronto: {
    rotulo: "Prato pronto para levar",
    detalhe: "A cozinha terminou algo de uma mesa sua.",
    permissao: "garcom_app",
    obrigatorio: true,
    vibraPorPadrao: true,
  },
  pedido_qr: {
    rotulo: "Cliente pediu pelo QR da mesa",
    detalhe: "O pedido já foi para a cozinha; o aviso mostra os itens para você conferir.",
    permissao: "garcom_app",
    vibraPorPadrao: true,
  },
  delivery_novo: {
    rotulo: "Delivery novo esperando aceite",
    detalhe: "Repete enquanto houver pedido parado sem aceitar.",
    permissao: "delivery",
    vibraPorPadrao: false,
  },
  delivery_pronto: {
    rotulo: "Delivery pronto para sair",
    detalhe: "A cozinha terminou um pedido de entrega.",
    permissao: "delivery",
    vibraPorPadrao: false,
  },
  delivery_cancelado: {
    rotulo: "Cliente cancelou o delivery",
    detalhe: "Só acontece antes de você aceitar o pedido.",
    permissao: "delivery",
    vibraPorPadrao: false,
  },
  mensagem_cliente: {
    rotulo: "Mensagem de cliente",
    detalhe: "Alguém respondeu na conversa de um pedido de entrega.",
    permissao: "delivery",
    vibraPorPadrao: false,
  },
  cozinha_ticket: {
    rotulo: "Pedido novo na cozinha",
    detalhe: "Vale na tela da cozinha, no aparelho que estiver com ela aberta.",
    permissao: "cozinha_tela",
    vibraPorPadrao: false,
  },
} as const satisfies Record<string, Definicao>;

export type Evento = keyof typeof EVENTOS;
export const EVENTOS_NA_ORDEM = Object.keys(EVENTOS) as Evento[];

export type PreferenciaDeAviso = { ligado: boolean; vibrar: boolean };
export type Avisos = Record<Evento, PreferenciaDeAviso>;

export function ehObrigatorio(evento: Evento): boolean {
  return "obrigatorio" in EVENTOS[evento];
}

export const AVISOS_PADRAO: Avisos = Object.fromEntries(
  EVENTOS_NA_ORDEM.map((e) => [e, { ligado: true, vibrar: EVENTOS[e].vibraPorPadrao }]),
) as Avisos;

// Lê o que está guardado na conta. Quem nunca mexeu (ou mexeu antes desta tela existir) cai no
// padrão, que é exatamente o que o sistema já fazia: tudo ligado, vibrando só nos avisos do garçom.
export function lerAvisos(valor: unknown): Avisos {
  const guardado = (valor && typeof valor === "object" ? valor : {}) as Record<string, unknown>;
  const eventos = (guardado.eventos && typeof guardado.eventos === "object" ? guardado.eventos : {}) as Record<string, unknown>;
  return Object.fromEntries(
    EVENTOS_NA_ORDEM.map((e) => {
      const linha = (eventos[e] && typeof eventos[e] === "object" ? eventos[e] : {}) as Record<string, unknown>;
      return [
        e,
        {
          // O obrigatório ignora o que estiver gravado: a regra pode mudar depois de alguém já ter salvo.
          ligado: ehObrigatorio(e) ? true : linha.ligado !== false,
          vibrar: typeof linha.vibrar === "boolean" ? linha.vibrar : EVENTOS[e].vibraPorPadrao,
        },
      ];
    }),
  ) as Avisos;
}

// Formato gravado na conta (só o que a pessoa pode mudar).
export function paraGravar(avisos: Avisos): { eventos: Record<string, PreferenciaDeAviso> } {
  return {
    eventos: Object.fromEntries(
      EVENTOS_NA_ORDEM.map((e) => [e, { ligado: ehObrigatorio(e) ? true : avisos[e].ligado, vibrar: avisos[e].vibrar }]),
    ),
  };
}

// Os eventos que esta pessoa pode receber, na ordem da tela.
export function eventosDaPessoa(permissoes: readonly Permissao[]): Evento[] {
  return EVENTOS_NA_ORDEM.filter((e) => permissoes.includes(EVENTOS[e].permissao));
}
