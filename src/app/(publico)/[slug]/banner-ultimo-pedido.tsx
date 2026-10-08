"use client";

import { ChevronRight, Clock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { nomeStatusPedido } from "@/lib/rotulos";

import type { PedidoPublico } from "./dados";
import { useMeusPedidos } from "./meus-pedidos";

// "Acompanhar pedido nº X" no cardápio enquanto o último pedido deste aparelho está em andamento.
export function BannerUltimoPedido({ restauranteId, slug }: { restauranteId: string; slug: string }) {
  const { pedidos, esquecer } = useMeusPedidos(restauranteId);
  const ultimo = pedidos[0];
  const [status, setStatus] = useState<PedidoPublico["status"] | null>(null);

  useEffect(() => {
    if (!ultimo) return;
    let cancelado = false;
    fetch(`/api/pedidos/${ultimo.id}`, { cache: "no-store" })
      .then(async (r) => {
        if (cancelado) return;
        if (r.status === 404) {
          esquecer(ultimo.id);
          return;
        }
        if (r.ok) setStatus(((await r.json()) as PedidoPublico).status);
      })
      .catch(() => {
        // Sem rede: o banner só não aparece agora.
      });
    return () => {
      cancelado = true;
    };
  }, [ultimo, esquecer]);

  // Só aparece enquanto o pedido está em andamento.
  // Para o cliente, "recebido" (no caixa é "Novo").
  const rotulo =
    status && status !== "entregue" && status !== "cancelado" ? (status === "recebido" ? "Recebido" : nomeStatusPedido(status)) : undefined;
  if (!ultimo || !rotulo) return null;
  return (
    <Link
      href={`/${slug}/pedido/${ultimo.id}`}
      className="flex min-h-14 items-center gap-3 rounded-xl border-2 border-[var(--cor-primaria)] bg-background p-3 shadow-sm"
    >
      <Clock className="size-5 shrink-0" aria-hidden />
      <span className="flex flex-1 flex-col">
        <span className="font-semibold">Acompanhar pedido nº {ultimo.numero}</span>
        <span className="text-sm text-muted-foreground">{rotulo}</span>
      </span>
      <ChevronRight className="size-5 shrink-0" aria-hidden />
    </Link>
  );
}
