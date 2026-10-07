"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import { useActionState, useRef, useState } from "react";

import { valorCampo } from "@/components/staff/formulario";
import { corDeContraste } from "@/lib/cores";
import { FUSOS } from "@/lib/horarios";
import { gerarSlug } from "@/lib/slug";
import { cn } from "@/lib/utils";

import { AvisoErro, BotaoEnviarUau, CampoUau, classeEntrada, propsErro } from "../_componentes/campos";
import { criarRestaurante, type Disponibilidade, verificarSlug } from "./actions";
import { type IdPaleta, PALETAS } from "./paletas";

type Checagem = { estado: "ocioso" } | { estado: "verificando" } | ({ estado: "pronto" } & Disponibilidade);

export function FormComecar({
  dominio,
  nomeInicial,
  nomeDonoInicial,
}: {
  dominio: string;
  nomeInicial: string;
  nomeDonoInicial: string;
}) {
  const [estado, acao] = useActionState(criarRestaurante, undefined);
  const [nome, setNome] = useState(nomeInicial);
  const [slug, setSlug] = useState(gerarSlug(nomeInicial));
  const [slugEditado, setSlugEditado] = useState(false);
  const [paleta, setPaleta] = useState<IdPaleta>("brasa");
  const [checagem, setChecagem] = useState<Checagem>({ estado: "ocioso" });
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimaConsulta = useRef("");

  // Consulta o endereço 400 ms depois da última digitação; ignora respostas atrasadas.
  function agendarChecagem(valor: string) {
    if (temporizador.current) clearTimeout(temporizador.current);
    if (!valor) {
      setChecagem({ estado: "ocioso" });
      return;
    }
    setChecagem({ estado: "verificando" });
    temporizador.current = setTimeout(async () => {
      ultimaConsulta.current = valor;
      const resultado = await verificarSlug(valor);
      if (ultimaConsulta.current === valor) setChecagem({ estado: "pronto", ...resultado });
    }, 400);
  }

  function mudarNome(valor: string) {
    setNome(valor);
    if (!slugEditado) {
      const novo = gerarSlug(valor);
      setSlug(novo);
      agendarChecagem(novo);
    }
  }

  function mudarSlug(valor: string) {
    const limpo = valor.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-");
    setSlugEditado(true);
    setSlug(limpo);
    agendarChecagem(limpo.replace(/^-+|-+$/g, ""));
  }

  const cores = PALETAS.find((p) => p.id === paleta)!;
  const erroSlug = estado?.erros?.slug;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-start">
      <form key={estado?.chave} action={acao} className="flex flex-col gap-6" noValidate>
        <AvisoErro estado={estado} />
        <CampoUau id="nome" rotulo="Nome do restaurante" estado={estado}>
          <input
            id="nome"
            name="nome"
            required
            maxLength={120}
            value={nome}
            onChange={(e) => mudarNome(e.target.value)}
            className={classeEntrada}
            {...propsErro(estado, "nome")}
          />
        </CampoUau>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="slug" className="text-sm font-extrabold">
            Endereço do site de delivery
          </label>
          <div
            className={cn(
              "flex h-12 items-center overflow-hidden rounded-xl border-2 bg-white focus-within:border-uau-marrom",
              erroSlug || (checagem.estado === "pronto" && !checagem.disponivel) ? "border-red-600" : "border-uau-borda",
            )}
          >
            <span className="hidden h-full items-center border-r-2 border-uau-borda bg-uau-creme px-3 text-sm font-bold text-uau-marrom-claro sm:flex">
              {dominio}/
            </span>
            <input
              id="slug"
              name="slug"
              required
              maxLength={60}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={slug}
              onChange={(e) => mudarSlug(e.target.value)}
              onBlur={() => setSlug((v) => v.replace(/^-+|-+$/g, ""))}
              className="h-full min-w-0 flex-1 bg-transparent px-3 text-base font-semibold outline-none"
              aria-describedby="slug-status"
              aria-invalid={Boolean(erroSlug) || (checagem.estado === "pronto" && !checagem.disponivel) || undefined}
            />
            <span className="flex w-10 shrink-0 justify-center" aria-hidden>
              {checagem.estado === "verificando" ? (
                <LoaderCircle className="size-5 animate-spin text-uau-marrom-claro" />
              ) : checagem.estado === "pronto" ? (
                checagem.disponivel ? (
                  <Check className="size-5 text-green-700" strokeWidth={3} />
                ) : (
                  <X className="size-5 text-red-700" strokeWidth={3} />
                )
              ) : null}
            </span>
          </div>
          <p id="slug-status" aria-live="polite" className="text-sm">
            {erroSlug ? (
              <span className="font-bold text-red-700">{erroSlug}</span>
            ) : checagem.estado === "pronto" && !checagem.disponivel ? (
              <span className="font-bold text-red-700">{checagem.motivo}</span>
            ) : checagem.estado === "pronto" ? (
              <span className="font-bold text-green-800">Endereço disponível.</span>
            ) : (
              <span className="text-uau-marrom-claro">É o link que você vai mandar para os clientes. Não dá para mudar depois.</span>
            )}
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-extrabold">Cores da marca</legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {PALETAS.map((p) => (
              <label
                key={p.id}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 bg-white p-2 text-xs font-extrabold transition-colors has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-uau-laranja",
                  paleta === p.id ? "border-uau-marrom" : "border-uau-borda hover:border-uau-marrom/40",
                )}
              >
                <input
                  type="radio"
                  name="paleta"
                  value={p.id}
                  checked={paleta === p.id}
                  onChange={() => setPaleta(p.id)}
                  className="sr-only"
                />
                <span className="flex h-8 w-full overflow-hidden rounded-lg" aria-hidden>
                  <span className="flex-[2]" style={{ backgroundColor: p.primaria }} />
                  <span className="flex-1" style={{ backgroundColor: p.secundaria }} />
                </span>
                {p.nome}
              </label>
            ))}
          </div>
          <p className="text-sm text-uau-marrom-claro">Logo e cores exatas você ajusta depois, no painel.</p>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <CampoUau id="nomeDono" rotulo="Seu nome" dica="Aparece para a equipe." estado={estado}>
            <input
              id="nomeDono"
              name="nomeDono"
              required
              maxLength={80}
              autoComplete="name"
              defaultValue={valorCampo(estado, "nomeDono", nomeDonoInicial)}
              className={classeEntrada}
              {...propsErro(estado, "nomeDono")}
            />
          </CampoUau>
          <CampoUau id="whatsapp" rotulo="WhatsApp do restaurante" dica="Opcional." estado={estado}>
            <input
              id="whatsapp"
              name="whatsapp"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              placeholder="(69) 99999-0000"
              defaultValue={valorCampo(estado, "whatsapp", "")}
              className={classeEntrada}
              {...propsErro(estado, "whatsapp")}
            />
          </CampoUau>
        </div>

        <CampoUau id="fuso" rotulo="Fuso horário" dica="Usado nos horários de funcionamento e nos resumos do caixa." estado={estado}>
          <select
            id="fuso"
            name="fuso"
            defaultValue={valorCampo(estado, "fuso", "America/Sao_Paulo")}
            className={cn(classeEntrada, "appearance-auto")}
            {...propsErro(estado, "fuso")}
          >
            {FUSOS.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.rotulo}
              </option>
            ))}
          </select>
        </CampoUau>

        <BotaoEnviarUau pendente="Criando restaurante..." className="w-full sm:w-fit">
          Criar meu restaurante
        </BotaoEnviarUau>
      </form>

      {/* Prévia ao vivo do site de delivery com o nome, o endereço e as cores escolhidos. */}
      <div aria-hidden className="hidden w-[280px] lg:sticky lg:top-8 lg:block">
        <p className="mb-3 text-center text-sm font-extrabold text-uau-marrom-claro">Prévia do seu site</p>
        <div className="rounded-[2.4rem] border-[7px] border-uau-marrom bg-uau-marrom shadow-[0_30px_60px_-20px_rgb(43_26_18/0.55)]">
          <div className="overflow-hidden rounded-[1.9rem] bg-[#f6f3ef]">
            <div className="truncate bg-white px-4 pt-3 pb-2 text-[11px] font-semibold text-neutral-500">
              {dominio}/{slug || "seu-restaurante"}
            </div>
            <div
              className="flex items-center gap-2.5 px-4 py-3.5 transition-colors duration-500"
              style={{ backgroundColor: cores.primaria, color: corDeContraste(cores.primaria) }}
            >
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-base font-black transition-colors duration-500"
                style={{ backgroundColor: cores.secundaria, color: corDeContraste(cores.secundaria) }}
              >
                {(nome.trim()[0] ?? "R").toUpperCase()}
              </span>
              <span className="truncate text-[15px] font-black">{nome.trim() || "Seu restaurante"}</span>
            </div>
            <div className="flex flex-col gap-2.5 p-3.5">
              {["Seu primeiro produto", "Mais um produto"].map((n, i) => (
                <div key={n} className="flex items-center justify-between gap-2 rounded-xl bg-white p-3 shadow-sm">
                  <span className="flex flex-col gap-1">
                    <span className="h-2.5 w-24 rounded-full bg-neutral-200" />
                    <span className={cn("h-2 rounded-full bg-neutral-100", i ? "w-12" : "w-16")} />
                  </span>
                  <span
                    className="rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors duration-500"
                    style={{ backgroundColor: cores.primaria, color: corDeContraste(cores.primaria) }}
                  >
                    + Adicionar
                  </span>
                </div>
              ))}
              <div
                className="mt-1 rounded-xl px-4 py-3 text-center text-[13px] font-black transition-colors duration-500"
                style={{ backgroundColor: cores.primaria, color: corDeContraste(cores.primaria) }}
              >
                Ver carrinho
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
