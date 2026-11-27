import "server-only";

import webpush, { WebPushError } from "web-push";

import { type Evento, PERMISSAO_DO_EVENTO } from "@/lib/avisos";
import { ehPapel, permissoesEfetivas } from "@/lib/auth/papeis";
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

// Manda o aviso para todos os aparelhos em que o membro ligou as notificações.
export async function avisarMembro(membroId: string, evento: Evento, aviso: Aviso): Promise<void> {
  const c = chaves();
  const admin = createAdminClient();
  if (!c || !admin) return;
  try {
    const { data: membro } = await admin
      .from("membros")
      .select("id, ativo, restaurante:restaurantes!inner(id, nome, logo_url, cor_primaria)")
      .eq("id", membroId)
      .maybeSingle();
    if (!membro?.ativo) return;

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

// Avisa todo mundo do restaurante que tem a permissão daquele evento (delivery novo, mensagem de
// cliente, ticket na cozinha): não é de uma pessoa só, é de quem está de plantão naquele posto.
// Quem desligou o aviso em Meu perfil não recebe — `avisarMembro` confere um por um.
export async function avisarEquipe(restauranteId: string, evento: Evento, aviso: Aviso): Promise<void> {
  const admin = createAdminClient();
  if (!admin || !chaves()) return;
  try {
    const { data: membros } = await admin
      .from("membros")
      .select("id, papel, permissoes_extras, permissoes_removidas, funcao:funcoes(permissoes)")
      .eq("restaurante_id", restauranteId)
      .eq("ativo", true);
    const precisa = PERMISSAO_DO_EVENTO[evento];
    const alvos = (membros ?? []).filter(
      (m) => ehPapel(m.papel) && permissoesEfetivas(m.papel, m.funcao?.permissoes, m.permissoes_extras, m.permissoes_removidas).includes(precisa),
    );
    await Promise.all(alvos.map((m) => avisarMembro(m.id, evento, aviso)));
  } catch (erro) {
    console.error("[avisos-equipe]", erro);
  }
}

// Pedido que o cliente mandou pelo QR da mesa. O dono do aviso é o garçom daquela mesa; mesa sem
// garçom (o próprio cliente abriu) avisa quem atende mesas, que é quem pode assumir.
export async function avisarPedidoDaMesa(token: string, numero: number): Promise<void> {
  const admin = createAdminClient();
  if (!admin || !chaves()) return;
  try {
    const { data: mesa } = await admin
      .from("mesas")
      .select("id, numero, restaurante_id, restaurante:restaurantes!inner(nome)")
      .eq("qr_token", token)
      .maybeSingle();
    if (!mesa) return;
    const { data: comanda } = await admin
      .from("comandas")
      .select("id, garcom_id")
      .eq("mesa_id", mesa.id)
      .in("status", ["aberta", "conta_pedida"])
      .maybeSingle();
    const aviso: Aviso = {
      titulo: mesa.restaurante.nome,
      corpo: `Mesa ${mesa.numero} pediu pelo celular (nº ${numero}).`,
      url: comanda ? `/painel/comandas/${mesa.id}` : "/painel/comandas",
      tag: `mesa-${mesa.id}`,
    };
    if (comanda?.garcom_id) await avisarMembro(comanda.garcom_id, "pedido_qr", aviso);
    else await avisarEquipe(mesa.restaurante_id, "pedido_qr", aviso);
  } catch (erro) {
    console.error("[avisos-equipe]", erro);
  }
}

// A cozinha terminou um pedido. Mesa: avisa o garçom dela, que é quem leva o prato. Delivery:
// avisa quem cuida da entrega, que é quem despacha.
export async function avisarPratoPronto(pedidoId: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin || !chaves()) return;
  try {
    const { data: pedido } = await admin
      .from("pedidos")
      .select("id, numero, origem, restaurante_id, comanda:comandas(id, garcom_id, mesa:mesas(id, numero)), restaurante:restaurantes!inner(nome)")
      .eq("id", pedidoId)
      .maybeSingle();
    const comanda = pedido?.comanda;
    if (!pedido) return;
    if (pedido.origem === "mesa" && !comanda?.garcom_id) return;
    if (pedido.origem !== "mesa" && pedido.origem !== "delivery") return;
    // Só quando o pedido inteiro fica pronto. Um aviso por setor viraria três vibrações para o
    // mesmo pedido; o aviso na tela, esse sim, já mostra item por item para quem está com o app
    // aberto — o push é para quem está longe da tela.
    const { count: faltando } = await admin
      .from("tarefas_producao")
      .select("id", { count: "exact", head: true })
      .eq("pedido_id", pedido.id)
      .eq("status", "pendente");
    if ((faltando ?? 0) > 0) return;

    if (pedido.origem === "delivery") {
      await avisarEquipe(pedido.restaurante_id, "delivery_pronto", {
        titulo: pedido.restaurante.nome,
        corpo: `Pedido nº ${pedido.numero} pronto para sair.`,
        url: "/painel/delivery",
        tag: `delivery-pronto-${pedido.id}`,
      });
      return;
    }
    await avisarMembro(comanda!.garcom_id!, "prato_pronto", {
      titulo: pedido.restaurante.nome,
      corpo: `Mesa ${comanda!.mesa?.numero ?? ""}: pedido nº ${pedido.numero} pronto para levar.`,
      url: `/painel/comandas/${comanda!.mesa?.id ?? ""}`,
      tag: `pronto-${pedido.id}`,
    });
  } catch (erro) {
    console.error("[avisos-equipe]", erro);
  }
}

// Eventos de um pedido de delivery que a equipe precisa saber mesmo longe da tela: o cliente
// cancelou antes do aceite e o cliente mandou mensagem. O texto do cliente não vai no aviso —
// a notificação aparece na tela de bloqueio, e mensagem de cliente é conversa dele com a casa.
export async function avisarDelivery(pedidoId: string, evento: "delivery_cancelado" | "mensagem_cliente"): Promise<void> {
  const admin = createAdminClient();
  if (!admin || !chaves()) return;
  try {
    const { data: pedido } = await admin
      .from("pedidos")
      .select("id, numero, restaurante_id, restaurante:restaurantes!inner(nome)")
      .eq("id", pedidoId)
      .maybeSingle();
    if (!pedido) return;
    const corpo =
      evento === "delivery_cancelado"
        ? `O cliente cancelou o pedido nº ${pedido.numero}.`
        : `Mensagem do cliente no pedido nº ${pedido.numero}.`;
    await avisarEquipe(pedido.restaurante_id, evento, {
      titulo: pedido.restaurante.nome,
      corpo,
      url: evento === "mensagem_cliente" ? `/painel/conversas/${pedido.id}` : "/painel/delivery",
      tag: `${evento}-${pedido.id}`,
    });
  } catch (erro) {
    console.error("[avisos-equipe]", erro);
  }
}
