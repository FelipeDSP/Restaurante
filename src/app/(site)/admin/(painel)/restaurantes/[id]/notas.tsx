"use client";

import { useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";

import { anotar } from "../../../actions";

// Nova anotação interna (ligações, combinados, problemas). O restaurante nunca vê.
export function NovaNota({ restauranteId }: { restauranteId: string }) {
  const [texto, setTexto] = useState("");
  const { executar, pendente } = useAcao();
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Ex.: liguei para o dono em 29/10, quer ajuda para cadastrar o cardápio"
        aria-label="Nova anotação"
        className="w-full rounded-xl border border-black/10 bg-[#f6f1ea]/60 p-3 text-sm outline-none focus:border-uau-laranja focus:ring-2 focus:ring-uau-laranja/30"
      />
      <button
        type="button"
        disabled={pendente || !texto.trim()}
        onClick={() => executar(() => anotar(restauranteId, texto), () => setTexto(""))}
        className="h-10 self-end rounded-xl bg-uau-marrom px-4 text-sm font-bold text-uau-creme hover:opacity-90 disabled:opacity-50"
      >
        Salvar anotação
      </button>
    </div>
  );
}
