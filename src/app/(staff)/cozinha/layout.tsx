import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FaixaConexao } from "@/components/staff/faixa-conexao";
import { MarcaRestaurante } from "@/components/staff/marca-restaurante";
import { MenuUsuario } from "@/components/staff/menu-usuario";
import { exigirAcesso } from "@/lib/auth/dal";
import { NOME_PAPEL, podeAcessar } from "@/lib/auth/papeis";
import { estiloMarca } from "@/lib/cores";
import { urlIcone } from "@/lib/icone";

export async function generateMetadata(): Promise<Metadata> {
  const { restaurante } = await exigirAcesso("cozinha");
  return {
    title: { template: `%s · ${restaurante.nome}`, default: `Cozinha · ${restaurante.nome}` },
    icons: { icon: urlIcone(restaurante, 192), apple: urlIcone(restaurante, 180) },
  };
}

// Tela da cozinha: feita para ficar aberta num tablet ou TV perto das praças.
export default async function CozinhaLayout({ children }: LayoutProps<"/cozinha">) {
  const acesso = await exigirAcesso("cozinha");
  const painel = podeAcessar(acesso.papel, "painel");

  return (
    <div className="flex min-h-full flex-1 flex-col bg-muted/40" style={estiloMarca(acesso.restaurante)}>
      <header className="sticky top-0 z-10 bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)] shadow-sm print:hidden">
        <div className="flex h-14 w-full items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2">
            {/* A cozinha é tela cheia (tablet/TV), sem o menu do painel: dono e caixa voltam por aqui. */}
            {painel ? (
              <Link
                href="/painel"
                className="flex h-11 shrink-0 items-center gap-1 rounded-full bg-black/15 pr-4 pl-3 text-sm font-semibold hover:bg-black/25"
              >
                <ChevronLeft className="size-5" aria-hidden />
                Painel
              </Link>
            ) : null}
            <MarcaRestaurante restaurante={acesso.restaurante} />
          </div>
          <MenuUsuario
            nome={acesso.nome}
            papel={NOME_PAPEL[acesso.papel]}
            podeTrocarRestaurante={acesso.vinculos.length > 1}
            outraArea={painel ? { href: "/painel", rotulo: "Abrir painel" } : undefined}
          />
        </div>
        <FaixaConexao />
      </header>
      <div className="flex w-full flex-1 flex-col">{children}</div>
    </div>
  );
}
