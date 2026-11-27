"use client";

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
  capa_url: string | null;
  descricao: string | null;
  instagram: string | null;
  facebook: string | null;
  fuso_horario: string;
  horarios: Horarios;
  pedido_minimo: number;
  aceita_delivery: boolean;
  aceita_retirada: boolean;
  tempo_estimado_entrega_min: number | null;
  tempo_estimado_retirada_min: number | null;
  // fixa: um valor só (o cliente informa CEP e endereço); bairro: lista em Bairros de entrega.
  taxa_entrega_modo: "fixa" | "bairro";
  taxa_entrega_fixa: number;
  // Modo bairro: o que cobrar de quem não está na lista (nulo = não entrega fora dela).
  taxa_outros_bairros: number | null;
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
  const [modoTaxa, setModoTaxa] = useState<"fixa" | "bairro">(
    (estado?.valores?.taxa_entrega_modo ?? restaurante.taxa_entrega_modo) === "bairro" ? "bairro" : "fixa",
  );
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
        <CardHeader>
          <CardTitle>Marca</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <UploadImagem
              bucket="rest-logos"
              pasta={restaurante.id}
              name="logo_url"
              valorInicial={estado?.valores?.logo_url ?? restaurante.logo_url}
              rotulo="Logo"
              ladoMaximo={512}
              erroServidor={estado?.erros?.logo_url}
            />
          </div>
          <div className="sm:col-span-2">
            <UploadImagem
              bucket="rest-capas"
              pasta={restaurante.id}
              name="capa_url"
              valorInicial={estado?.valores?.capa_url ?? restaurante.capa_url}
              rotulo="Capa do site"
              ladoMaximo={1600}
              erroServidor={estado?.erros?.capa_url}
            />
          </div>
          <Campo rotulo="Uma linha sobre a casa" htmlFor="descricao" className="sm:col-span-2">
            <Input
              id="descricao"
              name="descricao"
              maxLength={160}
              placeholder="Espetinho na brasa e hambúrguer artesanal"
              defaultValue={valorCampo(estado, "descricao", restaurante.descricao)}
              className="h-10"
            />
            <ErroCampo estado={estado} campo="descricao" />
          </Campo>
          <Campo rotulo="Instagram" htmlFor="instagram">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">@</span>
              <Input
                id="instagram"
                name="instagram"
                placeholder="seurestaurante"
                defaultValue={valorCampo(estado, "instagram", restaurante.instagram)}
                className="h-10"
              />
            </div>
            <ErroCampo estado={estado} campo="instagram" />
          </Campo>
          <Campo rotulo="Facebook" htmlFor="facebook">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">/</span>
              <Input
                id="facebook"
                name="facebook"
                placeholder="seurestaurante"
                defaultValue={valorCampo(estado, "facebook", restaurante.facebook)}
                className="h-10"
              />
            </div>
            <ErroCampo estado={estado} campo="facebook" />
          </Campo>
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
          <Campo rotulo="Cor dos botões" htmlFor="cor_secundaria">
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
          <PreviaMarca
            nome={restaurante.nome}
            logoUrl={restaurante.logo_url}
            capaUrl={restaurante.capa_url}
            descricao={restaurante.descricao}
            corPrimaria={corPrimaria}
            corSecundaria={corSecundaria}
          />
        </CardContent>
      </Card>

      <Card id="horarios" className="scroll-mt-20">
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
          {/* O que a casa faz — isto é configuração e muda quase nunca. Suspender os pedidos
              agora é outra coisa, e fica no quadro do Delivery (um botão). */}
          <fieldset className="flex flex-col gap-2 sm:col-span-2">
            {/* Sem título à vista: o cartão já se chama Delivery e os dois rótulos bastam.
                O nome do grupo fica só para leitor de tela. */}
            <legend className="sr-only">Como o cliente recebe</legend>
            <label className="flex pointer-coarse:min-h-11 items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                name="aceita_delivery"
                defaultChecked={marcadoCampo(estado, "aceita_delivery", restaurante.aceita_delivery)}
                className="size-5 pointer-coarse:size-6 accent-[var(--cor-primaria-texto)]"
              />
              Entrega
            </label>
            <label className="flex pointer-coarse:min-h-11 items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                name="aceita_retirada"
                defaultChecked={marcadoCampo(estado, "aceita_retirada", restaurante.aceita_retirada)}
                className="size-5 pointer-coarse:size-6 accent-[var(--cor-primaria-texto)]"
              />
              Retirada
            </label>
          </fieldset>
          <Campo rotulo="Como cobrar a entrega" htmlFor="taxa_entrega_modo" className="sm:col-span-2">
            <Selecao
              id="taxa_entrega_modo"
              name="taxa_entrega_modo"
              value={modoTaxa}
              onChange={(e) => setModoTaxa(e.target.value === "bairro" ? "bairro" : "fixa")}
            >
              <option value="fixa">Uma taxa para todo mundo</option>
              <option value="bairro">Uma taxa por bairro</option>
            </Selecao>
          </Campo>
          {modoTaxa === "fixa" ? (
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
          ) : (
            <>
              {/* O valor fixo continua guardado: trocar de modo e voltar não apaga o que estava lá. */}
              <input type="hidden" name="taxa_entrega_fixa" value={textoDeCentavos(restaurante.taxa_entrega_fixa)} />
              <Campo
                rotulo="Taxa para outros bairros (R$)"
                htmlFor="taxa_outros_bairros"
                dica="Em branco = não entrega fora da lista"
              >
                <Input
                  id="taxa_outros_bairros"
                  name="taxa_outros_bairros"
                  inputMode="decimal"
                  placeholder="Ex.: 15,00"
                  defaultValue={valorCampo(
                    estado,
                    "taxa_outros_bairros",
                    restaurante.taxa_outros_bairros === null ? "" : textoDeCentavos(restaurante.taxa_outros_bairros),
                  )}
                  className="h-10 max-w-40"
                />
                <ErroCampo estado={estado} campo="taxa_outros_bairros" />
              </Campo>
              <p className="text-sm text-muted-foreground sm:col-span-2">
                O bairro vem do CEP que o cliente digita — ele não escolhe numa lista.{" "}
                <Link href="/painel/bairros" className="font-medium text-foreground underline underline-offset-4">
                  Cadastrar os bairros e as taxas
                </Link>
              </p>
            </>
          )}
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
          {/* Ligar e pausar a retirada é no quadro do Delivery (decisão de meio de serviço);
              aqui fica só quanto tempo o cliente espera para buscar. */}
          <Campo
            rotulo="Tempo de preparo para retirada (minutos)"
            htmlFor="tempo_estimado_retirada_min"
            dica="Mostrado a quem escolhe retirar no local"
          >
            <Input
              id="tempo_estimado_retirada_min"
              name="tempo_estimado_retirada_min"
              type="number"
              min={1}
              defaultValue={valorCampo(estado, "tempo_estimado_retirada_min", restaurante.tempo_estimado_retirada_min)}
              className="h-10"
            />
            <ErroCampo estado={estado} campo="tempo_estimado_retirada_min" />
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
