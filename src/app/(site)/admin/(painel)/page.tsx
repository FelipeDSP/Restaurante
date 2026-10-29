import type { Metadata } from "next";
import { AlertTriangle, Banknote, ChevronRight, Clock, Receipt, Store, TrendingUp, Users } from "lucide-react";
import Link from "next/link";

import { formatarBRL } from "@/lib/dinheiro";
import { planoPorId } from "@/lib/planos";

import { carregarFinanceiro, carregarPainel, dataBR, diasRestantes, type RestauranteResumo } from "../dados";
import { SeloAssinatura } from "../selo-assinatura";
import { Cartao, Indicador, receitaMensal, Titulo, Vazio } from "./ui";

export const metadata: Metadata = { title: { absolute: "Visão geral · Admin · uau foods" } };

const DIA_MS = 86_400_000;

function cadastradoHaMaisDeUmaSemana(r: RestauranteResumo) {
  return Date.now() - new Date(r.criado_em).getTime() > 7 * DIA_MS;
}

function diasSemCaixa(r: RestauranteResumo) {
  return r.ultimo_caixa ? Math.floor((Date.now() - new Date(r.ultimo_caixa).getTime()) / DIA_MS) : null;
}

function Linha({ r, detalhe, alerta }: { r: { id: string; nome: string }; detalhe: string; alerta?: boolean }) {
  return (
    <li>
      <Link href={`/admin/restaurantes/${r.id}`} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-uau-marrom/5">
        <span className="min-w-0">
          <span className="block truncate font-bold">{r.nome}</span>
          <span className={alerta ? "text-xs font-bold text-red-700" : "text-xs text-uau-marrom-claro"}>{detalhe}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-uau-marrom-claro" aria-hidden />
      </Link>
    </li>
  );
}

