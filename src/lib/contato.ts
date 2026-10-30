// Contato da plataforma (vendas e suporte): landing, "Ajuda pelo WhatsApp" no painel e avisos de erro.
// No painel não aparece a marca da plataforma (white label): só "Ajuda".
export const WHATSAPP_CONTATO = "5569999565508";
export const TELEFONE_CONTATO = "(69) 99956-5508";

export function linkWhatsapp(mensagem: string): string {
  return `https://wa.me/${WHATSAPP_CONTATO}?text=${encodeURIComponent(mensagem)}`;
}

// Já vai com o restaurante na mensagem, para o suporte saber de quem é sem perguntar.
export function linkAjuda(restaurante: { nome: string; slug: string }): string {
  return linkWhatsapp(`Olá! Preciso de ajuda com o sistema do restaurante ${restaurante.nome} (${restaurante.slug}).`);
}
