"use client";

import { useSyncExternalStore } from "react";

// Preferências desta tela (cada aparelho tem as suas): impressão automática ligada
// e tickets já impressos, para não imprimir de novo ao recarregar.
const ouvintes = new Set<() => void>();
const cache = new Map<string, { bruto: string | null; valor: unknown }>();
const VAZIO: ReadonlySet<string> = new Set();

// Sem localStorage (navegação privada), guarda em memória enquanto a tela estiver aberta.
const memoria = new Map<string, string>();

function lerBruto(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return memoria.get(chave) ?? null;
  }
}

function ler<T>(chave: string, converter: (bruto: string | null) => T): T {
  const bruto = lerBruto(chave);
  const anterior = cache.get(chave);
  if (anterior && anterior.bruto === bruto) return anterior.valor as T;
  const valor = converter(bruto);
  cache.set(chave, { bruto, valor });
  return valor;
}

function gravar(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    memoria.set(chave, valor);
  }
  ouvintes.forEach((ouvir) => ouvir());
}

function inscrever(ouvir: () => void) {
  ouvintes.add(ouvir);
  window.addEventListener("storage", ouvir);
  return () => {
    ouvintes.delete(ouvir);
    window.removeEventListener("storage", ouvir);
  };
}

const chaveAuto = (restauranteId: string) => `cozinha:auto:${restauranteId}`;
const chaveImpressos = (restauranteId: string) => `cozinha:impressos:${restauranteId}`;

const lerImpressos = (bruto: string | null): ReadonlySet<string> => {
  try {
    const lista: unknown = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? new Set(lista.filter((x): x is string => typeof x === "string")) : VAZIO;
  } catch {
    return VAZIO;
  }
};

export function useImpressaoAutomatica(restauranteId: string) {
  const ligada = useSyncExternalStore(inscrever, () => ler(chaveAuto(restauranteId), (b) => b === "1"), () => false);
  const impressos = useSyncExternalStore(inscrever, () => ler(chaveImpressos(restauranteId), lerImpressos), () => VAZIO);

  function marcarImpressos(ids: string[]) {
    const atuais = ler(chaveImpressos(restauranteId), lerImpressos);
    // Guarda só os últimos 300 para não crescer sem fim.
    const lista = [...atuais, ...ids.filter((id) => !atuais.has(id))].slice(-300);
    gravar(chaveImpressos(restauranteId), JSON.stringify(lista));
  }

  function definirLigada(valor: boolean) {
    gravar(chaveAuto(restauranteId), valor ? "1" : "0");
  }

  return { ligada, impressos, marcarImpressos, definirLigada };
}
