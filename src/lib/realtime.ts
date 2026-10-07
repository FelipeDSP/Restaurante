"use client";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { createClient } from "@/lib/supabase/client";

export type TabelaRealtime =
  | "comandas"
  | "itens_pedido"
  | "pagamentos"
  | "pedidos"
  | "tarefas_producao"
  | "fila_impressao"
  | "caixa_sessoes";
type Evento = "*" | "INSERT" | "UPDATE" | "DELETE";
export type MudancaRealtime = RealtimePostgresChangesPayload<Record<string, unknown>>;

// ---------------------------------------------------------------------------
// Situação dos canais da página: alimenta a faixa "Sem conexão".
// Um canal só conta como caído depois de ter falhado (entrar ainda não é queda).
// ---------------------------------------------------------------------------

const canaisCaidos = new Set<string>();
const ouvintesSituacao = new Set<() => void>();

function marcarCanal(id: string, caido: boolean) {
  const antes = canaisCaidos.size;
  if (caido) canaisCaidos.add(id);
  else canaisCaidos.delete(id);
  if (canaisCaidos.size !== antes) ouvintesSituacao.forEach((ouvir) => ouvir());
}

export function useTempoRealCaido(): boolean {
  return useSyncExternalStore(
    (ouvir) => {
      ouvintesSituacao.add(ouvir);
      return () => ouvintesSituacao.delete(ouvir);
    },
    () => canaisCaidos.size > 0,
    () => false,
  );
}

// Inscreve em mudanças das tabelas, filtradas pelo restaurante.
// O canal precisa do token do usuário: sem ele entra como anônimo e a RLS não entrega nada.
// `aoReconectar` roda quando o canal volta depois de cair: eventos da queda se perderam,
// então quem usa deve recarregar os dados.
export function useMudancasRealtime(
  restauranteId: string,
  tabelas: TabelaRealtime[],
  aoMudar: (mudanca: MudancaRealtime) => void,
  evento: Evento = "*",
  aoReconectar?: () => void,
) {
  const chave = tabelas.join(",");
  // Callbacks mais recentes sem reinscrever o canal a cada render.
  const callback = useRef(aoMudar);
  const reconectou = useRef(aoReconectar);
  useEffect(() => {
    callback.current = aoMudar;
    reconectou.current = aoReconectar;
  });

  useEffect(() => {
    const supabase = createClient();
    const nome = `rt:${restauranteId}:${chave}:${evento}:${Math.random().toString(36).slice(2)}`;
    const canal = supabase.channel(nome);
    for (const tabela of chave.split(",")) {
      canal.on(
        "postgres_changes",
        { event: evento, schema: "public", table: tabela, filter: `restaurante_id=eq.${restauranteId}` },
        (mudanca: MudancaRealtime) => callback.current(mudanca),
      );
    }

    let ativo = true;
    let caiu = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      if (data.session) void supabase.realtime.setAuth(data.session.access_token);
      // O cliente do Supabase tenta entrar de novo sozinho depois de uma queda.
      canal.subscribe((situacao) => {
        if (!ativo) return;
        if (situacao === "SUBSCRIBED") {
          marcarCanal(nome, false);
          if (caiu) reconectou.current?.();
          caiu = false;
        } else {
          caiu = true;
          marcarCanal(nome, true);
        }
      });
    });
    const { data: escuta } = supabase.auth.onAuthStateChange((_evento, sessao) => {
      if (sessao) void supabase.realtime.setAuth(sessao.access_token);
    });

    return () => {
      ativo = false;
      marcarCanal(nome, false);
      escuta.subscription.unsubscribe();
      void supabase.removeChannel(canal);
    };
  }, [restauranteId, chave, evento]);
}
