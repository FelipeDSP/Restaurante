import type { Metadata } from "next";
import { ChevronRight, Lock } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { exigirAcesso } from "@/lib/auth/dal";

import { type ItemNavegacao, itensBloqueadosPeloPlano, itensDeConfiguracao, itensDoMenu } from "../navegacao";

export const metadata: Metadata = { title: "Configurações" };

// Um ícone por assunto (vem do próprio item da navegação, o mesmo do menu): no celular a pessoa
// acha pelo desenho antes de ler.
function Icone({ item, apagado = false }: { item: ItemNavegacao; apagado?: boolean }) {
  return (
    <span
      aria-hidden
      className={
        apagado
          ? "grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
          : "grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]"
      }
    >
      <item.icone className="size-5" />
    </span>
  );
}

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
          // Só o cartão: a faixa de atalhos para as abas (Produtos, Categorias, Adicionais...) saía
          // em alguns e não em outros, e a grade ficava com cartões de alturas diferentes. Os
          // atalhos não se perdem — são as mesmas abas que aparecem no topo da tela de destino,
          // a um toque daqui.
          <li key={item.rotulo} className="rounded-xl border transition-colors hover:border-[var(--cor-primaria)]">
            <Link href={item.href} className="flex items-center gap-3 p-4">
              <Icone item={item} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{item.rotulo}</span>
                {item.descricao ? (
                  <span className="truncate text-sm text-muted-foreground">{item.descricao}</span>
                ) : null}
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
        {/* O que o plano não tem: fica à vista, com cadeado, levando aos planos. */}
        {bloqueados.map((item) => (
          <li key={item.rotulo} className="rounded-xl border border-dashed">
            <Link href="/painel/assinatura" className="flex items-center gap-3 p-4 text-muted-foreground">
              <Icone item={item} apagado />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{item.rotulo}</span>
                <span className="truncate text-sm">Fora do seu plano</span>
              </span>
              <Lock className="size-4 shrink-0" aria-label="Não faz parte do seu plano" />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
