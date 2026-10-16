import type { Metadata } from "next";

import { exigirDono } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { ListaPracas, NovaPraca } from "./lista-pracas";

export const metadata: Metadata = { title: "Setores da cozinha" };

export default async function PracasPage() {
  const acesso = await exigirDono();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("estacoes")
    .select("id, nome, ativa, produto_etapas(count)")
    .eq("restaurante_id", acesso.restaurante.id)
    .order("ordem")
    .order("nome");
  if (error) throw new Error(error.message);

  const pracas = data.map((p) => ({ id: p.id, nome: p.nome, ativa: p.ativa, produtos: p.produto_etapas[0]?.count ?? 0 }));

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="sr-only">Setores da cozinha</h1>
      <NovaPraca />
      <ListaPracas pracas={pracas} />
    </main>
  );
}
