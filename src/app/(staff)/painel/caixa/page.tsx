import type { Metadata } from "next";
import Link from "next/link";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirAcesso } from "@/lib/auth/dal";
import { formatarBRL } from "@/lib/dinheiro";
import { dataHoraLocal } from "@/lib/tempo";

import { carregarPendencias, carregarResumo, carregarSessaoAberta, dinheiroEsperado, listarSessoesFechadas } from "./dados";
import { AbrirCaixa, FecharCaixa, MovimentoCaixa } from "./formularios";
import { ResumoSessao } from "./resumo-sessao";

export const metadata: Metadata = { title: "Caixa" };

export default async function CaixaPage() {
  const acesso = await exigirAcesso("painel");
  const fuso = acesso.restaurante.fusoHorario;
  const [aberta, anteriores] = await Promise.all([
    carregarSessaoAberta(acesso.restaurante.id),
    listarSessoesFechadas(acesso.restaurante.id),
  ]);
  const [resumo, pendencias] = aberta
    ? await Promise.all([carregarResumo(acesso.restaurante.id, aberta.id), carregarPendencias(acesso.restaurante.id, aberta.id)])
    : [null, null];

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <AtualizarEmTempoReal restauranteId={acesso.restaurante.id} tabelas={["comandas", "pagamentos", "pedidos"]} />
      <div>
        <h1 className="text-2xl font-semibold">Caixa</h1>
        {aberta ? (
          <p className="text-muted-foreground">
            Aberto em {dataHoraLocal(aberta.abertaEm, fuso)} por {aberta.abertaPor ?? "—"}
          </p>
        ) : (
          <p className="text-muted-foreground">O caixa está fechado. Sem caixa aberto não é possível abrir comandas nem receber pedidos.</p>
        )}
      </div>

      {aberta && resumo ? (
        <>
          <ResumoSessao resumo={resumo} fusoHorario={fuso} />
          <MovimentoCaixa />
          <FecharCaixa sessaoId={aberta.id} esperado={dinheiroEsperado(resumo)} pendencias={pendencias ?? { comandas: [], deliveries: [] }} />
        </>
      ) : (
        <AbrirCaixa />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sessões anteriores</CardTitle>
        </CardHeader>
        <CardContent>
          {anteriores.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma sessão fechada ainda.</p>
          ) : (
            <ul className="divide-y">
              {anteriores.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/painel/caixa/${s.id}`}
                    className="flex items-center justify-between gap-3 rounded-md py-3 hover:bg-muted/50"
                  >
                    <span className="flex flex-col">
                      <span className="font-medium">
                        {dataHoraLocal(s.abertaEm, fuso)} → {s.fechadaEm ? dataHoraLocal(s.fechadaEm, fuso) : "—"}
                      </span>
                      <span className="text-xs text-muted-foreground">Aberto por {s.abertaPor ?? "—"}</span>
                    </span>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      Contado {s.valorContado !== null ? formatarBRL(s.valorContado) : "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
