import type { Metadata } from "next";

import { exigirPermissao } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { ListaCardapios, NovoCardapio } from "./lista-cardapios";

export const metadata: Metadata = { title: "Cardápios" };

export default async function CardapiosPage() {
  const acesso = await exigirPermissao("painel", "cardapio");
  const supabase = await createClient();

  const [{ data, error }, { data: agora }] = await Promise.all([
    supabase
      .from("cardapios")
      .select("id, nome, dias, abre, fecha, ativo, cardapios_produtos(count)")
      .eq("restaurante_id", acesso.restaurante.id)
      .order("ordem")
      .order("nome"),
    supabase.rpc("cardapio_agora", { p_restaurante_id: acesso.restaurante.id }),
  ]);
  if (error) throw new Error(error.message);

  const valendoAgora: string[] = (agora as { cardapios?: string[] } | null)?.cardapios ?? [];
  const cardapios = data.map((c) => ({
    id: c.id,
    nome: c.nome,
    dias: c.dias,
    abre: c.abre,
    fecha: c.fecha,
    ativo: c.ativo,
    produtos: c.cardapios_produtos[0]?.count ?? 0,
    agora: valendoAgora.includes(c.id),
  }));

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="sr-only">Cardápios por horário</h1>
      <NovoCardapio />
      <ListaCardapios cardapios={cardapios} />
    </main>
  );
}
