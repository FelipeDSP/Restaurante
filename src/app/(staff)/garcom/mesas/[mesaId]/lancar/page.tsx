import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { exigirAcesso } from "@/lib/auth/dal";
import { id as idSchema } from "@/lib/validacao";

import { carregarCardapioSalao, carregarComandaDaMesa, carregarMesa } from "../../../dados";
import { LancarItens } from "./lancar-itens";

export const metadata: Metadata = { title: "Lançar itens" };

export default async function LancarPage(props: PageProps<"/garcom/mesas/[mesaId]/lancar">) {
  const acesso = await exigirAcesso("garcom");
  const { mesaId } = await props.params;
  const { voltar } = await props.searchParams;
  const destino = voltar === "painel" ? `/painel/comandas/${mesaId}` : `/garcom/mesas/${mesaId}`;
  if (!idSchema.safeParse(mesaId).success) notFound();

  const [mesa, comanda, cardapio] = await Promise.all([
    carregarMesa(acesso.restaurante.id, mesaId),
    carregarComandaDaMesa(acesso.restaurante.id, mesaId),
    carregarCardapioSalao(acesso.restaurante.id),
  ]);
  if (!mesa) notFound();
  if (!comanda) redirect(`/garcom/mesas/${mesaId}`);

  return (
    <main className="flex flex-1 flex-col gap-3 p-4">
      {/* Comanda fechada ou cancelada por outra pessoa: a página recarrega e volta para a mesa. */}
      <AtualizarEmTempoReal restauranteId={acesso.restaurante.id} tabelas={["comandas"]} />
      <Link
        href={destino}
        className="-ml-2 flex h-11 w-fit items-center gap-1 rounded-md px-2 text-sm font-medium hover:bg-muted"
      >
        <ChevronLeft className="size-5" />
        Mesa {mesa.numero}
      </Link>
      <h1 className="text-2xl font-bold">Lançar na mesa {mesa.numero}</h1>
      {cardapio.length === 0 ? (
        <p className="text-muted-foreground">Nenhum produto disponível no cardápio.</p>
      ) : (
        <LancarItens mesaId={mesa.id} comandaId={comanda.id} destino={destino} cardapio={cardapio} />
      )}
    </main>
  );
}
