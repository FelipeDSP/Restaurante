import type { Metadata } from "next";
import Link from "next/link";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { Chave } from "@/components/staff/chave";
import { exigirPermissao, temPermissao } from "@/lib/auth/dal";
import { formatarBRL } from "@/lib/dinheiro";
import { mudancaDoSalao } from "@/lib/realtime-filtros";

import { caixaEstaAberto, carregarMapa } from "@/modulos/mesas/dados";
import { alternarPedidoMesa } from "../mesas/actions";
import { pedidoPeloQrLigado } from "../mesas/dados";
import { MapaMesas } from "./mapa-mesas";

export const metadata: Metadata = { title: "Mesas" };

export default async function MesasPainelPage() {
  const acesso = await exigirPermissao("painel", "comandas_painel", "garcom_app");
  // "Clientes pedem pelo celular" também se liga aqui: é decisão de serviço (uma noite cheia, o
  // garçom sozinho), e estava só em Configurações › Mesas › QR code.
  const podeQr = temPermissao(acesso, "restaurante") && acesso.plano.qr;
  const [{ mesas, geradoEm }, caixaAberto, qrLigado] = await Promise.all([
    carregarMapa(acesso.restaurante.id),
    caixaEstaAberto(acesso.restaurante.id),
    podeQr ? pedidoPeloQrLigado(acesso.restaurante.id) : Promise.resolve(false),
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
          {/* Com a aba Setores, o título já está nas abas (Mesas | Setores). */}
          <h1 className={acesso.permissoes.includes("garcom_app") ? "sr-only" : "text-2xl font-semibold"}>Mesas</h1>
          <p className="text-sm text-muted-foreground">
            {ocupadas.length} de {mesas.length} ocupadas
            {contaPedida > 0 ? ` · ${contaPedida} com conta pedida` : ""} · {formatarBRL(aReceber)} a receber
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {podeQr ? (
            <>
              <Chave ligado={qrLigado} rotulo="Clientes pedem pelo celular" aoMudar={alternarPedidoMesa} className="text-sm" />
              {acesso.permissoes.includes("mesas") ? (
                <Link href="/painel/mesas/qrcode" className="text-sm font-medium underline underline-offset-4">
                  QR codes
                </Link>
              ) : null}
            </>
          ) : null}
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
