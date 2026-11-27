"use server";

import { refresh } from "next/cache";
import { after } from "next/server";

import { avisarPratoPronto } from "@/lib/avisos-equipe";

import { falha, mensagemErroBanco, type ResultadoAcao } from "@/lib/acoes";
import { exigirAcesso } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { id } from "@/lib/validacao";

// Marca o ticket do setor como pronto (ou volta para pendente, se foi engano).
// Quem marcou e quando vêm do banco; num delivery, o último setor pronto deixa o pedido "pronto".
export async function marcarTicket(tarefaId: string, status: "pronto" | "pendente"): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("cozinha");
  if (!id.safeParse(tarefaId).success || (status !== "pronto" && status !== "pendente")) return falha("Ticket inválido.");

  const supabase = await createClient();
  const { data: tarefa } = await supabase
    .from("tarefas_producao")
    .select("pedido_id")
    .eq("id", tarefaId)
    .eq("restaurante_id", acesso.restaurante.id)
    .maybeSingle();
  const { error } = await supabase
    .from("tarefas_producao")
    .update({ status })
    .eq("id", tarefaId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  // Aviso no celular do garçom da mesa. Só ao ficar pronto: "voltar para pendente" é conserto de
  // engano, não notícia. Quem decide se o pedido inteiro está pronto é `avisarPratoPronto`.
  if (status === "pronto" && tarefa?.pedido_id) {
    const pedidoId = tarefa.pedido_id;
    after(() => avisarPratoPronto(pedidoId));
  }

  refresh();
  return undefined;
}
