"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { centavosDeTexto, formatarBRL } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";

import { useCarrinho } from "../carrinho-store";
import { type DadosPedido, enviarPedido } from "./actions";

type Props = {
  restaurante: { id: string; slug: string; pedidoMinimo: number };
  aberto: boolean;
  mensagemFechado: string | null;
  bairros: { id: string; nome: string; taxa: number }[];
  produtosDisponiveis: Record<string, { nome: string; preco: number }>;
};

const FORMAS = [
  { valor: "pix", rotulo: "Pix" },
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "credito", rotulo: "Crédito" },
  { valor: "debito", rotulo: "Débito" },
] as const;

function Erro({ texto }: { texto?: string }) {
  return texto ? <p className="text-sm text-destructive">{texto}</p> : null;
}

export function Checkout({ restaurante, aberto, mensagemFechado, bairros, produtosDisponiveis }: Props) {
  const router = useRouter();
  const { itens, definir, limpar } = useCarrinho(restaurante.id);
  const [enviando, iniciar] = useTransition();
  const [erros, setErros] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    nome: "",
    telefone: "",
    bairroId: "",
    rua: "",
    numero: "",
    complemento: "",
    referencia: "",
    forma: "pix" as DadosPedido["forma"],
    trocoPara: "",
    observacao: "",
  });

  // Itens que saíram do cardápio (ou mudaram de preço) desde que foram para o carrinho.
  const indisponiveis = itens.filter((i) => !produtosDisponiveis[i.produtoId]);
  const validos = useMemo(
    () =>
      itens
        .filter((i) => produtosDisponiveis[i.produtoId])
        .map((i) => ({ ...i, ...produtosDisponiveis[i.produtoId] })),
    [itens, produtosDisponiveis],
  );
  useEffect(() => {
    for (const i of itens) {
      const atual = produtosDisponiveis[i.produtoId];
      if (atual && (atual.preco !== i.preco || atual.nome !== i.nome)) {
        definir({ id: i.produtoId, ...atual }, i.quantidade, i.observacao);
      }
    }
  }, [itens, produtosDisponiveis, definir]);

  const subtotal = validos.reduce((soma, i) => soma + i.preco * i.quantidade, 0);
  const bairro = bairros.find((b) => b.id === form.bairroId);
  const taxa = bairro?.taxa ?? 0;
  const total = subtotal + taxa;
  const faltaMinimo = Math.max(0, restaurante.pedidoMinimo - subtotal);
  const troco = form.forma === "dinheiro" && form.trocoPara ? centavosDeTexto(form.trocoPara) : null;

  const alterar = (campo: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErros({});
    iniciar(async () => {
      const resultado = await enviarPedido(restaurante.slug, {
        ...form,
        itens: validos.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade, observacao: i.observacao })),
      });
      if (resultado.ok) {
        toast.dismiss();
        limpar();
        router.push(`/${restaurante.slug}/pedido/${resultado.pedidoId}`);
      } else {
        setErros(resultado.erros ?? {});
        toast.error(resultado.mensagem);
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
    <form onSubmit={enviar} className="flex flex-col gap-4 p-4 pb-28" noValidate>
      <section aria-labelledby="titulo-itens" className="flex flex-col gap-2 rounded-xl bg-background p-4 shadow-sm">
        <h2 id="titulo-itens" className="font-semibold">
          Seu pedido
        </h2>
        {indisponiveis.length > 0 ? (
          <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
            {indisponiveis.map((i) => i.nome).join(", ")} {indisponiveis.length === 1 ? "não está" : "não estão"} mais
            disponível e não entra no pedido.
          </p>
        ) : null}
        <ul className="divide-y">
          {validos.map((item) => (
            <li key={item.produtoId} className="flex flex-col gap-2 py-3">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{item.nome}</span>
                <span className="tabular-nums">{formatarBRL(item.preco * item.quantidade)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-full border p-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 rounded-full"
                    aria-label={`Diminuir ${item.nome}`}
                    onClick={() => definir({ id: item.produtoId, nome: item.nome, preco: item.preco }, item.quantidade - 1)}
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
                    onClick={() => definir({ id: item.produtoId, nome: item.nome, preco: item.preco }, item.quantidade + 1)}
                  >
                    <Plus />
                  </Button>
                </div>
                <Input
                  value={item.observacao}
                  onChange={(e) =>
                    definir({ id: item.produtoId, nome: item.nome, preco: item.preco }, item.quantidade, e.target.value)
                  }
                  placeholder="Observação (ex.: sem cebola)"
                  maxLength={300}
                  aria-label={`Observação de ${item.nome}`}
                  className="h-10 flex-1"
                />
              </div>
            </li>
          ))}
        </ul>
        <Link href={`/${restaurante.slug}`} className="text-sm font-medium text-[var(--cor-primaria)]">
          + Adicionar mais itens
        </Link>
      </section>

      <section aria-labelledby="titulo-entrega" className="flex flex-col gap-3 rounded-xl bg-background p-4 shadow-sm">
        <h2 id="titulo-entrega" className="font-semibold">
          Entrega
        </h2>
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
