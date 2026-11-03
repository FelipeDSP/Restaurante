"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { marcarConversaLida, responderCliente } from "./actions";
import type { PedidoDelivery } from "./cartao-pedido";

// Conversa com o cliente, aberta no cartão do pedido. Abrir marca as mensagens do cliente como lidas.
export function ConversaPedido({ pedidoId, conversa }: { pedidoId: string; conversa: PedidoDelivery["conversa"] }) {
  const [texto, setTexto] = useState("");
  const { pendente, executar } = useAcao();
  const fim = useRef<HTMLDivElement>(null);
  const naoLidas = conversa.mensagens.some((m) => m.autor === "cliente" && !m.lida);

  // Mensagem nova do cliente com a conversa aberta: já fica lida e aparece a última.
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "nearest" });
    if (naoLidas) void marcarConversaLida(pedidoId);
  }, [pedidoId, naoLidas, conversa.mensagens.length]);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    executar(() => responderCliente(pedidoId, t), () => setTexto(""));
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3">
      {conversa.mensagens.length > 0 ? (
        <ol className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {conversa.mensagens.map((m) => (
            <li key={m.id} className={cn("flex flex-col", m.autor === "equipe" ? "items-end" : "items-start")}>
              <span
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                  m.autor === "equipe" ? "bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]" : "bg-background",
                )}
              >
                {m.texto}
              </span>
              <span className="mt-0.5 text-xs text-muted-foreground">
                {m.autor === "cliente" ? "Cliente · " : ""}
                {m.hora}
              </span>
            </li>
          ))}
          <div ref={fim} />
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma mensagem. O cliente vê o que você escrever na página do pedido.</p>
      )}
      {conversa.aberta ? (
        <form onSubmit={enviar} className="flex items-end gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            maxLength={1000}
            placeholder="Responder ao cliente"
            aria-label="Resposta ao cliente"
            className="min-h-11 flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50"
          />
          <Button type="submit" size="icon" className="size-11 shrink-0" disabled={pendente || !texto.trim()} aria-label="Enviar">
            <Send />
          </Button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">Conversa encerrada (24 h depois do pedido).</p>
      )}
    </div>
  );
}
