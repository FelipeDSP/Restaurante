// Passe da verificação anti-robô (Cloudflare Turnstile) que o formulário manda no campo "captcha".
// O Supabase Auth confere quando a proteção está ligada no projeto; desligada, ele ignora.
export function passeAntiRobo(formData: FormData): string | undefined {
  const valor = formData.get("captcha");
  return typeof valor === "string" && valor ? valor : undefined;
}

export const MENSAGEM_ANTI_ROBO = "Confirme a verificação anti-robô e tente de novo.";

// Erro do Supabase quando o passe falta, venceu ou já foi usado.
export function falhouAntiRobo(erro: { code?: string; message?: string } | null | undefined): boolean {
  return !!erro && (erro.code === "captcha_failed" || /captcha/i.test(erro.message ?? ""));
}
