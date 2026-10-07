import { Bike, ConciergeBell, ReceiptText } from "lucide-react";

import { cn } from "@/lib/utils";

import { LinhasVelocidade } from "./marca";

function Titulo({ olho, titulo, texto }: { olho: string; titulo: string; texto: string }) {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <p className="flex items-center gap-3 text-sm font-extrabold tracking-[0.18em] text-uau-laranja-escuro uppercase">
        <LinhasVelocidade className="h-3 w-7" />
        {olho}
      </p>
      <h2 className="text-4xl leading-[1.05] font-black tracking-[-0.02em] text-balance sm:text-5xl">{titulo}</h2>
      <p className="text-lg leading-relaxed text-uau-marrom-claro">{texto}</p>
    </div>
  );
}
export { Titulo as TituloSecao };

// Mini mapa de mesas (ilustração do app do garçom).
function MiniMapa() {
  const mesas = [
    { n: "1", s: "livre" },
    { n: "2", s: "ocupada" },
    { n: "3", s: "ocupada" },
    { n: "4", s: "conta" },
    { n: "5", s: "livre" },
    { n: "6", s: "ocupada" },
    { n: "7", s: "ocupada" },
    { n: "8", s: "livre" },
    { n: "9", s: "livre" },
  ];
  return (
    <div aria-hidden className="mx-auto w-full max-w-[230px] rounded-[28px] border-[6px] border-uau-creme/20 bg-uau-papel p-3 text-uau-marrom shadow-lg">
      <div className="mb-2 flex items-center justify-between text-[11px] font-extrabold">
        <span>Mesas</span>
        <span className="text-uau-marrom-claro">5 de 9 ocupadas</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {mesas.map((m) => (
          <div
            key={m.n}
            className={cn(
              "flex aspect-square flex-col justify-between rounded-lg border-2 p-1.5 text-[10px] font-bold",
              m.s === "livre" && "border-uau-borda bg-white text-uau-marrom-claro",
              m.s === "ocupada" && "border-uau-marrom bg-uau-marrom text-uau-creme",
              m.s === "conta" && "border-uau-laranja bg-uau-laranja text-uau-marrom",
            )}
          >
            <span className="text-base leading-none font-black">{m.n}</span>
            <span>{m.s === "livre" ? "Livre" : m.s === "conta" ? "Conta" : "Ocupada"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniCaixa() {
  const formas = [
    { nome: "Pix", valor: "R$ 1.128", pct: 58 },
    { nome: "Crédito", valor: "R$ 512", pct: 26 },
    { nome: "Dinheiro", valor: "R$ 310", pct: 16 },
  ];
  return (
    <div aria-hidden className="w-full rounded-2xl border-2 border-uau-borda bg-uau-papel p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-extrabold text-uau-marrom-claro uppercase">Recebido na noite</span>
        <span className="text-xs font-bold text-uau-marrom-claro">exemplo</span>
      </div>
      <p className="mt-1 text-3xl font-black tabular-nums">R$ 1.950</p>
      <ul className="mt-3 flex flex-col gap-2">
        {formas.map((f) => (
          <li key={f.nome} className="text-xs font-bold">
            <div className="mb-1 flex justify-between">
              <span>{f.nome}</span>
              <span className="tabular-nums">{f.valor}</span>
            </div>
            <div className="h-2 rounded-full bg-uau-borda/60">
              <div className="h-2 rounded-full bg-uau-laranja" style={{ width: `${f.pct}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MiniDelivery() {
  return (
    <div aria-hidden className="w-full overflow-hidden rounded-2xl border-2 border-uau-borda bg-uau-papel">
      <div className="flex items-center gap-2 bg-uau-marrom-claro px-3 py-2.5 text-uau-creme">
        <span className="flex size-6 items-center justify-center rounded-md bg-uau-laranja text-xs font-black text-uau-marrom">S</span>
        <span className="text-xs font-extrabold">Seu Restaurante</span>
      </div>
      <div className="flex flex-col gap-2 p-3">
        {[
          ["Burger da casa", "R$ 32"],
          ["Batata rústica", "R$ 18"],
        ].map(([n, p]) => (
          <div key={n} className="flex items-center justify-between rounded-lg bg-white p-2 text-xs font-bold shadow-sm">
            <span>
              {n}
              <span className="block font-semibold text-uau-marrom-claro">{p}</span>
            </span>
            <span className="rounded-full bg-uau-marrom-claro px-2 py-1 text-[10px] text-uau-creme">+ Adicionar</span>
          </div>
        ))}
        <div className="rounded-lg bg-uau-marrom-claro px-3 py-2 text-center text-[11px] font-extrabold text-uau-creme">
          Ver carrinho · R$ 50
        </div>
      </div>
    </div>
  );
}

export function Funcionalidades() {
  return (
    <section id="funcionalidades" className="scroll-mt-20 bg-uau-papel py-24">
      <div className="mx-auto flex max-w-6xl flex-col gap-14 px-5">
        <Titulo
          olho="Três telas, um restaurante"
          titulo="Cada um vê só o que precisa. Tudo conversa em tempo real."
          texto="O garçom não espera o caixa, o caixa não persegue comanda de papel e o cliente do delivery acompanha o pedido sozinho."
        />
        <div className="grid gap-5 lg:grid-cols-12">
          <article className="relative flex flex-col gap-8 overflow-hidden rounded-[2rem] bg-uau-marrom p-8 text-uau-creme lg:col-span-7 lg:flex-row lg:items-center">
            <div className="flex flex-1 flex-col gap-4">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-uau-laranja text-uau-marrom">
                <ConciergeBell className="size-6" aria-hidden />
              </span>
              <h3 className="text-3xl font-black">Garçom no celular</h3>
              <ul className="flex flex-col gap-2.5 text-[15px] leading-snug text-uau-creme/85">
                <li>Mapa de mesas com quem está livre, ocupado ou pedindo a conta.</li>
                <li>Lança itens com observação em poucos toques, com uma mão só.</li>
                <li>Divide a conta em várias formas e calcula o troco.</li>
              </ul>
            </div>
            <MiniMapa />
          </article>

          <article className="flex flex-col gap-6 rounded-[2rem] border-2 border-uau-borda bg-uau-creme p-8 lg:col-span-5">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-uau-marrom text-uau-laranja">
              <ReceiptText className="size-6" aria-hidden />
            </span>
            <h3 className="text-3xl font-black">Caixa que fecha certo</h3>
            <p className="text-[15px] leading-snug text-uau-marrom-claro">
              Abra com o troco, acompanhe as comandas ao vivo e feche a noite sabendo exatamente o que entrou em cada
              forma de pagamento e quem recebeu.
            </p>
            <MiniCaixa />
          </article>

          <article className="flex flex-col gap-6 rounded-[2rem] border-2 border-uau-borda bg-uau-creme p-8 lg:col-span-5">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-uau-marrom text-uau-laranja">
              <Bike className="size-6" aria-hidden />
            </span>
            <h3 className="text-3xl font-black">Delivery próprio</h3>
            <p className="text-[15px] leading-snug text-uau-marrom-claro">
              Um site com o seu cardápio, as suas cores e o seu link. O pedido chega no painel com alerta sonoro e o
              cliente acompanha cada etapa. Sem comissão por pedido.
            </p>
            <MiniDelivery />
          </article>

          <article className="flex flex-col justify-between gap-6 rounded-[2rem] bg-uau-laranja p-8 text-uau-marrom lg:col-span-7">
            <h3 className="text-3xl leading-tight font-black text-balance">
              Cardápio, mesas, bairros e equipe: você configura tudo sozinho, sem ligar para ninguém.
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ["Cardápio com fotos", "Categorias, preços e o que sai no delivery"],
                ["Bairros e taxas", "Horários, pedido mínimo e tempo de entrega"],
                ["Equipe com papéis", "Dono, caixa e garçom, cada um com seu acesso"],
              ].map(([t, d]) => (
                <div key={t} className="rounded-2xl bg-uau-marrom/8 p-4">
                  <p className="font-black">{t}</p>
                  <p className="mt-1 text-sm font-semibold text-uau-marrom/75">{d}</p>
                </div>
              ))}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
