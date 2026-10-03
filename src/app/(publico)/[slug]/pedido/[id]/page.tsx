import type { Metadata } from "next";
import { Check, CircleX } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatarBRL } from "@/lib/dinheiro";
import { nomeForma } from "@/lib/rotulos";
import { horaLocal } from "@/lib/tempo";
import { cn } from "@/lib/utils";
import { id as idSchema } from "@/lib/validacao";

import { buscarRestaurantePorSlug, consultarPedido, type PedidoPublico } from "../../dados";
import { AtualizarPeriodicamente } from "./atualizar-periodicamente";

export const metadata: Metadata = { title: "Seu pedido", robots: { index: false } };

const ETAPAS: { status: PedidoPublico["status"][]; rotulo: string }[] = [
  { status: ["recebido", "em_preparo", "pronto", "saiu_entrega", "entregue"], rotulo: "Pedido recebido" },
  { status: ["em_preparo", "pronto", "saiu_entrega", "entregue"], rotulo: "Em preparo" },
  { status: ["saiu_entrega", "entregue"], rotulo: "Saiu para entrega" },
  { status: ["entregue"], rotulo: "Entregue" },
];

const TITULO: Record<PedidoPublico["status"], string> = {
  recebido: "Recebemos seu pedido!",
  em_preparo: "Seu pedido está sendo preparado",
  pronto: "Seu pedido está pronto",
  saiu_entrega: "Seu pedido saiu para entrega",
  entregue: "Pedido entregue. Bom apetite!",
  cancelado: "Pedido cancelado",
};

export default async function PedidoPage(props: PageProps<"/[slug]/pedido/[id]">) {
  const { slug, id } = await props.params;
  if (!idSchema.safeParse(id).success) notFound();

  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) notFound();
  const pedido = await consultarPedido(id);
  // O pedido precisa ser do restaurante da URL.
  if (!pedido || pedido.restaurante_id !== restaurante.id) notFound();

  const emAndamento = pedido.status !== "entregue" && pedido.status !== "cancelado";
  const whatsapp = restaurante.whatsapp?.replace(/\D/g, "");

  return (
    <main className="flex flex-col gap-4 p-4">
      <AtualizarPeriodicamente segundos={15} ativo={emAndamento} />

      <section className="flex flex-col gap-1 rounded-xl bg-background p-4 shadow-sm" aria-live="polite">
        <p className="text-sm text-muted-foreground">
          Pedido nº {pedido.numero} · feito às {horaLocal(pedido.criado_em, restaurante.fusoHorario)}
        </p>
        <h1 className="text-2xl font-bold">{TITULO[pedido.status]}</h1>
        {emAndamento && pedido.tempo_estimado_entrega_min ? (
          <p className="text-muted-foreground">Tempo estimado: cerca de {pedido.tempo_estimado_entrega_min} minutos.</p>
        ) : null}
      </section>

      {pedido.status === "cancelado" ? (
        <section className="flex items-center gap-3 rounded-xl bg-red-50 p-4 text-red-900">
          <CircleX className="size-6 shrink-0" aria-hidden />
          <p>O restaurante cancelou este pedido. Fale com eles para mais informações.</p>
        </section>
      ) : (
        <ol className="flex flex-col gap-0 rounded-xl bg-background p-4 shadow-sm" aria-label="Andamento do pedido">
          {ETAPAS.map((etapa, i) => {
            const feita = etapa.status.includes(pedido.status);
            return (
              <li key={etapa.rotulo} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full border-2",
                      feita
                        ? "border-[var(--cor-primaria)] bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]"
                        : "border-muted-foreground/30 text-muted-foreground",
                    )}
                  >
                    {feita ? <Check className="size-4" /> : <span className="text-xs">{i + 1}</span>}
                  </span>
                  {i < ETAPAS.length - 1 ? (
                    <span className={cn("h-6 w-0.5", feita ? "bg-[var(--cor-primaria)]" : "bg-muted-foreground/30")} />
                  ) : null}
                </div>
                <span className={cn("pt-1", feita ? "font-semibold" : "text-muted-foreground")}>
                  {etapa.rotulo}
                  {feita ? <span className="sr-only"> (concluído)</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <section className="flex flex-col gap-2 rounded-xl bg-background p-4 shadow-sm" aria-labelledby="titulo-resumo">
        <h2 id="titulo-resumo" className="font-semibold">
          Resumo
        </h2>
        <ul className="divide-y">
          {pedido.itens.map((item, i) => (
            <li key={i} className="flex justify-between gap-2 py-2">
              <span className="flex flex-col">
                <span>
                  {item.quantidade}× {item.nome_produto}
                </span>
                {item.observacao ? <span className="text-sm text-muted-foreground">{item.observacao}</span> : null}
              </span>
              <span className="tabular-nums">{formatarBRL(item.total)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between text-sm">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatarBRL(pedido.subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Taxa de entrega</span>
          <span className="tabular-nums">{formatarBRL(pedido.taxa_entrega)}</span>
        </div>
        <div className="flex justify-between text-lg font-bold">
          <span>Total</span>
          <span className="tabular-nums">{formatarBRL(pedido.total)}</span>
        </div>
        {pedido.forma_pagamento_prevista ? (
          <p className="text-sm text-muted-foreground">Pagamento na entrega: {nomeForma(pedido.forma_pagamento_prevista)}</p>
        ) : null}
      </section>

      <div className="flex flex-col gap-2 text-center">
        {whatsapp ? (
          <a
            href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Olá! Sobre o pedido nº ${pedido.numero}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[var(--cor-primaria)] underline-offset-4 hover:underline"
          >
            Falar com o restaurante no WhatsApp
          </a>
        ) : null}
        <p className="text-xs text-muted-foreground">Guarde este link para acompanhar seu pedido.</p>
        <Link href={`/${restaurante.slug}`} className="text-sm text-muted-foreground underline">
          Voltar ao cardápio
        </Link>
      </div>
    </main>
  );
}
