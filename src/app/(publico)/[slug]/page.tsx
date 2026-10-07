import { Clock, MapPin, MessageCircle } from "lucide-react";
import { notFound } from "next/navigation";

import { formatarBRL } from "@/lib/dinheiro";
import { DIAS, NOME_DIA } from "@/lib/horarios";
import { cn } from "@/lib/utils";

import { BannerUltimoPedido } from "./banner-ultimo-pedido";
import { AdicionarProduto, BarraCarrinho } from "./componentes-carrinho";
import {
  buscarRestaurantePorSlug,
  carregarCardapioDelivery,
  consultarDisponibilidade,
  MENSAGEM_FECHADO,
} from "./dados";

function textoEndereco(e: Record<string, string | null>) {
  const linha1 = [e.rua, e.numero].filter(Boolean).join(", ");
  const linha2 = [e.bairro, e.cidade && e.uf ? `${e.cidade}/${e.uf}` : e.cidade].filter(Boolean).join(" · ");
  return [linha1, linha2].filter(Boolean).join(" — ");
}

export default async function CardapioPage(props: PageProps<"/[slug]">) {
  const { slug } = await props.params;
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) notFound();

  const [cardapio, disponibilidade] = await Promise.all([
    carregarCardapioDelivery(restaurante.id),
    consultarDisponibilidade(restaurante.id),
  ]);
  const endereco = textoEndereco(restaurante.endereco);
  const whatsapp = restaurante.whatsapp?.replace(/\D/g, "");

  return (
    <main className="flex flex-col gap-4 pb-28">
      <section aria-label="Informações" className="flex flex-col gap-3 bg-background p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-3 py-1 text-sm font-semibold",
              disponibilidade.aberto ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800",
            )}
          >
            {disponibilidade.aberto ? "Aberto para pedidos" : "Fechado"}
          </span>
          {restaurante.tempoEstimadoMin ? (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="size-4" aria-hidden />
              Entrega em ~{restaurante.tempoEstimadoMin} min
            </span>
          ) : null}
          {restaurante.pedidoMinimo > 0 ? (
            <span className="text-sm text-muted-foreground">Pedido mínimo {formatarBRL(restaurante.pedidoMinimo)}</span>
          ) : null}
        </div>
        {!disponibilidade.aberto && disponibilidade.motivo ? (
          <p role="status" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
            {MENSAGEM_FECHADO[disponibilidade.motivo]}
          </p>
        ) : null}
        {endereco ? (
          <p className="flex items-start gap-1 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            {endereco}
          </p>
        ) : null}
        {whatsapp ? (
          <a
            href={`https://wa.me/${whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-[var(--cor-primaria-texto)] underline-offset-4 hover:underline"
          >
            <MessageCircle className="size-4" aria-hidden />
            Falar no WhatsApp
          </a>
        ) : null}
        <BannerUltimoPedido restauranteId={restaurante.id} slug={restaurante.slug} />
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
                    {produto.descricao ? (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{produto.descricao}</p>
                    ) : null}
                    <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                      <span className="font-semibold tabular-nums">{formatarBRL(produto.preco)}</span>
                      <AdicionarProduto restauranteId={restaurante.id} produto={produto} />
                    </div>
                  </div>
                  {produto.fotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- foto do Storage do restaurante
                    <img
                      src={produto.fotoUrl}
                      alt={produto.nome}
                      loading="lazy"
                      className="size-24 shrink-0 rounded-lg object-cover"
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <section aria-labelledby="titulo-horarios" className="mx-4 mt-4 rounded-xl bg-background p-4 shadow-sm">
        <h2 id="titulo-horarios" className="mb-2 font-semibold">
          Horários
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {DIAS.map((dia) => {
            const intervalos = restaurante.horarios[dia] ?? [];
            return (
              <div key={dia} className="contents">
                <dt className="text-muted-foreground">{NOME_DIA[dia]}</dt>
                <dd>
                  {intervalos.length === 0
                    ? "Fechado"
                    : intervalos
                        .map((i) => (i.abre === i.fecha ? "24 horas" : `${i.abre} às ${i.fecha}`))
                        .join(" e ")}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      <BarraCarrinho restauranteId={restaurante.id} slug={restaurante.slug} />
    </main>
  );
}
