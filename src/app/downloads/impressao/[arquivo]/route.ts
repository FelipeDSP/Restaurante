import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";

// Instalador e atualizações do app de impressão (gerados em agente/ com `npm run dist`).
// Ficam numa pasta do servidor, fora da imagem: publicar versão nova é só copiar os arquivos.
//   /downloads/impressao/instalador    -> a versão mais recente (link do painel)
//   /downloads/impressao/latest.yml    -> consultado pelo app para se atualizar
//   /downloads/impressao/<arquivo>.exe -> instalador de uma versão
const pasta = () => join(process.env.PASTA_DOWNLOADS ?? join(process.cwd(), "downloads"), "impressao");

const NOME_VALIDO = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TIPOS: Record<string, string> = {
  yml: "text/yaml; charset=utf-8",
  exe: "application/octet-stream",
  blockmap: "application/octet-stream",
};

const naoEncontrado = () => new Response("Arquivo não encontrado.", { status: 404 });

export async function GET(request: Request, ctx: RouteContext<"/downloads/impressao/[arquivo]">) {
  const { arquivo } = await ctx.params;

  if (arquivo === "instalador") {
    const latest = await readFile(join(pasta(), "latest.yml"), "utf8").catch(() => null);
    const caminho = latest?.match(/^path:\s*(.+)$/m)?.[1]?.trim();
    if (!caminho || !NOME_VALIDO.test(caminho)) return naoEncontrado();
    return Response.redirect(new URL(`/downloads/impressao/${caminho}`, request.url), 302);
  }

  const extensao = arquivo.split(".").pop() ?? "";
  if (!NOME_VALIDO.test(arquivo) || arquivo.includes("..") || !TIPOS[extensao]) return naoEncontrado();

  const completo = join(pasta(), arquivo);
  const info = await stat(completo).catch(() => null);
  if (!info?.isFile()) return naoEncontrado();

  const corpo = Readable.toWeb(createReadStream(completo)) as ReadableStream<Uint8Array>;
  return new Response(corpo, {
    headers: {
      "Content-Type": TIPOS[extensao],
      "Content-Length": String(info.size),
      // latest.yml muda a cada versão; os instaladores têm a versão no nome.
      "Cache-Control": extensao === "yml" ? "no-cache" : "public, max-age=86400",
      ...(extensao === "exe" ? { "Content-Disposition": `attachment; filename="${arquivo}"` } : {}),
    },
  });
}
