"use client";

import { Bell, BellOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useMudancasRealtime } from "@/lib/realtime";
import { tocarAlerta } from "@/lib/som";
import { createClient } from "@/lib/supabase/client";

// Conferência de reserva: pega o pedido que chegou enquanto o tempo real estava caído
// e repete o bipe enquanto houver delivery esperando o aceite.
const CONFERIR_MS = 30_000;

type PedidoNovo = { id: string; numero: number | null; cliente_nome: string | null };

// Alerta de novo pedido de delivery em qualquer tela do painel: som, aviso e título da aba.
// Navegadores só liberam áudio depois de um toque/clique na página, por isso o botão de ativar.
export function AlertaPedidos({ restauranteId }: { restauranteId: string }) {
  const router = useRouter();
  const audio = useRef<AudioContext | null>(null);
  const [somAtivo, setSomAtivo] = useState(false);
  const [novos, setNovos] = useState(0);
  // Pedidos "recebido" já avisados (null até a primeira conferência, que não avisa nada).
  const avisados = useRef<Set<string> | null>(null);
  const prontosAvisados = useRef(new Set<string>());

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

  const bipar = () => {
    if (audio.current?.state === "running") tocarAlerta(audio.current);
  };

  const avisar = useCallback(
    (pedido: PedidoNovo) => {
      avisados.current ??= new Set();
      if (avisados.current.has(pedido.id)) return;
      avisados.current.add(pedido.id);
      bipar();
      if (document.visibilityState !== "visible") setNovos((n) => n + 1);
      toast.info(`Novo pedido de delivery nº ${pedido.numero ?? ""}`, {
        description: pedido.cliente_nome ?? undefined,
        duration: 15000,
        action: { label: "Ver", onClick: () => router.push("/painel/delivery") },
      });
    },
    [router],
  );

  const conferir = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("pedidos")
      .select("id, numero, cliente_nome")
      .eq("restaurante_id", restauranteId)
      .eq("origem", "delivery")
      .eq("status", "recebido");
    if (error || !data) return;

    if (avisados.current === null) {
      avisados.current = new Set(data.map((p) => p.id));
      return;
    }
    const naoAvisados = data.filter((p) => !avisados.current?.has(p.id));
    if (naoAvisados.length > 0) {
      naoAvisados.forEach(avisar);
      router.refresh();
    } else if (data.length > 0) {
      bipar(); // lembrete: ainda tem pedido esperando o aceite
    }
  }, [restauranteId, avisar, router]);

  // Intervalo estável: não reinicia quando o router ou o callback mudam de referência.
  const conferirAtual = useRef(conferir);
  useEffect(() => {
    conferirAtual.current = conferir;
  });
  useEffect(() => {
    void conferirAtual.current();
    const intervalo = setInterval(() => void conferirAtual.current(), CONFERIR_MS);
    const aoVoltar = () => void conferirAtual.current();
    window.addEventListener("online", aoVoltar);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener("online", aoVoltar);
    };
  }, [restauranteId]);

  useMudancasRealtime(
    restauranteId,
    ["pedidos"],
    (mudanca) => {
      const pedido = mudanca.new as { id?: string; origem?: string; numero?: number; cliente_nome?: string };
      if (pedido.origem !== "delivery" || !pedido.id) return;
      avisar({ id: pedido.id, numero: pedido.numero ?? null, cliente_nome: pedido.cliente_nome ?? null });
      router.refresh();
    },
    "INSERT",
    () => void conferir(),
  );

  // A cozinha terminou um delivery: o caixa chama o entregador.
  useMudancasRealtime(
    restauranteId,
    ["pedidos"],
    (mudanca) => {
      const pedido = mudanca.new as { id?: string; origem?: string; status?: string; numero?: number };
      if (pedido.origem !== "delivery" || pedido.status !== "pronto" || !pedido.id) return;
      if (prontosAvisados.current.has(pedido.id)) return;
      prontosAvisados.current.add(pedido.id);
      bipar();
      toast.success(`Delivery nº ${pedido.numero ?? ""} pronto para sair`, {
        duration: 15000,
        action: { label: "Ver", onClick: () => router.push("/painel/delivery") },
      });
    },
    "UPDATE",
  );

  function ativarSom() {
    audio.current ??= new AudioContext();
    void audio.current.resume().then(() => {
      setSomAtivo(audio.current?.state === "running");
      if (audio.current) tocarAlerta(audio.current);
    });
  }

  if (!somAtivo) {
    return (
      <button
        type="button"
        onClick={ativarSom}
        className="flex h-11 items-center gap-2 rounded-full bg-black/15 px-3 text-sm font-semibold hover:bg-black/25"
      >
        <BellOff className="size-5" aria-hidden />
        Ativar som
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={ativarSom}
      aria-label="Alerta sonoro de pedidos ativado (tocar teste)"
      title="Alerta sonoro ativado — clique para testar"
      className="flex size-11 items-center justify-center rounded-full hover:bg-black/10"
    >
      <Bell className="size-5" />
    </button>
  );
}
