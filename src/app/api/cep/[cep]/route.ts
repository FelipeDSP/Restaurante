import { consumirLimite, ipDoCliente } from "@/lib/limite-taxa";

// Endereço pelo CEP para o checkout do delivery (taxa fixa). Consulta o ViaCEP (gratuito, sem chave)
// pelo servidor: o navegador do cliente não fala com serviço de fora e a resposta fica em cache.
export type EnderecoCep = { cep: string; rua: string; bairro: string; cidade: string; uf: string };

const cache = new Map<string, { em: number; dados: EnderecoCep | null }>();
const UM_DIA_MS = 24 * 60 * 60 * 1000;

const json = (dados: unknown, status = 200) =>
  Response.json(dados, { status, headers: { "Cache-Control": status === 200 ? "public, max-age=86400" : "no-store" } });

export async function GET(_request: Request, ctx: RouteContext<"/api/cep/[cep]">) {
  const cep = (await ctx.params).cep.replace(/\D/g, "");
  if (cep.length !== 8) return json({ erro: "CEP com 8 números." }, 400);

  const guardado = cache.get(cep);
  if (guardado && Date.now() - guardado.em < UM_DIA_MS) {
    return guardado.dados ? json(guardado.dados) : json({ erro: "CEP não encontrado." }, 404);
  }

  const ip = await ipDoCliente();
  if (ip && !consumirLimite(`cep:${ip}`, 40, 10 * 60_000)) return json({ erro: "Muitas consultas. Aguarde um pouco." }, 429);

  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(4000) });
    if (!resposta.ok) return json({ erro: "Não foi possível consultar o CEP." }, 502);
    const v = (await resposta.json()) as { erro?: boolean | string; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
    if (v.erro) {
      cache.set(cep, { em: Date.now(), dados: null });
      return json({ erro: "CEP não encontrado." }, 404);
    }
    const dados: EnderecoCep = {
      cep: `${cep.slice(0, 5)}-${cep.slice(5)}`,
      rua: v.logradouro ?? "",
      bairro: v.bairro ?? "",
      cidade: v.localidade ?? "",
      uf: v.uf ?? "",
    };
    if (cache.size > 5000) cache.clear();
    cache.set(cep, { em: Date.now(), dados });
    return json(dados);
  } catch {
    return json({ erro: "Não foi possível consultar o CEP agora. Preencha o endereço à mão." }, 504);
  }
}
