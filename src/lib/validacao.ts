import { z } from "zod";

import { centavosDeTexto } from "@/lib/dinheiro";

// IDs do Postgres (z.uuid() rejeita os uuids determinísticos do seed).
export const id = z.guid("Identificador inválido.");

// Texto em reais ("12,50") -> centavos.
export function dinheiro(rotulo: string) {
  return z
    .string()
    .trim()
    .transform((valor, ctx) => {
      const centavos = centavosDeTexto(valor);
      if (centavos === null) {
        ctx.addIssue({ code: "custom", message: `${rotulo}: use o formato 12,50.` });
        return z.NEVER;
      }
      return centavos;
    });
}

// Checkbox HTML: presente ("on") = true, ausente = false.
export const checkbox = z.preprocess((valor) => valor === "on" || valor === "true", z.boolean());

// Texto opcional: vazio vira null.
export function textoOpcional(maximo: number) {
  return z.preprocess(
    (valor) => (typeof valor === "string" && valor.trim() === "" ? null : valor),
    z.string().trim().max(maximo, `Máximo de ${maximo} caracteres.`).nullable(),
  );
}

export function textoObrigatorio(rotulo: string, maximo: number) {
  return z
    .string({ error: `Informe ${rotulo}.` })
    .trim()
    .min(1, `Informe ${rotulo}.`)
    .max(maximo, `Máximo de ${maximo} caracteres.`);
}

export const inteiroOpcional = z.preprocess(
  (valor) => (valor === "" || valor === null || valor === undefined ? null : Number(valor)),
  z.number().int("Use um número inteiro.").min(0).nullable(),
);

// Lê os campos do FormData como objeto simples (valores únicos).
export function dadosDoFormulario(formData: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(formData.entries());
}
