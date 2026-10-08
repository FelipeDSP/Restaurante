import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { loginClienteDisponivel } from "@/lib/mensagens";

import { obterConta } from "../conta";
import { buscarRestaurantePorSlug } from "../dados";
import { EntrarCliente } from "./entrar-cliente";

export const metadata: Metadata = { title: "Entrar", robots: { index: false } };

export default async function EntrarPage(props: PageProps<"/[slug]/entrar">) {
  const { slug } = await props.params;
  const { voltar } = await props.searchParams;
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante || !loginClienteDisponivel()) notFound();

  // Volta só para uma página deste restaurante.
  const destino =
    typeof voltar === "string" && voltar.startsWith(`/${restaurante.slug}/`) && !voltar.startsWith("//")
      ? voltar
      : `/${restaurante.slug}/pedidos`;
  if (await obterConta(restaurante.id)) redirect(destino);

  return (
    <main className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">Entrar</h1>
      <EntrarCliente slug={restaurante.slug} nomeRestaurante={restaurante.nome} destino={destino} />
    </main>
  );
}
