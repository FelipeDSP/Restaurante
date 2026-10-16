import type { Metadata } from "next";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { RecarregarPeriodicamente } from "@/components/staff/recarregar-periodicamente";
import { exigirAcesso } from "@/lib/auth/dal";
import { origemDoSite } from "@/lib/url";

import { Computadores } from "./computadores";
import { carregarImpressao } from "./dados";
import { Fila } from "./fila";
import { Impressoras } from "./impressoras";

export const metadata: Metadata = { title: "Impressoras" };

export default async function ImpressorasPage() {
  const acesso = await exigirAcesso("painel");
  const dono = acesso.papel === "dono";
  const [{ computadores, impressoras, pracas, fila }, endereco] = await Promise.all([carregarImpressao(acesso.restaurante.id), origemDoSite()]);

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <AtualizarEmTempoReal restauranteId={acesso.restaurante.id} tabelas={["fila_impressao"]} />
      {/* Situação do computador (online/sem sinal) muda sem evento no banco. */}
      <RecarregarPeriodicamente segundos={15} />
      {/* Para o dono, o título já está nas abas (Setores | Impressoras). */}
      <h1 className={dono ? "sr-only" : "text-2xl font-semibold"}>Impressoras</h1>
      <Computadores computadores={computadores} fuso={acesso.restaurante.fusoHorario} dono={dono} endereco={endereco} />
      <Impressoras impressoras={impressoras} pracas={pracas} computadores={computadores} dono={dono} />
      <Fila fila={fila} fuso={acesso.restaurante.fusoHorario} />
    </main>
  );
}
