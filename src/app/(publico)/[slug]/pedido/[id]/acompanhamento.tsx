"use client";

import { Check, CircleX, Share2, WifiOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { resumoAdicionais } from "@/lib/adicionais";
import { formatarBRL } from "@/lib/dinheiro";
import { useRascunho } from "@/lib/rascunho";
import { nomeForma } from "@/lib/rotulos";
import { horaLocal } from "@/lib/tempo";
import { cn } from "@/lib/utils";

import type { PedidoPublico } from "../../dados";
import { chaveUltimoPedido, normalizarUltimoPedido, SEM_PEDIDO } from "../../ultimo-pedido";

type Status = PedidoPublico["status"];

const ETAPAS: { status: Status[]; rotulo: string }[] = [
  { status: ["recebido", "em_preparo", "pronto", "saiu_entrega", "entregue"], rotulo: "Pedido recebido" },
  { status: ["em_preparo", "pronto", "saiu_entrega", "entregue"], rotulo: "Em preparo" },
  { status: ["pronto", "saiu_entrega", "entregue"], rotulo: "Pronto, aguardando o entregador" },
  { status: ["saiu_entrega", "entregue"], rotulo: "Saiu para entrega" },
  { status: ["entregue"], rotulo: "Entregue" },
];

const TITULO: Record<Status, string> = {
  recebido: "Recebemos seu pedido!",
  em_preparo: "Seu pedido está sendo preparado",
  pronto: "Seu pedido está pronto",
  saiu_entrega: "Seu pedido saiu para entrega",
  entregue: "Pedido entregue. Bom apetite!",
  cancelado: "Pedido cancelado",
};

// O cliente é anônimo (sem Realtime): consulta o status de tempos em tempos.
// Falha de rede mantém a última tela e tenta de novo com espera crescente.
const INTERVALO_MS = 10_000;
const INTERVALO_MAXIMO_MS = 60_000;

const emAndamento = (s: Status) => s !== "entregue" && s !== "cancelado";

type Props = {
  inicial: PedidoPublico;
  restaurante: { id: string; slug: string; nome: string; whatsapp: string | null; fusoHorario: string };
};

export function Acompanhamento({ inicial, restaurante }: Props) {
  const [pedido, setPedido] = useState(inicial);
  const [atualizadoEm, setAtualizadoEm] = useState(() => new Date().toISOString());
  const [semConexao, setSemConexao] = useState(false);
  const ativo = emAndamento(pedido.status);
  const [, guardarUltimo] = useRascunho(chaveUltimoPedido(restaurante.id), SEM_PEDIDO, normalizarUltimoPedido);

  // Guarda o pedido no aparelho para o cliente achar de novo pelo cardápio.
  useEffect(() => {
    guardarUltimo({ id: inicial.id, numero: inicial.numero, criadoEm: inicial.criado_em });
  }, [guardarUltimo, inicial.id, inicial.numero, inicial.criado_em]);

  const falhas = useRef(0);
  useEffect(() => {
    if (!ativo) return;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    let cancelado = false;

    async function consultar() {
      clearTimeout(temporizador);
      try {
        const resposta = await fetch(`/api/pedidos/${inicial.id}`, { cache: "no-store" });
        if (!resposta.ok) throw new Error(String(resposta.status));
        const atual = (await resposta.json()) as PedidoPublico;
        if (cancelado) return;
        falhas.current = 0;
        setPedido(atual);
        setAtualizadoEm(new Date().toISOString());
        setSemConexao(false);
      } catch {
        if (cancelado) return;
        falhas.current += 1;
        setSemConexao(true);
      }
      if (!cancelado) {
        const espera = Math.min(INTERVALO_MAXIMO_MS, INTERVALO_MS * 2 ** falhas.current);
        temporizador = setTimeout(consultar, espera);
      }
    }

    const agora = () => {
      if (document.visibilityState === "visible") void consultar();
    };
    temporizador = setTimeout(consultar, INTERVALO_MS);
    document.addEventListener("visibilitychange", agora);
    window.addEventListener("online", agora);
    return () => {
      cancelado = true;
      clearTimeout(temporizador);
      document.removeEventListener("visibilitychange", agora);
      window.removeEventListener("online", agora);
    };
  }, [ativo, inicial.id]);

  async function compartilhar() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Pedido nº ${pedido.numero} · ${restaurante.nome}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link do pedido copiado.");
    } catch {
      // Cancelou o compartilhamento: nada a fazer.
    }
  }

  const whatsapp = restaurante.whatsapp?.replace(/\D/g, "");

  return (
    <main className="flex flex-col gap-4 p-4">
      <section className="flex flex-col gap-1 rounded-xl bg-background p-4 shadow-sm" aria-live="polite">
        <p className="text-sm text-muted-foreground">
          Pedido nº {pedido.numero} · feito às {horaLocal(pedido.criado_em, restaurante.fusoHorario)}
        </p>
        <h1 className="text-2xl font-bold">{TITULO[pedido.status]}</h1>
        {ativo && pedido.tempo_estimado_entrega_min ? (
          <p className="text-muted-foreground">Tempo estimado: cerca de {pedido.tempo_estimado_entrega_min} minutos.</p>
        ) : null}
        {ativo ? (
          semConexao ? (
            <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800" role="status">
              <WifiOff className="size-4" aria-hidden />
              Sem conexão. Tentando de novo… (última atualização às {horaLocal(atualizadoEm, restaurante.fusoHorario)})
            </p>
          ) : (
            <p className="text-xs text-muted-foreground" suppressHydrationWarning>
              Atualizado às {horaLocal(atualizadoEm, restaurante.fusoHorario)}. Esta tela se atualiza sozinha.
            </p>
          )
        ) : null}
      </section>

      {pedido.status === "cancelado" ? (
        <section className="flex items-start gap-3 rounded-xl bg-red-50 p-4 text-red-900">
          <CircleX className="size-6 shrink-0" aria-hidden />
          <div className="flex flex-col gap-1">
            <p>O restaurante cancelou este pedido.</p>
            {pedido.motivo_cancelamento ? <p className="font-medium">Motivo: {pedido.motivo_cancelamento}</p> : null}
            <p className="text-sm">Fale com eles para mais informações.</p>
          </div>
        </section>
      ) : (
        <ol className="flex flex-col gap-0 rounded-xl bg-background p-4 shadow-sm" aria-label="Andamento do pedido">
          {ETAPAS.map((etapa, i) => {
            const feita = etapa.status.includes(pedido.status);
            return (
              <li key={etapa.rotulo} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full border-2",
                      feita
                        ? "border-[var(--cor-primaria)] bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]"
                        : "border-muted-foreground/30 text-muted-foreground",
                    )}
                  >
                    {feita ? <Check className="size-4" /> : <span className="text-xs">{i + 1}</span>}
                  </span>
                  {i < ETAPAS.length - 1 ? (
                    <span className={cn("h-6 w-0.5", feita ? "bg-[var(--cor-primaria)]" : "bg-muted-foreground/30")} />
                  ) : null}
                </div>
                <span className={cn("pt-1", feita ? "font-semibold" : "text-muted-foreground")}>
                  {etapa.rotulo}
                  {feita ? <span className="sr-only"> (concluído)</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <section className="flex flex-col gap-2 rounded-xl bg-background p-4 shadow-sm" aria-labelledby="titulo-resumo">
        <h2 id="titulo-resumo" className="font-semibold">
          Resumo
        </h2>
        <ul className="divide-y">
          {pedido.itens.map((item, i) => (
            <li key={i} className="flex justify-between gap-2 py-2">
              <span className="flex flex-col">
                <span>
                  {item.quantidade}× {item.nome_produto}
                </span>
                {item.adicionais?.length ? (
                  <span className="text-sm text-muted-foreground">{resumoAdicionais(item.adicionais)}</span>
                ) : null}
                {item.observacao ? <span className="text-sm text-muted-foreground">Obs.: {item.observacao}</span> : null}
              </span>
              <span className="tabular-nums">{formatarBRL(item.total)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between text-sm">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatarBRL(pedido.subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Taxa de entrega</span>
          <span className="tabular-nums">{formatarBRL(pedido.taxa_entrega)}</span>
        </div>
        <div className="flex justify-between text-lg font-bold">
          <span>Total</span>
          <span className="tabular-nums">{formatarBRL(pedido.total)}</span>
        </div>
        {pedido.forma_pagamento_prevista ? (
          <p className="text-sm text-muted-foreground">
            Pagamento na entrega: {nomeForma(pedido.forma_pagamento_prevista)}
            {pedido.forma_pagamento_prevista === "dinheiro" && pedido.troco_para
              ? ` · troco para ${formatarBRL(pedido.troco_para)}`
              : ""}
          </p>
        ) : null}
      </section>

      <div className="flex flex-col items-center gap-3 text-center">
        <Button type="button" variant="outline" className="h-11 w-full max-w-xs" onClick={compartilhar}>
          <Share2 aria-hidden />
          Copiar ou compartilhar o link do pedido
        </Button>
        {whatsapp ? (
          <a
            href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Olá! Sobre o pedido nº ${pedido.numero}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center font-medium underline underline-offset-4"
          >
            Falar com o restaurante no WhatsApp
          </a>
        ) : null}
        <Link href={`/${restaurante.slug}`} className="flex min-h-11 items-center text-sm text-muted-foreground underline">
          Voltar ao cardápio
        </Link>
      </div>
    </main>
  );
}
