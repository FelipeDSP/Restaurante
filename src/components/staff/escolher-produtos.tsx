"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CategoriaComProdutos = { id: string; nome: string; produtos: { id: string; nome: string }[] };

// Escolher produtos por categoria, com "Marcar todos" por categoria. Serve para ligar produtos a
// qualquer coisa pelo lado dela (o cardápio por horário, o grupo de adicionais, o setor da cozinha)
// em vez de obrigar a abrir produto por produto.
export function EscolherProdutos({
  categorias,
  escolhidos,
  aoMudar,
  vazio = "Nenhum produto cadastrado ainda.",
}: {
  categorias: CategoriaComProdutos[];
  escolhidos: string[];
  aoMudar: (produtos: string[]) => void;
  vazio?: string;
}) {
  if (categorias.length === 0) return <p className="text-sm text-muted-foreground">{vazio}</p>;

  const alternar = (produtoId: string, marcado: boolean) =>
    aoMudar(marcado ? [...escolhidos, produtoId] : escolhidos.filter((p) => p !== produtoId));

  const alternarCategoria = (categoria: CategoriaComProdutos, marcar: boolean) => {
    const ids = categoria.produtos.map((p) => p.id);
    aoMudar(marcar ? [...new Set([...escolhidos, ...ids])] : escolhidos.filter((p) => !ids.includes(p)));
  };

  return (
    <div className="flex flex-col gap-4">
      {categorias.map((categoria) => {
        const ids = categoria.produtos.map((p) => p.id);
        const todos = ids.every((id) => escolhidos.includes(id));
        return (
          <div key={categoria.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 border-b pb-1">
              <span className="text-sm font-semibold">{categoria.nome}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => alternarCategoria(categoria, !todos)}>
                {todos ? "Tirar todos" : "Marcar todos"}
              </Button>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {categoria.produtos.map((produto) => {
                const marcado = escolhidos.includes(produto.id);
                return (
                  <li key={produto.id}>
                    <label
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-2 transition-colors",
                        marcado ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={(e) => alternar(produto.id, e.target.checked)}
                        className="size-5 accent-[var(--cor-primaria-texto)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{produto.nome}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
