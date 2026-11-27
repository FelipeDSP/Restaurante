import "server-only";

import { createClient } from "@/lib/supabase/server";
import { consultarTarefas, montarTickets, type Ticket } from "@/lib/tickets-producao";

export type { ItemTicket, Ticket } from "@/lib/tickets-producao";

// Pendentes (todas) + prontas nas últimas 3 horas, para desfazer um "pronto" por engano.
export async function carregarTickets(
  restauranteId: string,
): Promise<{ pendentes: Ticket[]; prontos: Ticket[]; geradoEm: number }> {
  const supabase = await createClient();
  const geradoEm = Date.now();
  const desde = new Date(geradoEm - 3 * 60 * 60 * 1000).toISOString();
  const [pendentes, prontos] = await Promise.all([
    consultarTarefas(supabase).eq("restaurante_id", restauranteId).eq("status", "pendente").order("criado_em"),
    consultarTarefas(supabase)
      .eq("restaurante_id", restauranteId)
      .eq("status", "pronto")
      .gte("pronto_em", desde)
      .order("pronto_em", { ascending: false })
      .limit(12),
  ]);
  if (pendentes.error) throw new Error(pendentes.error.message);
  if (prontos.error) throw new Error(prontos.error.message);

  return { pendentes: montarTickets(pendentes.data), prontos: montarTickets(prontos.data), geradoEm };
}

export async function carregarPracasAtivas(restauranteId: string): Promise<{ id: string; nome: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("estacoes")
    .select("id, nome")
    .eq("restaurante_id", restauranteId)
    .eq("ativa", true)
    .order("ordem");
  if (error) throw new Error(error.message);
  return data;
}
