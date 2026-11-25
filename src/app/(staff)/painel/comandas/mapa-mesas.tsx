"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { formatarBRL } from "@/lib/dinheiro";
import { NOME_STATUS_MESA } from "@/lib/rotulos";
import { tempoDesde } from "@/lib/tempo";
import { cn } from "@/lib/utils";

import type { MesaNoMapa } from "../../garcom/dados";

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

// Minutos desde que o prato ficou pronto. O selo cresce de verde para vermelho: com 13 das 34
// mesas marcadas, um selo igual em todas não dizia qual pegar primeiro.
function SeloPronto({ desde, agora }: { desde: string; agora: number }) {
  const minutos = Math.max(0, Math.floor((agora - new Date(desde).getTime()) / 60000));
  const urgente = minutos >= 8;
  const atencao = minutos >= 3 && !urgente;
  return (
    <span
      className={cn(
        "absolute -top-2 -right-2 rounded-full px-2 py-0.5 text-xs font-bold text-white shadow ring-2 ring-background",
        urgente ? "bg-red-600" : atencao ? "bg-amber-600" : "bg-green-600",
      )}
    >
      Pronto{minutos > 0 ? ` ${minutos} min` : ""}
    </span>
  );
}

// Mapa de mesas (o app de toda a equipe): 3 por linha no celular, mais no computador. Ocupada fica
// na cor do restaurante e conta pedida em amarelo, para achar de longe; tocar abre a mesa.
function CartaoMesa({ mesa, agora }: { mesa: MesaNoMapa; agora: number }) {
  const falta = Math.max(0, mesa.total - mesa.pago);
  return (
    <Link
      href={`/painel/comandas/${mesa.id}`}
      // Sem prefetch: o mapa tem um link por mesa e `router.refresh()` invalida o cache do
      // roteador, então cada evento do tempo real re-prefetchava TODAS as mesas (37 requisições
      // por toque, com 40 mesas). A tela da mesa abre rápido mesmo sem o prefetch.
      prefetch={false}
      aria-label={`Mesa ${mesa.numero}: ${NOME_STATUS_MESA[mesa.status]}${mesa.pedidosProntos > 0 ? ", prato pronto para servir" : ""}`}
      className={cn(
        "relative flex min-h-28 flex-col justify-between gap-2 rounded-xl border-2 p-3 transition-transform active:scale-95 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-32",
        mesa.status === "livre" && "border-dashed border-border bg-background text-muted-foreground hover:border-solid hover:bg-muted/40",
        mesa.status === "aberta" && "border-[var(--cor-primaria)] bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]",
        mesa.status === "conta_pedida" && "border-amber-500 bg-amber-300 text-amber-950",
      )}
    >
      {mesa.prontoDesde ? <SeloPronto desde={mesa.prontoDesde} agora={agora} /> : null}
      {/* Nomes longos ("Varanda 1") em fonte menor para não quebrar no meio da palavra. */}
      <span
        className={cn(
          "leading-tight font-bold break-words",
          mesa.status === "livre" && "text-foreground",
          mesa.numero.length > 3 ? "text-base sm:text-lg" : "text-2xl leading-none",
        )}
      >
        {mesa.numero}
      </span>
      <span className="flex flex-col gap-0.5 text-xs leading-tight sm:text-sm">
        <span className="font-semibold">{NOME_STATUS_MESA[mesa.status]}</span>
        {mesa.status !== "livre" ? (
          <>
            <span className="font-semibold tabular-nums">{formatarBRL(mesa.total)}</span>
            {mesa.pago > 0 ? <span className="tabular-nums opacity-80">falta {formatarBRL(falta)}</span> : null}
            <span className="truncate opacity-80">{mesa.abertaEm ? tempoDesde(mesa.abertaEm) : ""}</span>
            {/* O nome do garçom também no celular: era `sm:` para cima, e no celular — onde o
                garçom trabalha — não dava para saber de quem era a mesa. */}
            {mesa.garcom ? <span className="truncate opacity-80">{mesa.garcom}</span> : <span className="font-semibold">Sem garçom</span>}
          </>
        ) : null}
      </span>
    </Link>
  );
}

// Busca e filtros do mapa: com 40 mesas são 5 alturas de tela no celular, e no pico o garçom
// rolava a tela toda procurando a mesa 34 ou as mesas dele.
export function MapaMesas({ mesas, euId, geradoEm }: { mesas: MesaNoMapa[]; euId: string | null; geradoEm: number }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todas" | "minhas" | "prontas">("todas");

  const minhas = euId ? mesas.filter((m) => m.garcomId === euId).length : 0;
  const prontas = mesas.filter((m) => m.pedidosProntos > 0).length;

  const visiveis = useMemo(() => {
    const termo = normalizar(busca.trim());
    return mesas.filter((m) => {
      if (filtro === "minhas" && m.garcomId !== euId) return false;
      if (filtro === "prontas" && m.pedidosProntos === 0) return false;
      if (!termo) return true;
      return normalizar(m.numero).includes(termo) || normalizar(m.garcom ?? "").includes(termo);
    });
  }, [mesas, busca, filtro, euId]);

  const chips: { id: typeof filtro; rotulo: string; quantos: number | null }[] = [
    { id: "todas", rotulo: "Todas", quantos: mesas.length },
    ...(euId && minhas > 0 ? ([{ id: "minhas", rotulo: "Minhas mesas", quantos: minhas }] as const) : []),
    ...(prontas > 0 ? ([{ id: "prontas", rotulo: "Prato pronto", quantos: prontas }] as const) : []),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar mesa ou garçom"
            aria-label="Buscar mesa ou garçom"
            type="search"
            className="h-11 pl-9"
          />
        </div>
        {chips.length > 1 ? (
          <div role="group" aria-label="Filtrar mesas" className="flex gap-2">
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={filtro === c.id}
                onClick={() => setFiltro(c.id)}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium",
                  filtro === c.id ? "border-transparent bg-foreground text-background" : "bg-background hover:bg-muted",
                )}
              >
                {c.rotulo}
                <span className={cn("rounded-full px-2 text-xs tabular-nums", filtro === c.id ? "bg-background/25" : "bg-muted")}>
                  {c.quantos}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {visiveis.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">Nenhuma mesa encontrada.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-3 lg:grid-cols-4 xl:grid-cols-5">
          {visiveis.map((mesa) => (
            <li key={mesa.id}>
              <CartaoMesa mesa={mesa} agora={geradoEm} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
