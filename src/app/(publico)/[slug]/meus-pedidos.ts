"use client";

import { useCallback } from "react";

import { useRascunho } from "@/lib/rascunho";

// Pedidos feitos neste aparelho, por restaurante (sem conta): o cliente que fechou a aba
// acha o acompanhamento de volta pelo cardápio ou por "Meus pedidos". Nada vai para o servidor.
export type PedidoGuardado = { id: string; numero: number; criadoEm: string };

const MAXIMO = 20;
const NENHUM: PedidoGuardado[] = [];

const chave = (restauranteId: string) => `meus-pedidos:${restauranteId}`;

function normalizarPedido(valor: unknown): PedidoGuardado | null {
  if (!valor || typeof valor !== "object") return null;
  const v = valor as Partial<PedidoGuardado>;
  if (typeof v.id !== "string" || typeof v.numero !== "number" || typeof v.criadoEm !== "string") return null;
  return { id: v.id, numero: v.numero, criadoEm: v.criadoEm };
}

function normalizar(valor: unknown): PedidoGuardado[] | null {
  if (!Array.isArray(valor)) return null;
  return valor.flatMap((v) => normalizarPedido(v) ?? []).slice(0, MAXIMO);
}

// Mais recente primeiro.
export function useMeusPedidos(restauranteId: string) {
  const [pedidos, definir, limpar] = useRascunho(chave(restauranteId), NENHUM, normalizar);

  const guardar = useCallback(
    (pedido: PedidoGuardado) =>
      definir((atual) => {
        if (atual[0]?.id === pedido.id) return atual;
        return [pedido, ...atual.filter((p) => p.id !== pedido.id)]
          .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
          .slice(0, MAXIMO);
      }),
    [definir],
  );

  // Pedido que não existe mais (ex.: banco recriado) sai da lista.
  const esquecer = useCallback((id: string) => definir((atual) => atual.filter((p) => p.id !== id)), [definir]);

  return { pedidos, guardar, esquecer, limpar };
}
