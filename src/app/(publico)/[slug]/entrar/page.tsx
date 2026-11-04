import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { formasDeEntrar } from "@/lib/login-cliente";

import { obterConta, usuarioCliente } from "../conta";
import { buscarRestaurantePorSlug } from "../dados";
import { EntrarCliente } from "./entrar-cliente";

export const metadata: Metadata = { title: "Entrar", robots: { index: false } };

export default async function EntrarPage(props: PageProps<"/[slug]/entrar">) {
  const { slug } = await props.params;
  const { voltar, erro } = await props.searchParams;
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) notFound();

  // Volta só para uma página deste restaurante.
  const destino =
    typeof voltar === "string" && voltar.startsWith(`/${restaurante.slug}/`) && !voltar.startsWith("//")
      ? voltar
      : `/${restaurante.slug}/pedidos`;
  if (await obterConta(restaurante.id)) redirect(destino);

  // Já entrou (ex.: voltou do Google) mas é a primeira vez neste restaurante: falta nome e celular.
  const usuario = await usuarioCliente();

  return (
    <main className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">Entrar</h1>
      <EntrarCliente
        slug={restaurante.slug}
        nomeRestaurante={restaurante.nome}
        destino={destino}
        formas={formasDeEntrar()}
        cadastro={usuario ? { nomeSugerido: usuario.nomeSugerido ?? "", precisaTelefone: !usuario.telefoneConfirmado, email: usuario.email } : null}
        erroInicial={erro ? "Não foi possível entrar com o Google. Tente de novo ou use o e-mail." : null}
      />
    </main>
  );
}
