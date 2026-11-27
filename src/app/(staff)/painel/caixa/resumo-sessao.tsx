import { Banknote, ChevronDown, Coins, Wallet } from "lucide-react";

import { Kpi, Painel } from "@/components/staff/graficos";
import { formatarBRL } from "@/lib/dinheiro";
import { nomeForma, nomeOrigem } from "@/lib/rotulos";
import { horaLocal } from "@/lib/tempo";
import { cn } from "@/lib/utils";
import { dinheiroEsperado, type PendenciasFechamento, type ResumoCaixa } from "@/modulos/caixa/dados";

function Lista({ titulo, linhas, vazio }: { titulo?: string; linhas: { chave: string; rotulo: string; detalhe?: string; valor: string }[]; vazio: string }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      {titulo ? <h3 className="text-sm font-medium text-muted-foreground">{titulo}</h3> : null}
      {linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <ul className="divide-y text-sm">
          {linhas.map((l) => (
            <li key={l.chave} className="flex items-baseline justify-between gap-3 py-2">
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{l.rotulo}</span>
                {l.detalhe ? <span className="text-xs text-muted-foreground">{l.detalhe}</span> : null}
              </span>
              <span className="shrink-0 font-medium tabular-nums">{l.valor}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Conta({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-2 text-sm", forte && "border-t pt-2 text-base font-semibold")}>
      <span className={forte ? undefined : "text-muted-foreground"}>{rotulo}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  );
}

const vezes = (n: number) => `${n} ${n === 1 ? "pagamento" : "pagamentos"}`;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// O resumo da sessão, nas duas telas que o usam: o Caixa aberto (operação) e a noite já fechada
// (conferência e impressão).
//
// Aqui não entra gráfico. Esta é a tela de quem está atrás do balcão com gente na fila: três
// números grandes, a conta da gaveta linha a linha e quanto entrou em cada forma de pagamento. O
// resto — origem, quem recebeu, mais vendidos, entregadores, cancelamentos, movimentos e
// estornos — fica recolhido: são sete listas que ninguém lê no meio do serviço e que, empilhadas,
// enterravam o botão de fechar.
export function ResumoSessao({
  resumo,
  fusoHorario,
  pendencias,
}: {
  resumo: ResumoCaixa;
  fusoHorario: string;
  // O que ainda está em aberto, para explicar a diferença entre vendido e recebido.
  pendencias?: PendenciasFechamento;
}) {
  const esperado = dinheiroEsperado(resumo);
  const contado = resumo.sessao.valor_contado;
  const diferenca = contado === null ? null : contado - esperado;
  const encerrada = Boolean(resumo.sessao.fechada_em);

  // "Vendido" conta o consumo das mesas que ainda estão abertas; "recebido" só o que foi pago.
  // Para um dono leigo os dois lado a lado parecem dinheiro sumido, então a diferença é dita.
  const aReceber = resumo.total_vendido + resumo.servico + resumo.couvert - resumo.total_recebido;
  const ondeEsta = [
    pendencias?.comandas.length ? plural(pendencias.comandas.length, "mesa aberta", "mesas abertas") : "",
    pendencias?.deliveries.length ? plural(pendencias.deliveries.length, "delivery em andamento", "deliveries em andamento") : "",
  ]
    .filter(Boolean)
    .join(" e ");

  const cancelamentos = [
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
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi
          rotulo="Recebido"
          valor={formatarBRL(resumo.total_recebido)}
          icone={Banknote}
          destaque
          delta={null}
          detalhe={aReceber > 0 ? `${formatarBRL(aReceber)} ainda a receber` : undefined}
        />
        <Kpi rotulo="Vendido" valor={formatarBRL(resumo.total_vendido)} icone={Wallet} delta={null} />
        <Kpi
          rotulo={contado === null ? "Na gaveta agora" : "Contado na gaveta"}
          valor={formatarBRL(contado ?? esperado)}
          icone={Coins}
          delta={null}
          detalhe={
            diferenca === null
              ? "só o dinheiro"
              : diferenca === 0
                ? "bateu certinho"
                : `${diferenca > 0 ? "sobrando" : "faltando"} ${formatarBRL(Math.abs(diferenca))}`
          }
        />
      </div>

      {aReceber > 0 && ondeEsta ? (
        <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <strong className="tabular-nums">Falta receber {formatarBRL(aReceber)}</strong> — está em {ondeEsta}.
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* A conta que a pessoa refaz na mão ao contar a gaveta, na mesma ordem. */}
        <Painel titulo="Dinheiro na gaveta">
          <div className="flex flex-col gap-2">
            <Conta rotulo="Troco inicial" valor={formatarBRL(resumo.sessao.valor_inicial)} />
            <Conta rotulo="Recebido em dinheiro" valor={formatarBRL(resumo.dinheiro_recebido)} />
            {resumo.suprimentos ? <Conta rotulo="Suprimentos" valor={`+ ${formatarBRL(resumo.suprimentos)}`} /> : null}
            {resumo.sangrias ? <Conta rotulo="Sangrias" valor={`− ${formatarBRL(resumo.sangrias)}`} /> : null}
            <Conta rotulo="Deve ter na gaveta" valor={formatarBRL(esperado)} forte />
            {contado !== null ? (
              <>
                <Conta rotulo="Contado" valor={formatarBRL(contado)} forte />
                <div className={cn("flex justify-between gap-2 font-semibold", diferenca === 0 ? "text-green-700" : "text-destructive")}>
                  <span>{diferenca === 0 ? "Bateu" : diferenca! > 0 ? "Sobrando" : "Faltando"}</span>
                  <span className="tabular-nums">{formatarBRL(Math.abs(diferenca!))}</span>
                </div>
              </>
            ) : null}
          </div>
        </Painel>

        <Painel titulo="Como pagaram">
          <Lista
            vazio="Nenhum pagamento ainda."
            linhas={resumo.por_forma.map((f) => ({
              chave: f.forma,
              rotulo: nomeForma(f.forma),
              detalhe: vezes(f.quantidade),
              valor: formatarBRL(f.valor),
            }))}
          />
        </Painel>
      </div>

      {/* Conferência: aberto na noite já fechada (é o documento que se imprime), recolhido no
          caixa em operação. `group` + `open:` dá o acordeão sem uma linha de JavaScript. */}
      <details open={encerrada} className="group rounded-2xl border bg-background shadow-sm">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 p-4 font-semibold md:p-5 [&::-webkit-details-marker]:hidden">
          Detalhes da noite
          <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="grid gap-5 border-t p-4 md:grid-cols-2 md:p-5 lg:grid-cols-3">
          <Lista
            titulo="Mesas e delivery"
            vazio="Nenhum pagamento."
            linhas={resumo.por_origem.map((o) => ({
              chave: o.origem,
              rotulo: nomeOrigem(o.origem),
              detalhe: vezes(o.quantidade),
              valor: formatarBRL(o.valor),
            }))}
          />
          <Lista
            titulo="Quem recebeu"
            vazio="Nenhum pagamento."
            linhas={resumo.por_membro.map((m) => ({ chave: m.nome, rotulo: m.nome, detalhe: vezes(m.quantidade), valor: formatarBRL(m.valor) }))}
          />
          <Lista
            titulo="Itens mais vendidos"
            vazio="Nenhum item vendido."
            linhas={resumo.itens_mais_vendidos.map((i) => ({ chave: i.nome, rotulo: `${i.quantidade}× ${i.nome}`, valor: formatarBRL(i.total) }))}
          />
          {resumo.entregadores.length > 0 ? (
            <Lista
              titulo="Entregadores (a pagar)"
              vazio=""
              linhas={resumo.entregadores.map((e) => ({
                chave: e.nome,
                rotulo: e.nome,
                detalhe: plural(e.entregas, "entrega", "entregas"),
                valor: formatarBRL(e.valor),
              }))}
            />
          ) : null}
          <Lista titulo="Cancelamentos" vazio="Nenhum cancelamento." linhas={cancelamentos} />
          {resumo.movimentos?.length ? (
            <Lista
              titulo="Sangrias e suprimentos"
              vazio=""
              linhas={resumo.movimentos.map((m, n) => ({
                chave: `movimento-${n}`,
                rotulo: m.tipo === "sangria" ? "Sangria" : "Suprimento",
                detalhe: `${horaLocal(m.em, fusoHorario)} · ${m.por ?? "—"} · ${m.motivo}`,
                valor: `${m.tipo === "sangria" ? "−" : "+"} ${formatarBRL(m.valor)}`,
              }))}
            />
          ) : null}
          {resumo.estornos.length > 0 ? (
            <Lista
              titulo="Estornos"
              vazio=""
              linhas={resumo.estornos.map((e, n) => ({
                chave: `estorno-${n}`,
                rotulo: nomeForma(e.forma),
                detalhe: `${horaLocal(e.em, fusoHorario)} · estornado por ${e.por ?? "—"} · recebido por ${e.registrado_por ?? "—"}${e.motivo ? ` · ${e.motivo}` : ""}`,
                valor: formatarBRL(e.valor),
              }))}
            />
          ) : null}
        </div>
      </details>
    </div>
  );
}
