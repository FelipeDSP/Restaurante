"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { BotaoEnviar, Campo, ErroCampo, marcadoCampo, Selecao, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { UploadImagem } from "@/components/staff/upload-imagem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { textoDeCentavos } from "@/lib/dinheiro";
import { FUSOS, type Horarios, lerHorarios } from "@/lib/horarios";
import type { ResultadoAcao } from "@/lib/acoes";
import { cn } from "@/lib/utils";

import { salvarRestaurante } from "./actions";
import { EditorHorarios } from "./editor-horarios";
import { PreviaMarca } from "./previa-marca";

export type DadosRestaurante = {
  id: string;
  slug: string;
  nome: string;
  telefone: string | null;
  whatsapp: string | null;
  endereco: Record<string, string | null>;
  cor_primaria: string;
  cor_secundaria: string;
  logo_url: string | null;
  fuso_horario: string;
  horarios: Horarios;
  aceita_delivery: boolean;
  pedido_minimo: number;
  tempo_estimado_entrega_min: number | null;
  // fixa: um valor só (o cliente informa CEP e endereço); bairro: lista em Bairros de entrega.
  taxa_entrega_modo: "fixa" | "bairro";
  taxa_entrega_fixa: number;
  servico_percentual: number;
  couvert_valor: number;
  couvert_dias: number[];
};

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function horariosEnviados(estado: ResultadoAcao): Horarios | null {
  const texto = estado?.valores?.horarios;
  if (!texto) return null;
  try {
    return lerHorarios(JSON.parse(texto));
  } catch {
    return null;
  }
}

