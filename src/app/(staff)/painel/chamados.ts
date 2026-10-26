"use server";

import { z } from "zod";

import { falha, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirPermissao } from "@/lib/auth/dal";
import { ehPapel, permissoesEfetivas } from "@/lib/auth/papeis";
import { createClient } from "@/lib/supabase/server";
import { id } from "@/lib/validacao";

export type GarcomParaChamar = { id: string; nome: string; aguardando: boolean };

// Quem atende mesas e se já tem chamado sem resposta (últimos 30 min).
export async function garconsParaChamar(): Promise<GarcomParaChamar[]> {
  const acesso = await exigirPermissao("painel", "caixa_operar", "delivery", "comandas_painel");
  const supabase = await createClient();
  const [{ data: garcons }, { data: abertos }] = await Promise.all([
    supabase
      .from("membros")
      .select("id, nome, papel, permissoes_extras, permissoes_removidas, funcao:funcoes(permissoes)")
      .eq("restaurante_id", acesso.restaurante.id)
      .neq("papel", "dono")
      .eq("ativo", true)
      .order("nome"),
    supabase
      .from("chamados_garcom")
      .select("garcom_id")
      .eq("restaurante_id", acesso.restaurante.id)
      .is("atendido_em", null)
      .gte("criado_em", new Date(Date.now() - 30 * 60_000).toISOString()),
  ]);
  const aguardando = new Set((abertos ?? []).map((c) => c.garcom_id));
  // Quem atende mesas: tem o app do garçom (pela função ou dado só a ela).
  return (garcons ?? [])
    // Quem chama não aparece na lista (um garçom com acesso ao painel não chama a si mesmo).
    .filter((g) => g.id !== acesso.membroId)
    .filter((g) => ehPapel(g.papel) && permissoesEfetivas(g.papel, g.funcao?.permissoes, g.permissoes_extras, g.permissoes_removidas).includes("garcom_app"))
    .map((g) => ({ id: g.id, nome: g.nome, aguardando: aguardando.has(g.id) }));
}

export async function chamarGarcom(garcomId: string, recado: string): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "caixa_operar", "delivery", "comandas_painel");
  const dados = z.object({ garcomId: id, recado: z.string().trim().max(120, "Recado de até 120 letras.") }).safeParse({ garcomId, recado });
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? "Dados inválidos.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("chamados_garcom")
    .insert({ restaurante_id: acesso.restaurante.id, garcom_id: dados.data.garcomId, recado: dados.data.recado || null });
  if (error) return falha(mensagemErroBanco(error));
  return sucesso("Chamado enviado.");
}
