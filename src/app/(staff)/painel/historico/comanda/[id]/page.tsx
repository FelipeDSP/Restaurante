import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { exigirAlgumaPermissao } from "@/lib/auth/dal";
import { formatarBRL } from "@/lib/dinheiro";
import { dataHoraLocal, horaLocal } from "@/lib/tempo";

import { carregarComanda } from "../../dados";
import { Bloco, Cabecalho, Linha, ListaItens, ListaPagamentos, SeloEncerrada } from "../../pecas";

export const metadata: Metadata = { title: "Comanda · Histórico" };

export default async function ComandaHistoricoPage(props: PageProps<"/painel/historico/comanda/[id]">) {
  const acesso = await exigirAlgumaPermissao("caixa_operar", "relatorios");
  const { id } = await props.params;
  if (!z.guid().safeParse(id).success) notFound();
  const c = await carregarComanda(acesso.restaurante.id, id);
  if (!c || (c.status !== "fechada" && c.status !== "cancelada")) notFound();
  const fuso = acesso.restaurante.fusoHorario;
  const pago = c.pagamentos.filter((p) => !p.estorno).reduce((s, p) => s + p.valor, 0);

  return (
    <main className="flex flex-col gap-4 p-4 md:p-6">
      <Cabecalho
        titulo={`Mesa ${c.mesa}`}
        selo={
          <SeloEncerrada
            texto={`${c.status === "cancelada" ? "Cancelada" : "Fechada"}${c.fechadaEm ? ` em ${dataHoraLocal(c.fechadaEm, fuso)}` : ""}${c.fechadaPor ? ` por ${c.fechadaPor}` : ""} · não pode ser alterada`}
          />
        }
      >
        <p className="text-sm text-muted-foreground">
          {acesso.restaurante.nome} · aberta em {dataHoraLocal(c.abertaEm, fuso)} · {c.pessoas} {c.pessoas === 1 ? "pessoa" : "pessoas"}
          {c.garcom ? ` · garçom ${c.garcom}` : ""}
        </p>
      </Cabecalho>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-4">
          {c.lancamentos.map((l) => (
            <Bloco key={l.id} titulo={`Pedido nº ${l.numero} · ${horaLocal(l.em, fuso)} · ${l.por}`}>
              {l.cancelado ? (
                <p className="text-sm text-destructive">Pedido cancelado{l.cancelado.motivo ? `: ${l.cancelado.motivo}` : ""}</p>
              ) : null}
              <ListaItens itens={l.itens} />
            </Bloco>
          ))}
          {c.lancamentos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum item lançado.</p> : null}
        </div>
        <div className="flex flex-col gap-4">
          <Bloco titulo="Conta">
            <Linha rotulo="Itens" valor={formatarBRL(c.subtotal)} />
            {c.servico ? <Linha rotulo="Taxa de serviço" valor={formatarBRL(c.servico)} /> : null}
            {c.couvert ? <Linha rotulo="Couvert" valor={formatarBRL(c.couvert)} /> : null}
            <Linha rotulo="Total" valor={formatarBRL(c.total)} forte />
            <Linha rotulo="Pago" valor={formatarBRL(pago)} />
          </Bloco>
          <Bloco titulo="Pagamentos">
            <ListaPagamentos pagamentos={c.pagamentos} fuso={fuso} />
          </Bloco>
        </div>
      </div>
    </main>
  );
}
