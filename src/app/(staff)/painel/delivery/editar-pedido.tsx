"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Plus, Search, Undo2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EscolherOpcoes, type ProdutoComOpcoes } from "@/components/adicionais/escolher-opcoes";
import { useAcao } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type AdicionalEscolhido, precoDasOpcoes, resumoAdicionais } from "@/lib/adicionais";
import { centavosDeTexto, formatarBRL, textoDeCentavos } from "@/lib/dinheiro";
import { FORMAS_PAGAMENTO } from "@/lib/rotulos";
import { cn } from "@/lib/utils";

import { dadosParaEdicao, type EdicaoPedido, editarPedido } from "./actions";
import type { PedidoDelivery } from "./cartao-pedido";

type Dados = Awaited<ReturnType<typeof dadosParaEdicao>>;
type ItemNovo = { chave: string; produto: ProdutoComOpcoes; quantidade: number; observacao: string; adicionais: AdicionalEscolhido[] };

const CAMPOS_ENDERECO = [
  { chave: "rua", rotulo: "Rua", largura: "sm:col-span-4" },
  { chave: "numero", rotulo: "Número", largura: "sm:col-span-2" },
  { chave: "complemento", rotulo: "Complemento", largura: "sm:col-span-3" },
  { chave: "referencia", rotulo: "Referência", largura: "sm:col-span-3" },
] as const;

function Rotulo({ texto, children, className }: { texto: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm font-medium", className)}>
      {texto}
      {children}
    </label>
  );
}

