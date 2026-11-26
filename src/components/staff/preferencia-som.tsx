"use client";

import { useEffect } from "react";

import type { Avisos } from "@/lib/avisos";
import { definirAvisos, definirPreferenciaDeSom, type PreferenciaDeSom } from "@/lib/som";

// Aplica as escolhas da pessoa (Meu perfil > Notificações) a todos os avisos desta tela: o toque
// e, por aviso, se ela quer receber e se deve vibrar.
export function PreferenciaSom({ preferencia, avisos }: { preferencia: PreferenciaDeSom; avisos: Avisos }) {
  const { volume } = preferencia;
  useEffect(() => {
    definirPreferenciaDeSom({ volume });
  }, [volume]);
  // Objeto novo a cada render do servidor: compara pelo conteúdo, não pela identidade.
  const assinatura = JSON.stringify(avisos);
  useEffect(() => {
    definirAvisos(JSON.parse(assinatura) as Avisos);
  }, [assinatura]);
  return null;
}
