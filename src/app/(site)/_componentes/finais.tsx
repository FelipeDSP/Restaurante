import { Check, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { DemoMarca } from "./demo-marca";
import { TituloSecao } from "./funcionalidades";
import { BotaoPrincipal, LinhasVelocidade } from "./marca";
import { DIAS_TESTE_GRATIS, PLANOS } from "./planos";

export function SuaMarca() {
  return (
    <section id="sua-marca" className="scroll-mt-20 bg-uau-papel py-24">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-5">
        <TituloSecao
          olho="Sua marca, não a nossa"
          titulo="Seu cliente pede para o seu restaurante. Não para um aplicativo."
          texto="Nada de vitrine dividida com o concorrente ao lado. O link é seu, o cardápio é seu, o cliente é seu."
        />
        <DemoMarca />
      </div>
    </section>
  );
}

const EM_BREVE = [
  { titulo: "Impressão por praça", texto: "O espeto sai na churrasqueira, o burger na chapa, a bebida no bar. Automaticamente." },
  { titulo: "Adicionais e opções", texto: "Ponto da carne, tamanhos e adicionais com preço, como +bacon, direto no pedido." },
  { titulo: "Pagamento online", texto: "Pix e cartão no site de delivery, com o dinheiro caindo na sua conta." },
];

export function EmBreve() {
  return (
    <section aria-labelledby="titulo-em-breve" className="py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="relative overflow-hidden rounded-[2rem] border-2 border-dashed border-uau-marrom/25 p-8 sm:p-10">
          <h2 id="titulo-em-breve" className="flex items-center gap-3 text-2xl font-black">
            <span className="rounded-full bg-uau-marrom px-3 py-1 font-ticket text-xs font-semibold tracking-widest text-uau-laranja uppercase">
              Na cozinha
            </span>
            O que vem por aí
          </h2>
          <ul className="mt-8 grid gap-6 md:grid-cols-3">
            {EM_BREVE.map((e) => (
              <li key={e.titulo} className="flex flex-col gap-2">
                <p className="text-lg font-black">{e.titulo}</p>
                <p className="text-[15px] leading-relaxed text-uau-marrom-claro">{e.texto}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function Planos() {
  return (
    <section id="planos" className="scroll-mt-20 bg-uau-marrom py-24 text-uau-creme">
      <div className="mx-auto flex max-w-6xl flex-col gap-14 px-5">
        <div className="flex max-w-2xl flex-col gap-4">
          <p className="flex items-center gap-3 text-sm font-extrabold tracking-[0.18em] text-uau-laranja uppercase">
            <LinhasVelocidade className="h-3 w-7" />
            Planos
          </p>
          <h2 className="text-4xl leading-[1.05] font-black tracking-[-0.02em] text-balance sm:text-5xl">
            Mensalidade fixa. Zero comissão por pedido.
          </h2>
          <p className="text-lg leading-relaxed text-uau-creme/75">
            Teste tudo por {DIAS_TESTE_GRATIS} dias, sem cartão de crédito. Vendeu mais? O preço continua o mesmo.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {PLANOS.map((p) => (
            <article
              key={p.id}
              className={cn(
                "relative flex flex-col gap-6 rounded-[2rem] p-8",
                p.destaque ? "bg-uau-laranja text-uau-marrom" : "border-2 border-uau-creme/15 bg-uau-creme/5",
              )}
            >
              {p.destaque ? (
                <span className="absolute -top-3 right-8 rounded-full bg-uau-creme px-3 py-1 text-xs font-black text-uau-marrom">
                  Mais completo
                </span>
              ) : null}
              <div>
                <h3 className="text-3xl font-black">{p.nome}</h3>
                <p className={cn("mt-1 font-semibold", p.destaque ? "text-uau-marrom/75" : "text-uau-creme/70")}>{p.paraQuem}</p>
              </div>
              <p className="text-xl font-black">
                {p.precoMensal === null
                  ? "Preço de lançamento em breve"
                  : `R$ ${(p.precoMensal / 100).toFixed(2).replace(".", ",")}/mês`}
              </p>
              <ul className="flex flex-col gap-3">
                {p.itens.map((i) => (
                  <li key={i} className="flex items-start gap-2.5 font-semibold">
                    <Check className={cn("mt-0.5 size-5 shrink-0", p.destaque ? "text-uau-marrom" : "text-uau-laranja")} strokeWidth={3} aria-hidden />
                    {i}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-2">
                {p.destaque ? (
                  <Link
                    href="/cadastro"
                    className="inline-flex h-12 w-full items-center justify-center rounded-full bg-uau-marrom px-6 font-extrabold text-uau-creme transition-transform hover:-translate-y-0.5 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-uau-marrom"
                  >
                    Testar grátis
                  </Link>
                ) : (
                  <BotaoPrincipal href="/cadastro" className="w-full">
                    Testar grátis
                  </BotaoPrincipal>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const DUVIDAS = [
  {
    p: "Preciso comprar computador ou máquina especial?",
    r: "Não. O garçom usa o próprio celular e o caixa funciona em qualquer computador, notebook ou tablet com navegador.",
  },
  {
    p: "Vocês cobram comissão sobre os pedidos?",
    r: "Não. Você paga uma mensalidade fixa. O que o seu delivery vender é todo seu.",
  },
  {
    p: "Como o meu cliente faz um pedido de delivery?",
    r: "Pelo link do seu restaurante, com a sua marca. Ele monta o carrinho, escolhe o bairro e paga na entrega, em Pix, cartão ou dinheiro com troco. Depois acompanha o status pela mesma página.",
  },
  {
    p: "Preciso instalar algum aplicativo?",
    r: "Não. Tudo abre no navegador. No celular do garçom dá para adicionar à tela inicial, e o ícone fica com a marca do seu restaurante.",
  },
  {
    p: "Funciona sem internet?",
    r: "Precisa de internet para o garçom, o caixa e o delivery conversarem em tempo real. Recomendamos ter um 4G de reserva no salão.",
  },
  {
    p: "Emite nota fiscal (NFC-e)?",
    r: "Ainda não. Por enquanto a uau foods cuida do salão, do delivery e do caixa; a emissão de nota continua no seu sistema atual.",
  },
  {
    p: "Como funciona o teste grátis?",
    r: `São ${DIAS_TESTE_GRATIS} dias com tudo liberado, sem pedir cartão. Você cadastra o restaurante, monta o cardápio e já pode usar na mesma noite.`,
  },
];

export function Duvidas() {
  return (
    <section id="duvidas" className="scroll-mt-20 py-24">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 lg:grid-cols-[1fr_1.4fr]">
        <TituloSecao olho="Dúvidas" titulo="Perguntas de quem vive a correria do salão." texto="Não achou a sua? Comece o teste grátis e veja na prática." />
        <div className="flex flex-col gap-3">
          {DUVIDAS.map((d) => (
            <details key={d.p} className="group rounded-2xl border-2 border-uau-borda bg-uau-papel open:border-uau-marrom/30">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-lg font-extrabold [&::-webkit-details-marker]:hidden">
                {d.p}
                <Plus className="size-5 shrink-0 text-uau-laranja-escuro transition-transform group-open:rotate-45" strokeWidth={3} aria-hidden />
              </summary>
              <p className="px-5 pb-5 text-[15px] leading-relaxed text-uau-marrom-claro">{d.r}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ChamadaFinal() {
  return (
    <section className="px-5 pb-24">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] bg-uau-marrom px-8 py-16 text-uau-creme sm:px-14 sm:py-20">
        {/* O U da logo, enorme, saindo do quadro. */}
        <Image
          src="/marca/uau-icone.png"
          alt=""
          width={1072}
          height={934}
          className="pointer-events-none absolute -right-16 -bottom-24 w-[420px] opacity-[0.08] brightness-0 invert sm:w-[520px]"
        />
        <div className="relative flex max-w-xl flex-col items-start gap-6">
          <h2 className="text-4xl leading-[1.05] font-black tracking-[-0.02em] text-balance sm:text-6xl">
            Seu restaurante rodando hoje à noite.
          </h2>
          <p className="text-lg text-uau-creme/75">
            Cadastre, monte o cardápio e chame a equipe. Em {DIAS_TESTE_GRATIS} dias você decide se fica.
          </p>
          <BotaoPrincipal href="/cadastro" tamanho="lg" className="shadow-[0_5px_0_0_#000]">
            Começar o teste grátis
          </BotaoPrincipal>
        </div>
      </div>
    </section>
  );
}

export function Rodape() {
  return (
    <footer className="border-t border-uau-borda bg-uau-papel">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 sm:flex-row sm:items-center sm:justify-between">
        <Image src="/marca/uau-foods.png" alt="uau foods" width={1024} height={351} className="h-8 w-auto" />
        <nav aria-label="Rodapé" className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold text-uau-marrom-claro">
          <a href="#funcionalidades" className="hover:text-uau-marrom">Funcionalidades</a>
          <a href="#planos" className="hover:text-uau-marrom">Planos</a>
          <a href="#duvidas" className="hover:text-uau-marrom">Dúvidas</a>
          <Link href="/login" className="hover:text-uau-marrom">Entrar</Link>
        </nav>
        <p className="text-sm font-semibold text-uau-marrom-claro">© {new Date().getFullYear()} uau foods</p>
      </div>
    </footer>
  );
}