// Janela para o dono/caixa corrigir um delivery em andamento: itens, cliente, endereço, taxa e pagamento.
// Só o que mudou vai para o banco, que recalcula o total e registra cada alteração.
export function EditarPedido({ pedido, aberto, aoFechar }: { pedido: PedidoDelivery; aberto: boolean; aoFechar: () => void }) {
  const [ancora, setAncora] = useState<HTMLSpanElement | null>(null);
  return (
    <Dialog.Root open={aberto} onOpenChange={(a) => (a ? null : aoFechar())}>
      <span ref={setAncora} hidden />
      <Dialog.Portal container={ancora?.parentElement ?? undefined}>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Popup className="fixed inset-x-0 bottom-0 z-40 flex max-h-[94dvh] flex-col overflow-hidden rounded-t-2xl bg-background text-foreground shadow-xl outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
          {aberto ? <Conteudo key={pedido.id} pedido={pedido} aoFechar={aoFechar} /> : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Conteudo({ pedido, aoFechar }: { pedido: PedidoDelivery; aoFechar: () => void }) {
  const { pendente, executar } = useAcao();
  const e = pedido.endereco;
  const [nome, setNome] = useState(pedido.clienteNome);
  const [telefone, setTelefone] = useState(pedido.clienteTelefone);
  const [endereco, setEndereco] = useState<Record<string, string>>({
    rua: e.rua ?? "",
    numero: e.numero ?? "",
    complemento: e.complemento ?? "",
    referencia: e.referencia ?? "",
    bairro: e.bairro ?? "",
  });
  const [bairroId, setBairroId] = useState<string | null>(pedido.bairroId);
  const [taxa, setTaxa] = useState(textoDeCentavos(pedido.taxaEntrega));
  const [forma, setForma] = useState(pedido.formaPrevista ?? "pix");
  const [troco, setTroco] = useState(pedido.trocoPara ? textoDeCentavos(pedido.trocoPara) : "");
  const [observacao, setObservacao] = useState(pedido.observacao ?? "");
  const [removidos, setRemovidos] = useState<Set<string>>(new Set());
  const [novos, setNovos] = useState<ItemNovo[]>([]);
  const [motivo, setMotivo] = useState("");

  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [escolhendo, setEscolhendo] = useState(false);
  const [busca, setBusca] = useState("");
  const [produto, setProduto] = useState<ProdutoComOpcoes | null>(null);

  function abrirCardapio() {
    setEscolhendo(true);
    void carregarDados();
  }

  // Cardápio e bairros só são buscados quando precisa (ao adicionar item ou trocar o bairro).
  async function carregarDados() {
    if (dados || carregando) return;
    setCarregando(true);
    try {
      setDados(await dadosParaEdicao());
    } catch {
      toast.error("Não foi possível carregar o cardápio. Confira a internet.");
    } finally {
      setCarregando(false);
    }
  }

  const taxaCentavos = centavosDeTexto(taxa);
  const subtotal =
    pedido.itens.filter((i) => !removidos.has(i.id)).reduce((s, i) => s + i.total, 0) +
    novos.reduce((s, n) => s + (n.produto.preco + precoDasOpcoes(n.adicionais)) * n.quantidade, 0);
  const total = subtotal + (taxaCentavos ?? 0);
  const itensRestantes = pedido.itens.length - removidos.size + novos.length;

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (dados?.cardapio ?? [])
      .map((c) => ({ ...c, produtos: c.produtos.filter((p) => !termo || p.nome.toLowerCase().includes(termo)) }))
      .filter((c) => c.produtos.length > 0);
  }, [dados, busca]);

  function salvar() {
    if (taxaCentavos === null) return toast.error("Taxa de entrega inválida.");
    const trocoCentavos = forma === "dinheiro" && troco.trim() ? centavosDeTexto(troco) : null;
    if (forma === "dinheiro" && troco.trim() && trocoCentavos === null) return toast.error("Troco inválido.");

    // Só o que mudou.
    const campos: EdicaoPedido["campos"] = {};
    if (nome.trim() !== pedido.clienteNome) campos.cliente_nome = nome.trim();
    if (telefone.replace(/\D/g, "") !== pedido.clienteTelefone.replace(/\D/g, "")) campos.cliente_telefone = telefone;
    const enderecoMudou: Record<string, string> = {};
    for (const chave of ["rua", "numero", "complemento", "referencia", "bairro"] as const) {
      if ((endereco[chave] ?? "").trim() !== (e[chave] ?? "")) enderecoMudou[chave] = (endereco[chave] ?? "").trim();
    }
    if (Object.keys(enderecoMudou).length) campos.endereco = enderecoMudou;
    if (bairroId !== pedido.bairroId) campos.bairro_id = bairroId;
    if (taxaCentavos !== pedido.taxaEntrega) campos.taxa_entrega = taxaCentavos;
    if (forma !== pedido.formaPrevista) campos.forma_pagamento_prevista = forma as NonNullable<EdicaoPedido["campos"]>["forma_pagamento_prevista"];
    if ((trocoCentavos ?? null) !== (forma === "dinheiro" ? pedido.trocoPara : null)) campos.troco_para = trocoCentavos;
    if (observacao.trim() !== (pedido.observacao ?? "")) campos.observacao = observacao.trim();

    const entrada: EdicaoPedido = {
      pedidoId: pedido.id,
      campos,
      remover: [...removidos],
      adicionar: novos.map((n) => ({
        produto_id: n.produto.id,
        quantidade: n.quantidade,
        observacao: n.observacao,
        adicionais: n.adicionais.map((a) => a.id),
      })),
      motivo,
    };
    if (!Object.keys(campos).length && !entrada.remover.length && !entrada.adicionar.length) return aoFechar();
    executar(() => editarPedido(entrada), aoFechar);
  }

  return (
    <>
      <div className="flex items-center justify-between border-b p-4">
        <Dialog.Title className="text-lg font-semibold">Editar pedido nº {pedido.numero}</Dialog.Title>
        <Dialog.Close aria-label="Fechar" className="flex size-11 items-center justify-center rounded-full hover:bg-muted">
          <X className="size-5" />
        </Dialog.Close>
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        <section className="flex flex-col gap-2" aria-label="Itens">
          <h3 className="font-semibold">Itens</h3>
          <ul className="flex flex-col divide-y rounded-lg border">
            {pedido.itens.map((item) => {
              const sai = removidos.has(item.id);
              return (
                <li key={item.id} className={cn("flex items-center gap-3 p-2 text-sm", sai && "text-muted-foreground")}>
                  <span className={cn("flex flex-1 flex-col", sai && "line-through")}>
                    <span>
                      {item.quantidade}× {item.nome}
                    </span>
                    {item.adicionais.length ? <span className="text-xs">{resumoAdicionais(item.adicionais)}</span> : null}
                  </span>
                  <span className={cn("tabular-nums", sai && "line-through")}>{formatarBRL(item.total)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setRemovidos((atual) => {
                        const proximo = new Set(atual);
                        if (proximo.has(item.id)) proximo.delete(item.id);
                        else proximo.add(item.id);
                        return proximo;
                      })
                    }
                  >
                    {sai ? <Undo2 /> : <X />}
                    {sai ? "Manter" : "Tirar"}
                  </Button>
                </li>
              );
            })}
            {novos.map((n) => (
              <li key={n.chave} className="flex items-center gap-3 bg-green-50 p-2 text-sm">
                <span className="flex flex-1 flex-col">
                  <span>
                    <strong>Novo:</strong> {n.quantidade}× {n.produto.nome}
                  </span>
                  {n.adicionais.length ? <span className="text-xs text-muted-foreground">{resumoAdicionais(n.adicionais)}</span> : null}
                  {n.observacao ? <span className="text-xs text-muted-foreground">Obs.: {n.observacao}</span> : null}
                </span>
                <span className="tabular-nums">{formatarBRL((n.produto.preco + precoDasOpcoes(n.adicionais)) * n.quantidade)}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setNovos((l) => l.filter((x) => x.chave !== n.chave))}>
                  <X />
                  Tirar
                </Button>
              </li>
            ))}
          </ul>

          {escolhendo ? (
            <div className="flex flex-col gap-2 rounded-lg border p-2">
              <div className="flex items-center gap-2">
                <Search className="size-4 text-muted-foreground" aria-hidden />
                <Input value={busca} onChange={(ev) => setBusca(ev.target.value)} placeholder="Buscar produto" aria-label="Buscar produto" className="h-10" autoFocus />
                <Button type="button" variant="ghost" size="sm" onClick={() => setEscolhendo(false)}>
                  Fechar
                </Button>
              </div>
              {carregando ? <p className="p-2 text-sm text-muted-foreground">Carregando…</p> : null}
              <div className="flex max-h-64 flex-col gap-3 overflow-y-auto">
                {produtosFiltrados.map((c) => (
                  <div key={c.id} className="flex flex-col">
                    <span className="px-1 text-xs font-semibold text-muted-foreground uppercase">{c.nome}</span>
                    {c.produtos.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="flex min-h-11 items-center justify-between gap-2 rounded-md px-2 text-left text-sm hover:bg-muted"
                        onClick={() => setProduto({ id: p.id, nome: p.nome, preco: p.preco, descricao: p.descricao, grupos: p.grupos })}
                      >
                        {p.nome}
                        <span className="tabular-nums text-muted-foreground">{formatarBRL(p.preco)}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" className="h-11 self-start" onClick={abrirCardapio}>
              <Plus />
              Adicionar item
            </Button>
          )}
          {removidos.size > 0 ? (
            <Input value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Motivo de tirar o item (opcional)" className="h-10" maxLength={200} />
          ) : null}
        </section>

        <section className="grid gap-3 sm:grid-cols-2" aria-label="Cliente">
          <h3 className="font-semibold sm:col-span-2">Cliente</h3>
          <Rotulo texto="Nome">
            <Input value={nome} onChange={(ev) => setNome(ev.target.value)} maxLength={120} className="h-10" />
          </Rotulo>
          <Rotulo texto="Telefone">
            <Input value={telefone} onChange={(ev) => setTelefone(ev.target.value)} inputMode="tel" maxLength={30} className="h-10" />
          </Rotulo>
        </section>

        <section className="grid gap-3 sm:grid-cols-6" aria-label="Endereço">
          <h3 className="font-semibold sm:col-span-6">Endereço</h3>
          {CAMPOS_ENDERECO.map((c) => (
            <Rotulo key={c.chave} texto={c.rotulo} className={c.largura}>
              <Input
                value={endereco[c.chave] ?? ""}
                onChange={(ev) => setEndereco((atual) => ({ ...atual, [c.chave]: ev.target.value }))}
                maxLength={200}
                className="h-10"
              />
            </Rotulo>
          ))}
          {pedido.bairroId ? (
            <Rotulo texto="Bairro" className="sm:col-span-3">
              <select
                value={bairroId ?? ""}
                onFocus={() => void carregarDados()}
                onChange={(ev) => {
                  const novo = ev.target.value || null;
                  setBairroId(novo);
                  const taxaBairro = dados?.bairros.find((b) => b.id === novo)?.taxa;
                  if (taxaBairro !== undefined) setTaxa(textoDeCentavos(taxaBairro));
                }}
                className="h-10 rounded-md border bg-background px-2"
              >
                <option value={pedido.bairroId}>{pedido.bairro ?? "Bairro atual"}</option>
                {(dados?.bairros ?? [])
                  .filter((b) => b.id !== pedido.bairroId)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nome} ({formatarBRL(b.taxa)})
                    </option>
                  ))}
              </select>
            </Rotulo>
          ) : (
            <Rotulo texto="Bairro" className="sm:col-span-3">
              <Input value={endereco.bairro ?? ""} onChange={(ev) => setEndereco((a) => ({ ...a, bairro: ev.target.value }))} maxLength={200} className="h-10" />
            </Rotulo>
          )}
          <Rotulo texto="Taxa de entrega (R$)" className="sm:col-span-3">
            <Input value={taxa} onChange={(ev) => setTaxa(ev.target.value)} inputMode="decimal" className="h-10" />
          </Rotulo>
        </section>

        <section className="flex flex-col gap-3" aria-label="Pagamento">
          <h3 className="font-semibold">Pagamento na entrega</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {FORMAS_PAGAMENTO.map((f) => (
              <Button key={f.valor} type="button" variant={forma === f.valor ? "default" : "outline"} aria-pressed={forma === f.valor} className="h-10" onClick={() => setForma(f.valor)}>
                {f.rotulo}
              </Button>
            ))}
          </div>
          {forma === "dinheiro" ? (
            <Rotulo texto="Troco para (R$)" className="max-w-48">
              <Input value={troco} onChange={(ev) => setTroco(ev.target.value)} inputMode="decimal" placeholder="Sem troco" className="h-10" />
            </Rotulo>
          ) : null}
          <Rotulo texto="Observação do pedido">
            <Input value={observacao} onChange={(ev) => setObservacao(ev.target.value)} maxLength={500} className="h-10" />
          </Rotulo>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t p-4">
        <span className="flex flex-col">
          <span className="text-xs text-muted-foreground">Novo total</span>
          <span className="text-xl font-bold tabular-nums">{formatarBRL(total)}</span>
        </span>
        <Button type="button" variant="ghost" className="ml-auto h-11" onClick={aoFechar}>
          Cancelar
        </Button>
        <Button type="button" className="h-11" disabled={pendente || itensRestantes === 0} onClick={salvar}>
          Salvar alterações
        </Button>
      </div>

      <EscolherOpcoes
        produto={produto}
        aoFechar={() => setProduto(null)}
        aoConfirmar={(escolha) => {
          if (!produto) return;
          setNovos((l) => [
            ...l,
            { chave: `${produto.id}-${Date.now()}`, produto, quantidade: escolha.quantidade, observacao: escolha.observacao, adicionais: escolha.adicionais },
          ]);
          setProduto(null);
          setEscolhendo(false);
          setBusca("");
        }}
      />
    </>
  );
}
