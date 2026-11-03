"use client";

import { MessageCircle, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { horaLocal } from "@/lib/tempo";
import { cn } from "@/lib/utils";

type Mensagem = { id: string; autor: "cliente" | "equipe"; texto: string; em: string };
type Conversa = { aberta: boolean; mensagens: Mensagem[] };

// Aberta: confere a cada 5 s; fechada (só o botão): a cada 20 s, para mostrar "nova resposta".
const INTERVALO_ABERTA_MS = 5_000;
const INTERVALO_FECHADA_MS = 20_000;

// "Algum problema? Fale com o restaurante": conversa do cliente (sem conta) com o restaurante,
// pela página do pedido. Também o WhatsApp do restaurante, se ele cadastrou.
export function ConversaCliente({
  pedidoId,
  numero,
  whatsapp,
  fusoHorario,
}: {
  pedidoId: string;
  numero: number;
  whatsapp: string | null;
  fusoHorario: string;
}) {
  const [aberta, setAberta] = useState(false);
  const [conversa, setConversa] = useState<Conversa | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [vistas, setVistas] = useState(0);
  const fim = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/pedidos/${pedidoId}/conversa`, { cache: "no-store" });
      if (r.ok) setConversa((await r.json()) as Conversa);
    } catch {
      // Sem internet: tenta na próxima volta.
    }
  }, [pedidoId]);

  useEffect(() => {
    const agora = setTimeout(() => void carregar(), 0);
    const t = setInterval(() => void carregar(), aberta ? INTERVALO_ABERTA_MS : INTERVALO_FECHADA_MS);
    return () => {
      clearTimeout(agora);
      clearInterval(t);
    };
  }, [carregar, aberta]);

  const mensagens = conversa?.mensagens ?? [];
  const respostas = mensagens.filter((m) => m.autor === "equipe").length;
  // Mensagem nova com a conversa aberta: mostra a última.
  useEffect(() => {
    if (aberta) fim.current?.scrollIntoView({ block: "nearest" });
  }, [aberta, mensagens.length]);
  const novas = aberta ? 0 : Math.max(0, respostas - vistas);
  const abrir = () => {
    setVistas(respostas);
    setAberta(true);
  };

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/pedidos/${pedidoId}/conversa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: t }),
      });
      const corpo = (await r.json().catch(() => ({}))) as { erro?: string };
      if (!r.ok) {
        setErro(corpo.erro ?? "Não foi possível enviar. Tente de novo.");
        return;
      }
      setTexto("");
      await carregar();
    } catch {
      setErro("Sem internet. A mensagem não foi enviada.");
    } finally {
      setEnviando(false);
    }
  }

  // Conversa encerrada e sem mensagens: só o WhatsApp (se houver).
  if (conversa && !conversa.aberta && mensagens.length === 0 && !whatsapp) return null;

  return (
    <section id="conversa" aria-labelledby="titulo-conversa" className="flex scroll-mt-4 flex-col gap-3 rounded-xl border bg-background p-4">
      {!aberta ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 id="titulo-conversa" className="font-semibold">
              Algum problema?
            </h2>
            {novas > 0 ? (
              <span className="rounded-full bg-[var(--cor-primaria)] px-2.5 py-0.5 text-xs font-bold text-[var(--cor-primaria-contraste)]">
                {novas === 1 ? "1 resposta nova" : `${novas} respostas novas`}
              </span>
            ) : null}
          </div>
          <Button
            type="button"
            onClick={abrir}
            className="h-12 w-full bg-[var(--cor-primaria)] text-base font-semibold text-[var(--cor-primaria-contraste)] hover:bg-[var(--cor-primaria)]/90"
          >
            <MessageCircle className="size-5" aria-hidden />
            {novas > 0 ? "Ver resposta" : "Fale conosco"}
          </Button>
        </>
      ) : (
        <>
          <h2 id="titulo-conversa" className="font-semibold">
            Conversa sobre o pedido nº {numero}
          </h2>
          {mensagens.length > 0 ? (
            <ol className="flex max-h-80 flex-col gap-2 overflow-y-auto" aria-live="polite">
              {mensagens.map((m) => (
                <li key={m.id} className={cn("flex flex-col", m.autor === "cliente" ? "items-end" : "items-start")}>
                  <span
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                      m.autor === "cliente" ? "bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]" : "bg-muted",
                    )}
                  >
                    {m.texto}
                  </span>
                  <span className="mt-0.5 text-xs text-muted-foreground">
                    {m.autor === "equipe" ? "Restaurante · " : ""}
                    {horaLocal(m.em, fusoHorario)}
                  </span>
                </li>
              ))}
              <div ref={fim} />
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Conte o que aconteceu. O restaurante responde por aqui.</p>
          )}
          {conversa?.aberta === false ? (
            <p className="text-sm text-muted-foreground">Esta conversa foi encerrada (24 h depois do pedido).</p>
          ) : (
            <form onSubmit={enviar} className="flex items-end gap-2">
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Escreva sua mensagem"
                aria-label="Mensagem para o restaurante"
                className="min-h-11 flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-base outline-none focus:ring-2 focus:ring-ring/50"
              />
              <Button type="submit" size="icon" className="size-11 shrink-0" disabled={enviando || !texto.trim()} aria-label="Enviar">
                <Send />
              </Button>
            </form>
          )}
          {erro ? (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          ) : null}
        </>
      )}
      {whatsapp ? (
        <a
          href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Olá! Sobre o pedido nº ${numero}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center gap-1 text-sm text-muted-foreground underline underline-offset-4"
        >
          Prefere o WhatsApp? Falar com o restaurante no WhatsApp
        </a>
      ) : null}
    </section>
  );
}
