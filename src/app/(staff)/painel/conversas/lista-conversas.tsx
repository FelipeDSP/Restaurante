import Link from "next/link";

import { formatarBRL } from "@/lib/dinheiro";
import { nomeStatusPedido } from "@/lib/rotulos";
import { cn } from "@/lib/utils";

import type { ItemConversa } from "./dados";

// Lista de conversas (mais recente primeiro); a aberta fica marcada.
export function ListaConversas({ conversas, selecionada }: { conversas: ItemConversa[]; selecionada?: string }) {
  if (conversas.length === 0) {
    return <p className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">Nenhuma conversa nos últimos 7 dias.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {conversas.map(({ pedido, ultima, naoLidas }) => (
        <li key={pedido.id}>
          <Link
            href={`/painel/conversas/${pedido.id}`}
            aria-current={pedido.id === selecionada ? "page" : undefined}
            className={cn(
              "flex flex-col gap-1 rounded-xl border bg-background p-3 hover:bg-muted/60",
              pedido.id === selecionada && "border-[var(--cor-primaria)] ring-1 ring-[var(--cor-primaria)]",
              naoLidas > 0 && "border-[var(--cor-primaria)]",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className={cn("truncate", naoLidas > 0 ? "font-bold" : "font-semibold")}>
                Nº {pedido.numero} · {pedido.clienteNome}
              </span>
              {naoLidas > 0 ? (
                <span className="shrink-0 rounded-full bg-[var(--cor-primaria)] px-2 text-xs font-bold text-[var(--cor-primaria-contraste)]">
                  {naoLidas}
                </span>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">{ultima.quando}</span>
              )}
            </span>
            <span className={cn("line-clamp-2 text-sm", naoLidas > 0 ? "text-foreground" : "text-muted-foreground")}>
              {ultima.autor === "equipe" ? "Você: " : ""}
              {ultima.texto}
            </span>
            <span className="text-xs text-muted-foreground">
              {nomeStatusPedido(pedido.status)} · {formatarBRL(pedido.total)}
              {naoLidas > 0 ? ` · ${ultima.quando}` : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