export function FormRestaurante({ restaurante }: { restaurante: DadosRestaurante }) {
  const [estado, acao] = useActionState(salvarRestaurante, undefined);
  useAvisoResultado(estado);
  const [corPrimaria, setCorPrimaria] = useState(restaurante.cor_primaria);
  const [corSecundaria, setCorSecundaria] = useState(restaurante.cor_secundaria);
  const [diasCouvert, setDiasCouvert] = useState<number[]>(
    estado?.valores?.couvert_dias !== undefined
      ? estado.valores.couvert_dias.split(",").filter(Boolean).map(Number)
      : restaurante.couvert_dias,
  );
  const e = restaurante.endereco;

  return (
    <form key={estado?.chave} action={acao} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Dados</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-6">
          <Campo rotulo="Nome do restaurante" htmlFor="nome" className="sm:col-span-6">
            <Input id="nome" name="nome" defaultValue={valorCampo(estado, "nome", restaurante.nome)} required className="h-10" />
            <ErroCampo estado={estado} campo="nome" />
          </Campo>
          <Campo rotulo="Telefone" htmlFor="telefone" className="sm:col-span-3">
            <Input id="telefone" name="telefone" type="tel" defaultValue={valorCampo(estado, "telefone", restaurante.telefone)} className="h-10" />
            <ErroCampo estado={estado} campo="telefone" />
          </Campo>
          <Campo rotulo="WhatsApp" htmlFor="whatsapp" className="sm:col-span-3">
            <Input id="whatsapp" name="whatsapp" type="tel" placeholder="DDD + número" defaultValue={valorCampo(estado, "whatsapp", restaurante.whatsapp)} className="h-10" />
            <ErroCampo estado={estado} campo="whatsapp" />
          </Campo>
          <Campo rotulo="Endereço" htmlFor="rua" className="sm:col-span-4">
            <Input id="rua" name="rua" defaultValue={valorCampo(estado, "rua", e.rua)} className="h-10" />
          </Campo>
          <Campo rotulo="Número" htmlFor="numero" className="sm:col-span-2">
            <Input id="numero" name="numero" defaultValue={valorCampo(estado, "numero", e.numero)} className="h-10" />
          </Campo>
          <Campo rotulo="Bairro" htmlFor="bairro" className="sm:col-span-3">
            <Input id="bairro" name="bairro" defaultValue={valorCampo(estado, "bairro", e.bairro)} className="h-10" />
          </Campo>
          <Campo rotulo="Complemento" htmlFor="complemento" className="sm:col-span-3">
            <Input id="complemento" name="complemento" defaultValue={valorCampo(estado, "complemento", e.complemento)} className="h-10" />
          </Campo>
          <Campo rotulo="Cidade" htmlFor="cidade" className="sm:col-span-4">
            <Input id="cidade" name="cidade" defaultValue={valorCampo(estado, "cidade", e.cidade)} className="h-10" />
          </Campo>
          <Campo rotulo="UF" htmlFor="uf" className="sm:col-span-2">
            <Input id="uf" name="uf" maxLength={2} defaultValue={valorCampo(estado, "uf", e.uf)} className="h-10 uppercase" />
          </Campo>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Marca</CardTitle>
          <Link href={`/${restaurante.slug}`} target="_blank" className="inline-flex items-center gap-1 text-sm font-medium underline underline-offset-4">
            Ver meu site
            <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <UploadImagem
              bucket="rest-logos"
              restauranteId={restaurante.id}
              name="logo_url"
              valorInicial={estado?.valores?.logo_url ?? restaurante.logo_url}
              rotulo="Logo"
              ladoMaximo={512}
            />
          </div>
          <Campo rotulo="Cor principal" htmlFor="cor_primaria">
            <div className="flex items-center gap-2">
              <input
                id="cor_primaria"
                name="cor_primaria"
                type="color"
                value={corPrimaria}
                onChange={(ev) => setCorPrimaria(ev.target.value)}
                className="h-10 w-16 cursor-pointer rounded-lg border"
              />
              <span className="font-mono text-sm">{corPrimaria}</span>
            </div>
          </Campo>
          <Campo rotulo="Cor de destaque" htmlFor="cor_secundaria">
            <div className="flex items-center gap-2">
              <input
                id="cor_secundaria"
                name="cor_secundaria"
                type="color"
                value={corSecundaria}
                onChange={(ev) => setCorSecundaria(ev.target.value)}
                className="h-10 w-16 cursor-pointer rounded-lg border"
              />
              <span className="font-mono text-sm">{corSecundaria}</span>
            </div>
          </Campo>
          <PreviaMarca nome={restaurante.nome} logoUrl={restaurante.logo_url} corPrimaria={corPrimaria} corSecundaria={corSecundaria} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Horários</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <EditorHorarios inicial={horariosEnviados(estado) ?? restaurante.horarios} />
          <Campo rotulo="Fuso horário" htmlFor="fuso_horario" className="max-w-xs">
            <Selecao id="fuso_horario" name="fuso_horario" defaultValue={valorCampo(estado, "fuso_horario", restaurante.fuso_horario)}>
              {FUSOS.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </Selecao>
          </Campo>
        </CardContent>
      </Card>

      <Card id="delivery" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Delivery</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-3 text-sm font-medium sm:col-span-2">
            <input
              type="checkbox"
              name="aceita_delivery"
              defaultChecked={marcadoCampo(estado, "aceita_delivery", restaurante.aceita_delivery)}
              className="size-5 accent-[var(--cor-primaria-texto)]"
            />
            Aceitar pedidos de delivery pelo site
          </label>
          {/* Por enquanto só taxa fixa (a taxa por bairro volta quando for repensada; o banco ainda aceita). */}
          <input type="hidden" name="taxa_entrega_modo" value="fixa" />
          <Campo rotulo="Taxa de entrega (R$)" htmlFor="taxa_entrega_fixa" dica="0,00 = entrega grátis">
            <Input
              id="taxa_entrega_fixa"
              name="taxa_entrega_fixa"
              inputMode="decimal"
              placeholder="Ex.: 7,00"
              defaultValue={valorCampo(estado, "taxa_entrega_fixa", textoDeCentavos(restaurante.taxa_entrega_fixa))}
              className="h-10 max-w-40"
            />
            <ErroCampo estado={estado} campo="taxa_entrega_fixa" />
          </Campo>
          <Campo rotulo="Pedido mínimo (R$)" htmlFor="pedido_minimo">
            <Input
              id="pedido_minimo"
              name="pedido_minimo"
              inputMode="decimal"
              defaultValue={valorCampo(estado, "pedido_minimo", textoDeCentavos(restaurante.pedido_minimo))}
              className="h-10"
            />
            <ErroCampo estado={estado} campo="pedido_minimo" />
          </Campo>
          <Campo rotulo="Tempo de entrega (minutos)" htmlFor="tempo_estimado_entrega_min">
            <Input
              id="tempo_estimado_entrega_min"
              name="tempo_estimado_entrega_min"
              type="number"
              min={1}
              defaultValue={valorCampo(estado, "tempo_estimado_entrega_min", restaurante.tempo_estimado_entrega_min)}
              className="h-10"
            />
            <ErroCampo estado={estado} campo="tempo_estimado_entrega_min" />
          </Campo>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mesas: serviço e couvert</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Taxa de serviço (%)" htmlFor="servico_percentual" dica="0 = não cobra">
            <Input
              id="servico_percentual"
              name="servico_percentual"
              type="number"
              min={0}
              max={30}
              inputMode="numeric"
              defaultValue={valorCampo(estado, "servico_percentual", restaurante.servico_percentual)}
              className="h-10 max-w-32"
            />
            <ErroCampo estado={estado} campo="servico_percentual" />
          </Campo>
          <Campo rotulo="Couvert por pessoa (R$)" htmlFor="couvert_valor" dica="0,00 = não cobra">
            <Input
              id="couvert_valor"
              name="couvert_valor"
              inputMode="decimal"
              defaultValue={valorCampo(estado, "couvert_valor", textoDeCentavos(restaurante.couvert_valor))}
              className="h-10 max-w-32"
            />
            <ErroCampo estado={estado} campo="couvert_valor" />
          </Campo>
          <fieldset className="flex flex-col gap-2 sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">Dias com couvert</legend>
            <input type="hidden" name="couvert_dias" value={diasCouvert.join(",")} />
            <div className="flex flex-wrap gap-2">
              {DIAS_SEMANA.map((rotulo, dia) => {
                const marcado = diasCouvert.includes(dia);
                return (
                  <button
                    key={rotulo}
                    type="button"
                    aria-pressed={marcado}
                    onClick={() => setDiasCouvert((d) => (marcado ? d.filter((x) => x !== dia) : [...d, dia].sort()))}
                    className={cn(
                      "min-h-10 min-w-14 rounded-full border px-3 text-sm font-medium",
                      marcado ? "border-[var(--cor-primaria-texto)] bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]" : "hover:bg-muted",
                    )}
                  >
                    {rotulo}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </CardContent>
      </Card>

      {estado && !estado.ok && estado.mensagem ? (
        <p role="alert" className="text-sm text-destructive">
          {estado.mensagem}
        </p>
      ) : null}

      <div className="sticky bottom-0 -mx-4 border-t bg-background/95 p-4 backdrop-blur md:-mx-6 md:px-6">
        <BotaoEnviar className="h-11 w-full sm:w-auto">Salvar alterações</BotaoEnviar>
      </div>
    </form>
  );
}
