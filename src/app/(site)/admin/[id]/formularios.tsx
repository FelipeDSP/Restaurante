"use client";

import { useActionState, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { BotaoEnviar, Campo, ErroCampo, Selecao, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { definirAtivo, estenderTeste, salvarAssinatura } from "../actions";
import { NOME_STATUS, type StatusAssinatura } from "../assinatura";

// AAAA-MM-DD do dia em Brasília (o formulário usa <input type="date">).
function diaDe(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );
}

type Assinatura = {
  plano: "essencial" | "completo";
  status: StatusAssinatura;
  teste_termina_em: string | null;
  periodo_termina_em: string | null;
};

export function FormAssinatura({ restauranteId, assinatura }: { restauranteId: string; assinatura: Assinatura }) {
  const [estado, acao] = useActionState(salvarAssinatura, undefined);
  useAvisoResultado(estado);
  const { pendente, executar } = useAcao();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {[7, 14, 30].map((dias) => (
          <Button
            key={dias}
            type="button"
            variant="outline"
            disabled={pendente}
            onClick={() => executar(() => estenderTeste(restauranteId, dias, assinatura.plano, assinatura.status === "teste" ? assinatura.teste_termina_em : null))}
          >
            +{dias} dias de teste
          </Button>
        ))}
      </div>

      <form
        // Remonta quando a assinatura muda (ex.: "+7 dias"), para os campos mostrarem o valor novo.
        key={`${estado?.chave}-${assinatura.status}-${assinatura.plano}-${assinatura.teste_termina_em}-${assinatura.periodo_termina_em}`}
        action={acao}
        className="grid gap-4 sm:grid-cols-2"
      >
        <input type="hidden" name="restauranteId" value={restauranteId} />
        <Campo rotulo="Situação" htmlFor="status">
          <Selecao id="status" name="status" defaultValue={valorCampo(estado, "status", assinatura.status)} className="h-11">
            {(Object.keys(NOME_STATUS) as StatusAssinatura[]).map((s) => (
              <option key={s} value={s}>
                {NOME_STATUS[s]}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Plano" htmlFor="plano">
          <Selecao id="plano" name="plano" defaultValue={valorCampo(estado, "plano", assinatura.plano)} className="h-11">
            <option value="essencial">Essencial</option>
            <option value="completo">Completo</option>
          </Selecao>
        </Campo>
        <Campo rotulo="Teste vai até" htmlFor="testeTerminaEm" dica="Obrigatório quando a situação é Teste grátis.">
          <Input
            id="testeTerminaEm"
            name="testeTerminaEm"
            type="date"
            defaultValue={valorCampo(estado, "testeTerminaEm", diaDe(assinatura.teste_termina_em))}
            className="h-11"
            aria-invalid={!!estado?.erros?.testeTerminaEm}
          />
          <ErroCampo estado={estado} campo="testeTerminaEm" />
        </Campo>
        <Campo rotulo="Período pago vai até" htmlFor="periodoTerminaEm" dica="Opcional (pagante ou cortesia com prazo).">
          <Input
            id="periodoTerminaEm"
            name="periodoTerminaEm"
            type="date"
            defaultValue={valorCampo(estado, "periodoTerminaEm", diaDe(assinatura.periodo_termina_em))}
            className="h-11"
          />
        </Campo>
        <div className="sm:col-span-2">
          <BotaoEnviar className="h-11">Salvar assinatura</BotaoEnviar>
        </div>
      </form>
    </div>
  );
}

export function AtivarDesativar({ restauranteId, ativo }: { restauranteId: string; ativo: boolean }) {
  const { pendente, executar } = useAcao();
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState("");

  if (!confirmando) {
    return (
      <Button type="button" variant={ativo ? "destructive" : "default"} className="h-11 w-fit" onClick={() => setConfirmando(true)}>
        {ativo ? "Desativar restaurante" : "Reativar restaurante"}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-muted p-3" role="alert">
      <p className="text-sm font-medium">
        {ativo
          ? "O site de delivery sai do ar na hora. A equipe continua entrando no painel e nada é apagado."
          : "O site de delivery volta ao ar."}
      </p>
      <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (fica no histórico)" className="h-11 bg-background" />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={ativo ? "destructive" : "default"}
          disabled={pendente || motivo.trim().length < 3}
          onClick={() => executar(() => definirAtivo(restauranteId, !ativo, motivo), () => setConfirmando(false))}
        >
          {ativo ? "Confirmar desativação" : "Confirmar reativação"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setConfirmando(false)}>
          Voltar
        </Button>
      </div>
    </div>
  );
}
