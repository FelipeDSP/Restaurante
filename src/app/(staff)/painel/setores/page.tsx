import type { Metadata } from "next";

import { exigirPermissao } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { ListaSetores, NovoSetor } from "./lista-setores";

export const metadata: Metadata = { title: "Setores da cozinha" };

export default async function SetoresPage() {
  const acesso = await exigirPermissao("painel", "impressao");
  const supabase = await createClient();

  const [{ data, error }, ligacoes, categorias] = await Promise.all([
    supabase
      .from("estacoes")
      .select("id, nome, ativa")
      .eq("restaurante_id", acesso.restaurante.id)
      .order("ordem")
      .order("nome"),
    // Quem passa por cada setor, para mostrar e para mudar aqui mesmo.
    supabase
      .from("produto_etapas")
      .select("estacao_id, produto:produtos!produto_etapas_restaurante_id_produto_id_fkey(id, nome)")
      .eq("restaurante_id", acesso.restaurante.id),
    supabase
      .from("categorias")
      .select("id, nome, produtos(id, nome, ordem)")
      .eq("restaurante_id", acesso.restaurante.id)
      .order("ordem")
      .order("ordem", { referencedTable: "produtos" })
      .order("nome", { referencedTable: "produtos" }),
  ]);
  if (error) throw new Error(error.message);
  if (ligacoes.error) throw new Error(ligacoes.error.message);
  if (categorias.error) throw new Error(categorias.error.message);

  const setores = data.map((p) => ({
    id: p.id,
    nome: p.nome,
    ativa: p.ativa,
    produtos: ligacoes.data
      .filter((l) => l.estacao_id === p.id && l.produto)
      .map((l) => ({ id: l.produto!.id, nome: l.produto!.nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  }));

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="sr-only">Setores da cozinha</h1>
      <NovoSetor />
      <ListaSetores
        setores={setores}
        categorias={categorias.data
          .map((c) => ({ id: c.id, nome: c.nome, produtos: c.produtos.map((p) => ({ id: p.id, nome: p.nome })) }))
          .filter((c) => c.produtos.length > 0)}
      />
    </main>
  );
}
