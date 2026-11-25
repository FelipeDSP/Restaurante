"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { BotaoConfirmar } from "@/components/staff/botao-confirmar";
import { type CategoriaComProdutos, EscolherProdutos } from "@/components/staff/escolher-produtos";
import { BotaoEnviar, Campo, ErroCampo, Selecao, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatarBRL } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";

import {
  alternarItem,
  aplicarItemEmProdutos,
  contar,
  criarItem,
  excluirItem,
  movimentar,
  mudarQuantidadeDaFicha,
  salvarItem,
} from "./actions";

export const UNIDADES = [
  { valor: "un", nome: "unidade" },
  { valor: "kg", nome: "quilo" },
  { valor: "g", nome: "grama" },
  { valor: "l", nome: "litro" },
  { valor: "ml", nome: "mililitro" },
];

export type MovimentoEstoque = {
  id: string;
  quantidade: number;
  motivo: string;
  observacao: string | null;
  custo_total: number | null;
  saldo_depois: number;
  criado_em: string;
  quem: string | null;
};

export type ItemEstoque = {
  id: string;
  nome: string;
  unidade: string;
  saldo: number;
  minimo: number;
  ativo: boolean;
  // Em quais produtos ele sai, e quanto sai de cada vez.
  produtos: { id: string; nome: string; quantidade: number }[];
  movimentos: MovimentoEstoque[];
};

const MOTIVO: Record<string, string> = {
  compra: "Entrada",
  venda: "Venda",
  perda: "Baixa",
  ajuste: "Contagem",
  devolucao: "Cancelamento",
};

// "3" e não "3,000"; "0,18" e não "0,180".
export function numero(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(valor);
}

function Saldo({ item }: { item: ItemEstoque }) {
  // Item recém-criado, sem nenhum movimento, não é "acabou": ninguém contou ainda.
  const semHistorico = item.movimentos.length === 0 && item.saldo === 0;
  const acabou = !semHistorico && item.saldo <= 0;
  const baixo = !acabou && !semHistorico && item.minimo > 0 && item.saldo < item.minimo;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className={cn("text-lg font-bold tabular-nums", acabou && "text-destructive", semHistorico && "text-muted-foreground")}>
        {numero(item.saldo)} {item.unidade}
      </span>
      {semHistorico ? <Badge variant="outline">Sem contagem ainda</Badge> : null}
      {acabou ? <Badge variant="destructive">{item.saldo < 0 ? "Negativo" : "Acabou"}</Badge> : null}
      {baixo ? <Badge variant="secondary">Baixo</Badge> : null}
      {!item.ativo ? <Badge variant="outline">Desligado</Badge> : null}
    </span>
  );
}

