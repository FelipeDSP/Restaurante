import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { buscarRestaurantePorSlug, carregarBairros } from "../dados";
import { ListaMeusPedidos } from "./lista-meus-pedidos";

export const metadata: Metadata = { title: "Meus pedidos", robots: { index: false } };

export default async function MeusPedidosPage(props: PageProps<"/[slug]/pedidos">) {
  const { slug } = await props.params;
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) notFound();
  const bairros = await carregarBairros(restaurante.id);

  return (
    <main className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">Meus pedidos</h1>
      <ListaMeusPedidos
        restaurante={{ id: restaurante.id, slug: restaurante.slug, fusoHorario: restaurante.fusoHorario }}
        bairros={bairros.map((b) => ({ id: b.id, nome: b.nome }))}
      />
    </main>
  );
}
