import { Check } from "lucide-react";

import { BotaoPrincipal, BotaoSecundario, LinhasVelocidade, Ticket } from "./marca";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Grão de papel bem sutil no fundo. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] mix-blend-multiply"
        style={{
          backgroundImage:
            "radial-gradient(rgb(43 26 18 / 0.08) 1px, transparent 1px), radial-gradient(rgb(245 150 0 / 0.08) 1px, transparent 1px)",
          backgroundSize: "22px 22px, 31px 31px",
          backgroundPosition: "0 0, 11px 7px",
        }}
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pt-14 pb-20 md:pt-20 lg:grid-cols-[1.15fr_1fr] lg:pb-28">
        <div className="flex flex-col items-start gap-7">
          <p className="inline-flex items-center gap-2 rounded-full border border-uau-borda bg-uau-papel px-4 py-1.5 text-sm font-bold text-uau-marrom-claro">
            <span className="size-2 rounded-full bg-uau-laranja" aria-hidden />
            Para espetinhos, hamburguerias e lanchonetes
          </p>
          <h1 className="text-[2.75rem] leading-[1.02] font-black tracking-[-0.02em] text-balance sm:text-6xl lg:text-[4.25rem]">
            Da mesa ao caixa,{" "}
            <span className="relative inline-block pl-[0.95em] whitespace-nowrap">
              <LinhasVelocidade className="absolute top-1/2 left-[0.05em] h-[0.42em] w-[0.72em] -translate-y-1/2" animar />
              sem papel
            </span>{" "}
            e sem comissão.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-uau-marrom-claro sm:text-xl">
            Comanda no celular do garçom, delivery com a sua marca e caixa que fecha certo no fim da noite. Tudo num
            sistema só, simples de usar no meio do movimento.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <BotaoPrincipal href="/cadastro" tamanho="lg">
              Testar grátis por 14 dias
            </BotaoPrincipal>
            <BotaoSecundario href="#como-funciona">Ver como funciona</BotaoSecundario>
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold text-uau-marrom-claro">
            {["Sem cartão de crédito", "Comece a usar hoje", "Sem comissão por pedido"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check className="size-4 text-uau-laranja-escuro" aria-hidden strokeWidth={3} />
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Composição: o garçom envia, a comanda "sai" com as linhas de velocidade. */}
        <div className="relative mx-auto w-full max-w-[400px] lg:mr-0" aria-label="Exemplo de comanda da mesa 7" role="img">
          <div className="absolute top-10 -left-6 z-20 flex items-center gap-3 rounded-2xl bg-uau-marrom px-4 py-3 text-uau-creme shadow-xl sm:-left-14">
            <span className="flex size-9 items-center justify-center rounded-full bg-uau-laranja text-uau-marrom">
              <Check className="size-5" strokeWidth={3} aria-hidden />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-extrabold">Mesa 7 · enviado</span>
              <span className="text-xs text-uau-creme/70">pelo garçom, há 3 s</span>
            </span>
          </div>
          <LinhasVelocidade className="absolute top-[46%] -left-20 z-0 hidden h-16 w-28 sm:flex" animar />
          <div className="animar-ticket relative z-10 ml-auto w-[88%] rotate-[2.5deg]">
            <Ticket
              titulo="COMANDA"
              subtitulo="Mesa 7 · 4 pessoas · 20:14"
              linhas={[
                { qtd: "3x", nome: "Espeto de alcatra", obs: "bem passado", valor: "36,00" },
                { qtd: "2x", nome: "Pão de alho", valor: "14,00" },
                { qtd: "1x", nome: "Burger da casa", obs: "sem cebola", valor: "32,00" },
                { qtd: "4x", nome: "Refrigerante lata", valor: "24,00" },
              ]}
              total="R$ 106,00"
              rodape="Pix 50,00 · Dinheiro 56,00 · troco 4,00"
            />
          </div>
          <div className="absolute -right-3 -bottom-6 z-20 rotate-[-4deg] rounded-xl border-2 border-uau-marrom bg-uau-laranja px-3 py-1.5 text-sm font-black text-uau-marrom shadow-[0_4px_0_0_var(--color-uau-marrom)]">
            Conta fechada!
          </div>
        </div>
      </div>
    </section>
  );
}
