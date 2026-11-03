import { ChevronRight, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { loginClienteDisponivel } from "@/lib/mensagens";

import { obterConta, pedidosDaConta } from "../conta";
import { buscarRestaurantePorSlug, carregarBairros } from "../dados";
import { ConviteEntrar } from "../conta/convite-entrar";
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
      {conta ? (
        <Link
          href={`/${restaurante.slug}/conta`}
          className="flex min-h-14 items-center gap-3 rounded-xl bg-background p-4 shadow-sm hover:bg-muted/60"
        >
          <UserRound className="size-5 text-muted-foreground" aria-hidden />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold">Minha conta</span>
            <span className="truncate text-sm text-muted-foreground">{conta.nome} · dados e endereços salvos</span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </Link>
      ) : loginClienteDisponivel() ? (
        <ConviteEntrar slug={restaurante.slug} voltar={`/${restaurante.slug}/pedidos`} />
      ) : null}
      <ListaMeusPedidos
        restaurante={{ id: restaurante.id, slug: restaurante.slug, fusoHorario: restaurante.fusoHorario }}
        bairros={listaBairros}
        pedidosConta={pedidosConta}
      />
    </main>
  );
}
