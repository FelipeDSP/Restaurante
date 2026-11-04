import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { usuarioCliente } from "../conta";
import { buscarRestaurantePorSlug } from "../dados";
import { FormSenhaCliente } from "./form-senha-cliente";

export const metadata: Metadata = { title: "Senha nova", robots: { index: false } };

// Destino do link de "Esqueci minha senha" do cliente (a sessão vem do link).
export default async function NovaSenhaClientePage(props: PageProps<"/[slug]/nova-senha">) {
  const { slug } = await props.params;
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) notFound();
  const usuario = await usuarioCliente();

  return (
    <main className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">Senha nova</h1>
      {usuario ? (
        <FormSenhaCliente slug={restaurante.slug} />
      ) : (
        <p className="rounded-xl bg-background p-4 text-sm shadow-sm">
          O link expirou ou já foi usado. Peça outro em Entrar › Esqueci minha senha.
        </p>
      )}
    </main>
  );
}
