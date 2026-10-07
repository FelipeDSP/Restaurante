import { Check, ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Acesso } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type Passo = { titulo: string; descricao: string; href: string; feito: boolean };

async function contar(tabela: "produtos" | "mesas" | "bairros_entrega" | "membros" | "caixa_sessoes", restauranteId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from(tabela)
    .select("id", { count: "exact", head: true })
    .eq("restaurante_id", restauranteId);
  return count ?? 0;
}

// Checklist de configuração do dono; some quando tudo estiver feito.
export async function PrimeirosPassos({ acesso }: { acesso: Acesso }) {
  const id = acesso.restaurante.id;
  const supabase = await createClient();
  const [produtos, mesas, bairros, membros, sessoes, { data: restaurante }] = await Promise.all([
    contar("produtos", id),
    contar("mesas", id),
    contar("bairros_entrega", id),
    contar("membros", id),
    contar("caixa_sessoes", id),
    supabase.from("restaurantes").select("aceita_delivery").eq("id", id).maybeSingle(),
  ]);

  const passos: Passo[] = [
    {
      titulo: "Envie o logo",
      descricao: "Ele aparece no site de delivery, no painel e no app do garçom.",
      href: "/painel/restaurante",
      feito: Boolean(acesso.restaurante.logoUrl),
    },
    {
      titulo: "Monte o cardápio",
      descricao: "Categorias, produtos, preços e fotos.",
      href: "/painel/produtos",
      feito: produtos > 0,
    },
    {
      titulo: "Cadastre as mesas",
      descricao: "Elas formam o mapa do garçom.",
      href: "/painel/mesas",
      feito: mesas > 0,
    },
    {
      titulo: "Ligue o delivery",
      descricao: "Bairros com taxa, horários e pedido mínimo.",
      href: bairros > 0 ? "/painel/restaurante" : "/painel/bairros",
      feito: bairros > 0 && Boolean(restaurante?.aceita_delivery),
    },
    {
      titulo: "Chame a equipe",
      descricao: "Crie o acesso do caixa e dos garçons.",
      href: "/painel/equipe",
      feito: membros > 1,
    },
    {
      titulo: "Abra o caixa e faça um teste",
      descricao: "Lance um pedido de mentira e feche a conta.",
      href: "/painel/caixa",
      feito: sessoes > 0,
    },
  ];

  const feitos = passos.filter((p) => p.feito).length;
  if (feitos === passos.length) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="text-lg">Primeiros passos</CardTitle>
            <CardDescription>
              {feitos} de {passos.length} concluídos. Faça na ordem que preferir.
            </CardDescription>
          </div>
          <Link
            href={`/${acesso.restaurante.slug}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
          >
            Ver meu site de delivery
            <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Progresso da configuração"
          aria-valuemin={0}
          aria-valuemax={passos.length}
          aria-valuenow={feitos}
        >
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(feitos / passos.length) * 100}%` }} />
        </div>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-2 md:grid-cols-2">
          {passos.map((p, i) => (
            <li key={p.titulo}>
              <Link
                href={p.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  p.feito && "opacity-60",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    p.feito ? "bg-primary text-primary-foreground" : "border-2 border-border",
                  )}
                >
                  {p.feito ? <Check className="size-4" strokeWidth={3} aria-label="Concluído" /> : i + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn("font-medium", p.feito && "line-through")}>{p.titulo}</span>
                  <span className="text-sm text-muted-foreground">{p.descricao}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
