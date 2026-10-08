"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { mensagemFalhaRede } from "@/components/staff/acoes-cliente";
import { cn } from "@/lib/utils";

import { avancarPedido } from "./actions";
import { CartaoPedido, type PedidoDelivery } from "./cartao-pedido";

type Status = PedidoDelivery["status"];
type ColunaId = "novos" | "preparo" | "prontos" | "entrega" | "finalizados";

const COLUNAS: { id: ColunaId; titulo: string; status: Status[]; vazio: string; destaque?: string }[] = [
  { id: "novos", titulo: "Novos", status: ["recebido"], vazio: "Nenhum pedido novo.", destaque: "bg-[var(--cor-primaria)]" },
  { id: "preparo", titulo: "Em preparo", status: ["em_preparo"], vazio: "Nada em preparo." },
  { id: "prontos", titulo: "Prontos", status: ["pronto"], vazio: "Nada esperando o entregador.", destaque: "bg-green-700" },
  { id: "entrega", titulo: "Em entrega", status: ["saiu_entrega"], vazio: "Nada em entrega." },
  { id: "finalizados", titulo: "Finalizados", status: ["entregue", "cancelado"], vazio: "Nenhum pedido finalizado nesta sessão." },
];

// Para onde cada pedido pode ser arrastado (só para frente; o banco confere de novo).
// "finalizados" abre a confirmação do pagamento no cartão; cancelar é só pelo botão (pede motivo).
function destino(pedido: PedidoDelivery, coluna: ColunaId): Status | "entregar" | null {
  const s = pedido.status;
  if (coluna === "preparo" && s === "recebido") return "em_preparo";
  if (coluna === "prontos" && s === "em_preparo" && pedido.pracasPendentes === 0) return "pronto";
  if (coluna === "entrega" && (s === "em_preparo" || s === "pronto")) return "saiu_entrega";
  if (coluna === "finalizados" && (s === "em_preparo" || s === "pronto" || s === "saiu_entrega")) return "entregar";
  return null;
}