export default async function VisaoGeralPage() {
  const [{ totais: t, restaurantes }, financeiro] = await Promise.all([carregarPainel(), carregarFinanceiro()]);
  const receita = receitaMensal(financeiro.por_plano);
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const recebidoMes = financeiro.pagamentos.filter((p) => new Date(p.em) >= inicioMes).reduce((s, p) => s + p.valor, 0);

  const testesVencendo = restaurantes
    .filter((r) => r.assinatura_status === "teste")
    .map((r) => ({ r, dias: diasRestantes(r.teste_termina_em) ?? 0 }))
    .filter((x) => x.dias > 0 && x.dias <= 3)
    .sort((a, b) => a.dias - b.dias);
  const testesVencidos = restaurantes.filter((r) => r.assinatura_status === "teste" && (diasRestantes(r.teste_termina_em) ?? 0) <= 0);
  // Parados: com o site no ar, cadastrados há mais de uma semana e sem abrir o caixa há 7 dias ou mais.
  const parados = restaurantes
    .filter((r) => r.ativo && cadastradoHaMaisDeUmaSemana(r))
    .map((r) => ({ r, dias: diasSemCaixa(r) }))
    .filter((x) => x.dias === null || x.dias >= 7)
    .sort((a, b) => (b.dias ?? 9999) - (a.dias ?? 9999));
  const novos = [...restaurantes].sort((a, b) => b.criado_em.localeCompare(a.criado_em)).slice(0, 6);
  const atencao = testesVencendo.length + testesVencidos.length + financeiro.inadimplentes.length + parados.length;

  return (
    <>
      <Titulo titulo="Visão geral" subtitulo="Como a plataforma está hoje. Uso dos restaurantes nos últimos 30 dias." />

      <section aria-label="Negócio" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          icone={Banknote}
          tom="laranja"
          rotulo="Receita mensal"
          valor={formatarBRL(receita.total)}
          detalhe={`${receita.assinantes} ${receita.assinantes === 1 ? "assinatura" : "assinaturas"} pagas`}
        />
        <Indicador icone={Receipt} tom="verde" rotulo="Recebido no mês" valor={formatarBRL(recebidoMes)} detalhe="Pagamentos confirmados no Asaas" />
        <Indicador
          icone={Clock}
          tom="azul"
          rotulo="Em teste"
          valor={String(t.em_teste)}
          detalhe={`${t.teste_vencendo} vencendo em 3 dias · ${t.teste_vencido} vencidos`}
        />
        <Indicador
          icone={AlertTriangle}
          tom={t.atrasados > 0 ? "vermelho" : "neutro"}
          rotulo="Atrasados"
          valor={String(t.atrasados)}
          detalhe={`${t.cortesia} em cortesia`}
        />
      </section>

      <section aria-label="Uso" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador icone={Store} rotulo="Restaurantes" valor={String(t.restaurantes)} detalhe={`${t.ativos} no ar · ${t.cadastros_30d} novos em 30 dias`} />
        <Indicador icone={Users} rotulo="Usando" valor={String(t.usaram_7d)} detalhe="Abriram o caixa nos últimos 7 dias" />
        <Indicador icone={Receipt} rotulo="Pedidos" valor={t.pedidos_30d.toLocaleString("pt-BR")} detalhe="Todos os restaurantes, 30 dias" />
        <Indicador icone={TrendingUp} rotulo="Vendido pelos restaurantes" valor={formatarBRL(t.vendido_30d)} detalhe="Soma dos pedidos, 30 dias" />
      </section>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Cartao titulo={`Precisa de atenção${atencao ? ` (${atencao})` : ""}`}>
          {atencao === 0 ? (
            <Vazio>Nada pendente.</Vazio>
          ) : (
            <div className="flex flex-col gap-5">
              {financeiro.inadimplentes.length > 0 ? (
                <div>
                  <p className="mb-1 px-3 text-xs font-black text-red-700 uppercase">Pagamento atrasado ou cancelado</p>
                  <ul>
                    {financeiro.inadimplentes.map((r) => (
                      <Linha key={r.id} r={r} alerta detalhe={`${planoPorId(r.plano)?.nome ?? r.plano} · venceu ${dataBR(r.periodo_termina_em)}`} />
                    ))}
                  </ul>
                </div>
              ) : null}
              {testesVencendo.length > 0 ? (
                <div>
                  <p className="mb-1 px-3 text-xs font-black text-uau-laranja-escuro uppercase">Teste acabando</p>
                  <ul>
                    {testesVencendo.map(({ r, dias }) => (
                      <Linha key={r.id} r={r} detalhe={dias === 1 ? "termina amanhã" : `faltam ${dias} dias`} />
                    ))}
                  </ul>
                </div>
              ) : null}
              {testesVencidos.length > 0 ? (
                <div>
                  <p className="mb-1 px-3 text-xs font-black text-uau-marrom-claro uppercase">Teste terminou sem assinar</p>
                  <ul>
                    {testesVencidos.map((r) => (
                      <Linha key={r.id} r={r} detalhe={`terminou ${dataBR(r.teste_termina_em)}`} />
                    ))}
                  </ul>
                </div>
              ) : null}
              {parados.length > 0 ? (
                <div>
                  <p className="mb-1 px-3 text-xs font-black text-uau-marrom-claro uppercase">Parados (risco de desistir)</p>
                  <ul>
                    {parados.map(({ r, dias }) => (
                      <Linha key={r.id} r={r} alerta={dias === null} detalhe={dias === null ? "nunca abriu o caixa" : `sem caixa há ${dias} dias`} />
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </Cartao>

        <Cartao
          titulo="Últimos cadastros"
          acao={
            <Link href="/admin/restaurantes" className="text-sm font-bold text-uau-laranja-escuro hover:underline">
              Ver todos
            </Link>
          }
        >
          <ul className="flex flex-col">
            {novos.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/restaurantes/${r.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-uau-marrom/5"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{r.nome}</span>
                    <span className="text-xs text-uau-marrom-claro">{dataBR(r.criado_em)}</span>
                  </span>
                  <SeloAssinatura status={r.assinatura_status} testeTerminaEm={r.teste_termina_em} />
                </Link>
              </li>
            ))}
          </ul>
        </Cartao>
      </div>
    </>
  );
}
