import type { Metadata } from "next";

import { exigirPermissao } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { ListaCategorias, NovaCategoria } from "./lista-categorias";

export const metadata: Metadata = { title: "Categorias" };

export default async function CategoriasPage() {
  const acesso = await exigirPermissao("painel", "cardapio");
  const supabase = await createClient();

  // Sempre filtrar pelo restaurante ativo: a RLS também libera o cardápio público de outros restaurantes.
  // Os produtos vêm nomeados (não só contados) para dar para trazer produtos de uma categoria
  // para outra aqui mesmo.
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nome, ativa, produtos(id, nome, ordem)")
    .eq("restaurante_id", acesso.restaurante.id)
    .order("ordem")
    .order("nome")
    .order("ordem", { referencedTable: "produtos" })
    .order("nome", { referencedTable: "produtos" });
  if (error) throw new Error(error.message);

  const categorias = data.map((c) => ({
    id: c.id,
    nome: c.nome,
    ativa: c.ativa,
    produtos: c.produtos.length,
  }));

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="sr-only">Categorias</h1>
      <NovaCategoria />
      <ListaCategorias
        categorias={categorias}
        produtosPorCategoria={data.map((c) => ({
          id: c.id,
          nome: c.nome,
          produtos: c.produtos.map((p) => ({ id: p.id, nome: p.nome })),
        }))}
      />
    </main>
  );
}
