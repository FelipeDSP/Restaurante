"use client";

import { Check, Volume2 } from "lucide-react";
import { useRef, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { salvarSom } from "@/lib/auth/perfil-actions";
import { definirPreferenciaDeSom, type PreferenciaDeSom, SONS, type Som, tocarAlerta, type Volume } from "@/lib/som";
import { cn } from "@/lib/utils";

const NOMES_VOLUME: Record<Volume, string> = { baixo: "Baixo", medio: "Médio", alto: "Alto" };

// "Meu perfil" > som dos avisos (pedido novo, cozinha, prato pronto, chamado): cada pessoa escolhe.
export function EscolherSom({ atual }: { atual: PreferenciaDeSom }) {
  const [escolha, setEscolha] = useState<PreferenciaDeSom>(atual);
  const audio = useRef<AudioContext | null>(null);
  const { pendente, executar } = useAcao();
  const mudou = escolha.som !== atual.som || escolha.volume !== atual.volume || escolha.vezes !== atual.vezes;

  const ouvir = (p: PreferenciaDeSom) => {
    audio.current ??= new AudioContext();
    void audio.current.resume().then(() => audio.current && tocarAlerta(audio.current, p));
  };
  const mudar = (parte: Partial<PreferenciaDeSom>) => {
    const nova = { ...escolha, ...parte };
    setEscolha(nova);
    ouvir(nova);
  };

  const opcao = (ativo: boolean) =>
    cn("flex h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium", ativo ? "border-primary bg-primary/10" : "bg-background hover:bg-muted");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Som dos avisos</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Som">
          {(Object.keys(SONS) as Som[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={escolha.som === s} className={opcao(escolha.som === s)} onClick={() => mudar({ som: s })}>
              {escolha.som === s ? <Check className="size-4" aria-hidden /> : null}
              {SONS[s]}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Volume</span>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Volume">
            {(Object.keys(NOMES_VOLUME) as Volume[]).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={escolha.volume === v} className={opcao(escolha.volume === v)} onClick={() => mudar({ volume: v })}>
                {NOMES_VOLUME[v]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Tocar</span>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Quantas vezes">
            {([1, 2, 3] as const).map((n) => (
              <button key={n} type="button" role="radio" aria-checked={escolha.vezes === n} className={opcao(escolha.vezes === n)} onClick={() => mudar({ vezes: n })}>
                {n === 1 ? "1 vez" : `${n} vezes`}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={() => ouvir(escolha)}>
            <Volume2 />
            Ouvir
          </Button>
          <Button
            type="button"
            className="h-11"
            disabled={pendente || !mudou}
            onClick={() => executar(() => salvarSom(escolha), () => definirPreferenciaDeSom(escolha))}
          >
            {pendente ? "Salvando..." : "Salvar som"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
