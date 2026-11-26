import "server-only";

import webpush, { WebPushError } from "web-push";

import { type Evento, lerAvisos } from "@/lib/avisos";
import { chavePublicaAvisos, enderecoDeAvisoValido } from "@/lib/avisos-push";
import { urlIcone } from "@/lib/icone";
import { createAdminClient } from "@/lib/supabase/admin";

// Avisos no celular de quem trabalha, com o app fechado. Mesma encanação dos avisos do cliente
// (chaves VAPID, service worker, `web-push`), mas a inscrição é da pessoa e não de um pedido, e
// antes de enviar se confere a escolha dela em Meu perfil > Notificações.
//
// Nada aqui lança erro: aviso que falha não pode derrubar a ação que o disparou — chamar o garçom
// precisa funcionar mesmo que o celular dele esteja sem internet.

function chaves() {
  const publica = process.env.VAPID_PUBLIC_KEY?.trim();
  const privada = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publica || !privada) return null;
  return { publica, privada, assunto: process.env.VAPID_ASSUNTO?.trim() || "mailto:avisos@localhost" };
}

export { chavePublicaAvisos, enderecoDeAvisoValido };

type Aviso = { titulo: string; corpo: string; url: string; tag: string };

// A pessoa quer este aviso? A escolha fica nos dados da conta dela, os mesmos que o app lê.
// Na dúvida (conta sem nada gravado), `lerAvisos` devolve o padrão, que é avisar.
async function querReceber(userId: string, evento: Evento): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const { data } = await admin.auth.admin.getUserById(userId);
  return lerAvisos(data.user?.user_metadata?.avisos)[evento].ligado;
}

// Manda o aviso para todos os aparelhos em que o membro ligou as notificações.
export async function avisarMembro(membroId: string, evento: Evento, aviso: Aviso): Promise<void> {
  const c = chaves();
  const admin = createAdminClient();
  if (!c || !admin) return;
  try {
    const { data: membro } = await admin
      .from("membros")
      .select("id, user_id, ativo, restaurante:restaurantes!inner(id, nome, logo_url, cor_primaria)")
      .eq("id", membroId)
      .maybeSingle();
    if (!membro?.ativo) return;
    if (!(await querReceber(membro.user_id, evento))) return;

    const { data: inscricoes } = await admin.from("membros_avisos").select("id, endpoint, p256dh, auth").eq("membro_id", membroId);
    if (!inscricoes?.length) return;

    const r = membro.restaurante;
    const carga = JSON.stringify({
      titulo: aviso.titulo,
      corpo: aviso.corpo,
      url: aviso.url,
      icone: urlIcone({ id: r.id, nome: r.nome, corPrimaria: r.cor_primaria, logoUrl: r.logo_url }, 192),
      tag: aviso.tag,
    });

    const recusadas: string[] = [];
    await Promise.all(
      inscricoes.map(async (i) => {
        try {
          await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, carga, {
            vapidDetails: { subject: c.assunto, publicKey: c.publica, privateKey: c.privada },
            // Vale pouco tempo: um chamado que chega meia hora depois só atrapalha.
            TTL: 10 * 60,
            urgency: "high",
            timeout: 5000,
          });
        } catch (erro) {
          // 404/410: o navegador cancelou a inscrição; não adianta tentar de novo.
          if (erro instanceof WebPushError && (erro.statusCode === 404 || erro.statusCode === 410)) recusadas.push(i.id);
          else console.error("[avisos-equipe] falha ao enviar", erro instanceof WebPushError ? `${erro.statusCode} ${erro.body}` : erro);
        }
      }),
    );
    if (recusadas.length) await admin.from("membros_avisos").delete().in("id", recusadas);
  } catch (erro) {
    console.error("[avisos-equipe]", erro);
  }
}

// Primeiro aviso, logo ao ligar: mostra na hora se o celular recebe, em vez de a pessoa descobrir
// só quando o chamado não chegar.
export async function avisarInscricaoNovaEquipe(membroId: string, inscricao: { endpoint: string; p256dh: string; auth: string }): Promise<boolean> {
  const c = chaves();
  const admin = createAdminClient();
  if (!c || !admin) return false;
  const { data: membro } = await admin
    .from("membros")
    .select("id, restaurante:restaurantes!inner(id, nome, logo_url, cor_primaria)")
    .eq("id", membroId)
    .maybeSingle();
  if (!membro) return false;
  const r = membro.restaurante;
  try {
    await webpush.sendNotification(
      { endpoint: inscricao.endpoint, keys: { p256dh: inscricao.p256dh, auth: inscricao.auth } },
      JSON.stringify({
        titulo: r.nome,
        corpo: "Avisos ligados neste aparelho. É assim que você vai ser chamado.",
        url: "/painel",
        icone: urlIcone({ id: r.id, nome: r.nome, corPrimaria: r.cor_primaria, logoUrl: r.logo_url }, 192),
        tag: `equipe-${membroId}`,
      }),
      { vapidDetails: { subject: c.assunto, publicKey: c.publica, privateKey: c.privada }, TTL: 60, urgency: "high", timeout: 5000 },
    );
    return true;
  } catch (erro) {
    console.error("[avisos-equipe] teste falhou", erro instanceof WebPushError ? `${erro.statusCode} ${erro.body}` : erro);
    return false;
  }
}
