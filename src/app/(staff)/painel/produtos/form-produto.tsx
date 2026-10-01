"use client";

import Link from "next/link";
import { useActionState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { BotaoEnviar, Campo, ErroCampo, marcadoCampo, Selecao, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { UploadImagem } from "@/components/staff/upload-imagem";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { textoDeCentavos } from "@/lib/dinheiro";

import { excluirProduto, salvarProduto } from "./actions";

export type ProdutoEditavel = {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  categoria_id: string;
  foto_url: string | null;
  disponivel: boolean;
  disponivel_delivery: boolean;
};

type Props = {
  restauranteId: string;
  categorias: { id: string; nome: string }[];
  produto?: ProdutoEditavel;
  categoriaInicial?: string;
};

export function FormProduto({ restauranteId, categorias, produto, categoriaInicial }: Props) {
  const [estado, acao] = useActionState(salvarProduto.bind(null, produto?.id ?? null), undefined);
  useAvisoResultado(estado);
  const { pendente, executar } = useAcao();

  return (
    <form key={estado?.chave} action={acao} className="flex flex-col gap-6">
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Nome" htmlFor="nome" className="sm:col-span-2">
            <Input id="nome" name="nome" defaultValue={valorCampo(estado, "nome", produto?.nome)} required className="h-11" />
            <ErroCampo estado={estado} campo="nome" />
          </Campo>
          <Campo rotulo="Descrição" htmlFor="descricao" className="sm:col-span-2">
            <Textarea id="descricao" name="descricao" defaultValue={valorCampo(estado, "descricao", produto?.descricao)} maxLength={500} rows={3} />
            <ErroCampo estado={estado} campo="descricao" />
          </Campo>
          <Campo rotulo="Preço (R$)" htmlFor="preco">
            <Input
              id="preco"
              name="preco"
              inputMode="decimal"
              placeholder="0,00"
              defaultValue={valorCampo(estado, "preco", produto ? textoDeCentavos(produto.preco) : "")}
              required
              className="h-11"
            />
            <ErroCampo estado={estado} campo="preco" />
          </Campo>
          <Campo rotulo="Categoria" htmlFor="categoria_id">
            <Selecao
              id="categoria_id"
              name="categoria_id"
              defaultValue={valorCampo(estado, "categoria_id", produto?.categoria_id ?? categoriaInicial)}
              required
              className="h-11"
            >
              <option value="" disabled>
                Escolha...
              </option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
            <ErroCampo estado={estado} campo="categoria_id" />
          </Campo>
          <div className="sm:col-span-2">
            <UploadImagem
              bucket="rest-produtos"
              restauranteId={restauranteId}
              name="foto_url"
              valorInicial={estado?.valores?.foto_url ?? produto?.foto_url ?? null}
              rotulo="Foto"
            />
          </div>
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              name="disponivel"
              defaultChecked={marcadoCampo(estado, "disponivel", produto?.disponivel ?? true)}
              className="size-5 accent-[var(--cor-primaria)]"
            />
            Disponível (salão)
          </label>
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              name="disponivel_delivery"
              defaultChecked={marcadoCampo(estado, "disponivel_delivery", produto?.disponivel_delivery ?? true)}
              className="size-5 accent-[var(--cor-primaria)]"
            />
            Aparece no delivery
          </label>
        </CardContent>
      </Card>

      {estado && !estado.ok && estado.mensagem ? (
        <p role="alert" className="text-sm text-destructive">
          {estado.mensagem}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <BotaoEnviar className="h-11">{produto ? "Salvar produto" : "Criar produto"}</BotaoEnviar>
        <Button variant="ghost" className="h-11" nativeButton={false} render={<Link href="/painel/produtos" />}>
          Cancelar
        </Button>
        {produto ? (
          <Button
            type="button"
            variant="destructive"
            className="ml-auto h-11"
            disabled={pendente}
            onClick={() => executar(() => excluirProduto(produto.id))}
          >
            Excluir produto
          </Button>
        ) : null}
      </div>
    </form>
  );
}
