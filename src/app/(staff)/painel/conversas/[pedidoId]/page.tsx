import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { exigirPermissao } from "@/lib/auth/dal";

import { CartaoPedido } from "../../delivery/cartao-pedido";
import { carregarEntregadores, carregarPedidosDelivery } from "../../delivery/dados";
import { ConversaPedido } from "../conversa-pedido";
import { carregarConversas } from "../dados";
import { ListaConversas } from "../lista-conversas";

export const metadata: Metadata = { title: "Conversas" };

// Uma conversa com o pedido ao lado (o mesmo cartão do Delivery: aceitar, andar, editar, entregador).
export default async function ConversaPage({ params }: PageProps<"/painel/conversas/[pedidoId]">) {
  const acesso = await exigirPermissao("painel", "delivery");
  const { pedidoId } = await params;
  if (!z.guid().safeParse(pedidoId).success) notFound();
  const restauranteId = acesso.restaurante.id;
  const fuso = acesso.restaurante.fusoHorario;

  const [conversas, [pedido], entregadores] = await Promise.all([
    carregarConversas(restauranteId, fuso),
    carregarPedidosDelivery(restauranteId, fuso, { ids: [pedidoId] }),
    carregarEntregadores(restauranteId),
  ]);
  if (!pedido) notFound();

  return (
    <main className="flex flex-1 flex-col gap-3 p-4 md:p-6">
      <AtualizarEmTempoReal restauranteId={restauranteId} tabelas={["pedidos", "pagamentos", "tarefas_producao", "pedidos_mensagens"]} />
      <div className="flex items-center gap-2">
        <Link
          href="/painel/conversas"
          aria-label="Voltar para as conversas"
          className="flex size-11 items-center justify-center rounded-full hover:bg-muted lg:hidden"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <h1 className="text-2xl font-semibold">
          <span className="hidden lg:inline">Conversas</span>
          <span className="lg:hidden">
            Nº {pedido.numero} · {pedido.clienteNome}
          </span>
        </h1>
      </div>
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr_20rem] xl:grid-cols-[20rem_1fr_22rem]">
        <div className="hidden lg:block">
          <ListaConversas conversas={conversas} selecionada={pedido.id} />
        </div>
        <section aria-label={`Conversa do pedido ${pedido.numero}`} className="flex flex-col gap-2">
          <h2 className="hidden font-semibold lg:block">
            Nº {pedido.numero} · {pedido.clienteNome}
          </h2>
          <ConversaPedido pedidoId={pedido.id} conversa={pedido.conversa} />
        </section>
        <section aria-label="Pedido" className="flex flex-col gap-2">
          <h2 className="font-semibold">Pedido</h2>
          <CartaoPedido pedido={pedido} entregadores={entregadores} semConversa />
        </section>
      </div>
    </main>
  );
}
