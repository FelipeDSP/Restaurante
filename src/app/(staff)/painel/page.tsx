import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { exigirPermissao } from "@/lib/auth/dal";
import { PERMISSOES_INICIO } from "@/lib/auth/papeis";
import { ESPERA_TELA_DE_DINHEIRO } from "@/modulos/caixa/dados";

import { EstoqueResumo } from "./estoque-resumo";
import { carregarNoites, NOITES_VAZIO } from "./noites";
import { carregarPendencias } from "./pendencias";
import { PrecisaDeVoce } from "./precisa-de-voce";
import { PrimeirosPassos } from "./primeiros-passos";
import { Semana } from "./semana";

export default async function PainelPage() {
  // Quem só atende mesas não tem Início: vai direto para as Mesas.
  const acesso = await exigirPermissao("painel", ...PERMISSOES_INICIO);
  const podeRelatorios = acesso.permissoes.includes("relatorios");

  const [pendencias, noites] = await Promise.all([
    carregarPendencias(acesso.restaurante.id, acesso.permissoes),
    // Um resumo por noite é caro: só carrega para quem pode ver faturamento.
    podeRelatorios ? carregarNoites(acesso.restaurante.id, acesso.restaurante.fusoHorario) : Promise.resolve(NOITES_VAZIO),
  ]);

  return (
    <main className="flex flex-col gap-5 p-4 md:p-6">
      {/* As pendências mudam durante o serviço (mesa pede a conta, delivery entra). Os números das
          noites fechadas não mudam, mas refazer a tela inteira é mais simples do que recarregar
          pedaço — e a janela de espera já é larga, porque o resumo varre a noite inteira. */}
      <AtualizarEmTempoReal restauranteId={acesso.restaurante.id} tabelas={["comandas", "pagamentos"]} espera={ESPERA_TELA_DE_DINHEIRO} />
      <h1 className="text-2xl font-semibold">Olá, {acesso.nome}</h1>
      {acesso.papel === "dono" ? <PrimeirosPassos acesso={acesso} /> : null}

      {/* Primeiro o que espera alguém, depois o panorama: a tela é aberta dezenas de vezes por
          noite, e na maioria delas a pergunta é "falta alguma coisa?". */}
      <PrecisaDeVoce pendencias={pendencias} permissoes={acesso.permissoes} fuso={acesso.restaurante.fusoHorario} />
      <EstoqueResumo itens={pendencias.estoque} />
      {podeRelatorios ? <Semana noites={noites} /> : null}
    </main>
  );
}
