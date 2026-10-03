import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarBRL } from "@/lib/dinheiro";
import { nomeForma, nomeOrigem } from "@/lib/rotulos";
import { horaLocal } from "@/lib/tempo";
import { cn } from "@/lib/utils";

import { dinheiroEsperado, type ResumoCaixa } from "./dados";

function Indicador({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-4", destaque && "border-[var(--cor-primaria)]")}>
      <p className="text-sm text-muted-foreground">{rotulo}</p>
      <p className="text-2xl font-bold tabular-nums">{valor}</p>
    </div>
  );
}

function Tabela({
  titulo,
  linhas,
  vazio,
}: {
  titulo: string;
  linhas: { chave: string; rotulo: string; detalhe?: string; valor: string }[];
  vazio: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        {linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">{vazio}</p>
        ) : (
          <ul className="divide-y">
            {linhas.map((l) => (
              <li key={l.chave} className="flex items-baseline justify-between gap-3 py-2">
                <span className="flex flex-col">
                  <span>{l.rotulo}</span>
                  {l.detalhe ? <span className="text-xs text-muted-foreground">{l.detalhe}</span> : null}
                </span>
                <span className="font-medium tabular-nums">{l.valor}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function vezes(n: number) {
  return `${n} ${n === 1 ? "pagamento" : "pagamentos"}`;
}

export function ResumoSessao({ resumo, fusoHorario }: { resumo: ResumoCaixa; fusoHorario: string }) {
  const esperado = dinheiroEsperado(resumo);
  const contado = resumo.sessao.valor_contado;
  const diferenca = contado === null ? null : contado - esperado;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Total vendido" valor={formatarBRL(resumo.total_vendido)} destaque />
        <Indicador rotulo="Total recebido" valor={formatarBRL(resumo.total_recebido)} destaque />
        <Indicador rotulo="Itens vendidos" valor={String(resumo.quantidade_itens)} />
        <Indicador rotulo="Comandas fechadas" valor={String(resumo.comandas.fechadas)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gaveta (dinheiro)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Troco inicial</span>
            <span className="tabular-nums">{formatarBRL(resumo.sessao.valor_inicial)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Recebido em dinheiro</span>
            <span className="tabular-nums">{formatarBRL(resumo.dinheiro_recebido)}</span>
          </div>
          <div className="flex justify-between gap-2 font-semibold">
            <span>Esperado na gaveta</span>
            <span className="tabular-nums">{formatarBRL(esperado)}</span>
          </div>
          {contado !== null ? (
            <>
              <div className="flex justify-between gap-2 font-semibold">
                <span>Contado</span>
                <span className="tabular-nums">{formatarBRL(contado)}</span>
              </div>
              <div
                className={cn(
                  "flex justify-between gap-2 font-semibold sm:col-span-2",
                  diferenca === 0 ? "text-green-700" : "text-destructive",
                )}
              >
                <span>{diferenca === 0 ? "Bateu" : diferenca! > 0 ? "Sobrando" : "Faltando"}</span>
                <span className="tabular-nums">{formatarBRL(Math.abs(diferenca!))}</span>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Tabela
          titulo="Por forma de pagamento"
          vazio="Nenhum pagamento."
          linhas={resumo.por_forma.map((f) => ({
            chave: f.forma,
            rotulo: nomeForma(f.forma),
            detalhe: vezes(f.quantidade),
            valor: formatarBRL(f.valor),
          }))}
        />
        <Tabela
          titulo="Por origem"
          vazio="Nenhum pagamento."
          linhas={resumo.por_origem.map((o) => ({
            chave: o.origem,
            rotulo: nomeOrigem(o.origem),
            detalhe: vezes(o.quantidade),
            valor: formatarBRL(o.valor),
          }))}
        />
        <Tabela
          titulo="Quem recebeu"
          vazio="Nenhum pagamento."
          linhas={resumo.por_membro.map((m) => ({
            chave: m.nome,
            rotulo: m.nome,
            detalhe: vezes(m.quantidade),
            valor: formatarBRL(m.valor),
          }))}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tabela
          titulo="Itens mais vendidos"
          vazio="Nenhum item vendido."
          linhas={resumo.itens_mais_vendidos.map((i) => ({
            chave: i.nome,
            rotulo: `${i.quantidade}× ${i.nome}`,
            valor: formatarBRL(i.total),
          }))}
        />
        <Tabela
          titulo="Cancelamentos"
          vazio="Nenhum cancelamento."
          linhas={[
            ...resumo.itens_cancelados.map((i, n) => ({
              chave: `item-${n}`,
              rotulo: `${i.quantidade}× ${i.nome}`,
              detalhe: `${horaLocal(i.em, fusoHorario)} · ${i.por ?? "—"} · ${i.motivo ?? ""}`,
              valor: formatarBRL(i.total),
            })),
            ...resumo.pedidos_cancelados.map((p, n) => ({
              chave: `pedido-${n}`,
              rotulo: `Pedido nº ${p.numero} (${nomeOrigem(p.origem)})`,
              detalhe: `${horaLocal(p.em, fusoHorario)} · ${p.por ?? "—"} · ${p.motivo ?? ""}`,
              valor: formatarBRL(p.total),
            })),
          ]}
        />
      </div>

      {resumo.estornos.length > 0 ? (
        <Tabela
          titulo="Estornos"
          vazio=""
          linhas={resumo.estornos.map((e, n) => ({
            chave: `estorno-${n}`,
            rotulo: nomeForma(e.forma),
            detalhe: `${horaLocal(e.em, fusoHorario)} · estornado por ${e.por ?? "—"} · recebido por ${e.registrado_por ?? "—"}`,
            valor: formatarBRL(e.valor),
          }))}
        />
      ) : null}
    </div>
  );
}
