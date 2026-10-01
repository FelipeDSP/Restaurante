import type { Metadata } from "next";

import { exigirDono } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { ListaBairros, NovoBairro } from "./lista-bairros";

export const metadata: Metadata = { title: "Bairros de entrega" };

export default async function BairrosPage() {
  const acesso = await exigirDono();
  const supabase = await createClient();

  const { data: bairros, error } = await supabase
    .from("bairros_entrega")
    .select("id, nome, taxa, ativo")
    .eq("restaurante_id", acesso.restaurante.id)
    .order("nome");
  if (error) throw new Error(error.message);

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Bairros de entrega</h1>
        <p className="text-muted-foreground">Só bairros ativos aparecem no checkout do delivery.</p>
      </div>
      <NovoBairro />
      <ListaBairros bairros={bairros} />
    </main>
  );
}
