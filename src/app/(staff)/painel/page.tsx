import Link from "next/link";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirAcesso } from "@/lib/auth/dal";
import type { Permissao } from "@/lib/auth/papeis";
import { formatarBRL } from "@/lib/dinheiro";
import { dataHoraLocal } from "@/lib/tempo";

import { carregarResumo, carregarSessaoAberta } from "./caixa/dados";
import { PrimeirosPassos } from "./primeiros-passos";
import { UltimasNoites } from "./ultimas-noites";

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Caixa aberto</CardTitle>
        <CardDescription>
          Desde {dataHoraLocal(sessao.abertaEm, fuso)} · {sessao.abertaPor ?? "—"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-3 gap-3">
          <div>
            <dt className="text-sm text-muted-foreground">Recebido</dt>
            <dd className="text-xl font-bold tabular-nums">{formatarBRL(resumo.total_recebido)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Vendido</dt>
            <dd className="text-xl font-bold tabular-nums">{formatarBRL(resumo.total_vendido)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Comandas abertas</dt>
            <dd className="text-xl font-bold tabular-nums">{resumo.comandas.abertas}</dd>
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
  const acesso = await exigirAcesso("painel");

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <AtualizarEmTempoReal restauranteId={acesso.restaurante.id} tabelas={["comandas", "pagamentos"]} />
      <h1 className="text-2xl font-semibold">Olá, {acesso.nome}</h1>
      {acesso.papel === "dono" ? <PrimeirosPassos acesso={acesso} /> : null}
      <StatusCaixa restauranteId={acesso.restaurante.id} fuso={acesso.restaurante.fusoHorario} permissoes={acesso.permissoes} />
      {acesso.permissoes.includes("relatorios") ? <UltimasNoites restauranteId={acesso.restaurante.id} fuso={acesso.restaurante.fusoHorario} /> : null}
    </main>
  );
}
