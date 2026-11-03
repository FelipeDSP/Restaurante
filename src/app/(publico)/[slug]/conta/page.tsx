import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { loginClienteDisponivel } from "@/lib/mensagens";
import { dataHoraLocal } from "@/lib/tempo";

import { obterConta, pedidosDaConta, usuarioCliente } from "../conta";
import { buscarRestaurantePorSlug, carregarBairros } from "../dados";
import { ConviteEntrar } from "./convite-entrar";
import { TelaConta } from "./tela-conta";

export const metadata: Metadata = { title: "Minha conta", robots: { index: false } };

// Conta do cliente do delivery: dados, endereços salvos, últimos pedidos, sair e excluir.
export default async function MinhaContaPage(props: PageProps<"/[slug]/conta">) {
  const { slug } = await props.params;
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) notFound();

  const conta = await obterConta(restaurante.id);
  if (!conta) {
    // Entrou pelo telefone mas ainda não se cadastrou aqui: termina o cadastro.
    if (await usuarioCliente()) redirect(`/${restaurante.slug}/entrar?voltar=/${restaurante.slug}/conta`);
    if (!loginClienteDisponivel()) redirect(`/${restaurante.slug}/pedidos`);
    return (
      <main className="flex flex-col gap-4 p-4">
        <h1 className="text-2xl font-bold">Minha conta</h1>
        <ConviteEntrar slug={restaurante.slug} voltar={`/${restaurante.slug}/conta`} />
      </main>
    );
  }

  const [bairros, pedidos] = await Promise.all([carregarBairros(restaurante.id), pedidosDaConta(restaurante.id)]);
  const nomeBairro = new Map(bairros.map((b) => [b.id, b.nome]));

  return (
    <TelaConta
      slug={restaurante.slug}
      conta={{
        nome: conta.nome,
        telefone: conta.telefone,
        enderecos: conta.enderecos.map((e) => ({
          ...e,
          bairro: e.bairro ?? (e.bairroId ? (nomeBairro.get(e.bairroId) ?? null) : null),
        })),
      }}
      pedidos={pedidos.slice(0, 3).map((p) => ({
        id: p.id,
        numero: p.numero,
        status: p.status,
        total: p.total,
        quando: dataHoraLocal(p.criado_em, restaurante.fusoHorario),
      }))}
    />
  );
}
