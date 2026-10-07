"use client";

import { useActionState, useState } from "react";

import { BotaoEnviar, Campo, ErroCampo, marcadoCampo, Selecao, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { UploadImagem } from "@/components/staff/upload-imagem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { textoDeCentavos } from "@/lib/dinheiro";
import { FUSOS, type Horarios, lerHorarios } from "@/lib/horarios";
import type { ResultadoAcao } from "@/lib/acoes";

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
};

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
  const e = restaurante.endereco;

  return (
    <form key={estado?.chave} action={acao} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Identificação</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Nome do restaurante" htmlFor="nome" className="sm:col-span-2">
            <Input id="nome" name="nome" defaultValue={valorCampo(estado, "nome", restaurante.nome)} required className="h-10" />
            <ErroCampo estado={estado} campo="nome" />
          </Campo>
          <Campo rotulo="Telefone" htmlFor="telefone">
            <Input id="telefone" name="telefone" type="tel" defaultValue={valorCampo(estado, "telefone", restaurante.telefone)} className="h-10" />
            <ErroCampo estado={estado} campo="telefone" />
          </Campo>
          <Campo rotulo="WhatsApp" htmlFor="whatsapp" dica="Com DDD, só números.">
            <Input id="whatsapp" name="whatsapp" type="tel" defaultValue={valorCampo(estado, "whatsapp", restaurante.whatsapp)} className="h-10" />
            <ErroCampo estado={estado} campo="whatsapp" />
          </Campo>
          <p className="text-sm text-muted-foreground sm:col-span-2">
            Endereço do site de delivery: <strong className="text-foreground">/{restaurante.slug}</strong>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Marca</CardTitle>
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
          <CardTitle>Endereço</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-6">
          <Campo rotulo="Rua" htmlFor="rua" className="sm:col-span-4">
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
        <CardHeader>
          <CardTitle>Funcionamento</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Campo rotulo="Fuso horário" htmlFor="fuso_horario">
            <Selecao id="fuso_horario" name="fuso_horario" defaultValue={valorCampo(estado, "fuso_horario", restaurante.fuso_horario)}>
              {FUSOS.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </Selecao>
          </Campo>
          <EditorHorarios inicial={horariosEnviados(estado) ?? restaurante.horarios} />
        </CardContent>
      </Card>

      <Card>
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
          <Campo rotulo="Tempo estimado de entrega (min)" htmlFor="tempo_estimado_entrega_min">
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
