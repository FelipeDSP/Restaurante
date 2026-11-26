"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

// Abas da conta da pessoa. Mesmo desenho das abas das telas de configuração, mas estas não saem
// do menu (o perfil é alcançado pelo menu do usuário), então a lista fica aqui mesmo.
export function AbasPerfil({ base }: { base: string }) {
  const caminho = usePathname();
  const abas = [
    { href: base, rotulo: "Conta" },
    { href: `${base}/notificacoes`, rotulo: "Notificações" },
  ];
  return (
    <nav aria-label="Seções" className="-mt-2 flex gap-1 border-b">
      {abas.map((aba) => {
        const atual = aba.href === caminho;
        return (
          <Link
            key={aba.href}
            href={aba.href}
            // Sem prefetch: a aba atual aponta para a própria página, e o perfil é rota dinâmica
            // (lê a sessão). O prefetch dela se realimentava — a tela recarregava ~3 vezes por
            // segundo e o que a pessoa marcava se perdia. São duas telas, abrem rápido sem isso.
            prefetch={false}
            aria-current={atual ? "page" : undefined}
            className={cn(
              "-mb-px flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium",
              atual ? "border-[var(--cor-primaria)] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {aba.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
