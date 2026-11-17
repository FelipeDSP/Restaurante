"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

// Enquanto o restaurante não aceitou, o cliente pode cancelar o pedido (confirmação no lugar,
// motivo opcional). Depois do aceite o botão some e o caminho é a conversa com o restaurante.
export function CancelarPedido({ pedidoId, numero, aoCancelar }: { pedidoId: string; numero: number; aoCancelar: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function cancelar() {
    if (enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/pedidos/${pedidoId}/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivo.trim() || undefined }),
      });
      const corpo = (await r.json().catch(() => ({}))) as { erro?: string };
      if (!r.ok) {
        setErro(corpo.erro ?? "Não foi possível cancelar. Tente de novo.");
        aoCancelar(); // o restaurante pode ter aceitado agora: atualiza a tela
        return;
      }
      aoCancelar();
    } catch {
      setErro("Sem internet. O pedido não foi cancelado.");
    } finally {
      setEnviando(false);
    }
  }

  if (!confirmando) {
    return (
      <Button type="button" variant="ghost" className="h-11 w-full text-destructive hover:text-destructive" onClick={() => setConfirmando(true)}>
        Cancelar pedido
      </Button>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-background p-4" aria-labelledby="titulo-cancelar">
      <h2 id="titulo-cancelar" className="font-semibold">
        Cancelar o pedido nº {numero}?
      </h2>
      <textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        rows={2}
        maxLength={300}
        placeholder="Motivo (opcional)"
        aria-label="Motivo do cancelamento (opcional)"
        className="min-h-11 resize-none rounded-lg border bg-background px-3 py-2 text-base outline-none focus:ring-2 focus:ring-ring/50"
      />
      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => setConfirmando(false)} disabled={enviando}>
          Não
        </Button>
        <Button type="button" variant="destructive" className="h-11 flex-1" onClick={cancelar} disabled={enviando}>
          {enviando ? "Cancelando…" : "Sim, cancelar"}
        </Button>
      </div>
    </section>
  );
}
