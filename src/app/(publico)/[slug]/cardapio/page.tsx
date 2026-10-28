import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { formatarBRL } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";

import { buscarRestaurantePorSlug, carregarCardapioMesa, type OpcoesSalao } from "../dados";

export const metadata: Metadata = { title: "Cardápio" };

// "Escolha 1", "Até 3", "De 1 a 3": a regra do grupo em poucas palavras.
function regra(g: OpcoesSalao) {
  if (g.maximo === 1) return g.minimo === 1 ? "Escolha 1" : "Opcional";
  if (g.minimo === 0) return `Até ${g.maximo}`;
  if (g.minimo === g.maximo) return `Escolha ${g.minimo}`;
  return `De ${g.minimo} a ${g.maximo}`;
}

// Cardápio do salão: o cliente abre pelo QR code da mesa e consulta (o pedido é com o garçom).
export default async function CardapioSalaoPage(props: PageProps<"/[slug]/cardapio">) {
  const { slug } = await props.params;
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) notFound();
  const cardapio = await carregarCardapioMesa(restaurante.id);

  return (
    <main className="flex flex-col gap-4 pb-10">
      {cardapio.length > 1 ? (
        <nav
          aria-label="Categorias"
          className="sticky top-16 z-10 flex gap-2 overflow-x-auto sem-barra-rolagem bg-background/95 px-4 py-2 shadow-sm backdrop-blur"
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

      <h1 className="sr-only">Cardápio</h1>
      {cardapio.length === 0 ? (
        <p className="p-4 text-muted-foreground">Cardápio indisponível no momento.</p>
      ) : (
        cardapio.map((categoria) => (
          <section
            key={categoria.id}
            id={`categoria-${categoria.id}`}
            aria-labelledby={`titulo-${categoria.id}`}
            className="flex scroll-mt-32 flex-col gap-2 px-4 first-of-type:pt-2"
          >
            <h2 id={`titulo-${categoria.id}`} className="pt-2 text-xl font-bold">
              {categoria.nome}
            </h2>
            <ul className="flex flex-col gap-2">
              {categoria.produtos.map((produto) => (
                <li key={produto.id} className="flex flex-col gap-2 rounded-xl bg-background p-3 shadow-sm">
                  <div className="flex gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <h3 className="font-semibold">{produto.nome}</h3>
                      {produto.descricao ? <p className="text-sm text-muted-foreground">{produto.descricao}</p> : null}
                      <span className={cn("pt-1 font-semibold tabular-nums", !produto.fotoUrl && "mt-auto")}>
                        {formatarBRL(produto.preco)}
                      </span>
                    </div>
                    {produto.fotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- foto do Storage do restaurante
                      <img src={produto.fotoUrl} alt={produto.nome} loading="lazy" className="size-28 shrink-0 rounded-lg object-cover" />
                    ) : null}
                  </div>
                  {produto.grupos.length > 0 ? (
                    <details className="group rounded-lg bg-muted/50 text-sm">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 font-medium text-[var(--cor-primaria-texto)] [&::-webkit-details-marker]:hidden">
                        <span className="group-open:hidden">Ver opções</span>
                        <span className="hidden group-open:inline">Esconder opções</span>
                      </summary>
                      <div className="flex flex-col gap-3 px-3 pb-3">
                        {produto.grupos.map((g) => (
                          <div key={g.nome} className="flex flex-col gap-1">
                            <p className="font-semibold">
                              {g.nome} <span className="font-normal text-muted-foreground">· {regra(g)}</span>
                            </p>
                            <ul className="flex flex-col">
                              {g.opcoes.map((o) => (
                                <li key={o.nome} className="flex justify-between gap-3">
                                  <span>{o.nome}</span>
                                  {o.preco > 0 ? <span className="tabular-nums text-muted-foreground">+ {formatarBRL(o.preco)}</span> : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
