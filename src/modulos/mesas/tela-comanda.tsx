"use client";

import { Check, Printer, ReceiptText, UtensilsCrossed, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { BotaoConfirmar } from "@/components/staff/botao-confirmar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatarBRL } from "@/lib/dinheiro";
import { horaLocal } from "@/lib/tempo";
import { cn } from "@/lib/utils";

import { alterarStatusConta, cancelarComanda, entregarPedido, fecharComanda, imprimirConta } from "./actions";
import { AssumirMesa, Cobrancas, EditarPessoas } from "./comanda-acoes";
import { agruparPorPedido, LinhaItem, ResumoItens } from "./comanda-itens";
import { LinhaPagamento, PainelPagamento } from "./comanda-pagamento";
import type { DetalheComanda } from "./dados";

type Props = {
  mesaId: string;
  // De onde a tela foi aberta: define para onde voltar depois de fechar/lançar.
  origem?: "garcom" | "painel";
  comanda: DetalheComanda;
  // Estornar pagamento (módulo caixa).
  podeEstornar: boolean;
  fusoHorario: string;
};

export function TelaComanda({ mesaId, comanda, podeEstornar, fusoHorario, origem = "garcom" }: Props) {
  const router = useRouter();
  const [pagando, setPagando] = useState(false);
  // Histórico por pedido (cada rodada separada) ou tudo somado por produto.
  const [visao, setVisao] = useState<"pedidos" | "resumo">("pedidos");
  const { pendente, executar } = useAcao();

  const falta = Math.max(0, comanda.total - comanda.pago);
  const quitada = comanda.total > 0 && comanda.pago >= comanda.total;
  const pagoAMais = Math.max(0, comanda.pago - comanda.total);
  const itensAtivos = comanda.itens.filter((i) => !i.cancelado);
  // Fecha quando está paga. Sem consumo (abriu por engano ou tudo cancelado) a mesa é liberada.
  const podeFechar = itensAtivos.length > 0 && comanda.pago >= comanda.total;
  const semConsumo = itensAtivos.length === 0 && comanda.pago === 0;
  const voltarAoMapa = () => router.push("/painel/comandas");

  const painel = origem === "painel";
  const linkLancar = `/painel/comandas/${mesaId}/lancar`;

  return (
    <div
      className={cn(
        "flex flex-1 flex-col gap-5 pb-44",
        // Painel no computador: itens à esquerda; totais, pagamento e ações à direita (sem barra fixa).
        painel && "lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-6 lg:pb-0",
      )}
    >
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {comanda.status === "conta_pedida" ? (
            <Badge className="bg-amber-300 text-amber-950">Conta pedida</Badge>
          ) : (
            <Badge>Ocupada</Badge>
          )}
          <span>desde {horaLocal(comanda.abertaEm, fusoHorario)}</span>
          <EditarPessoas comandaId={comanda.id} pessoas={comanda.pessoas} />
          {comanda.garcom ? <span>· {comanda.garcom}</span> : <AssumirMesa comandaId={comanda.id} />}
        </div>

        <section aria-labelledby="titulo-itens">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 id="titulo-itens" className="text-lg font-semibold">
              Itens
            </h2>
            {comanda.itens.length > 0 ? (
              <div className="flex rounded-lg border p-0.5 text-sm" role="group" aria-label="Como ver os itens">
                {(["pedidos", "resumo"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={visao === v}
                    onClick={() => setVisao(v)}
                    className={cn("min-h-9 pointer-coarse:min-h-11 rounded-md px-3", visao === v ? "bg-muted font-semibold" : "text-muted-foreground")}
                  >
                    {v === "pedidos" ? "Por pedido" : "Tudo junto"}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {comanda.itens.length === 0 ? (
            <p className="py-4 text-muted-foreground">Nenhum item lançado ainda.</p>
          ) : visao === "resumo" ? (
            <ResumoItens itens={comanda.itens} />
          ) : (
            <ol className="flex flex-col gap-3">
              {agruparPorPedido(comanda.itens).map((g) => (
                <li key={g.numero} className="rounded-xl border">
                  <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2 text-sm">
                    <span className="font-semibold">
                      Pedido nº {g.numero} · {horaLocal(g.criadoEm, fusoHorario)}
                      {g.autor ? <span className="font-normal text-muted-foreground"> · {g.autor}</span> : null}
                    </span>
                    <span className="font-semibold tabular-nums">{formatarBRL(g.total)}</span>
                  </div>
                  <ul className="divide-y px-3">
                    {g.itens.map((item) => (
                      <LinhaItem key={item.id} item={item} editavel />
                    ))}
                  </ul>
                  {/* Vários itens a levar: marca todos de uma vez. */}
                  {g.itens.filter((i) => !i.cancelado && !i.entregue).length > 1 ? (
                    <div className="border-t px-3 py-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 w-full border-green-600 text-green-800 hover:bg-green-50"
                        disabled={pendente}
                        onClick={() => executar(() => entregarPedido(g.pedidoId))}
                      >
                        <Check />
                        Entreguei tudo
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <div className={cn("flex flex-col gap-5", painel && "lg:sticky lg:top-24")}>
        <section aria-label="Totais" className="flex flex-col gap-1 rounded-xl bg-muted/60 p-4">
          <Cobrancas comandaId={comanda.id} pessoas={comanda.pessoas} cobranca={comanda.cobranca} />
          <div className="flex justify-between text-lg font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatarBRL(comanda.total)}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Pago</span>
            <span className="tabular-nums">{formatarBRL(comanda.pago)}</span>
          </div>
          {pagoAMais > 0 ? (
            <div className="flex justify-between font-semibold text-amber-800">
              <span>Pago a mais (estorne o excedente)</span>
              <span className="tabular-nums">{formatarBRL(pagoAMais)}</span>
            </div>
          ) : (
            <div className={cn("flex justify-between font-semibold", quitada ? "text-green-700" : comanda.total === 0 ? "text-muted-foreground" : "text-destructive")}>
              <span>{quitada ? "Quitada" : "Falta"}</span>
              <span className="tabular-nums">{formatarBRL(falta)}</span>
            </div>
          )}
        </section>

        {comanda.pagamentos.length > 0 ? (
          <section aria-labelledby="titulo-pagamentos">
            <h2 id="titulo-pagamentos" className="mb-1 text-lg font-semibold">
              Pagamentos
            </h2>
            <ul className="divide-y">
              {comanda.pagamentos.map((p) => (
                <LinhaPagamento key={p.id} pagamento={p} podeEstornar={podeEstornar} fusoHorario={fusoHorario} />
              ))}
            </ul>
          </section>
        ) : null}

        {pagando ? (
          <PainelPagamento
            comandaId={comanda.id}
            total={comanda.total}
            falta={falta}
            pessoas={comanda.pessoas}
            itens={comanda.itens}
            cobranca={comanda.cobranca}
            aoFechar={() => setPagando(false)}
            aoFecharMesa={voltarAoMapa}
          />
        ) : null}

        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 p-3 backdrop-blur",
            painel && "lg:static lg:z-auto lg:rounded-xl lg:border lg:bg-background lg:backdrop-blur-none",
          )}
        >
          <div className={cn("mx-auto grid max-w-md grid-cols-2 gap-2", painel && "lg:max-w-none")}>
            <Button className="h-14 text-base" variant={podeFechar ? "outline" : "default"} nativeButton={false} render={<Link href={linkLancar} />}>
              <UtensilsCrossed />
              Lançar itens
            </Button>
            {/* Paga: fecha num toque. Falta pagar: abre o recebimento, que fecha a mesa quando quita. */}
            {semConsumo ? (
              <BotaoConfirmar
                rotulo="Liberar mesa sem consumo"
                confirmar="Liberar"
                desabilitado={pendente}
                className="h-14 text-base"
                aoConfirmar={() => executar(() => cancelarComanda(comanda.id), voltarAoMapa)}
              >
                Liberar mesa
              </BotaoConfirmar>
            ) : podeFechar ? (
              <Button
                type="button"
                className="h-14 bg-green-700 text-base text-white hover:bg-green-800"
                disabled={pendente}
                onClick={() => executar(() => fecharComanda(comanda.id), voltarAoMapa)}
              >
                <Check />
                Fechar mesa
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="h-14 border-green-700 text-base text-green-800 hover:bg-green-50"
                disabled={pendente || pagando || itensAtivos.length === 0}
                onClick={() => setPagando(true)}
              >
                <Wallet />
                Receber {falta > 0 ? formatarBRL(falta) : ""}
              </Button>
            )}
            {comanda.status === "aberta" && !podeFechar && itensAtivos.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="h-10 text-sm"
                disabled={pendente}
                onClick={() => executar(() => alterarStatusConta(comanda.id, true))}
              >
                <ReceiptText />
                Pedir conta
              </Button>
            ) : null}
            {/* A conta imprime a qualquer momento (antes de pagar, depois de pagar, sem pedir conta). */}
            {itensAtivos.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="h-10 text-sm"
                disabled={pendente}
                onClick={() => executar(() => imprimirConta(comanda.id))}
              >
                <Printer />
                Imprimir conta
              </Button>
            ) : null}
            {comanda.status === "conta_pedida" && !podeFechar ? (
              <Button
                type="button"
                variant="ghost"
                className="h-10 text-sm"
                disabled={pendente}
                onClick={() => executar(() => alterarStatusConta(comanda.id, false))}
              >
                Voltar para aberta
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
