"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { ControlesOrdem, useAcao } from "@/components/staff/acoes-cliente";
import { BotaoEnviar, Campo, ErroCampo, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { alternarMesa, criarMesa, criarMesasEmSequencia, excluirMesa, moverMesa, renomearMesa } from "./actions";

export type Mesa = { id: string; numero: string; ativa: boolean };

export function NovasMesas() {
  const [estadoUma, acaoUma] = useActionState(criarMesa, undefined);
  const [estadoVarias, acaoVarias] = useActionState(criarMesasEmSequencia, undefined);
  useAvisoResultado(estadoUma);
  useAvisoResultado(estadoVarias);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Adicionar uma mesa</CardTitle>
        </CardHeader>
        <CardContent>
          <form key={estadoUma?.chave} action={acaoUma} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Campo rotulo="Número ou nome" htmlFor="numero" className="flex-1">
              <Input id="numero" name="numero" placeholder="Ex.: 12 ou Varanda 3" defaultValue={valorCampo(estadoUma, "numero", "")} required className="h-11" />
              <ErroCampo estado={estadoUma} campo="numero" />
            </Campo>
            <BotaoEnviar className="h-11" pendente="Criando...">
              Adicionar
            </BotaoEnviar>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Criar várias em sequência</CardTitle>
        </CardHeader>
        <CardContent>
          <form key={estadoVarias?.chave} action={acaoVarias} className="flex flex-wrap items-end gap-2">
            <Campo rotulo="De" htmlFor="de" className="w-24">
              <Input id="de" name="de" type="number" min={1} defaultValue={valorCampo(estadoVarias, "de", 1)} required className="h-11" />
            </Campo>
            <Campo rotulo="Até" htmlFor="ate" className="w-24">
              <Input id="ate" name="ate" type="number" min={1} defaultValue={valorCampo(estadoVarias, "ate", 10)} required className="h-11" />
            </Campo>
            <BotaoEnviar className="h-11" pendente="Criando...">
              Criar
            </BotaoEnviar>
            <div className="w-full">
              <ErroCampo estado={estadoVarias} campo="de" />
              <ErroCampo estado={estadoVarias} campo="ate" />
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function LinhaMesa({ mesa, primeiro, ultimo }: { mesa: Mesa; primeiro: boolean; ultimo: boolean }) {
  const [estado, acao] = useActionState(renomearMesa.bind(null, mesa.id), undefined);
  useAvisoResultado(estado);
  const { pendente, executar } = useAcao();
  const [numero, setNumero] = useState(mesa.numero);

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
      <ControlesOrdem
        rotulo={`mesa ${mesa.numero}`}
        primeiro={primeiro}
        ultimo={ultimo}
        desabilitado={pendente}
        aoMover={(direcao) => executar(() => moverMesa(mesa.id, direcao))}
      />
      <form action={acao} className="flex min-w-40 flex-1 items-center gap-2">
        <label htmlFor={`mesa-${mesa.id}`} className="sr-only">
          Número da mesa
        </label>
        <Input
          id={`mesa-${mesa.id}`}
          name="numero"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          className="h-10"
          required
        />
        {numero !== mesa.numero ? (
          <BotaoEnviar size="sm" pendente="...">
            Salvar
          </BotaoEnviar>
        ) : null}
      </form>
      {!mesa.ativa ? <Badge variant="secondary">Inativa</Badge> : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pendente}
        onClick={() => executar(() => alternarMesa(mesa.id, !mesa.ativa))}
      >
        {mesa.ativa ? "Desativar" : "Ativar"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Excluir mesa ${mesa.numero}`}
        disabled={pendente}
        onClick={() => executar(() => excluirMesa(mesa.id))}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

export function ListaMesas({ mesas }: { mesas: Mesa[] }) {
  if (mesas.length === 0) return <p className="text-muted-foreground">Nenhuma mesa cadastrada.</p>;
  return (
    <ul className="grid gap-2 lg:grid-cols-2">
      {mesas.map((mesa, i) => (
        <LinhaMesa key={mesa.id} mesa={mesa} primeiro={i === 0} ultimo={i === mesas.length - 1} />
      ))}
    </ul>
  );
}
