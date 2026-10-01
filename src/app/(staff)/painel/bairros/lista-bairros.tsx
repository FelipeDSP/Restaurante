"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { BotaoEnviar, Campo, ErroCampo, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { textoDeCentavos } from "@/lib/dinheiro";

import { alternarBairro, criarBairro, excluirBairro, salvarBairro } from "./actions";

export type Bairro = { id: string; nome: string; taxa: number; ativo: boolean };

export function NovoBairro() {
  const [estado, acao] = useActionState(criarBairro, undefined);
  useAvisoResultado(estado);
  return (
    <form key={estado?.chave} action={acao} className="flex flex-wrap items-end gap-2">
      <Campo rotulo="Bairro" htmlFor="novo-bairro" className="min-w-48 flex-1">
        <Input id="novo-bairro" name="nome" defaultValue={valorCampo(estado, "nome", "")} required className="h-11" />
        <ErroCampo estado={estado} campo="nome" />
      </Campo>
      <Campo rotulo="Taxa (R$)" htmlFor="nova-taxa" className="w-32">
        <Input id="nova-taxa" name="taxa" inputMode="decimal" placeholder="0,00" defaultValue={valorCampo(estado, "taxa", "")} required className="h-11" />
        <ErroCampo estado={estado} campo="taxa" />
      </Campo>
      <BotaoEnviar className="h-11" pendente="Adicionando...">
        Adicionar
      </BotaoEnviar>
    </form>
  );
}

function LinhaBairro({ bairro }: { bairro: Bairro }) {
  const [estado, acao] = useActionState(salvarBairro.bind(null, bairro.id), undefined);
  useAvisoResultado(estado);
  const { pendente, executar } = useAcao();
  const [nome, setNome] = useState(bairro.nome);
  const [taxa, setTaxa] = useState(textoDeCentavos(bairro.taxa));
  const alterado = nome !== bairro.nome || taxa !== textoDeCentavos(bairro.taxa);

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
      <form action={acao} className="flex flex-1 flex-wrap items-center gap-2">
        <label htmlFor={`bairro-${bairro.id}`} className="sr-only">
          Nome do bairro
        </label>
        <Input
          id={`bairro-${bairro.id}`}
          name="nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="h-10 min-w-40 flex-1"
          required
        />
        <label htmlFor={`taxa-${bairro.id}`} className="sr-only">
          Taxa de entrega
        </label>
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">R$</span>
          <Input
            id={`taxa-${bairro.id}`}
            name="taxa"
            inputMode="decimal"
            value={taxa}
            onChange={(e) => setTaxa(e.target.value)}
            className="h-10 w-24"
            required
          />
        </div>
        {alterado ? (
          <BotaoEnviar size="sm" pendente="...">
            Salvar
          </BotaoEnviar>
        ) : null}
        <ErroCampo estado={estado} campo="taxa" />
      </form>
      {!bairro.ativo ? <Badge variant="secondary">Inativo</Badge> : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pendente}
        onClick={() => executar(() => alternarBairro(bairro.id, !bairro.ativo))}
      >
        {bairro.ativo ? "Desativar" : "Ativar"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Excluir ${bairro.nome}`}
        disabled={pendente}
        onClick={() => executar(() => excluirBairro(bairro.id))}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

export function ListaBairros({ bairros }: { bairros: Bairro[] }) {
  if (bairros.length === 0) return <p className="text-muted-foreground">Nenhum bairro cadastrado.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {bairros.map((bairro) => (
        <LinhaBairro key={bairro.id} bairro={bairro} />
      ))}
    </ul>
  );
}
