"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

// Numa tela de parede ninguém rola: com 70 tickets o cozinheiro via 12 e não sabia que havia 58
// embaixo. Esta faixa só aparece quando sobrou ticket fora da vista, diz quantos são e leva até
// eles num toque. Não esconde nada — só conta o que a dobra escondeu.
export function MaisAbaixo({ seletor }: { seletor: string }) {
  const [escondidos, setEscondidos] = useState(0);

  useEffect(() => {
    const contar = () => {
      const cartoes = [...document.querySelectorAll(seletor)];
      const altura = window.innerHeight;
      setEscondidos(cartoes.filter((c) => c.getBoundingClientRect().top >= altura).length);
    };
    contar();
    const observador = new ResizeObserver(contar);
    observador.observe(document.body);
    window.addEventListener("scroll", contar, { passive: true });
    window.addEventListener("resize", contar);
    return () => {
      observador.disconnect();
      window.removeEventListener("scroll", contar);
      window.removeEventListener("resize", contar);
    };
  }, [seletor]);

  if (escondidos === 0) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollBy({ top: window.innerHeight * 0.8, behavior: "smooth" })}
      className="fixed inset-x-0 bottom-0 z-20 flex min-h-14 items-center justify-center gap-2 border-t-2 border-amber-400 bg-amber-100 text-lg font-bold text-amber-950 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] print:hidden"
    >
      <ChevronDown className="size-6" aria-hidden />
      Mais {escondidos} {escondidos === 1 ? "pedido" : "pedidos"} abaixo
    </button>
  );
}
