import Link from "next/link";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirPermissao } from "@/lib/auth/dal";
import { type Permissao, PERMISSOES_INICIO } from "@/lib/auth/papeis";
import { formatarBRL } from "@/lib/dinheiro";
import { dataHoraLocal } from "@/lib/tempo";

import { type Disponibilidade, consultarDisponibilidade } from "../../(publico)/[slug]/dados";

import { ESPERA_TELA_DE_DINHEIRO, carregarResumo, carregarSessaoAberta } from "./caixa/dados";
import { PrimeirosPassos } from "./primeiros-passos";
import { UltimasNoites } from "./ultimas-noites";

// O mesmo motivo que o cliente vê, dito para quem pode resolver.
const MOTIVO_NO_PAINEL: Record<NonNullable<Disponibilidade["motivo"]>, string> = {
  restaurante_indisponivel: "O restaurante está desativado ou a assinatura está suspensa.",
  sem_delivery: "O delivery pelo site está desligado.",
  fora_do_horario: "Está fora do horário de funcionamento que você cadastrou.",
  caixa_fechado: "O caixa está fechado.",
};

async function StatusCaixa({ restauranteId, fuso, permissoes }: { restauranteId: string; fuso: string; permissoes: Permissao[] }) {
  const sessao = await carregarSessaoAberta(restauranteId);
  const resumo = sessao ? await carregarResumo(restauranteId, sessao.id) : null;

  if (!sessao || !resumo) {
    return (
      <Card className="border-amber-300 bg-amber-50">
        <CardHeader>
          <CardTitle>Caixa fechado</CardTitle>
        </CardHeader>
        {permissoes.includes("caixa_operar") ? (
          <CardContent>
            <Button className="h-11" nativeButton={false} render={<Link href="/painel/caixa" />}>
              Abrir caixa
            </Button>
          </CardContent>
        ) : null}
      </Card>
    );
  }

  // Caixa aberto não quer dizer site aberto: o horário de funcionamento também fecha a porta, e
  // esse é o caso em que o dono não desconfia de nada — o painel está todo verde e o cliente
  // recebe "estamos fechados". Caixa fechado já aparece no cartão de cima, então aqui só o resto.
  const disponibilidade = await consultarDisponibilidade(restauranteId);

  return (
    <Card>
      {!disponibilidade.aberto && disponibilidade.motivo && disponibilidade.motivo !== "caixa_fechado" ? (
        <p role="status" className="mx-6 -mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <span>
            <strong>O site não está recebendo pedidos.</strong> {MOTIVO_NO_PAINEL[disponibilidade.motivo]}
          </span>
          {permissoes.includes("restaurante") ? (
            <Link href="/painel/restaurante" className="font-medium underline underline-offset-4">
              Ajustar
            </Link>
          ) : null}
        </p>
      ) : null}
      <CardHeader>
        <CardTitle>Caixa aberto</CardTitle>
        <CardDescription>
          Desde {dataHoraLocal(sessao.abertaEm, fuso)} · {sessao.abertaPor ?? "—"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Três colunas não cabem em 390 px: os valores encostavam um no outro e "Comandas
            abertas" quebrava em duas linhas com o número solto embaixo. */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-sm text-muted-foreground">Recebido</dt>
            <dd className="truncate text-lg font-bold tabular-nums sm:text-xl">{formatarBRL(resumo.total_recebido)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-sm text-muted-foreground">Vendido</dt>
            <dd className="truncate text-lg font-bold tabular-nums sm:text-xl">{formatarBRL(resumo.total_vendido)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-sm text-muted-foreground">Comandas abertas</dt>
            <dd className="text-lg font-bold tabular-nums sm:text-xl">{resumo.comandas.abertas}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          {permissoes.includes("comandas_painel") || permissoes.includes("garcom_app") ? (
            <Button className="h-11" nativeButton={false} render={<Link href="/painel/comandas" />}>
              Ver mesas
            </Button>
          ) : null}
          {permissoes.includes("caixa_operar") ? (
            <Button variant="outline" className="h-11" nativeButton={false} render={<Link href="/painel/caixa" />}>
              Resumo e fechamento
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function PainelPage() {
  // Quem só atende mesas não tem Início: vai direto para as Mesas.
  const acesso = await exigirPermissao("painel", ...PERMISSOES_INICIO);

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      {/* O resumo da sessão é caro de refazer (uma varredura da noite inteira) e um total não
          precisa mudar no mesmo segundo: os eventos são juntados numa janela maior. */}
      <AtualizarEmTempoReal restauranteId={acesso.restaurante.id} tabelas={["comandas", "pagamentos"]} espera={ESPERA_TELA_DE_DINHEIRO} />
      <h1 className="text-2xl font-semibold">Olá, {acesso.nome}</h1>
      {acesso.papel === "dono" ? <PrimeirosPassos acesso={acesso} /> : null}
      <StatusCaixa restauranteId={acesso.restaurante.id} fuso={acesso.restaurante.fusoHorario} permissoes={acesso.permissoes} />
      {acesso.permissoes.includes("relatorios") ? <UltimasNoites restauranteId={acesso.restaurante.id} fuso={acesso.restaurante.fusoHorario} /> : null}
    </main>
  );
}
