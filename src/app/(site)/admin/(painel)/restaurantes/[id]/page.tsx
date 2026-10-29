import type { Metadata } from "next";
import { Check, ChevronLeft, ExternalLink, Receipt, ShoppingBag, Store, TrendingUp } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatarBRL } from "@/lib/dinheiro";
import { planoPorId } from "@/lib/planos";
import { id as idSchema } from "@/lib/validacao";

import { carregarDetalhes, carregarFicha, dataBR, NOME_STATUS, type StatusAssinatura } from "../../../dados";
import { SeloAssinatura } from "../../../selo-assinatura";
import { Cartao, Indicador, Vazio } from "../../ui";
import { AtivarDesativar, FormAssinatura } from "./formularios";
import { NovaNota } from "./notas";

export const metadata: Metadata = { title: { absolute: "Restaurante · Admin · uau foods" } };

const NOME_PAPEL: Record<string, string> = { dono: "Dono", caixa: "Caixa", garcom: "Garçom", cozinha: "Cozinha", equipe: "Equipe" };

const NOME_EVENTO: Record<string, string> = {
  PAYMENT_CREATED: "Cobrança criada",
  PAYMENT_CONFIRMED: "Pagamento confirmado",
  PAYMENT_RECEIVED: "Pagamento recebido",
  PAYMENT_OVERDUE: "Cobrança vencida",
  SUBSCRIPTION_DELETED: "Assinatura removida",
  SUBSCRIPTION_INACTIVATED: "Assinatura inativada",
};

function descreverRegistro(acao: string, dados: Record<string, unknown>): string {
  if (acao === "assinatura") {
    const antes = (dados.antes ?? {}) as Record<string, string | null>;
    const depois = (dados.depois ?? {}) as Record<string, string | null>;
    const nome = (s: string | null | undefined) => (s && s in NOME_STATUS ? NOME_STATUS[s as StatusAssinatura] : (s ?? "—"));
    const plano = (s: string | null | undefined) => (s ? (planoPorId(s)?.nome ?? s) : "—");
    const partes = [`${nome(antes.status)} → ${nome(depois.status)}`];
    if (antes.plano !== depois.plano) partes.push(`plano ${plano(antes.plano)} → ${plano(depois.plano)}`);
    if (depois.teste_termina_em) partes.push(`teste até ${dataBR(depois.teste_termina_em)}`);
    if (depois.periodo_termina_em) partes.push(`período até ${dataBR(depois.periodo_termina_em)}`);
    return `Assinatura: ${partes.join(" · ")}`;
  }
  const motivo = typeof dados.motivo === "string" ? `: ${dados.motivo}` : "";
  return `${acao === "desativado" ? "Site tirado do ar" : "Site de volta ao ar"}${motivo}`;
}

