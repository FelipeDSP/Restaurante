import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { exigirDono } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { id as idSchema } from "@/lib/validacao";

import { FormProduto } from "../form-produto";

export const metadata: Metadata = { title: "Editar produto" };

export default async function EditarProdutoPage(props: PageProps<"/painel/produtos/[id]">) {
  const acesso = await exigirDono();
  const { id } = await props.params;
  if (!idSchema.safeParse(id).success) notFound();

  const supabase = await createClient();
  const [produto, categorias] = await Promise.all([
    supabase
      .from("produtos")
      .select("id, nome, descricao, preco, categoria_id, foto_url, disponivel, disponivel_delivery")
      .eq("id", id)
      .eq("restaurante_id", acesso.restaurante.id)
      .maybeSingle(),
    supabase.from("categorias").select("id, nome").eq("restaurante_id", acesso.restaurante.id).order("ordem"),
  ]);
  if (produto.error) throw new Error(produto.error.message);
  if (categorias.error) throw new Error(categorias.error.message);
  if (!produto.data) notFound();

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="text-2xl font-semibold">Editar produto</h1>
      <FormProduto restauranteId={acesso.restaurante.id} categorias={categorias.data} produto={produto.data} />
    </main>
  );
}
