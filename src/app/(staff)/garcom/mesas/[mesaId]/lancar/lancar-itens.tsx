"use client";

import { MessageSquarePlus, Minus, Plus, Search, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarBRL } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";

import { lancarItens } from "../../../actions";
import type { CategoriaCardapio, ProdutoCardapio } from "../../../dados";

type Linha = { quantidade: number; observacao: string };

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function LinhaProduto({
  produto,
  linha,
  aoMudar,
}: {
  produto: ProdutoCardapio;
  linha: Linha | undefined;
  aoMudar: (linha: Linha | undefined) => void;
}) {
  const [mostrarObs, setMostrarObs] = useState(Boolean(linha?.observacao));
  const quantidade = linha?.quantidade ?? 0;

  return (
    <li className={cn("rounded-xl border p-3 transition-colors", quantidade > 0 && "border-[var(--cor-primaria)] bg-[var(--cor-primaria)]/5")}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex min-h-12 flex-1 flex-col items-start text-left"
          onClick={() => aoMudar({ quantidade: Math.min(99, quantidade + 1), observacao: linha?.observacao ?? "" })}
          aria-label={`Adicionar ${produto.nome}`}
        >
          <span className="font-medium">{produto.nome}</span>
          <span className="text-sm text-muted-foreground">{formatarBRL(produto.preco)}</span>
        </button>
        {quantidade > 0 ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11"
              aria-label={`Diminuir ${produto.nome}`}
              onClick={() =>
                aoMudar(quantidade > 1 ? { quantidade: quantidade - 1, observacao: linha?.observacao ?? "" } : undefined)
              }
            >
              <Minus />
            </Button>
            <span className="w-7 text-center text-lg font-bold tabular-nums" aria-live="polite">
              {quantidade}
            </span>
            <Button
              type="button"
              size="icon"
              className="size-11"
              aria-label={`Aumentar ${produto.nome}`}
              onClick={() => aoMudar({ quantidade: Math.min(99, quantidade + 1), observacao: linha?.observacao ?? "" })}
            >
              <Plus />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="icon"
            className="size-11"
            aria-label={`Adicionar ${produto.nome}`}
            onClick={() => aoMudar({ quantidade: 1, observacao: "" })}
          >
            <Plus />
          </Button>
        )}
      </div>
      {quantidade > 0 ? (
        mostrarObs ? (
          <Input
            value={linha?.observacao ?? ""}
            onChange={(e) => aoMudar({ quantidade, observacao: e.target.value })}
            placeholder="Observação (ex.: sem cebola, ao ponto)"
            maxLength={300}
            className="mt-2 h-11"
            aria-label={`Observação de ${produto.nome}`}
            autoFocus
          />
        ) : (
          <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => setMostrarObs(true)}>
            <MessageSquarePlus />
            Observação
          </Button>
        )
      ) : null}
    </li>
  );
}

export function LancarItens({
  comandaId,
  destino,
  cardapio,
}: {
  comandaId: string;
  // Para onde ir depois de enviar (comanda no app do garçom ou no painel).
  destino: string;
  cardapio: CategoriaCardapio[];
}) {
  const router = useRouter();
  const [categoriaAtiva, setCategoriaAtiva] = useState(cardapio[0]?.id ?? "");
  const [busca, setBusca] = useState("");
  const [linhas, setLinhas] = useState<Record<string, Linha>>({});
  const { pendente, executar } = useAcao();

  const produtosPorId = useMemo(
    () => new Map(cardapio.flatMap((c) => c.produtos.map((p) => [p.id, p] as const))),
    [cardapio],
  );

  const visiveis = useMemo(() => {
    const termo = normalizar(busca.trim());
    if (termo) {
      return cardapio.flatMap((c) => c.produtos).filter((p) => normalizar(p.nome).includes(termo));
    }
    return cardapio.find((c) => c.id === categoriaAtiva)?.produtos ?? [];
  }, [busca, cardapio, categoriaAtiva]);

  const selecionados = Object.entries(linhas);
  const totalItens = selecionados.reduce((soma, [, l]) => soma + l.quantidade, 0);
  const totalValor = selecionados.reduce(
    (soma, [produtoId, l]) => soma + (produtosPorId.get(produtoId)?.preco ?? 0) * l.quantidade,
    0,
  );

  function alterar(produtoId: string, linha: Linha | undefined) {
    setLinhas((atual) => {
      const proximo = { ...atual };
      if (linha) proximo[produtoId] = linha;
      else delete proximo[produtoId];
      return proximo;
    });
  }

  function enviar() {
    const itens = selecionados.map(([produtoId, l]) => ({
      produtoId,
      quantidade: l.quantidade,
      observacao: l.observacao.trim() || null,
    }));
    executar(() => lancarItens(comandaId, itens), () => router.push(destino));
  }

  return (
    <div className="flex flex-1 flex-col gap-3 pb-28">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar produto"
          className="h-11 pl-9"
          aria-label="Buscar produto"
          type="search"
        />
      </div>

      {!busca ? (
        <div role="tablist" aria-label="Categorias" className="-mx-4 flex gap-2 overflow-x-auto sem-barra-rolagem px-4 pb-1">
          {cardapio.map((c) => {
            const naCategoria = c.produtos.reduce((soma, p) => soma + (linhas[p.id]?.quantidade ?? 0), 0);
            return (
              <Button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={c.id === categoriaAtiva}
                variant={c.id === categoriaAtiva ? "default" : "outline"}
                className="h-11 shrink-0 rounded-full px-4"
                onClick={() => setCategoriaAtiva(c.id)}
              >
                {c.nome}
                {naCategoria > 0 ? <span className="ml-1 rounded-full bg-background/30 px-1.5 text-xs">{naCategoria}</span> : null}
              </Button>
            );
          })}
        </div>
      ) : null}

      <ul className="flex flex-col gap-2">
        {visiveis.map((produto) => (
          <LinhaProduto
            key={produto.id}
            produto={produto}
            linha={linhas[produto.id]}
            aoMudar={(linha) => alterar(produto.id, linha)}
          />
        ))}
        {visiveis.length === 0 ? <li className="py-6 text-center text-muted-foreground">Nenhum produto encontrado.</li> : null}
      </ul>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          <Button
            type="button"
            className="h-14 w-full justify-between text-base"
            disabled={totalItens === 0 || pendente}
            onClick={enviar}
          >
            <span className="flex items-center gap-2">
              <Send />
              {pendente ? "Enviando..." : totalItens === 0 ? "Escolha os itens" : `Enviar ${totalItens} ${totalItens === 1 ? "item" : "itens"}`}
            </span>
            <span className="tabular-nums">{formatarBRL(totalValor)}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
