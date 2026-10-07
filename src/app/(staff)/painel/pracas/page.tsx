import type { Metadata } from "next";
import Link from "next/link";

import { exigirDono } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { ListaPracas, NovaPraca } from "./lista-pracas";

export const metadata: Metadata = { title: "Praças" };

export default async function PracasPage() {
  const acesso = await exigirDono();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("estacoes")
    .select("id, nome, ativa, produtos(count)")
    .eq("restaurante_id", acesso.restaurante.id)
    .order("ordem")
    .order("nome");
  if (error) throw new Error(error.message);

  const pracas = data.map((p) => ({ id: p.id, nome: p.nome, ativa: p.ativa, produtos: p.produtos[0]?.count ?? 0 }));

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Praças</h1>
        <p className="text-muted-foreground">
          Onde cada coisa é preparada (churrasqueira, chapa, bar). Ligue cada produto à sua praça na tela do produto; produto sem
          praça (ex.: refrigerante) não aparece na{" "}
          <Link href="/cozinha" className="underline underline-offset-4">
            tela da cozinha
          </Link>
          .
        </p>
      </div>
      <NovaPraca />
      <ListaPracas pracas={pracas} />
    </main>
  );
}
