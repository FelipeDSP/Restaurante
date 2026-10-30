"use client";

import { useActionState } from "react";

import { BotaoEnviar, Campo, ErroCampo, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { UploadImagem } from "@/components/staff/upload-imagem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { salvarPerfil, trocarEmail, trocarSenha } from "@/lib/auth/perfil-actions";
import { formatarTelefone } from "@/lib/telefone";
import { AntiRobo } from "@/components/anti-robo";

type Props = {
  usuarioId: string;
  nome: string;
  telefone: string | null;
  foto: string | null;
  email: string | null;
  funcao: string;
};

// Cada pessoa da equipe cuida dos próprios dados; função e permissões continuam com o dono.
export function MeuPerfil({ usuarioId, nome, telefone, foto, email, funcao }: Props) {
  const [estadoPerfil, acaoPerfil] = useActionState(salvarPerfil, undefined);
  const [estadoEmail, acaoEmail] = useActionState(trocarEmail, undefined);
  const [estadoSenha, acaoSenha] = useActionState(trocarSenha, undefined);
  useAvisoResultado(estadoPerfil);
  useAvisoResultado(estadoEmail);
  useAvisoResultado(estadoSenha);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Meu perfil</CardTitle>
          <p className="text-sm text-muted-foreground">{funcao}</p>
        </CardHeader>
        <CardContent>
          <form key={estadoPerfil?.chave} action={acaoPerfil} className="flex flex-col gap-4">
            <UploadImagem
              bucket="rest-avatares"
              pasta={usuarioId}
              name="foto_url"
              valorInicial={estadoPerfil?.valores?.foto_url ?? foto}
              rotulo="Foto"
              ladoMaximo={400}
            />
            <Campo rotulo="Nome" htmlFor="perfil-nome">
              <Input id="perfil-nome" name="nome" defaultValue={valorCampo(estadoPerfil, "nome", nome)} maxLength={80} required className="h-11" />
              <ErroCampo estado={estadoPerfil} campo="nome" />
            </Campo>
            <Campo rotulo="Celular (WhatsApp)" htmlFor="perfil-telefone">
              <Input
                id="perfil-telefone"
                name="telefone"
                inputMode="tel"
                placeholder="(69) 99999-9999"
                defaultValue={valorCampo(estadoPerfil, "telefone", telefone ? formatarTelefone(telefone) : "")}
                maxLength={20}
                className="h-11"
              />
              <ErroCampo estado={estadoPerfil} campo="telefone" />
            </Campo>
            <BotaoEnviar className="h-11 self-start">Salvar perfil</BotaoEnviar>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>E-mail de acesso</CardTitle>
        </CardHeader>
        <CardContent>
          <form key={estadoEmail?.chave} action={acaoEmail} className="flex flex-col gap-4">
            <Campo rotulo="E-mail" htmlFor="perfil-email" dica="O e-mail novo só vale depois de abrir o link que chega nele.">
              <Input
                id="perfil-email"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={valorCampo(estadoEmail, "email", email)}
                required
                className="h-11"
              />
              <ErroCampo estado={estadoEmail} campo="email" />
            </Campo>
            <BotaoEnviar className="h-11 self-start">Trocar e-mail</BotaoEnviar>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Senha</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Senha nunca volta do servidor: o formulário sempre recomeça vazio. */}
          <form key={estadoSenha?.chave} action={acaoSenha} className="flex flex-col gap-4">
            <Campo rotulo="Senha atual" htmlFor="perfil-atual">
              <Input id="perfil-atual" name="atual" type="password" autoComplete="current-password" required className="h-11" />
              <ErroCampo estado={estadoSenha} campo="atual" />
            </Campo>
            <Campo rotulo="Senha nova" htmlFor="perfil-senha" dica="Pelo menos 8 caracteres.">
              <Input id="perfil-senha" name="senha" type="password" autoComplete="new-password" minLength={8} required className="h-11" />
              <ErroCampo estado={estadoSenha} campo="senha" />
            </Campo>
            <Campo rotulo="Repita a senha nova" htmlFor="perfil-confirmacao">
              <Input id="perfil-confirmacao" name="confirmacao" type="password" autoComplete="new-password" required className="h-11" />
              <ErroCampo estado={estadoSenha} campo="confirmacao" />
            </Campo>
            <AntiRobo rodada={estadoSenha} />
            <BotaoEnviar className="h-11 self-start">Trocar senha</BotaoEnviar>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
