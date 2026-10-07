import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type TabelaOrdenavel = "categorias" | "produtos" | "mesas" | "grupos_adicionais" | "adicionais";

// Subgrupo ordenado dentro do restaurante: produtos por categoria, opções por grupo.
type Escopo = { coluna: "categoria_id" | "grupo_id"; valor: string };

// Move um item uma posição para cima/baixo e renumera a ordem (1..n) do grupo.
// O grupo são os registros do restaurante (e, em produtos/opções, da mesma categoria/grupo).
export async function moverItem(
  supabase: SupabaseClient<Database>,
  tabela: TabelaOrdenavel,
  restauranteId: string,
  id: string,
  direcao: "cima" | "baixo",
  escopo?: Escopo,
): Promise<string | null> {
  let consulta = supabase
    .from(tabela)
    .select("id, ordem")
    .eq("restaurante_id", restauranteId)
    .order("ordem")
    .order("id");
  // `filter` porque a coluna do escopo não existe em todas as tabelas (o tipo da união não a conhece).
  if (escopo) consulta = consulta.filter(escopo.coluna, "eq", escopo.valor);

  const { data, error } = await consulta;
  if (error) return error.message;

  const ids = data.map((item) => item.id);
  const atual = ids.indexOf(id);
  const destino = direcao === "cima" ? atual - 1 : atual + 1;
  if (atual < 0 || destino < 0 || destino >= ids.length) return null;
  [ids[atual], ids[destino]] = [ids[destino], ids[atual]];

  // Poucos itens por grupo: atualiza só quem mudou de posição.
  const mudancas = ids
    .map((itemId, indice) => ({ id: itemId, ordem: indice + 1 }))
    .filter((item) => data.find((d) => d.id === item.id)?.ordem !== item.ordem);

  for (const item of mudancas) {
    const { error: erro } = await supabase
      .from(tabela)
      .update({ ordem: item.ordem })
      .eq("id", item.id)
      .eq("restaurante_id", restauranteId);
    if (erro) return erro.message;
  }
  return null;
}

// Próxima ordem livre no grupo.
export async function proximaOrdem(
  supabase: SupabaseClient<Database>,
  tabela: TabelaOrdenavel,
  restauranteId: string,
  escopo?: Escopo,
): Promise<number> {
  let consulta = supabase
    .from(tabela)
    .select("ordem")
    .eq("restaurante_id", restauranteId)
    .order("ordem", { ascending: false })
    .limit(1);
  // `filter` porque a coluna do escopo não existe em todas as tabelas (o tipo da união não a conhece).
  if (escopo) consulta = consulta.filter(escopo.coluna, "eq", escopo.valor);
  const { data } = await consulta;
  return (data?.[0]?.ordem ?? 0) + 1;
}
