"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { falha, falhaValidacao, type ResultadoAcao } from "@/lib/acoes";
import { gravarRestauranteAtivo } from "@/lib/auth/cookie-restaurante";
import { obterUsuario } from "@/lib/auth/dal";
import { fusoSchema } from "@/lib/horarios";
import { SLUG_MAX, SLUG_MIN, SLUG_REGEX } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";
import { dadosDoFormulario, textoObrigatorio, textoOpcional } from "@/lib/validacao";

import { PALETAS } from "./paletas";

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => v.replace(/^-+|-+$/g, ""))
  .pipe(
    z
      .string()
      .min(SLUG_MIN, `Use pelo menos ${SLUG_MIN} caracteres.`)
      .max(SLUG_MAX, `Máximo de ${SLUG_MAX} caracteres.`)
      .regex(SLUG_REGEX, "Use só letras minúsculas, números e hífens (ex.: brasa-do-bairro)."),
  );

const schema = z.object({
  nome: textoObrigatorio("o nome do restaurante", 120),
  slug: slugSchema,
  nomeDono: textoObrigatorio("o seu nome", 80),
  whatsapp: textoOpcional(20).refine((v) => v === null || /^[\d\s()+-]{8,20}$/.test(v), "WhatsApp inválido."),
  fuso: fusoSchema,
  paleta: z.enum(PALETAS.map((p) => p.id) as [string, ...string[]], { error: "Escolha as cores." }),
});

export async function criarRestaurante(_estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  if (!(await obterUsuario())) redirect("/login?next=/comecar");

  const dados = schema.safeParse(dadosDoFormulario(formData));
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const paleta = PALETAS.find((p) => p.id === dados.data.paleta)!;
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("criar_meu_restaurante", {
    p_nome: dados.data.nome,
    p_slug: dados.data.slug,
    p_nome_dono: dados.data.nomeDono,
    p_fuso: dados.data.fuso,
    p_whatsapp: dados.data.whatsapp ?? undefined,
    p_cor_primaria: paleta.primaria,
    p_cor_secundaria: paleta.secundaria,
  });

  if (error) {
    if (error.code === "P0001" && error.message.includes("endereço")) {
      return falha("Confira os campos destacados.", { slug: error.message }, formData);
    }
    return falha(error.code === "P0001" ? error.message : "Não foi possível criar o restaurante. Tente novamente.", undefined, formData);
  }

  await gravarRestauranteAtivo(id);
  redirect("/painel");
}

export type Disponibilidade = { disponivel: boolean; motivo?: string };

// Checagem ao digitar o endereço (a validação definitiva é a do banco, ao criar).
export async function verificarSlug(slug: string): Promise<Disponibilidade> {
  if (!(await obterUsuario())) return { disponivel: false, motivo: "Entre novamente." };
  const formato = slugSchema.safeParse(slug);
  if (!formato.success) return { disponivel: false, motivo: formato.error.issues[0]?.message };

  const supabase = await createClient();
  const { data } = await supabase.rpc("slug_disponivel", { p_slug: formato.data });
  return data ? { disponivel: true } : { disponivel: false, motivo: "Esse endereço já está em uso ou é reservado." };
}
