import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { exigirAcesso } from "@/lib/auth/dal";
import { dataHoraLocal } from "@/lib/tempo";
import { id as idSchema } from "@/lib/validacao";

import { carregarResumo } from "../dados";
import { BotaoImprimir } from "../formularios";
import { ResumoSessao } from "../resumo-sessao";

export const metadata: Metadata = { title: "Resumo do caixa" };

export default async function SessaoCaixaPage(props: PageProps<"/painel/caixa/[sessaoId]">) {
  const acesso = await exigirAcesso("painel");
  const { sessaoId } = await props.params;
  if (!idSchema.safeParse(sessaoId).success) notFound();

  const resumo = await carregarResumo(acesso.restaurante.id, sessaoId);
  if (!resumo) notFound();

  const fuso = acesso.restaurante.fusoHorario;
  const s = resumo.sessao;

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <Link
        href="/painel/caixa"
        className="-ml-2 flex h-10 w-fit items-center gap-1 rounded-md px-2 text-sm font-medium hover:bg-muted print:hidden"
      >
        <ChevronLeft className="size-5" />
        Caixa
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Resumo do caixa · {acesso.restaurante.nome}</h1>
          <p className="text-muted-foreground">
            {dataHoraLocal(s.aberta_em, fuso)} ({s.aberta_por ?? "—"}) → {s.fechada_em ? `${dataHoraLocal(s.fechada_em, fuso)} (${s.fechada_por ?? "—"})` : "em aberto"}
          </p>
          {s.observacao ? <p className="mt-1 text-sm">Observação: {s.observacao}</p> : null}
        </div>
        <BotaoImprimir />
      </div>
      <ResumoSessao resumo={resumo} fusoHorario={fuso} />
    </main>
  );
}
