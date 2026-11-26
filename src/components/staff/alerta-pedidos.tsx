"use client";

import { Bell, BellOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useMudancasRealtime } from "@/lib/realtime";
import { novoContextoDeSom, tocarAlerta } from "@/lib/som";
import { createClient } from "@/lib/supabase/client";

// Conferência de reserva: pega o pedido que chegou enquanto o tempo real estava caído
// e repete o bipe enquanto houver delivery esperando o aceite.
const CONFERIR_MS = 30_000;
// O lembrete (bipe a cada conferência) vale para pedido recente: um delivery esquecido de outra
// noite aparece no quadro, mas não fica bipando para sempre.
const LEMBRETE_ATE_MS = 3 * 60 * 60_000;
// Mensagens, prontos e cancelamentos perdidos numa queda de conexão: a conferência pega os recentes.
const RECUPERAR_MS = 60 * 60_000;
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
  // Pedidos "recebido" já avisados. A primeira conferência não avisa nada (só anota o que já existia),
  // mesmo que um pedido novo chegue pelo tempo real antes dela responder.
  const avisados = useRef(new Set<string>());
  const primeiraCarga = useRef(false);
  // Deliveries já "pronto": anotados ao abrir a tela, para mexer neles depois (entregador, edição)
  // não tocar "pronto para sair" de novo.
  const prontosAvisados = useRef(new Set<string>());
  const canceladosAvisados = useRef(new Set<string>());
  const mensagensAvisadas = useRef(new Set<string>());

  // Qualquer interação com a página já libera o som (se a pessoa não desligou).
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      mudoAtual.current = lerMudo();
      setMudo(mudoAtual.current);
    });
    const liberar = () => {
      audio.current ??= novoContextoDeSom();
      void audio.current.resume().then(() => setSomAtivo(audio.current?.state === "running"));
    };
    // Tenta de cara: quem navegou pelo menu já tocou na página, então o áudio costuma nascer
    // liberado e o botão não precisa aparecer como se estivesse desligado. Recusa aqui não
    // conclui nada — o botão continua à disposição e o primeiro toque resolve.
    liberar();
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

  const avisarPronto = useCallback(
    (pedido: { id: string; numero: number | null }) => {
      if (prontosAvisados.current.has(pedido.id)) return;
      prontosAvisados.current.add(pedido.id);
      bipar();
      toast.success(`Delivery nº ${pedido.numero ?? ""} pronto para sair`, {
        duration: 15000,
        action: { label: "Ver", onClick: () => router.push("/painel/delivery") },
      });
    },
    [router],
  );

  const avisarCancelado = useCallback(
    (pedido: { id: string; numero: number | null }) => {
      if (canceladosAvisados.current.has(pedido.id)) return;
      canceladosAvisados.current.add(pedido.id);
      bipar();
      toast.warning(`O cliente cancelou o delivery nº ${pedido.numero ?? ""}`, {
        duration: 15000,
        action: { label: "Ver", onClick: () => router.push("/painel/delivery") },
      });
    },
    [router],
  );

  const avisarMensagem = useCallback(
    (mensagem: { id: string; texto: string | null; pedido_id: string | null }) => {
      if (mensagensAvisadas.current.has(mensagem.id)) return;
      mensagensAvisadas.current.add(mensagem.id);
      bipar();
      if (document.visibilityState !== "visible") setNovos((n) => n + 1);
      toast.info("Mensagem de cliente do delivery", {
        description: mensagem.texto && mensagem.texto.length > 80 ? `${mensagem.texto.slice(0, 80)}…` : (mensagem.texto ?? undefined),
        duration: 15000,
        action: { label: "Responder", onClick: () => router.push(`/painel/conversas/${mensagem.pedido_id ?? ""}`) },
      });
    },
    [router],
  );

  const conferir = useCallback(async () => {
    const supabase = createClient();
    const desde = new Date(Date.now() - RECUPERAR_MS).toISOString();
    const [pedidos, cancelados, mensagens] = await Promise.all([
      supabase
        .from("pedidos")
        .select("id, numero, cliente_nome, status, criado_em")
        .eq("restaurante_id", restauranteId)
        .eq("origem", "delivery")
        .in("status", ["recebido", "pronto"]),
      supabase
        .from("pedidos")
        .select("id, numero")
        .eq("restaurante_id", restauranteId)
        .eq("origem", "delivery")
        .eq("cancelado_pelo_cliente", true)
        .gte("cancelado_em", desde),
      supabase
        .from("pedidos_mensagens")
        .select("id, texto, pedido_id")
        .eq("restaurante_id", restauranteId)
        .eq("autor", "cliente")
        .is("lida_em", null)
        .gte("criado_em", desde),
    ]);
    if (pedidos.error || !pedidos.data) return;
    const recebidos = pedidos.data.filter((p) => p.status === "recebido");
    const prontos = pedidos.data.filter((p) => p.status === "pronto");

    if (!primeiraCarga.current) {
      // Ao abrir a tela só anota o que já existia (nada toca).
      primeiraCarga.current = true;
      recebidos.forEach((p) => avisados.current.add(p.id));
      prontos.forEach((p) => prontosAvisados.current.add(p.id));
      (cancelados.data ?? []).forEach((p) => canceladosAvisados.current.add(p.id));
      (mensagens.data ?? []).forEach((m) => mensagensAvisadas.current.add(m.id));
      return;
    }
    // O que chegou enquanto o tempo real estava caído.
    prontos.forEach(avisarPronto);
    (cancelados.data ?? []).forEach(avisarCancelado);
    (mensagens.data ?? []).forEach(avisarMensagem);
    const naoAvisados = recebidos.filter((p) => !avisados.current.has(p.id));
    if (naoAvisados.length > 0) {
      naoAvisados.forEach(avisar);
      router.refresh();
    } else if (recebidos.some((p) => Date.now() - new Date(p.criado_em).getTime() < LEMBRETE_ATE_MS)) {
      bipar(); // lembrete: ainda tem pedido recente esperando o aceite
    }
  }, [restauranteId, avisar, avisarPronto, avisarCancelado, avisarMensagem, router]);

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

  // A cozinha terminou um delivery (o caixa chama o entregador) ou o cliente cancelou.
  useMudancasRealtime(
    restauranteId,
    ["pedidos"],
    (mudanca) => {
      const pedido = mudanca.new as { id?: string; origem?: string; status?: string; numero?: number; cancelado_pelo_cliente?: boolean };
      if (pedido.origem !== "delivery" || !pedido.id) return;
      // O cliente cancelou pelo site antes do aceite.
      if (pedido.status === "cancelado" && pedido.cancelado_pelo_cliente) {
        avisarCancelado({ id: pedido.id, numero: pedido.numero ?? null });
        router.refresh();
        return;
      }
      if (pedido.status === "pronto") avisarPronto({ id: pedido.id, numero: pedido.numero ?? null });
    },
    "UPDATE",
    () => void conferir(),
  );

  // O cliente escreveu na conversa do pedido.
  useMudancasRealtime(
    restauranteId,
    ["pedidos_mensagens"],
    (mudanca) => {
      const mensagem = mudanca.new as { id?: string; autor?: string; texto?: string; pedido_id?: string };
      if (mensagem.autor !== "cliente" || !mensagem.id) return;
      avisarMensagem({ id: mensagem.id, texto: mensagem.texto ?? null, pedido_id: mensagem.pedido_id ?? null });
      router.refresh();
    },
    "INSERT",
    () => void conferir(),
  );

  // Conversa lida em outro aparelho: o contador do menu diminui aqui também.
  useMudancasRealtime(
    restauranteId,
    ["pedidos_mensagens"],
    (mudanca) => {
      if ((mudanca.new as { lida_em?: string | null }).lida_em) router.refresh();
    },
    "UPDATE",
  );

  function ligarSom() {
    mudoAtual.current = false;
    setMudo(false);
    gravarMudo(false);
    audio.current ??= novoContextoDeSom();
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
