import "server-only";

import webpush, { WebPushError } from "web-push";

import { urlIcone } from "@/lib/icone";
import { createAdminClient } from "@/lib/supabase/admin";

// Avisos no celular do cliente do delivery (Web Push). As chaves VAPID ficam só no servidor e são
// lidas em tempo de execução (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_ASSUNTO): sem elas o botão
// de avisos não aparece e nada é enviado.
function chaves() {
  const publica = process.env.VAPID_PUBLIC_KEY?.trim();
  const privada = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publica || !privada) return null;
  return { publica, privada, assunto: process.env.VAPID_ASSUNTO?.trim() || "mailto:avisos@localhost" };
}

// Chave pública para o navegador assinar os avisos (null = avisos desligados neste servidor).
export function chavePublicaAvisos(): string | null {
  return chaves()?.publica ?? null;
}

// O servidor faz um POST para o endereço que o navegador mandou: só aceitar os serviços de push
// dos navegadores (Chrome/Android, Firefox, Safari/iPhone, Edge), nunca um endereço qualquer.
const SERVICOS_PUSH = [/^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/];

export function enderecoDeAvisoValido(endereco: string): boolean {
  try {
    const url = new URL(endereco);
    return url.protocol === "https:" && !url.port && SERVICOS_PUSH.some((r) => r.test(url.hostname));
  } catch {
    return false;
  }
}

const MENSAGEM: Record<string, string> = {
  em_preparo: "Pedido aceito! Já está sendo preparado.",
  saiu_entrega: "Seu pedido saiu para entrega.",
  entregue: "Pedido entregue. Bom apetite!",
  cancelado: "Seu pedido foi cancelado.",
};
const FINAL = new Set(["entregue", "cancelado"]);

type Inscricao = { endpoint: string; p256dh: string; auth: string };

// Primeiro aviso, logo ao ligar: mostra na hora se o celular recebe (o cliente não espera o aceite
// para descobrir que as notificações estão bloqueadas). Devolve se o serviço de push aceitou.
export async function avisarInscricaoNova(pedidoId: string, inscricao: Inscricao): Promise<boolean> {
  const c = chaves();
  const admin = createAdminClient();
  if (!c || !admin) return false;
  const { data: pedido } = await admin
    .from("pedidos")
    .select("id, restaurante:restaurantes!inner(id, slug, nome, logo_url, cor_primaria)")
    .eq("id", pedidoId)
    .maybeSingle();
  if (!pedido) return false;
  const r = pedido.restaurante;
  const carga = JSON.stringify({
    titulo: r.nome,
    corpo: "Avisos ligados. Vamos te avisar aqui quando o pedido mudar.",
    url: `/${r.slug}/pedido/${pedido.id}`,
    icone: urlIcone({ id: r.id, nome: r.nome, corPrimaria: r.cor_primaria, logoUrl: r.logo_url }, 192),
    tag: pedido.id,
  });
  try {
    const resultado = await webpush.sendNotification({ endpoint: inscricao.endpoint, keys: { p256dh: inscricao.p256dh, auth: inscricao.auth } }, carga, {
      vapidDetails: { subject: c.assunto, publicKey: c.publica, privateKey: c.privada },
      TTL: 60 * 60,
      urgency: "high",
      timeout: 5000,
    });
    console.info("[avisos-push] teste enviado", resultado.statusCode);
    return true;
  } catch (erro) {
    console.error("[avisos-push] teste falhou", erro instanceof WebPushError ? `${erro.statusCode} ${erro.body}` : erro);
    return false;
  }
}

