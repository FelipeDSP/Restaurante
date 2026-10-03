import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { exigirAcesso } from "@/lib/auth/dal";
import { id as idSchema } from "@/lib/validacao";

import { carregarComandaDaMesa, carregarMesa } from "../../../garcom/dados";
import { TelaComanda } from "../../../garcom/mesas/[mesaId]/tela-comanda";

export const metadata: Metadata = { title: "Comanda" };

// Mesma tela de comanda do garçom, aberta pelo caixa (pagamentos, estornos, fechamento).
export default async function ComandaPainelPage(props: PageProps<"/painel/comandas/[mesaId]">) {
  const acesso = await exigirAcesso("painel");
  const { mesaId } = await props.params;
  if (!idSchema.safeParse(mesaId).success) notFound();

  const [mesa, comanda] = await Promise.all([
    carregarMesa(acesso.restaurante.id, mesaId),
    carregarComandaDaMesa(acesso.restaurante.id, mesaId),
  ]);
  if (!mesa) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4 md:p-6">
      <AtualizarEmTempoReal restauranteId={acesso.restaurante.id} tabelas={["comandas", "itens_pedido", "pagamentos"]} />
      <Link
        href="/painel/comandas"
        className="-ml-2 flex h-10 w-fit items-center gap-1 rounded-md px-2 text-sm font-medium hover:bg-muted"
      >
        <ChevronLeft className="size-5" />
        Comandas
      </Link>
      <h1 className="text-3xl font-bold">Mesa {mesa.numero}</h1>
      {comanda ? (
        <TelaComanda
          key={comanda.id}
          mesaId={mesa.id}
          comanda={comanda}
          podeGerenciar
          fusoHorario={acesso.restaurante.fusoHorario}
          origem="painel"
        />
      ) : (
        <p className="text-muted-foreground">
          Esta mesa não tem comanda aberta. <Link href="/painel/comandas" className="underline">Voltar</Link>
        </p>
      )}
    </main>
  );
}
