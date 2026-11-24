import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { exigirPermissao } from "@/lib/auth/dal";
import { resumoCardapio } from "@/lib/cardapios";
import { createClient } from "@/lib/supabase/server";
import { id as idSchema } from "@/lib/validacao";

import { FormCardapio } from "./form-cardapio";

export const metadata: Metadata = { title: "Cardápio" };

export default async function CardapioPage(props: PageProps<"/painel/cardapios/[id]">) {
  const acesso = await exigirPermissao("painel", "cardapio");
  const { id } = await props.params;
  if (!idSchema.safeParse(id).success) notFound();

  const supabase = await createClient();
  const [cardapio, categorias, ligacoes] = await Promise.all([
    supabase
      .from("cardapios")
      .select("id, nome, dias, abre, fecha, ativo")
      .eq("id", id)
      .eq("restaurante_id", acesso.restaurante.id)
      .maybeSingle(),
    supabase
      .from("categorias")
      .select("id, nome, produtos(id, nome, ordem)")
      .eq("restaurante_id", acesso.restaurante.id)
      .order("ordem")
      .order("ordem", { referencedTable: "produtos" })
      .order("nome", { referencedTable: "produtos" }),
    supabase
      .from("cardapios_produtos")
      .select("produto_id")
      .eq("restaurante_id", acesso.restaurante.id)
      .eq("cardapio_id", id),
  ]);
  if (cardapio.error) throw new Error(cardapio.error.message);
  if (categorias.error) throw new Error(categorias.error.message);
  if (ligacoes.error) throw new Error(ligacoes.error.message);
  if (!cardapio.data) notFound();

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">{cardapio.data.nome}</h1>
        <p className="text-sm text-muted-foreground">
          {resumoCardapio(cardapio.data)}
          {!cardapio.data.ativo ? " · desligado" : ""}
        </p>
      </div>
      <FormCardapio
        cardapio={cardapio.data}
        categorias={categorias.data
          .map((c) => ({ id: c.id, nome: c.nome, produtos: c.produtos.map((p) => ({ id: p.id, nome: p.nome })) }))
          .filter((c) => c.produtos.length > 0)}
        produtosDoCardapio={ligacoes.data.map((l) => l.produto_id)}
      />
    </main>
  );
}
