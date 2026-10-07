import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { GrupoParaProduto } from "./form-produto";

// Praças ativas, para escolher onde o produto é preparado.
export async function carregarPracas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  restauranteId: string,
): Promise<{ id: string; nome: string }[]> {
  const { data, error } = await supabase
    .from("estacoes")
    .select("id, nome")
    .eq("restaurante_id", restauranteId)
    .eq("ativa", true)
    .order("ordem");
  if (error) throw new Error(error.message);
  return data;
}

// Grupos de opções do restaurante, para ligar ao produto.
export async function carregarGruposParaProduto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  restauranteId: string,
): Promise<GrupoParaProduto[]> {
  const { data, error } = await supabase
    .from("grupos_adicionais")
    .select("id, nome, minimo, maximo, ativo, adicionais(nome, ordem)")
    .eq("restaurante_id", restauranteId)
    .order("ordem")
    .order("nome")
    .order("ordem", { referencedTable: "adicionais" });
  if (error) throw new Error(error.message);
  return data.map((g) => ({
    id: g.id,
    nome: g.nome,
    minimo: g.minimo,
    maximo: g.maximo,
    ativo: g.ativo,
    opcoes: g.adicionais.map((a) => a.nome),
  }));
}
