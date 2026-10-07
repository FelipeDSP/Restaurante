"use client";

import { useCallback, useSyncExternalStore } from "react";

import { type AdicionalEscolhido, chaveDaEscolha, precoDasOpcoes } from "@/lib/adicionais";

// Carrinho do site, salvo no navegador por restaurante. Preços aqui são só para exibição:
// o banco recalcula tudo ao criar o pedido.
// Cada linha é uma combinação de produto + opções + observação (`chave`).
export type ItemCarrinho = {
  chave: string;
  produtoId: string;
  nome: string;
  preco: number; // preço do produto, sem as opções
  adicionais: AdicionalEscolhido[];
  quantidade: number;
  observacao: string;
};

export function precoUnitario(item: Pick<ItemCarrinho, "preco" | "adicionais">): number {
  return item.preco + precoDasOpcoes(item.adicionais);
}

const VAZIO: ItemCarrinho[] = [];
const ouvintes = new Set<() => void>();
const cache = new Map<string, { bruto: string | null; itens: ItemCarrinho[] }>();

function chaveDe(restauranteId: string) {
  return `carrinho:${restauranteId}`;
}

// Aceita também o formato antigo (sem chave nem opções).
function normalizar(valor: unknown): ItemCarrinho | null {
  if (!valor || typeof valor !== "object") return null;
  const i = valor as Partial<ItemCarrinho>;
  if (typeof i.produtoId !== "string" || typeof i.quantidade !== "number" || i.quantidade <= 0) return null;
  const adicionais = Array.isArray(i.adicionais) ? i.adicionais : [];
  const observacao = typeof i.observacao === "string" ? i.observacao : "";
  return {
    chave: typeof i.chave === "string" ? i.chave : chaveDaEscolha(i.produtoId, adicionais.map((a) => a.id)),
    produtoId: i.produtoId,
    nome: String(i.nome ?? ""),
    preco: Number(i.preco) || 0,
    adicionais,
    quantidade: Math.min(99, Math.floor(i.quantidade)),
    observacao,
  };
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
    if (Array.isArray(valor)) itens = valor.map(normalizar).filter((i): i is ItemCarrinho => i !== null);
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

  // Soma na linha igual (mesmo produto, opções e observação) ou cria uma nova.
  const adicionar = useCallback(
    (
      produto: { id: string; nome: string; preco: number },
      escolha: { adicionais?: AdicionalEscolhido[]; quantidade?: number; observacao?: string } = {},
    ) => {
      const adicionais = escolha.adicionais ?? [];
      const observacao = escolha.observacao?.trim() ?? "";
      const quantidade = escolha.quantidade ?? 1;
      const linha = chaveDaEscolha(produto.id, adicionais.map((a) => a.id), observacao);
      const atuais = ler(chave);
      const existente = atuais.find((i) => i.chave === linha);
      gravar(
        chave,
        existente
          ? atuais.map((i) => (i.chave === linha ? { ...i, quantidade: Math.min(99, i.quantidade + quantidade) } : i))
          : [
              ...atuais,
              { chave: linha, produtoId: produto.id, nome: produto.nome, preco: produto.preco, adicionais, quantidade, observacao },
            ],
      );
    },
    [chave],
  );

  const alterarQuantidade = useCallback(
    (linha: string, quantidade: number) => {
      const qtd = Math.max(0, Math.min(99, quantidade));
      const atuais = ler(chave);
      gravar(
        chave,
        qtd === 0 ? atuais.filter((i) => i.chave !== linha) : atuais.map((i) => (i.chave === linha ? { ...i, quantidade: qtd } : i)),
      );
    },
    [chave],
  );

  const alterarObservacao = useCallback(
    (linha: string, observacao: string) => {
      gravar(
        chave,
        ler(chave).map((i) => (i.chave === linha ? { ...i, observacao } : i)),
      );
    },
    [chave],
  );

  // Nome e preços atuais do cardápio (o carrinho pode ter ficado desatualizado).
  const atualizarDados = useCallback(
    (linha: string, dados: Pick<ItemCarrinho, "nome" | "preco" | "adicionais">) => {
      gravar(
        chave,
        ler(chave).map((i) => (i.chave === linha ? { ...i, ...dados } : i)),
      );
    },
    [chave],
  );

  const limpar = useCallback(() => gravar(chave, []), [chave]);

  const quantidade = itens.reduce((soma, i) => soma + i.quantidade, 0);
  const subtotal = itens.reduce((soma, i) => soma + precoUnitario(i) * i.quantidade, 0);

  return { itens, adicionar, alterarQuantidade, alterarObservacao, atualizarDados, limpar, quantidade, subtotal };
}
