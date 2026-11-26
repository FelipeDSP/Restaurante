"use client";

import { Bell, BellOff, Smartphone } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// "Avisos no celular" (Web Push) para quem trabalha: o aviso chega com o app fechado e o celular
// no bolso. Sem isto, o bipe e a vibração só existem com a tela aberta na frente da pessoa — é
// regra do navegador, não escolha nossa.
//
// No iPhone o Safari só entrega push para sites adicionados à tela de início, por isso a tela
// explica esse passo em vez de deixar o botão falhar em silêncio.
type Estado = "carregando" | "sem-suporte" | "instalar-no-iphone" | "desligado" | "ligado" | "bloqueado";

const CHAVE_LOCAL = "avisos-equipe:endpoint";

function lerLocal() {
  try {
    return localStorage.getItem(CHAVE_LOCAL);
  } catch {
    return null;
  }
}
function gravarLocal(valor: string | null) {
  try {
    if (valor === null) localStorage.removeItem(CHAVE_LOCAL);
    else localStorage.setItem(CHAVE_LOCAL, valor);
  } catch {
    // modo anônimo/armazenamento bloqueado: só não lembra
  }
}

// Chave pública VAPID (base64url) -> bytes, como o PushManager pede.
function bytesDaChave(base64url: string) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

const ehIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
// Adicionado à tela de início: é a condição que o Safari exige para entregar push.
const instalado = () => window.matchMedia("(display-mode: standalone)").matches || "standalone" in navigator;

function estadoInicial(): Estado {
  const suporta = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!suporta) return ehIphone() ? "instalar-no-iphone" : "sem-suporte";
  if (ehIphone() && !instalado()) return "instalar-no-iphone";
  if (Notification.permission === "denied") return "bloqueado";
  return lerLocal() && Notification.permission === "granted" ? "ligado" : "desligado";
}

export function AvisosNoCelular({ chavePublica }: { chavePublica: string | null }) {
  // Estado do aparelho (suporte, permissão, já ligado): só existe no navegador, então o servidor
  // devolve "carregando" e o cliente lê o de verdade na hidratação. `useSyncExternalStore` em vez
  // de um efeito porque é leitura, não efeito — e `requestAnimationFrame`, o jeito usado no aviso
  // do cliente, não roda em aba em segundo plano: o cartão ficava preso em "carregando", sem
  // botão nenhum, até a pessoa voltar para a aba.
  const doAparelho = useSyncExternalStore(
    () => () => {},
    estadoInicial,
    () => "carregando" as Estado,
  );
  // O que a pessoa mudou nesta visita (ligou, desligou, teve a permissão negada) tem precedência.
  const [mudado, setMudado] = useState<Estado | null>(null);
  const estado = mudado ?? doAparelho;
  const setEstado = setMudado;
  const [ocupado, setOcupado] = useState(false);

  if (!chavePublica) return null;

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
        (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesDaChave(chavePublica!) }));
      const resposta = await fetch("/api/avisos/equipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inscricao.toJSON()),
      });
      if (!resposta.ok) {
        const corpo = (await resposta.json().catch(() => null)) as { erro?: string } | null;
        toast.error(corpo?.erro ?? "Não foi possível ligar os avisos.");
        return;
      }
      gravarLocal(inscricao.endpoint);
      setEstado("ligado");
      toast.success("Avisos ligados neste aparelho. Mandamos um de teste agora.", { duration: 8000 });
    } catch {
      toast.error("Não foi possível ligar os avisos neste navegador.");
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    setOcupado(true);
    try {
      const registro = await navigator.serviceWorker.getRegistration();
      const inscricao = await registro?.pushManager.getSubscription();
      const endpoint = inscricao?.endpoint ?? lerLocal();
      if (inscricao) await inscricao.unsubscribe();
      if (endpoint) {
        await fetch("/api/avisos/equipe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }
      gravarLocal(null);
      setEstado("desligado");
      toast.info("Avisos desligados neste aparelho.");
    } catch {
      toast.error("Não foi possível desligar. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avisos no celular</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Ligado, o aviso chega mesmo com o app fechado e o celular no bolso. Vale só neste
          aparelho: ligue em cada um que você usa.
        </p>

        {estado === "ligado" ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-11 items-center gap-2 rounded-full border border-green-300 bg-green-50 px-4 text-sm font-medium text-green-900">
              <Bell className="size-4" aria-hidden />
              Ligado neste aparelho
            </span>
            <Button type="button" variant="outline" className="h-11" disabled={ocupado} onClick={desligar}>
              <BellOff />
              Desligar aqui
            </Button>
          </div>
        ) : null}

        {estado === "desligado" ? (
          <div>
            <Button type="button" className="h-11" disabled={ocupado} onClick={ligar}>
              <Bell />
              {ocupado ? "Ligando..." : "Ligar avisos neste aparelho"}
            </Button>
          </div>
        ) : null}

        {estado === "bloqueado" ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            As notificações estão bloqueadas para este site. Libere nas configurações do navegador
            (cadeado ao lado do endereço) e volte aqui.
          </p>
        ) : null}

        {estado === "instalar-no-iphone" ? (
          <p className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden />
            No iPhone, os avisos só funcionam com o app na tela de início: toque em{" "}
            <strong>Compartilhar</strong> no Safari, depois em <strong>Adicionar à Tela de Início</strong>, abra o app por
            lá e volte nesta tela.
          </p>
        ) : null}

        {estado === "sem-suporte" ? (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            Este navegador não recebe avisos com o app fechado. Os avisos continuam tocando com a
            tela aberta.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
