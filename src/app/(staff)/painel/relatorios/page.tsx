import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { exigirDono } from "@/lib/auth/dal";
import { formatarBRL } from "@/lib/dinheiro";
import { nomeForma, nomeOrigem } from "@/lib/rotulos";
import { diaLocal } from "@/lib/tempo";
import { cn } from "@/lib/utils";

import { BaixarCsv } from "./baixar-csv";
import { carregarRelatorio, dataCurta, PERIODOS, resolverPeriodo } from "./dados";

export const metadata: Metadata = { title: "Relatórios" };

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <p className="text-sm text-muted-foreground">{rotulo}</p>
      <p className="text-2xl font-bold tabular-nums">{valor}</p>
      {detalhe ? <p className="text-xs text-muted-foreground">{detalhe}</p> : null}
    </div>
  );
}

// Barras horizontais simples (sem biblioteca de gráfico).
function Barras({ linhas, vazio }: { linhas: { chave: string; rotulo: string; valor: number; texto: string; detalhe?: string }[]; vazio: string }) {
  if (linhas.length === 0) return <p className="text-sm text-muted-foreground">{vazio}</p>;
  const maior = Math.max(...linhas.map((l) => l.valor), 1);
  return (
    <ul className="flex flex-col gap-2">
      {linhas.map((l) => (
        <li key={l.chave} className="grid grid-cols-[minmax(4.5rem,8rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate">{l.rotulo}</span>
          <span className="h-3 rounded-full bg-muted" aria-hidden>
            <span
              className="block h-3 rounded-full bg-[var(--cor-primaria)]"
              style={{ width: `${l.valor > 0 ? Math.max(2, (l.valor / maior) * 100) : 0}%` }}
            />
          </span>
          <span className="text-right tabular-nums">
            {l.texto}
            {l.detalhe ? <span className="block text-xs text-muted-foreground">{l.detalhe}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

const porcento = (parte: number, todo: number) => (todo ? `${Math.round((parte / todo) * 100)}%` : "0%");

export default async function RelatoriosPage(props: PageProps<"/painel/relatorios">) {
  const acesso = await exigirDono();
  const params = await props.searchParams;
  const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const fuso = acesso.restaurante.fusoHorario;
  const periodo = resolverPeriodo(fuso, { periodo: texto(params.periodo), de: texto(params.de), ate: texto(params.ate) });
  const ordem = texto(params.ordem) === "valor" ? "valor" : "quantidade";
  const r = await carregarRelatorio(acesso.restaurante.id, periodo.de, periodo.ate);

  const ticket = r.contas ? Math.round(r.vendido / r.contas) : 0;
  const mediaNoite = r.sessoes ? Math.round(r.vendido / r.sessoes) : 0;
  const produtos = [...r.produtos].sort((a, b) => (ordem === "valor" ? b.total - a.total : b.quantidade - a.quantidade));
  const cancelados = r.pedidos_cancelados.valor + r.itens_cancelados.valor;
  const linkPeriodo = (extra: Record<string, string>) => {
    const base: Record<string, string> = periodo.periodo ? { periodo: periodo.periodo } : { de: periodo.de, ate: periodo.ate };
    return `/painel/relatorios?${new URLSearchParams({ ...base, ...extra })}`;
  };

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Relatórios</h1>
        <p className="text-muted-foreground">
          {dataCurta(periodo.de)} a {dataCurta(periodo.ate)} · {r.sessoes} {r.sessoes === 1 ? "noite" : "noites"} de caixa. Cada noite
          conta pelo dia em que o caixa abriu, mesmo fechando depois da meia-noite.
        </p>
      </div>

      <section aria-label="Período" className="flex flex-col gap-3 rounded-xl border bg-background p-4 lg:flex-row lg:items-end lg:justify-between">
        <nav className="flex flex-wrap gap-2" aria-label="Períodos prontos">
          {PERIODOS.map((p) => (
            <Link
              key={p.id}
              href={`/painel/relatorios?periodo=${p.id}`}
              aria-current={periodo.periodo === p.id ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center rounded-full border px-4 text-sm font-medium",
                periodo.periodo === p.id ? "border-[var(--cor-primaria)] bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]" : "hover:bg-muted",
              )}
            >
              {p.rotulo}
            </Link>
          ))}
        </nav>
        <form className="flex flex-wrap items-end gap-2" action="/painel/relatorios">
          <label className="flex flex-col gap-1 text-sm font-medium">
            De
            <Input type="date" name="de" defaultValue={periodo.de} className="h-11 w-40" required />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Até
            <Input type="date" name="ate" defaultValue={periodo.ate} className="h-11 w-40" required />
          </label>
          <Button type="submit" variant="outline" className="h-11">
            Ver período
          </Button>
        </form>
      </section>

      {r.sessoes === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          Nenhum caixa aberto neste período. Escolha outras datas.
        </p>
      ) : (
        <>
          <section aria-label="Números do período" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Indicador rotulo="Vendido" valor={formatarBRL(r.vendido)} detalhe={`Média de ${formatarBRL(mediaNoite)} por noite`} />
            <Indicador rotulo="Contas" valor={String(r.contas)} detalhe="Comandas fechadas + pedidos de delivery" />
            <Indicador rotulo="Ticket médio" valor={formatarBRL(ticket)} />
            <Indicador rotulo="Itens vendidos" valor={String(r.itens)} detalhe={r.taxas_entrega ? `Taxas de entrega: ${formatarBRL(r.taxas_entrega)}` : undefined} />
            <Indicador
              rotulo="Cancelado"
              valor={formatarBRL(cancelados)}
              detalhe={`${r.pedidos_cancelados.quantidade} pedidos e ${r.itens_cancelados.quantidade} itens${r.estornos.quantidade ? ` · ${r.estornos.quantidade} estornos (${formatarBRL(r.estornos.valor)})` : ""}`}
            />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Vendido por noite</CardTitle>
              <CardDescription>Toque numa noite para ver o resumo completo do caixa.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {r.por_sessao.map((s) => {
                  const maior = Math.max(...r.por_sessao.map((x) => x.vendido), 1);
                  return (
                    <li key={s.id}>
                      <Link
                        href={`/painel/caixa/${s.id}`}
                        className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 rounded-md text-sm hover:bg-muted/60"
                      >
                        <span className="font-medium">{diaLocal(s.aberta_em, fuso)}</span>
                        <span className="h-3 rounded-full bg-muted" aria-hidden>
                          <span
                            className="block h-3 rounded-full bg-[var(--cor-primaria)]"
                            style={{ width: `${s.vendido > 0 ? Math.max(2, (s.vendido / maior) * 100) : 0}%` }}
                          />
                        </span>
                        <span className="text-right tabular-nums">
                          {formatarBRL(s.vendido)}
                          <span className="block text-xs text-muted-foreground">{s.contas} contas</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Por dia da semana</CardTitle>
                <CardDescription>Média vendida por noite em cada dia.</CardDescription>
              </CardHeader>
              <CardContent>
                <Barras
                  vazio="Sem vendas no período."
                  linhas={r.por_dia_semana.map((d) => ({
                    chave: String(d.dia),
                    rotulo: DIAS_SEMANA[d.dia],
                    valor: d.vendido / d.noites,
                    texto: formatarBRL(Math.round(d.vendido / d.noites)),
                    detalhe: `${d.noites} ${d.noites === 1 ? "noite" : "noites"}`,
                  }))}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Por horário</CardTitle>
                <CardDescription>Pedidos lançados em cada hora (cozinha e delivery).</CardDescription>
              </CardHeader>
              <CardContent>
                <Barras
                  vazio="Sem pedidos no período."
                  // Ordem da noite: madrugada (0h a 5h) depois das 23h.
                  linhas={[...r.por_hora].sort((x, y) => ((x.hora + 18) % 24) - ((y.hora + 18) % 24)).map((h) => ({
                    chave: String(h.hora),
                    rotulo: `${String(h.hora).padStart(2, "0")}h`,
                    valor: h.pedidos,
                    texto: `${h.pedidos} ${h.pedidos === 1 ? "pedido" : "pedidos"}`,
                    detalhe: formatarBRL(h.vendido),
                  }))}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Mesas e delivery</CardTitle>
              </CardHeader>
              <CardContent>
                <Barras
                  vazio="Sem vendas no período."
                  linhas={r.por_origem.map((o) => ({
                    chave: o.origem,
                    rotulo: nomeOrigem(o.origem),
                    valor: o.vendido,
                    texto: formatarBRL(o.vendido),
                    detalhe: `${porcento(o.vendido, r.vendido)} · ${o.pedidos} ${o.origem === "mesa" ? "comandas" : "pedidos"}`,
                  }))}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Formas de pagamento</CardTitle>
                <CardDescription>Recebido no período: {formatarBRL(r.recebido)}.</CardDescription>
              </CardHeader>
              <CardContent>
                <Barras
                  vazio="Nenhum pagamento no período."
                  linhas={r.por_forma.map((f) => ({
                    chave: f.forma,
                    rotulo: nomeForma(f.forma),
                    valor: f.valor,
                    texto: formatarBRL(f.valor),
                    detalhe: `${porcento(f.valor, r.recebido)} · ${f.quantidade} pagamentos`,
                  }))}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1.5">
                <CardTitle>Produtos</CardTitle>
                <CardDescription>{produtos.length} produtos vendidos no período.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="flex rounded-lg border p-0.5" role="group" aria-label="Ordenar por">
                  {(["quantidade", "valor"] as const).map((o) => (
                    <Link
                      key={o}
                      href={linkPeriodo({ ordem: o })}
                      aria-current={ordem === o ? "true" : undefined}
                      className={cn("flex min-h-9 items-center rounded-md px-3 text-sm", ordem === o ? "bg-muted font-medium" : "text-muted-foreground")}
                    >
                      {o === "quantidade" ? "Mais vendidos" : "Maior valor"}
                    </Link>
                  ))}
                </div>
                <BaixarCsv
                  nomeArquivo={`produtos-${periodo.de}-a-${periodo.ate}.csv`}
                  cabecalho={["Produto", "Categoria", "Quantidade", "Total (R$)"]}
                  linhas={produtos.map((p) => [p.nome, p.categoria ?? "", p.quantidade, p.total / 100])}
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="pb-2 font-medium">#</th>
                      <th className="pb-2 font-medium">Produto</th>
                      <th className="pb-2 text-right font-medium">Qtd.</th>
                      <th className="pb-2 text-right font-medium">Total</th>
                      <th className="pb-2 text-right font-medium">% do vendido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {produtos.map((p, i) => (
                      <tr key={p.produto_id} className="border-t">
                        <td className="py-2 pr-2 text-muted-foreground tabular-nums">{i + 1}</td>
                        <td className="py-2">
                          {p.nome}
                          {p.categoria ? <span className="block text-xs text-muted-foreground">{p.categoria}</span> : null}
                        </td>
                        <td className="py-2 text-right tabular-nums">{p.quantidade}</td>
                        <td className="py-2 text-right tabular-nums">{formatarBRL(p.total)}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">{porcento(p.total, r.vendido)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Delivery por bairro</CardTitle>
              </CardHeader>
              <CardContent>
                {r.bairros.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum delivery no período.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="pb-2 font-medium">Bairro</th>
                        <th className="pb-2 text-right font-medium">Pedidos</th>
                        <th className="pb-2 text-right font-medium">Vendido</th>
                        <th className="pb-2 text-right font-medium">Taxas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.bairros.map((b) => (
                        <tr key={b.nome} className="border-t">
                          <td className="py-2">{b.nome}</td>
                          <td className="py-2 text-right tabular-nums">{b.pedidos}</td>
                          <td className="py-2 text-right tabular-nums">{formatarBRL(b.vendido)}</td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">{formatarBRL(b.taxas)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Garçons</CardTitle>
                <CardDescription>Comandas fechadas de cada um.</CardDescription>
              </CardHeader>
              <CardContent>
                {r.garcons.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma comanda fechada no período.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="pb-2 font-medium">Garçom</th>
                        <th className="pb-2 text-right font-medium">Comandas</th>
                        <th className="pb-2 text-right font-medium">Vendido</th>
                        <th className="pb-2 text-right font-medium">Ticket</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.garcons.map((g) => (
                        <tr key={g.nome} className="border-t">
                          <td className="py-2">{g.nome}</td>
                          <td className="py-2 text-right tabular-nums">{g.comandas}</td>
                          <td className="py-2 text-right tabular-nums">{formatarBRL(g.vendido)}</td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">
                            {formatarBRL(g.comandas ? Math.round(g.vendido / g.comandas) : 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </main>
  );
}
