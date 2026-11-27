"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type AdicionalEscolhido, type GrupoAdicionais, resumoAdicionais, validarEscolha } from "@/lib/adicionais";
import { centavosDeTexto, formatarBRL } from "@/lib/dinheiro";
import { chaveBairro } from "@/lib/endereco";
import { useChaveDeEnvio } from "@/lib/envio";
import { formatarTelefone } from "@/lib/telefone";
import { cn } from "@/lib/utils";

import { type ItemCarrinho, precoUnitario, useCarrinho } from "../carrinho-store";
import type { ContaCliente, EnderecoSalvo } from "../conta";
import { type CupomValido, enviarPedido, validarCupom } from "./actions";
import type { EnderecoCep } from "@/app/api/cep/[cep]/route";

import { FORM_SEM_ENDERECO, FORM_VAZIO, FORMAS, type FormCheckout, temDadosSalvos, useDadosCliente } from "./dados-cliente";

type Props = {
  // taxaModo "fixa": um valor para qualquer endereço; o cliente informa CEP e bairro.
  restaurante: {
    id: string;
    slug: string;
    pedidoMinimo: number;
    taxaModo: "fixa" | "bairro";
    taxaFixa: number;
    cidade: string | null;
    // Onde o cliente vai buscar, e em quanto tempo fica pronto (retirada no local).
    enderecoDoLocal: string | null;
    tempoRetiradaMin: number | null;
    // Modo bairro: o que se cobra de quem não está na lista (null = não entrega fora dela).
    taxaOutrosBairros: number | null;
  };
  // De que jeitos o restaurante está recebendo agora. Um dos dois pode estar desligado.
  podeEntregar: boolean;
  podeRetirar: boolean;
  aberto: boolean;
  mensagemFechado: string | null;
  bairros: { id: string; nome: string; taxa: number }[];
  produtosDisponiveis: Record<string, { nome: string; preco: number; grupos: GrupoAdicionais[] }>;
  // Conta do cliente: preenche nome e telefone e oferece os endereços usados.
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

export function Checkout({
  restaurante,
  podeEntregar,
  podeRetirar,
  aberto,
  mensagemFechado,
  bairros,
  produtosDisponiveis,
  conta,
  podeEntrar,
}: Props) {
  const router = useRouter();
  const { itens, alterarQuantidade, alterarObservacao, atualizarDados, limpar } = useCarrinho(restaurante.id);
  const [cupom, setCupom] = useState<CupomValido | null>(null);
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
  // Receber em casa ou retirar. O rascunho lembra a escolha; se o restaurante desligou o jeito
  // escolhido desde o último pedido, cai no que está ligado.
  const tipo: FormCheckout["tipo"] = podeRetirar && (form.tipo === "retirada" || !podeEntregar) ? "retirada" : "entrega";
  const retirando = tipo === "retirada";
  const escolherTipo = (novo: FormCheckout["tipo"]) => {
    setEditou(true);
    setForm((f) => ({ ...f, tipo: novo }));
  };
  const fixa = restaurante.taxaModo === "fixa";
  // Endereço salvo que ainda serve: na taxa fixa, todos; por bairro, só os de bairros atendidos.
  // Serve se dá para saber o bairro: é por ele que a taxa sai, nos dois modos.
  const enderecoServe = useCallback((e: EnderecoSalvo) => Boolean(e.bairro || e.bairroId), []);

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
    const endereco = conta.enderecos.find(enderecoServe);
    setForm((f) => ({
      ...f,
      nome: conta.nome,
      telefone: formatarTelefone(conta.telefone),
      ...(endereco ? camposDoEndereco(endereco) : {}),
    }));
  }, [conta, enderecoServe, setForm, restaurante.id]);
  const enderecosDaConta = (conta?.enderecos ?? []).filter(enderecoServe);
  // "Usar outro endereço": abre os campos à mão mesmo tendo salvos. Volta a fechar quando a
  // pessoa escolhe um da lista.
  const [outroEndereco, setOutroEndereco] = useState(false);
  const enderecoAtual = (e: EnderecoSalvo) =>
    chaveBairro(form.bairroTexto) === chaveBairro(e.bairro) &&
    form.rua.trim().toLowerCase() === e.rua.toLowerCase() &&
    form.numero.trim().toLowerCase() === e.numero.toLowerCase() &&
    form.complemento.trim().toLowerCase() === (e.complemento ?? "").toLowerCase();
  const salvoEscolhido = enderecosDaConta.find(enderecoAtual);
  // Com um endereço salvo escolhido, os campos ficam fora do caminho — como em qualquer app de
  // comida. Antes a lista só aparecia com dois ou mais, e quem tinha um via os campos
  // preenchidos sem saber de onde vieram nem como trocar.
  const camposDeEndereco = !retirando && (outroEndereco || !salvoEscolhido);

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
  // Taxa por bairro: o bairro vem do CEP (ou do que o cliente corrigir) e casa com a lista do
  // restaurante — sem select com os preços à mostra, que era um convite a escolher o mais barato.
  // Quem decide de verdade é o banco, com a mesma conta, ao criar o pedido.
  const bairro = fixa ? undefined : bairros.find((b) => chaveBairro(b.nome) === chaveBairro(form.bairroTexto));
  const foraDaLista = !fixa && !retirando && Boolean(chaveBairro(form.bairroTexto)) && !bairro;
  const naoAtende = foraDaLista && restaurante.taxaOutrosBairros === null;
  // Sem bairro ainda (o cliente não digitou o CEP): a taxa fica em aberto — e fora do total,
  // senão o rodapé mostra um valor que ninguém escolheu.
  const taxaDefinida = retirando || fixa || Boolean(chaveBairro(form.bairroTexto));
  const taxa = retirando
    ? 0
    : fixa
      ? restaurante.taxaFixa
      : taxaDefinida
        ? (bairro?.taxa ?? restaurante.taxaOutrosBairros ?? 0)
        : 0;
  // Endereço de outra cidade (o CEP diz qual): avisa, sem bloquear (o restaurante confirma).
  const outraCidade =
    !retirando && fixa && restaurante.cidade && form.cidade && normalizarCidade(form.cidade) !== normalizarCidade(restaurante.cidade)
      ? form.cidade
      : null;
  // Cupom: o desconto aparece já aqui; o banco calcula de novo ao criar o pedido.
  // Frete grátis não desconta nada em pedido para retirar — e o banco recusa, então avisa antes.
  const cupomSoEntrega = cupom?.tipo === "frete" && retirando;
  const cupomVale = cupom !== null && subtotal >= cupom.pedidoMinimo && !cupomSoEntrega;
  const desconto = !cupomVale
    ? 0
    : cupom.tipo === "percentual"
      ? Math.round((subtotal * cupom.valor) / 100)
      : cupom.tipo === "valor"
        ? Math.min(cupom.valor, subtotal)
        : taxaDefinida
          ? taxa
          : 0;
  const total = subtotal + taxa - desconto;
  // O mínimo existe por causa da viagem do entregador: quem vem buscar leva o que quiser.
  const faltaMinimo = retirando ? 0 : Math.max(0, restaurante.pedidoMinimo - subtotal);
  const troco = form.forma === "dinheiro" && form.trocoPara ? centavosDeTexto(form.trocoPara) : null;

  const alterar = (campo: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setEditou(true);
    setForm((f) => ({ ...f, [campo]: e.target.value }));
  };

  // Mesmo pedido = mesma chave, guardada no aparelho junto com o carrinho: tocar "Enviar" de novo
  // depois de uma falha (ou depois de recarregar a página) não cria pedido duplicado.
  const { chaveDe, limpar: limparChave } = useChaveDeEnvio(`checkout:${restaurante.id}`);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErros({});
    const dados = {
      ...form,
      tipo,
      itens: validos.map((i) => ({
        produtoId: i.produtoId,
        quantidade: i.quantidade,
        observacao: i.observacao,
        adicionais: i.adicionais.map((a) => a.id),
      })),
      totalEsperado: total,
      cupom: cupomVale ? cupom.codigo : "",
    };
    const chave = chaveDe(JSON.stringify(dados));
    iniciar(async () => {
      let resultado: Awaited<ReturnType<typeof enviarPedido>>;
      try {
        resultado = await enviarPedido(restaurante.slug, { ...dados, chave });
      } catch {
        // Não prometa que o pedido não entrou: o servidor pode ter gravado e a resposta ter
        // se perdido. Com a chave guardada no aparelho, reenviar o mesmo pedido é seguro.
        toast.error(
          navigator.onLine
            ? "Não deu para enviar. O pedido pode ter entrado: toque em Enviar de novo para conferir — não vai duplicar."
            : "Sem internet. O pedido pode ter entrado: quando a conexão voltar, toque em Enviar de novo para conferir — não vai duplicar.",
        );
        return;
      }
      if (resultado.ok) {
        toast.dismiss();
        limpar();
        limparChave();
        setForm((f) => ({ ...f, trocoPara: "", observacao: "" }));
        router.push(`/${restaurante.slug}/pedido/${resultado.pedidoId}`);
      } else {
        setErros(resultado.erros ?? {});
        if (resultado.removerCupom) setCupom(null);
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
          {podeEntregar && podeRetirar ? "Como você quer receber" : retirando ? "Retirar no local" : "Entrega"}
        </h2>
        {/* Só aparece quando há escolha: com um dos jeitos desligado, o título já diz tudo. */}
        {podeEntregar && podeRetirar ? (
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Como você quer receber">
            {(
              [
                { valor: "entrega", rotulo: "Receber em casa" },
                { valor: "retirada", rotulo: "Retirar no local" },
              ] as const
            ).map((o) => (
              <Button
                key={o.valor}
                type="button"
                role="radio"
                aria-checked={tipo === o.valor}
                variant={tipo === o.valor ? "default" : "outline"}
                className="h-12"
                onClick={() => escolherTipo(o.valor)}
              >
                {o.rotulo}
              </Button>
            ))}
          </div>
        ) : null}
        {retirando ? (
          <div className="flex flex-col gap-1 rounded-lg bg-muted p-3 text-sm">
            <span className="font-medium text-foreground">
              {restaurante.enderecoDoLocal ? `Retirar em ${restaurante.enderecoDoLocal}` : "Retirar no restaurante"}
            </span>
            <span className="text-muted-foreground">
              {restaurante.tempoRetiradaMin
                ? `Fica pronto em cerca de ${restaurante.tempoRetiradaMin} min. Avisamos aqui quando estiver pronto.`
                : "Avisamos aqui quando o pedido estiver pronto."}
            </span>
          </div>
        ) : null}
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
              Entre ou crie sua conta
            </Link>{" "}
            para salvar seus dados e acompanhar os pedidos em qualquer aparelho (opcional).
          </p>
        ) : null}
        {retirando || enderecosDaConta.length === 0 ? null : (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Entregar em</span>
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Endereços salvos">
              {enderecosDaConta.map((e) => {
                const escolhido = !outroEndereco && enderecoAtual(e);
                return (
                  <button
                    key={e.id}
                    type="button"
                    role="radio"
                    aria-checked={escolhido}
                    onClick={() => {
                      setEditou(true);
                      setOutroEndereco(false);
                      setForm((f) => ({ ...f, ...camposDoEndereco(e) }));
                    }}
                    className={cn(
                      "flex min-h-11 items-start gap-3 rounded-xl border p-3 text-left text-sm",
                      escolhido ? "border-[var(--cor-primaria)] bg-[var(--cor-primaria)]/5" : "hover:bg-muted",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2",
                        escolhido ? "border-[var(--cor-primaria)]" : "border-muted-foreground/40",
                      )}
                    >
                      {escolhido ? <span className="size-2.5 rounded-full bg-[var(--cor-primaria)]" /> : null}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">
                        {e.apelido ? `${e.apelido} · ` : ""}
                        {e.rua}, {e.numero}
                        {e.complemento ? ` · ${e.complemento}` : ""}
                      </span>
                      <span className="text-muted-foreground">{[e.bairro, e.cidade].filter(Boolean).join(" · ")}</span>
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                role="radio"
                aria-checked={camposDeEndereco}
                onClick={() => {
                  setEditou(true);
                  setOutroEndereco(true);
                  setForm((f) => ({ ...f, ...FORM_SEM_ENDERECO }));
                }}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-xl border border-dashed p-3 text-left text-sm font-medium",
                  camposDeEndereco ? "border-[var(--cor-primaria)] bg-[var(--cor-primaria)]/5" : "hover:bg-muted",
                )}
              >
                <Plus className="size-4 shrink-0" aria-hidden />
                Entregar em outro endereço
              </button>
            </div>
            {/* O apelido de cada endereço se dá em Minha conta: aqui a pessoa está pedindo. */}
            {enderecosDaConta.some((e) => !e.apelido) ? (
              <p className="text-xs text-muted-foreground">
                Dá para dar nome a cada endereço (Casa, Trabalho) em{" "}
                <Link href={`/${restaurante.slug}/conta`} className="underline underline-offset-4">
                  Minha conta
                </Link>
                .
              </p>
            ) : null}
          </div>
        )}
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
        {!camposDeEndereco ? null : (
          <CampoCep
            form={form}
            erro={erros.cep}
            aoMudar={(cep) => {
              setEditou(true);
              setForm((f) => ({ ...f, cep }));
            }}
            aoEncontrar={(e) => {
              setEditou(true);
              setForm((f) => ({
                ...f,
                cep: e.cep,
                rua: e.rua || f.rua,
                bairroTexto: e.bairro || f.bairroTexto,
                cidade: e.cidade,
                uf: e.uf,
              }));
            }}
          />
        )}
        {!camposDeEndereco ? null : (
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
        )}
        {!camposDeEndereco ? null : (
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Bairro
              <Input value={form.bairroTexto} onChange={alterar("bairroTexto")} className="h-11" aria-invalid={!!erros.bairroTexto} />
              <Erro texto={erros.bairroTexto} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Cidade
              <Input value={form.cidade} onChange={alterar("cidade")} autoComplete="address-level2" className="h-11" />
            </label>
          </div>
        )}
        {/* O que vai ser cobrado neste bairro, dito antes de pedir. */}
        {naoAtende ? (
          <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm font-medium text-red-900">
            Ainda não entregamos no bairro {form.bairroTexto.trim()}. Fale com o restaurante antes de pedir.
          </p>
        ) : foraDaLista ? (
          <p role="status" className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
            {form.bairroTexto.trim()} fica fora da nossa área: a entrega sai por {formatarBRL(taxa)}.
          </p>
        ) : null}
        {outraCidade ? (
          <p role="status" className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
            Esse endereço é em {outraCidade}. Confira se entregamos aí antes de pedir.
          </p>
        ) : null}
        {!camposDeEndereco ? null : (
          <>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Complemento
              <Input value={form.complemento} onChange={alterar("complemento")} autoComplete="address-line2" placeholder="Apto, bloco, casa…" className="h-11" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Ponto de referência
              <Input value={form.referencia} onChange={alterar("referencia")} className="h-11" />
            </label>
          </>
        )}
      </section>

      <section aria-labelledby="titulo-pagamento" className="flex flex-col gap-3 rounded-xl bg-background p-4 shadow-sm">
        <h2 id="titulo-pagamento" className="font-semibold">
          {retirando ? "Pagamento na retirada" : "Pagamento na entrega"}
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
        {retirando ? null : (
          <div className="flex justify-between text-sm">
            <span>Taxa de entrega{bairro ? ` · ${bairro.nome}` : ""}</span>
            <span className="tabular-nums">{taxaDefinida ? (taxa === 0 ? "Grátis" : formatarBRL(taxa)) : "informe o CEP"}</span>
          </div>
        )}
        {cupom ? (
          <div className="flex justify-between text-sm text-green-700">
            <span>
              Cupom {cupom.codigo}
              {cupomSoEntrega ? (
                <span className="block text-amber-700">Este cupom é de frete grátis e vale só para entrega</span>
              ) : !cupomVale ? (
                <span className="block text-amber-700">Vale a partir de {formatarBRL(cupom.pedidoMinimo)} em itens</span>
              ) : null}
            </span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums">{cupomVale ? `− ${formatarBRL(desconto)}` : "—"}</span>
              <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setCupom(null)}>
                tirar
              </button>
            </span>
          </div>
        ) : (
          <CampoCupom slug={restaurante.slug} aoAplicar={setCupom} />
        )}
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
            disabled={enviando || !aberto || faltaMinimo > 0 || validos.length === 0 || naoAtende || (!retirando && !taxaDefinida)}
          >
            <span>
              {enviando
                ? "Enviando pedido..."
                : !aberto
                  ? "Fechado no momento"
                  : naoAtende
                    ? "Fora da área de entrega"
                    : "Fazer pedido"}
            </span>
            <span className="tabular-nums">{formatarBRL(total)}</span>
          </Button>
        </div>
      </div>
    </form>
  );
}

