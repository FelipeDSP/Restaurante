import { Receipt, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";

import { CORES, Kpi, Linha, Painel, Rosca } from "@/components/staff/graficos";
import { formatarBRL } from "@/lib/dinheiro";

import type { Noites } from "./noites";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// O Início olha para a conta, não para a noite em curso: as últimas noites fechadas, o que mais
// saiu nelas e a média. O movimento de hoje, minuto a minuto, é a tela do Caixa.
//
// "Noite" é a sessão de caixa, não o dia do calendário — o restaurante pode fechar depois da
// meia-noite. Por isso nada aqui fala em "semana" com data: fala em noites.
export function Semana({ noites }: { noites: Noites }) {
  if (noites.lista.length === 0) return null;
  // O centro da rosca conta só os itens do top 5 que ela desenha: somar o cardápio inteiro ali
  // daria um número que as fatias não explicam.
  const itens = noites.maisVendidos.reduce((soma, i) => soma + i.quantidade, 0);

  return (
    <>
      <section aria-label="Últimas noites" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="font-semibold">{noites.lista.length === 1 ? "Última noite" : `Últimas ${noites.lista.length} noites`}</h2>
          <Link href="/painel/relatorios" className="text-sm font-medium underline underline-offset-4">
            Relatórios
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Kpi
            rotulo="Vendido"
            valor={formatarBRL(noites.vendido)}
            icone={Wallet}
            destaque
            delta={null}
            detalhe={`${formatarBRL(noites.media)} por noite`}
          />
          <Kpi rotulo="Contas" valor={String(noites.contas)} icone={Receipt} delta={null} />
          <Kpi rotulo="Ticket médio" valor={formatarBRL(noites.ticketMedio)} icone={TrendingUp} delta={null} />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Painel titulo="Vendido por noite">
          <Linha
            pontos={noites.lista.map((n) => ({
              chave: n.id,
              rotulo: n.dia,
              valor: n.vendido,
              texto: `${formatarBRL(n.vendido)} · ${plural(n.contas, "conta", "contas")}`,
              href: `/painel/caixa/${n.id}`,
            }))}
            media={noites.media ? { valor: noites.media, texto: `média ${formatarBRL(noites.media)}` } : undefined}
          />
        </Painel>
        <Painel titulo="Mais vendidos">
          <Rosca
            centro={String(itens)}
            rotuloCentro={itens === 1 ? "item" : "itens"}
            fatias={noites.maisVendidos.map((i, n) => ({
              chave: i.nome,
              rotulo: i.nome,
              valor: i.quantidade,
              texto: formatarBRL(i.total),
              cor: CORES[n % CORES.length],
            }))}
          />
        </Painel>
      </div>
    </>
  );
}
