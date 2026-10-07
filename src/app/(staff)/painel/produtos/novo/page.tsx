import type { Metadata } from "next";

import { exigirDono } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { FormProduto } from "../form-produto";
import { carregarGruposParaProduto } from "../grupos";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NovoProdutoPage(props: PageProps<"/painel/produtos/novo">) {
  const acesso = await exigirDono();
  const { categoria } = await props.searchParams;
  const supabase = await createClient();

  const [{ data: categorias, error }, grupos] = await Promise.all([
    supabase.from("categorias").select("id, nome").eq("restaurante_id", acesso.restaurante.id).order("ordem"),
    carregarGruposParaProduto(supabase, acesso.restaurante.id),
  ]);
  if (error) throw new Error(error.message);

  const categoriaInicial =
    typeof categoria === "string" && categorias.some((c) => c.id === categoria) ? categoria : undefined;

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="text-2xl font-semibold">Novo produto</h1>
      <FormProduto
        restauranteId={acesso.restaurante.id}
        categorias={categorias}
        categoriaInicial={categoriaInicial}
        grupos={grupos}
      />
    </main>
  );
}
