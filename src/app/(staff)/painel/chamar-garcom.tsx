"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Megaphone, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { mensagemFalhaRede, useAcao } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMudancasRealtime } from "@/lib/realtime";
import { cn } from "@/lib/utils";

import { chamarGarcom, type GarcomParaChamar, garconsParaChamar } from "./chamados";

const RECADOS = ["Vir ao caixa", "Pedido pronto para levar", "Mesa chamando"];

// Botão do topo do painel: chama um garçom (o app dele vibra e mostra o recado).
// Quando ele toca em "Vou", quem chamou recebe o aviso.
export function ChamarGarcom({ restauranteId, membroId }: { restauranteId: string; membroId: string }) {
  const [aberto, setAberto] = useState(false);
  const [ancora, setAncora] = useState<HTMLSpanElement | null>(null);
  const [garcons, setGarcons] = useState<GarcomParaChamar[] | null>(null);
  const nomes = useRef(new Map<string, string>());

  async function abrir() {
    setAberto(true);
    try {
      const lista = await garconsParaChamar();
      lista.forEach((g) => nomes.current.set(g.id, g.nome));
      setGarcons(lista);
    } catch {
      toast.error(mensagemFalhaRede());
      setAberto(false);
    }
  }

  // Resposta do garçom aos chamados feitos daqui.
  useMudancasRealtime(
    restauranteId,
    ["chamados_garcom"],
    (mudanca) => {
      const c = mudanca.new as { garcom_id?: string; chamado_por?: string; atendido_em?: string | null };
      if (!c.atendido_em || c.chamado_por !== membroId) return;
      const antes = mudanca.old as { atendido_em?: string | null };
      if (antes?.atendido_em) return;
      toast.success(`${nomes.current.get(c.garcom_id ?? "") ?? "O garçom"} está indo`);
    },
    "UPDATE",
  );

  return (
    <Dialog.Root open={aberto} onOpenChange={(a) => (a ? void abrir() : setAberto(false))}>
      <span ref={setAncora} hidden />
      <Dialog.Trigger
        aria-label="Chamar garçom"
        className="flex h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold hover:bg-black/10"
      >
        <Megaphone className="size-5" aria-hidden />
        <span className="hidden md:inline">Chamar garçom</span>
      </Dialog.Trigger>
      {/* Fora do topo (que fica numa camada abaixo da barra de abas do celular), mas dentro da tela
          do restaurante, para herdar as cores da marca. */}
      <Dialog.Portal container={ancora?.closest("header")?.parentElement ?? ancora?.parentElement ?? undefined}>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Popup className="fixed inset-x-0 bottom-0 z-40 flex max-h-[90dvh] flex-col gap-4 overflow-y-auto rounded-t-2xl bg-background p-5 text-foreground shadow-xl outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
          <div className="flex items-center justify-between gap-2">
            <Dialog.Title className="text-lg font-semibold">Chamar garçom</Dialog.Title>
            <Dialog.Close aria-label="Fechar" className="grid size-11 place-items-center rounded-full hover:bg-muted">
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>
          {aberto ? (
            garcons === null ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
            ) : (
              <Formulario garcons={garcons} aoChamar={() => setAberto(false)} />
            )
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Formulario({ garcons, aoChamar }: { garcons: GarcomParaChamar[]; aoChamar: () => void }) {
  const { pendente, executar } = useAcao();
  const [garcomId, setGarcomId] = useState<string | null>(garcons.length === 1 ? garcons[0].id : null);
  const [recado, setRecado] = useState("");

  if (garcons.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        Nenhum garçom na equipe.{" "}
        <Link href="/painel/equipe" className="font-medium text-foreground underline underline-offset-4">
          Equipe
        </Link>
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (garcomId) executar(() => chamarGarcom(garcomId, recado), aoChamar);
      }}
    >
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Garçom">
        {garcons.map((g) => (
          <button
            key={g.id}
            type="button"
            role="radio"
            aria-checked={garcomId === g.id}
            onClick={() => setGarcomId(g.id)}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium",
              garcomId === g.id ? "border-[var(--cor-primaria)] bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]" : "hover:bg-muted",
            )}
          >
            {g.nome}
            {g.aguardando ? <span className="size-2 rounded-full bg-amber-500" title="Já chamado, sem resposta" /> : null}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {RECADOS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={recado === r}
              onClick={() => setRecado(recado === r ? "" : r)}
              className={cn("min-h-9 rounded-full border px-3 text-sm", recado === r ? "border-foreground bg-muted font-medium" : "text-muted-foreground hover:bg-muted")}
            >
              {r}
            </button>
          ))}
        </div>
        <Input value={recado} onChange={(e) => setRecado(e.target.value)} maxLength={120} placeholder="Recado (opcional)" aria-label="Recado" className="h-11" />
      </div>

      <Button type="submit" className="h-12 text-base" disabled={!garcomId || pendente}>
        <Megaphone aria-hidden />
        {pendente ? "Chamando…" : "Chamar"}
      </Button>
    </form>
  );
}
