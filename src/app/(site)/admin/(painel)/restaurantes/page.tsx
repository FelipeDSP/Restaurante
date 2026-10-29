import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

import { planoPorId } from "@/lib/planos";
import { cn } from "@/lib/utils";

import { carregarPainel, dataBR, diasRestantes, type RestauranteResumo } from "../../dados";
import { SeloAssinatura } from "../../selo-assinatura";
import { Titulo, Vazio } from "../ui";
import { NovoRestaurante } from "./novo-restaurante";

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

// Sem caixa há tempo: o restaurante pode estar parado (ou desistindo).
function textoUso(ultimoCaixa: string | null) {
  if (!ultimoCaixa) return { texto: "Nunca abriu o caixa", alerta: true };
  const dias = Math.floor((Date.now() - new Date(ultimoCaixa).getTime()) / 86_400_000);
  if (dias === 0) return { texto: "Caixa hoje", alerta: false };
  return { texto: `Último caixa há ${dias} ${dias === 1 ? "dia" : "dias"}`, alerta: dias > 7 };
}

export default async function RestaurantesPage(props: PageProps<"/admin/restaurantes">) {
  const params = await props.searchParams;
  const filtro = typeof params.filtro === "string" ? params.filtro : "todos";
  const busca = typeof params.q === "string" ? params.q.trim().toLowerCase() : "";
  const { restaurantes } = await carregarPainel();

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
    return q ? `/admin/restaurantes?${q}` : "/admin/restaurantes";
  };

  return (
    <>
      <Titulo titulo="Restaurantes" subtitulo={`${restaurantes.length} cadastrados. Uso dos últimos 30 dias.`}>
        <NovoRestaurante />
      </Titulo>

      <section aria-label="Lista de restaurantes" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
          <form action="/admin/restaurantes" className="flex flex-wrap gap-2">
            {filtro !== "todos" ? <input type="hidden" name="filtro" value={filtro} /> : null}
            <input
              name="q"
              defaultValue={busca}
              placeholder="Buscar por nome, endereço do site, dono ou e-mail"
              className="h-11 min-w-0 flex-1 rounded-xl border border-black/10 bg-[#f6f1ea]/60 px-4 outline-none focus:border-uau-laranja focus:ring-2 focus:ring-uau-laranja/30"
              aria-label="Buscar restaurante"
            />
            <button type="submit" className="min-h-11 rounded-xl bg-uau-marrom px-5 font-bold text-uau-creme hover:opacity-90">
              Buscar
            </button>
          </form>
          <nav aria-label="Filtrar" className="flex flex-wrap gap-1.5">
            {FILTROS.map((f) => (
              <Link
                key={f.id}
                href={link({ filtro: f.id })}
                aria-current={filtro === f.id ? "page" : undefined}
                className={cn(
                  "flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-bold",
                  filtro === f.id ? "bg-uau-marrom text-uau-creme" : "text-uau-marrom-claro hover:bg-uau-marrom/5",
                )}
              >
                {f.rotulo}
                <span className={cn("rounded-md px-1.5 text-xs tabular-nums", filtro === f.id ? "bg-white/15" : "bg-uau-marrom/5")}>
                  {contagem[f.id]}
                </span>
              </Link>
            ))}
          </nav>
        </div>

        {lista.length === 0 ? (
          <Vazio>Nenhum restaurante encontrado.</Vazio>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
            <div className="hidden grid-cols-[2fr_1.5fr_1.1fr_1.3fr_auto] gap-4 border-b border-black/5 bg-[#f6f1ea]/60 px-5 py-3 text-xs font-black tracking-wide text-uau-marrom-claro uppercase md:grid">
              <span>Restaurante</span>
              <span>Dono</span>
              <span>Assinatura</span>
              <span>Uso</span>
              <span className="w-10" />
            </div>
            <ul className="divide-y divide-black/5">
              {lista.map((r) => {
                const uso = textoUso(r.ultimo_caixa);
                return (
                  <li key={r.id} className="flex items-stretch">
                    <Link
                      href={`/admin/restaurantes/${r.id}`}
                      className="grid flex-1 grid-cols-1 gap-2 px-5 py-4 hover:bg-uau-marrom/[0.03] md:grid-cols-[2fr_1.5fr_1.1fr_1.3fr] md:items-center md:gap-4"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-2 font-black">
                          <span className="truncate">{r.nome}</span>
                          {!r.ativo ? <span className="shrink-0 rounded-md bg-zinc-200 px-1.5 text-xs font-bold text-zinc-700">fora do ar</span> : null}
                        </span>
                        <span className="truncate text-xs text-uau-marrom-claro">/{r.slug} · desde {dataBR(r.criado_em)}</span>
                      </span>
                      <span className="flex min-w-0 flex-col text-sm">
                        <span className="truncate">{r.dono_nome ?? "—"}</span>
                        <span className="truncate text-xs text-uau-marrom-claro">{r.dono_email ?? ""}</span>
                      </span>
                      <span className="flex flex-col gap-1">
                        <SeloAssinatura status={r.assinatura_status} testeTerminaEm={r.teste_termina_em} />
                        {r.plano ? <span className="text-xs text-uau-marrom-claro">{planoPorId(r.plano)?.nome ?? r.plano}</span> : null}
                      </span>
                      <span className="flex flex-col text-sm">
                        <span className={cn(uso.alerta && "font-bold text-red-700")}>{uso.texto}</span>
                        <span className="text-xs text-uau-marrom-claro">
                          {r.pedidos_30d} pedidos{r.delivery_30d ? ` (${r.delivery_30d} delivery)` : ""}
                        </span>
                      </span>
                    </Link>
                    <a
                      href={`/${r.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir o site de ${r.nome}`}
                      className="flex w-12 shrink-0 items-center justify-center text-uau-marrom-claro hover:bg-uau-marrom/5"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}
