import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { GrupoAdicionais } from "@/lib/adicionais";
import type { Database } from "@/types/database";

// Grupos de opções de cada produto do restaurante (Map produtoId -> grupos na ordem do cadastro).
// Com o cliente público, a RLS já entrega só grupos ativos e opções disponíveis; com o da equipe,
// filtramos aqui para o salão ver o mesmo que o cliente.
export async function carregarAdicionaisPorProduto(
  supabase: SupabaseClient<Database>,
  restauranteId: string,
): Promise<Map<string, GrupoAdicionais[]>> {
  const [grupos, ligacoes] = await Promise.all([
    supabase
      .from("grupos_adicionais")
      .select("id, nome, minimo, maximo, repetir, ativo, ordem, adicionais(id, nome, preco, disponivel, ordem)")
      .eq("restaurante_id", restauranteId)
      .eq("ativo", true)
      .order("ordem")
      .order("nome")
      .order("ordem", { referencedTable: "adicionais" })
      .order("nome", { referencedTable: "adicionais" }),
    supabase.from("produtos_grupos_adicionais").select("produto_id, grupo_id").eq("restaurante_id", restauranteId),
  ]);
  if (grupos.error) throw new Error(grupos.error.message);
  if (ligacoes.error) throw new Error(ligacoes.error.message);

  const ordem = new Map(grupos.data.map((g, i) => [g.id, i]));
  const porId = new Map(
    grupos.data.map((g) => [
      g.id,
      {
        id: g.id,
        nome: g.nome,
        minimo: g.minimo,
        repetir: g.repetir,
        maximo: g.maximo,
        opcoes: g.adicionais.filter((a) => a.disponivel).map((a) => ({ id: a.id, nome: a.nome, preco: a.preco })),
      } satisfies GrupoAdicionais,
    ]),
  );

  const resultado = new Map<string, GrupoAdicionais[]>();
  for (const l of ligacoes.data) {
    const grupo = porId.get(l.grupo_id);
    if (!grupo) continue;
    const lista = resultado.get(l.produto_id) ?? [];
    lista.push(grupo);
    resultado.set(l.produto_id, lista);
  }
  for (const lista of resultado.values()) lista.sort((a, b) => (ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0));
  return resultado;
}
