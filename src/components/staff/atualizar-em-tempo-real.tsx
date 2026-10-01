"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";

type Tabela = "comandas" | "itens_pedido" | "pagamentos" | "pedidos";

// Escuta mudanças do restaurante e recarrega os dados da página (Server Components).
// A RLS vale no Realtime: só chegam eventos de linhas que o usuário pode ler.
export function AtualizarEmTempoReal({ restauranteId, tabelas }: { restauranteId: string; tabelas: Tabela[] }) {
  const router = useRouter();
  const chave = tabelas.join(",");

  useEffect(() => {
    const supabase = createClient();
    let agendado: ReturnType<typeof setTimeout> | undefined;
    // Vários eventos juntos (ex.: item + pedido + comanda) viram um único refresh.
    const atualizar = () => {
      clearTimeout(agendado);
      agendado = setTimeout(() => router.refresh(), 300);
    };

    const canal = supabase.channel(`rt:${restauranteId}:${chave}`);
    for (const tabela of chave.split(",")) {
      canal.on(
        "postgres_changes",
        { event: "*", schema: "public", table: tabela, filter: `restaurante_id=eq.${restauranteId}` },
        atualizar,
      );
    }

    // O canal precisa do token do usuário: sem ele entra como anônimo e a RLS não entrega nada.
    // A sessão vem dos cookies, então é carregada antes de inscrever.
    let ativo = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      if (data.session) void supabase.realtime.setAuth(data.session.access_token);
      canal.subscribe();
    });
    const { data: escuta } = supabase.auth.onAuthStateChange((_evento, sessao) => {
      if (sessao) void supabase.realtime.setAuth(sessao.access_token);
    });

    // Celular bloqueado perde eventos: ao voltar para o app, recarrega.
    const aoVoltar = () => {
      if (document.visibilityState === "visible") atualizar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("online", atualizar);

    return () => {
      ativo = false;
      escuta.subscription.unsubscribe();
      clearTimeout(agendado);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("online", atualizar);
      void supabase.removeChannel(canal);
    };
  }, [restauranteId, chave, router]);

  return null;
}
