import { z } from "zod";

export const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"] as const;
export type Dia = (typeof DIAS)[number];

export const NOME_DIA: Record<Dia, string> = {
  dom: "Domingo",
  seg: "Segunda",
  ter: "Terça",
  qua: "Quarta",
  qui: "Quinta",
  sex: "Sexta",
  sab: "Sábado",
};

export type Intervalo = { abre: string; fecha: string };
export type Horarios = Partial<Record<Dia, Intervalo[]>>;

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido.");

// Formato salvo em restaurantes.horarios. "fecha" <= "abre" significa que fecha depois da meia-noite.
export const horariosSchema = z
  .object(
    Object.fromEntries(
      DIAS.map((dia) => [dia, z.array(z.object({ abre: hora, fecha: hora })).max(3).optional()]),
    ) as Record<Dia, z.ZodOptional<z.ZodArray<z.ZodObject<{ abre: typeof hora; fecha: typeof hora }>>>>,
  )
  .strict();

export function lerHorarios(valor: unknown): Horarios {
  const resultado = horariosSchema.safeParse(valor);
  return resultado.success ? resultado.data : {};
}

// Fusos do Brasil (IANA).
export const FUSOS = [
  { valor: "America/Noronha", rotulo: "Fernando de Noronha (UTC−2)" },
  { valor: "America/Sao_Paulo", rotulo: "Brasília / São Paulo (UTC−3)" },
  { valor: "America/Bahia", rotulo: "Bahia (UTC−3)" },
  { valor: "America/Fortaleza", rotulo: "Fortaleza (UTC−3)" },
  { valor: "America/Recife", rotulo: "Recife (UTC−3)" },
  { valor: "America/Maceio", rotulo: "Maceió (UTC−3)" },
  { valor: "America/Belem", rotulo: "Belém (UTC−3)" },
  { valor: "America/Araguaina", rotulo: "Tocantins (UTC−3)" },
  { valor: "America/Cuiaba", rotulo: "Cuiabá (UTC−4)" },
  { valor: "America/Campo_Grande", rotulo: "Campo Grande (UTC−4)" },
  { valor: "America/Porto_Velho", rotulo: "Porto Velho (UTC−4)" },
  { valor: "America/Boa_Vista", rotulo: "Boa Vista (UTC−4)" },
  { valor: "America/Manaus", rotulo: "Manaus (UTC−4)" },
  { valor: "America/Rio_Branco", rotulo: "Rio Branco (UTC−5)" },
] as const;

export const fusoSchema = z.enum(FUSOS.map((f) => f.valor) as [string, ...string[]], {
  error: "Fuso horário inválido.",
});