// Criar já pergunta quanto tem: era o passo que faltava e obrigava a procurar o item na lista
// depois para dar entrada. "Avisar abaixo de" saiu daqui (é ajuste fino, fica dentro do item).
function NovoItem({ aoCriar }: { aoCriar: (id: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao] = useActionState(criarItem, undefined);
  const [visto, setVisto] = useState(estado?.chave);
  useAvisoResultado(estado);

  if (estado?.chave !== visto) {
    setVisto(estado?.chave);
    if (estado?.ok && estado.id) {
      // Fecha o formulário e abre o item novo: é lá que está o próximo passo.
      setAberto(false);
      aoCriar(estado.id);
    }
  }

  if (!aberto) {
    return (
      <Button type="button" className="h-11 self-start" onClick={() => setAberto(true)}>
        <Plus />
        Novo item
      </Button>
    );
  }

  return (
    <Card>
      <CardContent>
        <form key={estado?.chave} action={acao} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Nome" htmlFor="nome">
              <Input id="nome" name="nome" placeholder="Pão de hambúrguer" defaultValue={valorCampo(estado, "nome", "")} maxLength={80} required autoFocus className="h-11" />
              <ErroCampo estado={estado} campo="nome" />
            </Campo>
            <Campo rotulo="Unidade" htmlFor="unidade">
              <Selecao id="unidade" name="unidade" defaultValue={valorCampo(estado, "unidade", "un")} className="h-11">
                {UNIDADES.map((u) => (
                  <option key={u.valor} value={u.valor}>
                    {u.valor} ({u.nome})
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Quanto você tem agora" htmlFor="quantidade" dica="dá para deixar em branco e contar depois">
              <Input id="quantidade" name="quantidade" inputMode="decimal" placeholder="0" defaultValue={valorCampo(estado, "quantidade", "")} className="h-11" />
              <ErroCampo estado={estado} campo="quantidade" />
            </Campo>
          </div>
          <div className="flex gap-2">
            <BotaoEnviar className="h-11" pendente="Criando...">
              Criar item
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

// Entrada, baixa e contagem: três formulários curtos, um de cada vez.
function Mexer({ item }: { item: ItemEstoque }) {
  const [aba, setAba] = useState<"compra" | "perda" | "contagem" | null>(null);
  const [estadoMov, acaoMov] = useActionState(movimentar.bind(null, item.id), undefined);
  const [estadoCont, acaoCont] = useActionState(contar.bind(null, item.id), undefined);
  useAvisoResultado(estadoMov);
  useAvisoResultado(estadoCont);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={aba === "compra" ? "default" : "outline"} size="sm" onClick={() => setAba(aba === "compra" ? null : "compra")}>
          Entrada
        </Button>
        <Button type="button" variant={aba === "perda" ? "default" : "outline"} size="sm" onClick={() => setAba(aba === "perda" ? null : "perda")}>
          Baixa
        </Button>
        <Button type="button" variant={aba === "contagem" ? "default" : "outline"} size="sm" onClick={() => setAba(aba === "contagem" ? null : "contagem")}>
          Contagem
        </Button>
      </div>

      {aba === "compra" || aba === "perda" ? (
        <form key={`${aba}-${estadoMov?.chave ?? ""}`} action={acaoMov} className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <input type="hidden" name="motivo" value={aba} />
          <Campo rotulo={`Quanto ${aba === "compra" ? "entrou" : "saiu"} (${item.unidade})`} htmlFor={`qtd-${item.id}`} className="w-36">
            <Input id={`qtd-${item.id}`} name="quantidade" inputMode="decimal" required className="h-11" autoFocus />
          </Campo>
          {aba === "compra" ? (
            <Campo rotulo="Custo total (R$)" htmlFor={`custo-${item.id}`} className="w-36" dica="opcional">
              <Input id={`custo-${item.id}`} name="custo" inputMode="decimal" placeholder="0,00" className="h-11" />
            </Campo>
          ) : null}
          <Campo rotulo="Motivo" htmlFor={`obs-${item.id}`} className="min-w-44 flex-1">
            <Input
              id={`obs-${item.id}`}
              name="observacao"
              maxLength={300}
              placeholder={aba === "compra" ? "Nota, fornecedor..." : "Quebra, vencido, uso interno..."}
              className="h-11"
            />
          </Campo>
          <BotaoEnviar className="h-11">{aba === "compra" ? "Dar entrada" : "Dar baixa"}</BotaoEnviar>
          <ErroCampo estado={estadoMov} campo="quantidade" />
        </form>
      ) : null}

      {aba === "contagem" ? (
        <form key={estadoCont?.chave} action={acaoCont} className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <Campo rotulo={`Tem quanto de verdade (${item.unidade})`} htmlFor={`cont-${item.id}`} className="w-44">
            <Input id={`cont-${item.id}`} name="saldo" inputMode="decimal" defaultValue={numero(item.saldo)} required className="h-11" autoFocus />
          </Campo>
          <Campo rotulo="Observação" htmlFor={`cobs-${item.id}`} className="min-w-44 flex-1">
            <Input id={`cobs-${item.id}`} name="observacao" maxLength={300} placeholder="Contagem do dia" className="h-11" />
          </Campo>
          <BotaoEnviar className="h-11">Registrar contagem</BotaoEnviar>
          <ErroCampo estado={estadoCont} campo="saldo" />
        </form>
      ) : null}
    </div>
  );
}

// A escolha vive aqui dentro; a `key` de quem chama a recria quando a ficha salva muda.
function EditorProdutosDoItem({
  itemId,
  unidade,
  salvos,
  categorias,
  aoTerminar,
}: {
  itemId: string;
  unidade: string;
  salvos: string[];
  categorias: CategoriaComProdutos[];
  aoTerminar: () => void;
}) {
  const { pendente, executar } = useAcao();
  const [escolhidos, setEscolhidos] = useState<string[]>(salvos);
  const [quantidade, setQuantidade] = useState("1");
  const mudou = escolhidos.length !== salvos.length || escolhidos.some((p) => !salvos.includes(p));
  const novos = escolhidos.filter((p) => !salvos.includes(p)).length;

  return (
    <>
      <EscolherProdutos categorias={categorias} escolhidos={escolhidos} aoMudar={setEscolhidos} />
      <div className="flex flex-wrap items-end gap-2">
        {novos > 0 ? (
          <Campo rotulo={`Quanto sai por venda (${unidade})`} htmlFor={`fq-${itemId}`} className="w-44">
            <Input
              id={`fq-${itemId}`}
              inputMode="decimal"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              className="h-11"
            />
          </Campo>
        ) : null}
        <Button
          type="button"
          size="sm"
          className="h-11"
          disabled={pendente || !mudou}
          onClick={() =>
            executar(
              () => aplicarItemEmProdutos(itemId, JSON.stringify(escolhidos), Number(quantidade.replace(",", ".")) || 0),
              aoTerminar,
            )
          }
        >
          {escolhidos.length === 0 ? "Tirar de todos" : `Aplicar em ${escolhidos.length}`}
        </Button>
        {mudou ? (
          <Button type="button" variant="ghost" size="sm" className="h-11" onClick={() => setEscolhidos(salvos)}>
            Desfazer
          </Button>
        ) : null}
      </div>
    </>
  );
}

function LinhaDaFicha({ item, produto }: { item: ItemEstoque; produto: { id: string; nome: string; quantidade: number } }) {
  const [estado, acao] = useActionState(mudarQuantidadeDaFicha.bind(null, item.id, produto.id), undefined);
  useAvisoResultado(estado);
  const [valor, setValor] = useState(numero(produto.quantidade));

  return (
    <li className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm">{produto.nome}</span>
      <form action={acao} className="flex items-center gap-1">
        <label htmlFor={`fic-${item.id}-${produto.id}`} className="sr-only">
          Quanto sai de {item.nome} em {produto.nome}
        </label>
        <Input
          id={`fic-${item.id}-${produto.id}`}
          name="quantidade"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="h-9 w-20 text-right"
        />
        <span className="text-sm text-muted-foreground">{item.unidade}</span>
        {valor !== numero(produto.quantidade) ? (
          <BotaoEnviar size="sm" pendente="...">
            Salvar
          </BotaoEnviar>
        ) : null}
      </form>
    </li>
  );
}

function Ficha({ item, categorias }: { item: ItemEstoque; categorias: CategoriaComProdutos[] }) {
  const [abrir, setAbrir] = useState(false);
  const salvos = item.produtos.map((p) => p.id);

  return (
    <section aria-label={`Produtos que usam ${item.nome}`} className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">
          {item.produtos.length === 0 ? (
            <span className="text-muted-foreground">Não sai em nenhum produto ainda.</span>
          ) : (
            <span className="font-medium">
              Sai em {item.produtos.length} {item.produtos.length === 1 ? "produto" : "produtos"}
            </span>
          )}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={() => setAbrir((a) => !a)}>
          {abrir ? "Fechar" : item.produtos.length === 0 ? "Escolher produtos" : "Mudar produtos"}
        </Button>
      </div>
      {item.produtos.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {item.produtos.map((p) => (
            <LinhaDaFicha key={p.id} item={item} produto={p} />
          ))}
        </ul>
      ) : null}
      {abrir ? (
        <EditorProdutosDoItem
          key={salvos.join(",")}
          itemId={item.id}
          unidade={item.unidade}
          salvos={salvos}
          categorias={categorias}
          aoTerminar={() => setAbrir(false)}
        />
      ) : null}
    </section>
  );
}

function Extrato({ item, fuso }: { item: ItemEstoque; fuso: string }) {
  if (item.movimentos.length === 0) return null;
  const data = (iso: string) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(
      new Date(iso),
    );
  return (
    <section aria-label={`Extrato de ${item.nome}`} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">Últimos movimentos</h3>
      <ul className="flex flex-col divide-y rounded-lg border">
        {item.movimentos.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2 text-sm">
            <span className={cn("w-20 shrink-0 font-bold tabular-nums", m.quantidade < 0 ? "text-destructive" : "text-emerald-700")}>
              {m.quantidade > 0 ? "+" : ""}
              {numero(m.quantidade)}
            </span>
            <span className="font-medium">{MOTIVO[m.motivo] ?? m.motivo}</span>
            <span className="text-muted-foreground">{data(m.criado_em)}</span>
            {m.quem ? <span className="text-muted-foreground">· {m.quem}</span> : null}
            {m.custo_total ? <span className="text-muted-foreground">· {formatarBRL(m.custo_total)}</span> : null}
            {m.observacao ? <span className="min-w-0 flex-1 truncate text-muted-foreground">· {m.observacao}</span> : null}
            <span className="ml-auto tabular-nums text-muted-foreground">ficou {numero(m.saldo_depois)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CartaoItem({
  item,
  categorias,
  fuso,
  abrir,
  aoAlternar,
}: {
  item: ItemEstoque;
  categorias: CategoriaComProdutos[];
  fuso: string;
  // Aberto/fechado mora na lista: o item recém-criado já nasce aberto.
  abrir: boolean;
  aoAlternar: () => void;
}) {
  const [estado, acao] = useActionState(salvarItem.bind(null, item.id), undefined);
  useAvisoResultado(estado);
  const { pendente, executar } = useAcao();

  return (
    <li className="flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{item.nome}</span>
          <Saldo item={item} />
        </span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={aoAlternar}>
            {abrir ? "Fechar" : "Abrir"}
          </Button>
        </div>
      </div>

      <Mexer item={item} />

      {abrir ? (
        <>
          <Ficha item={item} categorias={categorias} />
          <Extrato item={item} fuso={fuso} />
          <form key={estado?.chave} action={acao} className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
            <Campo rotulo="Nome" htmlFor={`n-${item.id}`} className="min-w-44 flex-1">
              <Input id={`n-${item.id}`} name="nome" defaultValue={valorCampo(estado, "nome", item.nome)} maxLength={80} required className="h-11" />
              <ErroCampo estado={estado} campo="nome" />
            </Campo>
            <Campo rotulo="Unidade" htmlFor={`u-${item.id}`} className="w-32">
              <Selecao id={`u-${item.id}`} name="unidade" defaultValue={valorCampo(estado, "unidade", item.unidade)} className="h-11">
                {UNIDADES.map((u) => (
                  <option key={u.valor} value={u.valor}>
                    {u.valor}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Avisar abaixo de" htmlFor={`m-${item.id}`} className="w-32">
              <Input id={`m-${item.id}`} name="minimo" inputMode="decimal" defaultValue={valorCampo(estado, "minimo", numero(item.minimo))} className="h-11" />
            </Campo>
            <BotaoEnviar className="h-11">Salvar</BotaoEnviar>
            <div className="ml-auto flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={pendente} onClick={() => executar(() => alternarItem(item.id, !item.ativo))}>
                {item.ativo ? "Desligar" : "Ligar"}
              </Button>
              <BotaoConfirmar
                rotulo={`Excluir ${item.nome}`}
                desabilitado={pendente}
                aoConfirmar={() => executar(() => excluirItem(item.id))}
              />
            </div>
          </form>
        </>
      ) : null}
    </li>
  );
}

// A tela inteira num componente só, porque o "novo item" precisa abrir o cartão que ele criou.
export function Estoque({
  itens,
  categorias,
  fuso,
}: {
  itens: ItemEstoque[];
  categorias: CategoriaComProdutos[];
  fuso: string;
}) {
  // Nada fecha sozinho: cada cartão fica como a pessoa deixou, e o item recém-criado já nasce aberto.
  const [abertos, setAbertos] = useState<string[]>([]);
  const alternar = (id: string) => setAbertos((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));

  return (
    <>
      <NovoItem aoCriar={(id) => setAbertos((atual) => [...atual, id])} />
      {itens.length === 0 ? (
        <p className="text-muted-foreground">
          Nenhum item no estoque. Crie um item (uma bebida, um pão, a carne) e ligue nos produtos que gastam ele: quando
          acabar, esses produtos somem sozinhos do cardápio do cliente.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {itens.map((item) => (
            <CartaoItem
              key={item.id}
              item={item}
              categorias={categorias}
              fuso={fuso}
              abrir={abertos.includes(item.id)}
              aoAlternar={() => alternar(item.id)}
            />
          ))}
        </ul>
      )}
    </>
  );
}
