import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { InsumoDoProduto, ItemDisponivel } from "./estoque-do-produto";

// Insumos deste produto e os itens que ele ainda pode usar.
export async function carregarEstoqueDoProduto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  restauranteId: string,
  produtoId: string,
): Promise<{ insumos: InsumoDoProduto[]; disponiveis: ItemDisponivel[] }> {
  const [ficha, itens] = await Promise.all([
    supabase
      .from("produto_insumos")
      .select("item_id, quantidade, item:estoque_itens!produto_insumos_restaurante_id_item_id_fkey(id, nome, unidade, saldo)")
      .eq("restaurante_id", restauranteId)
      .eq("produto_id", produtoId),
    supabase
      .from("estoque_itens")
      .select("id, nome, unidade")
      .eq("restaurante_id", restauranteId)
      .eq("ativo", true)
      .order("nome"),
  ]);
  if (ficha.error) throw new Error(ficha.error.message);
  if (itens.error) throw new Error(itens.error.message);

  return {
    insumos: ficha.data
      .filter((f) => f.item)
      .map((f) => ({
        id: f.item!.id,
        nome: f.item!.nome,
        unidade: f.item!.unidade,
        saldo: Number(f.item!.saldo),
        quantidade: Number(f.quantidade),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    disponiveis: itens.data,
  };
}

// Estoque "simples" do produto para o campo do formulário: existe quando o produto não tem
// ficha com vários ingredientes (aí o controle é na tela de Estoque).
export async function estoqueSimplesDoProduto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  restauranteId: string,
  produtoId: string,
): Promise<{ saldo: string; unidade: string; controla: boolean } | null> {
  const { data, error } = await supabase
    .from("produto_insumos")
    .select("quantidade, item:estoque_itens!produto_insumos_restaurante_id_item_id_fkey(nome, unidade, saldo)")
    .eq("restaurante_id", restauranteId)
    .eq("produto_id", produtoId);
  if (error) throw new Error(error.message);
  if (data.length > 1) return null;
  const linha = data[0];
  if (!linha?.item) return { saldo: "", unidade: "un", controla: false };
  return { saldo: String(Number(linha.item.saldo)).replace(".", ","), unidade: linha.item.unidade, controla: true };
}
