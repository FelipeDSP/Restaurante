"use client";

import { ChevronRight, Smartphone } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatarBRL } from "@/lib/dinheiro";
import { nomeStatusPedido } from "@/lib/rotulos";
import { dataHoraLocal } from "@/lib/tempo";
import { cn } from "@/lib/utils";

import { temDadosSalvos, useDadosCliente } from "../carrinho/dados-cliente";
import type { PedidoPublico } from "../dados";
import { useMeusPedidos } from "../meus-pedidos";

type Props = {
  restaurante: { id: string; slug: string; fusoHorario: string };
  bairros: { id: string; nome: string }[];
};

type Situacao = Pick<PedidoPublico, "status" | "total"> | "carregando" | "sem_conexao";

// Para o cliente, "recebido" (no caixa é "Novo").
const rotuloStatus = (status: PedidoPublico["status"]) => (status === "recebido" ? "Recebido" : nomeStatusPedido(status));

export function ListaMeusPedidos({ restaurante, bairros }: Props) {
  const { pedidos, esquecer, limpar: limparPedidos } = useMeusPedidos(restaurante.id);
  const [dados, , limparDados] = useDadosCliente(restaurante.id);
  const [situacoes, setSituacoes] = useState<Record<string, Situacao>>({});
  const [confirmando, setConfirmando] = useState(false);

  // Status de agora de cada pedido guardado (a lista no aparelho só tem id, número e data).
  useEffect(() => {
    let cancelado = false;
    for (const { id } of pedidos) {
      fetch(`/api/pedidos/${id}`, { cache: "no-store" })
        .then(async (r) => {
          if (cancelado) return;
          if (r.status === 404) {
            esquecer(id);
            return;
          }
          if (!r.ok) throw new Error(String(r.status));
          const { status, total } = (await r.json()) as PedidoPublico;
          setSituacoes((s) => ({ ...s, [id]: { status, total } }));
        })
        .catch(() => {
          if (!cancelado) setSituacoes((s) => ({ ...s, [id]: "sem_conexao" }));
        });
    }
    return () => {
      cancelado = true;
    };
  }, [pedidos, esquecer]);

  const bairro = bairros.find((b) => b.id === dados.bairroId)?.nome;
  const endereco = [[dados.rua, dados.numero].filter(Boolean).join(", "), dados.complemento, bairro].filter(Boolean).join(" · ");
  const temDados = temDadosSalvos(dados);

  return (
    <>
      {pedidos.length === 0 ? (
        <section className="flex flex-col items-center gap-4 rounded-xl bg-background p-6 text-center shadow-sm">
          <p className="text-muted-foreground">Nenhum pedido feito neste aparelho ainda.</p>
          <Button nativeButton={false} render={<Link href={`/${restaurante.slug}`} />}>
            Ver cardápio
          </Button>
        </section>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Pedidos feitos neste aparelho">
          {pedidos.map((p) => {
            const situacao = situacoes[p.id] ?? "carregando";
            const andamento = typeof situacao === "object" && situacao.status !== "entregue" && situacao.status !== "cancelado";
            return (
              <li key={p.id}>
                <Link
                  href={`/${restaurante.slug}/pedido/${p.id}`}
                  className={cn(
                    "flex min-h-16 items-center gap-3 rounded-xl bg-background p-3 shadow-sm",
                    andamento && "border-2 border-[var(--cor-primaria)]",
                  )}
                >
                  <span className="flex flex-1 flex-col">
                    <span className="font-semibold">Pedido nº {p.numero}</span>
                    <span className="text-sm text-muted-foreground">{dataHoraLocal(p.criadoEm, restaurante.fusoHorario)}</span>
                  </span>
                  <span className="flex flex-col items-end text-sm">
                    {typeof situacao === "object" ? (
                      <>
                        <span
                          className={cn(
                            "font-medium",
                            situacao.status === "cancelado" && "text-destructive",
                            andamento && "text-[var(--cor-primaria-texto)]",
                          )}
                        >
                          {rotuloStatus(situacao.status)}
                        </span>
                        <span className="tabular-nums text-muted-foreground">{formatarBRL(situacao.total)}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">{situacao === "carregando" ? "…" : "Sem conexão"}</span>
                    )}
                  </span>
                  <ChevronRight className="size-5 shrink-0" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {temDados || pedidos.length > 0 ? (
        <section aria-labelledby="titulo-aparelho" className="flex flex-col gap-2 rounded-xl bg-background p-4 shadow-sm">
          <h2 id="titulo-aparelho" className="flex items-center gap-2 font-semibold">
            <Smartphone className="size-4" aria-hidden />
            Guardado neste aparelho
          </h2>
          {temDados ? (
            <div className="flex flex-col gap-1 text-sm">
              {dados.nome ? <p>{dados.nome}</p> : null}
              {dados.telefone ? <p className="text-muted-foreground">{dados.telefone}</p> : null}
              {endereco ? <p className="text-muted-foreground">{endereco}</p> : null}
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Seus dados e a lista de pedidos ficam só neste celular, para preencher o próximo pedido. Em outro aparelho, guarde o link do
            pedido.
          </p>
          {confirmando ? (
            <div className="flex flex-col gap-2 rounded-lg bg-muted p-3" role="alert">
              <p className="text-sm font-medium">Apagar seus dados e a lista de pedidos deste aparelho? Os pedidos continuam no restaurante.</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    limparDados();
                    limparPedidos();
                    setConfirmando(false);
                  }}
                >
                  Apagar
                </Button>
                <Button type="button" variant="outline" onClick={() => setConfirmando(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" className="w-fit" onClick={() => setConfirmando(true)}>
              Apagar meus dados deste aparelho
            </Button>
          )}
        </section>
      ) : null}
    </>
  );
}
