import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { InsumoDoProduto, ItemDisponivel } from "./estoque-do-produto";
import type { ItemEstoque } from "./lista-estoque";

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

// Quantos movimentos de cada item a tela mostra (o extrato inteiro é longo).
const MOVIMENTOS_POR_ITEM = 8;

export type CategoriaComProdutos = { id: string; nome: string; produtos: { id: string; nome: string }[] };

// Tudo o que a tela de Estoque precisa: os itens com saldo, a ficha de cada produto, os últimos
// movimentos com quem fez e as categorias para o seletor de produtos. Eram cinco consultas na
// própria página.
export async function carregarEstoque(restauranteId: string): Promise<{ itens: ItemEstoque[]; categorias: CategoriaComProdutos[] }> {
  const supabase = await createClient();
  const [itens, fichas, movimentos, categorias, equipe] = await Promise.all([
    supabase
      .from("estoque_itens")
      .select("id, nome, unidade, saldo, minimo, maximo, ativo")
      .eq("restaurante_id", restauranteId)
      .order("nome"),
    supabase
      .from("produto_insumos")
      .select("item_id, quantidade, produto:produtos!produto_insumos_restaurante_id_produto_id_fkey(id, nome)")
      .eq("restaurante_id", restauranteId),
    supabase
      .from("estoque_movimentos")
      .select("id, item_id, quantidade, motivo, observacao, custo_total, saldo_depois, criado_em, feito_por")
      .eq("restaurante_id", restauranteId)
      .order("criado_em", { ascending: false })
      .limit(400),
    supabase
      .from("categorias")
      .select("id, nome, produtos(id, nome, ordem)")
      .eq("restaurante_id", restauranteId)
      .order("ordem")
      .order("ordem", { referencedTable: "produtos" })
      .order("nome", { referencedTable: "produtos" }),
    supabase.from("membros").select("id, nome").eq("restaurante_id", restauranteId),
  ]);
  if (itens.error) throw new Error(itens.error.message);
  if (fichas.error) throw new Error(fichas.error.message);
  if (movimentos.error) throw new Error(movimentos.error.message);
  if (categorias.error) throw new Error(categorias.error.message);

  const nomes = new Map((equipe.data ?? []).map((m) => [m.id, m.nome]));
  return {
    itens: itens.data.map((i) => ({
      id: i.id,
      nome: i.nome,
      unidade: i.unidade,
      saldo: Number(i.saldo),
      minimo: Number(i.minimo),
      maximo: Number(i.maximo),
      ativo: i.ativo,
      produtos: fichas.data
        .filter((f) => f.item_id === i.id && f.produto)
        .map((f) => ({ id: f.produto!.id, nome: f.produto!.nome, quantidade: Number(f.quantidade) }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      movimentos: movimentos.data
        .filter((m) => m.item_id === i.id)
        .slice(0, MOVIMENTOS_POR_ITEM)
        .map((m) => ({
          id: m.id,
          quantidade: Number(m.quantidade),
          motivo: m.motivo,
          observacao: m.observacao,
          custo_total: m.custo_total,
          saldo_depois: Number(m.saldo_depois),
          criado_em: m.criado_em,
          quem: m.feito_por ? (nomes.get(m.feito_por) ?? null) : null,
        })),
    })),
    categorias: categorias.data
      .map((c) => ({ id: c.id, nome: c.nome, produtos: c.produtos.map((pr) => ({ id: pr.id, nome: pr.nome })) }))
      .filter((c) => c.produtos.length > 0),
  };
}
