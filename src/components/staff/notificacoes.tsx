"use client";

import { Bell, BellOff, Check, Smartphone, Volume2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { useAcao } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Avisos } from "@/lib/avisos";
import { salvarNotificacoes } from "@/lib/auth/perfil-actions";
import {
  definirAvisos,
  definirPreferenciaDeSom,
  novoContextoDeSom,
  type PreferenciaDeSom,
  SONS,
  type Som,
  tocarAlerta,
  type Volume,
  VOLUMES,
} from "@/lib/som";
import { cn } from "@/lib/utils";

const NOMES_VOLUME: Record<Volume, string> = { baixo: "Baixo", medio: "Médio", alto: "Alto" };

// Estado do aviso no celular (Web Push). Só existe no navegador, por isso o servidor desenha
// "carregando" e o cliente lê o de verdade na hidratação.
type EstadoPush = "carregando" | "sem-suporte" | "instalar-no-iphone" | "desligado" | "ligado" | "bloqueado";

const CHAVE_LOCAL = "avisos-equipe:endpoint";
const lerLocal = () => {
  try {
    return localStorage.getItem(CHAVE_LOCAL);
  } catch {
    return null;
  }
};
const gravarLocal = (valor: string | null) => {
  try {
    if (valor === null) localStorage.removeItem(CHAVE_LOCAL);
    else localStorage.setItem(CHAVE_LOCAL, valor);
  } catch {
    // modo anônimo/armazenamento bloqueado: só não lembra
  }
};

// Chave pública VAPID (base64url) -> bytes, como o PushManager pede.
function bytesDaChave(base64url: string) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

const ehIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
// O Safari só entrega push para site adicionado à tela de início.
const instalado = () => window.matchMedia("(display-mode: standalone)").matches || "standalone" in navigator;

function estadoDoAparelho(): EstadoPush {
  const suporta = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!suporta) return ehIphone() ? "instalar-no-iphone" : "sem-suporte";
  if (ehIphone() && !instalado()) return "instalar-no-iphone";
  if (Notification.permission === "denied") return "bloqueado";
  return lerLocal() && Notification.permission === "granted" ? "ligado" : "desligado";
}

