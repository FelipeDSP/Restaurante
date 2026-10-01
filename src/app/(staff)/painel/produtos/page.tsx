import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { exigirDono } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { ListaProdutos } from "./lista-produtos";

export const metadata: Metadata = { title: "Produtos" };

export default async function ProdutosPage() {
  const acesso = await exigirDono();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categorias")
    .select("id, nome, ativa, produtos(id, nome, preco, foto_url, disponivel, disponivel_delivery, ordem)")
    .eq("restaurante_id", acesso.restaurante.id)
    .order("ordem")
    .order("ordem", { referencedTable: "produtos" })
    .order("nome", { referencedTable: "produtos" });
  if (error) throw new Error(error.message);

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Produtos</h1>
          <p className="text-muted-foreground">Toque nos interruptores para tirar um item do salão ou do delivery.</p>
        </div>
        {data.length > 0 ? (
          <Button className="h-11" nativeButton={false} render={<Link href="/painel/produtos/novo" />}>
            Novo produto
          </Button>
        ) : null}
      </div>
      {data.length === 0 ? (
        <p className="text-muted-foreground">
          Crie as <Link href="/painel/categorias" className="underline">categorias</Link> antes dos produtos.
        </p>
      ) : (
        <ListaProdutos categorias={data} />
      )}
    </main>
  );
}
