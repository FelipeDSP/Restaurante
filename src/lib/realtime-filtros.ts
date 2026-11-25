"use client";

import type { MudancaRealtime } from "@/lib/realtime";

// Cada tela escuta o restaurante inteiro e se recarrega a cada evento: o quadro do Delivery se
// refazia quando um garçom lançava um espeto na mesa 12, e o mapa de mesas se refazia a cada
// mudança de um delivery. O evento traz a linha que mudou, então dá para olhar antes de recarregar.
//
// Regra: na dúvida, recarrega. Uma tela desatualizada custa mais do que um refresh a mais, e o
// DELETE do Postgres só manda a chave primária (sem `replica identity full`), então ele nunca é
// descartado por falta de campo.

export type FiltroMudanca = (mudanca: MudancaRealtime) => boolean;

function linha(mudanca: MudancaRealtime): Record<string, unknown> {
  const novo = mudanca.new as Record<string, unknown> | undefined;
  const velho = mudanca.old as Record<string, unknown> | undefined;
  return novo && Object.keys(novo).length > 0 ? novo : (velho ?? {});
}

// Só o que o quadro do Delivery e a aba Conversas mostram.
export const mudancaDoDelivery: FiltroMudanca = (mudanca) => {
  const r = linha(mudanca);
  if (mudanca.table === "pedidos") return r.origem === undefined || r.origem === "delivery";
  // Pagamento de comanda tem comanda_id; de delivery, pedido_id (o banco exige exatamente um).
  if (mudanca.table === "pagamentos") return r.pedido_id === undefined || r.pedido_id !== null;
  return true;
};

// Só o que o mapa de mesas e a tela da mesa mostram.
export const mudancaDoSalao: FiltroMudanca = (mudanca) => {
  const r = linha(mudanca);
  if (mudanca.table === "pedidos") return r.origem === undefined || r.origem !== "delivery";
  if (mudanca.table === "pagamentos") return r.comanda_id === undefined || r.comanda_id !== null;
  return true;
};
