import type { Metadata } from "next";

import { exigirDono } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { ListaMesas, NovasMesas } from "./lista-mesas";

export const metadata: Metadata = { title: "Mesas" };

export default async function MesasPage() {
  const acesso = await exigirDono();
  const supabase = await createClient();

  const { data: mesas, error } = await supabase
    .from("mesas")
    .select("id, numero, ativa")
    .eq("restaurante_id", acesso.restaurante.id)
    .order("ordem")
    .order("numero");
  if (error) throw new Error(error.message);

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Mesas</h1>
        <p className="text-muted-foreground">A ordem aqui é a ordem do mapa de mesas do garçom.</p>
      </div>
      <NovasMesas />
      <ListaMesas mesas={mesas} />
    </main>
  );
}
