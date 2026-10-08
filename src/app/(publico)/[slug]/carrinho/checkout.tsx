"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type AdicionalEscolhido, type GrupoAdicionais, resumoAdicionais, validarEscolha } from "@/lib/adicionais";
import { centavosDeTexto, formatarBRL } from "@/lib/dinheiro";
import { novoId } from "@/lib/id";
import { formatarTelefone } from "@/lib/telefone";
import { cn } from "@/lib/utils";

import { type ItemCarrinho, precoUnitario, useCarrinho } from "../carrinho-store";
import type { ContaCliente, EnderecoSalvo } from "../conta";
import { enviarPedido } from "./actions";
import { FORM_VAZIO, FORMAS, temDadosSalvos, useDadosCliente } from "./dados-cliente";

type Props = {
  restaurante: { id: string; slug: string; pedidoMinimo: number };
  aberto: boolean;
  mensagemFechado: string | null;
  bairros: { id: string; nome: string; taxa: number }[];
  produtosDisponiveis: Record<string, { nome: string; preco: number; grupos: GrupoAdicionais[] }>;
  // Conta do cliente (entrou com o celular): preenche nome e telefone e oferece os endereços usados.
  conta: ContaCliente | null;
  // Envio de código configurado: mostra o convite para entrar.
  podeEntrar: boolean;
};

type Situacao = { ok: true; dados: { nome: string; preco: number; adicionais: AdicionalEscolhido[] } } | { ok: false; motivo: string };

// Confere a linha do carrinho contra o cardápio atual (produto e opções ainda disponíveis, regras dos grupos).
function situacaoDaLinha(item: ItemCarrinho, produtos: Props["produtosDisponiveis"]): Situacao {
  const produto = produtos[item.produtoId];
  if (!produto) return { ok: false, motivo: "não está mais disponível" };
  const opcoes = new Map(produto.grupos.flatMap((g) => g.opcoes.map((o) => [o.id, { ...o, grupo: g.nome }] as const)));
  const adicionais: AdicionalEscolhido[] = [];
  for (const a of item.adicionais) {
    const atual = opcoes.get(a.id);
    if (!atual) return { ok: false, motivo: `a opção "${a.nome}" não está mais disponível` };
    adicionais.push({ id: atual.id, grupo: atual.grupo, nome: atual.nome, preco: atual.preco });
  }
  if (validarEscolha(produto.grupos, adicionais.map((a) => a.id))) return { ok: false, motivo: "mudou de opções; escolha de novo" };
  return { ok: true, dados: { nome: produto.nome, preco: produto.preco, adicionais } };
}

function Erro({ texto }: { texto?: string }) {
  return texto ? (
    <p role="alert" className="text-sm font-medium text-destructive">
      {texto}
    </p>
  ) : null;
}

