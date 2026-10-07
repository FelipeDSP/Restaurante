import { Check } from "lucide-react";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { carregarAssinatura, NOME_SITUACAO } from "@/lib/assinatura";
import { exigirDono } from "@/lib/auth/dal";
import { formatarBRL } from "@/lib/dinheiro";
import { DIAS_TESTE_GRATIS, PLANOS, planoPorId } from "@/lib/planos";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Assinatura" };

function dataLocal(iso: string, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: fuso }).format(new Date(iso));
}

export default async function AssinaturaPage() {
  const acesso = await exigirDono();
  const assinatura = await carregarAssinatura(acesso.restaurante.id);
  const fuso = acesso.restaurante.fusoHorario;
  const emTeste = assinatura?.situacao === "teste" || assinatura?.situacao === "teste_encerrado";
  const diasUsados = assinatura?.diasRestantesTeste != null ? DIAS_TESTE_GRATIS - assinatura.diasRestantesTeste : 0;

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Assinatura</h1>
        <p className="text-muted-foreground">Plano do sistema para {acesso.restaurante.nome}.</p>
      </div>

      {assinatura ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">
                {emTeste ? "Teste grátis" : `Plano ${planoPorId(assinatura.plano)?.nome ?? ""}`}
              </CardTitle>
              <Badge variant={assinatura.situacao === "ativa" || assinatura.situacao === "cortesia" ? "default" : "outline"}>
                {NOME_SITUACAO[assinatura.situacao]}
              </Badge>
            </div>
            <CardDescription>
              {assinatura.situacao === "teste" && assinatura.testeTerminaEm
                ? `Tudo liberado até ${dataLocal(assinatura.testeTerminaEm, fuso)}. Faltam ${assinatura.diasRestantesTeste} dias.`
                : assinatura.situacao === "teste_encerrado"
                  ? "O teste terminou. Escolha um plano abaixo para continuar usando."
                  : assinatura.situacao === "cortesia"
                    ? "Sua conta tem acesso de cortesia, sem cobrança."
                    : assinatura.periodoTerminaEm
                      ? `Período atual até ${dataLocal(assinatura.periodoTerminaEm, fuso)}.`
                      : null}
            </CardDescription>
          </CardHeader>
          {emTeste ? (
            <CardContent>
              <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="Dias de teste usados"
                aria-valuemin={0}
                aria-valuemax={DIAS_TESTE_GRATIS}
                aria-valuenow={diasUsados}
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${(diasUsados / DIAS_TESTE_GRATIS) * 100}%` }} />
              </div>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      <section aria-labelledby="titulo-planos" className="flex flex-col gap-3">
        <h2 id="titulo-planos" className="text-lg font-semibold">
          Planos
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {PLANOS.map((p) => {
            const atual = assinatura?.situacao === "ativa" && assinatura.plano === p.id;
            return (
              <Card key={p.id} className={cn(p.destaque && "ring-2 ring-primary")}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-xl">{p.nome}</CardTitle>
                    {atual ? <Badge>Seu plano</Badge> : p.destaque ? <Badge variant="outline">Mais completo</Badge> : null}
                  </div>
                  <CardDescription>{p.paraQuem}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <p>
                    <span className="text-3xl font-bold tabular-nums">{formatarBRL(p.precoMensal)}</span>
                    <span className="text-muted-foreground">/mês</span>
                  </p>
                  <ul className="flex flex-col gap-2 text-sm">
                    {p.itens.map((i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={3} aria-hidden />
                        {i}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  {atual ? null : p.linkCheckout ? (
                    <Button className="h-11 w-full" nativeButton={false} render={<a href={p.linkCheckout} target="_blank" rel="noopener noreferrer" />}>
                      Assinar o {p.nome}
                    </Button>
                  ) : (
                    <Button className="h-11 w-full" variant="outline" disabled>
                      Assinatura online em breve
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
        <p className="text-sm text-muted-foreground">
          Mensalidade fixa, sem comissão por pedido. Durante o teste, tudo fica liberado.
        </p>
      </section>
    </main>
  );
}
