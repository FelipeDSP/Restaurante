"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { GRUPOS, type ItemNavegacao, itemAtivo } from "./navegacao";

type Props = { itens: ItemNavegacao[]; novos: number };

function Contador({ valor }: { valor: number }) {
  return (
    <span
      className="flex min-w-5 items-center justify-center rounded-full bg-[var(--cor-secundaria)] px-1.5 text-xs font-bold text-[var(--cor-secundaria-contraste)]"
      aria-label={`${valor} novos`}
    >
      {valor}
    </span>
  );
}

function ListaAgrupada({ itens, novos, ativo, aoNavegar }: Props & { ativo: string | null; aoNavegar?: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      {GRUPOS.map((grupo) => {
        const doGrupo = itens.filter((i) => i.grupo === grupo);
        if (doGrupo.length === 0) return null;
        return (
          <div key={grupo} className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{grupo}</p>
            {doGrupo.map((item) => {
              const atual = item.href === ativo;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={aoNavegar}
                  aria-current={atual ? "page" : undefined}
                  className={cn(
                    "flex min-h-10 items-center justify-between gap-2 rounded-md px-3 text-sm font-medium",
                    atual ? "bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]" : "hover:bg-muted",
                  )}
                >
                  {item.rotulo}
                  {item.href === "/painel/delivery" && novos > 0 ? <Contador valor={novos} /> : null}
                </Link>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// Computador: barra lateral com todos os itens agrupados (antes, metade do menu ficava escondida).
export function MenuLateral({ itens, novos }: Props) {
  const ativo = itemAtivo(itens, usePathname());
  return (
    <nav aria-label="Painel" className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-56 shrink-0 overflow-y-auto border-r bg-background p-3 lg:block print:hidden">
      <ListaAgrupada itens={itens} novos={novos} ativo={ativo} />
    </nav>
  );
}

// Celular e tablet: atalhos da operação + "Menu" com a lista completa.
export function MenuCelular({ itens, novos }: Props) {
  const caminho = usePathname();
  const ativo = itemAtivo(itens, caminho);
  const [aberto, setAberto] = useState(false);
  // O portal fica dentro da tela do restaurante para herdar as cores da marca.
  const [ancora, setAncora] = useState<HTMLSpanElement | null>(null);
  const atalhos = itens.filter((i) => i.grupo === "Operação" && i.href !== "/cozinha");

  return (
    <nav aria-label="Painel" className="flex gap-1 overflow-x-auto sem-barra-rolagem px-2 pb-2 lg:hidden">
      {atalhos.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.href === ativo ? "page" : undefined}
          className={cn(
            "flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium",
            item.href === ativo ? "bg-black/20" : "hover:bg-black/10",
          )}
        >
          {item.rotulo}
          {item.href === "/painel/delivery" && novos > 0 ? <Contador valor={novos} /> : null}
        </Link>
      ))}
      <Dialog.Root open={aberto} onOpenChange={setAberto}>
        <span ref={setAncora} hidden />
        <Dialog.Trigger className="ml-auto flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-semibold hover:bg-black/10">
          <Menu className="size-4" aria-hidden />
          Menu
        </Dialog.Trigger>
        <Dialog.Portal container={ancora?.parentElement ?? undefined}>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
          <Dialog.Popup className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-background text-foreground shadow-xl outline-none transition-transform duration-200 data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full">
            <div className="flex items-center justify-between border-b p-3">
              <Dialog.Title className="px-1 text-base font-semibold">Menu</Dialog.Title>
              <Dialog.Close aria-label="Fechar" className="flex size-11 items-center justify-center rounded-full hover:bg-muted">
                <X className="size-5" />
              </Dialog.Close>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <ListaAgrupada itens={itens} novos={novos} ativo={ativo} aoNavegar={() => setAberto(false)} />
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </nav>
  );
}
