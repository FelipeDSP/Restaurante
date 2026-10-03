"use client";

import { Minus, Plus, ShoppingBag } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatarBRL } from "@/lib/dinheiro";

import { useCarrinho } from "./carrinho-store";

export function AdicionarProduto({
  restauranteId,
  produto,
}: {
  restauranteId: string;
  produto: { id: string; nome: string; preco: number };
}) {
  const { itens, definir } = useCarrinho(restauranteId);
  const quantidade = itens.find((i) => i.produtoId === produto.id)?.quantidade ?? 0;

  if (quantidade === 0) {
    return (
      <Button
        type="button"
        size="sm"
        className="h-10 rounded-full px-4"
        onClick={() => definir(produto, 1)}
        aria-label={`Adicionar ${produto.nome} ao carrinho`}
      >
        <Plus />
        Adicionar
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-full border bg-background p-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 rounded-full"
        aria-label={`Remover um ${produto.nome}`}
        onClick={() => definir(produto, quantidade - 1)}
      >
        <Minus />
      </Button>
      <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite">
        {quantidade}
      </span>
      <Button
        type="button"
        size="icon"
        className="size-9 rounded-full"
        aria-label={`Adicionar mais um ${produto.nome}`}
        onClick={() => definir(produto, quantidade + 1)}
      >
        <Plus />
      </Button>
    </div>
  );
}

export function BarraCarrinho({ restauranteId, slug }: { restauranteId: string; slug: string }) {
  const { quantidade, subtotal } = useCarrinho(restauranteId);
  if (quantidade === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 p-3">
      <Link
        href={`/${slug}/carrinho`}
        className="mx-auto flex h-14 max-w-2xl items-center justify-between rounded-xl bg-[var(--cor-primaria)] px-5 font-semibold text-[var(--cor-primaria-contraste)] shadow-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className="flex items-center gap-2">
          <ShoppingBag className="size-5" />
          Ver carrinho · {quantidade} {quantidade === 1 ? "item" : "itens"}
        </span>
        <span className="tabular-nums">{formatarBRL(subtotal)}</span>
      </Link>
    </div>
  );
}

export function IconeCarrinho({ restauranteId, slug }: { restauranteId: string; slug: string }) {
  const { quantidade } = useCarrinho(restauranteId);
  return (
    <Link
      href={`/${slug}/carrinho`}
      aria-label={`Carrinho com ${quantidade} ${quantidade === 1 ? "item" : "itens"}`}
      className="relative flex size-11 items-center justify-center rounded-full hover:bg-black/10"
    >
      <ShoppingBag className="size-5" />
      {quantidade > 0 ? (
        <span className="absolute -top-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-[var(--cor-secundaria)] text-xs font-bold text-[var(--cor-secundaria-contraste)]">
          {quantidade}
        </span>
      ) : null}
    </Link>
  );
}
