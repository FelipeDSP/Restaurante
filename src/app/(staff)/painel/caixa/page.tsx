import type { Metadata } from "next";
import Link from "next/link";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { AvisoImpressao } from "@/components/staff/aviso-impressao";
import { Painel } from "@/components/staff/graficos";
import { exigirPermissao } from "@/lib/auth/dal";
import { formatarBRL } from "@/lib/dinheiro";
import { contarImpressoesComErro } from "@/lib/impressao/avisos";
import { dataHoraLocal, diaLocal, horaLocal } from "@/lib/tempo";

import {
  ESPERA_TELA_DE_DINHEIRO,
  carregarPendencias,
  carregarResumo,
  carregarSessaoAberta,
  dinheiroEsperado,
  listarSessoesFechadas,
} from "@/modulos/caixa/dados";
import { AbrirCaixa, AcoesDoCaixa } from "./formularios";
import { ResumoSessao } from "./resumo-sessao";

export const metadata: Metadata = { title: "Caixa" };

export default async function CaixaPage() {
  const acesso = await exigirPermissao("painel", "caixa_operar");
  const fuso = acesso.restaurante.fusoHorario;
  const [aberta, anteriores, impressoesComErro] = await Promise.all([
    carregarSessaoAberta(acesso.restaurante.id),
    listarSessoesFechadas(acesso.restaurante.id),
    contarImpressoesComErro(acesso.restaurante.id),
  ]);
  const [resumo, pendencias] = aberta
    ? await Promise.all([carregarResumo(acesso.restaurante.id, aberta.id), carregarPendencias(acesso.restaurante.id, aberta.id)])
    : [null, null];

  return (
    <main className="flex flex-col gap-5 p-4 md:p-6">
      {/* Idem Início: o resumo varre a sessão inteira a cada render. */}
      <AtualizarEmTempoReal restauranteId={acesso.restaurante.id} tabelas={["comandas", "pagamentos", "pedidos"]} espera={ESPERA_TELA_DE_DINHEIRO} />
      <AvisoImpressao quantos={impressoesComErro} podeReimprimir />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Caixa</h1>
          {aberta ? (
            <p className="text-muted-foreground">
              Aberto em {dataHoraLocal(aberta.abertaEm, fuso)} por {aberta.abertaPor ?? "—"}
            </p>
          ) : (
            <p className="text-muted-foreground">Fechado. Sem caixa aberto não dá para abrir mesa nem receber pedido pelo site.</p>
          )}
        </div>
      </div>

      {aberta && resumo ? (
        <>
          {/* As ações vêm antes dos números: é o que a pessoa veio fazer. Cada uma abre o
              formulário no lugar, em vez de os dois ficarem abertos o tempo todo. */}
          <AcoesDoCaixa
            sessaoId={aberta.id}
            esperado={dinheiroEsperado(resumo)}
            pendencias={pendencias ?? { comandas: [], deliveries: [], faltaReceber: 0 }}
            dono={acesso.papel === "dono"}
          />
          <ResumoSessao resumo={resumo} fusoHorario={fuso} pendencias={pendencias ?? undefined} />
        </>
      ) : (
        <AbrirCaixa />
      )}

      <Painel titulo="Noites anteriores">
        {anteriores.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma noite fechada ainda.</p>
        ) : (
          <ul className="divide-y">
            {anteriores.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/painel/caixa/${s.id}`}
                  prefetch={false}
                  className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-muted/50"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{diaLocal(s.abertaEm, fuso)}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {horaLocal(s.abertaEm, fuso)} às {s.fechadaEm ? horaLocal(s.fechadaEm, fuso) : "—"} · {s.abertaPor ?? "—"}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {s.valorContado !== null ? `${formatarBRL(s.valorContado)} na gaveta` : "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Painel>
    </main>
  );
}
