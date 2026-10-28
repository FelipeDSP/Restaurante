import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { formatarBRL } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";
import { id } from "@/lib/validacao";

import { AdicionarProduto } from "../../componentes-carrinho";
import { buscarMesaPorQr, buscarRestaurantePorSlug, carregarCardapioMesa } from "../../dados";
import { BarraPedidoMesa } from "./pedido-mesa";

export const metadata: Metadata = { title: "Cardápio", robots: { index: false } };

// Cardápio da mesa (QR code colado na mesa). Com o pedido ligado pelo dono e o caixa aberto, o
// cliente pede por aqui e vai direto para a cozinha; senão, só consulta e pede ao garçom.
export default async function MesaPage(props: PageProps<"/[slug]/mesa/[token]">) {
  const { slug, token } = await props.params;
  if (!id.safeParse(token).success) notFound();
  const [restaurante, mesa] = await Promise.all([buscarRestaurantePorSlug(slug), buscarMesaPorQr(token)]);
  if (!restaurante || !mesa || mesa.restauranteId !== restaurante.id) notFound();
  const cardapio = await carregarCardapioMesa(restaurante.id);
  const carrinho = `mesa:${token}`;
  const conta = mesa.conta;

  return (
    <main className={cn("flex flex-col gap-4", mesa.podePedir ? "pb-28" : "pb-10")}>
      <section aria-label="Mesa" className="flex flex-col gap-2 bg-background p-4 shadow-sm">
        <h1 className="text-xl font-bold">Mesa {mesa.mesa}</h1>
        <p className="text-sm text-muted-foreground">
          {mesa.podePedir ? "Escolha e envie: o pedido vai direto para a cozinha." : "Para pedir, chame o garçom."}
        </p>
        {conta && conta.itens.length > 0 ? (
          <details className="group rounded-lg bg-muted/50 text-sm">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 font-medium [&::-webkit-details-marker]:hidden">
              <span>Conta da mesa</span>
              <span className="font-semibold tabular-nums">{formatarBRL(conta.total)}</span>
            </summary>
            <ul className="flex flex-col gap-1 px-3 pb-3">
              {conta.itens.map((i, n) => (
                <li key={n} className="flex justify-between gap-3">
                  <span>
                    {i.quantidade}× {i.nome}
                    {i.adicionais ? <span className="text-muted-foreground"> ({i.adicionais})</span> : null}
                  </span>
                  <span className="tabular-nums">{formatarBRL(i.total)}</span>
                </li>
              ))}
              {conta.servico > 0 ? (
                <li className="flex justify-between gap-3 text-muted-foreground">
                  <span>Serviço</span>
                  <span className="tabular-nums">{formatarBRL(conta.servico)}</span>
                </li>
              ) : null}
              {conta.couvert > 0 ? (
                <li className="flex justify-between gap-3 text-muted-foreground">
                  <span>Couvert</span>
                  <span className="tabular-nums">{formatarBRL(conta.couvert)}</span>
                </li>
              ) : null}
            </ul>
          </details>
        ) : null}
      </section>

      {cardapio.length > 1 ? (
        <nav
          aria-label="Categorias"
          className="sticky top-16 z-10 -mt-4 flex gap-2 overflow-x-auto sem-barra-rolagem bg-background/95 px-4 py-2 shadow-sm backdrop-blur"
        >
          {cardapio.map((c) => (
            <a
              key={c.id}
              href={`#categoria-${c.id}`}
              className="flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium hover:bg-muted"
            >
              {c.nome}
            </a>
          ))}
        </nav>
      ) : null}

      {cardapio.length === 0 ? (
        <p className="p-4 text-muted-foreground">Cardápio indisponível no momento.</p>
      ) : (
        cardapio.map((categoria) => (
          <section
            key={categoria.id}
            id={`categoria-${categoria.id}`}
            aria-labelledby={`titulo-${categoria.id}`}
            className="flex scroll-mt-32 flex-col gap-2 px-4"
          >
            <h2 id={`titulo-${categoria.id}`} className="pt-2 text-xl font-bold">
              {categoria.nome}
            </h2>
            <ul className="flex flex-col gap-2">
              {categoria.produtos.map((produto) => (
                <li key={produto.id} className="flex gap-3 rounded-xl bg-background p-3 shadow-sm">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <h3 className="font-semibold">{produto.nome}</h3>
                    {produto.descricao ? <p className="text-sm text-muted-foreground">{produto.descricao}</p> : null}
                    <div className={cn("flex items-center justify-between gap-2 pt-1", produto.fotoUrl ? "" : "mt-auto min-h-11")}>
                      <span className="font-semibold tabular-nums">{formatarBRL(produto.preco)}</span>
                      {mesa.podePedir && !produto.fotoUrl ? <AdicionarProduto restauranteId={carrinho} produto={produto} naMesa /> : null}
                    </div>
                    {!mesa.podePedir && produto.grupos.length > 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {produto.grupos.map((g) => `${g.nome}: ${g.opcoes.map((o) => o.nome).join(", ")}`).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  {produto.fotoUrl ? (
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element -- foto do Storage do restaurante */}
                      <img src={produto.fotoUrl} alt={produto.nome} loading="lazy" className="size-28 rounded-lg object-cover" />
                      {mesa.podePedir ? <AdicionarProduto restauranteId={carrinho} produto={produto} naMesa /> : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {mesa.podePedir ? <BarraPedidoMesa slug={restaurante.slug} token={token} carrinho={carrinho} /> : null}
    </main>
  );
}
