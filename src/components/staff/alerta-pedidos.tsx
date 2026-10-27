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
// Som desligado pela pessoa: lembrado no aparelho.
const CHAVE_MUDO = "alerta-pedidos:mudo";

function lerMudo() {
  try {
    return localStorage.getItem(CHAVE_MUDO) === "1";
  } catch {
    return false;
  }
}
function gravarMudo(mudo: boolean) {
  try {
    if (mudo) localStorage.setItem(CHAVE_MUDO, "1");
    else localStorage.removeItem(CHAVE_MUDO);
  } catch {
    // armazenamento bloqueado: só não lembra
  }
}

type PedidoNovo = { id: string; numero: number | null; cliente_nome: string | null };

// Alerta de novo pedido de delivery em qualquer tela do painel: som, aviso e título da aba.
// Navegadores só liberam áudio depois de um toque/clique na página, por isso o botão de ativar.
export function AlertaPedidos({ restauranteId }: { restauranteId: string }) {
  const router = useRouter();
  const audio = useRef<AudioContext | null>(null);
  const [somAtivo, setSomAtivo] = useState(false);
  const [mudo, setMudo] = useState(false);
  const mudoAtual = useRef(false);
  const [novos, setNovos] = useState(0);
  // Pedidos "recebido" já avisados (null até a primeira conferência, que não avisa nada).
  const avisados = useRef<Set<string> | null>(null);
  const prontosAvisados = useRef(new Set<string>());

  // Qualquer interação com a página já libera o som (se a pessoa não desligou).
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      mudoAtual.current = lerMudo();
      setMudo(mudoAtual.current);
    });
    const liberar = () => {
      audio.current ??= new AudioContext();
      void audio.current.resume().then(() => setSomAtivo(audio.current?.state === "running"));
    };
    window.addEventListener("pointerdown", liberar, { once: true });
    window.addEventListener("keydown", liberar, { once: true });
    return () => {
      window.removeEventListener("pointerdown", liberar);
      window.removeEventListener("keydown", liberar);
      cancelAnimationFrame(id);
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
    if (!mudoAtual.current && audio.current?.state === "running") tocarAlerta(audio.current);
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

  function ligarSom() {
    mudoAtual.current = false;
    setMudo(false);
    gravarMudo(false);
    audio.current ??= new AudioContext();
    void audio.current.resume().then(() => {
      setSomAtivo(audio.current?.state === "running");
      if (audio.current) tocarAlerta(audio.current);
    });
  }

  function desligarSom() {
    mudoAtual.current = true;
    setMudo(true);
    gravarMudo(true);
    toast.info("Som dos pedidos desligado.");
  }

  if (!somAtivo || mudo) {
    return (
      <button
        type="button"
        onClick={ligarSom}
        aria-label="Ligar som dos pedidos"
        title="Som desligado: toque para ligar"
        className="flex size-11 items-center justify-center rounded-full hover:bg-black/10"
      >
        <BellOff className="size-5" aria-hidden />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={desligarSom}
      aria-label="Som dos pedidos ligado: toque para desligar"
      title="Som ligado: toque para desligar"
      className="flex size-11 items-center justify-center rounded-full hover:bg-black/10"
    >
      <Bell className="size-5" aria-hidden />
    </button>
  );
}
