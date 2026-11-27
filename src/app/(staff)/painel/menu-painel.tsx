"use client";

import { Dialog } from "@base-ui/react/dialog";
import { ChevronLeft, Lock, type LucideIcon, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { CONFIGURACOES_HREF, type ItemNavegacao, itemAtivo, itemDaPagina } from "./navegacao";

// `bloqueados`: o que o plano não tem (só o dono vê, com cadeado, levando aos planos).
// contadores: número no item do menu (ex.: deliveries novos, mensagens de cliente não lidas).
type Props = { itens: ItemNavegacao[]; contadores: Record<string, number>; bloqueados?: ItemNavegacao[] };

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

// Uma linha do menu (item que a pessoa pode abrir).
function LinhaMenu({
  item,
  contador,
  atual,
  aoNavegar,
}: {
  item: ItemNavegacao;
  contador: number;
  atual: boolean;
  aoNavegar?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={aoNavegar}
      aria-current={atual ? "page" : undefined}
      className={cn(
        "flex min-h-10 items-center justify-between gap-2 rounded-md px-3 text-sm font-medium",
        atual ? "bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]" : "hover:bg-muted",
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <item.icone className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{item.rotulo}</span>
      </span>
      {contador ? <Contador valor={contador} /> : null}
    </Link>
  );
}

// Item que o plano não tem: fica à vista, apagado e com cadeado, levando aos planos.
function LinhaTravada({ item, aoNavegar }: { item: ItemNavegacao; aoNavegar?: () => void }) {
  return (
    <Link
      href="/painel/assinatura"
      onClick={aoNavegar}
      title="Não faz parte do seu plano"
      className="flex min-h-10 items-center justify-between gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <item.icone className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{item.rotulo}</span>
      </span>
      <Lock className="size-3.5" aria-label="Não faz parte do seu plano" />
    </Link>
  );
}

// Menu em três blocos: o que se usa durante o serviço (Operação), o que se faz fora dele
// (Gestão, com título de seção) e, no fim, a porta única de "Configurações".
function ListaMenu({ itens, contadores, bloqueados = [], ativo, aoNavegar }: Props & { ativo: string | null; aoNavegar?: () => void }) {
  const operacao = itens.filter((i) => i.grupo === "Operação");
  const gestao = itens.filter((i) => i.grupo === "Gestão");
  const porta = itens.find((i) => i.href === CONFIGURACOES_HREF);
  // Do plano, Operação e Gestão aparecem com cadeado aqui; o resto vai na tela de Configurações.
  const travadosOperacao = bloqueados.filter((i) => i.grupo === "Operação");
  const travadosGestao = bloqueados.filter((i) => i.grupo === "Gestão");
  const linha = (item: ItemNavegacao) => (
    <LinhaMenu key={item.href} item={item} contador={contadores[item.href] ?? 0} atual={item.href === ativo} aoNavegar={aoNavegar} />
  );
  return (
    <div className="flex flex-col gap-0.5">
      {operacao.map(linha)}
      {travadosOperacao.map((item) => (
        <LinhaTravada key={item.href} item={item} aoNavegar={aoNavegar} />
      ))}
      {gestao.length + travadosGestao.length > 0 ? (
        <h2 className="mt-3 border-t px-3 pt-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Gestão</h2>
      ) : null}
      {gestao.map(linha)}
      {travadosGestao.map((item) => (
        <LinhaTravada key={item.href} item={item} aoNavegar={aoNavegar} />
      ))}
      {porta ? <div className="mt-3 border-t pt-3">{linha(porta)}</div> : null}
    </div>
  );
}

// Computador: barra lateral com todos os itens agrupados (antes, metade do menu ficava escondida).
export function MenuLateral({ itens, contadores, bloqueados }: Props) {
  const ativo = itemAtivo(itens, usePathname());
  return (
    <nav aria-label="Painel" className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-56 shrink-0 overflow-y-auto border-r bg-background p-3 lg:block print:hidden">
      <ListaMenu itens={itens} contadores={contadores} bloqueados={bloqueados} ativo={ativo} />
    </nav>
  );
}

// Telas com botões próprios no rodapé (a mesa e o lançamento): a barra de abas sai da frente.
const TELA_COM_BARRA_PROPRIA = /^\/painel\/comandas\/(?!pracas(\/|$))[^/]+/;

// O ícone vem da navegação: nas abas do rodapé (celular) e ao lado do texto na barra lateral.
// No computador o desenho não substitui a palavra — acompanha.
type Aba = { href: string; rotulo: string; icone: LucideIcon };

// Poucas áreas (ex.: só Mesas): o rodapé mostra as abas de dentro delas (Mesas, Praças).
function abasDeDentro(itens: ItemNavegacao[]) {
  return itens.filter((i) => i.grupo === "Operação").length < 3;
}

// Quem fica no alcance do polegar quando não cabe todo mundo: o que tem hora marcada no dia.
// Antes valia a ordem da lista, e o Caixa (abrir, sangria, fechar) caía dentro do "Mais".
const PRIORIDADE_ABAS = ["/painel/comandas", "/painel/caixa", "/painel/delivery", "/painel"];

// Escolhe quais abas ficam no rodapé (por prioridade) e devolve na ordem do menu.
function abasVisiveis(abas: Aba[], quantas: number): Aba[] {
  if (abas.length <= quantas) return abas;
  const peso = (href: string) => {
    const i = PRIORIDADE_ABAS.indexOf(href);
    return i === -1 ? PRIORIDADE_ABAS.length : i;
  };
  const escolhidas = new Set(
    [...abas]
      .map((aba, ordem) => ({ aba, ordem }))
      .sort((a, b) => peso(a.aba.href) - peso(b.aba.href) || a.ordem - b.ordem)
      .slice(0, quantas)
      .map((x) => x.aba.href),
  );
  return abas.filter((a) => escolhidas.has(a.href));
}

// Celular e tablet: o painel vira app, com as áreas da pessoa em abas no rodapé (alcance do polegar)
// e "Mais" com o menu completo. Quem tem poucas áreas (ex.: garçom) vê as abas de dentro delas
// (Mesas e Praças).
export function BarraApp({ itens, contadores, bloqueados }: Props) {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  // O portal fica dentro da tela do restaurante para herdar as cores da marca.
  const [ancora, setAncora] = useState<HTMLSpanElement | null>(null);
  if (TELA_COM_BARRA_PROPRIA.test(caminho)) return null;

  const operacao = itens.filter((i) => i.grupo === "Operação");
  let abas: Aba[] = operacao.map((i) => ({ href: i.href, rotulo: i.rotulo, icone: i.icone }));
  if (abasDeDentro(itens)) {
    abas = operacao.flatMap((i) =>
      i.secoes && i.secoes.length > 1
        ? i.secoes.map((s) => ({ href: s.href, rotulo: s.rotulo, icone: s.icone ?? i.icone }))
        : [{ href: i.href, rotulo: i.rotulo, icone: i.icone }],
    );
  }
  // Cabem 5 abas no rodapé: com o "Mais" (outras áreas no menu), ficam 4 e ele.
  const menuTemOutros = itens.length > operacao.length;
  const visiveis = abas.length > 5 || (menuTemOutros && abas.length > 4) ? abasVisiveis(abas, 4) : abas;
  const temMais = menuTemOutros || abas.length > visiveis.length;
  const ativo = itemAtivo(itens, caminho);
  // O que ficou escondido não perde o aviso: o número aparece em cima do "Mais".
  const escondidos = itens
    .filter((i) => !visiveis.some((a) => a.href === i.href))
    .reduce((soma, i) => soma + (contadores[i.href] ?? 0), 0);
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
          const Icone = aba.icone;
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
              {contadores[aba.href] ? (
                <span className="absolute top-1.5 left-1/2 ml-2">
                  <Contador valor={contadores[aba.href]} />
                </span>
              ) : null}
            </Link>
          );
        })}
        {temMais ? (
          <Dialog.Root open={aberto} onOpenChange={setAberto}>
            <span ref={setAncora} hidden />
            <Dialog.Trigger className="relative flex h-16 min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-xs font-semibold text-muted-foreground">
              <Menu className="size-6" aria-hidden />
              Mais
              {escondidos > 0 ? (
                <span className="absolute top-1.5 left-1/2 ml-2">
                  <Contador valor={escondidos} />
                </span>
              ) : null}
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
                  <ListaMenu itens={itens} contadores={contadores} bloqueados={bloqueados} ativo={ativo} aoNavegar={() => setAberto(false)} />
                </div>
              </Dialog.Popup>
            </Dialog.Portal>
          </Dialog.Root>
        ) : null}
      </div>
    </nav>
  );
}

