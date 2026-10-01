import type { Metadata } from "next";
import Link from "next/link";

import { MarcaRestaurante } from "@/components/staff/marca-restaurante";
import { MenuUsuario } from "@/components/staff/menu-usuario";
import { exigirAcesso } from "@/lib/auth/dal";
import { NOME_PAPEL, type Papel } from "@/lib/auth/papeis";
import { estiloMarca } from "@/lib/cores";

export async function generateMetadata(): Promise<Metadata> {
  const { restaurante } = await exigirAcesso("painel");
  return { title: { template: `%s · ${restaurante.nome}`, default: restaurante.nome } };
}

// Itens do menu do painel; cada etapa acrescenta os seus.
const NAVEGACAO: { href: string; rotulo: string; papeis: Papel[] }[] = [
  { href: "/painel", rotulo: "Início", papeis: ["dono", "caixa"] },
];

export default async function PainelLayout({ children }: LayoutProps<"/painel">) {
  const acesso = await exigirAcesso("painel");
  const itens = NAVEGACAO.filter((item) => item.papeis.includes(acesso.papel));

  return (
    <div className="flex min-h-full flex-1 flex-col" style={estiloMarca(acesso.restaurante)}>
      <header className="sticky top-0 z-10 bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)] shadow-sm">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/painel" className="min-w-0">
            <MarcaRestaurante restaurante={acesso.restaurante} />
          </Link>
          <nav aria-label="Painel" className="hidden flex-1 gap-1 md:flex">
            {itens.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm font-medium hover:bg-black/10"
              >
                {item.rotulo}
              </Link>
            ))}
          </nav>
          <MenuUsuario
            nome={acesso.nome}
            papel={NOME_PAPEL[acesso.papel]}
            podeTrocarRestaurante={acesso.vinculos.length > 1}
            outraArea={{ href: "/garcom", rotulo: "Abrir área do garçom" }}
          />
        </div>
        <nav aria-label="Painel" className="flex gap-1 overflow-x-auto px-2 pb-2 md:hidden">
          {itens.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-md px-3 py-2 text-sm font-medium hover:bg-black/10"
            >
              {item.rotulo}
            </Link>
          ))}
        </nav>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">{children}</div>
    </div>
  );
}
