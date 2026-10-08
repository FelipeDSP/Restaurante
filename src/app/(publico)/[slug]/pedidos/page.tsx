import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { loginClienteDisponivel } from "@/lib/mensagens";

import { obterConta, pedidosDaConta } from "../conta";
import { buscarRestaurantePorSlug, carregarBairros } from "../dados";
import { CartaoConta } from "./cartao-conta";
import { ListaMeusPedidos } from "./lista-meus-pedidos";

export const metadata: Metadata = { title: "Meus pedidos", robots: { index: false } };

export default async function MeusPedidosPage(props: PageProps<"/[slug]/pedidos">) {
  const { slug } = await props.params;
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) notFound();
  const [bairros, conta] = await Promise.all([carregarBairros(restaurante.id), obterConta(restaurante.id)]);
  const pedidosConta = conta ? await pedidosDaConta(restaurante.id) : null;
  const listaBairros = bairros.map((b) => ({ id: b.id, nome: b.nome }));

  return (
    <main className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">Meus pedidos</h1>
      {conta || loginClienteDisponivel() ? (
        <CartaoConta key={conta?.nome} slug={restaurante.slug} conta={conta} bairros={listaBairros} />
      ) : null}
      <ListaMeusPedidos
        restaurante={{ id: restaurante.id, slug: restaurante.slug, fusoHorario: restaurante.fusoHorario }}
        bairros={listaBairros}
        pedidosConta={pedidosConta}
      />
    </main>
  );
}
