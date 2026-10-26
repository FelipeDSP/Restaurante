"use client";

import { Bike, Plus } from "lucide-react";
import { useActionState, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { BotaoEnviar, Campo, ErroCampo, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ResultadoAcao } from "@/lib/acoes";
import { formatarBRL, textoDeCentavos } from "@/lib/dinheiro";
import { formatarTelefone } from "@/lib/telefone";
import { cn } from "@/lib/utils";

import { alternarEntregador, criarEntregador, salvarEntregador } from "./actions";

export type Entregador = {
  id: string;
  nome: string;
  telefone: string | null;
  recebeTaxa: boolean;
  valorPorEntrega: number;
  ativo: boolean;
};

// Campos do cadastro (novo e edição): nome, telefone e como recebe por entrega.
function Campos({ estado, inicial, prefixo }: { estado: ResultadoAcao; inicial?: Entregador; prefixo: string }) {
  const [forma, setForma] = useState<"taxa" | "fixo">(
    (estado?.valores?.forma as "taxa" | "fixo" | undefined) ?? (inicial && !inicial.recebeTaxa ? "fixo" : "taxa"),
  );
  return (
    <>
      <Campo rotulo="Nome" htmlFor={`${prefixo}-nome`}>
        <Input id={`${prefixo}-nome`} name="nome" defaultValue={valorCampo(estado, "nome", inicial?.nome ?? "")} required className="h-11" />
        <ErroCampo estado={estado} campo="nome" />
      </Campo>
      <Campo rotulo="Telefone" htmlFor={`${prefixo}-telefone`}>
        <Input
          id={`${prefixo}-telefone`}
          name="telefone"
          inputMode="tel"
          placeholder="Opcional"
          defaultValue={valorCampo(estado, "telefone", inicial?.telefone ? formatarTelefone(inicial.telefone) : "")}
          className="h-11"
        />
        <ErroCampo estado={estado} campo="telefone" />
      </Campo>
      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">Recebe por entrega</legend>
        <input type="hidden" name="forma" value={forma} />
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["taxa", "A taxa de entrega"],
              ["fixo", "Valor fixo"],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              aria-pressed={forma === valor}
              onClick={() => setForma(valor)}
              className={cn("min-h-10 rounded-full border px-4 text-sm font-medium", forma === valor ? "border-primary bg-primary/10" : "hover:bg-muted")}
            >
              {rotulo}
            </button>
          ))}
          {forma === "fixo" ? (
            <Input
              name="valor"
              inputMode="decimal"
              aria-label="Valor por entrega (R$)"
              placeholder="R$ por entrega"
              defaultValue={valorCampo(estado, "valor", inicial && !inicial.recebeTaxa ? textoDeCentavos(inicial.valorPorEntrega) : "")}
              className="h-10 max-w-36"
            />
          ) : null}
        </div>
        <ErroCampo estado={estado} campo="valor" />
      </fieldset>
    </>
  );
}

export function NovoEntregador() {
  const [estado, acao] = useActionState(criarEntregador, undefined);
  useAvisoResultado(estado);
  const [aberto, setAberto] = useState(false);
  const [chaveVista, setChaveVista] = useState(estado?.chave);
  if (estado?.chave !== chaveVista) {
    setChaveVista(estado?.chave);
    if (estado?.ok) setAberto(false);
  }
  if (!aberto) {
    return (
      <Button type="button" className="h-11 w-fit" onClick={() => setAberto(true)}>
        <Plus />
        Novo entregador
      </Button>
    );
  }
  return (
    <Card>
      <CardContent>
        <form key={estado?.chave} action={acao} className="grid gap-4 sm:grid-cols-2">
          <Campos estado={estado} prefixo="novo" />
          <div className="flex gap-2 sm:col-span-2">
            <BotaoEnviar className="h-11" pendente="Salvando...">
              Cadastrar
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

function LinhaEntregador({ entregador }: { entregador: Entregador }) {
  const [estado, acao] = useActionState(salvarEntregador.bind(null, entregador.id), undefined);
  useAvisoResultado(estado);
  const { pendente, executar } = useAcao();
  const [editando, setEditando] = useState(false);
  const [chaveVista, setChaveVista] = useState(estado?.chave);
  if (estado?.chave !== chaveVista) {
    setChaveVista(estado?.chave);
    if (estado?.ok) setEditando(false);
  }

  if (editando) {
    return (
      <li className="rounded-xl border p-3">
        <form key={estado?.chave} action={acao} className="grid gap-4 sm:grid-cols-2">
          <Campos estado={estado} inicial={entregador} prefixo={`e-${entregador.id}`} />
          <div className="flex gap-2 sm:col-span-2">
            <BotaoEnviar className="h-11">Salvar</BotaoEnviar>
            <Button type="button" variant="ghost" className="h-11" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </li>
    );
  }
  return (
    <li className={cn("flex flex-wrap items-center gap-3 rounded-xl border p-3", !entregador.ativo && "opacity-60")}>
      <Bike className="size-5 text-muted-foreground" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 font-medium">
          {entregador.nome}
          {!entregador.ativo ? <Badge variant="secondary">Desativado</Badge> : null}
        </span>
        <span className="text-sm text-muted-foreground">
          {entregador.recebeTaxa ? "Recebe a taxa de entrega" : `${formatarBRL(entregador.valorPorEntrega)} por entrega`}
          {entregador.telefone ? ` · ${formatarTelefone(entregador.telefone)}` : ""}
        </span>
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditando(true)}>
        Editar
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={pendente} onClick={() => executar(() => alternarEntregador(entregador.id, !entregador.ativo))}>
        {entregador.ativo ? "Desativar" : "Ativar"}
      </Button>
    </li>
  );
}

export function ListaEntregadores({ entregadores }: { entregadores: Entregador[] }) {
  if (entregadores.length === 0) return <p className="text-muted-foreground">Nenhum entregador cadastrado.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {entregadores.map((e) => (
        <LinhaEntregador key={e.id} entregador={e} />
      ))}
    </ul>
  );
}
