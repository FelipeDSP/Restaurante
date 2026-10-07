"use client";

import { Bell, BellOff, Check, Printer, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import { resumoAdicionais } from "@/lib/adicionais";
import { tocarAlerta } from "@/lib/som";
import { horaLocal } from "@/lib/tempo";
import { cn } from "@/lib/utils";

import { marcarTicket } from "./actions";
import type { Ticket } from "./dados";
import { useImpressaoAutomatica } from "./preferencias";

type Props = {
  restauranteId: string;
  restauranteNome: string;
  fuso: string;
  pracas: { id: string; nome: string }[];
  pracaAtiva: string | null;
  pendentes: Ticket[];
  prontos: Ticket[];
  geradoEm: number;
};

function titulo(t: Ticket) {
  if (t.pedido.origem === "mesa" && t.pedido.mesa) return `Mesa ${t.pedido.mesa}`;
  if (t.pedido.origem === "delivery") return "Delivery";
  return "Balcão";
}

// Ticket inteiro pra viagem (ex.: delivery): destaque no topo em vez de item por item.
function tudoViagem(t: Ticket) {
  const ativos = t.itens.filter((i) => !i.cancelado);
  return ativos.length > 0 && ativos.every((i) => i.paraViagem);
}

function minutosDesde(iso: string, agora: number) {
  return Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60000));
}

// Ticket de papel (80 mm) para a impressão pelo navegador.
function TicketImpressao({ ticket, restauranteNome, fuso }: { ticket: Ticket; restauranteNome: string; fuso: string }) {
  return (
    <div className="font-mono text-[12px] leading-snug text-black">
      <p className="text-center text-[11px]">{restauranteNome}</p>
      <p className="text-center text-[14px] font-bold uppercase">{ticket.praca.nome}</p>
      <p className="my-1 text-center text-[22px] leading-tight font-bold">{titulo(ticket)}</p>
      {tudoViagem(ticket) ? <p className="text-center text-[16px] font-bold">*** PRA VIAGEM ***</p> : null}
      <p className="text-center">
        Pedido nº {ticket.pedido.numero} · {horaLocal(ticket.criadoEm, fuso)}
      </p>
      {ticket.pedido.origem === "delivery" && ticket.pedido.cliente ? <p className="text-center">{ticket.pedido.cliente}</p> : null}
      {ticket.pedido.autor ? <p className="text-center">Garçom: {ticket.pedido.autor}</p> : null}
      <p className="my-1 overflow-hidden whitespace-nowrap">{"-".repeat(48)}</p>
      <ul>
        {ticket.itens.map((i) => (
          <li key={i.id} className={cn("mb-1", i.cancelado && "line-through")}>
            <p className="text-[15px] font-bold">
              {i.quantidade}x {i.nome}
              {i.cancelado ? " (CANCELADO)" : ""}
              {i.paraViagem && !i.cancelado ? " [VIAGEM]" : ""}
            </p>
            {i.adicionais.length > 0 ? <p className="pl-3">+ {resumoAdicionais(i.adicionais)}</p> : null}
            {i.observacao ? <p className="pl-3 font-bold">&gt;&gt; {i.observacao}</p> : null}
            {i.depois.length > 0 ? <p className="pl-3">depois: {i.depois.join(", ")}</p> : null}
          </li>
        ))}
      </ul>
      {ticket.pedido.observacao ? (
        <>
          <p className="my-1 overflow-hidden whitespace-nowrap">{"-".repeat(48)}</p>
          <p className="font-bold">Obs.: {ticket.pedido.observacao}</p>
        </>
      ) : null}
    </div>
  );
}

function SeloViagem({ className }: { className?: string }) {
  return (
    <span className={cn("inline-block rounded-md bg-violet-700 px-2 py-0.5 text-xs font-bold tracking-wide text-white uppercase", className)}>
      Pra viagem
    </span>
  );
}

