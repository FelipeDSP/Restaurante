"use client";

import { Plus, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { BotaoEnviar, Campo, Selecao, useAvisoResultado } from "@/components/staff/formulario";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { controlarEstoqueDoProduto, desligarInsumoDoProduto, ligarInsumoNoProduto, mudarQuantidadeDaFicha } from "./actions";
import { numero } from "./lista-estoque";

export type InsumoDoProduto = { id: string; nome: string; unidade: string; saldo: number; quantidade: number };
export type ItemDisponivel = { id: string; nome: string; unidade: string };

function LinhaInsumo({ produtoId, insumo }: { produtoId: string; insumo: InsumoDoProduto }) {
  const [estado, acao] = useActionState(mudarQuantidadeDaFicha.bind(null, insumo.id, produtoId), undefined);
  useAvisoResultado(estado);
  const { pendente, executar } = useAcao();
  const [valor, setValor] = useState(numero(insumo.quantidade));

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{insumo.nome}</span>
        <span className="block text-xs text-muted-foreground">
          tem {numero(insumo.saldo)} {insumo.unidade} em estoque
        </span>
      </span>
      <form action={acao} className="flex items-center gap-1">
        <label htmlFor={`ins-${insumo.id}`} className="text-xs text-muted-foreground">
          gasta
        </label>
        <Input
          id={`ins-${insumo.id}`}
          name="quantidade"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="h-9 w-20 text-right"
        />
        <span className="text-sm text-muted-foreground">{insumo.unidade}</span>
        {valor !== numero(insumo.quantidade) ? (
          <BotaoEnviar size="sm" pendente="...">
            Salvar
          </BotaoEnviar>
        ) : null}
      </form>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Tirar ${insumo.nome}`}
        disabled={pendente}
        onClick={() => executar(() => desligarInsumoDoProduto(produtoId, insumo.id))}
      >
        <X />
      </Button>
    </li>
  );
}

// Bloco de estoque na tela do produto: o atalho de 1 para 1 para quem só quer contar unidades,
// e a ficha para quem controla ingrediente.
export function EstoqueDoProduto({
  produtoId,
  insumos,
  disponiveis,
}: {
  produtoId: string;
  insumos: InsumoDoProduto[];
  disponiveis: ItemDisponivel[];
}) {
  const { pendente, executar } = useAcao();
  const [abrir, setAbrir] = useState(false);
  const [item, setItem] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const livres = disponiveis.filter((d) => !insumos.some((i) => i.id === d.id));

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Estoque</h2>
          <Link href="/painel/estoque" className="text-sm underline underline-offset-4">
            Ver o estoque
          </Link>
        </div>

        {insumos.length === 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={pendente}
              onClick={() => executar(() => controlarEstoqueDoProduto(produtoId))}
            >
              Controlar o estoque deste produto
            </Button>
            <span className="text-sm text-muted-foreground">Conta unidade: quando zerar, ele some do cardápio do cliente.</span>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {insumos.map((i) => (
              <LinhaInsumo key={i.id} produtoId={produtoId} insumo={i} />
            ))}
          </ul>
        )}

        {livres.length > 0 ? (
          abrir ? (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
              <Campo rotulo="Insumo" htmlFor={`novo-insumo-${produtoId}`} className="min-w-44 flex-1">
                <Selecao id={`novo-insumo-${produtoId}`} value={item} onChange={(e) => setItem(e.target.value)} className="h-11">
                  <option value="">Escolha...</option>
                  {livres.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nome} ({d.unidade})
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo rotulo="Gasta por venda" htmlFor={`qtd-insumo-${produtoId}`} className="w-32">
                <Input
                  id={`qtd-insumo-${produtoId}`}
                  inputMode="decimal"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  className="h-11"
                />
              </Campo>
              <Button
                type="button"
                className="h-11"
                disabled={pendente || !item}
                onClick={() =>
                  executar(() => ligarInsumoNoProduto(produtoId, item, quantidade), () => {
                    setItem("");
                    setQuantidade("1");
                    setAbrir(false);
                  })
                }
              >
                Ligar
              </Button>
              <Button type="button" variant="ghost" className="h-11" onClick={() => setAbrir(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setAbrir(true)}>
              <Plus />
              Usar um insumo que já existe
            </Button>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
