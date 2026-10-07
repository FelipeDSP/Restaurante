import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { id as idSchema } from "@/lib/validacao";

import { buscarRestaurantePorSlug, consultarPedido } from "../../dados";
import { Acompanhamento } from "./acompanhamento";

export const metadata: Metadata = { title: "Seu pedido", robots: { index: false } };

export default async function PedidoPage(props: PageProps<"/[slug]/pedido/[id]">) {
  const { slug, id } = await props.params;
  if (!idSchema.safeParse(id).success) notFound();

  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) notFound();
  const pedido = await consultarPedido(id);
  // O pedido precisa ser do restaurante da URL.
  if (!pedido || pedido.restaurante_id !== restaurante.id) notFound();

  return (
    <Acompanhamento
      inicial={pedido}
      restaurante={{
        id: restaurante.id,
        slug: restaurante.slug,
        nome: restaurante.nome,
        whatsapp: restaurante.whatsapp,
        fusoHorario: restaurante.fusoHorario,
      }}
    />
  );
}