// Avisa os aparelhos inscritos no pedido sobre o status atual (lido do banco, não de quem chamou).
// Nunca lança erro: aviso que falha não pode atrapalhar o atendimento.
export async function avisarCliente(pedidoId: string): Promise<void> {
  const c = chaves();
  const admin = createAdminClient();
  if (!c || !admin) return;
  try {
    const { data: pedido } = await admin
      .from("pedidos")
      .select("id, status, origem, restaurante:restaurantes!inner(id, slug, nome, logo_url, cor_primaria)")
      .eq("id", pedidoId)
      .maybeSingle();
    if (!pedido || pedido.origem !== "delivery") return;
    const corpo = MENSAGEM[pedido.status];
    if (!corpo) return;

    const { data: inscricoes } = await admin
      .from("pedidos_avisos")
      .select("id, endpoint, p256dh, auth")
      .eq("restaurante_id", pedido.restaurante.id)
      .eq("pedido_id", pedido.id);
    if (!inscricoes?.length) return;

    const r = pedido.restaurante;
    const carga = JSON.stringify({
      titulo: r.nome,
      corpo,
      url: `/${r.slug}/pedido/${pedido.id}`,
      icone: urlIcone({ id: r.id, nome: r.nome, corPrimaria: r.cor_primaria, logoUrl: r.logo_url }, 192),
      tag: pedido.id,
    });

    const recusadas: string[] = [];
    await Promise.all(
      inscricoes.map(async (i) => {
        try {
          const resultado = await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, carga, {
            vapidDetails: { subject: c.assunto, publicKey: c.publica, privateKey: c.privada },
            TTL: 60 * 60,
            urgency: "high",
            timeout: 5000,
          });
          console.info("[avisos-push] enviado", pedido.status, resultado.statusCode);
        } catch (erro) {
          // 404/410: o navegador cancelou a inscrição; não adianta tentar de novo.
          if (erro instanceof WebPushError && (erro.statusCode === 404 || erro.statusCode === 410)) recusadas.push(i.id);
          else console.error("[avisos-push] falha ao enviar", erro instanceof WebPushError ? `${erro.statusCode} ${erro.body}` : erro);
        }
      }),
    );

    // As inscrições ficam até 24 h depois do fim: a conversa com o restaurante continua aberta e a
    // resposta também avisa. Depois disso, a limpeza tira (limparInscricoesVencidas).
    if (recusadas.length) await admin.from("pedidos_avisos").delete().in("id", recusadas);
    if (FINAL.has(pedido.status)) await limparInscricoesVencidas(r.id);
  } catch (erro) {
    console.error("[avisos-push]", erro);
  }
}

// Inscrições de pedidos que terminaram há mais de 24 h (a conversa já fechou): não servem mais.
async function limparInscricoesVencidas(restauranteId: string) {
  const admin = createAdminClient();
  if (!admin) return;
  const limite = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: velhos } = await admin
    .from("pedidos")
    .select("id")
    .eq("restaurante_id", restauranteId)
    .lt("finalizado_em", limite)
    .limit(500);
  const ids = (velhos ?? []).map((p) => p.id);
  if (ids.length) await admin.from("pedidos_avisos").delete().eq("restaurante_id", restauranteId).in("pedido_id", ids);
}

// O restaurante respondeu na conversa do pedido: avisa o celular do cliente (se ele ligou os avisos).
export async function avisarMensagem(pedidoId: string, texto: string): Promise<void> {
  const c = chaves();
  const admin = createAdminClient();
  if (!c || !admin) return;
  try {
    const { data: pedido } = await admin
      .from("pedidos")
      .select("id, origem, restaurante:restaurantes!inner(id, slug, nome, logo_url, cor_primaria)")
      .eq("id", pedidoId)
      .maybeSingle();
    if (!pedido || pedido.origem !== "delivery") return;
    const { data: inscricoes } = await admin
      .from("pedidos_avisos")
      .select("id, endpoint, p256dh, auth")
      .eq("restaurante_id", pedido.restaurante.id)
      .eq("pedido_id", pedido.id);
    if (!inscricoes?.length) return;

    const r = pedido.restaurante;
    const resumo = texto.length > 120 ? `${texto.slice(0, 117)}...` : texto;
    const carga = JSON.stringify({
      titulo: `${r.nome} respondeu`,
      corpo: resumo,
      url: `/${r.slug}/pedido/${pedido.id}#conversa`,
      icone: urlIcone({ id: r.id, nome: r.nome, corPrimaria: r.cor_primaria, logoUrl: r.logo_url }, 192),
      tag: `${pedido.id}-conversa`,
    });
    const recusadas: string[] = [];
    await Promise.all(
      inscricoes.map(async (i) => {
        try {
          await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, carga, {
            vapidDetails: { subject: c.assunto, publicKey: c.publica, privateKey: c.privada },
            TTL: 60 * 60,
            urgency: "high",
            timeout: 5000,
          });
        } catch (erro) {
          if (erro instanceof WebPushError && (erro.statusCode === 404 || erro.statusCode === 410)) recusadas.push(i.id);
          else console.error("[avisos-push] mensagem não enviada", erro instanceof WebPushError ? `${erro.statusCode} ${erro.body}` : erro);
        }
      }),
    );
    if (recusadas.length) await admin.from("pedidos_avisos").delete().in("id", recusadas);
  } catch (erro) {
    console.error("[avisos-push]", erro);
  }
}
