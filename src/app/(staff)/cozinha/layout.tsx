import type { Metadata } from "next";

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

  return (
    <div className="flex min-h-full flex-1 flex-col bg-muted/40" style={estiloMarca(acesso.restaurante)}>
      <header className="sticky top-0 z-10 bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)] shadow-sm print:hidden">
        <div className="flex h-14 w-full items-center justify-between gap-3 px-4">
          <MarcaRestaurante restaurante={acesso.restaurante} />
          <MenuUsuario
            nome={acesso.nome}
            papel={NOME_PAPEL[acesso.papel]}
            podeTrocarRestaurante={acesso.vinculos.length > 1}
            outraArea={podeAcessar(acesso.papel, "painel") ? { href: "/painel", rotulo: "Abrir painel" } : undefined}
          />
        </div>
      </header>
      <div className="flex w-full flex-1 flex-col">{children}</div>
    </div>
  );
}
