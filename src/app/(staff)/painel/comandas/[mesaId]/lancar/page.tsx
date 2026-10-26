import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { exigirPermissao } from "@/lib/auth/dal";
import { id as idSchema } from "@/lib/validacao";

import { carregarCardapioSalao, carregarComandaDaMesa, carregarMesa } from "../../../../garcom/dados";
import { LancarItens } from "../../../../garcom/mesas/[mesaId]/lancar/lancar-itens";

export const metadata: Metadata = { title: "Lançar itens" };

// Lançar pelo painel: o mesmo lançamento do garçom, com o cardápio e o pedido lado a lado.
export default async function LancarPainelPage(props: PageProps<"/painel/comandas/[mesaId]/lancar">) {
  const acesso = await exigirPermissao("painel", "comandas_painel", "garcom_app");
  const { mesaId } = await props.params;
  if (!idSchema.safeParse(mesaId).success) notFound();
  const destino = `/painel/comandas/${mesaId}`;

  const [mesa, comanda, cardapio] = await Promise.all([
    carregarMesa(acesso.restaurante.id, mesaId),
    carregarComandaDaMesa(acesso.restaurante.id, mesaId),
    carregarCardapioSalao(acesso.restaurante.id),
  ]);
  if (!mesa) notFound();
  if (!comanda) redirect(destino);

  return (
    <main className="flex w-full flex-1 flex-col gap-3 p-4 md:p-6">
      {/* Comanda fechada ou cancelada por outra pessoa: a página recarrega e volta para a mesa. */}
      <AtualizarEmTempoReal restauranteId={acesso.restaurante.id} tabelas={["comandas"]} />
      <Link href={destino} className="-ml-2 flex h-10 w-fit items-center gap-1 rounded-md px-2 text-sm font-medium hover:bg-muted">
        <ChevronLeft className="size-5" />
        Mesa {mesa.numero}
      </Link>
      <h1 className="text-2xl font-bold">Lançar na mesa {mesa.numero}</h1>
      {cardapio.length === 0 ? (
        <p className="text-muted-foreground">Nenhum produto disponível no cardápio.</p>
      ) : (
        <LancarItens mesaId={mesa.id} comandaId={comanda.id} destino={destino} cardapio={cardapio} largo />
      )}
    </main>
  );
}
