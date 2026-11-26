import Link from "next/link";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirPermissao } from "@/lib/auth/dal";
import { type Permissao, PERMISSOES_INICIO } from "@/lib/auth/papeis";
import { formatarBRL } from "@/lib/dinheiro";
import { dataHoraLocal } from "@/lib/tempo";

import { ESPERA_TELA_DE_DINHEIRO, carregarResumo, carregarSessaoAberta } from "./caixa/dados";
import { carregarPendencias } from "./pendencias";
import { PrecisaDeVoce } from "./precisa-de-voce";
import { PrimeirosPassos } from "./primeiros-passos";
import { UltimasNoites } from "./ultimas-noites";

// Nomes das formas de pagamento, como aparecem no resumo do caixa.
const NOME_FORMA: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  credito: "Crédito",
  debito: "Débito",
  outro: "Outro",
};

async function StatusCaixa({ restauranteId, fuso, permissoes }: { restauranteId: string; fuso: string; permissoes: Permissao[] }) {
  const sessao = await carregarSessaoAberta(restauranteId);
  const resumo = sessao ? await carregarResumo(restauranteId, sessao.id) : null;

  if (!sessao || !resumo) {
    return (
      <Card className="border-amber-300 bg-amber-50">
        <CardHeader>
          <CardTitle>Caixa fechado</CardTitle>
        </CardHeader>
        {permissoes.includes("caixa_operar") ? (
          <CardContent>
            <Button className="h-11" nativeButton={false} render={<Link href="/painel/caixa" />}>
              Abrir caixa
            </Button>
          </CardContent>
        ) : null}
      </Card>
    );
  }

  const contas =
    resumo.comandas.fechadas + resumo.pedidos_por_origem.filter((p) => p.origem !== "mesa").reduce((soma, p) => soma + p.quantidade, 0);
  const ticket = contas ? Math.round(resumo.total_vendido / contas) : 0;
  const formas = resumo.por_forma.filter((f) => f.valor > 0);
  const maiorForma = Math.max(...formas.map((f) => f.valor), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Caixa aberto</CardTitle>
        <CardDescription>
          Desde {dataHoraLocal(sessao.abertaEm, fuso)} · {sessao.abertaPor ?? "—"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Três colunas não cabem em 390 px: os valores encostavam um no outro e "Comandas
            abertas" quebrava em duas linhas com o número solto embaixo. */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-sm text-muted-foreground">Recebido</dt>
            <dd className="truncate text-lg font-bold tabular-nums sm:text-xl">{formatarBRL(resumo.total_recebido)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-sm text-muted-foreground">Vendido</dt>
            <dd className="truncate text-lg font-bold tabular-nums sm:text-xl">{formatarBRL(resumo.total_vendido)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-sm text-muted-foreground">Comandas abertas</dt>
            <dd className="text-lg font-bold tabular-nums sm:text-xl">{resumo.comandas.abertas}</dd>
          </div>
          {/* Contas e ticket médio não existiam em lugar nenhum, e são o que o dono pergunta
              primeiro. A definição de "conta" é a mesma de Últimas noites e dos relatórios:
              comanda fechada + pedido que não é de mesa (um pedido de mesa é só um lançamento). */}
          <div className="min-w-0">
            <dt className="text-sm text-muted-foreground">Contas</dt>
            <dd className="text-lg font-bold tabular-nums sm:text-xl">{contas}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-sm text-muted-foreground">Ticket médio</dt>
            <dd className="truncate text-lg font-bold tabular-nums sm:text-xl">{formatarBRL(ticket)}</dd>
          </div>
        </dl>

        {formas.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">Como pagaram</h3>
            <dl className="flex flex-col gap-1.5">
              {formas.map((f) => (
                <div key={f.forma} className="flex items-center gap-3 text-sm">
                  <dt className="w-20 shrink-0">{NOME_FORMA[f.forma] ?? f.forma}</dt>
                  <dd className="flex min-w-0 flex-1 items-center gap-2">
                    {/* Trilho de largura fixa: sem ele a barra media a largura do cartão e, num
                        monitor, qualquer forma acima de uns 30% já batia no teto e todas saíam
                        do mesmo tamanho — o gráfico mentia. */}
                    <span className="h-2 w-32 shrink-0 overflow-hidden rounded-full bg-muted sm:w-48" aria-hidden>
                      <span className="block h-full rounded-full bg-[var(--cor-primaria)]" style={{ width: `${(f.valor / maiorForma) * 100}%` }} />
                    </span>
                    <span className="shrink-0 tabular-nums">{formatarBRL(f.valor)}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {resumo.itens_mais_vendidos.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">Mais vendidos hoje</h3>
            <ol className="flex flex-col gap-1 text-sm">
              {resumo.itens_mais_vendidos.slice(0, 3).map((i, n) => (
                <li key={i.nome} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {n + 1}. {i.nome}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{i.quantidade}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {permissoes.includes("comandas_painel") || permissoes.includes("garcom_app") ? (
            <Button className="h-11" nativeButton={false} render={<Link href="/painel/comandas" />}>
              Ver mesas
            </Button>
          ) : null}
          {permissoes.includes("caixa_operar") ? (
            <Button variant="outline" className="h-11" nativeButton={false} render={<Link href="/painel/caixa" />}>
              Resumo e fechamento
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function PainelPage() {
  // Quem só atende mesas não tem Início: vai direto para as Mesas.
  const acesso = await exigirPermissao("painel", ...PERMISSOES_INICIO);
  const [pendencias, sessao] = await Promise.all([
    carregarPendencias(acesso.restaurante.id, acesso.permissoes),
    carregarSessaoAberta(acesso.restaurante.id),
  ]);

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      {/* O resumo da sessão é caro de refazer (uma varredura da noite inteira) e um total não
          precisa mudar no mesmo segundo: os eventos são juntados numa janela maior. */}
      <AtualizarEmTempoReal restauranteId={acesso.restaurante.id} tabelas={["comandas", "pagamentos"]} espera={ESPERA_TELA_DE_DINHEIRO} />
      <h1 className="text-2xl font-semibold">Olá, {acesso.nome}</h1>
      {acesso.papel === "dono" ? <PrimeirosPassos acesso={acesso} /> : null}
      {/* Primeiro o que espera alguém, depois os números: a tela é aberta dezenas de vezes por
          noite, e na maioria delas a pergunta é "falta alguma coisa?", não "quanto vendi?". */}
      <PrecisaDeVoce pendencias={pendencias} permissoes={acesso.permissoes} caixaAberto={Boolean(sessao)} />
      <StatusCaixa restauranteId={acesso.restaurante.id} fuso={acesso.restaurante.fusoHorario} permissoes={acesso.permissoes} />
      {acesso.permissoes.includes("relatorios") ? <UltimasNoites restauranteId={acesso.restaurante.id} fuso={acesso.restaurante.fusoHorario} /> : null}
    </main>
  );
}
