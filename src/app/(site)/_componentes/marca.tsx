import Link from "next/link";

import { cn } from "@/lib/utils";

// As três "linhas de velocidade" do U da logo: o traço gráfico que se repete pelo site.
export function LinhasVelocidade({
  className,
  cor = "bg-uau-laranja",
  animar = false,
}: {
  className?: string;
  cor?: string;
  animar?: boolean;
}) {
  const linhas = [
    { largura: "w-[72%]", atraso: "0ms" },
    { largura: "w-full", atraso: "90ms" },
    { largura: "w-[84%]", atraso: "180ms" },
  ];
  return (
    <span aria-hidden className={cn("flex flex-col items-end gap-[18%]", className)}>
      {linhas.map((l) => (
        <span
          key={l.atraso}
          className={cn("block h-[22%] rounded-full", l.largura, cor, animar && "animar-linha")}
          style={animar ? { animationDelay: l.atraso } : undefined}
        />
      ))}
    </span>
  );
}

// Botão "adesivo": sombra dura marrom, afunda ao clicar. Texto marrom sobre laranja (contraste AA).
const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-extrabold transition-[transform,box-shadow] duration-150 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-uau-laranja";

export function BotaoPrincipal({
  href,
  children,
  className,
  tamanho = "md",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  tamanho?: "md" | "lg";
}) {
  return (
    <Link
      href={href}
      className={cn(
        base,
        "bg-uau-laranja text-uau-marrom shadow-[0_5px_0_0_var(--color-uau-marrom)] hover:-translate-y-0.5 hover:shadow-[0_7px_0_0_var(--color-uau-marrom)] active:translate-y-1 active:shadow-[0_1px_0_0_var(--color-uau-marrom)]",
        tamanho === "lg" ? "h-14 px-8 text-lg" : "h-12 px-6 text-base",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function BotaoSecundario({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(base, "h-12 border-2 border-current px-6 text-base hover:bg-uau-marrom/5", className)}
    >
      {children}
    </Link>
  );
}

// Ticket de papel térmico: a peça de identidade do site.
export function Ticket({
  titulo,
  subtitulo,
  linhas,
  total,
  rodape,
  className,
}: {
  titulo: string;
  subtitulo: string;
  linhas: { qtd: string; nome: string; obs?: string; valor: string }[];
  total: string;
  rodape: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "ticket-serrilhado bg-uau-papel px-6 pt-7 pb-8 font-ticket text-[13px] leading-relaxed text-uau-marrom",
        "shadow-[0_24px_40px_-18px_rgb(43_26_18/0.45)]",
        className,
      )}
    >
      <p className="text-center text-xs font-semibold tracking-[0.25em]">{titulo}</p>
      <p className="text-center text-xs text-uau-marrom-claro">{subtitulo}</p>
      <p aria-hidden className="my-3 overflow-hidden whitespace-nowrap text-uau-marrom/40">
        {"- ".repeat(40)}
      </p>
      <ul className="flex flex-col gap-1.5">
        {linhas.map((l) => (
          <li key={l.nome}>
            <div className="flex justify-between gap-3">
              <span>
                <span className="font-semibold">{l.qtd}</span> {l.nome}
              </span>
              <span className="tabular-nums">{l.valor}</span>
            </div>
            {l.obs ? <p className="pl-6 text-uau-laranja-escuro">&gt; {l.obs}</p> : null}
          </li>
        ))}
      </ul>
      <p aria-hidden className="my-3 overflow-hidden whitespace-nowrap text-uau-marrom/40">
        {"- ".repeat(40)}
      </p>
      <div className="flex justify-between text-sm font-semibold">
        <span>TOTAL</span>
        <span className="tabular-nums">{total}</span>
      </div>
      <p className="mt-3 text-center text-xs text-uau-marrom-claro">{rodape}</p>
    </div>
  );
}
