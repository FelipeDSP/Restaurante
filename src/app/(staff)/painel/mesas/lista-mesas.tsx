"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";

import { ControlesOrdem, useAcao } from "@/components/staff/acoes-cliente";
import { BotaoConfirmar } from "@/components/staff/botao-confirmar";
import { BotaoEnviar, Campo, ErroCampo, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { alternarMesa, criarMesa, criarMesasEmSequencia, excluirMesa, moverMesa, renomearMesa } from "./actions";

export type Mesa = { id: string; numero: string; ativa: boolean };

// Uma mesa por vez (campo direto) ou várias numeradas de uma vez (atrás de um botão).
export function NovasMesas() {
  const [estadoUma, acaoUma] = useActionState(criarMesa, undefined);
  const [estadoVarias, acaoVarias] = useActionState(criarMesasEmSequencia, undefined);
  useAvisoResultado(estadoUma);
  useAvisoResultado(estadoVarias);
  const [varias, setVarias] = useState(false);

  if (varias) {
    return (
      <form key={estadoVarias?.chave} action={acaoVarias} className="flex flex-wrap items-end gap-2">
        <Campo rotulo="Da mesa" htmlFor="de" className="w-24">
          <Input id="de" name="de" type="number" min={1} defaultValue={valorCampo(estadoVarias, "de", 1)} required className="h-11" />
        </Campo>
        <Campo rotulo="Até a mesa" htmlFor="ate" className="w-24">
          <Input id="ate" name="ate" type="number" min={1} defaultValue={valorCampo(estadoVarias, "ate", 10)} required className="h-11" />
        </Campo>
        <BotaoEnviar className="h-11" pendente="Criando...">
          Criar mesas
        </BotaoEnviar>
        <Button type="button" variant="ghost" className="h-11" onClick={() => setVarias(false)}>
          Cancelar
        </Button>
        <div className="w-full">
          <ErroCampo estado={estadoVarias} campo="de" />
          <ErroCampo estado={estadoVarias} campo="ate" />
        </div>
      </form>
    );
  }
  return (
    <div className="flex flex-wrap items-start gap-2">
      <form key={estadoUma?.chave} action={acaoUma} className="flex min-w-60 flex-1 gap-2 sm:max-w-md">
        <div className="flex flex-1 flex-col gap-1">
          <Input
            name="numero"
            placeholder="Nova mesa (ex.: 12 ou Varanda)"
            aria-label="Número ou nome da nova mesa"
            defaultValue={valorCampo(estadoUma, "numero", "")}
            required
            className="h-11"
          />
          <ErroCampo estado={estadoUma} campo="numero" />
        </div>
        <BotaoEnviar className="h-11" pendente="...">
          <Plus />
          Adicionar
        </BotaoEnviar>
      </form>
      <Button type="button" variant="outline" className="h-11" onClick={() => setVarias(true)}>
        Várias de uma vez
      </Button>
    </div>
  );
}

function EditarMesa({ mesa, primeiro, ultimo, aoFechar }: { mesa: Mesa; primeiro: boolean; ultimo: boolean; aoFechar: () => void }) {
  const [estado, acao] = useActionState(renomearMesa.bind(null, mesa.id), undefined);
  useAvisoResultado(estado);
  const { pendente, executar } = useAcao();
  const [numero, setNumero] = useState(mesa.numero);

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-3">
      <form action={acao} className="flex flex-wrap items-center gap-2">
        <label htmlFor={`mesa-${mesa.id}`} className="text-sm font-medium">
          Mesa
        </label>
        <Input
          id={`mesa-${mesa.id}`}
          name="numero"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          className="h-10 w-40 bg-background"
          required
        />
        {numero !== mesa.numero ? (
          <BotaoEnviar size="sm" pendente="...">
            Salvar
          </BotaoEnviar>
        ) : null}
        <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={aoFechar}>
          Fechar
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Posição no mapa</span>
        <ControlesOrdem
          rotulo={`mesa ${mesa.numero}`}
          primeiro={primeiro}
          ultimo={ultimo}
          desabilitado={pendente}
          aoMover={(direcao) => executar(() => moverMesa(mesa.id, direcao))}
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pendente}
            onClick={() => executar(() => alternarMesa(mesa.id, !mesa.ativa))}
          >
            {mesa.ativa ? "Desativar" : "Ativar"}
          </Button>
          <BotaoConfirmar
            rotulo={`Excluir mesa ${mesa.numero}`}
            desabilitado={pendente}
            aoConfirmar={() => executar(() => excluirMesa(mesa.id), aoFechar)}
          />
        </div>
      </div>
    </div>
  );
}

// Mapa das mesas na ordem do garçom; tocar numa abre a edição.
export function ListaMesas({ mesas }: { mesas: Mesa[] }) {
  const [selecionada, setSelecionada] = useState<string | null>(null);
  if (mesas.length === 0) return <p className="text-muted-foreground">Nenhuma mesa cadastrada.</p>;
  const indice = mesas.findIndex((m) => m.id === selecionada);
  const mesa = indice >= 0 ? mesas[indice] : null;

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
        {mesas.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              aria-pressed={m.id === selecionada}
              onClick={() => setSelecionada(m.id === selecionada ? null : m.id)}
              className={cn(
                "flex h-16 w-full flex-col items-center justify-center rounded-xl border px-2 text-center font-semibold transition-colors",
                m.id === selecionada ? "border-[var(--cor-primaria)] ring-2 ring-[var(--cor-primaria)]" : "hover:bg-muted",
                !m.ativa && "border-dashed text-muted-foreground",
              )}
            >
              <span className="line-clamp-2 text-base">{m.numero}</span>
              {!m.ativa ? <span className="text-xs font-normal">inativa</span> : null}
            </button>
          </li>
        ))}
      </ul>
      {mesa ? (
        <EditarMesa
          key={mesa.id}
          mesa={mesa}
          primeiro={indice === 0}
          ultimo={indice === mesas.length - 1}
          aoFechar={() => setSelecionada(null)}
        />
      ) : null}
    </div>
  );
}
