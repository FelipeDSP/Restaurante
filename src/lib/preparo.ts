// Andamento de cada item a partir dos tickets das praças. Um ticket é (pedido, praça, etapa); o item
// está pronto quando os tickets de todas as etapas da rota dele estão prontos, mesmo que outro item do
// mesmo pedido ainda esteja na cozinha (o espeto não espera o burger da chapa).

export type Etapa = { estacao_id: string; ordem: number };
export type TicketPreparo = { estacao_id: string; ordem: number; status: string; pronto_em: string | null; retirada: boolean };
export type Preparo = "na_cozinha" | "pronto" | "entregue" | null;

export function lerEtapas(valor: unknown): Etapa[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((e): Etapa[] =>
    e && typeof e === "object" && typeof e.estacao_id === "string" ? [{ estacao_id: e.estacao_id, ordem: Number(e.ordem) || 1 }] : [],
  );
}

// Tickets das etapas do item (sem rota: nenhum).
export function ticketsDoItem<T extends TicketPreparo>(etapas: unknown, tarefas: T[]): T[] {
  const rota = lerEtapas(etapas);
  return tarefas.filter((t) => rota.some((e) => e.estacao_id === t.estacao_id && e.ordem === t.ordem));
}

// Entregue quando o último ticket a ficar pronto foi retirado ("Retirei" nas Praças).
export function situacaoDosTickets(tarefas: TicketPreparo[]): Preparo {
  if (tarefas.length === 0) return null;
  if (tarefas.some((t) => t.status === "pendente")) return "na_cozinha";
  const ultimo = [...tarefas].sort((a, b) => (b.pronto_em ?? "").localeCompare(a.pronto_em ?? ""))[0];
  return ultimo.retirada ? "entregue" : "pronto";
}

type ItemPreparo = { etapas: unknown; cancelado_em: string | null; entregue_em: string | null };

// Itens com preparo que estão prontos e ainda não foram para a mesa.
export function itensProntosParaLevar<I extends ItemPreparo>(itens: I[], tarefas: TicketPreparo[]): I[] {
  return itens.filter((i) => {
    if (i.cancelado_em || i.entregue_em) return false;
    const seus = ticketsDoItem(i.etapas, tarefas);
    return situacaoDosTickets(seus) === "pronto";
  });
}

// Hora em que o item ficou pronto (o último ticket da rota dele).
export function prontoEmDoItem(etapas: unknown, tarefas: TicketPreparo[]): number {
  return Math.max(0, ...ticketsDoItem(etapas, tarefas).map((t) => (t.pronto_em ? new Date(t.pronto_em).getTime() : 0)));
}
