"use server";

import { refresh } from "next/cache";

import { falha, mensagemErroBanco, type ResultadoAcao } from "@/lib/acoes";
import { exigirAcesso } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { id } from "@/lib/validacao";

// Marca o ticket da praça como pronto (ou volta para pendente, se foi engano).
// Quem marcou e quando vêm do banco; num delivery, a última praça pronta deixa o pedido "pronto".
export async function marcarTicket(tarefaId: string, status: "pronto" | "pendente"): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("cozinha");
  if (!id.safeParse(tarefaId).success || (status !== "pronto" && status !== "pendente")) return falha("Ticket inválido.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("tarefas_producao")
    .update({ status })
    .eq("id", tarefaId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return undefined;
}
