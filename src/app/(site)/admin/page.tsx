import type { Metadata } from "next";
import { ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";

import { Input } from "@/components/ui/input";
import { formatarBRL } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";

import { carregarPainel, dataBR, diasRestantes, type RestauranteResumo } from "./dados";
import { SeloAssinatura } from "./selo-assinatura";

export const metadata: Metadata = { title: { absolute: "Restaurantes · Admin · uau foods" } };

const FILTROS = [
  { id: "todos", rotulo: "Todos" },
  { id: "teste", rotulo: "Em teste" },
  { id: "vencendo", rotulo: "Teste vencendo" },
  { id: "vencido", rotulo: "Teste vencido" },
  { id: "pagantes", rotulo: "Pagantes" },
  { id: "cortesia", rotulo: "Cortesia" },
  { id: "problema", rotulo: "Atrasados/cancelados" },
  { id: "inativos", rotulo: "Desativados" },
] as const;

function passa(r: RestauranteResumo, filtro: string): boolean {
  const dias = r.assinatura_status === "teste" ? diasRestantes(r.teste_termina_em) : null;
  switch (filtro) {
    case "teste":
      return dias !== null && dias > 0;
    case "vencendo":
      return dias !== null && dias > 0 && dias <= 3;
    case "vencido":
      return dias !== null && dias <= 0;
    case "pagantes":
      return r.assinatura_status === "ativa";
    case "cortesia":
      return r.assinatura_status === "cortesia";
    case "problema":
      return r.assinatura_status === "atrasada" || r.assinatura_status === "cancelada";
    case "inativos":
      return !r.ativo;
    default:
      return true;
  }
}

function Numero({ rotulo, valor, detalhe, destaque }: { rotulo: string; valor: string; detalhe?: string; destaque?: boolean }) {
  return (
    <div className={cn("rounded-2xl border border-uau-borda bg-uau-papel p-4", destaque && "border-uau-laranja")}>
      <p className="text-sm text-uau-marrom-claro">{rotulo}</p>
      <p className="text-2xl font-black tabular-nums">{valor}</p>
      {detalhe ? <p className="text-xs text-uau-marrom-claro">{detalhe}</p> : null}
    </div>
  );
}

// Sem caixa há tempo: o restaurante pode estar parado (ou desistindo).
function textoUso(ultimoCaixa: string | null) {
  if (!ultimoCaixa) return { texto: "Nunca abriu o caixa", alerta: true };
  const dias = Math.floor((Date.now() - new Date(ultimoCaixa).getTime()) / 86_400_000);
  if (dias === 0) return { texto: "Caixa hoje", alerta: false };
  return { texto: `Último caixa há ${dias} ${dias === 1 ? "dia" : "dias"}`, alerta: dias > 7 };
}

export default async function AdminPage(props: PageProps<"/admin">) {
  const params = await props.searchParams;
  const filtro = typeof params.filtro === "string" ? params.filtro : "todos";
  const busca = typeof params.q === "string" ? params.q.trim().toLowerCase() : "";
  const { totais: t, restaurantes } = await carregarPainel();

  const lista = restaurantes.filter(
    (r) =>
      passa(r, filtro) &&
      (!busca || [r.nome, r.slug, r.dono_nome ?? "", r.dono_email ?? ""].some((v) => v.toLowerCase().includes(busca))),
  );
  const contagem = Object.fromEntries(FILTROS.map((f) => [f.id, restaurantes.filter((r) => passa(r, f.id)).length]));
  const link = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(busca ? { q: busca } : {}), ...(filtro !== "todos" ? { filtro } : {}), ...extra });
    if (p.get("filtro") === "todos") p.delete("filtro");
    const q = p.toString();
    return q ? `/admin?${q}` : "/admin";
  };

  return (
    <>
      <div>
        <h1 className="text-3xl font-black">Restaurantes</h1>
        <p className="text-uau-marrom-claro">Visão da plataforma. Números de uso dos últimos 30 dias.</p>
      </div>

      <section aria-label="Números da plataforma" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Numero rotulo="Restaurantes" valor={String(t.restaurantes)} detalhe={`${t.ativos} com o site no ar · ${t.cadastros_30d} novos em 30 dias`} />
        <Numero rotulo="Pagantes" valor={String(t.pagantes)} detalhe={`${t.cortesia} cortesia · ${t.atrasados} atrasados/cancelados`} destaque />
        <Numero
          rotulo="Em teste"
          valor={String(t.em_teste)}
          detalhe={`${t.teste_vencendo} vencendo em 3 dias · ${t.teste_vencido} vencidos`}
        />
        <Numero rotulo="Usando" valor={String(t.usaram_7d)} detalhe="Abriram o caixa nos últimos 7 dias" />
        <Numero rotulo="Pedidos" valor={String(t.pedidos_30d)} detalhe="Todos os restaurantes, 30 dias" />
        <Numero rotulo="Vendido nos restaurantes" valor={formatarBRL(t.vendido_30d)} detalhe="Soma dos pedidos, 30 dias" />
      </section>

      <section aria-label="Lista de restaurantes" className="flex flex-col gap-3">
        <form action="/admin" className="flex flex-wrap gap-2">
          {filtro !== "todos" ? <input type="hidden" name="filtro" value={filtro} /> : null}
          <Input
            name="q"
            defaultValue={busca}
            placeholder="Buscar por nome, endereço do site, dono ou e-mail"
            className="h-11 max-w-md flex-1 bg-uau-papel"
            aria-label="Buscar restaurante"
          />
          <button type="submit" className="min-h-11 rounded-full bg-uau-marrom px-5 font-bold text-uau-creme">
            Buscar
          </button>
        </form>
        <nav aria-label="Filtrar" className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <Link
              key={f.id}
              href={link({ filtro: f.id })}
              aria-current={filtro === f.id ? "page" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold",
                filtro === f.id ? "border-uau-marrom bg-uau-marrom text-uau-creme" : "border-uau-borda bg-uau-papel hover:bg-uau-marrom/5",
              )}
            >
              {f.rotulo}
              <span className="tabular-nums opacity-70">{contagem[f.id]}</span>
            </Link>
          ))}
        </nav>

        {lista.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-uau-borda p-8 text-center text-uau-marrom-claro">Nenhum restaurante encontrado.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lista.map((r) => {
              const uso = textoUso(r.ultimo_caixa);
              return (
                <li key={r.id} className="flex items-stretch rounded-2xl border border-uau-borda bg-uau-papel">
                  <Link
                    href={`/admin/${r.id}`}
                    className="grid flex-1 grid-cols-1 gap-2 p-4 hover:bg-uau-marrom/[0.03] sm:grid-cols-[2fr_1.4fr_1fr_1.2fr_auto] sm:items-center"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-2 font-black">
                        {r.nome}
                        {!r.ativo ? <span className="rounded-full bg-zinc-200 px-2 text-xs font-bold text-zinc-700">desativado</span> : null}
                      </span>
                      <span className="truncate text-xs text-uau-marrom-claro">/{r.slug} · desde {dataBR(r.criado_em)}</span>
                    </span>
                    <span className="flex min-w-0 flex-col text-sm">
                      <span className="truncate">{r.dono_nome ?? "—"}</span>
                      <span className="truncate text-xs text-uau-marrom-claro">{r.dono_email ?? ""}</span>
                    </span>
                    <SeloAssinatura status={r.assinatura_status} testeTerminaEm={r.teste_termina_em} />
                    <span className="flex flex-col text-sm">
                      <span className={cn(uso.alerta && "font-bold text-red-700")}>{uso.texto}</span>
                      <span className="text-xs text-uau-marrom-claro">
                        {r.pedidos_30d} pedidos em 30 dias{r.delivery_30d ? ` (${r.delivery_30d} delivery)` : ""}
                      </span>
                    </span>
                    <ChevronRight className="hidden size-5 text-uau-marrom-claro sm:block" aria-hidden />
                  </Link>
                  <a
                    href={`/${r.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Abrir o site de ${r.nome}`}
                    className="flex w-12 shrink-0 items-center justify-center border-l border-uau-borda text-uau-marrom-claro hover:bg-uau-marrom/5"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
