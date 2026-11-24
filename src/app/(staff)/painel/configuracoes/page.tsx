import type { Metadata } from "next";
import { ChevronRight, Lock } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { exigirAcesso } from "@/lib/auth/dal";

import { itensBloqueadosPeloPlano, itensDeConfiguracao, itensDoMenu } from "../navegacao";

export const metadata: Metadata = { title: "Configurações" };

// Porta única do que se configura uma vez (o menu do dia a dia ficou só com o que se usa).
export default async function ConfiguracoesPage() {
  const acesso = await exigirAcesso("painel");
  const cartoes = itensDeConfiguracao(acesso.papel, acesso.permissoes);
  if (cartoes.length === 0) redirect("/painel");

  const bloqueados = itensBloqueadosPeloPlano(acesso.papel, [
    ...itensDoMenu(acesso.papel, acesso.permissoes),
    ...cartoes,
  ]).filter((i) => i.grupo === "Configurações");

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="text-2xl font-semibold">Configurações</h1>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cartoes.map((item) => (
          <li key={item.rotulo} className="flex flex-col rounded-xl border transition-colors hover:border-[var(--cor-primaria)]">
            <Link href={item.href} className="flex items-start justify-between gap-2 p-4">
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-semibold">{item.rotulo}</span>
                {item.descricao ? <span className="text-sm text-muted-foreground">{item.descricao}</span> : null}
              </span>
              <ChevronRight className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
            {item.secoes && item.secoes.length > 1 ? (
              <div className="flex flex-wrap gap-1 border-t p-2">
                {item.secoes.map((secao) => (
                  <Link
                    key={secao.href}
                    href={secao.href}
                    className="flex min-h-9 items-center rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {secao.rotulo}
                  </Link>
                ))}
              </div>
            ) : null}
          </li>
        ))}
        {/* O que o plano não tem: fica à vista, com cadeado, levando aos planos. */}
        {bloqueados.map((item) => (
          <li key={item.rotulo} className="rounded-xl border border-dashed">
            <Link href="/painel/assinatura" className="flex items-start justify-between gap-2 p-4 text-muted-foreground">
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-semibold">{item.rotulo}</span>
                <span className="text-sm">Não faz parte do seu plano.</span>
              </span>
              <Lock className="mt-0.5 size-4 shrink-0" aria-label="Não faz parte do seu plano" />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
