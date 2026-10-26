"use client";

import { Plus, TicketPercent } from "lucide-react";
import { useActionState, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { BotaoEnviar, Campo, ErroCampo, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatarBRL } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";

import { alternarCupom, criarCupom } from "./actions";

export type Cupom = {
  id: string;
  codigo: string;
  tipo: "percentual" | "valor" | "frete";
  valor: number;
  pedidoMinimo: number;
  inicio: string | null;
  fim: string | null;
  vencido: boolean;
  limiteUsos: number | null;
  umPorCliente: boolean;
  ativo: boolean;
  usos: number;
  descontoTotal: number;
};

const TIPOS = [
  { valor: "percentual", rotulo: "% de desconto" },
  { valor: "valor", rotulo: "R$ de desconto" },
  { valor: "frete", rotulo: "Frete grátis" },
] as const;

function descricao(c: Cupom) {
  const base = c.tipo === "percentual" ? `${c.valor}% off` : c.tipo === "valor" ? `${formatarBRL(c.valor)} off` : "Frete grátis";
  return [
    base,
    c.pedidoMinimo ? `a partir de ${formatarBRL(c.pedidoMinimo)}` : "",
    c.fim ? `até ${c.fim}` : "",
    c.umPorCliente ? "1 por cliente" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function NovoCupom() {
  const [estado, acao] = useActionState(criarCupom, undefined);
  useAvisoResultado(estado);
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<Cupom["tipo"]>("percentual");
  const [chaveVista, setChaveVista] = useState(estado?.chave);
  if (estado?.chave !== chaveVista) {
    setChaveVista(estado?.chave);
    if (estado?.ok) setAberto(false);
  }

  if (!aberto) {
    return (
      <Button type="button" className="h-11 w-fit" onClick={() => setAberto(true)}>
        <Plus />
        Novo cupom
      </Button>
    );
  }
  return (
    <Card>
      <CardContent>
        <form key={estado?.chave} action={acao} className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Código" htmlFor="codigo">
            <Input
              id="codigo"
              name="codigo"
              placeholder="Ex.: BEMVINDO10"
              defaultValue={valorCampo(estado, "codigo", "")}
              required
              autoFocus
              maxLength={20}
              className="h-11 uppercase"
            />
            <ErroCampo estado={estado} campo="codigo" />
          </Campo>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium">Desconto</legend>
            <input type="hidden" name="tipo" value={tipo} />
            <div className="flex flex-wrap gap-2">
              {TIPOS.map((t) => (
                <button
                  key={t.valor}
                  type="button"
                  aria-pressed={tipo === t.valor}
                  onClick={() => setTipo(t.valor)}
                  className={cn(
                    "min-h-10 rounded-full border px-3 text-sm font-medium",
                    tipo === t.valor ? "border-primary bg-primary/10" : "hover:bg-muted",
                  )}
                >
                  {t.rotulo}
                </button>
              ))}
            </div>
          </fieldset>
          {tipo !== "frete" ? (
            <Campo rotulo={tipo === "percentual" ? "Porcentagem (%)" : "Valor (R$)"} htmlFor="valor">
              <Input
                id="valor"
                name="valor"
                inputMode={tipo === "percentual" ? "numeric" : "decimal"}
                defaultValue={valorCampo(estado, "valor", "")}
                required
                className="h-11 max-w-40"
              />
              <ErroCampo estado={estado} campo="valor" />
            </Campo>
          ) : null}
          <Campo rotulo="Pedido mínimo (R$)" htmlFor="pedido_minimo">
            <Input id="pedido_minimo" name="pedido_minimo" inputMode="decimal" placeholder="0,00" defaultValue={valorCampo(estado, "pedido_minimo", "")} className="h-11 max-w-40" />
          </Campo>
          <Campo rotulo="Vale de" htmlFor="inicio">
            <Input id="inicio" name="inicio" type="date" defaultValue={valorCampo(estado, "inicio", "")} className="h-11 max-w-48" />
          </Campo>
          <Campo rotulo="Até" htmlFor="fim">
            <Input id="fim" name="fim" type="date" defaultValue={valorCampo(estado, "fim", "")} className="h-11 max-w-48" />
            <ErroCampo estado={estado} campo="fim" />
          </Campo>
          <Campo rotulo="Limite de usos" htmlFor="limite_usos">
            <Input id="limite_usos" name="limite_usos" type="number" min={1} placeholder="Sem limite" defaultValue={valorCampo(estado, "limite_usos", "")} className="h-11 max-w-40" />
            <ErroCampo estado={estado} campo="limite_usos" />
          </Campo>
          <label className="flex items-center gap-3 self-end text-sm font-medium">
            <input type="checkbox" name="um_por_cliente" defaultChecked={estado?.valores?.um_por_cliente === "on"} className="size-5 accent-[var(--cor-primaria-texto)]" />
            Um uso por cliente (telefone)
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <BotaoEnviar className="h-11" pendente="Criando...">
              Criar cupom
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

export function ListaCupons({ cupons }: { cupons: Cupom[] }) {
  const { pendente, executar } = useAcao();
  if (cupons.length === 0) return <p className="text-muted-foreground">Nenhum cupom ainda.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {cupons.map((c) => (
        <li key={c.id} className={cn("flex flex-wrap items-center gap-3 rounded-xl border p-3", !c.ativo && "opacity-60")}>
          <TicketPercent className="size-5 text-muted-foreground" aria-hidden />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-semibold">{c.codigo}</span>
              {!c.ativo ? <Badge variant="secondary">Desativado</Badge> : c.vencido ? <Badge variant="secondary">Vencido</Badge> : null}
            </span>
            <span className="text-sm text-muted-foreground">{descricao(c)}</span>
          </span>
          <span className="text-right text-sm">
            <span className="block font-medium tabular-nums">
              {c.usos}
              {c.limiteUsos ? `/${c.limiteUsos}` : ""} {c.usos === 1 ? "uso" : "usos"}
            </span>
            {c.descontoTotal ? <span className="text-muted-foreground tabular-nums">{formatarBRL(c.descontoTotal)} em desconto</span> : null}
          </span>
          <Button type="button" variant="outline" size="sm" disabled={pendente} onClick={() => executar(() => alternarCupom(c.id, !c.ativo))}>
            {c.ativo ? "Desativar" : "Ativar"}
          </Button>
        </li>
      ))}
    </ul>
  );
}
