"use client";

import { ChefHat, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ABAS = [
  { href: "/garcom", rotulo: "Mesas", icone: LayoutGrid },
  { href: "/garcom/pracas", rotulo: "Praças", icone: ChefHat },
] as const;

// Abas no rodapé (alcance do polegar). Só nas telas principais: a tela da mesa tem barra própria.
export function NavegacaoGarcom() {
  const caminho = usePathname();
  if (!ABAS.some((a) => a.href === caminho)) return null;

  return (
    <nav
      aria-label="Áreas do garçom"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto grid max-w-md grid-cols-2">
        {ABAS.map(({ href, rotulo, icone: Icone }) => {
          const ativa = caminho === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={ativa ? "page" : undefined}
              className={cn(
                "flex h-16 flex-col items-center justify-center gap-0.5 text-sm font-semibold",
                ativa ? "text-[var(--cor-primaria-texto)]" : "text-muted-foreground",
              )}
            >
              <Icone className="size-6" aria-hidden />
              {rotulo}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
