"use client";

import { ImageOff, Pencil, Plus } from "lucide-react";
import Link from "next/link";

import { ControlesOrdem, useAcao } from "@/components/staff/acoes-cliente";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatarBRL } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";

import { alternarDisponibilidade, moverProduto } from "./actions";

export type ProdutoLista = {
  id: string;
  nome: string;
  preco: number;
  foto_url: string | null;
  disponivel: boolean;
  disponivel_delivery: boolean;
};

export type CategoriaComProdutos = {
  id: string;
  nome: string;
  ativa: boolean;
  produtos: ProdutoLista[];
};

function Alternador({
  ligado,
  rotulo,
  aoAlternar,
  desabilitado,
}: {
  ligado: boolean;
  rotulo: string;
  aoAlternar: () => void;
  desabilitado: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      disabled={desabilitado}
      onClick={aoAlternar}
      className="flex h-10 items-center gap-2 rounded-md px-2 text-sm hover:bg-muted disabled:opacity-50"
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
          ligado ? "bg-[var(--cor-primaria-texto)]" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "size-5 rounded-full bg-white shadow-sm transition-transform",
            ligado ? "translate-x-5" : "translate-x-0",
          )}
        />
      </span>
      {rotulo}
    </button>
  );
}

function LinhaProduto({
  produto,
  categoriaId,
  primeiro,
  ultimo,
}: {
  produto: ProdutoLista;
  categoriaId: string;
  primeiro: boolean;
  ultimo: boolean;
}) {
  const { pendente, executar } = useAcao();

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center">
      <div className="flex flex-1 items-center gap-3">
        <ControlesOrdem
          rotulo={produto.nome}
          primeiro={primeiro}
          ultimo={ultimo}
          desabilitado={pendente}
          aoMover={(direcao) => executar(() => moverProduto(produto.id, categoriaId, direcao))}
        />
        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
          {produto.foto_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagem do Storage
            <img src={produto.foto_url} alt="" className="size-full object-cover" />
          ) : (
            <ImageOff className="size-5 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{produto.nome}</span>
          <span className="text-sm text-muted-foreground">{formatarBRL(produto.preco)}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Alternador
          ligado={produto.disponivel}
          // Desligar tira do salão e do delivery (esgotou); "Delivery" só tira do site.
          rotulo="Disponível"
          desabilitado={pendente}
          aoAlternar={() => executar(() => alternarDisponibilidade(produto.id, "disponivel", !produto.disponivel))}
        />
        <Alternador
          ligado={produto.disponivel_delivery}
          rotulo="No delivery"
          desabilitado={pendente}
          aoAlternar={() =>
            executar(() => alternarDisponibilidade(produto.id, "disponivel_delivery", !produto.disponivel_delivery))
          }
        />
        <Button variant="ghost" size="icon" aria-label={`Editar ${produto.nome}`} nativeButton={false} render={<Link href={`/painel/produtos/${produto.id}`} />}>
          <Pencil />
        </Button>
      </div>
    </li>
  );
}

export function ListaProdutos({ categorias }: { categorias: CategoriaComProdutos[] }) {
  return (
    <div className="flex flex-col gap-8">
      {categorias.map((categoria) => (
        <section key={categoria.id} aria-labelledby={`cat-${categoria.id}`} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id={`cat-${categoria.id}`} className="flex items-center gap-2 text-lg font-semibold">
              {categoria.nome}
              {!categoria.ativa ? <Badge variant="secondary">Categoria inativa</Badge> : null}
            </h2>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false} render={<Link href={`/painel/produtos/novo?categoria=${categoria.id}`} />}
            >
              <Plus />
              Produto
            </Button>
          </div>
          {categoria.produtos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum produto nesta categoria.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {categoria.produtos.map((produto, i) => (
                <LinhaProduto
                  key={produto.id}
                  produto={produto}
                  categoriaId={categoria.id}
                  primeiro={i === 0}
                  ultimo={i === categoria.produtos.length - 1}
                />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
