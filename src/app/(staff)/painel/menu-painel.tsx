"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Bike, ChartColumn, ChefHat, CookingPot, House, LayoutGrid, type LucideIcon, Menu, Wallet, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { GRUPOS, type ItemNavegacao, itemAtivo, itemDaPagina } from "./navegacao";

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

// Ícone de cada aba do rodapé (o resto do menu fica no "Mais").
const ICONES: Record<string, LucideIcon> = {
  "/painel": House,
  "/painel/delivery": Bike,
  "/painel/comandas": LayoutGrid,
  "/painel/comandas/pracas": ChefHat,
  "/painel/caixa": Wallet,
  "/painel/relatorios": ChartColumn,
  "/cozinha": CookingPot,
};

// Telas com botões próprios no rodapé (a mesa e o lançamento): a barra de abas sai da frente.
const TELA_COM_BARRA_PROPRIA = /^\/painel\/comandas\/(?!pracas(\/|$))[^/]+/;

type Aba = { href: string; rotulo: string };

// Poucas áreas (ex.: só Mesas): o rodapé mostra as abas de dentro delas (Mesas, Praças).
function abasDeDentro(itens: ItemNavegacao[]) {
  return itens.filter((i) => i.grupo === "Operação").length < 3;
}

// Celular e tablet: o painel vira app, com as áreas da pessoa em abas no rodapé (alcance do polegar)
// e "Mais" com o menu completo. Quem tem poucas áreas (ex.: garçom) vê as abas de dentro delas
// (Mesas e Praças).
export function BarraApp({ itens, novos }: Props) {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  // O portal fica dentro da tela do restaurante para herdar as cores da marca.
  const [ancora, setAncora] = useState<HTMLSpanElement | null>(null);
  if (TELA_COM_BARRA_PROPRIA.test(caminho)) return null;

  const operacao = itens.filter((i) => i.grupo === "Operação");
  let abas: Aba[] = operacao.map((i) => ({ href: i.href, rotulo: i.rotulo }));
  if (abasDeDentro(itens)) {
    abas = operacao.flatMap((i) => (i.secoes && i.secoes.length > 1 ? i.secoes : [{ href: i.href, rotulo: i.rotulo }]));
  }
  // Até 5 abas cabem; com mais, ficam 4 e o "Mais".
  const visiveis = abas.length > 5 ? abas.slice(0, 4) : abas;
  const temMais = itens.length > operacao.length || abas.length > visiveis.length;
  const ativo = itemAtivo(itens, caminho);
  const abaAtiva = (href: string) =>
    visiveis.some((a) => a.href === caminho) ? href === caminho : href === ativo;
  const colunas = visiveis.length + (temMais ? 1 : 0);

  return (
    <nav
      aria-label="Áreas"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden"
    >
      <div className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` }}>
        {visiveis.map((aba) => {
          const Icone = ICONES[aba.href] ?? LayoutGrid;
          const atual = abaAtiva(aba.href);
          return (
            <Link
              key={aba.href}
              href={aba.href}
              aria-current={atual ? "page" : undefined}
              className={cn(
                "relative flex h-16 min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-xs font-semibold",
                atual ? "text-[var(--cor-primaria-texto)]" : "text-muted-foreground",
              )}
            >
              <Icone className="size-6" aria-hidden />
              <span className="max-w-full truncate">{aba.rotulo}</span>
              {aba.href === "/painel/delivery" && novos > 0 ? (
                <span className="absolute top-1.5 left-1/2 ml-2">
                  <Contador valor={novos} />
                </span>
              ) : null}
            </Link>
          );
        })}
        {temMais ? (
          <Dialog.Root open={aberto} onOpenChange={setAberto}>
            <span ref={setAncora} hidden />
            <Dialog.Trigger className="flex h-16 min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-xs font-semibold text-muted-foreground">
              <Menu className="size-6" aria-hidden />
              Mais
            </Dialog.Trigger>
            <Dialog.Portal container={ancora?.parentElement ?? undefined}>
              <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
              <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl bg-background text-foreground shadow-xl outline-none transition-transform duration-200 data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full">
                <div className="flex items-center justify-between border-b p-3">
                  <Dialog.Title className="px-1 text-base font-semibold">Menu</Dialog.Title>
                  <Dialog.Close aria-label="Fechar" className="flex size-11 items-center justify-center rounded-full hover:bg-muted">
                    <X className="size-5" />
                  </Dialog.Close>
                </div>
                <div className="flex-1 overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  <ListaAgrupada itens={itens} novos={novos} ativo={ativo} aoNavegar={() => setAberto(false)} />
                </div>
              </Dialog.Popup>
            </Dialog.Portal>
          </Dialog.Root>
        ) : null}
      </div>
    </nav>
  );
}

// Abas das páginas que ficam no mesmo item do menu (ex.: Cardápio → Produtos, Categorias, Adicionais).
export function AbasSecao({ itens }: { itens: ItemNavegacao[] }) {
  const caminho = usePathname();
  const secoes = itemDaPagina(itens, caminho)?.secoes;
  if (!secoes || secoes.length < 2 || !secoes.some((s) => s.href === caminho)) return null;
  return (
    <nav
      aria-label="Seções"
      // No celular, quando o rodapé já mostra estas abas, elas não se repetem em cima.
      className={cn(
        "flex gap-1 overflow-x-auto sem-barra-rolagem border-b px-4 pt-3 md:px-6 print:hidden",
        abasDeDentro(itens) && "max-lg:hidden",
      )}
    >
      {secoes.map((s) => {
        const atual = s.href === caminho;
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={atual ? "page" : undefined}
            className={cn(
              "-mb-px flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium",
              atual ? "border-[var(--cor-primaria)] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {s.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
