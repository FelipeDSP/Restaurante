import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { exigirAlgumaPermissao } from "@/lib/auth/dal";
import { formatarBRL } from "@/lib/dinheiro";
import { nomeForma } from "@/lib/rotulos";
import { formatarTelefone } from "@/lib/telefone";
import { dataHoraLocal } from "@/lib/tempo";

import { carregarDelivery } from "../../dados";
import { Bloco, Cabecalho, Linha, ListaItens, ListaPagamentos, SeloEncerrada } from "../../pecas";

export const metadata: Metadata = { title: "Delivery · Histórico" };

export default async function DeliveryHistoricoPage(props: PageProps<"/painel/historico/pedido/[id]">) {
  const acesso = await exigirAlgumaPermissao("caixa_operar", "relatorios");
  const { id } = await props.params;
  if (!z.guid().safeParse(id).success) notFound();
  const p = await carregarDelivery(acesso.restaurante.id, id);
  if (!p || (p.status !== "entregue" && p.status !== "cancelado")) notFound();
  const fuso = acesso.restaurante.fusoHorario;
  const pago = p.pagamentos.filter((x) => !x.estorno).reduce((s, x) => s + x.valor, 0);
  const etapas = [
    { rotulo: "Pedido feito", em: p.criadoEm },
    p.aceitoEm ? { rotulo: "Aceito", em: p.aceitoEm } : null,
    p.finalizadoEm ? { rotulo: p.status === "cancelado" ? "Cancelado" : "Entregue", em: p.finalizadoEm } : null,
  ].filter((e) => e !== null);

  return (
    <main className="flex flex-col gap-4 p-4 md:p-6">
      <Cabecalho
        titulo={`Delivery nº ${p.numero}`}
        selo={
          <SeloEncerrada
            texto={`${p.status === "cancelado" ? "Cancelado" : "Entregue"}${p.finalizadoEm ? ` em ${dataHoraLocal(p.finalizadoEm, fuso)}` : ""} · não pode ser alterado`}
          />
        }
      >
        <p className="text-sm text-muted-foreground">{acesso.restaurante.nome}</p>
      </Cabecalho>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-4">
          {p.cancelamento ? (
            <p className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              Cancelado em {dataHoraLocal(p.cancelamento.em, fuso)}
              {p.cancelamento.por ? ` por ${p.cancelamento.por}` : ""}
              {p.cancelamento.motivo ? `: ${p.cancelamento.motivo}` : ""}
            </p>
          ) : null}
          <Bloco titulo="Itens">
            <ListaItens itens={p.itens} />
            {p.observacao ? <p className="text-sm text-muted-foreground">Observação do pedido: {p.observacao}</p> : null}
          </Bloco>
          <Bloco titulo="Cliente e entrega">
            <p className="text-sm">
              {p.cliente}
              {p.telefone ? ` · ${formatarTelefone(p.telefone)}` : ""}
            </p>
            <p className="text-sm text-muted-foreground">{p.endereco || "Sem endereço"}</p>
            {p.entregador ? <p className="text-sm text-muted-foreground">Entregador: {p.entregador}</p> : null}
          </Bloco>
          <Bloco titulo="Linha do tempo">
            <ul className="flex flex-col gap-1 text-sm">
              {etapas.map((e) => (
                <li key={e.rotulo} className="flex justify-between gap-3">
                  <span>{e.rotulo}</span>
                  <span className="text-muted-foreground tabular-nums">{dataHoraLocal(e.em, fuso)}</span>
                </li>
              ))}
            </ul>
          </Bloco>
          {p.alteracoes.length ? (
            <Bloco titulo="Alterações feitas antes de terminar">
              <ul className="flex flex-col gap-1 text-sm">
                {p.alteracoes.map((a, i) => (
                  <li key={i}>
                    <span className="text-muted-foreground">
                      {dataHoraLocal(a.em, fuso)}
                      {a.por ? ` · ${a.por}` : ""}:{" "}
                    </span>
                    {a.descricao}
                  </li>
                ))}
              </ul>
            </Bloco>
          ) : null}
        </div>
        <div className="flex flex-col gap-4">
          <Bloco titulo="Conta">
            <Linha rotulo="Itens" valor={formatarBRL(p.subtotal)} />
            <Linha rotulo="Taxa de entrega" valor={formatarBRL(p.taxaEntrega)} />
            {p.desconto ? <Linha rotulo={`Desconto${p.cupom ? ` (${p.cupom})` : ""}`} valor={`−${formatarBRL(p.desconto)}`} /> : null}
            <Linha rotulo="Total" valor={formatarBRL(p.total)} forte />
            <Linha rotulo="Pago" valor={formatarBRL(pago)} />
            {p.formaPrevista ? (
              <Linha rotulo="Pagamento previsto" valor={`${nomeForma(p.formaPrevista)}${p.trocoPara ? ` · troco para ${formatarBRL(p.trocoPara)}` : ""}`} />
            ) : null}
          </Bloco>
          <Bloco titulo="Pagamentos">
            <ListaPagamentos pagamentos={p.pagamentos} fuso={fuso} />
          </Bloco>
        </div>
      </div>
    </main>
  );
}
