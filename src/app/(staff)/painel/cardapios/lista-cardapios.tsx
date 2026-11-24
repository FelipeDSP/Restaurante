"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { ControlesOrdem, useAcao } from "@/components/staff/acoes-cliente";
import { EscolherDias } from "@/components/staff/escolher-dias";
import { BotaoEnviar, Campo, ErroCampo, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { rotuloDias, rotuloJanela, TODOS_OS_DIAS } from "@/lib/cardapios";

import { alternarCardapio, criarCardapio, moverCardapio } from "./actions";

export type CardapioLista = {
  id: string;
  nome: string;
  dias: number[];
  abre: string;
  fecha: string;
  ativo: boolean;
  produtos: number;
  agora: boolean;
};

export function NovoCardapio() {
  const [aberto, setAberto] = useState(false);
  const [estado, acao] = useActionState(criarCardapio, undefined);
  const [dias, setDias] = useState<number[]>([...TODOS_OS_DIAS]);
  useAvisoResultado(estado);

  if (!aberto) {
    return (
      <Button type="button" className="h-11 self-start" onClick={() => setAberto(true)}>
        <Plus />
        Novo cardápio
      </Button>
    );
  }

  return (
    <Card>
      <CardContent>
        <form key={estado?.chave} action={acao} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Nome" htmlFor="nome">
              <Input
                id="nome"
                name="nome"
                placeholder="Almoço"
                defaultValue={valorCampo(estado, "nome", "")}
                maxLength={60}
                required
                autoFocus
                className="h-11"
              />
              <ErroCampo estado={estado} campo="nome" />
            </Campo>
            <Campo rotulo="Começa" htmlFor="abre">
              <Input id="abre" name="abre" type="time" defaultValue={valorCampo(estado, "abre", "11:00")} required className="h-11" />
              <ErroCampo estado={estado} campo="abre" />
            </Campo>
            <Campo rotulo="Termina" htmlFor="fecha">
              <Input id="fecha" name="fecha" type="time" defaultValue={valorCampo(estado, "fecha", "15:00")} required className="h-11" />
              <ErroCampo estado={estado} campo="fecha" />
            </Campo>
          </div>
          <Campo rotulo="Dias" htmlFor="dias">
            <EscolherDias dias={dias} aoMudar={setDias} />
          </Campo>
          <div className="flex gap-2">
            <BotaoEnviar className="h-11" pendente="Criando...">
              Criar e escolher produtos
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

function LinhaCardapio({ cardapio, primeiro, ultimo }: { cardapio: CardapioLista; primeiro: boolean; ultimo: boolean }) {
  const { pendente, executar } = useAcao();

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center">
      <ControlesOrdem
        rotulo={cardapio.nome}
        primeiro={primeiro}
        ultimo={ultimo}
        desabilitado={pendente}
        aoMover={(direcao) => executar(() => moverCardapio(cardapio.id, direcao))}
      />
      <Link href={`/painel/cardapios/${cardapio.id}`} className="flex min-w-0 flex-1 flex-col">
        <span className="flex flex-wrap items-center gap-2 font-medium">
          {cardapio.nome}
          {cardapio.agora ? <Badge>Valendo agora</Badge> : null}
          {!cardapio.ativo ? <Badge variant="secondary">Desligado</Badge> : null}
          {cardapio.produtos === 0 ? <Badge variant="outline">Sem produtos</Badge> : null}
        </span>
        <span className="text-sm text-muted-foreground">
          {rotuloDias(cardapio.dias)}, {rotuloJanela(cardapio.abre, cardapio.fecha)} ·{" "}
          {cardapio.produtos} {cardapio.produtos === 1 ? "produto" : "produtos"}
        </span>
      </Link>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pendente}
          onClick={() => executar(() => alternarCardapio(cardapio.id, !cardapio.ativo))}
        >
          {cardapio.ativo ? "Desligar" : "Ligar"}
        </Button>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/painel/cardapios/${cardapio.id}`} />}>
          Abrir
        </Button>
      </div>
    </li>
  );
}

export function ListaCardapios({ cardapios }: { cardapios: CardapioLista[] }) {
  if (cardapios.length === 0) {
    return (
      <p className="text-muted-foreground">
        Nenhum cardápio: todo produto disponível aparece a qualquer hora. Crie um por horário
        (Almoço das 11h às 15h, Janta das 18h às 23h) e escolha quais produtos entram em cada um.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {cardapios.map((cardapio, i) => (
        <LinhaCardapio key={cardapio.id} cardapio={cardapio} primeiro={i === 0} ultimo={i === cardapios.length - 1} />
      ))}
    </ul>
  );
}