function CartaoTicket({
  ticket,
  agora,
  fuso,
  mostrarPraca,
  aoImprimir,
}: {
  ticket: Ticket;
  agora: number;
  fuso: string;
  mostrarPraca: boolean;
  aoImprimir: () => void;
}) {
  const { pendente, executar } = useAcao();
  const minutos = minutosDesde(ticket.criadoEm, agora);
  const atrasado = minutos >= 20;
  const atencao = minutos >= 10 && !atrasado;
  const ativos = ticket.itens.filter((i) => !i.cancelado);
  const esperando = [...new Set(ativos.flatMap((i) => i.aguardando))];
  const viagemTodo = tudoViagem(ticket);

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border-2 bg-background shadow-sm",
        atrasado ? "border-red-500" : atencao ? "border-amber-400" : "border-transparent",
      )}
    >
      <header
        className={cn(
          "flex items-start justify-between gap-2 px-4 py-3",
          atrasado ? "bg-red-50" : atencao ? "bg-amber-50" : "bg-muted/60",
        )}
      >
        <div className="min-w-0">
          <h2 className="text-2xl leading-tight font-bold">{titulo(ticket)}</h2>
          <p className="truncate text-sm text-muted-foreground">
            Nº {ticket.pedido.numero}
            {ticket.pedido.origem === "delivery" && ticket.pedido.cliente ? ` · ${ticket.pedido.cliente}` : ""}
            {ticket.pedido.autor ? ` · ${ticket.pedido.autor}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("text-xl font-bold tabular-nums", atrasado ? "text-red-700" : atencao ? "text-amber-700" : "")}>
            {minutos} min
          </p>
          <p className="text-xs text-muted-foreground">{horaLocal(ticket.criadoEm, fuso)}</p>
        </div>
      </header>
      {mostrarPraca || viagemTodo ? (
        <div className="flex items-center justify-between gap-2 border-b px-4 py-1">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{mostrarPraca ? ticket.praca.nome : ""}</p>
          {viagemTodo ? <SeloViagem /> : null}
        </div>
      ) : null}
      <ul className="flex flex-1 flex-col gap-2 px-4 py-3">
        {ticket.itens.map((i) => (
          <li
            key={i.id}
            className={cn(i.cancelado && "text-muted-foreground line-through", !i.cancelado && i.aguardando.length > 0 && "opacity-60")}
          >
            <p className="text-lg leading-snug">
              <span className="font-bold">{i.quantidade}×</span> {i.nome}
              {i.cancelado ? <span className="ml-2 text-xs font-bold text-red-700 no-underline">CANCELADO</span> : null}
              {!i.cancelado && i.paraViagem && !viagemTodo ? <SeloViagem className="ml-2 align-middle" /> : null}
            </p>
            {i.adicionais.length > 0 ? <p className="text-sm text-muted-foreground">{resumoAdicionais(i.adicionais)}</p> : null}
            {!i.cancelado && i.aguardando.length > 0 ? (
              <p className="text-sm font-semibold text-sky-800">Aguardando {i.aguardando.join(" e ")}</p>
            ) : null}
            {!i.cancelado && i.depois.length > 0 ? (
              <p className="text-sm text-muted-foreground">Depois segue para {i.depois.join(" e ")}</p>
            ) : null}
            {i.observacao ? (
              <p className="mt-1 rounded-md bg-amber-100 px-2 py-1 text-sm font-semibold text-amber-950">{i.observacao}</p>
            ) : null}
          </li>
        ))}
        {ticket.pedido.observacao ? (
          <li className="rounded-md bg-amber-100 px-2 py-1 text-sm font-semibold text-amber-950">Pedido: {ticket.pedido.observacao}</li>
        ) : null}
      </ul>
      <footer className="flex gap-2 border-t p-3">
        <Button type="button" variant="outline" size="icon" className="size-12" aria-label="Imprimir ticket" onClick={aoImprimir}>
          <Printer />
        </Button>
        <Button
          type="button"
          className="h-12 flex-1 text-base"
          disabled={pendente || esperando.length > 0}
          onClick={() => executar(() => marcarTicket(ticket.id, "pronto"))}
        >
          <Check />
          {esperando.length > 0 ? `Aguardando ${esperando.join(" e ")}` : ativos.length === 0 ? "Tirar da tela" : "Pronto"}
        </Button>
      </footer>
    </article>
  );
}

export function TelaCozinha({ restauranteId, restauranteNome, fuso, pracas, pracaAtiva, pendentes, prontos, geradoEm }: Props) {
  const { pendente, executar } = useAcao();
  const [agora, setAgora] = useState(geradoEm);
  const [manual, setManual] = useState<Ticket | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const [somAtivo, setSomAtivo] = useState(false);
  const vistos = useRef<Set<string> | null>(null);
  const imprimindo = useRef<string | null>(null);
  const auto = useImpressaoAutomatica(restauranteId);

  const daPraca = (t: Ticket) => !pracaAtiva || t.praca.id === pracaAtiva;
  const visiveis = pendentes.filter(daPraca);
  const prontosVisiveis = prontos.filter(daPraca);

  // Próximo da fila automática: o mais antigo ainda não impresso neste aparelho.
  const proximoAuto = auto.ligada ? visiveis.find((t) => !auto.impressos.has(t.id)) : undefined;
  const paraImprimir = manual ?? proximoAuto ?? null;

  // Relógio dos tickets (minutos de espera).
  useEffect(() => {
    const intervalo = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(intervalo);
  }, []);

  // Navegadores só tocam som depois de um toque na página.
  useEffect(() => {
    const liberar = () => {
      audio.current ??= new AudioContext();
      void audio.current.resume().then(() => setSomAtivo(audio.current?.state === "running"));
    };
    window.addEventListener("pointerdown", liberar, { once: true });
    window.addEventListener("keydown", liberar, { once: true });
    return () => {
      window.removeEventListener("pointerdown", liberar);
      window.removeEventListener("keydown", liberar);
    };
  }, []);

  // Ticket novo na tela: bipe (a primeira carga não toca).
  const idsVisiveis = visiveis.map((t) => t.id).join(",");
  useEffect(() => {
    const atuais = new Set(idsVisiveis ? idsVisiveis.split(",") : []);
    const anteriores = vistos.current;
    vistos.current = atuais;
    if (!anteriores) return;
    const chegou = [...atuais].some((id) => !anteriores.has(id));
    if (chegou && audio.current?.state === "running") tocarAlerta(audio.current);
  }, [idsVisiveis]);

  // Imprime o ticket da vez (manual ou da fila automática) pelo navegador.
  const idParaImprimir = paraImprimir?.id ?? null;
  const ehManual = manual !== null;
  useEffect(() => {
    if (!idParaImprimir || imprimindo.current === idParaImprimir) return;
    imprimindo.current = idParaImprimir;
    const terminar = () => {
      imprimindo.current = null;
      if (ehManual) setManual(null);
      else auto.marcarImpressos([idParaImprimir]);
    };
    window.addEventListener("afterprint", terminar, { once: true });
    window.print();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `auto` muda a cada render; só reage ao ticket da vez
  }, [idParaImprimir, ehManual]);

  function alternarAuto() {
    // Ao ligar, o que já está na tela conta como impresso: só os próximos saem sozinhos.
    if (!auto.ligada) auto.marcarImpressos(pendentes.map((t) => t.id));
    auto.definirLigada(!auto.ligada);
  }

  const linkPraca = (id: string | null) => (id ? `/cozinha?praca=${id}` : "/cozinha");

  return (
    <>
      {/* Só o ticket aparece no papel; o resto da tela some na impressão. */}
      <style>{"@page { size: 80mm auto; margin: 3mm; }"}</style>
      <div className="hidden print:block">
        {paraImprimir ? <TicketImpressao ticket={paraImprimir} restauranteNome={restauranteNome} fuso={fuso} /> : null}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Praças" className="flex flex-wrap gap-2">
            {[{ id: null as string | null, nome: "Todas" }, ...pracas].map((p) => {
              const ativa = p.id === pracaAtiva;
              const qtd = p.id ? pendentes.filter((t) => t.praca.id === p.id).length : pendentes.length;
              return (
                <Link
                  key={p.id ?? "todas"}
                  href={linkPraca(p.id)}
                  aria-current={ativa ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors",
                    ativa ? "border-transparent bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                  )}
                >
                  {p.nome}
                  <span className={cn("rounded-full px-2 text-xs", ativa ? "bg-black/20" : "bg-muted")}>{qtd}</span>
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "flex h-11 items-center gap-2 rounded-full border px-4 text-sm",
                somAtivo ? "bg-background" : "border-amber-300 bg-amber-50 text-amber-900",
              )}
            >
              {somAtivo ? <Bell className="size-4" /> : <BellOff className="size-4" />}
              {somAtivo ? "Som ligado" : "Toque na tela para ligar o som"}
            </span>
            <Button
              type="button"
              variant={auto.ligada ? "default" : "outline"}
              className="h-11 rounded-full"
              aria-pressed={auto.ligada}
              onClick={alternarAuto}
            >
              <Printer />
              {auto.ligada ? "Impressão automática ligada" : "Imprimir automaticamente"}
            </Button>
          </div>
        </div>

        {pracas.length === 0 ? (
          <div className="rounded-xl border bg-background p-6 text-center">
            <p className="font-semibold">Nenhuma praça cadastrada.</p>
            <p className="text-sm text-muted-foreground">
              O dono cadastra as praças em Painel &gt; Praças e liga cada produto à sua praça.
            </p>
          </div>
        ) : visiveis.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
            <Check className="size-12 text-green-600" />
            <p className="text-xl font-semibold">Nada pendente{pracaAtiva ? " nesta praça" : ""}.</p>
            <p className="text-muted-foreground">Os pedidos aparecem aqui assim que o garçom envia.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {visiveis.map((t) => (
              <CartaoTicket
                key={t.id}
                ticket={t}
                agora={agora}
                fuso={fuso}
                mostrarPraca={!pracaAtiva}
                aoImprimir={() => setManual(t)}
              />
            ))}
          </div>
        )}

        {prontosVisiveis.length > 0 ? (
          <section aria-labelledby="titulo-prontos" className="mt-auto flex flex-col gap-2 pt-4">
            <h2 id="titulo-prontos" className="text-sm font-semibold text-muted-foreground">
              Prontos agora há pouco
            </h2>
            <ul className="flex flex-wrap gap-2">
              {prontosVisiveis.map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded-full border bg-background py-1 pr-1 pl-3 text-sm">
                  <span>
                    {titulo(t)} · nº {t.pedido.numero}
                    {pracaAtiva ? "" : ` · ${t.praca.nome}`}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-full"
                    disabled={pendente}
                    onClick={() => executar(() => marcarTicket(t.id, "pendente"))}
                  >
                    <Undo2 />
                    Voltar
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
