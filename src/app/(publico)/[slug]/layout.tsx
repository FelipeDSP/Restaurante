import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { estiloMarca } from "@/lib/cores";
import { urlIcone } from "@/lib/icone";

import { IconeCarrinho } from "./componentes-carrinho";
import { buscarRestaurantePorSlug } from "./dados";

export async function generateMetadata(props: LayoutProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) return { title: "Não encontrado" };
  return {
    title: { template: `%s · ${restaurante.nome}`, default: `${restaurante.nome} · Cardápio e delivery` },
    description: `Peça online no ${restaurante.nome}.`,
    icons: { icon: urlIcone(restaurante, 192), apple: urlIcone(restaurante, 180) },
  };
}

export async function generateViewport(props: LayoutProps<"/[slug]">): Promise<Viewport> {
  const { slug } = await props.params;
  const restaurante = await buscarRestaurantePorSlug(slug);
  return { themeColor: restaurante?.corPrimaria ?? "#ffffff", width: "device-width", initialScale: 1 };
}

// Site público do restaurante (white label): só a marca do restaurante aparece.
export default async function SiteLayout(props: LayoutProps<"/[slug]">) {
  const { slug } = await props.params;
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) notFound();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-muted/30" style={estiloMarca(restaurante)}>
      <header className="sticky top-0 z-20 bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)] shadow-sm">
        <div className="mx-auto flex h-16 w-full max-w-2xl items-center justify-between gap-3 px-4">
          <Link href={`/${restaurante.slug}`} className="flex min-w-0 items-center gap-3">
            {restaurante.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- logo do Storage do restaurante
              <img src={restaurante.logoUrl} alt="" className="h-10 w-auto max-w-36 shrink-0 rounded-md bg-white object-contain p-0.5" />
            ) : (
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[var(--cor-secundaria)] text-lg font-bold text-[var(--cor-secundaria-contraste)]"
              >
                {restaurante.nome.charAt(0)}
              </span>
            )}
            <span className="truncate text-lg font-bold">{restaurante.nome}</span>
          </Link>
          <IconeCarrinho restauranteId={restaurante.id} slug={restaurante.slug} />
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">{props.children}</div>
    </div>
  );
}
