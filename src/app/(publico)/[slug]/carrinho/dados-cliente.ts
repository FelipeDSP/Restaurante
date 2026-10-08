"use client";

import { useRascunho } from "@/lib/rascunho";

import type { DadosPedido } from "./actions";

// Dados de entrega do cliente, guardados só neste aparelho (sem conta): ficam para o próximo
// pedido e sobrevivem a queda de rede ou recarga. "Meus pedidos" mostra e deixa apagar.
export const FORMAS = [
  { valor: "pix", rotulo: "Pix" },
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "credito", rotulo: "Crédito" },
  { valor: "debito", rotulo: "Débito" },
] as const;

export type FormCheckout = {
  nome: string;
  telefone: string;
  bairroId: string;
  rua: string;
  numero: string;
  complemento: string;
  referencia: string;
  forma: DadosPedido["forma"];
  trocoPara: string;
  observacao: string;
};

export const FORM_VAZIO: FormCheckout = {
  nome: "",
  telefone: "",
  bairroId: "",
  rua: "",
  numero: "",
  complemento: "",
  referencia: "",
  forma: "pix",
  trocoPara: "",
  observacao: "",
};

// O rascunho vem do aparelho: só aceita os campos conhecidos, em texto.
function normalizarForm(valor: unknown): FormCheckout | null {
  if (!valor || typeof valor !== "object") return null;
  const salvo = valor as Record<string, unknown>;
  const form = Object.fromEntries(
    Object.entries(FORM_VAZIO).map(([campo, padrao]) => [campo, typeof salvo[campo] === "string" ? salvo[campo] : padrao]),
  ) as FormCheckout;
  if (!FORMAS.some((f) => f.valor === form.forma)) form.forma = "pix";
  return form;
}

export function useDadosCliente(restauranteId: string) {
  return useRascunho(`checkout:${restauranteId}`, FORM_VAZIO, normalizarForm);
}

export const temDadosSalvos = (f: FormCheckout) => Boolean(f.nome || f.telefone || f.rua);
