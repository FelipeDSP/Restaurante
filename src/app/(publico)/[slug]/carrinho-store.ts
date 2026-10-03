"use client";

import { useCallback, useSyncExternalStore } from "react";

// Carrinho do site, salvo no navegador por restaurante. Preços aqui são só para exibição:
// o banco recalcula tudo ao criar o pedido.
export type ItemCarrinho = {
  produtoId: string;
  nome: string;
  preco: number;
  quantidade: number;
  observacao: string;
};

const VAZIO: ItemCarrinho[] = [];
const ouvintes = new Set<() => void>();
const cache = new Map<string, { bruto: string | null; itens: ItemCarrinho[] }>();

function chaveDe(restauranteId: string) {
  return `carrinho:${restauranteId}`;
}

function ler(chave: string): ItemCarrinho[] {
  let bruto: string | null = null;
  try {
    bruto = localStorage.getItem(chave);
  } catch {
    return VAZIO;
  }
  const anterior = cache.get(chave);
  if (anterior && anterior.bruto === bruto) return anterior.itens;

  let itens: ItemCarrinho[] = VAZIO;
  try {
    const valor: unknown = bruto ? JSON.parse(bruto) : [];
    if (Array.isArray(valor)) itens = valor.filter((i) => i && typeof i.produtoId === "string" && i.quantidade > 0);
  } catch {
    itens = VAZIO;
  }
  cache.set(chave, { bruto, itens });
  return itens;
}

function gravar(chave: string, itens: ItemCarrinho[]) {
  try {
    if (itens.length === 0) localStorage.removeItem(chave);
    else localStorage.setItem(chave, JSON.stringify(itens));
  } catch {
    // Navegação privada sem storage: o carrinho vale só nesta tela.
  }
  ouvintes.forEach((ouvir) => ouvir());
}

function inscrever(ouvir: () => void) {
  ouvintes.add(ouvir);
  // Outras abas do mesmo restaurante.
  window.addEventListener("storage", ouvir);
  return () => {
    ouvintes.delete(ouvir);
    window.removeEventListener("storage", ouvir);
  };
}

export function useCarrinho(restauranteId: string) {
  const chave = chaveDe(restauranteId);
  const itens = useSyncExternalStore(inscrever, () => ler(chave), () => VAZIO);

  const definir = useCallback(
    (produto: { id: string; nome: string; preco: number }, quantidade: number, observacao?: string) => {
      const atuais = ler(chave);
      const existente = atuais.find((i) => i.produtoId === produto.id);
      const qtd = Math.max(0, Math.min(99, quantidade));
      let proximos: ItemCarrinho[];
      if (qtd === 0) {
        proximos = atuais.filter((i) => i.produtoId !== produto.id);
      } else if (existente) {
        proximos = atuais.map((i) =>
          i.produtoId === produto.id
            ? { ...i, quantidade: qtd, observacao: observacao ?? i.observacao, nome: produto.nome, preco: produto.preco }
            : i,
        );
      } else {
        proximos = [...atuais, { produtoId: produto.id, nome: produto.nome, preco: produto.preco, quantidade: qtd, observacao: observacao ?? "" }];
      }
      gravar(chave, proximos);
    },
    [chave],
  );

  const limpar = useCallback(() => gravar(chave, []), [chave]);

  const quantidade = itens.reduce((soma, i) => soma + i.quantidade, 0);
  const subtotal = itens.reduce((soma, i) => soma + i.preco * i.quantidade, 0);

  return { itens, definir, limpar, quantidade, subtotal };
}
