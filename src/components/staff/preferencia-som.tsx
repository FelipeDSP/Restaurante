"use client";

import { useEffect } from "react";

import { definirPreferenciaDeSom, type PreferenciaDeSom } from "@/lib/som";

// Aplica o som escolhido pela pessoa (Meu perfil) a todos os avisos desta tela.
export function PreferenciaSom({ preferencia }: { preferencia: PreferenciaDeSom }) {
  const { som, volume, vezes } = preferencia;
  useEffect(() => {
    definirPreferenciaDeSom({ som, volume, vezes });
  }, [som, volume, vezes]);
  return null;
}
