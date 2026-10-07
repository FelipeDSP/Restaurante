"use client";

import { Bell, BellOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useMudancasRealtime } from "@/lib/realtime";
import { tocarAlerta } from "@/lib/som";

// Alerta de novo pedido de delivery em qualquer tela do painel: som, aviso e título da aba.
// Navegadores só liberam áudio depois de um toque/clique na página, por isso o botão de ativar.
export function AlertaPedidos({ restauranteId }: { restauranteId: string }) {
  const router = useRouter();
  const audio = useRef<AudioContext | null>(null);
  const [somAtivo, setSomAtivo] = useState(false);
  const [novos, setNovos] = useState(0);

  // Qualquer interação com a página já libera o som.
  useEffect(() => {
    const liberar = () => {
      audio.current ??= new AudioContext();
      void audio.current.resume().then(() => setSomAtivo(audio.current?.state === "running"));
    };
    window.addEventListener("pointerdown", liberar, { once: true });
    window.addEventListener("keydown", liberar, { once: true });
    return () => {
      window.removeEventListener("pointerdown", liberar);
      window.removeEventListener("keydown", liberar);
    };
  }, []);

  // O título da aba mostra a contagem até a pessoa voltar para a aba.
  useEffect(() => {
    if (novos === 0) return;
    const original = document.title.replace(/^\(\d+\) /, "");
    document.title = `(${novos}) ${original}`;
    const aoVoltar = () => {
      if (document.visibilityState === "visible") setNovos(0);
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      document.title = original;
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [novos]);

  useMudancasRealtime(
    restauranteId,
    ["pedidos"],
    (mudanca) => {
      const pedido = mudanca.new as { origem?: string; numero?: number; cliente_nome?: string };
      if (pedido.origem !== "delivery") return;
      if (audio.current?.state === "running") tocarAlerta(audio.current);
      if (document.visibilityState !== "visible") setNovos((n) => n + 1);
      toast.info(`Novo pedido de delivery nº ${pedido.numero ?? ""}`, {
        description: pedido.cliente_nome,
        duration: 15000,
        action: { label: "Ver", onClick: () => router.push("/painel/delivery") },
      });
      router.refresh();
    },
    "INSERT",
  );

  function ativarSom() {
    audio.current ??= new AudioContext();
    void audio.current.resume().then(() => {
      setSomAtivo(audio.current?.state === "running");
      if (audio.current) tocarAlerta(audio.current);
    });
  }

  return (
    <button
      type="button"
      onClick={ativarSom}
      aria-pressed={somAtivo}
      aria-label={somAtivo ? "Alerta sonoro de pedidos ativado (tocar teste)" : "Ativar alerta sonoro de pedidos"}
      title={somAtivo ? "Alerta sonoro ativado — clique para testar" : "Clique para ativar o alerta sonoro"}
      className="flex size-11 items-center justify-center rounded-full hover:bg-black/10"
    >
      {somAtivo ? <Bell className="size-5" /> : <BellOff className="size-5 opacity-70" />}
    </button>
  );
}
