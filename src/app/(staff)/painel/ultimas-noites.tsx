import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarBRL } from "@/lib/dinheiro";
import { diaLocal } from "@/lib/tempo";

import { carregarResumo, listarSessoesFechadas } from "./caixa/dados";

const NOITES = 7;

// Comparação das últimas sessões de caixa (o resumo completo de cada uma fica em Caixa).
export async function UltimasNoites({ restauranteId, fuso }: { restauranteId: string; fuso: string }) {
  const sessoes = await listarSessoesFechadas(restauranteId, NOITES);
  if (sessoes.length === 0) return null;
  const resumos = await Promise.all(sessoes.map((s) => carregarResumo(restauranteId, s.id)));

  const noites = sessoes.flatMap((s, n) => {
    const r = resumos[n];
    if (!r) return [];
    // Contas = comandas fechadas + pedidos de delivery/balcão (pedidos de mesa são vários por comanda).
    const contas =
      r.comandas.fechadas + r.pedidos_por_origem.filter((p) => p.origem !== "mesa").reduce((soma, p) => soma + p.quantidade, 0);
    return [{ id: s.id, dia: diaLocal(s.abertaEm, fuso), vendido: r.total_vendido, contas, ticket: contas ? Math.round(r.total_vendido / contas) : 0 }];
  });

  const maisVendidos = new Map<string, number>();
  for (const r of resumos) for (const i of r?.itens_mais_vendidos ?? []) maisVendidos.set(i.nome, (maisVendidos.get(i.nome) ?? 0) + i.quantidade);
  const top = [...maisVendidos].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maior = Math.max(...noites.map((n) => n.vendido), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Últimas noites</CardTitle>
        <CardDescription>
          Por sessão de caixa fechada. Toque numa noite para ver o resumo completo ou veja{" "}
          <Link href="/painel/relatorios" className="font-medium text-foreground underline underline-offset-4">
            os relatórios
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-2 font-medium">Noite</th>
              <th className="pb-2 font-medium">Vendido</th>
              <th className="pb-2 text-right font-medium">Contas</th>
              <th className="pb-2 text-right font-medium">Ticket médio</th>
            </tr>
          </thead>
          <tbody>
            {noites.map((n) => (
              <tr key={n.id} className="border-t">
                <td className="py-2">
                  <Link href={`/painel/caixa/${n.id}`} className="font-medium underline-offset-4 hover:underline">
                    {n.dia}
                  </Link>
                </td>
                <td className="py-2">
                  <span className="flex items-center gap-2">
                    <span className="w-20 shrink-0 tabular-nums">{formatarBRL(n.vendido)}</span>
                    <span className="hidden h-2 rounded-full bg-[var(--cor-primaria)] sm:block" style={{ width: `${(n.vendido / maior) * 100}%`, maxWidth: "8rem" }} aria-hidden />
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums">{n.contas}</td>
                <td className="py-2 text-right tabular-nums">{formatarBRL(n.ticket)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {top.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">Mais vendidos nessas noites</h3>
            <ol className="flex flex-col gap-1 text-sm">
              {top.map(([nome, qtd], i) => (
                <li key={nome} className="flex justify-between gap-2">
                  <span>
                    {i + 1}. {nome}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{qtd}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
