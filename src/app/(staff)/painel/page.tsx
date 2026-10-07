import Link from "next/link";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirAcesso } from "@/lib/auth/dal";
import { NOME_PAPEL } from "@/lib/auth/papeis";
import { formatarBRL } from "@/lib/dinheiro";
import { dataHoraLocal } from "@/lib/tempo";

import { carregarResumo, carregarSessaoAberta } from "./caixa/dados";
import { NAVEGACAO } from "./navegacao";
import { PrimeirosPassos } from "./primeiros-passos";

async function StatusCaixa({ restauranteId, fuso }: { restauranteId: string; fuso: string }) {
  const sessao = await carregarSessaoAberta(restauranteId);
  const resumo = sessao ? await carregarResumo(restauranteId, sessao.id) : null;

  if (!sessao || !resumo) {
    return (
      <Card className="border-amber-300 bg-amber-50">
        <CardHeader>
          <CardTitle>Caixa fechado</CardTitle>
          <CardDescription className="text-amber-900">
            Abra o caixa para liberar comandas, pagamentos e pedidos de delivery.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="h-11" nativeButton={false} render={<Link href="/painel/caixa" />}>
            Abrir caixa
          </Button>
        </CardContent>
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
          <Button className="h-11" nativeButton={false} render={<Link href="/painel/comandas" />}>
            Ver comandas
          </Button>
          <Button variant="outline" className="h-11" nativeButton={false} render={<Link href="/painel/caixa" />}>
            Resumo e fechamento
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function PainelPage() {
  const acesso = await exigirAcesso("painel");
  const atalhos = NAVEGACAO.filter((item) => item.descricao && item.papeis.includes(acesso.papel));

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <AtualizarEmTempoReal restauranteId={acesso.restaurante.id} tabelas={["comandas", "pagamentos"]} />
      <div>
        <h1 className="text-2xl font-semibold">Olá, {acesso.nome}</h1>
        <p className="text-muted-foreground">
          {acesso.restaurante.nome} · {NOME_PAPEL[acesso.papel]}
        </p>
      </div>
      {acesso.papel === "dono" ? <PrimeirosPassos acesso={acesso} /> : null}
      <StatusCaixa restauranteId={acesso.restaurante.id} fuso={acesso.restaurante.fusoHorario} />
      {atalhos.length > 0 ? (
        <section aria-labelledby="titulo-cadastros" className="flex flex-col gap-3">
          <h2 id="titulo-cadastros" className="text-lg font-semibold">
            Cadastros
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {atalhos.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block h-full rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <Card className="h-full transition-colors hover:bg-muted/50">
                    <CardHeader>
                      <CardTitle>{item.rotulo}</CardTitle>
                      <CardDescription>{item.descricao}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