// Dentro de Configurações: de onde você veio e onde está (as telas de cadastro não tinham título
// visível, então no celular dava para abrir o Cardápio e não saber onde estava).
export function TopoConfiguracao({ itens }: { itens: ItemNavegacao[] }) {
  const caminho = usePathname();
  const item = itemDaPagina(itens, caminho);
  if (!item) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pt-3 text-sm md:px-6 print:hidden">
      <Link href={CONFIGURACOES_HREF} className="flex min-h-9 pointer-coarse:min-h-11 items-center gap-1 text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden />
        Configurações
      </Link>
      <span className="text-muted-foreground" aria-hidden>
        /
      </span>
      <span className="font-semibold">{item.rotulo}</span>
    </div>
  );
}

// Gestão não tem a porta "‹ Configurações" (os itens estão no próprio menu), mas as telas com
// abas precisam de um título: sem ele, quem abre Produtos pelo celular só vê as abas e não sabe
// que está no Cardápio. As telas de Gestão sem abas (Estoque, Entregadores...) têm o título
// próprio na página.
export function TituloGestao({ itens }: { itens: ItemNavegacao[] }) {
  const caminho = usePathname();
  const item = itemDaPagina(itens, caminho);
  if (!item || item.grupo !== "Gestão" || !item.secoes) return null;
  return (
    <div className="flex items-center gap-2 px-4 pt-4 text-2xl font-semibold md:px-6 print:hidden">
      <item.icone className="size-6 shrink-0 text-muted-foreground" aria-hidden />
      {item.rotulo}
    </div>
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
