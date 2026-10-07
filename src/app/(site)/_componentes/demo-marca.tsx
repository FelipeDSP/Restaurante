"use client";

import { Clock, MapPin } from "lucide-react";
import { useState } from "react";

import { corDeContraste } from "@/lib/cores";
import { cn } from "@/lib/utils";

// Restaurantes fictícios só para demonstrar o white label.
const EXEMPLOS = [
  { nome: "Brasa do Bairro", slug: "brasa-do-bairro", cor: "#b91c1c", destaque: "#fbbf24", inicial: "B", item: "Espeto de alcatra", preco: "R$ 12,00" },
  { nome: "Smash da Esquina", slug: "smash-da-esquina", cor: "#1d4ed8", destaque: "#facc15", inicial: "S", item: "Smash duplo", preco: "R$ 29,00" },
  { nome: "Quintal Espetaria", slug: "quintal-espetaria", cor: "#166534", destaque: "#f97316", inicial: "Q", item: "Espeto misto", preco: "R$ 14,00" },
  { nome: "Lanche da Vó", slug: "lanche-da-vo", cor: "#9d174d", destaque: "#fde68a", inicial: "L", item: "X-tudo da casa", preco: "R$ 26,00" },
];

export function DemoMarca() {
  const [ativo, setAtivo] = useState(EXEMPLOS[0]);
  const contraste = corDeContraste(ativo.cor);

  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1fr_auto]">
      <div className="flex flex-col gap-5">
        <p className="text-sm font-extrabold text-uau-marrom-claro">Experimente: escolha um restaurante</p>
        <div role="radiogroup" aria-label="Restaurante de exemplo" className="flex flex-wrap gap-3">
          {EXEMPLOS.map((e) => (
            <button
              key={e.slug}
              type="button"
              role="radio"
              aria-checked={ativo.slug === e.slug}
              onClick={() => setAtivo(e)}
              className={cn(
                "flex items-center gap-2.5 rounded-full border-2 bg-uau-papel py-1.5 pr-4 pl-1.5 text-sm font-extrabold transition-all",
                ativo.slug === e.slug
                  ? "border-uau-marrom shadow-[0_4px_0_0_var(--color-uau-marrom)]"
                  : "border-uau-borda hover:border-uau-marrom/40",
              )}
            >
              <span className="size-7 rounded-full" style={{ backgroundColor: e.cor }} aria-hidden />
              {e.nome}
            </button>
          ))}
        </div>
        <p className="max-w-lg text-[15px] leading-relaxed text-uau-marrom-claro">
          Logo, cores e nome são do restaurante, no site de delivery, no app do garçom e até no ícone instalado no
          celular. A uau foods fica nos bastidores.
        </p>
      </div>

      {/* Celular com o site do restaurante escolhido */}
      <div
        aria-live="polite"
        aria-label={`Site de delivery de exemplo: ${ativo.nome}`}
        className="mx-auto w-[290px] rounded-[2.6rem] border-[7px] border-uau-marrom bg-uau-marrom shadow-[0_30px_60px_-20px_rgb(43_26_18/0.55)]"
      >
        <div className="overflow-hidden rounded-[2rem] bg-[#f6f3ef]">
          <div className="flex items-center gap-1.5 bg-white px-4 pt-3 pb-2 text-[11px] text-neutral-500">
            <span className="size-1.5 rounded-full bg-neutral-300" aria-hidden />
            <span className="truncate font-semibold">/{ativo.slug}</span>
          </div>
          <div className="flex items-center gap-2.5 px-4 py-3.5 transition-colors duration-500" style={{ backgroundColor: ativo.cor, color: contraste }}>
            <span
              className="flex size-9 items-center justify-center rounded-lg text-base font-black transition-colors duration-500"
              style={{ backgroundColor: ativo.destaque, color: corDeContraste(ativo.destaque) }}
            >
              {ativo.inicial}
            </span>
            <span className="text-[15px] font-black">{ativo.nome}</span>
          </div>
          <div className="flex flex-col gap-2.5 p-3.5">
            <div className="flex flex-col gap-1.5 rounded-xl bg-white p-3 text-[11px] font-semibold text-neutral-600 shadow-sm">
              <span className="w-fit rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-800">Aberto para pedidos</span>
              <span className="flex items-center gap-1">
                <Clock className="size-3" aria-hidden /> Entrega em ~40 min
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="size-3" aria-hidden /> Pague na entrega: Pix, cartão ou dinheiro
              </span>
            </div>
            <p className="px-1 pt-1 text-sm font-black text-neutral-900">Mais pedidos</p>
            {[ativo.item, "Refrigerante lata"].map((nome, i) => (
              <div key={nome} className="flex items-center justify-between gap-2 rounded-xl bg-white p-3 shadow-sm">
                <span className="flex flex-col">
                  <span className="text-[13px] font-bold text-neutral-900">{nome}</span>
                  <span className="text-xs font-semibold text-neutral-600">{i === 0 ? ativo.preco : "R$ 6,00"}</span>
                </span>
                <span
                  className="rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors duration-500"
                  style={{ backgroundColor: ativo.cor, color: contraste }}
                >
                  + Adicionar
                </span>
              </div>
            ))}
            <div
              className="mt-1 rounded-xl px-4 py-3 text-center text-[13px] font-black transition-colors duration-500"
              style={{ backgroundColor: ativo.cor, color: contraste }}
            >
              Ver carrinho · 2 itens
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
