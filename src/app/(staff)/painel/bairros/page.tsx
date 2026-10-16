import type { Metadata } from "next";
import Link from "next/link";

import { exigirDono } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { ListaBairros, NovoBairro } from "./lista-bairros";

export const metadata: Metadata = { title: "Bairros de entrega" };

export default async function BairrosPage() {
  const acesso = await exigirDono();
  const supabase = await createClient();

  const [{ data: bairros, error }, { data: restaurante }] = await Promise.all([
    supabase.from("bairros_entrega").select("id, nome, taxa, ativo").eq("restaurante_id", acesso.restaurante.id).order("nome"),
    supabase.from("restaurantes").select("taxa_entrega_modo").eq("id", acesso.restaurante.id).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  const fixa = restaurante?.taxa_entrega_modo !== "bairro";

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="sr-only">Bairros de entrega</h1>
      {fixa ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Você usa <strong>taxa fixa</strong>, então esta lista não está valendo.{" "}
          <Link href="/painel/restaurante#delivery" className="font-semibold underline underline-offset-4">
            Mudar para taxa por bairro
          </Link>
        </p>
      ) : null}
      <NovoBairro />
      <ListaBairros bairros={bairros} />
    </main>
  );
}
