import "server-only";

import { TELEFONE_CONTATO, linkWhatsapp } from "@/lib/contato";

// Moldura dos e-mails da plataforma (mesmo visual dos modelos do Supabase em supabase/templates/):
// cabeçalho marrom com o logo, faixa laranja, rodapé com o WhatsApp do suporte.
const LOGO = "https://uau.estudyou.com/marca/uau-foods-branca.png";
const FONTE = "Arial,Helvetica,sans-serif";

export function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function paragrafo(html: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#5a4034">${html}</p>`;
}

export function aviso(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-left:4px solid #f59600;background:#fffdf8"><tr><td style="padding:12px 14px;font-size:13px;line-height:1.6;color:#5a4034">${html}</td></tr></table>`;
}

export function codigoEmDestaque(codigo: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px"><tr><td style="background:#fff8ef;border:2px dashed #f59600;border-radius:12px;padding:14px 26px;font-size:32px;font-weight:bold;letter-spacing:8px;color:#2b1a12">${escaparHtml(codigo)}</td></tr></table>`;
}

export function emailUau({ titulo, previa, corpo }: { titulo: string; previa: string; corpo: string }): string {
  const ajuda = linkWhatsapp("Olá! Preciso de ajuda com o uau foods.");
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaparHtml(titulo)}</title></head>
<body style="margin:0;padding:0;background:#fff8ef">
<div style="display:none;max-height:0;overflow:hidden">${escaparHtml(previa)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff8ef;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #ead9c6;font-family:${FONTE};color:#2b1a12">
<tr><td style="background:#2b1a12;padding:22px 28px"><img src="${LOGO}" alt="uau foods" width="132" style="display:block;width:132px;height:auto;border:0"></td></tr>
<tr><td style="height:5px;background:#f59600;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:30px 28px 8px">
<h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;color:#2b1a12">${escaparHtml(titulo)}</h1>
${corpo}
</td></tr>
<tr><td style="padding:8px 28px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ead9c6"><tr><td style="padding-top:18px;font-size:13px;line-height:1.6;color:#5a4034">
Precisa de ajuda? <a href="${ajuda}" style="color:#b86f00;font-weight:bold;text-decoration:none">Fale com a gente no WhatsApp</a> &middot; ${TELEFONE_CONTATO}
</td></tr></table></td></tr>
</table>
<p style="margin:16px 0 0;font-family:${FONTE};font-size:12px;line-height:1.6;color:#8a7466">uau foods &middot; sistema para espetinhos, hamburguerias e restaurantes<br>Este é um e-mail automático, não precisa responder.</p>
</td></tr></table>
</body>
</html>`;
}
