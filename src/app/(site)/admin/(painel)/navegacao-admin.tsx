"use client";

import { Banknote, LayoutDashboard, Menu, ShieldCheck, Store, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/utils";

const ITENS = [
  { href: "/admin", rotulo: "Visão geral", icone: LayoutDashboard },
  { href: "/admin/restaurantes", rotulo: "Restaurantes", icone: Store },
  { href: "/admin/financeiro", rotulo: "Financeiro", icone: Banknote },
  { href: "/admin/administradores", rotulo: "Administradores", icone: ShieldCheck },
];

function ativo(href: string, caminho: string) {
  return href === "/admin" ? caminho === "/admin" : caminho === href || caminho.startsWith(`${href}/`);
}

function Lista({ aoNavegar }: { aoNavegar?: () => void }) {
  const caminho = usePathname();
  return (
    <nav aria-label="Painel da plataforma" className="flex flex-col gap-1">
      {ITENS.map(({ href, rotulo, icone: Icone }) => {
        const atual = ativo(href, caminho);
        return (
          <Link
            key={href}
            href={href}
            onClick={aoNavegar}
            aria-current={atual ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold transition-colors",
              atual ? "bg-uau-laranja text-uau-marrom" : "text-uau-creme/75 hover:bg-white/5 hover:text-uau-creme",
            )}
          >
            <Icone className="size-[18px]" aria-hidden />
            {rotulo}
          </Link>
        );
      })}
    </nav>
  );
}

// Computador: lista fixa na barra lateral. Celular: botão "Menu" abre a mesma lista.
export function NavegacaoAdmin({ variante, children }: { variante: "lateral" | "celular"; children?: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  if (variante === "lateral") return <Lista />;
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-label={aberto ? "Fechar menu" : "Abrir menu"}
        className="flex size-11 items-center justify-center rounded-xl text-uau-creme hover:bg-white/10 lg:hidden"
      >
        {aberto ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      {aberto ? (
        <div className="absolute inset-x-0 top-16 z-30 border-b border-white/10 bg-uau-marrom p-4 lg:hidden">
          <div className="flex flex-col gap-4">
            <Lista aoNavegar={() => setAberto(false)} />
            {children}
          </div>
        </div>
      ) : null}
    </>
  );
}
