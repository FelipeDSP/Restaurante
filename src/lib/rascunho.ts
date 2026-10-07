"use client";

import { useCallback, useSyncExternalStore } from "react";

// Rascunho guardado no aparelho (formulário do cliente, pedido que o garçom está montando).
// Sobrevive a queda de rede, recarga e "Tentar de novo". `local` fica até ser limpo;
// `sessao` some ao fechar a aba.
type Armazenamento = "local" | "sessao";

const ouvintes = new Set<() => void>();
const cache = new Map<string, { bruto: string; valor: unknown }>();
// Quando o aparelho não deixa gravar (navegação privada, armazenamento cheio), vale só nesta tela.
const memoria = new Map<string, unknown>();

function area(tipo: Armazenamento): Storage {
  return tipo === "local" ? window.localStorage : window.sessionStorage;
}

function ler<T>(tipo: Armazenamento, chave: string, inicial: T, normalizar: (v: unknown) => T | null): T {
  const id = `${tipo}:${chave}`;
  if (memoria.has(id)) return memoria.get(id) as T;
  let bruto: string | null;
  try {
    bruto = area(tipo).getItem(chave);
  } catch {
    return inicial;
  }
  if (bruto === null) return inicial;
  const anterior = cache.get(id);
  if (anterior && anterior.bruto === bruto) return anterior.valor as T;

  let valor = inicial;
  try {
    valor = normalizar(JSON.parse(bruto)) ?? inicial;
  } catch {
    valor = inicial;
  }
  cache.set(id, { bruto, valor });
  return valor;
}

function inscrever(ouvir: () => void) {
  ouvintes.add(ouvir);
  window.addEventListener("storage", ouvir);
  return () => {
    ouvintes.delete(ouvir);
    window.removeEventListener("storage", ouvir);
  };
}

/**
 * `inicial` e `normalizar` precisam ser estáveis (constante do módulo ou useMemo/useCallback).
 * `normalizar` valida o que veio do aparelho e devolve null se não servir.
 */
export function useRascunho<T>(
  chave: string,
  inicial: T,
  normalizar: (v: unknown) => T | null,
  tipo: Armazenamento = "local",
) {
  const valor = useSyncExternalStore(
    inscrever,
    () => ler(tipo, chave, inicial, normalizar),
    () => inicial,
  );

  const definir = useCallback(
    (proximo: T | ((atual: T) => T)) => {
      const atual = ler(tipo, chave, inicial, normalizar);
      const novo = typeof proximo === "function" ? (proximo as (a: T) => T)(atual) : proximo;
      try {
        area(tipo).setItem(chave, JSON.stringify(novo));
        memoria.delete(`${tipo}:${chave}`);
      } catch {
        memoria.set(`${tipo}:${chave}`, novo);
      }
      ouvintes.forEach((ouvir) => ouvir());
    },
    [chave, inicial, normalizar, tipo],
  );

  const limpar = useCallback(() => {
    memoria.delete(`${tipo}:${chave}`);
    try {
      area(tipo).removeItem(chave);
    } catch {
      // nada a limpar
    }
    ouvintes.forEach((ouvir) => ouvir());
  }, [chave, tipo]);

  return [valor, definir, limpar] as const;
}
