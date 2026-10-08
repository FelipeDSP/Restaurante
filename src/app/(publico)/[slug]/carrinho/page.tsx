import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { loginClienteDisponivel } from "@/lib/mensagens";

import {
  buscarRestaurantePorSlug,
  carregarBairros,
  carregarCardapioDelivery,
  consultarDisponibilidade,
  MENSAGEM_FECHADO,
} from "../dados";
import { obterConta } from "../conta";
import { Checkout } from "./checkout";

export const metadata: Metadata = { title: "Carrinho" };

export default async function CarrinhoPage(props: PageProps<"/[slug]/carrinho">) {
  const { slug } = await props.params;
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) notFound();

  const [bairros, cardapio, disponibilidade, conta] = await Promise.all([
    carregarBairros(restaurante.id),
    carregarCardapioDelivery(restaurante.id),
    consultarDisponibilidade(restaurante.id),
    obterConta(restaurante.id),
  ]);

  // Nome e preço atuais: o carrinho no navegador pode estar desatualizado.
  const produtosDisponiveis = Object.fromEntries(
    cardapio.flatMap((c) => c.produtos.map((p) => [p.id, { nome: p.nome, preco: p.preco, grupos: p.grupos }])),
  );

  return (
    <main className="flex flex-col">
      <h1 className="px-4 pt-4 text-2xl font-bold">Carrinho</h1>
      <Checkout
        restaurante={{ id: restaurante.id, slug: restaurante.slug, pedidoMinimo: restaurante.pedidoMinimo }}
        aberto={disponibilidade.aberto}
        mensagemFechado={disponibilidade.motivo ? MENSAGEM_FECHADO[disponibilidade.motivo] : null}
        bairros={bairros}
        produtosDisponiveis={produtosDisponiveis}
        conta={conta}
        podeEntrar={loginClienteDisponivel()}
      />
    </main>
  );
}
