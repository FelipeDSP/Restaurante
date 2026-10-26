import { Ban, Clock, Crown, Receipt, ShoppingBag, Star, TrendingUp, Utensils, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exigirDono } from "@/lib/auth/dal";
import { formatarBRL } from "@/lib/dinheiro";
import { nomeForma, nomeOrigem } from "@/lib/rotulos";
import { diaLocal } from "@/lib/tempo";
import { cn } from "@/lib/utils";

import { BaixarCsv } from "./baixar-csv";
import { carregarRelatorio, dataCurta, PERIODOS, periodoAnterior, resolverPeriodo } from "./dados";
import { BarraCelula, Barras, Kpi, Linha, MARCA, Painel, Rosca, variacao, Vazio } from "./graficos";

export const metadata: Metadata = { title: "Relatórios" };

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const porcento = (parte: number, todo: number) => (todo ? `${Math.round((parte / todo) * 100)}%` : "0%");
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export default async function RelatoriosPage(props: PageProps<"/painel/relatorios">) {
  const acesso = await exigirDono();
  const params = await props.searchParams;
  const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const fuso = acesso.restaurante.fusoHorario;
  const periodo = resolverPeriodo(fuso, { periodo: texto(params.periodo), de: texto(params.de), ate: texto(params.ate) });
  const ordem = texto(params.ordem) === "valor" ? "valor" : "quantidade";
  const todos = texto(params.todos) === "1";
  const antes = periodoAnterior(periodo.de, periodo.ate);
  const [r, anterior] = await Promise.all([
    carregarRelatorio(acesso.restaurante.id, periodo.de, periodo.ate),
    // A comparação é um extra: se falhar, a página sai sem ela.
    carregarRelatorio(acesso.restaurante.id, antes.de, antes.ate).catch(() => null),
  ]);
  const base = anterior && anterior.sessoes > 0 ? anterior : null;

  const ticket = r.contas ? Math.round(r.vendido / r.contas) : 0;
  const ticketAntes = base?.contas ? Math.round(base.vendido / base.contas) : null;
  const mediaNoite = r.sessoes ? Math.round(r.vendido / r.sessoes) : 0;
  const cancelados = r.pedidos_cancelados.valor + r.itens_cancelados.valor;
  const canceladosAntes = base ? base.pedidos_cancelados.valor + base.itens_cancelados.valor : null;
  const produtos = [...r.produtos].sort((a, b) => (ordem === "valor" ? b.total - a.total : b.quantidade - a.quantidade));
  const linkPeriodo = (extra: Record<string, string>) => {
    const atual: Record<string, string> = periodo.periodo ? { periodo: periodo.periodo } : { de: periodo.de, ate: periodo.ate };
    return `/painel/relatorios?${new URLSearchParams({ ...atual, ...extra })}`;
  };

  // Destaques do período.
  const melhorNoite = r.por_sessao.reduce<(typeof r.por_sessao)[number] | null>((m, s) => (!m || s.vendido > m.vendido ? s : m), null);
  const maisVendido = [...r.produtos].sort((a, b) => b.quantidade - a.quantidade)[0];
  const melhorDia = r.por_dia_semana.reduce<(typeof r.por_dia_semana)[number] | null>(
    (m, d) => (!m || d.vendido / d.noites > m.vendido / m.noites ? d : m),
    null,
  );
  const pico = r.por_hora.reduce<(typeof r.por_hora)[number] | null>((m, h) => (!m || h.pedidos > m.pedidos ? h : m), null);
  const destaques = [
    melhorNoite ? { icone: Star, rotulo: "Melhor noite", valor: diaLocal(melhorNoite.aberta_em, fuso), detalhe: formatarBRL(melhorNoite.vendido) } : null,
    maisVendido ? { icone: Crown, rotulo: "Mais vendido", valor: maisVendido.nome, detalhe: `${maisVendido.quantidade} vendidos` } : null,
    melhorDia ? { icone: TrendingUp, rotulo: "Dia mais forte", valor: DIAS_SEMANA[melhorDia.dia], detalhe: `${formatarBRL(Math.round(melhorDia.vendido / melhorDia.noites))} por noite` } : null,
    pico ? { icone: Clock, rotulo: "Horário de pico", valor: `${String(pico.hora).padStart(2, "0")}h`, detalhe: plural(pico.pedidos, "pedido", "pedidos") } : null,
  ].filter((d) => d !== null);

  const maiorProduto = Math.max(...produtos.map((p) => (ordem === "valor" ? p.total : p.quantidade)), 1);
  const maiorGarcom = Math.max(...r.garcons.map((g) => g.vendido), 1);
  const maiorEntregador = Math.max(...r.entregadores.map((e) => e.entregas), 1);

  return (
    <main className="flex flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Relatórios</h1>
          <p className="text-sm text-muted-foreground">
            {dataCurta(periodo.de)} a {dataCurta(periodo.ate)} · {plural(r.sessoes, "noite", "noites")} de caixa
          </p>
        </div>
      </div>

      <section aria-label="Período" className="flex flex-col gap-3 rounded-2xl border bg-background p-3 shadow-sm lg:flex-row lg:items-end lg:justify-between">
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
            Ver
          </Button>
        </form>
      </section>

      {r.sessoes === 0 ? (
        <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">Nenhum caixa aberto neste período.</p>
      ) : (
        <>
          <section aria-label="Números do período" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="col-span-2 lg:col-span-1">
              <Kpi
                rotulo="Vendido"
                valor={formatarBRL(r.vendido)}
                icone={Wallet}
                destaque
                delta={variacao(r.vendido, base?.vendido ?? null)}
                detalhe={`${formatarBRL(mediaNoite)} por noite`}
              />
            </div>
            <Kpi rotulo="Contas" valor={String(r.contas)} icone={Receipt} delta={variacao(r.contas, base?.contas ?? null)} />
            <Kpi rotulo="Ticket médio" valor={formatarBRL(ticket)} icone={TrendingUp} delta={variacao(ticket, ticketAntes)} />
            <Kpi rotulo="Itens vendidos" valor={String(r.itens)} icone={Utensils} delta={variacao(r.itens, base?.itens ?? null)} />
            <Kpi
              rotulo="Cancelado"
              valor={formatarBRL(cancelados)}
              icone={Ban}
              delta={variacao(cancelados, canceladosAntes)}
              quedaEhBoa
              detalhe={plural(r.pedidos_cancelados.quantidade + r.itens_cancelados.quantidade, "cancelamento", "cancelamentos")}
            />
          </section>

          {r.servico || r.couvert || r.descontos || r.taxas_entrega || r.estornos.quantidade ? (
            <ul className="flex flex-wrap gap-2 text-sm">
              {r.taxas_entrega ? <Etiqueta rotulo="Taxas de entrega" valor={formatarBRL(r.taxas_entrega)} /> : null}
              {r.servico ? <Etiqueta rotulo="Serviço" valor={formatarBRL(r.servico)} /> : null}
              {r.couvert ? <Etiqueta rotulo="Couvert" valor={formatarBRL(r.couvert)} /> : null}
              {r.descontos ? <Etiqueta rotulo="Cupons" valor={`−${formatarBRL(r.descontos)}`} /> : null}
              {r.estornos.quantidade ? <Etiqueta rotulo="Estornos" valor={`${r.estornos.quantidade} · ${formatarBRL(r.estornos.valor)}`} /> : null}
            </ul>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-3">
            <Painel titulo="Vendido por noite" className="lg:col-span-2">
              <Linha
                pontos={[...r.por_sessao]
                  .sort((a, b) => a.aberta_em.localeCompare(b.aberta_em))
                  .map((s) => ({
                    chave: s.id,
                    rotulo: diaLocal(s.aberta_em, fuso),
                    valor: s.vendido,
                    texto: `${formatarBRL(s.vendido)} · ${plural(s.contas, "conta", "contas")}`,
                    href: `/painel/caixa/${s.id}`,
                  }))}
                media={{ valor: mediaNoite, texto: `média ${formatarBRL(mediaNoite)}` }}
              />
            </Painel>

            <Painel titulo="Destaques">
              <ul className="grid gap-2">
                {destaques.map((d) => (
                  <li key={d.rotulo} className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]" aria-hidden>
                      <d.icone className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-muted-foreground">{d.rotulo}</span>
                      <span className="block truncate font-semibold">{d.valor}</span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{d.detalhe}</span>
                  </li>
                ))}
              </ul>
            </Painel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Painel titulo="Mesas e delivery">
              {r.por_origem.length === 0 ? (
                <Vazio>Sem vendas.</Vazio>
              ) : (
                <Rosca
                  centro={formatarBRL(r.vendido)}
                  rotuloCentro="vendido"
                  fatias={r.por_origem.map((o) => ({
                    chave: o.origem,
                    rotulo: `${nomeOrigem(o.origem)} · ${o.pedidos}`,
                    valor: o.vendido,
                    texto: formatarBRL(o.vendido),
                  }))}
                />
              )}
            </Painel>
            <Painel titulo="Formas de pagamento">
              {r.por_forma.length === 0 ? (
                <Vazio>Nenhum pagamento.</Vazio>
              ) : (
                <Rosca
                  centro={formatarBRL(r.recebido)}
                  rotuloCentro="recebido"
                  fatias={r.por_forma.map((f) => ({ chave: f.forma, rotulo: nomeForma(f.forma), valor: f.valor, texto: formatarBRL(f.valor) }))}
                />
              )}
            </Painel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Painel titulo="Pedidos por horário">
              {r.por_hora.length === 0 ? (
                <Vazio>Sem pedidos.</Vazio>
              ) : (
                <Rosca
                  centro={String(r.por_hora.reduce((t, h) => t + h.pedidos, 0))}
                  rotuloCentro="pedidos"
                  // Ordem da noite: madrugada (0h a 5h) depois das 23h.
                  fatias={[...r.por_hora]
                    .sort((x, y) => ((x.hora + 18) % 24) - ((y.hora + 18) % 24))
                    .map((h) => ({
                      chave: String(h.hora),
                      rotulo: `${String(h.hora).padStart(2, "0")}h`,
                      valor: h.pedidos,
                      texto: plural(h.pedidos, "pedido", "pedidos"),
                    }))}
                />
              )}
            </Painel>
            <Painel titulo="Por dia da semana">
              {r.por_dia_semana.length === 0 ? (
                <Vazio>Sem vendas.</Vazio>
              ) : (
                <Rosca
                  centro={formatarBRL(r.vendido)}
                  rotuloCentro="vendido"
                  fatias={r.por_dia_semana.map((d) => ({
                    chave: String(d.dia),
                    rotulo: `${DIAS_SEMANA[d.dia]} · ${plural(d.noites, "noite", "noites")}`,
                    valor: d.vendido,
                    texto: formatarBRL(d.vendido),
                  }))}
                />
              )}
            </Painel>
          </div>

          <Painel
            titulo={`Produtos (${produtos.length})`}
            acao={
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
            }
          >
            {produtos.length === 0 ? (
              <Vazio>Nenhum produto vendido.</Vazio>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">#</th>
                      <th className="pb-2 font-medium">Produto</th>
                      <th className="pb-2 text-right font-medium">Qtd.</th>
                      <th className="pb-2 text-right font-medium">Total</th>
                      <th className="pb-2 text-right font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(todos ? produtos : produtos.slice(0, 10)).map((p, i) => (
                      <tr key={p.produto_id} className="border-t">
                        <td className="py-2 pr-2">
                          <span
                            className={cn(
                              "grid size-6 place-items-center rounded-full text-xs font-semibold tabular-nums",
                              i < 3 ? "bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]" : "text-muted-foreground",
                            )}
                          >
                            {i + 1}
                          </span>
                        </td>
                        <td className="py-2">
                          {p.nome}
                          {p.categoria ? <span className="block text-xs text-muted-foreground">{p.categoria}</span> : null}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          <span className="flex items-center justify-end gap-2">
                            {ordem === "quantidade" ? <BarraCelula valor={p.quantidade} maior={maiorProduto} cor={MARCA} /> : null}
                            {p.quantidade}
                          </span>
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          <span className="flex items-center justify-end gap-2">
                            {ordem === "valor" ? <BarraCelula valor={p.total} maior={maiorProduto} cor={MARCA} /> : null}
                            {formatarBRL(p.total)}
                          </span>
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">{porcento(p.total, r.vendido)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!todos && produtos.length > 10 ? (
                  <Link
                    href={linkPeriodo({ ordem, todos: "1" })}
                    scroll={false}
                    className="mt-2 flex min-h-11 items-center justify-center rounded-lg border text-sm font-medium hover:bg-muted"
                  >
                    Ver todos ({produtos.length})
                  </Link>
                ) : null}
              </div>
            )}
          </Painel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Painel titulo="Garçons">
              {r.garcons.length === 0 ? (
                <Vazio>Nenhuma comanda fechada.</Vazio>
              ) : (
                <ul className="flex flex-col gap-3">
                  {r.garcons.map((g) => (
                    <li key={g.nome} className="flex items-center gap-3 text-sm">
                      <Iniciais nome={g.nome} />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-medium">{g.nome}</span>
                          <span className="tabular-nums">{formatarBRL(g.vendido)}</span>
                        </span>
                        <span className="h-2 rounded-full bg-muted" aria-hidden>
                          <span
                            className="block h-2 rounded-full"
                            style={{ width: `${Math.max(3, (g.vendido / maiorGarcom) * 100)}%`, backgroundColor: MARCA }}
                          />
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {plural(g.comandas, "comanda", "comandas")} · ticket {formatarBRL(g.comandas ? Math.round(g.vendido / g.comandas) : 0)}
                          {r.servico ? ` · serviço ${formatarBRL(g.servico ?? 0)}` : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Painel>
            <Painel titulo="Delivery por bairro">
              {r.bairros.length === 0 ? (
                <Vazio>Nenhum delivery.</Vazio>
              ) : (
                <Barras
                  linhas={r.bairros.map((b) => ({
                    chave: b.nome,
                    rotulo: b.nome,
                    valor: b.vendido,
                    texto: formatarBRL(b.vendido),
                    detalhe: plural(b.pedidos, "pedido", "pedidos"),
                  }))}
                />
              )}
            </Painel>
            {r.entregadores.length > 0 ? (
              <Painel titulo="Entregadores">
                <ul className="flex flex-col gap-3">
                  {r.entregadores.map((e) => (
                    <li key={e.nome} className="flex items-center gap-3 text-sm">
                      <Iniciais nome={e.nome} />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-medium">{e.nome}</span>
                          <span className="tabular-nums">
                            <span className="text-xs text-muted-foreground">a pagar </span>
                            {formatarBRL(e.valor)}
                          </span>
                        </span>
                        <span className="h-2 rounded-full bg-muted" aria-hidden>
                          <span
                            className="block h-2 rounded-full"
                            style={{ width: `${Math.max(3, (e.entregas / maiorEntregador) * 100)}%`, backgroundColor: MARCA }}
                          />
                        </span>
                        <span className="text-xs text-muted-foreground">{plural(e.entregas, "entrega", "entregas")}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Painel>
            ) : null}
          </div>
        </>
      )}
    </main>
  );
}

function Etiqueta({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <li className="flex items-center gap-1.5 rounded-full border bg-background px-3 py-1">
      <ShoppingBag className="size-3.5 text-muted-foreground" aria-hidden />
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="font-medium tabular-nums">{valor}</span>
    </li>
  );
}

function Iniciais({ nome }: { nome: string }) {
  const letras = nome
    .split(/\s+/)
    .filter((p) => /^\p{L}/u.test(p))
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
  return (
    <span
      className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--cor-primaria)] text-xs font-semibold text-[var(--cor-primaria-contraste)]"
      aria-hidden
    >
      {letras || "?"}
    </span>
  );
}