// "Meu perfil" > Notificações, num cartão só: receber aviso no celular, tocar som, vibrar e qual
// toque. Antes isso era uma aba própria com os oito acontecimentos listados um a um — detalhe que
// ninguém ia configurar e que escondia os três controles que importam.
export function Notificacoes({ som, avisos, chavePublica }: { som: PreferenciaDeSom; avisos: Avisos; chavePublica: string | null }) {
  const [escolha, setEscolha] = useState<PreferenciaDeSom & Avisos>({ ...som, ...avisos });
  const { pendente, executar } = useAcao();
  const [ocupado, setOcupado] = useState(false);
  const mudou =
    escolha.som !== avisos.som ||
    escolha.vibrar !== avisos.vibrar ||
    escolha.toque !== som.toque ||
    escolha.volume !== som.volume ||
    escolha.vezes !== som.vezes;

  const doAparelho = useSyncExternalStore(
    () => () => {},
    estadoDoAparelho,
    () => "carregando" as EstadoPush,
  );
  const [mudadoPush, setMudadoPush] = useState<EstadoPush | null>(null);
  const push = mudadoPush ?? doAparelho;

  const ouvir = (p: PreferenciaDeSom) => {
    const contexto = novoContextoDeSom();
    void contexto.resume().then(() => tocarAlerta(contexto, p));
  };
  const mudar = (parte: Partial<PreferenciaDeSom & Avisos>) => {
    const nova = { ...escolha, ...parte };
    setEscolha(nova);
    if (nova.som && parte.vibrar === undefined) ouvir(nova);
  };

  async function ligarPush() {
    setOcupado(true);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setMudadoPush(permissao === "denied" ? "bloqueado" : "desligado");
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
      setMudadoPush("ligado");
      toast.success("Avisos ligados neste aparelho. Mandamos um de teste agora.", { duration: 8000 });
    } catch {
      toast.error("Não foi possível ligar os avisos neste navegador.");
    } finally {
      setOcupado(false);
    }
  }

  async function desligarPush() {
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
      setMudadoPush("desligado");
      toast.info("Avisos desligados neste aparelho.");
    } catch {
      toast.error("Não foi possível desligar. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  const opcao = (ativo: boolean) =>
    cn(
      "flex h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium",
      ativo ? "border-primary bg-primary/10" : "bg-background hover:bg-muted",
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notificações</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Aviso no celular: vale por aparelho, não pela conta. */}
        {chavePublica ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Avisar no celular, com o app fechado</span>
            {push === "ligado" ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-11 items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 text-sm font-medium text-green-900">
                  <Bell className="size-4" aria-hidden />
                  Ligado neste aparelho
                </span>
                <Button type="button" variant="outline" className="h-11" disabled={ocupado} onClick={desligarPush}>
                  <BellOff />
                  Desligar aqui
                </Button>
              </div>
            ) : null}
            {push === "desligado" ? (
              <div>
                <Button type="button" className="h-11" disabled={ocupado} onClick={ligarPush}>
                  <Bell />
                  {ocupado ? "Ligando..." : "Ligar neste aparelho"}
                </Button>
              </div>
            ) : null}
            {push === "bloqueado" ? (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                As notificações estão bloqueadas para este site. Libere nas configurações do navegador e volte aqui.
              </p>
            ) : null}
            {push === "instalar-no-iphone" ? (
              <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                No iPhone é preciso adicionar o app à tela de início: Safari, botão Compartilhar, Adicionar à Tela de
                Início. Depois abra por lá e volte aqui.
              </p>
            ) : null}
            {push === "sem-suporte" ? (
              <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                Este navegador não recebe avisos com o app fechado. Com a tela aberta, os avisos continuam tocando.
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Som e vibração, com a tela aberta. */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Com a tela aberta</span>
          <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
            <button type="button" aria-pressed={escolha.som} className={opcao(escolha.som)} onClick={() => mudar({ som: !escolha.som })}>
              <Volume2 className="size-4" aria-hidden />
              {escolha.som ? "Com som" : "Sem som"}
            </button>
            <button type="button" aria-pressed={escolha.vibrar} className={opcao(escolha.vibrar)} onClick={() => mudar({ vibrar: !escolha.vibrar })}>
              <Smartphone className="size-4" aria-hidden />
              {escolha.vibrar ? "Vibra" : "Não vibra"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            No iPhone a vibração não funciona: o Safari não deixa o site vibrar o aparelho.
          </p>
        </div>

        {/* Qual toque: some junto com o som, para não oferecer escolha que não vale. */}
        {escolha.som ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Toque</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Toque">
                {(Object.keys(SONS) as Som[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={escolha.toque === s}
                    className={opcao(escolha.toque === s)}
                    onClick={() => mudar({ toque: s })}
                  >
                    {escolha.toque === s ? <Check className="size-4" aria-hidden /> : null}
                    {SONS[s]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Volume</span>
              <div className="grid grid-cols-3 gap-2 sm:max-w-sm" role="radiogroup" aria-label="Volume">
                {(Object.keys(VOLUMES) as Volume[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={escolha.volume === v}
                    className={opcao(escolha.volume === v)}
                    onClick={() => mudar({ volume: v })}
                  >
                    {NOMES_VOLUME[v]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Tocar</span>
              <div className="grid grid-cols-3 gap-2 sm:max-w-sm" role="radiogroup" aria-label="Quantas vezes">
                {([1, 2, 3] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={escolha.vezes === n}
                    className={opcao(escolha.vezes === n)}
                    onClick={() => mudar({ vezes: n })}
                  >
                    {n === 1 ? "1 vez" : `${n} vezes`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {escolha.som ? (
            <Button type="button" variant="outline" className="h-11" onClick={() => ouvir(escolha)}>
              <Volume2 />
              Ouvir
            </Button>
          ) : null}
          <Button
            type="button"
            className="h-11"
            disabled={pendente || !mudou}
            onClick={() =>
              executar(
                () => salvarNotificacoes(escolha),
                () => {
                  definirPreferenciaDeSom({ toque: escolha.toque, volume: escolha.volume, vezes: escolha.vezes });
                  definirAvisos({ som: escolha.som, vibrar: escolha.vibrar });
                },
              )
            }
          >
            {pendente ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
