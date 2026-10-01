"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { ControlesOrdem, useAcao } from "@/components/staff/acoes-cliente";
import { BotaoEnviar, ErroCampo, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { alternarCategoria, criarCategoria, excluirCategoria, moverCategoria, renomearCategoria } from "./actions";

export type Categoria = { id: string; nome: string; ativa: boolean; produtos: number };

export function NovaCategoria() {
  const [estado, acao] = useActionState(criarCategoria, undefined);
  useAvisoResultado(estado);
  return (
    <form key={estado?.chave} action={acao} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor="nova-categoria" className="sr-only">
          Nome da nova categoria
        </label>
        <Input id="nova-categoria" name="nome" placeholder="Nova categoria (ex.: Espetos)" defaultValue={valorCampo(estado, "nome", "")} required className="h-11" />
        <ErroCampo estado={estado} campo="nome" />
      </div>
      <BotaoEnviar className="h-11" pendente="Criando...">
        Adicionar
      </BotaoEnviar>
    </form>
  );
}

function LinhaCategoria({ categoria, primeiro, ultimo }: { categoria: Categoria; primeiro: boolean; ultimo: boolean }) {
  const [estado, acao] = useActionState(renomearCategoria.bind(null, categoria.id), undefined);
  useAvisoResultado(estado);
  const { pendente, executar } = useAcao();
  const [nome, setNome] = useState(categoria.nome);

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center">
      <ControlesOrdem
        rotulo={categoria.nome}
        primeiro={primeiro}
        ultimo={ultimo}
        desabilitado={pendente}
        aoMover={(direcao) => executar(() => moverCategoria(categoria.id, direcao))}
      />
      <form action={acao} className="flex flex-1 items-center gap-2">
        <label htmlFor={`categoria-${categoria.id}`} className="sr-only">
          Nome da categoria
        </label>
        <Input
          id={`categoria-${categoria.id}`}
          name="nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="h-10"
          required
        />
        {nome !== categoria.nome ? (
          <BotaoEnviar size="sm" pendente="...">
            Salvar
          </BotaoEnviar>
        ) : null}
      </form>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {categoria.produtos} {categoria.produtos === 1 ? "produto" : "produtos"}
        </span>
        {!categoria.ativa ? <Badge variant="secondary">Inativa</Badge> : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pendente}
          onClick={() => executar(() => alternarCategoria(categoria.id, !categoria.ativa))}
        >
          {categoria.ativa ? "Desativar" : "Ativar"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Excluir ${categoria.nome}`}
          disabled={pendente || categoria.produtos > 0}
          title={categoria.produtos > 0 ? "Categoria com produtos não pode ser excluída" : undefined}
          onClick={() => executar(() => excluirCategoria(categoria.id))}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

export function ListaCategorias({ categorias }: { categorias: Categoria[] }) {
  if (categorias.length === 0) {
    return <p className="text-muted-foreground">Nenhuma categoria ainda. Crie a primeira acima.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {categorias.map((categoria, i) => (
        <LinhaCategoria
          key={categoria.id}
          categoria={categoria}
          primeiro={i === 0}
          ultimo={i === categorias.length - 1}
        />
      ))}
    </ul>
  );
}
