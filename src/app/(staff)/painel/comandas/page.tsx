import type { Metadata } from "next";
import Link from "next/link";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { exigirPermissao } from "@/lib/auth/dal";
import { formatarBRL } from "@/lib/dinheiro";
import { mudancaDoSalao } from "@/lib/realtime-filtros";

import { caixaEstaAberto, carregarMapa } from "../../garcom/dados";
import { MapaMesas } from "./mapa-mesas";

export const metadata: Metadata = { title: "Mesas" };

export default async function MesasPainelPage() {
  const acesso = await exigirPermissao("painel", "comandas_painel", "garcom_app");
  const [{ mesas, geradoEm }, caixaAberto] = await Promise.all([
    carregarMapa(acesso.restaurante.id),
    caixaEstaAberto(acesso.restaurante.id),
  ]);
  const ocupadas = mesas.filter((m) => m.status !== "livre");
  const aReceber = ocupadas.reduce((soma, m) => soma + Math.max(0, m.total - m.pago), 0);
  const contaPedida = ocupadas.filter((m) => m.status === "conta_pedida").length;

  return (
    <main className="flex flex-col gap-5 p-4 md:p-6">
      <AtualizarEmTempoReal
        restauranteId={acesso.restaurante.id}
        tabelas={["comandas", "pagamentos", "tarefas_producao", "caixa_sessoes"]}
        interessa={mudancaDoSalao}
      />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          {/* Com a aba Praças, o título já está nas abas (Mesas | Praças). */}
          <h1 className={acesso.permissoes.includes("garcom_app") ? "sr-only" : "text-2xl font-semibold"}>Mesas</h1>
          <p className="text-sm text-muted-foreground">
            {ocupadas.length} de {mesas.length} ocupadas
            {contaPedida > 0 ? ` · ${contaPedida} com conta pedida` : ""} · {formatarBRL(aReceber)} a receber
          </p>
        </div>
        {!caixaAberto ? (
          acesso.permissoes.includes("caixa_operar") ? (
            <Link href="/painel/caixa" className="text-sm font-medium text-destructive underline">
              Caixa fechado: abrir caixa
            </Link>
          ) : (
            <p className="text-sm font-medium text-destructive">Caixa fechado</p>
          )
        ) : null}
      </div>

      {mesas.length === 0 ? (
        <p className="text-muted-foreground">
          Nenhuma mesa cadastrada.{" "}
          {acesso.permissoes.includes("mesas") ? (
            <Link href="/painel/mesas" className="font-medium text-foreground underline underline-offset-4">
              Cadastrar mesas
            </Link>
          ) : null}
        </p>
      ) : (
        <MapaMesas mesas={mesas} euId={acesso.membroId} geradoEm={geradoEm} />
      )}
    </main>
  );
}
