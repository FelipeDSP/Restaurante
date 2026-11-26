"use client";

import { useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ResultadoAcao } from "@/lib/acoes";
import { cn } from "@/lib/utils";

export function BotaoEnviar({
  children,
  pendente = "Salvando...",
  className,
  variant,
  size,
}: {
  children: React.ReactNode;
  pendente?: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={className} variant={variant} size={size}>
      {pending ? pendente : children}
    </Button>
  );
}

export function ErroCampo({ estado, campo }: { estado: ResultadoAcao; campo: string }) {
  const mensagem = estado?.erros?.[campo];
  if (!mensagem) return null;
  return (
    <p id={`erro-${campo}`} className="text-sm text-destructive">
      {mensagem}
    </p>
  );
}

// Valor inicial de um campo: o que foi enviado (se a ação falhou) ou o valor salvo.
export function valorCampo(estado: ResultadoAcao, campo: string, padrao: string | number | null | undefined): string {
  return estado?.valores?.[campo] ?? (padrao === null || padrao === undefined ? "" : String(padrao));
}

// Idem para checkbox: depois de uma falha, marcado = veio "on" no envio.
export function marcadoCampo(estado: ResultadoAcao, campo: string, padrao: boolean): boolean {
  return estado?.valores ? estado.valores[campo] === "on" : padrao;
}

// Depois de uma falha de validação, marca os campos com problema e leva a pessoa até o primeiro.
// Antes, "Confira os campos destacados" era uma promessa que o formulário não cumpria: nada ficava
// destacado, e num formulário longo (o do restaurante tem 25 campos) a pessoa rolava a tela
// procurando. Pior ainda quando o campo é escondido, como a URL da logo e a da capa: aí não havia
// nem mensagem — por isso esta função também devolve se achou alguém para destacar.
function destacarCampos(erros: Record<string, string>): boolean {
  if (typeof document === "undefined") return false;

  const alvos: Element[] = [];
  for (const campo of Object.keys(erros)) {
    const nome = CSS.escape(campo);
    const controle = document.querySelector(`[name="${nome}"]`);
    if (controle) {
      controle.setAttribute("aria-invalid", "true");
      // O vermelho sai assim que a pessoa mexe no campo: deixá-lo aceso enquanto ela digita a
      // correção faz parecer que o conserto não valeu. Na próxima tentativa o servidor decide de novo.
      controle.addEventListener("input", () => controle.removeAttribute("aria-invalid"), { once: true });
    }
    // Campo escondido (a URL de uma imagem, por exemplo) não recebe foco nem aparece na tela:
    // o alvo passa a ser a mensagem de erro, que fica ao lado do controle de verdade.
    const visivel =
      controle instanceof HTMLElement &&
      !(controle instanceof HTMLInputElement && controle.type === "hidden") &&
      controle.offsetParent !== null;
    const alvo = visivel ? controle : document.getElementById(`erro-${campo}`);
    if (alvo) alvos.push(alvo);
  }
  if (alvos.length === 0) return false;

  // O primeiro na ordem da tela, não na ordem em que o Zod reclamou.
  const primeiro = alvos.reduce((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? b : a));
  const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // `center` e não `start`: o topo da tela é fixo e cobriria o campo.
  primeiro.scrollIntoView({ block: "center", behavior: suave ? "smooth" : "auto" });
  if (primeiro instanceof HTMLElement && typeof primeiro.focus === "function") {
    primeiro.focus({ preventScroll: true });
  }
  return true;
}

// Mostra um aviso a cada novo resultado de Server Action e, quando falhou, leva ao campo errado.
export function useAvisoResultado(estado: ResultadoAcao) {
  useEffect(() => {
    if (!estado) return;
    if (estado.ok) {
      if (estado.mensagem) toast.success(estado.mensagem);
      return;
    }

    const erros = estado.erros ?? {};
    const quantos = Object.keys(erros).length;
    const destacou = quantos > 0 && destacarCampos(erros);
    // Com um problema só, ou quando não há nada destacado na tela (campo escondido), o aviso diz
    // qual é o problema. "Confira os campos destacados" só quando há mesmo campos destacados.
    const mensagem = quantos === 1 || (quantos > 0 && !destacou) ? Object.values(erros)[0] : estado.mensagem;
    if (mensagem) toast.error(mensagem);
  }, [estado]);
}

export function Campo({
  rotulo,
  htmlFor,
  children,
  className,
  dica,
}: {
  rotulo: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
  dica?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {rotulo}
      </label>
      {children}
      {dica ? <p className="text-xs text-muted-foreground">{dica}</p> : null}
    </div>
  );
}

// <select> nativo: melhor no celular e acessível por padrão.
export function Selecao({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}
