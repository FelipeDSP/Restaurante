"use client";

import { useActionState, useState } from "react";

import { ControlesOrdem, useAcao } from "@/components/staff/acoes-cliente";
import { BotaoConfirmar } from "@/components/staff/botao-confirmar";
import { type CategoriaComProdutos, EscolherProdutos } from "@/components/staff/escolher-produtos";
import { BotaoEnviar, ErroCampo, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { alternarSetor, aplicarSetorEmProdutos, criarSetor, excluirSetor, moverSetor, renomearSetor } from "./actions";

export type Praca = { id: string; nome: string; ativa: boolean; produtos: { id: string; nome: string }[] };

// A escolha vive aqui dentro; quem chama troca a `key` quando a lista salva muda.
function EditorProdutosDaPraca({
  setorId,
  salvos,
  categorias,
  aoTerminar,
}: {
  setorId: string;
  salvos: string[];
  categorias: CategoriaComProdutos[];
  aoTerminar: () => void;
}) {
  const { pendente, executar } = useAcao();
  const [escolhidos, setEscolhidos] = useState<string[]>(salvos);
  const mudou = escolhidos.length !== salvos.length || escolhidos.some((p) => !salvos.includes(p));

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Marcar põe este setor no fim da rota do produto; desmarcar tira. A sequência (quem vem antes
        de quem) se monta no produto.
      </p>
      <EscolherProdutos categorias={categorias} escolhidos={escolhidos} aoMudar={setEscolhidos} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pendente || !mudou}
          onClick={() => executar(() => aplicarSetorEmProdutos(setorId, JSON.stringify(escolhidos)), aoTerminar)}
        >
          {escolhidos.length === 0 ? "Tirar de todos" : `Aplicar em ${escolhidos.length}`}
        </Button>
        {mudou ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEscolhidos(salvos)}>
            Desfazer
          </Button>
        ) : null}
      </div>
    </>
  );
}

// O que passa por este setor, editável aqui mesmo (antes só dava para montar a rota produto a produto).
function ProdutosDaPraca({ setor, categorias }: { setor: Praca; categorias: CategoriaComProdutos[] }) {
  const [abrir, setAbrir] = useState(false);
  const salvos = setor.produtos.map((p) => p.id);

  return (
    <section aria-label={`Produtos do setor ${setor.nome}`} className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">
          {setor.produtos.length === 0 ? (
            <span className="text-muted-foreground">Nenhum produto passa por aqui.</span>
          ) : (
            <>
              <span className="font-medium">
                {setor.produtos.length} {setor.produtos.length === 1 ? "produto" : "produtos"}:
              </span>{" "}
              <span className="text-muted-foreground">{setor.produtos.map((p) => p.nome).join(", ")}</span>
            </>
          )}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={() => setAbrir((a) => !a)}>
          {abrir ? "Fechar" : setor.produtos.length === 0 ? "Escolher produtos" : "Mudar produtos"}
        </Button>
      </div>
      {abrir ? (
        <EditorProdutosDaPraca
          key={salvos.join(",")}
          setorId={setor.id}
          salvos={salvos}
          categorias={categorias}
          aoTerminar={() => setAbrir(false)}
        />
      ) : null}
    </section>
  );
}

export function NovoSetor() {
  const [estado, acao] = useActionState(criarSetor, undefined);
  useAvisoResultado(estado);
  return (
    <form key={estado?.chave} action={acao} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor="novo-setor" className="sr-only">
          Nome do novo setor
        </label>
        <Input id="novo-setor" name="nome" placeholder="Novo setor (ex.: Churrasqueira, Chapa, Bar)" defaultValue={valorCampo(estado, "nome", "")} required className="h-11" />
        <ErroCampo estado={estado} campo="nome" />
      </div>
      <BotaoEnviar className="h-11" pendente="Criando...">
        Adicionar
      </BotaoEnviar>
    </form>
  );
}

function LinhaPraca({
  setor,
  categorias,
  primeiro,
  ultimo,
}: {
  setor: Praca;
  categorias: CategoriaComProdutos[];
  primeiro: boolean;
  ultimo: boolean;
}) {
  const [estado, acao] = useActionState(renomearSetor.bind(null, setor.id), undefined);
  useAvisoResultado(estado);
  const { pendente, executar } = useAcao();
  const [nome, setNome] = useState(setor.nome);

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <ControlesOrdem
        rotulo={setor.nome}
        primeiro={primeiro}
        ultimo={ultimo}
        desabilitado={pendente}
        aoMover={(direcao) => executar(() => moverSetor(setor.id, direcao))}
      />
      <form action={acao} className="flex flex-1 items-center gap-2">
        <label htmlFor={`setor-${setor.id}`} className="sr-only">
          Nome do setor
        </label>
        <Input
          id={`setor-${setor.id}`}
          name="nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="h-10"
          required
        />
        {nome !== setor.nome ? (
          <BotaoEnviar size="sm" pendente="...">
            Salvar
          </BotaoEnviar>
        ) : null}
      </form>
        <div className="flex items-center gap-2">
          {!setor.ativa ? <Badge variant="secondary">Inativa</Badge> : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pendente}
            onClick={() => executar(() => alternarSetor(setor.id, !setor.ativa))}
          >
            {setor.ativa ? "Desativar" : "Ativar"}
          </Button>
          <BotaoConfirmar
            rotulo={`Excluir ${setor.nome}`}
            desabilitado={pendente}
            aoConfirmar={() => executar(() => excluirSetor(setor.id))}
          />
        </div>
      </div>
      <ProdutosDaPraca setor={setor} categorias={categorias} />
    </li>
  );
}

export function ListaSetores({ setores, categorias }: { setores: Praca[]; categorias: CategoriaComProdutos[] }) {
  if (setores.length === 0) {
    return <p className="text-muted-foreground">Nenhum setor ainda. Sem setor, nenhum pedido aparece na tela da cozinha.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {setores.map((setor, i) => (
        <LinhaPraca
          key={setor.id}
          setor={setor}
          categorias={categorias}
          primeiro={i === 0}
          ultimo={i === setores.length - 1}
        />
      ))}
    </ul>
  );
}
