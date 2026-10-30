import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

// Envio de e-mail pelo SMTP da plataforma (variáveis só em tempo de execução, no Coolify):
// SMTP_HOST, SMTP_PORT (465 = SSL direto; 587 = STARTTLS), SMTP_USER, SMTP_PASS e SMTP_FROM
// (ex.: "uau foods <nao-responda@estudyou.com>"). Usado no código do super admin.

export type ResultadoEmail = { ok: true } | { ok: false; motivo: string };

export function emailConfigurado(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

let transporte: Transporter | null = null;
function obterTransporte() {
  if (!transporte) {
    const porta = Number(process.env.SMTP_PORT || 465);
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: porta,
      secure: porta === 465,
      // Sem usuário (ex.: servidor de teste local) vai sem login.
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transporte;
}

export async function enviarEmail(email: { para: string; assunto: string; texto: string; html?: string }): Promise<ResultadoEmail> {
  if (!emailConfigurado()) {
    // Desenvolvimento sem SMTP: mostra no terminal do servidor (nunca em produção).
    if (process.env.NODE_ENV !== "production" || process.env.SMTP_CONSOLE === "1") {
      console.info(`[email] para ${email.para}: ${email.assunto}\n${email.texto}`);
      return { ok: true };
    }
    return { ok: false, motivo: "Envio de e-mail não configurado." };
  }
  try {
    await obterTransporte().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email.para,
      subject: email.assunto,
      text: email.texto,
      html: email.html,
    });
    return { ok: true };
  } catch (erro) {
    console.error("[email] falhou:", erro instanceof Error ? erro.message : erro);
    return { ok: false, motivo: "Não foi possível enviar o e-mail." };
  }
}
