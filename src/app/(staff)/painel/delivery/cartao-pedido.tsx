"use client";

import { MapPin, MessageCircle, Phone } from "lucide-react";
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

export function CartaoPedido({ pedido }: { pedido: PedidoDelivery }) {
  const { pendente, executar } = useAcao();
  const [modo, setModo] = useState<"normal" | "cancelar" | "entregar">("normal");
  const [motivo, setMotivo] = useState("");
  const [forma, setForma] = useState(pedido.formaPrevista ?? "dinheiro");

  const ativo = pedido.status !== "entregue" && pedido.status !== "cancelado";
  const e = pedido.endereco;
  const telefone = pedido.clienteTelefone.replace(/\D/g, "");
  const whatsapp = telefone.length <= 11 ? `55${telefone}` : telefone;
  const naCozinha = pedido.status === "em_preparo" && pedido.pracasPendentes > 0;
  const proximo = naCozinha ? undefined : PROXIMO[pedido.status];

  return (
    <article
      aria-label={`Pedido ${pedido.numero}`}
      className={cn(
        "flex flex-col gap-3 rounded-xl border-2 bg-background p-4",
        pedido.status === "recebido" && "border-[var(--cor-primaria)] shadow-md",
        !ativo && "opacity-70",
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold">Nº {pedido.numero}</h3>
          <p className="text-xs text-muted-foreground">
            {pedido.hora} · {pedido.tempo}
          </p>
        </div>
        <span className="text-lg font-bold tabular-nums">{formatarBRL(pedido.total)}</span>
      </header>

      <div className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">{pedido.clienteNome}</span>
        <span className="flex flex-wrap items-center gap-3">
          <a href={`tel:${telefone}`} className="flex items-center gap-1 underline-offset-4 hover:underline">
            <Phone className="size-3.5" aria-hidden />
            {telefoneFormatado(pedido.clienteTelefone)}
          </a>
          <a
            href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Olá, ${pedido.clienteNome}! Sobre seu pedido nº ${pedido.numero}:`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-green-700 underline-offset-4 hover:underline"
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
        {pedido.status === "entregue" ? <span className="text-green-700"> · pago {formatarBRL(pedido.pago)}</span> : null}
      </p>

      {pedido.status === "cancelado" && pedido.motivoCancelamento ? (
        <p className="text-sm text-destructive">Cancelado: {pedido.motivoCancelamento}</p>
      ) : null}

      {ativo && modo === "normal" ? (
        <div className="flex flex-wrap gap-2">
          {naCozinha ? (
            <p className="flex h-11 flex-1 items-center text-sm font-medium text-muted-foreground">
              Na cozinha ({pedido.pracasPendentes} {pedido.pracasPendentes === 1 ? "praça" : "praças"})
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

      {ativo && modo === "entregar" ? (
        <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3">
          <span className="text-sm font-medium">Como o cliente pagou {formatarBRL(pedido.total - pedido.pago)}?</span>
          <div className="grid grid-cols-3 gap-2">
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
          <div className="flex gap-2">
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

      {ativo && modo === "cancelar" ? (
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
          <div className="flex gap-2">
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
