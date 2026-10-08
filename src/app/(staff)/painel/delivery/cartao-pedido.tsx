"use client";

import { ChevronDown, GripVertical, MapPin, MessageCircle, Phone } from "lucide-react";
import { useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type AdicionalEscolhido, resumoAdicionais } from "@/lib/adicionais";
import { formatarBRL } from "@/lib/dinheiro";
import { FORMAS_PAGAMENTO, nomeForma } from "@/lib/rotulos";
import { cn } from "@/lib/utils";

import { avancarPedido, cancelarPedido, entregarPedido } from "./actions";

export type PedidoDelivery = {
  id: string;
  numero: number;
  status: "recebido" | "em_preparo" | "pronto" | "saiu_entrega" | "entregue" | "cancelado";
  hora: string;
  tempo: string;
  clienteNome: string;
  clienteTelefone: string;
  endereco: Record<string, string | null>;
  bairro: string | null;
  formaPrevista: string | null;
  trocoPara: number | null;
  observacao: string | null;
  subtotal: number;
  taxaEntrega: number;
  total: number;
  pago: number;
  // Praças da cozinha que ainda não marcaram pronto: enquanto houver, quem marca "Pronto" é a cozinha.
  pracasPendentes: number;
  motivoCancelamento: string | null;
  itens: { id: string; nome: string; quantidade: number; observacao: string | null; adicionais: AdicionalEscolhido[]; total: number }[];
};

const PROXIMO: Partial<Record<PedidoDelivery["status"], { status: string; rotulo: string }>> = {
  recebido: { status: "em_preparo", rotulo: "Aceitar e preparar" },
  em_preparo: { status: "pronto", rotulo: "Pronto" },
  pronto: { status: "saiu_entrega", rotulo: "Saiu para entrega" },
};

const MOTIVOS = ["Fora da área de entrega", "Produto em falta", "Cliente desistiu", "Pedido duplicado"];

function telefoneFormatado(telefone: string) {
  const d = telefone.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return telefone;
}

type Modo = "normal" | "cancelar" | "entregar";

type Props = {
  pedido: PedidoDelivery;
  // Solto na coluna "Finalizados": abre direto na confirmação do pagamento.
  modoInicial?: Modo;
  aoSairDoModo?: () => void;
  // Quadro: o cartão pode ser arrastado para outra coluna (no computador).
  arrastavel?: boolean;
  aoArrastar?: (ativo: boolean) => void;
};

