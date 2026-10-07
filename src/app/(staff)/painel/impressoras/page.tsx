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
      <div>
        <h1 className="text-2xl font-semibold">Impressoras</h1>
        <p className="text-muted-foreground">Os pedidos saem sozinhos na impressora de cada praça, com a conta e a via do delivery.</p>
      </div>
      <Computadores computadores={computadores} fuso={acesso.restaurante.fusoHorario} dono={dono} endereco={endereco} />
      <Impressoras impressoras={impressoras} pracas={pracas} computadores={computadores} dono={dono} />
      <Fila fila={fila} fuso={acesso.restaurante.fusoHorario} />
    </main>
  );
}
