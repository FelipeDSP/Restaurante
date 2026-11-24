import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { exigirPermissao } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { ImportarProdutos } from "./importar-produtos";
import { ListaProdutos } from "./lista-produtos";

export const metadata: Metadata = { title: "Produtos" };

export default async function ProdutosPage() {
  const acesso = await exigirPermissao("painel", "cardapio");
  const supabase = await createClient();

  const [{ data, error }, cardapios] = await Promise.all([
    supabase
      .from("categorias")
      .select(
        "id, nome, ativa, produtos(id, nome, descricao, preco, foto_url, disponivel, disponivel_delivery, ordem, dias, cardapios_produtos(cardapio_id))",
      )
      .eq("restaurante_id", acesso.restaurante.id)
      .order("ordem")
      .order("ordem", { referencedTable: "produtos" })
      .order("nome", { referencedTable: "produtos" }),
    supabase.from("cardapios").select("id, nome").eq("restaurante_id", acesso.restaurante.id).order("ordem"),
  ]);
  if (error) throw new Error(error.message);
  if (cardapios.error) throw new Error(cardapios.error.message);

  const nomesDeCardapio = Object.fromEntries(cardapios.data.map((c) => [c.id, c.nome]));
  const categorias = data.map((c) => ({
    ...c,
    produtos: c.produtos.map((p) => ({ ...p, cardapios: p.cardapios_produtos.map((l) => l.cardapio_id) })),
  }));

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="sr-only">Produtos</h1>
        {/* Cardápio atual: a prévia mostra o que é novo e o que muda de preço. */}
        <div className="ml-auto flex flex-wrap justify-end gap-2 has-[section]:w-full">
          <ImportarProdutos
            atuais={data.flatMap((c) => c.produtos.map((p) => ({ nome: p.nome, preco: p.preco, descricao: p.descricao, categoria: c.nome })))}
          />
        </div>
        <Button className="h-11" nativeButton={false} render={<Link href="/painel/produtos/novo" />}>
          Novo produto
        </Button>
      </div>
      {categorias.length === 0 ? (
        <p className="text-muted-foreground">Nenhum produto ainda.</p>
      ) : (
        <ListaProdutos categorias={categorias} nomesDeCardapio={nomesDeCardapio} />
      )}
    </main>
  );
}
