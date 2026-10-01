import type { Metadata } from "next";

import { MarcaRestaurante } from "@/components/staff/marca-restaurante";
import { MenuUsuario } from "@/components/staff/menu-usuario";
import { exigirAcesso } from "@/lib/auth/dal";
import { NOME_PAPEL, podeAcessar } from "@/lib/auth/papeis";
import { estiloMarca } from "@/lib/cores";

export async function generateMetadata(): Promise<Metadata> {
  const { restaurante } = await exigirAcesso("garcom");
  return { title: { template: `%s · ${restaurante.nome}`, default: restaurante.nome } };
}

// Layout mobile-first do PWA do garçom.
export default async function GarcomLayout({ children }: LayoutProps<"/garcom">) {
  const acesso = await exigirAcesso("garcom");

  return (
    <div className="flex min-h-full flex-1 flex-col" style={estiloMarca(acesso.restaurante)}>
      <header className="sticky top-0 z-10 bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)] shadow-sm">
        <div className="mx-auto flex h-16 w-full max-w-md items-center justify-between gap-3 px-4">
          <MarcaRestaurante restaurante={acesso.restaurante} />
          <MenuUsuario
            nome={acesso.nome}
            papel={NOME_PAPEL[acesso.papel]}
            podeTrocarRestaurante={acesso.vinculos.length > 1}
            outraArea={
              podeAcessar(acesso.papel, "painel")
                ? { href: "/painel", rotulo: "Abrir painel" }
                : undefined
            }
          />
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">{children}</div>
    </div>
  );
}
