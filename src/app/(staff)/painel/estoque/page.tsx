import type { Metadata } from "next";

import { exigirPermissao } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { Estoque, type ItemEstoque } from "./lista-estoque";

export const metadata: Metadata = { title: "Estoque" };

const MOVIMENTOS_POR_ITEM = 8;

export default async function EstoquePage() {
  const acesso = await exigirPermissao("painel", "estoque");
  const supabase = await createClient();
  const restauranteId = acesso.restaurante.id;

  const [itens, fichas, movimentos, categorias, equipe] = await Promise.all([
    supabase
      .from("estoque_itens")
      .select("id, nome, unidade, saldo, minimo, ativo")
      .eq("restaurante_id", restauranteId)
      .order("nome"),
    supabase
      .from("produto_insumos")
      .select("item_id, quantidade, produto:produtos!produto_insumos_restaurante_id_produto_id_fkey(id, nome)")
      .eq("restaurante_id", restauranteId),
    // O extrato inteiro é longo: a tela mostra os últimos de cada item.
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
  const lista: ItemEstoque[] = itens.data.map((i) => ({
    id: i.id,
    nome: i.nome,
    unidade: i.unidade,
    saldo: Number(i.saldo),
    minimo: Number(i.minimo),
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
  }));

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="sr-only">Estoque</h1>
      <Estoque
        itens={lista}
        fuso={acesso.restaurante.fusoHorario}
        categorias={categorias.data
          .map((c) => ({ id: c.id, nome: c.nome, produtos: c.produtos.map((p) => ({ id: p.id, nome: p.nome })) }))
          .filter((c) => c.produtos.length > 0)}
      />
    </main>
  );
}
