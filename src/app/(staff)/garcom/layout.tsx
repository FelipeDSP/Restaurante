import type { Metadata, Viewport } from "next";

import { MarcaRestaurante } from "@/components/staff/marca-restaurante";
import { MenuUsuario } from "@/components/staff/menu-usuario";
import { exigirAcesso } from "@/lib/auth/dal";
import { NOME_PAPEL, podeAcessar } from "@/lib/auth/papeis";
import { estiloMarca } from "@/lib/cores";
import { urlIcone } from "@/lib/icone";

// PWA com a marca do restaurante: manifest e ícones em rotas públicas por restaurante.
export async function generateMetadata(): Promise<Metadata> {
  const { restaurante } = await exigirAcesso("garcom");
  const base = `/pwa/${restaurante.id}`;
  return {
    title: { template: `%s · ${restaurante.nome}`, default: restaurante.nome },
    applicationName: restaurante.nome,
    manifest: `${base}/manifest?v=${urlIcone(restaurante, 192).split("v=")[1]}`,
    icons: {
      icon: [{ url: urlIcone(restaurante, 192), sizes: "192x192", type: "image/png" }],
      apple: [{ url: urlIcone(restaurante, 180), sizes: "180x180", type: "image/png" }],
    },
    appleWebApp: { capable: true, title: restaurante.nome, statusBarStyle: "default" },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const { restaurante } = await exigirAcesso("garcom");
  return { themeColor: restaurante.corPrimaria, width: "device-width", initialScale: 1, viewportFit: "cover" };
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
