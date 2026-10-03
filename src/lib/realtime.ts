"use client";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/client";

export type TabelaRealtime = "comandas" | "itens_pedido" | "pagamentos" | "pedidos";
type Evento = "*" | "INSERT" | "UPDATE" | "DELETE";
export type MudancaRealtime = RealtimePostgresChangesPayload<Record<string, unknown>>;

// Inscreve em mudanças das tabelas, filtradas pelo restaurante.
// O canal precisa do token do usuário: sem ele entra como anônimo e a RLS não entrega nada.
export function useMudancasRealtime(
  restauranteId: string,
  tabelas: TabelaRealtime[],
  aoMudar: (mudanca: MudancaRealtime) => void,
  evento: Evento = "*",
) {
  const chave = tabelas.join(",");
  // Callback mais recente sem reinscrever o canal a cada render.
  const callback = useRef(aoMudar);
  useEffect(() => {
    callback.current = aoMudar;
  });

  useEffect(() => {
    const supabase = createClient();
    const canal = supabase.channel(`rt:${restauranteId}:${chave}:${evento}:${Math.random().toString(36).slice(2)}`);
    for (const tabela of chave.split(",")) {
      canal.on(
        "postgres_changes",
        { event: evento, schema: "public", table: tabela, filter: `restaurante_id=eq.${restauranteId}` },
        (mudanca: MudancaRealtime) => callback.current(mudanca),
      );
    }

    let ativo = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      if (data.session) void supabase.realtime.setAuth(data.session.access_token);
      canal.subscribe();
    });
    const { data: escuta } = supabase.auth.onAuthStateChange((_evento, sessao) => {
      if (sessao) void supabase.realtime.setAuth(sessao.access_token);
    });

    return () => {
      ativo = false;
      escuta.subscription.unsubscribe();
      void supabase.removeChannel(canal);
    };
  }, [restauranteId, chave, evento]);
}
