import type { PostgrestError } from "@supabase/supabase-js";
import type { z } from "zod";

// Retorno padrão das Server Actions de formulário.
// `valores` devolve o que foi digitado quando há erro: o React 19 reseta o formulário
// após a ação, e os campos usam esses valores como defaultValue para não perder o que foi digitado.
export type ResultadoAcao = {
  ok: boolean;
  mensagem?: string;
  erros?: Record<string, string>;
  valores?: Record<string, string>;
  // Muda a cada resultado: usada como key do formulário para remontar os campos
  // (com `valores` após falha, ou com os dados salvos após sucesso).
  chave?: number;
} | undefined;

export function sucesso(mensagem?: string): ResultadoAcao {
  return { ok: true, mensagem, chave: Date.now() };
}

// Campos de texto enviados, exceto senhas (nunca voltam para o navegador).
function valoresDoFormulario(formData?: FormData): Record<string, string> | undefined {
  if (!formData) return undefined;
  const valores: Record<string, string> = {};
  for (const [campo, valor] of formData.entries()) {
    if (typeof valor === "string" && !campo.includes("senha") && !campo.startsWith("$ACTION")) {
      valores[campo] = valor;
    }
  }
  return valores;
}

export function falha(mensagem: string, erros?: Record<string, string>, formData?: FormData): ResultadoAcao {
  return { ok: false, mensagem, erros, valores: valoresDoFormulario(formData), chave: Date.now() };
}

// Primeiro erro de cada campo do Zod.
export function falhaValidacao(erro: z.ZodError, formData?: FormData): ResultadoAcao {
  const erros: Record<string, string> = {};
  for (const issue of erro.issues) {
    const campo = issue.path.join(".") || "_";
    erros[campo] ??= issue.message;
  }
  return falha("Confira os campos destacados.", erros, formData);
}

// Mensagem amigável para erros do Postgres/PostgREST.
export function mensagemErroBanco(erro: PostgrestError): string {
  switch (erro.code) {
    case "23505":
      return "Já existe um registro com esses dados.";
    case "23503":
      return "Este registro está em uso e não pode ser removido.";
    case "23514":
      return "Algum valor está fora do permitido.";
    case "42501":
      return "Você não tem permissão para esta ação.";
    case "P0001":
      // Marcadores para o app reagir (ex.: "(precos_mudaram)") não aparecem para a pessoa.
      return erro.message.replace(/\s*\((precos_mudaram|indisponivel)\)$/, "");
    default:
      return "Não foi possível salvar. Tente novamente.";
  }
}
