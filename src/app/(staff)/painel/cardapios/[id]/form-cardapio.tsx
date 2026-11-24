"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { BotaoConfirmar } from "@/components/staff/botao-confirmar";
import { EscolherDias } from "@/components/staff/escolher-dias";
import { type CategoriaComProdutos, EscolherProdutos } from "@/components/staff/escolher-produtos";
import { BotaoEnviar, Campo, ErroCampo, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { excluirCardapio, salvarCardapio } from "../actions";

export type CardapioEditavel = { id: string; nome: string; dias: number[]; abre: string; fecha: string };
export type CategoriaDoCardapio = CategoriaComProdutos;

type Props = {
  cardapio: CardapioEditavel;
  categorias: CategoriaDoCardapio[];
  produtosDoCardapio: string[];
};

export function FormCardapio({ cardapio, categorias, produtosDoCardapio }: Props) {
  const [estado, acao] = useActionState(salvarCardapio.bind(null, cardapio.id), undefined);
  useAvisoResultado(estado);
  const { pendente, executar } = useAcao();
  // Fora do <form>: sobrevive à remontagem depois de um erro (o React 19 reseta o formulário).
  const [dias, setDias] = useState<number[]>(cardapio.dias);
  const [produtos, setProdutos] = useState<string[]>(produtosDoCardapio);

  return (
    <form key={estado?.chave} action={acao} className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Nome" htmlFor="nome">
              <Input
                id="nome"
                name="nome"
                defaultValue={valorCampo(estado, "nome", cardapio.nome)}
                maxLength={60}
                required
                className="h-11"
              />
              <ErroCampo estado={estado} campo="nome" />
            </Campo>
            <Campo rotulo="Começa" htmlFor="abre">
              <Input
                id="abre"
                name="abre"
                type="time"
                defaultValue={valorCampo(estado, "abre", cardapio.abre.slice(0, 5))}
                required
                className="h-11"
              />
              <ErroCampo estado={estado} campo="abre" />
            </Campo>
            <Campo rotulo="Termina" htmlFor="fecha">
              <Input
                id="fecha"
                name="fecha"
                type="time"
                defaultValue={valorCampo(estado, "fecha", cardapio.fecha.slice(0, 5))}
                required
                className="h-11"
              />
              <ErroCampo estado={estado} campo="fecha" />
            </Campo>
          </div>
          <Campo rotulo="Dias" htmlFor="dias">
            <EscolherDias dias={dias} aoMudar={setDias} />
          </Campo>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">
              Produtos deste cardápio{produtos.length > 0 ? ` (${produtos.length})` : ""}
            </h2>
            <Link href="/painel/produtos" className="text-sm underline underline-offset-4">
              Editar produtos
            </Link>
          </div>
          <input type="hidden" name="produtos" value={JSON.stringify(produtos)} />
          <EscolherProdutos categorias={categorias} escolhidos={produtos} aoMudar={setProdutos} />
        </CardContent>
      </Card>

      {estado && !estado.ok && estado.mensagem ? (
        <p role="alert" className="text-sm text-destructive">
          {estado.mensagem}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <BotaoEnviar className="h-11">Salvar cardápio</BotaoEnviar>
        <Button variant="ghost" className="h-11" nativeButton={false} render={<Link href="/painel/cardapios" />}>
          Voltar
        </Button>
        <span className="ml-auto">
          <BotaoConfirmar
            rotulo="Excluir cardápio"
            icone={false}
            className="h-11 text-destructive"
            desabilitado={pendente}
            aoConfirmar={() => executar(() => excluirCardapio(cardapio.id))}
          >
            Excluir cardápio
          </BotaoConfirmar>
        </span>
      </div>
    </form>
  );
}
