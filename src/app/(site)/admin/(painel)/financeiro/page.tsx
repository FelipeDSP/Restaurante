import type { Metadata } from "next";
import { AlertTriangle, Banknote, CalendarCheck, Users } from "lucide-react";
import Link from "next/link";

import { formatarBRL } from "@/lib/dinheiro";
import { planoPorId } from "@/lib/planos";

import { carregarFinanceiro, dataBR, NOME_STATUS } from "../../dados";
import { Cartao, Indicador, receitaMensal, Titulo, Vazio } from "../ui";

export const metadata: Metadata = { title: { absolute: "Financeiro · Admin · uau foods" } };

export default async function FinanceiroPage() {
  const f = await carregarFinanceiro();
  const receita = receitaMensal(f.por_plano);
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const doMes = f.pagamentos.filter((p) => new Date(p.em) >= inicioMes);
  const recebidoMes = doMes.reduce((s, p) => s + p.valor, 0);
  const emAtraso = f.inadimplentes.filter((x) => x.status === "atrasada");
  const valorAtraso = emAtraso.reduce((s, x) => s + (planoPorId(x.plano)?.precoMensal ?? 0), 0);
  const maiorPlano = Math.max(1, ...receita.linhas.map((l) => l.valor));

  return (
    <>
      <Titulo titulo="Financeiro" subtitulo="Assinaturas dos restaurantes e pagamentos recebidos pelo Asaas." />

      <section aria-label="Resumo" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador icone={Banknote} tom="laranja" rotulo="Receita mensal" valor={formatarBRL(receita.total)} detalhe="Assinaturas em dia e atrasadas" />
        <Indicador
          icone={CalendarCheck}
          tom="verde"
          rotulo="Recebido no mês"
          valor={formatarBRL(recebidoMes)}
          detalhe={`${doMes.length} ${doMes.length === 1 ? "pagamento" : "pagamentos"}`}
        />
        <Indicador icone={Users} rotulo="Assinantes" valor={String(receita.assinantes)} detalhe="Pagantes, sem contar teste e cortesia" />
        <Indicador
          icone={AlertTriangle}
          tom={emAtraso.length ? "vermelho" : "neutro"}
          rotulo="Em atraso"
          valor={formatarBRL(valorAtraso)}
          detalhe={`${emAtraso.length} ${emAtraso.length === 1 ? "restaurante" : "restaurantes"}`}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Cartao titulo="Receita por plano">
          <ul className="flex flex-col gap-4">
            {receita.linhas.map((l) => (
              <li key={l.plano.id} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-bold">{l.plano.nome}</span>
                  <span className="tabular-nums">
                    <span className="font-black">{formatarBRL(l.valor)}</span>
                    <span className="text-uau-marrom-claro">
                      {" "}
                      · {l.ativas + l.atrasadas} × {formatarBRL(l.plano.precoMensal)}
                    </span>
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-uau-marrom/5">
                  <div className="h-full rounded-full bg-uau-laranja" style={{ width: `${(l.valor / maiorPlano) * 100}%` }} />
                </div>
                {l.atrasadas ? <span className="text-xs font-bold text-red-700">{l.atrasadas} com pagamento atrasado</span> : null}
              </li>
            ))}
          </ul>
        </Cartao>

        <Cartao titulo="Atrasados e cancelados">
          {f.inadimplentes.length === 0 ? (
            <Vazio>Ninguém com pagamento pendente.</Vazio>
          ) : (
            <ul className="flex flex-col divide-y divide-black/5 text-sm">
              {f.inadimplentes.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/admin/restaurantes/${x.id}`} className="min-w-0 hover:underline">
                    <span className="block truncate font-bold">{x.nome}</span>
                    <span className="text-xs text-uau-marrom-claro">
                      {NOME_STATUS[x.status]} · {planoPorId(x.plano)?.nome ?? x.plano} · venceu {dataBR(x.periodo_termina_em)}
                    </span>
                  </Link>
                  {x.fatura_url ? (
                    <a
                      href={x.fatura_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-lg border border-black/10 px-3 py-1.5 text-xs font-bold hover:bg-uau-marrom/5"
                    >
                      Fatura
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      <Cartao titulo="Pagamentos recebidos (últimos 120 dias)">
        {f.pagamentos.length === 0 ? (
          <Vazio>Nenhum pagamento recebido ainda.</Vazio>
        ) : (
          <ul className="flex flex-col divide-y divide-black/5 text-sm">
            {f.pagamentos.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2.5">
                {p.restaurante_id ? (
                  <Link href={`/admin/restaurantes/${p.restaurante_id}`} className="truncate font-bold hover:underline">
                    {p.nome}
                  </Link>
                ) : (
                  <span className="truncate text-uau-marrom-claro">Assinatura não encontrada</span>
                )}
                <span className="shrink-0 text-right">
                  <span className="block font-black tabular-nums">{formatarBRL(p.valor)}</span>
                  <span className="text-xs text-uau-marrom-claro">{dataBR(p.em)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </>
  );
}
