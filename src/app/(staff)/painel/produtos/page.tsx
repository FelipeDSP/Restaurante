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
          <p className="text-muted-foreground">Esgotou? Desligue <strong>Disponível</strong>. Para tirar só do site, desligue <strong>No delivery</strong>.</p>
        </div>
        <Button className="h-11" nativeButton={false} render={<Link href="/painel/produtos/novo" />}>
          Novo produto
        </Button>
      </div>
      {data.length === 0 ? (
        <p className="text-muted-foreground">
          Nenhum produto ainda. Toque em <strong>Novo produto</strong>: a categoria (ex.: Espetos, Bebidas) dá para criar ali mesmo.
        </p>
      ) : (
        <ListaProdutos categorias={data} />
      )}
    </main>
  );
}
