"use client";

import { ImageUp, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { redimensionarImagem } from "@/lib/imagem";
import { createClient } from "@/lib/supabase/client";

type Props = {
  bucket: "rest-logos" | "rest-produtos";
  restauranteId: string;
  // Nome do campo do formulário que recebe a URL pública.
  name: string;
  valorInicial: string | null;
  rotulo: string;
  ladoMaximo?: number;
};

// Envia direto para o Storage com a sessão do usuário (a policy só permite o dono,
// na pasta do próprio restaurante) e guarda a URL num campo escondido do formulário.
export function UploadImagem({ bucket, restauranteId, name, valorInicial, rotulo, ladoMaximo = 1200 }: Props) {
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
      const caminho = `${restauranteId}/${crypto.randomUUID()}.webp`;
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
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagem do Storage
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            <ImageUp className="size-8 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label
            htmlFor={id}
            className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted"
          >
            {enviando ? "Enviando..." : url ? "Trocar imagem" : "Escolher imagem"}
          </label>
          <input
            id={id}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={aoEscolher}
            disabled={enviando}
          />
          {url ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setUrl("")}>
              <Trash2 />
              Remover
            </Button>
          ) : null}
        </div>
      </div>
      {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
    </div>
  );
}
