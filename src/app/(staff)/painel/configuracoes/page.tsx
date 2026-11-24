import type { Metadata } from "next";
import {
  Bike,
  BookOpen,
  Boxes,
  ChefHat,
  ChevronRight,
  CreditCard,
  LayoutGrid,
  Lock,
  type LucideIcon,
  Printer,
  Store,
  TicketPercent,
  Users,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { exigirAcesso } from "@/lib/auth/dal";

import { itensBloqueadosPeloPlano, itensDeConfiguracao, itensDoMenu } from "../navegacao";

export const metadata: Metadata = { title: "Configurações" };

// Um ícone por assunto: no celular a pessoa acha pelo desenho antes de ler.
const ICONES: Record<string, LucideIcon> = {
  Cardápio: BookOpen,
  Mesas: LayoutGrid,
  Cupons: TicketPercent,
  Entregadores: Bike,
  Restaurante: Store,
  "Setores da cozinha": ChefHat,
  Impressoras: Printer,
  Equipe: Users,
  Estoque: Boxes,
  Assinatura: CreditCard,
};

function Icone({ rotulo, apagado = false }: { rotulo: string; apagado?: boolean }) {
  const Desenho = ICONES[rotulo] ?? Store;
  return (
    <span
      aria-hidden
      className={
        apagado
          ? "grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
          : "grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]"
      }
    >
      <Desenho className="size-5" />
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
          <li key={item.rotulo} className="flex flex-col rounded-xl border transition-colors hover:border-[var(--cor-primaria)]">
            {/* items-start: o cartão sem abas tem a mesma altura dos vizinhos, mas o título
                precisa começar na mesma linha que o deles. */}
            <Link href={item.href} className="flex flex-1 items-start gap-3 p-4">
              <Icone rotulo={item.rotulo} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{item.rotulo}</span>
                {item.descricao ? (
                  <span className="truncate text-sm text-muted-foreground">{item.descricao}</span>
                ) : null}
              </span>
              <ChevronRight className="mt-2.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
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
            <Link href="/painel/assinatura" className="flex items-start gap-3 p-4 text-muted-foreground">
              <Icone rotulo={item.rotulo} apagado />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{item.rotulo}</span>
                <span className="truncate text-sm">Fora do seu plano</span>
              </span>
              <Lock className="mt-3 size-4 shrink-0" aria-label="Não faz parte do seu plano" />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
