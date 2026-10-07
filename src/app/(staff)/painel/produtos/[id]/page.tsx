import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { exigirDono } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { id as idSchema } from "@/lib/validacao";

import { FormProduto } from "../form-produto";
import { carregarGruposParaProduto, carregarPracas } from "../grupos";

export const metadata: Metadata = { title: "Editar produto" };

export default async function EditarProdutoPage(props: PageProps<"/painel/produtos/[id]">) {
  const acesso = await exigirDono();
  const { id } = await props.params;
  if (!idSchema.safeParse(id).success) notFound();

  const supabase = await createClient();
  const [produto, categorias, grupos, ligacoes, pracas] = await Promise.all([
    supabase
      .from("produtos")
      .select("id, nome, descricao, preco, categoria_id, foto_url, disponivel, disponivel_delivery, estacao_id")
      .eq("id", id)
      .eq("restaurante_id", acesso.restaurante.id)
      .maybeSingle(),
    supabase.from("categorias").select("id, nome").eq("restaurante_id", acesso.restaurante.id).order("ordem"),
    carregarGruposParaProduto(supabase, acesso.restaurante.id),
    supabase
      .from("produtos_grupos_adicionais")
      .select("grupo_id")
      .eq("restaurante_id", acesso.restaurante.id)
      .eq("produto_id", id),
    carregarPracas(supabase, acesso.restaurante.id),
  ]);
  if (ligacoes.error) throw new Error(ligacoes.error.message);
  if (produto.error) throw new Error(produto.error.message);
  if (categorias.error) throw new Error(categorias.error.message);
  if (!produto.data) notFound();

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="text-2xl font-semibold">Editar produto</h1>
      <FormProduto
        restauranteId={acesso.restaurante.id}
        categorias={categorias.data}
        produto={produto.data}
        grupos={grupos}
        gruposDoProduto={ligacoes.data.map((l) => l.grupo_id)}
        pracas={pracas}
      />
    </main>
  );
}