function camposDoEndereco(e: EnderecoSalvo) {
  return {
    bairroTexto: e.bairro ?? "",
    cep: e.cep ? `${e.cep.slice(0, 5)}-${e.cep.slice(5)}` : "",
    cidade: e.cidade ?? "",
    uf: e.uf ?? "",
    rua: e.rua,
    numero: e.numero,
    complemento: e.complemento ?? "",
    referencia: e.referencia ?? "",
  };
}

const normalizarCidade = (c: string) =>
  c
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

// CEP com busca automática ao completar 8 números. Se o serviço falhar ou não achar, o cliente
// preenche à mão (os campos continuam editáveis); quem não sabe o CEP pode deixar em branco.
function CampoCep({
  form,
  erro,
  aoMudar,
  aoEncontrar,
}: {
  form: FormCheckout;
  erro?: string;
  aoMudar: (cep: string) => void;
  aoEncontrar: (e: EnderecoCep) => void;
}) {
  const [situacao, setSituacao] = useState<"parado" | "buscando" | "achou" | "nao_achou" | "falhou">("parado");
  const ultimo = useRef("");

  async function buscar(digitos: string) {
    if (digitos.length !== 8 || ultimo.current === digitos) return;
    ultimo.current = digitos;
    setSituacao("buscando");
    try {
      const r = await fetch(`/api/cep/${digitos}`);
      if (r.status === 404) {
        setSituacao("nao_achou");
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      aoEncontrar((await r.json()) as EnderecoCep);
      setSituacao("achou");
    } catch {
      setSituacao("falhou");
    }
  }

  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      CEP
      <Input
        value={form.cep}
        onChange={(e) => {
          const d = e.target.value.replace(/\D/g, "").slice(0, 8);
          aoMudar(d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d);
          if (d.length < 8) ultimo.current = "";
          void buscar(d);
        }}
        inputMode="numeric"
        autoComplete="postal-code"
        placeholder="00000-000"
        className="h-11 max-w-40"
        aria-invalid={!!erro}
      />
      <span className="text-xs font-normal text-muted-foreground" role="status">
        {situacao === "buscando"
          ? "Buscando o endereço…"
          : situacao === "achou"
            ? "Endereço encontrado. Confira e complete o número."
            : situacao === "nao_achou"
              ? "CEP não encontrado. Preencha o endereço abaixo."
              : situacao === "falhou"
                ? "Não deu para buscar agora. Preencha o endereço abaixo."
                : "Digite o CEP para preencher a rua e o bairro. Não sabe? Preencha abaixo."}
      </span>
      <Erro texto={erro} />
    </label>
  );
}

// "Tem cupom?": recolhido até o cliente tocar; confere o código no servidor.
function CampoCupom({ slug, aoAplicar }: { slug: string; aoAplicar: (cupom: CupomValido) => void }) {
  const [aberto, setAberto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [conferindo, iniciar] = useTransition();
  if (!aberto) {
    return (
      <button type="button" className="self-start py-1 text-sm font-medium underline underline-offset-4" onClick={() => setAberto(true)}>
        Tem cupom?
      </button>
    );
  }
  return (
    <div className="flex gap-2 py-1">
      <Input
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.toUpperCase())}
        placeholder="Código do cupom"
        aria-label="Código do cupom"
        maxLength={20}
        autoFocus
        className="h-10 uppercase"
      />
      <Button
        type="button"
        variant="outline"
        className="h-10"
        disabled={conferindo || codigo.trim().length < 3}
        onClick={() =>
          iniciar(async () => {
            try {
              const r = await validarCupom(slug, codigo);
              if (r.ok) {
                aoAplicar(r.cupom);
                toast.success("Cupom aplicado.");
              } else toast.error(r.mensagem);
            } catch {
              toast.error("Sem conexão. Tente de novo.");
            }
          })
        }
      >
        Aplicar
      </Button>
    </div>
  );
}
