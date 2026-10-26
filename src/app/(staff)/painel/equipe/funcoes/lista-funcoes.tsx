"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { BotaoConfirmar } from "@/components/staff/botao-confirmar";
import { BotaoEnviar, ErroCampo, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Permissao } from "@/lib/auth/papeis";

import { criarFuncao, excluirFuncao, salvarFuncao } from "../actions";
import { ChipsPermissoes } from "../permissoes-ui";

export type FuncaoComUso = { id: string; nome: string; permissoes: Permissao[]; pessoas: number };

const mesmas = (a: readonly Permissao[], b: readonly Permissao[]) => a.length === b.length && a.every((p) => b.includes(p));

export function NovaFuncao() {
  const [estado, acao] = useActionState(criarFuncao, undefined);
  useAvisoResultado(estado);
  const [aberto, setAberto] = useState(false);
  const [permissoes, setPermissoes] = useState<Permissao[]>([]);
  const [chaveVista, setChaveVista] = useState(estado?.chave);
  if (estado?.chave !== chaveVista) {
    setChaveVista(estado?.chave);
    if (estado?.ok) {
      setAberto(false);
      setPermissoes([]);
    }
  }
  if (!aberto) {
    return (
      <Button type="button" className="h-11 w-fit" onClick={() => setAberto(true)}>
        <Plus />
        Nova função
      </Button>
    );
  }
  return (
    <Card>
      <CardContent>
        <form key={estado?.chave} action={acao} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Input
              name="nome"
              aria-label="Nome da função"
              placeholder="Nome (ex.: Gerente)"
              defaultValue={valorCampo(estado, "nome", "")}
              maxLength={40}
              required
              className="h-11 max-w-sm"
            />
            <ErroCampo estado={estado} campo="nome" />
          </div>
          <ChipsPermissoes marcadas={permissoes} aoMudar={setPermissoes} />
          <div className="flex gap-2">
            <BotaoEnviar className="h-11" pendente="Criando...">
              Criar
            </BotaoEnviar>
            <Button type="button" variant="ghost" className="h-11" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function CartaoFuncao({ funcao }: { funcao: FuncaoComUso }) {
  const [estado, acao] = useActionState(salvarFuncao.bind(null, funcao.id), undefined);
  useAvisoResultado(estado);
  const { pendente, executar } = useAcao();
  const [nome, setNome] = useState(funcao.nome);
  const [permissoes, setPermissoes] = useState(funcao.permissoes);
  const alterado = nome.trim() !== funcao.nome || !mesmas(permissoes, funcao.permissoes);

  return (
    <li className="rounded-xl border bg-background p-4">
      <form action={acao} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            name="nome"
            aria-label="Nome da função"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={40}
            required
            className="h-10 max-w-xs flex-1 font-medium"
          />
          <span className="text-sm text-muted-foreground">
            {funcao.pessoas === 0 ? "ninguém" : `${funcao.pessoas} ${funcao.pessoas === 1 ? "pessoa" : "pessoas"}`}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {alterado ? (
              <BotaoEnviar size="sm" pendente="...">
                Salvar
              </BotaoEnviar>
            ) : null}
            {funcao.pessoas === 0 ? (
              <BotaoConfirmar
                rotulo={`Excluir a função ${funcao.nome}`}
                confirmar="Confirmar: excluir"
                className="h-11 sm:h-9"
                desabilitado={pendente}
                aoConfirmar={() => executar(() => excluirFuncao(funcao.id))}
              >
                Excluir
              </BotaoConfirmar>
            ) : null}
          </div>
        </div>
        <ErroCampo estado={estado} campo="nome" />
        <ChipsPermissoes marcadas={permissoes} aoMudar={setPermissoes} />
      </form>
    </li>
  );
}

export function ListaFuncoes({ funcoes }: { funcoes: FuncaoComUso[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {funcoes.map((f) => (
        <CartaoFuncao key={f.id} funcao={f} />
      ))}
    </ul>
  );
}
