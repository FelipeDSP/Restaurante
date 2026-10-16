import type { Metadata } from "next";

import { exigirDono } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { ListaCategorias, NovaCategoria } from "./lista-categorias";

export const metadata: Metadata = { title: "Categorias" };

export default async function CategoriasPage() {
  const acesso = await exigirDono();
  const supabase = await createClient();

  // Sempre filtrar pelo restaurante ativo: a RLS também libera o cardápio público de outros restaurantes.
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nome, ativa, produtos(count)")
    .eq("restaurante_id", acesso.restaurante.id)
    .order("ordem")
    .order("nome");
  if (error) throw new Error(error.message);

  const categorias = data.map((c) => ({
    id: c.id,
    nome: c.nome,
    ativa: c.ativa,
    produtos: c.produtos[0]?.count ?? 0,
  }));

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="sr-only">Categorias</h1>
      <NovaCategoria />
      <ListaCategorias categorias={categorias} />
    </main>
  );
}
