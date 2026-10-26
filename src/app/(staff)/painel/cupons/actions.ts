"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { falha, falhaValidacao, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirPermissao } from "@/lib/auth/dal";
import { centavosDeTexto } from "@/lib/dinheiro";
import { createClient } from "@/lib/supabase/server";
import { dadosDoFormulario, id } from "@/lib/validacao";

// Data do formulário (AAAA-MM-DD) no fuso do restaurante -> início ou fim do dia em ISO.
function diaNoFuso(dia: string, fuso: string, fimDoDia: boolean): string {
  const [a, m, d] = dia.split("-").map(Number);
  const base = Date.UTC(a, m - 1, d, fimDoDia ? 23 : 0, fimDoDia ? 59 : 0, fimDoDia ? 59 : 0);
  // Diferença do fuso naquele dia (ex.: Porto Velho = -4h).
  const local = new Date(new Date(base).toLocaleString("en-US", { timeZone: fuso }));
  const utc = new Date(new Date(base).toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(base - (local.getTime() - utc.getTime())).toISOString();
}

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default("");

const cupomSchema = z
  .object({
    codigo: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,20}$/, "Use de 3 a 20 letras ou números, sem espaço."),
    tipo: z.enum(["percentual", "valor", "frete"]),
    valor: z.string().default(""),
    pedido_minimo: z.string().default(""),
    inicio: dia,
    fim: dia,
    limite_usos: z.string().default(""),
    um_por_cliente: z.preprocess((v) => v === "on", z.boolean()),
  })
  .superRefine((d, ctx) => {
    if (d.tipo === "percentual") {
      const n = Number(d.valor);
      if (!Number.isInteger(n) || n < 1 || n > 100) ctx.addIssue({ code: "custom", path: ["valor"], message: "De 1% a 100%." });
    }
    if (d.tipo === "valor" && !(centavosDeTexto(d.valor) ?? 0)) {
      ctx.addIssue({ code: "custom", path: ["valor"], message: "Informe o valor do desconto." });
    }
    if (d.limite_usos && !(Number.isInteger(Number(d.limite_usos)) && Number(d.limite_usos) > 0)) {
      ctx.addIssue({ code: "custom", path: ["limite_usos"], message: "Número inteiro maior que zero." });
    }
    if (d.inicio && d.fim && d.fim < d.inicio) ctx.addIssue({ code: "custom", path: ["fim"], message: "Termina antes de começar." });
  });

export async function criarCupom(_estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "cupons");
  const dados = cupomSchema.safeParse(dadosDoFormulario(formData));
  if (!dados.success) return falhaValidacao(dados.error, formData);
  const d = dados.data;
  const fuso = acesso.restaurante.fusoHorario;

  const supabase = await createClient();
  const { error } = await supabase.from("cupons").insert({
    restaurante_id: acesso.restaurante.id,
    codigo: d.codigo,
    tipo: d.tipo,
    valor: d.tipo === "percentual" ? Number(d.valor) : d.tipo === "valor" ? (centavosDeTexto(d.valor) ?? 0) : 0,
    pedido_minimo: centavosDeTexto(d.pedido_minimo || "0") ?? 0,
    inicio: d.inicio ? diaNoFuso(d.inicio, fuso, false) : null,
    fim: d.fim ? diaNoFuso(d.fim, fuso, true) : null,
    limite_usos: d.limite_usos ? Number(d.limite_usos) : null,
    um_por_cliente: d.um_por_cliente,
  });
  if (error) {
    return falha(error.code === "23505" ? "Já existe um cupom com esse código." : mensagemErroBanco(error), undefined, formData);
  }
  refresh();
  return sucesso(`Cupom ${d.codigo} criado.`);
}

export async function alternarCupom(cupomId: string, ativo: boolean): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "cupons");
  if (!id.safeParse(cupomId).success) return falha("Cupom inválido.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("cupons")
    .update({ ativo: ativo === true })
    .eq("id", cupomId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));
  refresh();
  return sucesso(ativo ? "Cupom ativado." : "Cupom desativado.");
}
