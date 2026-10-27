"use client";

import { Bell, BellOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

// "Avisar quando o pedido mudar": notificação no celular (Web Push), sem conta e sem aplicativo.
// No iPhone o Safari só entrega avisos para sites adicionados à tela de início.
type Estado = "carregando" | "sem-suporte" | "iphone" | "desligado" | "ligado" | "bloqueado";

const chaveLocal = (pedidoId: string) => `aviso-pedido:${pedidoId}`;

function lerLocal(chave: string) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}
function gravarLocal(chave: string, valor: string | null) {
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, valor);
  } catch {
    // modo anônimo/armazenamento bloqueado: só não lembra
  }
}

// Chave pública VAPID (base64url) -> bytes, como o PushManager pede.
function bytesDaChave(base64url: string) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function estadoInicial(pedidoId: string): Estado {
  const suporta = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!suporta) return /iPhone|iPad|iPod/.test(navigator.userAgent) ? "iphone" : "sem-suporte";
  if (Notification.permission === "denied") return "bloqueado";
  return lerLocal(chaveLocal(pedidoId)) && Notification.permission === "granted" ? "ligado" : "desligado";
}

export function AvisoPush({ pedidoId, chavePublica }: { pedidoId: string; chavePublica: string }) {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [ocupado, setOcupado] = useState(false);

  // Navegador e permissão só existem no aparelho.
  useEffect(() => {
    const id = requestAnimationFrame(() => setEstado(estadoInicial(pedidoId)));
    return () => cancelAnimationFrame(id);
  }, [pedidoId]);

  async function ligar() {
    setOcupado(true);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "desligado");
        return;
      }
      const registro = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const inscricao =
        (await registro.pushManager.getSubscription()) ??
        (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesDaChave(chavePublica) }));
      const resposta = await fetch(`/api/pedidos/${pedidoId}/avisos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inscricao.toJSON()),
      });
      if (!resposta.ok) {
        const corpo = (await resposta.json().catch(() => null)) as { erro?: string } | null;
        toast.error(corpo?.erro ?? "Não foi possível ligar os avisos.");
        return;
      }
      gravarLocal(chaveLocal(pedidoId), inscricao.endpoint);
      setEstado("ligado");
      const corpo = (await resposta.json().catch(() => null)) as { enviado?: boolean } | null;
      toast.success(
        corpo?.enviado
          ? "Avisos ligados. Mandamos um aviso de teste: se ele não aparecer, libere as notificações do navegador nas configurações do celular."
          : "Pronto! Você vai receber um aviso quando o pedido mudar.",
        { duration: 8000 },
      );
    } catch {
      toast.error("Não foi possível ligar os avisos neste navegador.");
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    setOcupado(true);
    const endpoint = lerLocal(chaveLocal(pedidoId));
    try {
      if (endpoint) {
        await fetch(`/api/pedidos/${pedidoId}/avisos`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }
    } catch {
      // sem internet: o aviso some sozinho quando o pedido termina
    }
    gravarLocal(chaveLocal(pedidoId), null);
    setEstado("desligado");
    setOcupado(false);
  }

  if (estado === "carregando" || estado === "sem-suporte") return null;

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-xl bg-background p-4 shadow-sm">
      {estado === "desligado" ? (
        <Button className="h-11 w-full" disabled={ocupado} onClick={ligar}>
          <Bell />
          Avisar quando o pedido mudar
        </Button>
      ) : estado === "ligado" ? (
        <>
          <Bell className="size-5 text-[var(--cor-primaria-texto)]" aria-hidden />
          <span className="flex-1 font-medium">Avisos ligados neste celular</span>
          <Button variant="ghost" size="sm" disabled={ocupado} onClick={desligar}>
            Desligar
          </Button>
        </>
      ) : estado === "bloqueado" ? (
        <>
          <BellOff className="size-5 text-muted-foreground" aria-hidden />
          <span className="flex-1 text-sm text-muted-foreground">Os avisos estão bloqueados nas configurações do navegador.</span>
        </>
      ) : (
        <>
          <Bell className="size-5 text-muted-foreground" aria-hidden />
          <span className="flex-1 text-sm text-muted-foreground">
            Para receber avisos no iPhone, toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.
          </span>
        </>
      )}
    </section>
  );
}
