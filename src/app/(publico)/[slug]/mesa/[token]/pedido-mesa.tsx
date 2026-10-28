"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Minus, Plus, Send, ShoppingBag, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatarBRL } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";

import { precoUnitario, useCarrinho } from "../../carrinho-store";
import { pedirPelaMesa } from "./actions";

// Pedido do cliente na mesa: barra embaixo e a revisão antes de mandar para a cozinha.
export function BarraPedidoMesa({ slug, token, carrinho }: { slug: string; token: string; carrinho: string }) {
  const router = useRouter();
  const { itens, alterarQuantidade, limpar, quantidade, subtotal } = useCarrinho(carrinho);
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [ancora, setAncora] = useState<HTMLSpanElement | null>(null);
  // A mesma chave até dar certo: reenviar (internet caiu, toque duplo) não pede em dobro.
  const lote = useRef<string | null>(null);

  async function enviar() {
    if (enviando || itens.length === 0) return;
    setEnviando(true);
    lote.current ??= crypto.randomUUID();
    try {
      const r = await pedirPelaMesa(slug, {
        token,
        lote: lote.current,
        total: subtotal,
        itens: itens.map((i) => ({
          produto_id: i.produtoId,
          quantidade: i.quantidade,
          observacao: i.observacao,
          adicionais: i.adicionais.map((a) => a.id),
        })),
      });
      if (r.ok) {
        lote.current = null;
        limpar();
        setAberto(false);
        toast.success("Pedido enviado! Já foi para a cozinha.", { duration: 6000 });
      } else {
        if (r.atualizar) {
          lote.current = null;
          router.refresh();
        }
        toast.error(r.mensagem);
      }
    } catch {
      toast.error("Sem internet. Confira a conexão e toque em Enviar de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <span ref={setAncora} hidden />
      {quantidade > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-20 p-3">
          <button
            type="button"
            onClick={() => setAberto(true)}
            className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between rounded-xl bg-[var(--cor-primaria)] px-5 font-semibold text-[var(--cor-primaria-contraste)] shadow-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span className="flex items-center gap-2">
              <ShoppingBag className="size-5" aria-hidden />
              Ver pedido · {quantidade} {quantidade === 1 ? "item" : "itens"}
            </span>
            <span className="tabular-nums">{formatarBRL(subtotal)}</span>
          </button>
        </div>
      ) : null}

      <Dialog.Root open={aberto && quantidade > 0} onOpenChange={setAberto}>
        <Dialog.Portal container={ancora?.parentElement ?? undefined}>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
          <Dialog.Popup
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl outline-none transition-transform duration-200",
              "data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full",
              "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
            )}
          >
            <div className="flex items-center justify-between gap-3 border-b p-4">
              <Dialog.Title className="text-lg font-bold">Seu pedido</Dialog.Title>
              <Dialog.Close className="flex size-11 items-center justify-center rounded-full hover:bg-muted" aria-label="Fechar">
                <X className="size-5" />
              </Dialog.Close>
            </div>
            <ul className="flex flex-1 flex-col divide-y overflow-y-auto px-4">
              {itens.map((i) => (
                <li key={i.chave} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{i.nome}</p>
                    {i.adicionais.length > 0 ? (
                      <p className="text-sm text-muted-foreground">{i.adicionais.map((a) => a.nome).join(", ")}</p>
                    ) : null}
                    {i.observacao ? <p className="text-sm text-muted-foreground">Obs.: {i.observacao}</p> : null}
                    <p className="text-sm font-semibold tabular-nums">{formatarBRL(precoUnitario(i) * i.quantidade)}</p>
                  </div>
                  <div className="flex items-center gap-1 rounded-full border p-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 rounded-full"
                      aria-label={`Tirar um ${i.nome}`}
                      onClick={() => alterarQuantidade(i.chave, i.quantidade - 1)}
                    >
                      <Minus />
                    </Button>
                    <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite">
                      {i.quantidade}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      className="size-9 rounded-full"
                      aria-label={`Mais um ${i.nome}`}
                      onClick={() => alterarQuantidade(i.chave, i.quantidade + 1)}
                    >
                      <Plus />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-3 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <p className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="tabular-nums">{formatarBRL(subtotal)}</span>
              </p>
              <Button
                type="button"
                onClick={enviar}
                disabled={enviando}
                className="h-12 bg-[var(--cor-primaria)] text-base text-[var(--cor-primaria-contraste)] hover:bg-[var(--cor-primaria)]/90"
              >
                <Send aria-hidden />
                {enviando ? "Enviando..." : "Enviar pedido"}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
