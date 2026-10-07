"use client";

// Último pedido feito neste aparelho, por restaurante: o cliente que fechou a aba
// encontra o acompanhamento de volta pelo cardápio.
export type UltimoPedido = { id: string; numero: number; criadoEm: string };

export const chaveUltimoPedido = (restauranteId: string) => `ultimo-pedido:${restauranteId}`;

export const SEM_PEDIDO: UltimoPedido | null = null;

export function normalizarUltimoPedido(valor: unknown): UltimoPedido | null {
  if (!valor || typeof valor !== "object") return null;
  const v = valor as Partial<UltimoPedido>;
  if (typeof v.id !== "string" || typeof v.numero !== "number" || typeof v.criadoEm !== "string") return null;
  return { id: v.id, numero: v.numero, criadoEm: v.criadoEm };
}
