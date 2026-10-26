import type { Metadata } from "next";

import { exigirPermissao } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { type Entregador, ListaEntregadores, NovoEntregador } from "./lista-entregadores";

export const metadata: Metadata = { title: "Entregadores" };

export default async function EntregadoresPage() {
  const acesso = await exigirPermissao("painel", "entregadores");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entregadores")
    .select("id, nome, telefone, recebe_taxa, valor_por_entrega, ativo")
    .eq("restaurante_id", acesso.restaurante.id)
    .order("ativo", { ascending: false })
    .order("nome");
  if (error) throw new Error(error.message);

  const entregadores: Entregador[] = data.map((e) => ({
    id: e.id,
    nome: e.nome,
    telefone: e.telefone,
    recebeTaxa: e.recebe_taxa,
    valorPorEntrega: e.valor_por_entrega,
    ativo: e.ativo,
  }));

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="sr-only">Entregadores</h1>
      <NovoEntregador />
      <ListaEntregadores entregadores={entregadores} />
    </main>
  );
}
