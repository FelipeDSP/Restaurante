"use server";

import { z } from "zod";

import { falha, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirAcesso } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { id } from "@/lib/validacao";

export type GarcomParaChamar = { id: string; nome: string; aguardando: boolean };

// Garçons ativos do restaurante e se já têm chamado sem resposta (últimos 30 min).
export async function garconsParaChamar(): Promise<GarcomParaChamar[]> {
  const acesso = await exigirAcesso("painel");
  const supabase = await createClient();
  const [{ data: garcons }, { data: abertos }] = await Promise.all([
    supabase.from("membros").select("id, nome").eq("restaurante_id", acesso.restaurante.id).eq("papel", "garcom").eq("ativo", true).order("nome"),
    supabase
      .from("chamados_garcom")
      .select("garcom_id")
      .eq("restaurante_id", acesso.restaurante.id)
      .is("atendido_em", null)
      .gte("criado_em", new Date(Date.now() - 30 * 60_000).toISOString()),
  ]);
  const aguardando = new Set((abertos ?? []).map((c) => c.garcom_id));
  return (garcons ?? []).map((g) => ({ id: g.id, nome: g.nome, aguardando: aguardando.has(g.id) }));
}

export async function chamarGarcom(garcomId: string, recado: string): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("painel");
  const dados = z.object({ garcomId: id, recado: z.string().trim().max(120, "Recado de até 120 letras.") }).safeParse({ garcomId, recado });
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? "Dados inválidos.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("chamados_garcom")
    .insert({ restaurante_id: acesso.restaurante.id, garcom_id: dados.data.garcomId, recado: dados.data.recado || null });
  if (error) return falha(mensagemErroBanco(error));
  return sucesso("Chamado enviado.");
}