export function CartaoPedido({ pedido, modoInicial = "normal", aoSairDoModo, arrastavel, aoArrastar }: Props) {
  const { pendente, executar } = useAcao();
  const [modo, setModoInterno] = useState<Modo>(modoInicial);
  const setModo = (novo: Modo) => {
    setModoInterno(novo);
    if (novo === "normal") aoSairDoModo?.();
  };
  // Telefone e endereço completo ficam recolhidos (o resumo do endereço aparece no cartão).
  const [detalhes, setDetalhes] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [forma, setForma] = useState(pedido.formaPrevista ?? "dinheiro");

  const ativo = pedido.status !== "entregue" && pedido.status !== "cancelado";
  const e = pedido.endereco;
  const telefone = pedido.clienteTelefone.replace(/\D/g, "");
  const whatsapp = telefone.length <= 11 ? `55${telefone}` : telefone;
  const naCozinha = pedido.status === "em_preparo" && pedido.pracasPendentes > 0;
  const proximo = naCozinha ? undefined : PROXIMO[pedido.status];

  const resumoEndereco = [[e.rua, e.numero].filter(Boolean).join(", "), pedido.bairro].filter(Boolean).join(" · ");

  if (!ativo) {
    // Finalizado: uma linha; toque para ver o resto.
    return (
      <article
        id={`pedido-${pedido.id}`}
        aria-label={`Pedido ${pedido.numero}`}
        className="flex flex-col gap-1 rounded-lg border bg-background p-3 text-sm"
      >
        <button
          type="button"
          className="flex min-h-11 items-center justify-between gap-2 text-left"
          aria-expanded={detalhes}
          onClick={() => setDetalhes((d) => !d)}
        >
          <span className="flex flex-col">
            <span className="font-semibold">
              Nº {pedido.numero} · {pedido.clienteNome}
            </span>
            <span className={cn("text-xs", pedido.status === "cancelado" ? "text-destructive" : "text-green-700")}>
              {pedido.status === "cancelado" ? `Cancelado${pedido.motivoCancelamento ? `: ${pedido.motivoCancelamento}` : ""}` : `Entregue · pago ${formatarBRL(pedido.pago)}`}
            </span>
          </span>
          <span className="flex items-center gap-1 font-semibold tabular-nums">
            {formatarBRL(pedido.total)}
            <ChevronDown className={cn("size-4 transition-transform", detalhes && "rotate-180")} aria-hidden />
          </span>
        </button>
        {detalhes ? (
          <ul className="flex flex-col gap-0.5 border-t pt-2 text-muted-foreground">
            {pedido.itens.map((item) => (
              <li key={item.id}>
                {item.quantidade}× {item.nome}
              </li>
            ))}
            <li>{pedido.hora} · {resumoEndereco}</li>
          </ul>
        ) : null}
      </article>
    );
  }

  return (
    <article
      id={`pedido-${pedido.id}`}
      aria-label={`Pedido ${pedido.numero}`}
      draggable={arrastavel && modo === "normal"}
      onDragStart={(ev) => {
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", pedido.id);
        aoArrastar?.(true);
      }}
      onDragEnd={() => aoArrastar?.(false)}
      className={cn(
        "flex flex-col gap-2 rounded-xl border-2 bg-background p-3 shadow-sm",
        pedido.status === "recebido" && "border-[var(--cor-primaria)] shadow-md",
        pedido.status === "pronto" && "border-green-600",
        arrastavel && modo === "normal" && "lg:cursor-grab lg:active:cursor-grabbing",
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1">
          {arrastavel ? <GripVertical className="mt-1 hidden size-4 shrink-0 text-muted-foreground lg:block" aria-hidden /> : null}
          <div>
            <h3 className="flex flex-wrap items-center gap-2 text-lg font-bold">
              Nº {pedido.numero}
              {pedido.status === "pronto" ? (
                <span className="rounded-full bg-green-700 px-2.5 py-0.5 text-xs font-bold tracking-wide whitespace-nowrap text-white uppercase">
                  Pronto
                </span>
              ) : null}
            </h3>
            <p className="text-xs text-muted-foreground">
              {pedido.hora} · {pedido.tempo}
            </p>
          </div>
        </div>
        <span className="text-lg font-bold tabular-nums">{formatarBRL(pedido.total)}</span>
      </header>

      <button
        type="button"
        className="-mx-1 flex min-h-11 items-center justify-between gap-2 rounded-md px-1 text-left text-sm hover:bg-muted/60"
        aria-expanded={detalhes}
        onClick={() => setDetalhes((d) => !d)}
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{pedido.clienteNome}</span>
          {!detalhes && resumoEndereco ? <span className="truncate text-xs text-muted-foreground">{resumoEndereco}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          Detalhes
          <ChevronDown className={cn("size-4 transition-transform", detalhes && "rotate-180")} aria-hidden />
        </span>
      </button>

      {detalhes ? (
        <div className="flex flex-col gap-1 text-sm">
          <span className="flex flex-wrap items-center gap-3">
            <a href={`tel:${telefone}`} className="flex min-h-9 items-center gap-1 underline-offset-4 hover:underline">
              <Phone className="size-3.5" aria-hidden />
              {telefoneFormatado(pedido.clienteTelefone)}
            </a>
            <a
              href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Olá, ${pedido.clienteNome}! Sobre seu pedido nº ${pedido.numero}:`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-9 items-center gap-1 text-green-700 underline-offset-4 hover:underline"
            >
              <MessageCircle className="size-3.5" aria-hidden />
              WhatsApp
            </a>
          </span>
          <span className="flex items-start gap-1 text-muted-foreground">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              {[e.rua, e.numero].filter(Boolean).join(", ")}
              {e.complemento ? ` · ${e.complemento}` : ""}
              {pedido.bairro ? ` · ${pedido.bairro}` : ""}
              {e.referencia ? <span className="block">Ref.: {e.referencia}</span> : null}
            </span>
          </span>
        </div>
      ) : null}

      <ul className="flex flex-col gap-1 border-y py-2 text-sm">
        {pedido.itens.map((item) => (
          <li key={item.id} className="flex justify-between gap-2">
            <span>
              <strong>{item.quantidade}×</strong> {item.nome}
              {item.adicionais.length > 0 ? (
                <span className="block text-xs text-muted-foreground">{resumoAdicionais(item.adicionais)}</span>
              ) : null}
              {item.observacao ? <span className="block text-xs text-amber-700">→ {item.observacao}</span> : null}
            </span>
            <span className="tabular-nums text-muted-foreground">{formatarBRL(item.total)}</span>
          </li>
        ))}
        {pedido.taxaEntrega > 0 ? (
          <li className="flex justify-between gap-2 text-muted-foreground">
            <span>Taxa de entrega</span>
            <span className="tabular-nums">{formatarBRL(pedido.taxaEntrega)}</span>
          </li>
        ) : null}
      </ul>

      {/* A observação do pedido aparece sempre: costuma mudar o preparo ou a entrega. */}
      {pedido.observacao ? (
        <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">Obs.: {pedido.observacao}</p>
      ) : null}

      <p className="text-sm">
        Pagamento: <strong>{pedido.formaPrevista ? nomeForma(pedido.formaPrevista) : "—"}</strong>
        {pedido.formaPrevista === "dinheiro" && pedido.trocoPara ? (
          <>
            {" "}
            · troco para {formatarBRL(pedido.trocoPara)} (<strong>levar {formatarBRL(pedido.trocoPara - pedido.total)}</strong>)
          </>
        ) : null}
      </p>

      {modo === "normal" ? (
        <div className="flex flex-wrap gap-2">
          {naCozinha ? (
            <p className="basis-full rounded-md bg-muted px-3 py-2 text-sm font-medium">
              Na cozinha: falta{pedido.pracasPendentes === 1 ? "" : "m"} {pedido.pracasPendentes}{" "}
              {pedido.pracasPendentes === 1 ? "praça" : "praças"} marcar pronto
            </p>
          ) : null}
          {proximo ? (
            <Button
              type="button"
              className="h-11 flex-1"
              disabled={pendente}
              onClick={() => executar(() => avancarPedido(pedido.id, proximo.status))}
            >
              {proximo.rotulo}
            </Button>
          ) : null}
          {pedido.status !== "recebido" ? (
            <Button
              type="button"
              variant={pedido.status === "saiu_entrega" ? "default" : "outline"}
              className="h-11 flex-1"
              disabled={pendente}
              onClick={() => setModo("entregar")}
            >
              Entregue e pago
            </Button>
          ) : null}
          <Button type="button" variant="ghost" className="h-11 text-destructive" disabled={pendente} onClick={() => setModo("cancelar")}>
            Cancelar
          </Button>
        </div>
      ) : null}

      {modo === "entregar" ? (
        <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3">
          <span className="text-sm font-medium">Como o cliente pagou {formatarBRL(pedido.total - pedido.pago)}?</span>
          <div className="grid grid-cols-2 gap-2">
            {FORMAS_PAGAMENTO.map((f) => (
              <Button
                key={f.valor}
                type="button"
                variant={forma === f.valor ? "default" : "outline"}
                aria-pressed={forma === f.valor}
                className="h-10"
                onClick={() => setForma(f.valor)}
              >
                {f.rotulo}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="h-11 flex-1 bg-green-700 text-white hover:bg-green-800"
              disabled={pendente}
              onClick={() => executar(() => entregarPedido(pedido.id, forma), () => setModo("normal"))}
            >
              Confirmar entrega
            </Button>
            <Button type="button" variant="ghost" className="h-11" onClick={() => setModo("normal")}>
              Voltar
            </Button>
          </div>
        </div>
      ) : null}

      {modo === "cancelar" ? (
        <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3">
          <span className="text-sm font-medium">Motivo do cancelamento</span>
          <div className="flex flex-wrap gap-2">
            {MOTIVOS.map((m) => (
              <Button key={m} type="button" size="sm" variant={motivo === m ? "default" : "outline"} onClick={() => setMotivo(m)}>
                {m}
              </Button>
            ))}
          </div>
          <Input
            value={MOTIVOS.includes(motivo) ? "" : motivo}
            onChange={(ev) => setMotivo(ev.target.value)}
            placeholder="Ou escreva o motivo"
            className="h-10 bg-background"
            aria-label="Outro motivo"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              className="h-11 flex-1"
              disabled={pendente || motivo.trim().length < 3}
              onClick={() => executar(() => cancelarPedido(pedido.id, motivo), () => setModo("normal"))}
            >
              Confirmar cancelamento
            </Button>
            <Button type="button" variant="ghost" className="h-11" onClick={() => setModo("normal")}>
              Voltar
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
