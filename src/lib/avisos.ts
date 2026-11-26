// O que a pessoa escolhe sobre os avisos, guardado na conta (vale em qualquer aparelho em que ela
// entrar). Três interruptores, não uma lista: tocar som, vibrar, e qual toque — o resto é
// configuração que ninguém ia mexer.
//
// Ligar ou desligar o aviso no celular (Web Push) é outra coisa e vale por aparelho: o celular do
// garçom recebe, o computador do caixa não precisa.

import type { Permissao } from "@/lib/auth/papeis";

export type Avisos = { som: boolean; vibrar: boolean };
export const AVISOS_PADRAO: Avisos = { som: true, vibrar: true };

export function lerAvisos(valor: unknown): Avisos {
  const v = (valor && typeof valor === "object" ? valor : {}) as Record<string, unknown>;
  return {
    som: v.som !== false,
    vibrar: v.vibrar !== false,
  };
}

// Quem recebe o aviso no celular de cada acontecimento: a permissão que manda nele.
// Serve para o servidor saber a quem mandar o push, não é escolha de ninguém.
export const PERMISSAO_DO_EVENTO = {
  chamado: "garcom_app",
  prato_pronto: "garcom_app",
  pedido_qr: "garcom_app",
  delivery_novo: "delivery",
  delivery_pronto: "delivery",
  delivery_cancelado: "delivery",
  mensagem_cliente: "delivery",
} as const satisfies Record<string, Permissao>;

export type Evento = keyof typeof PERMISSAO_DO_EVENTO;
