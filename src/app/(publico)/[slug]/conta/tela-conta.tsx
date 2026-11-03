"use client";

import { ChevronRight, LogOut, MapPin, Pencil, ReceiptText, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { mensagemFalhaRede } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarBRL } from "@/lib/dinheiro";
import { nomeStatusPedido } from "@/lib/rotulos";
import { formatarTelefone } from "@/lib/telefone";
import { cn } from "@/lib/utils";

import type { EnderecoSalvo, PedidoDaConta } from "../conta";
import { excluirConta, mudarNome, removerEndereco, type ResultadoEntrar, sair } from "../entrar/actions";

type Props = {
  slug: string;
  conta: { nome: string; telefone: string; enderecos: EnderecoSalvo[] };
  pedidos: { id: string; numero: number; status: PedidoDaConta["status"]; total: number; quando: string }[];
};

const rotuloStatus = (status: PedidoDaConta["status"]) => (status === "recebido" ? "Recebido" : nomeStatusPedido(status));

export function TelaConta({ slug, conta, pedidos }: Props) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [editandoNome, setEditandoNome] = useState(false);
  const [nome, setNome] = useState(conta.nome);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  function executar(acao: () => Promise<ResultadoEntrar>, aoSucesso?: () => void) {
    iniciar(async () => {
      try {
        const r = await acao();
        if (!r.ok) {
          toast.error(r.mensagem);
          return;
        }
        aoSucesso?.();
        router.refresh();
      } catch {
        toast.error(mensagemFalhaRede());
      }
    });
  }

  return (
    <main className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">Minha conta</h1>

      {/* Quem é */}
      <section aria-label="Seus dados" className="flex items-center gap-3 rounded-xl bg-background p-4 shadow-sm">
        <span
          aria-hidden
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[var(--cor-primaria)] text-2xl font-bold text-[var(--cor-primaria-contraste)]"
        >
          {conta.nome.trim().charAt(0).toUpperCase() || "?"}
        </span>
        {editandoNome ? (
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              executar(() => mudarNome(slug, nome), () => setEditandoNome(false));
            }}
          >
            <Input value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Seu nome" maxLength={120} className="h-11 flex-1" autoFocus />
            <Button type="submit" className="h-11" disabled={pendente}>
              Salvar
            </Button>
          </form>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-lg font-semibold">{conta.nome}</span>
              <span className="text-sm text-muted-foreground">{formatarTelefone(conta.telefone)}</span>
            </div>
            <Button type="button" variant="outline" className="h-11" onClick={() => setEditandoNome(true)}>
              <Pencil />
              Editar
            </Button>
          </>
        )}
      </section>

      {/* Endereços que o banco guardou nos pedidos (até 5): aparecem como botões no checkout. */}
      <section aria-labelledby="titulo-enderecos" className="flex flex-col gap-3 rounded-xl bg-background p-4 shadow-sm">
        <h2 id="titulo-enderecos" className="flex items-center gap-2 font-semibold">
          <MapPin className="size-4" aria-hidden />
          Endereços salvos
        </h2>
        {conta.enderecos.length === 0 ? (
          <p className="text-sm text-muted-foreground">O endereço do seu próximo pedido fica salvo aqui para os próximos.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {conta.enderecos.map((e) => (
              <li key={e.id} className="flex items-start gap-3 rounded-lg border p-3">
                <div className="flex min-w-0 flex-1 flex-col text-sm">
                  <span className="font-medium">
                    {e.rua}, {e.numero}
                    {e.complemento ? ` · ${e.complemento}` : ""}
                  </span>
                  <span className="text-muted-foreground">
                    {[e.bairro, [e.cidade, e.uf].filter(Boolean).join("/"), e.cep ? `CEP ${e.cep}` : null].filter(Boolean).join(" · ")}
                  </span>
                  {e.referencia ? <span className="text-muted-foreground">Referência: {e.referencia}</span> : null}
                </div>
                {removendo === e.id ? (
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={pendente}
                      onClick={() => executar(() => removerEndereco(slug, e.id), () => setRemovendo(null))}
                    >
                      Remover
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setRemovendo(null)}>
                      Manter
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover ${e.rua}, ${e.numero}`}
                    onClick={() => setRemovendo(e.id)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Últimos pedidos da conta */}
      <section aria-labelledby="titulo-pedidos" className="flex flex-col gap-3 rounded-xl bg-background p-4 shadow-sm">
        <h2 id="titulo-pedidos" className="flex items-center gap-2 font-semibold">
          <ReceiptText className="size-4" aria-hidden />
          Últimos pedidos
        </h2>
        {pedidos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Você ainda não fez pedidos com esta conta.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {pedidos.map((p) => (
              <li key={p.id}>
                <Link href={`/${slug}/pedido/${p.id}`} className="flex min-h-14 items-center gap-3 py-2">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">Pedido nº {p.numero}</span>
                    <span className="text-xs text-muted-foreground">{p.quando}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="font-semibold tabular-nums">{formatarBRL(p.total)}</span>
                    <span className={cn("text-xs", p.status === "cancelado" ? "text-destructive" : "text-muted-foreground")}>
                      {rotuloStatus(p.status)}
                    </span>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {pedidos.length > 0 ? (
          <Button variant="outline" className="h-11" nativeButton={false} render={<Link href={`/${slug}/pedidos`} />}>
            Ver todos os pedidos
          </Button>
        ) : null}
      </section>

      {/* Sair e excluir */}
      <section aria-label="Conta" className="flex flex-col gap-2 rounded-xl bg-background p-4 shadow-sm">
        {confirmandoExclusao ? (
          <div className="flex flex-col gap-2" role="alert">
            <p className="text-sm font-medium">
              Excluir sua conta? Seu nome, telefone e endereços são apagados. Os pedidos já feitos continuam com o restaurante.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                className="h-11"
                disabled={pendente}
                onClick={() =>
                  executar(
                    () => excluirConta(slug),
                    () => {
                      toast.success("Conta excluída.");
                      router.push(`/${slug}`);
                    },
                  )
                }
              >
                Excluir conta
              </Button>
              <Button type="button" variant="outline" className="h-11" onClick={() => setConfirmandoExclusao(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={pendente}
              onClick={() => executar(sair, () => router.push(`/${slug}`))}
            >
              <LogOut />
              Sair da conta
            </Button>
            <Button type="button" variant="ghost" className="h-11 text-destructive" onClick={() => setConfirmandoExclusao(true)}>
              Excluir minha conta
            </Button>
          </>
        )}
      </section>
    </main>
  );
}
