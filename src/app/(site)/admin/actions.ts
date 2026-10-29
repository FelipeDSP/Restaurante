"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { falha, falhaValidacao, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { id } from "@/lib/validacao";

import { exigirAdmin } from "./dados";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
// Data do formulário (dia) -> fim do dia em Brasília, para "vence em 20/10" valer o dia 20 inteiro.
const dataOpcional = z
  .string()
  .trim()
  .refine((v) => v === "" || DATA.test(v), "Data inválida.")
  .transform((v) => (v ? `${v}T23:59:59-03:00` : null));

// Os tipos gerados não marcam os parâmetros timestamptz como opcionais, mas a RPC aceita null
// (sem data). O valor vai como null de verdade no JSON.
const semData = (v: string | null) => v as string;

const assinaturaSchema = z.object({
  restauranteId: id,
  status: z.enum(["teste", "ativa", "atrasada", "cancelada", "cortesia"]),
  plano: z.enum(["delivery", "presencial", "avancado", "completo"]),
  testeTerminaEm: dataOpcional,
  periodoTerminaEm: dataOpcional,
});

export async function salvarAssinatura(_estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { supabase } = await exigirAdmin();
  const dados = assinaturaSchema.safeParse(Object.fromEntries(formData));
  if (!dados.success) return falhaValidacao(dados.error, formData);
  const d = dados.data;
  if (d.status === "teste" && !d.testeTerminaEm) {
    return falha("Informe até quando vai o teste.", { testeTerminaEm: "Obrigatório no teste grátis." }, formData);
  }

  const { error } = await supabase.rpc("admin_definir_assinatura", {
    p_restaurante_id: d.restauranteId,
    p_status: d.status,
    p_plano: d.plano,
    p_teste_termina_em: semData(d.testeTerminaEm),
    p_periodo_termina_em: semData(d.periodoTerminaEm),
  });
  if (error) return falha(mensagemErroBanco(error), undefined, formData);
  refresh();
  return sucesso("Assinatura atualizada.");
}

// Atalho: mais N dias de teste a partir de hoje (ou do fim atual, se ainda estiver valendo).
export async function estenderTeste(restauranteId: string, dias: number, plano: string, fimAtual: string | null): Promise<ResultadoAcao> {
  const { supabase } = await exigirAdmin();
  const dados = z
    .object({ restauranteId: id, dias: z.number().int().min(1).max(90), plano: z.enum(["delivery", "presencial", "avancado", "completo"]) })
    .safeParse({ restauranteId, dias, plano });
  if (!dados.success) return falha("Dados inválidos.");
  const base = fimAtual && new Date(fimAtual).getTime() > Date.now() ? new Date(fimAtual) : new Date();
  base.setDate(base.getDate() + dados.data.dias);

  const { error } = await supabase.rpc("admin_definir_assinatura", {
    p_restaurante_id: dados.data.restauranteId,
    p_status: "teste",
    p_plano: dados.data.plano,
    p_teste_termina_em: base.toISOString(),
    p_periodo_termina_em: semData(null),
  });
  if (error) return falha(mensagemErroBanco(error));
  refresh();
  return sucesso(`Teste estendido em ${dados.data.dias} dias.`);
}

export async function definirAtivo(restauranteId: string, ativo: boolean, motivo: string): Promise<ResultadoAcao> {
  const { supabase } = await exigirAdmin();
  const dados = z
    .object({ restauranteId: id, ativo: z.boolean(), motivo: z.string().trim().min(3, "Informe o motivo.").max(300) })
    .safeParse({ restauranteId, ativo, motivo });
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? "Dados inválidos.");

  const { error } = await supabase.rpc("admin_definir_ativo", {
    p_restaurante_id: dados.data.restauranteId,
    p_ativo: dados.data.ativo,
    p_motivo: dados.data.motivo,
  });
  if (error) return falha(mensagemErroBanco(error));
  refresh();
  return sucesso(dados.data.ativo ? "Restaurante reativado: o site voltou ao ar." : "Restaurante desativado: o site saiu do ar.");
}

// Anotação interna sobre o restaurante (só a equipe da plataforma vê).
export async function anotar(restauranteId: string, texto: string): Promise<ResultadoAcao> {
  const { supabase } = await exigirAdmin();
  const dados = z.object({ restauranteId: id, texto: z.string().trim().min(1, "Escreva a anotação.").max(2000) }).safeParse({ restauranteId, texto });
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? "Dados inválidos.");
  const { error } = await supabase.rpc("admin_anotar", { p_restaurante_id: dados.data.restauranteId, p_texto: dados.data.texto });
  if (error) return falha(mensagemErroBanco(error));
  refresh();
  return sucesso("Anotação salva.");
}

export async function adicionarAdmin(_estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { supabase } = await exigirAdmin();
  const dados = z.object({ email: z.email("Informe um e-mail válido.").trim().toLowerCase() }).safeParse({ email: formData.get("email") });
  if (!dados.success) return falhaValidacao(dados.error, formData);
  const { error } = await supabase.rpc("admin_adicionar_admin", { p_email: dados.data.email });
  if (error) return falha(mensagemErroBanco(error), undefined, formData);
  refresh();
  return sucesso(`${dados.data.email} agora é administrador.`);
}

export async function removerAdmin(userId: string): Promise<ResultadoAcao> {
  const { supabase } = await exigirAdmin();
  if (!id.safeParse(userId).success) return falha("Dados inválidos.");
  const { error } = await supabase.rpc("admin_remover_admin", { p_user_id: userId });
  if (error) return falha(mensagemErroBanco(error));
  refresh();
  return sucesso("Acesso de administrador retirado.");
}
