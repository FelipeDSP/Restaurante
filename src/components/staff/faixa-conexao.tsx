"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

import { useOnline } from "@/lib/conexao";
import { useTempoRealCaido } from "@/lib/realtime";

const ATRASO_MS = 4000;

// Faixa fixa quando o aparelho está sem internet ou o tempo real caiu.
// Espera alguns segundos antes de aparecer para não piscar em oscilações curtas.
export function FaixaConexao() {
  const online = useOnline();
  const caido = useTempoRealCaido();
  const problema = !online || caido;
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (!problema) return;
    const t = setTimeout(() => setVisivel(true), ATRASO_MS);
    return () => {
      clearTimeout(t);
      setVisivel(false);
    };
  }, [problema]);

  if (!problema || !visivel) return null;
  return (
    <div
      role="alert"
      className="flex items-center justify-center gap-2 bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-amber-950 print:hidden"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      {online
        ? "Conexão instável: reconectando… Pedidos novos podem demorar a aparecer."
        : "Sem internet. Pedidos novos não estão chegando nesta tela."}
    </div>
  );
}
