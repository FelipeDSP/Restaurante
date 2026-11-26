"use client";

import { Bell, Lock, Smartphone, Volume2 } from "lucide-react";
import { useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type Avisos, EVENTOS, type Evento, ehObrigatorio } from "@/lib/avisos";
import { salvarAvisos } from "@/lib/auth/perfil-actions";
import { definirAvisos } from "@/lib/som";
import { cn } from "@/lib/utils";

// "Meu perfil" > Notificações: por aviso, receber ou não e vibrar ou não. O toque é um só para
// tudo e fica no cartão de cima ("Som dos avisos"), porque é escolha da pessoa, não do evento.
export function EscolherAvisos({ atual, eventos }: { atual: Avisos; eventos: Evento[] }) {
  const [escolha, setEscolha] = useState<Avisos>(atual);
  const { pendente, executar } = useAcao();
  const mudou = eventos.some((e) => escolha[e].ligado !== atual[e].ligado || escolha[e].vibrar !== atual[e].vibrar);

  const mudar = (evento: Evento, parte: Partial<Avisos[Evento]>) =>
    setEscolha((atual) => ({ ...atual, [evento]: { ...atual[evento], ...parte } }));

  if (eventos.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quais avisos você recebe</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col divide-y">
          {eventos.map((evento) => {
            const def = EVENTOS[evento];
            const travado = ehObrigatorio(evento);
            const ligado = escolha[evento].ligado;
            return (
              <li key={evento} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{def.rotulo}</span>
                    <span className="text-sm text-muted-foreground">{def.detalhe}</span>
                  </span>
                  {travado ? (
                    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
                      <Lock className="size-3.5" aria-hidden />
                      Sempre ligado
                    </span>
                  ) : (
                    <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        className="size-5 accent-[var(--cor-primaria)]"
                        checked={ligado}
                        onChange={(e) => mudar(evento, { ligado: e.target.checked })}
                      />
                      Avisar
                    </label>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={cn(
                      "flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs",
                      ligado ? "bg-background" : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Volume2 className="size-3.5" aria-hidden />
                    {ligado ? "Toca o som" : "Sem som"}
                  </span>
                  <button
                    type="button"
                    aria-pressed={ligado && escolha[evento].vibrar}
                    disabled={!ligado}
                    onClick={() => mudar(evento, { vibrar: !escolha[evento].vibrar })}
                    className={cn(
                      "flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium disabled:opacity-50",
                      ligado && escolha[evento].vibrar ? "border-primary bg-primary/10" : "bg-background hover:bg-muted",
                    )}
                  >
                    <Smartphone className="size-3.5" aria-hidden />
                    {ligado && escolha[evento].vibrar ? "Vibra" : "Não vibra"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Dito aqui para o garçom de iPhone não achar que o botão está quebrado. */}
        <p className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          <Bell className="mt-0.5 size-4 shrink-0" aria-hidden />
          No iPhone a vibração não funciona: o Safari não deixa o site vibrar o aparelho. O som
          toca normalmente. Em qualquer celular, os avisos só chegam com o app aberto na tela.
        </p>

        <div>
          <Button
            type="button"
            className="h-11"
            disabled={pendente || !mudou}
            onClick={() => executar(() => salvarAvisos(escolha), () => definirAvisos(escolha))}
          >
            {pendente ? "Salvando..." : "Salvar avisos"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
