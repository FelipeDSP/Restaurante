"use client";

import { ImageUp, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { novoId } from "@/lib/id";
import { redimensionarImagem } from "@/lib/imagem";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Props = {
  bucket: "rest-logos" | "rest-produtos" | "rest-avatares" | "rest-capas";
  // Pasta no bucket: id do restaurante (logo, produtos) ou do usuário (foto da pessoa).
  pasta: string;
  // Nome do campo do formulário que recebe a URL pública.
  name: string;
  valorInicial: string | null;
  rotulo: string;
  ladoMaximo?: number;
  // Erro que veio do servidor para este campo (a URL fica num input escondido, então sem isto a
  // recusa ficava invisível: o aviso dizia "confira os campos destacados" e não havia nenhum).
  erroServidor?: string;
};

// Envia direto para o Storage com a sessão do usuário (a policy só permite o dono, na pasta do
// restaurante, ou a própria pessoa, na pasta dela) e guarda a URL num campo escondido do formulário.
export function UploadImagem({ bucket, pasta, name, valorInicial, rotulo, ladoMaximo = 1200, erroServidor }: Props) {
  const id = useId();
  const [url, setUrl] = useState(valorInicial ?? "");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aoEscolher(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) {
      setErro("Escolha um arquivo de imagem.");
      return;
    }

    setEnviando(true);
    setErro(null);
    try {
      const imagem = await redimensionarImagem(arquivo, ladoMaximo);
      const caminho = `${pasta}/${novoId()}.webp`;
      const supabase = createClient();
      const { error } = await supabase.storage
        .from(bucket)
        .upload(caminho, imagem, { contentType: "image/webp", cacheControl: "31536000" });
      if (error) throw error;
      setUrl(supabase.storage.from(bucket).getPublicUrl(caminho).data.publicUrl);
    } catch {
      setErro("Não foi possível enviar a imagem. Tente outra.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{rotulo}</span>
      <input type="hidden" name={name} value={url} />
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center overflow-hidden border bg-muted",
            erroServidor && "border-destructive ring-3 ring-destructive/20",
            // A capa é larga: a prévia tem a mesma proporção 3:1 do site, senão a pessoa escolhe
            // uma foto achando que cabe inteira e no site ela sai cortada em cima e embaixo.
            bucket === "rest-capas" ? "h-20 w-60 rounded-lg" : "size-24",
            bucket === "rest-avatares" ? "rounded-full" : "rounded-lg",
          )}
        >
          {url ? (
            // Logo (muitas vezes horizontal) aparece inteiro; foto de produto e capa preenchem o quadro.
            // eslint-disable-next-line @next/next/no-img-element -- imagem do Storage
            <img src={url} alt="" className={cn("size-full", bucket === "rest-logos" ? "object-contain p-1" : "object-cover")} />
          ) : (
            <ImageUp className="size-8 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="flex flex-col gap-2">
          {/* O input vem antes para o rótulo mostrar o anel de foco do teclado (peer). */}
          <input
            id={id}
            type="file"
            accept="image/*"
            className="peer sr-only"
            onChange={aoEscolher}
            disabled={enviando}
          />
          <label
            htmlFor={id}
            className="inline-flex h-11 cursor-pointer items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50"
          >
            {enviando ? "Enviando..." : url ? "Trocar imagem" : "Escolher imagem"}
          </label>
          {bucket === "rest-logos" ? <span className="text-xs text-muted-foreground">PNG com fundo transparente fica melhor.</span> : null}
          {url ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setUrl("")}>
              <Trash2 />
              Remover
            </Button>
          ) : null}
        </div>
      </div>
      {erro || erroServidor ? (
        <p id={`erro-${name}`} className="text-sm text-destructive">
          {erro ?? erroServidor}
        </p>
      ) : null}
    </div>
  );
}