export function Checkout({ restaurante, aberto, mensagemFechado, bairros, produtosDisponiveis, conta, podeEntrar }: Props) {
  const router = useRouter();
  const { itens, alterarQuantidade, alterarObservacao, atualizarDados, limpar } = useCarrinho(restaurante.id);
  const [enviando, iniciar] = useTransition();
  const [erros, setErros] = useState<Record<string, string>>({});
  const formulario = useRef<HTMLFormElement>(null);

  // Erro de validação: leva o cliente até o primeiro campo errado (o aviso ficava fora da tela).
  useEffect(() => {
    if (Object.keys(erros).length === 0) return;
    const campo = formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    campo?.scrollIntoView({ behavior: "smooth", block: "center" });
    campo?.focus({ preventScroll: true });
  }, [erros]);
  // Rascunho no aparelho: queda de rede ou recarga não apagam o que o cliente digitou,
  // e nome, telefone e endereço ficam para o próximo pedido.
  const [form, setForm] = useDadosCliente(restaurante.id);
  // Enquanto o cliente não mexe, o que está nos campos veio de um pedido anterior
  // (aparelho emprestado: "Não é você?"). O aparelho só é lido depois da hidratação.
  const [editou, setEditou] = useState(false);

  // Com a conta: nome, telefone e o último endereço usado vêm da conta (o aparelho pode ter os
  // dados de outra pessoa). Uma vez por aba, para não desfazer o que o cliente mudar depois.
  useEffect(() => {
    if (!conta) return;
    const marca = `checkout-conta:${restaurante.id}:${conta.id}`;
    try {
      if (sessionStorage.getItem(marca)) return;
      sessionStorage.setItem(marca, "1");
    } catch {
      // Sem armazenamento: aplica a cada carregamento.
    }
    const endereco = conta.enderecos.find((e) => bairros.some((b) => b.id === e.bairroId));
    setForm((f) => ({
      ...f,
      nome: conta.nome,
      telefone: formatarTelefone(conta.telefone),
      ...(endereco ? camposDoEndereco(endereco) : {}),
    }));
  }, [conta, bairros, setForm, restaurante.id]);
  const enderecosDaConta = (conta?.enderecos ?? []).filter((e) => bairros.some((b) => b.id === e.bairroId));
  const enderecoAtual = (e: EnderecoSalvo) =>
    form.bairroId === e.bairroId &&
    form.rua.trim().toLowerCase() === e.rua.toLowerCase() &&
    form.numero.trim().toLowerCase() === e.numero.toLowerCase() &&
    form.complemento.trim().toLowerCase() === (e.complemento ?? "").toLowerCase();

  // Itens que saíram do cardápio (ou mudaram de preço/opções) desde que foram para o carrinho.
  const situacoes = useMemo(
    () => itens.map((item) => ({ item, situacao: situacaoDaLinha(item, produtosDisponiveis) })),
    [itens, produtosDisponiveis],
  );
  const indisponiveis = situacoes.flatMap(({ item, situacao }) => (situacao.ok ? [] : [{ item, motivo: situacao.motivo }]));
  const validos = useMemo(
    () => situacoes.flatMap(({ item, situacao }) => (situacao.ok ? [{ ...item, ...situacao.dados }] : [])),
    [situacoes],
  );
  useEffect(() => {
    for (const { item, situacao } of situacoes) {
      if (situacao.ok && JSON.stringify(situacao.dados) !== JSON.stringify({ nome: item.nome, preco: item.preco, adicionais: item.adicionais })) {
        atualizarDados(item.chave, situacao.dados);
      }
    }
  }, [situacoes, atualizarDados]);

  const subtotal = validos.reduce((soma, i) => soma + precoUnitario(i) * i.quantidade, 0);
  const bairro = bairros.find((b) => b.id === form.bairroId);
  const taxa = bairro?.taxa ?? 0;
  const total = subtotal + taxa;
  const faltaMinimo = Math.max(0, restaurante.pedidoMinimo - subtotal);
  const troco = form.forma === "dinheiro" && form.trocoPara ? centavosDeTexto(form.trocoPara) : null;

  const alterar = (campo: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setEditou(true);
    setForm((f) => ({ ...f, [campo]: e.target.value }));
  };

  // Mesmo pedido = mesma chave: tocar "Enviar" de novo depois de uma falha não cria pedido duplicado.
  const envioAtual = useRef<{ conteudo: string; chave: string } | null>(null);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErros({});
    const dados = {
      ...form,
      itens: validos.map((i) => ({
        produtoId: i.produtoId,
        quantidade: i.quantidade,
        observacao: i.observacao,
        adicionais: i.adicionais.map((a) => a.id),
      })),
      totalEsperado: total,
    };
    const conteudo = JSON.stringify(dados);
    if (envioAtual.current?.conteudo !== conteudo) envioAtual.current = { conteudo, chave: novoId() };
    const chave = envioAtual.current.chave;
    iniciar(async () => {
      let resultado: Awaited<ReturnType<typeof enviarPedido>>;
      try {
        resultado = await enviarPedido(restaurante.slug, { ...dados, chave });
      } catch {
        toast.error(
          navigator.onLine
            ? "Não conseguimos enviar. Seus dados continuam aqui: toque em Enviar de novo."
            : "Sem internet. Seus dados continuam aqui: envie quando a conexão voltar.",
        );
        return;
      }
      if (resultado.ok) {
        toast.dismiss();
        limpar();
        setForm((f) => ({ ...f, trocoPara: "", observacao: "" }));
        router.push(`/${restaurante.slug}/pedido/${resultado.pedidoId}`);
      } else {
        setErros(resultado.erros ?? {});
        toast.error(resultado.mensagem, { duration: resultado.atualizar ? 10000 : undefined });
        // Preço mudou ou item esgotou: o cardápio recarrega e o carrinho mostra os valores de agora.
        if (resultado.atualizar) router.refresh();
      }
    });
  }

  if (itens.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <p className="text-muted-foreground">Seu carrinho está vazio.</p>
        <Button nativeButton={false} render={<Link href={`/${restaurante.slug}`} />}>
          Ver cardápio
        </Button>
      </div>
    );
  }

  return (
    <form ref={formulario} onSubmit={enviar} className="flex flex-col gap-4 p-4 pb-28" noValidate>
      <section aria-labelledby="titulo-itens" className="flex flex-col gap-2 rounded-xl bg-background p-4 shadow-sm">
        <h2 id="titulo-itens" className="font-semibold">
          Seu pedido
        </h2>
        {indisponiveis.length > 0 ? (
          <ul className="flex flex-col gap-1 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
            {indisponiveis.map(({ item, motivo }) => (
              <li key={item.chave} className="flex items-center justify-between gap-2">
                <span>
                  <strong>{item.nome}</strong>: {motivo}. Não entra no pedido.
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => alterarQuantidade(item.chave, 0)}>
                  Remover
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <ul className="divide-y">
          {validos.map((item) => (
            <li key={item.chave} className="flex flex-col gap-2 py-3">
              <div className="flex items-start justify-between gap-2">
                <span className="flex flex-col">
                  <span className="font-medium">{item.nome}</span>
                  {item.adicionais.length > 0 ? (
                    <span className="text-sm text-muted-foreground">{resumoAdicionais(item.adicionais)}</span>
                  ) : null}
                </span>
                <span className="tabular-nums">{formatarBRL(precoUnitario(item) * item.quantidade)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-full border p-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 rounded-full"
                    aria-label={`Diminuir ${item.nome}`}
                    onClick={() => alterarQuantidade(item.chave, item.quantidade - 1)}
                  >
                    {item.quantidade === 1 ? <Trash2 /> : <Minus />}
                  </Button>
                  <span className="w-6 text-center font-semibold tabular-nums">{item.quantidade}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 rounded-full"
                    aria-label={`Aumentar ${item.nome}`}
                    onClick={() => alterarQuantidade(item.chave, item.quantidade + 1)}
                  >
                    <Plus />
                  </Button>
                </div>
                <Input
                  value={item.observacao}
                  onChange={(e) => alterarObservacao(item.chave, e.target.value)}
                  placeholder="Observação (ex.: sem cebola)"
                  maxLength={300}
                  aria-label={`Observação de ${item.nome}`}
                  className="h-10 flex-1"
                />
              </div>
            </li>
          ))}
        </ul>
        <Link href={`/${restaurante.slug}`} className="flex min-h-11 w-fit items-center text-sm font-medium text-[var(--cor-primaria-texto)]">
          + Adicionar mais itens
        </Link>
      </section>

      <section aria-labelledby="titulo-entrega" className="flex flex-col gap-3 rounded-xl bg-background p-4 shadow-sm">
        <h2 id="titulo-entrega" className="font-semibold">
          Entrega
        </h2>
        {conta ? (
          <p className="text-sm text-muted-foreground">
            Pedindo como <strong className="text-foreground">{conta.nome}</strong>. O endereço fica salvo na sua conta.
          </p>
        ) : podeEntrar ? (
          <p className="text-sm text-muted-foreground">
            <Link
              href={`/${restaurante.slug}/entrar?voltar=/${restaurante.slug}/carrinho`}
              className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4"
            >
              Entre com o celular
            </Link>{" "}
            para salvar seus dados e acompanhar os pedidos em qualquer aparelho (opcional).
          </p>
        ) : null}
        {enderecosDaConta.length > 1 ? (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Seus endereços</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Endereços usados">
              {enderecosDaConta.map((e) => (
                <Button
                  key={e.id}
                  type="button"
                  variant={enderecoAtual(e) ? "default" : "outline"}
                  aria-pressed={enderecoAtual(e)}
                  className="h-auto min-h-11 max-w-full justify-start whitespace-normal text-left"
                  onClick={() => {
                    setEditou(true);
                    setForm((f) => ({ ...f, ...camposDoEndereco(e) }));
                  }}
                >
                  {[`${e.rua}, ${e.numero}`, e.complemento].filter(Boolean).join(" · ")}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {!conta && !editou && temDadosSalvos(form) ? (
          <p className="flex flex-wrap items-center gap-x-2 rounded-lg bg-muted p-2 text-sm text-muted-foreground">
            Preenchido com os dados salvos neste aparelho.
            <button
              type="button"
              className="min-h-11 font-medium text-foreground underline underline-offset-4"
              onClick={() => setForm((f) => ({ ...FORM_VAZIO, forma: f.forma }))}
            >
              Não é você? Limpar
            </button>
          </p>
        ) : null}
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nome
          <Input value={form.nome} onChange={alterar("nome")} autoComplete="name" className="h-11" aria-invalid={!!erros.nome} />
          <Erro texto={erros.nome} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Telefone (WhatsApp)
          <Input
            value={form.telefone}
            onChange={alterar("telefone")}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(69) 99999-9999"
            className="h-11"
            aria-invalid={!!erros.telefone}
          />
          <Erro texto={erros.telefone} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Bairro
          <select
            value={form.bairroId}
            onChange={alterar("bairroId")}
            className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
            aria-invalid={!!erros.bairroId}
          >
            <option value="">Escolha o bairro</option>
            {bairros.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome} · taxa {formatarBRL(b.taxa)}
              </option>
            ))}
          </select>
          <Erro texto={erros.bairroId} />
        </label>
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Rua
            <Input value={form.rua} onChange={alterar("rua")} autoComplete="address-line1" className="h-11" aria-invalid={!!erros.rua} />
            <Erro texto={erros.rua} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Número
            <Input value={form.numero} onChange={alterar("numero")} className="h-11" aria-invalid={!!erros.numero} />
            <Erro texto={erros.numero} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Complemento
          <Input value={form.complemento} onChange={alterar("complemento")} autoComplete="address-line2" placeholder="Apto, bloco, casa…" className="h-11" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Ponto de referência
          <Input value={form.referencia} onChange={alterar("referencia")} className="h-11" />
        </label>
      </section>

      <section aria-labelledby="titulo-pagamento" className="flex flex-col gap-3 rounded-xl bg-background p-4 shadow-sm">
        <h2 id="titulo-pagamento" className="font-semibold">
          Pagamento na entrega
        </h2>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Forma de pagamento">
          {FORMAS.map((f) => (
            <Button
              key={f.valor}
              type="button"
              role="radio"
              aria-checked={form.forma === f.valor}
              variant={form.forma === f.valor ? "default" : "outline"}
              className="h-12"
              onClick={() => setForm((atual) => ({ ...atual, forma: f.valor }))}
            >
              {f.rotulo}
            </Button>
          ))}
        </div>
        {form.forma === "dinheiro" ? (
          <label className="flex flex-col gap-1 text-sm font-medium">
            Troco para quanto? (deixe vazio se não precisar)
            <Input
              value={form.trocoPara}
              onChange={alterar("trocoPara")}
              inputMode="decimal"
              placeholder="Ex.: 100,00"
              className="h-11"
              aria-invalid={!!erros.trocoPara}
            />
            {troco !== null && troco >= total && total > 0 ? (
              <span className="text-sm text-muted-foreground">Troco: {formatarBRL(troco - total)}</span>
            ) : null}
            <Erro texto={erros.trocoPara} />
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-sm font-medium">
          Observação para o restaurante
          <Textarea value={form.observacao} onChange={alterar("observacao")} rows={2} maxLength={500} />
        </label>
      </section>

      <section aria-label="Totais" className="flex flex-col gap-1 rounded-xl bg-background p-4 shadow-sm">
        <div className="flex justify-between text-sm">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatarBRL(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Taxa de entrega</span>
          <span className="tabular-nums">{bairro ? formatarBRL(taxa) : "escolha o bairro"}</span>
        </div>
        <div className="flex justify-between text-lg font-bold">
          <span>Total</span>
          <span className="tabular-nums">{formatarBRL(total)}</span>
        </div>
        {faltaMinimo > 0 ? (
          <p className="text-sm text-amber-700">
            Pedido mínimo de {formatarBRL(restaurante.pedidoMinimo)}: faltam {formatarBRL(faltaMinimo)}.
          </p>
        ) : null}
      </section>

      {!aberto && mensagemFechado ? (
        <p role="status" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {mensagemFechado}
        </p>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <Button
            type="submit"
            className={cn("h-14 w-full justify-between text-base")}
            disabled={enviando || !aberto || faltaMinimo > 0 || validos.length === 0}
          >
            <span>{enviando ? "Enviando pedido..." : aberto ? "Fazer pedido" : "Fechado no momento"}</span>
            <span className="tabular-nums">{formatarBRL(total)}</span>
          </Button>
        </div>
      </div>
    </form>
  );
}

function camposDoEndereco(e: EnderecoSalvo) {
  return {
    bairroId: e.bairroId,
    rua: e.rua,
    numero: e.numero,
    complemento: e.complemento ?? "",
    referencia: e.referencia ?? "",
  };
}