export function QuadroDelivery({ pedidos }: { pedidos: PedidoDelivery[] }) {
  // O cartão muda de coluna na hora; se o banco recusar, volta quando a tela recarrega.
  const [visiveis, mover] = useOptimistic(pedidos, (atual, { id, status }: { id: string; status: Status }) =>
    atual.map((p) => (p.id === id ? { ...p, status } : p)),
  );
  const [, iniciar] = useTransition();
  const [arrastando, setArrastando] = useState<PedidoDelivery | null>(null);
  const [sobre, setSobre] = useState<ColunaId | null>(null);
  // Cartão que foi solto em "Finalizados": abre já na confirmação do pagamento.
  const [entregando, setEntregando] = useState<string | null>(null);
  // No computador, "Finalizados" fica recolhido numa faixa para sobrar espaço às outras colunas.
  const [finalizadosAberto, setFinalizadosAberto] = useState(false);

  function soltar(coluna: ColunaId) {
    const pedido = arrastando;
    setArrastando(null);
    setSobre(null);
    if (!pedido) return;
    const alvo = destino(pedido, coluna);
    if (!alvo) return;
    if (alvo === "entregar") {
      setEntregando(pedido.id);
      setFinalizadosAberto(true);
      document.getElementById(`pedido-${pedido.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    iniciar(async () => {
      mover({ id: pedido.id, status: alvo });
      try {
        const r = await avancarPedido(pedido.id, alvo);
        if (r?.ok) toast.success(r.mensagem);
        else toast.error(r?.mensagem ?? "Não foi possível mover o pedido.");
      } catch {
        toast.error(mensagemFalhaRede());
      }
    });
  }

  function irPara(coluna: ColunaId) {
    document.getElementById(`coluna-${coluna}`)?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }

  const listas = COLUNAS.map((coluna) => {
    const lista = visiveis.filter((p) => coluna.status.includes(p.status));
    // Finalizados: mais recentes primeiro. As outras: mais antigos primeiro (quem espera há mais tempo).
    if (coluna.id === "finalizados") lista.reverse();
    return { ...coluna, lista };
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Celular: atalhos para as colunas, com a contagem de cada uma. */}
      <nav aria-label="Colunas" className="-mx-4 flex gap-2 overflow-x-auto px-4 sem-barra-rolagem lg:hidden">
        {listas.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => irPara(c.id)}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border bg-background px-4 text-sm font-medium"
          >
            {c.titulo}
            <span
              className={cn(
                "rounded-full px-2 text-xs tabular-nums",
                c.lista.length > 0 && c.destaque ? `${c.destaque} text-white` : "bg-muted",
              )}
            >
              {c.lista.length}
            </span>
          </button>
        ))}
      </nav>

      <div className="-mx-4 flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6 lg:snap-none">
        {listas.map((coluna) => {
          const valida = arrastando ? destino(arrastando, coluna.id) !== null : false;
          const recolhida = coluna.id === "finalizados" && !finalizadosAberto;
          return (
            <section
              key={coluna.id}
              id={`coluna-${coluna.id}`}
              aria-labelledby={`titulo-${coluna.id}`}
              onDragOver={(e) => {
                if (!valida) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (sobre !== coluna.id) setSobre(coluna.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setSobre((s) => (s === coluna.id ? null : s));
              }}
              onDrop={(e) => {
                e.preventDefault();
                soltar(coluna.id);
              }}
              className={cn(
                "flex w-[85vw] max-w-sm shrink-0 snap-start flex-col rounded-xl bg-muted/60 transition-colors sm:w-80 lg:max-h-[calc(100dvh-11rem)]",
                coluna.id === "finalizados"
                  ? recolhida
                    ? "lg:w-14"
                    : "lg:w-72"
                  : "lg:w-auto lg:min-w-64 lg:max-w-none lg:flex-1",
                arrastando && valida && "outline-2 outline-offset-2 outline-[var(--cor-primaria)] outline-dashed",
                sobre === coluna.id && "bg-[color-mix(in_oklab,var(--cor-primaria)_12%,transparent)]",
                arrastando && !valida && "opacity-50",
              )}
            >
              {recolhida ? (
                <button
                  type="button"
                  onClick={() => setFinalizadosAberto(true)}
                  aria-label={`Mostrar finalizados (${coluna.lista.length})`}
                  className="hidden flex-1 flex-col items-center gap-3 py-3 text-sm font-semibold hover:bg-muted lg:flex"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                  <span className="rounded-full bg-background px-2 tabular-nums">{coluna.lista.length}</span>
                  <span className="[writing-mode:vertical-rl]">Finalizados</span>
                </button>
              ) : null}
              <h2
                id={`titulo-${coluna.id}`}
                className={cn("flex items-center justify-between gap-2 px-3 pt-3 pb-2 font-semibold", recolhida && "lg:hidden")}
              >
                <span className="flex items-center gap-2">
                  {coluna.destaque ? <span aria-hidden className={cn("size-2.5 rounded-full", coluna.destaque)} /> : null}
                  {coluna.titulo}
                </span>
                <span className="flex items-center gap-1">
                  <span className="rounded-full bg-background px-2 text-sm tabular-nums">{coluna.lista.length}</span>
                  {coluna.id === "finalizados" ? (
                    <button
                      type="button"
                      onClick={() => setFinalizadosAberto(false)}
                      aria-label="Recolher finalizados"
                      className="hidden size-8 items-center justify-center rounded-md hover:bg-background lg:flex"
                    >
                      <ChevronRight className="size-4" aria-hidden />
                    </button>
                  ) : null}
                </span>
              </h2>
              <div className={cn("flex min-h-24 flex-col gap-2 overflow-y-auto px-2 pb-2", recolhida && "lg:hidden")}>
                {coluna.lista.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{coluna.vazio}</p>
                ) : (
                  coluna.lista.map((pedido) => (
                    <CartaoPedido
                      key={pedido.id + (entregando === pedido.id ? ":entregar" : "")}
                      pedido={pedido}
                      modoInicial={entregando === pedido.id ? "entregar" : "normal"}
                      aoSairDoModo={() => setEntregando((id) => (id === pedido.id ? null : id))}
                      arrastavel={COLUNAS.some((c) => destino(pedido, c.id) !== null)}
                      aoArrastar={(ativo) => setArrastando(ativo ? pedido : null)}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
