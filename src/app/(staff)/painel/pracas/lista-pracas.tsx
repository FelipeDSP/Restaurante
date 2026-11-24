"use client";

import { useActionState, useState } from "react";

import { ControlesOrdem, useAcao } from "@/components/staff/acoes-cliente";
import { BotaoConfirmar } from "@/components/staff/botao-confirmar";
import { type CategoriaComProdutos, EscolherProdutos } from "@/components/staff/escolher-produtos";
import { BotaoEnviar, ErroCampo, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { alternarPraca, aplicarPracaEmProdutos, criarPraca, excluirPraca, moverPraca, renomearPraca } from "./actions";

export type Praca = { id: string; nome: string; ativa: boolean; produtos: { id: string; nome: string }[] };

// A escolha vive aqui dentro; quem chama troca a `key` quando a lista salva muda.
function EditorProdutosDaPraca({
  pracaId,
  salvos,
  categorias,
  aoTerminar,
}: {
  pracaId: string;
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
          onClick={() => executar(() => aplicarPracaEmProdutos(pracaId, JSON.stringify(escolhidos)), aoTerminar)}
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
function ProdutosDaPraca({ praca, categorias }: { praca: Praca; categorias: CategoriaComProdutos[] }) {
  const [abrir, setAbrir] = useState(false);
  const salvos = praca.produtos.map((p) => p.id);

  return (
    <section aria-label={`Produtos do setor ${praca.nome}`} className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">
          {praca.produtos.length === 0 ? (
            <span className="text-muted-foreground">Nenhum produto passa por aqui.</span>
          ) : (
            <>
              <span className="font-medium">
                {praca.produtos.length} {praca.produtos.length === 1 ? "produto" : "produtos"}:
              </span>{" "}
              <span className="text-muted-foreground">{praca.produtos.map((p) => p.nome).join(", ")}</span>
            </>
          )}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={() => setAbrir((a) => !a)}>
          {abrir ? "Fechar" : praca.produtos.length === 0 ? "Escolher produtos" : "Mudar produtos"}
        </Button>
      </div>
      {abrir ? (
        <EditorProdutosDaPraca
          key={salvos.join(",")}
          pracaId={praca.id}
          salvos={salvos}
          categorias={categorias}
          aoTerminar={() => setAbrir(false)}
        />
      ) : null}
    </section>
  );
}

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

function LinhaPraca({
  praca,
  categorias,
  primeiro,
  ultimo,
}: {
  praca: Praca;
  categorias: CategoriaComProdutos[];
  primeiro: boolean;
  ultimo: boolean;
}) {
  const [estado, acao] = useActionState(renomearPraca.bind(null, praca.id), undefined);
  useAvisoResultado(estado);
  const { pendente, executar } = useAcao();
  const [nome, setNome] = useState(praca.nome);

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
          <BotaoConfirmar
            rotulo={`Excluir ${praca.nome}`}
            desabilitado={pendente}
            aoConfirmar={() => executar(() => excluirPraca(praca.id))}
          />
        </div>
      </div>
      <ProdutosDaPraca praca={praca} categorias={categorias} />
    </li>
  );
}

export function ListaPracas({ pracas, categorias }: { pracas: Praca[]; categorias: CategoriaComProdutos[] }) {
  if (pracas.length === 0) {
    return <p className="text-muted-foreground">Nenhuma praça ainda. Sem praças, nenhum pedido aparece na tela da cozinha.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {pracas.map((praca, i) => (
        <LinhaPraca
          key={praca.id}
          praca={praca}
          categorias={categorias}
          primeiro={i === 0}
          ultimo={i === pracas.length - 1}
        />
      ))}
    </ul>
  );
}
