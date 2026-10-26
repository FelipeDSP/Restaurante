import type { Metadata } from "next";

import { exigirPermissao } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { ListaMesas, NovasMesas } from "./lista-mesas";

export const metadata: Metadata = { title: "Mesas" };

export default async function MesasPage() {
  const acesso = await exigirPermissao("painel", "mesas");
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
      <h1 className="text-2xl font-semibold">Mesas</h1>
      <NovasMesas />
      <ListaMesas mesas={mesas} />
    </main>
  );
}