export default async function FichaRestaurantePage(props: PageProps<"/admin/restaurantes/[id]">) {
  const { id } = await props.params;
  if (!idSchema.safeParse(id).success) notFound();
  const [ficha, detalhes] = await Promise.all([carregarFicha(id), carregarDetalhes(id)]);
  if (!ficha) notFound();
  const { restaurante: r, assinatura: a, uso } = ficha;
  const endereco = r.endereco ? [r.endereco.rua, r.endereco.numero, r.endereco.cidade, r.endereco.uf].filter(Boolean).join(", ") : "";
  const plano = a ? planoPorId(a.plano) : undefined;
  const porDia = detalhes?.por_dia ?? [];
  const maiorDia = Math.max(1, ...porDia.map((d) => d.pedidos));
  const cobranca = detalhes?.cobranca;

  return (
    <>
      <Link href="/admin/restaurantes" className="-ml-2 flex h-10 w-fit items-center gap-1 rounded-lg px-2 text-sm font-bold text-uau-marrom-claro hover:bg-uau-marrom/5">
        <ChevronLeft className="size-5" />
        Restaurantes
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-4">
          {r.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo do Storage do restaurante
            <img src={r.logo_url} alt="" className="size-16 rounded-xl border border-black/5 bg-white object-contain p-1" />
          ) : (
            <span aria-hidden className="flex size-16 items-center justify-center rounded-xl text-2xl font-black text-white" style={{ background: r.cor_primaria ?? "#2b1a12" }}>
              {r.nome.charAt(0)}
            </span>
          )}
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-black md:text-3xl">
              {r.nome}
              {!r.ativo ? <span className="rounded-md bg-zinc-200 px-2 py-0.5 text-sm font-bold text-zinc-700">fora do ar</span> : null}
            </h1>
            <p className="text-sm text-uau-marrom-claro">
              /{r.slug} · cadastrado em {dataBR(r.criado_em)}
              {endereco ? ` · ${endereco}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {a ? <SeloAssinatura status={a.status} testeTerminaEm={a.teste_termina_em} /> : null}
              {plano ? <span className="rounded-md bg-uau-marrom/5 px-2 py-0.5 text-xs font-bold">Plano {plano.nome}</span> : null}
            </div>
          </div>
        </div>
        <a
          href={`/${r.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center gap-2 rounded-xl border border-black/10 px-4 text-sm font-bold hover:bg-uau-marrom/5"
        >
          <ExternalLink className="size-4" aria-hidden />
          Abrir o site
        </a>
      </div>

      <section aria-label="Uso" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador icone={Receipt} rotulo="Pedidos (30 dias)" valor={String(uso.pedidos_30d)} detalhe={`${uso.delivery_30d} delivery`} />
        <Indicador icone={TrendingUp} tom="verde" rotulo="Vendido (30 dias)" valor={formatarBRL(uso.vendido_30d)} />
        <Indicador
          icone={Store}
          tom={uso.ultimo_caixa ? "neutro" : "vermelho"}
          rotulo="Caixas (30 dias)"
          valor={String(uso.caixas_30d)}
          detalhe={uso.ultimo_caixa ? `último em ${dataBR(uso.ultimo_caixa)}` : "nunca abriu"}
        />
        <Indicador
          icone={ShoppingBag}
          rotulo="Cardápio"
          valor={`${uso.produtos} produtos`}
          detalhe={`${uso.mesas} mesas · ${uso.clientes} clientes com conta`}
        />
      </section>

      <Cartao titulo="Pedidos por dia (30 dias)">
        {porDia.every((d) => d.pedidos === 0) ? (
          <Vazio>Nenhum pedido nos últimos 30 dias.</Vazio>
        ) : (
          <div className="flex h-40 items-end gap-1" role="img" aria-label="Pedidos por dia nos últimos 30 dias">
            {porDia.map((d) => (
              <div key={d.dia} className="group relative flex h-full flex-1 flex-col justify-end">
                <div
                  className="w-full rounded-t-md bg-uau-laranja/80 transition-colors group-hover:bg-uau-laranja"
                  style={{ height: `${Math.max(d.pedidos ? 4 : 1, (d.pedidos / maiorDia) * 100)}%` }}
                />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md bg-uau-marrom px-2 py-1 text-xs whitespace-nowrap text-uau-creme group-hover:block">
                  {new Date(`${d.dia}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}: {d.pedidos} pedidos ·{" "}
                  {formatarBRL(d.vendido)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Cartao>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-6">
          <Cartao titulo="Assinatura">
            {a ? (
              <>
                {plano ? (
                  <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
                    {plano.itens.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-green-700" strokeWidth={3} aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-xs text-uau-marrom-claro">Atualizada em {dataBR(a.atualizado_em)}</p>
                <FormAssinatura restauranteId={r.id} assinatura={a} />
              </>
            ) : (
              <Vazio>Este restaurante não tem assinatura.</Vazio>
            )}
          </Cartao>

          <Cartao
            titulo="Cobrança (Asaas)"
            acao={
              cobranca?.fatura_url ? (
                <a href={cobranca.fatura_url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-uau-laranja-escuro hover:underline">
                  Fatura em aberto
                </a>
              ) : null
            }
          >
            {cobranca?.provedor === "asaas" ? (
              <>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-uau-marrom-claro">Cliente</dt>
                  <dd className="font-mono text-xs leading-5">{cobranca.cliente_id ?? "—"}</dd>
                  <dt className="text-uau-marrom-claro">Assinatura</dt>
                  <dd className="font-mono text-xs leading-5">{cobranca.assinatura_id ?? "—"}</dd>
                </dl>
                {cobranca.eventos.length === 0 ? (
                  <Vazio>Nenhum aviso do Asaas ainda.</Vazio>
                ) : (
                  <ul className="flex flex-col divide-y divide-black/5 text-sm">
                    {cobranca.eventos.map((e, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 py-2">
                        <span>
                          <span className="font-bold">{NOME_EVENTO[e.evento] ?? e.evento}</span>
                          {e.vencimento ? <span className="text-xs text-uau-marrom-claro"> · vence {dataBR(`${e.vencimento}T12:00:00`)}</span> : null}
                        </span>
                        <span className="shrink-0 text-right text-xs text-uau-marrom-claro">
                          {e.valor ? <span className="block font-bold text-uau-marrom">{formatarBRL(e.valor)}</span> : null}
                          {dataBR(e.em)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <Vazio>Ainda não assinou pelo painel (sem cadastro no Asaas).</Vazio>
            )}
          </Cartao>

          <Cartao titulo="Site no ar">
            <p className="text-sm text-uau-marrom-claro">
              {r.ativo ? "O site de delivery está no ar." : "O site de delivery está fora do ar. A equipe continua entrando no painel."}
            </p>
            <AtivarDesativar restauranteId={r.id} ativo={r.ativo} />
          </Cartao>
        </div>

        <div className="flex flex-col gap-6">
          <Cartao titulo="Anotações internas">
            <NovaNota restauranteId={r.id} />
            {(detalhes?.notas ?? []).length > 0 ? (
              <ul className="flex flex-col gap-3 text-sm">
                {detalhes?.notas.map((n, i) => (
                  <li key={i} className="rounded-xl bg-[#f6f1ea]/70 p-3">
                    <p className="whitespace-pre-wrap">{n.texto}</p>
                    <p className="mt-1 text-xs text-uau-marrom-claro">
                      {dataBR(n.em)} · {n.por ?? "—"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </Cartao>

          <Cartao titulo="Equipe">
            <ul className="flex flex-col divide-y divide-black/5 text-sm">
              {ficha.equipe.map((m, i) => (
                <li key={i} className="flex items-start justify-between gap-3 py-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-bold">
                      {m.nome}
                      {!m.ativo ? <span className="ml-2 text-xs font-normal text-uau-marrom-claro">(inativo)</span> : null}
                    </span>
                    <span className="truncate text-xs text-uau-marrom-claro">{m.email ?? "—"}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end text-xs">
                    <span className="font-bold">{NOME_PAPEL[m.papel] ?? m.papel}</span>
                    <span className="text-uau-marrom-claro">{m.ultimo_acesso ? `entrou ${dataBR(m.ultimo_acesso)}` : "nunca entrou"}</span>
                  </span>
                </li>
              ))}
            </ul>
            {r.whatsapp || r.telefone ? (
              <p className="text-sm text-uau-marrom-claro">
                {r.whatsapp ? `WhatsApp ${r.whatsapp}` : ""}
                {r.whatsapp && r.telefone ? " · " : ""}
                {r.telefone ? `Telefone ${r.telefone}` : ""}
              </p>
            ) : null}
          </Cartao>

          <Cartao titulo="Histórico do admin">
            {ficha.registros.length === 0 ? (
              <Vazio>Nenhuma alteração feita pelo admin.</Vazio>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {ficha.registros.map((g, i) => (
                  <li key={i} className="flex flex-col">
                    <span>{descreverRegistro(g.acao, g.dados)}</span>
                    <span className="text-xs text-uau-marrom-claro">
                      {dataBR(g.em)} · {g.por ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>
      </div>
    </>
  );
}
