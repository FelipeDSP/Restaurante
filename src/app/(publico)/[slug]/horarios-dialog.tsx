"use client";

import { Dialog } from "@base-ui/react/dialog";
import { CalendarClock, X } from "lucide-react";
import { useState } from "react";

import { DIAS, type Dia, type Horarios, NOME_DIA } from "@/lib/horarios";
import { cn } from "@/lib/utils";

const DIA_DA_SEMANA: Record<string, Dia> = { Sun: "dom", Mon: "seg", Tue: "ter", Wed: "qua", Thu: "qui", Fri: "sex", Sat: "sab" };

function textoDia(horarios: Horarios, dia: Dia): string {
  const intervalos = horarios[dia] ?? [];
  if (intervalos.length === 0) return "Fechado";
  return intervalos.map((i) => (i.abre === i.fecha ? "24 horas" : `${i.abre} às ${i.fecha}`)).join(" e ");
}

// Horários de funcionamento numa janela, aberta pelo botão ao lado de "Aberto/Fechado"
// (antes ficavam no fim da página, onde quase ninguém via). Hoje fica em destaque.
export function HorariosDialog({ horarios, fusoHorario }: { horarios: Horarios; fusoHorario: string }) {
  const [aberto, setAberto] = useState(false);
  // O portal fica dentro da página do restaurante para herdar as cores da marca.
  const [ancora, setAncora] = useState<HTMLSpanElement | null>(null);
  const hoje = aberto
    ? DIA_DA_SEMANA[new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: fusoHorario }).format(new Date())]
    : undefined;

  return (
    <Dialog.Root open={aberto} onOpenChange={setAberto}>
      <span ref={setAncora} hidden />
      <Dialog.Trigger className="flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium hover:bg-muted">
        <CalendarClock className="size-4" aria-hidden />
        Horários
      </Dialog.Trigger>
      <Dialog.Portal container={ancora?.parentElement ?? undefined}>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl outline-none transition-transform duration-200 data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:data-[ending-style]:opacity-0 sm:data-[starting-style]:opacity-0">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-lg font-bold">Horários de funcionamento</Dialog.Title>
            <Dialog.Close aria-label="Fechar" className="flex size-11 items-center justify-center rounded-full hover:bg-muted">
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <dl className="flex flex-col">
            {DIAS.map((dia) => (
              <div
                key={dia}
                className={cn("flex justify-between gap-4 rounded-lg px-3 py-2.5", dia === hoje && "bg-muted font-semibold")}
              >
                <dt>
                  {NOME_DIA[dia]}
                  {dia === hoje ? <span className="ml-2 text-xs font-medium text-muted-foreground">hoje</span> : null}
                </dt>
                <dd className={cn("tabular-nums", textoDia(horarios, dia) === "Fechado" && "text-muted-foreground")}>
                  {textoDia(horarios, dia)}
                </dd>
              </div>
            ))}
          </dl>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
