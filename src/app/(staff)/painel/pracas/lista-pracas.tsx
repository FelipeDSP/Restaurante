"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { ControlesOrdem, useAcao } from "@/components/staff/acoes-cliente";
import { BotaoEnviar, ErroCampo, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { alternarPraca, criarPraca, excluirPraca, moverPraca, renomearPraca } from "./actions";

export type Praca = { id: string; nome: string; ativa: boolean; produtos: number };

export function NovaPraca() {
  const [estado, acao] = useActionState(criarPraca, undefined);
  useAvisoResultado(estado);
  return (
    <form key={estado?.chave} action={acao} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor="nova-praca" className="sr-only">
          Nome da nova praça
        </label>
        <Input id="nova-praca" name="nome" placeholder="Nova praça (ex.: Churrasqueira, Chapa, Bar)" defaultValue={valorCampo(estado, "nome", "")} required className="h-11" />
        <ErroCampo estado={estado} campo="nome" />
      </div>
      <BotaoEnviar className="h-11" pendente="Criando...">
        Adicionar
      </BotaoEnviar>
    </form>
  );
}

function LinhaPraca({ praca, primeiro, ultimo }: { praca: Praca; primeiro: boolean; ultimo: boolean }) {
  const [estado, acao] = useActionState(renomearPraca.bind(null, praca.id), undefined);
  useAvisoResultado(estado);
  const { pendente, executar } = useAcao();
  const [nome, setNome] = useState(praca.nome);

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center">
      <ControlesOrdem
        rotulo={praca.nome}
        primeiro={primeiro}
        ultimo={ultimo}
        desabilitado={pendente}
        aoMover={(direcao) => executar(() => moverPraca(praca.id, direcao))}
      />
      <form action={acao} className="flex flex-1 items-center gap-2">
        <label htmlFor={`praca-${praca.id}`} className="sr-only">
          Nome da praça
        </label>
        <Input
          id={`praca-${praca.id}`}
          name="nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="h-10"
          required
        />
        {nome !== praca.nome ? (
          <BotaoEnviar size="sm" pendente="...">
            Salvar
          </BotaoEnviar>
        ) : null}
      </form>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {praca.produtos} {praca.produtos === 1 ? "produto" : "produtos"}
        </span>
        {!praca.ativa ? <Badge variant="secondary">Inativa</Badge> : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pendente}
          onClick={() => executar(() => alternarPraca(praca.id, !praca.ativa))}
        >
          {praca.ativa ? "Desativar" : "Ativar"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Excluir ${praca.nome}`}
          disabled={pendente}
          onClick={() => executar(() => excluirPraca(praca.id))}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

export function ListaPracas({ pracas }: { pracas: Praca[] }) {
  if (pracas.length === 0) {
    return <p className="text-muted-foreground">Nenhuma praça ainda. Sem praças, nenhum pedido aparece na tela da cozinha.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {pracas.map((praca, i) => (
        <LinhaPraca
          key={praca.id}
          praca={praca}
          primeiro={i === 0}
          ultimo={i === pracas.length - 1}
        />
      ))}
    </ul>
  );
}
