import type { Metadata } from "next";

import { exigirDono } from "@/lib/auth/dal";
import { ehPermissao } from "@/lib/auth/papeis";
import { createClient } from "@/lib/supabase/server";

import { type FuncaoComUso, ListaFuncoes, NovaFuncao, type PessoaDaEquipe } from "./lista-funcoes";

export const metadata: Metadata = { title: "Funções" };

export default async function FuncoesPage() {
  const acesso = await exigirDono();
  const supabase = await createClient();
  const [{ data, error }, { data: membros, error: erroMembros }] = await Promise.all([
    supabase.from("funcoes").select("id, nome, permissoes").eq("restaurante_id", acesso.restaurante.id).order("nome"),
    // Com nome e papel: dá para aplicar a função em várias pessoas aqui mesmo.
    supabase
      .from("membros")
      .select("id, nome, papel, funcao_id, ativo")
      .eq("restaurante_id", acesso.restaurante.id)
      .eq("ativo", true)
      .order("nome"),
  ]);
  if (error) throw new Error(error.message);
  if (erroMembros) throw new Error(erroMembros.message);

  const uso = new Map<string, number>();
  for (const m of membros) if (m.funcao_id) uso.set(m.funcao_id, (uso.get(m.funcao_id) ?? 0) + 1);
  const funcoes: FuncaoComUso[] = data.map((f) => ({
    id: f.id,
    nome: f.nome,
    permissoes: f.permissoes.filter(ehPermissao),
    pessoas: uso.get(f.id) ?? 0,
  }));

  const nomeDaFuncao = new Map(data.map((f) => [f.id, f.nome]));
  // O dono não tem função e não entra na troca (ninguém perde o acesso de dono por aqui).
  const pessoas: PessoaDaEquipe[] = membros
    .filter((m) => m.papel !== "dono")
    .map((m) => ({
      id: m.id,
      nome: m.nome,
      funcao: (m.funcao_id && nomeDaFuncao.get(m.funcao_id)) || "Sem função",
      funcaoId: m.funcao_id,
    }));

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="sr-only">Funções</h1>
      <NovaFuncao />
      <ListaFuncoes funcoes={funcoes} pessoas={pessoas} />
    </main>
  );
}
