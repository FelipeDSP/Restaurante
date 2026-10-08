import type { Metadata } from "next";
import { ChevronLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatarBRL } from "@/lib/dinheiro";
import { id as idSchema } from "@/lib/validacao";

import { carregarFicha, dataBR, NOME_STATUS, type StatusAssinatura } from "../dados";
import { SeloAssinatura } from "../selo-assinatura";
import { AtivarDesativar, FormAssinatura } from "./formularios";

export const metadata: Metadata = { title: { absolute: "Restaurante · Admin · uau foods" } };

const NOME_PAPEL: Record<string, string> = { dono: "Dono", caixa: "Caixa", garcom: "Garçom", cozinha: "Cozinha" };

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-uau-borda bg-uau-papel p-5">
      <h2 className="text-lg font-black">{titulo}</h2>
      {children}
    </section>
  );
}

function descreverRegistro(acao: string, dados: Record<string, unknown>): string {
  if (acao === "assinatura") {
    const antes = (dados.antes ?? {}) as Record<string, string | null>;
    const depois = (dados.depois ?? {}) as Record<string, string | null>;
    const nome = (s: string | null | undefined) => (s && s in NOME_STATUS ? NOME_STATUS[s as StatusAssinatura] : (s ?? "—"));
    const partes = [`${nome(antes.status)} → ${nome(depois.status)}`];
    if (antes.plano !== depois.plano) partes.push(`plano ${antes.plano} → ${depois.plano}`);
    if (depois.teste_termina_em) partes.push(`teste até ${dataBR(depois.teste_termina_em)}`);
    if (depois.periodo_termina_em) partes.push(`período até ${dataBR(depois.periodo_termina_em)}`);
    return `Assinatura: ${partes.join(" · ")}`;
  }
  const motivo = typeof dados.motivo === "string" ? `: ${dados.motivo}` : "";
  return `${acao === "desativado" ? "Desativado" : "Reativado"}${motivo}`;
}

export default async function FichaRestaurantePage(props: PageProps<"/admin/[id]">) {
  const { id } = await props.params;
  if (!idSchema.safeParse(id).success) notFound();
  const ficha = await carregarFicha(id);
  if (!ficha) notFound();
  const { restaurante: r, assinatura: a, uso } = ficha;
  const endereco = r.endereco ? [r.endereco.rua, r.endereco.numero, r.endereco.cidade, r.endereco.uf].filter(Boolean).join(", ") : "";

  return (
    <>
      <Link href="/admin" className="-ml-2 flex h-10 w-fit items-center gap-1 rounded-full px-2 text-sm font-bold hover:bg-uau-marrom/5">
        <ChevronLeft className="size-5" />
        Restaurantes
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {r.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo do Storage do restaurante
            <img src={r.logo_url} alt="" className="size-16 rounded-xl border border-uau-borda bg-white object-contain p-1" />
          ) : (
            <span
              aria-hidden
              className="flex size-16 items-center justify-center rounded-xl text-2xl font-black text-white"
              style={{ background: r.cor_primaria ?? "#2b1a12" }}
            >
              {r.nome.charAt(0)}
            </span>
          )}
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-3xl font-black">
              {r.nome}
              {!r.ativo ? <span className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-sm font-bold text-zinc-700">desativado</span> : null}
            </h1>
            <p className="text-uau-marrom-claro">
              /{r.slug} · cadastrado em {dataBR(r.criado_em)}
              {endereco ? ` · ${endereco}` : ""}
            </p>
          </div>
        </div>
        <a
          href={`/${r.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center gap-2 rounded-full border border-uau-borda bg-uau-papel px-4 text-sm font-bold hover:bg-uau-marrom/5"
        >
          <ExternalLink className="size-4" aria-hidden />
          Abrir o site
        </a>
      </div>

      <section aria-label="Uso" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { rotulo: "Pedidos (30 dias)", valor: String(uso.pedidos_30d), detalhe: `${uso.delivery_30d} delivery` },
          { rotulo: "Vendido (30 dias)", valor: formatarBRL(uso.vendido_30d) },
          {
            rotulo: "Caixas (30 dias)",
            valor: String(uso.caixas_30d),
            detalhe: uso.ultimo_caixa ? `último em ${dataBR(uso.ultimo_caixa)}` : "nunca abriu",
          },
          { rotulo: "Cardápio", valor: `${uso.produtos} produtos`, detalhe: `${uso.mesas} mesas · ${uso.bairros} bairros · ${uso.clientes} clientes com conta` },
        ].map((n) => (
          <div key={n.rotulo} className="rounded-2xl border border-uau-borda bg-uau-papel p-4">
            <p className="text-sm text-uau-marrom-claro">{n.rotulo}</p>
            <p className="text-2xl font-black tabular-nums">{n.valor}</p>
            {n.detalhe ? <p className="text-xs text-uau-marrom-claro">{n.detalhe}</p> : null}
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-6">
          <Bloco titulo="Assinatura">
            {a ? (
              <>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <SeloAssinatura status={a.status} testeTerminaEm={a.teste_termina_em} />
                  <span className="text-uau-marrom-claro">
                    Plano {a.plano === "completo" ? "Completo" : "Essencial"}
                    {a.provedor ? ` · cobrança: ${a.provedor}` : " · sem cobrança automática"} · atualizada em {dataBR(a.atualizado_em)}
                  </span>
                </div>
                <FormAssinatura restauranteId={r.id} assinatura={a} />
              </>
            ) : (
              <p className="text-sm text-uau-marrom-claro">Este restaurante não tem assinatura.</p>
            )}
          </Bloco>

          <Bloco titulo="Site no ar">
            <p className="text-sm text-uau-marrom-claro">
              {r.ativo ? "O site de delivery está no ar." : "O site de delivery está fora do ar. A equipe continua entrando no painel."}
            </p>
            <AtivarDesativar restauranteId={r.id} ativo={r.ativo} />
          </Bloco>
        </div>

        <div className="flex flex-col gap-6">
          <Bloco titulo="Equipe">
            <ul className="flex flex-col divide-y divide-uau-borda text-sm">
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
                Contato do restaurante: {r.whatsapp ? `WhatsApp ${r.whatsapp}` : ""}
                {r.whatsapp && r.telefone ? " · " : ""}
                {r.telefone ? `telefone ${r.telefone}` : ""}
              </p>
            ) : null}
          </Bloco>

          <Bloco titulo="Histórico do admin">
            {ficha.registros.length === 0 ? (
              <p className="text-sm text-uau-marrom-claro">Nenhuma alteração feita pelo admin.</p>
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
          </Bloco>
        </div>
      </div>
    </>
  );
}
