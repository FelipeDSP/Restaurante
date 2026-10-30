# Gera os modelos de e-mail do Supabase Auth em supabase/templates/ (rodar: python scripts/gerar-modelos-email.py).
# Depois de gerar, colar cada um no painel do Supabase (Authentication > Emails > Templates).
import json, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
LOGO = "https://uau.estudyou.com/marca/uau-foods-branca.png"
ZAP = "https://wa.me/5569999565508?text=Ol%C3%A1!%20Preciso%20de%20ajuda%20com%20o%20uau%20foods."
F = "Arial,Helvetica,sans-serif"


def base(titulo, previa, corpo):
    return f"""<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{titulo}</title></head>
<body style="margin:0;padding:0;background:#fff8ef">
<div style="display:none;max-height:0;overflow:hidden">{previa}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff8ef;padding:28px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #ead9c6;font-family:{F};color:#2b1a12">
<tr><td style="background:#2b1a12;padding:22px 28px">
<img src="{LOGO}" alt="uau foods" width="132" style="display:block;width:132px;height:auto;border:0">
</td></tr>
<tr><td style="height:5px;background:#f59600;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:30px 28px 8px">
<h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;color:#2b1a12">{titulo}</h1>
{corpo}
</td></tr>
<tr><td style="padding:8px 28px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ead9c6">
<tr><td style="padding-top:18px;font-size:13px;line-height:1.6;color:#5a4034">
Precisa de ajuda? <a href="{ZAP}" style="color:#b86f00;font-weight:bold;text-decoration:none">Fale com a gente no WhatsApp</a> &middot; (69) 99956-5508
</td></tr>
</table>
</td></tr>
</table>
<p style="margin:16px 0 0;font-family:{F};font-size:12px;line-height:1.6;color:#8a7466">uau foods &middot; sistema para espetinhos, hamburguerias e restaurantes<br>Este é um e-mail automático, não precisa responder.</p>
</td></tr>
</table>
</body>
</html>
"""


def p(texto):
    return f'<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#5a4034">{texto}</p>\n'


def botao(link, rotulo):
    return f"""<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="border-radius:12px;background:#f59600">
<a href="{link}" style="display:inline-block;padding:15px 30px;font-family:{F};font-size:16px;font-weight:bold;color:#2b1a12;text-decoration:none;border-radius:12px">{rotulo}</a>
</td></tr></table>
"""


def caixa(titulo, itens):
    linhas = "".join(
        f'<tr><td valign="top" style="padding:0 10px 8px 0;font-size:14px;color:#f59600;font-weight:bold">{i + 1}.</td>'
        f'<td style="padding:0 0 8px;font-size:14px;line-height:1.55;color:#5a4034">{t}</td></tr>'
        for i, t in enumerate(itens)
    )
    return f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;background:#fff8ef;border-radius:12px">
<tr><td style="padding:16px 18px 8px">
<p style="margin:0 0 10px;font-size:13px;font-weight:bold;letter-spacing:.04em;text-transform:uppercase;color:#b86f00">{titulo}</p>
<table role="presentation" cellpadding="0" cellspacing="0">{linhas}</table>
</td></tr></table>
"""


def aviso(texto):
    return f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-left:4px solid #f59600;background:#fffdf8">
<tr><td style="padding:12px 14px;font-size:13px;line-height:1.6;color:#5a4034">{texto}</td></tr></table>
"""


def link_reserva(link):
    return (
        '<p style="margin:0 0 18px;font-size:12px;line-height:1.6;color:#8a7466">Se o botão não abrir, copie e cole no navegador:<br>'
        f'<a href="{link}" style="color:#b86f00;word-break:break-all">{link}</a></p>\n'
    )


def L(tipo, nxt):
    return "{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&amp;type=" + tipo + "&amp;next=" + nxt


EMAIL = '<strong style="color:#2b1a12">{{ .Email }}</strong>'
modelos = {}

l = L("recovery", "/nova-senha")
modelos["recuperacao"] = ("Redefinir sua senha", base(
    "Vamos criar uma senha nova",
    "Toque no botão para escolher uma senha nova. O link vale por 1 hora.",
    p(f"Recebemos um pedido para trocar a senha da conta {EMAIL}.")
    + p("Toque no botão abaixo e escolha a senha nova. Depois disso você já entra no sistema.")
    + botao(l, "Escolher nova senha")
    + caixa("Para uma senha segura", [
        "Use pelo menos 8 caracteres, misturando letras e números.",
        "Não repita a senha de outros sites ou do seu e-mail.",
        "Não passe a senha para ninguém: cada pessoa da equipe tem a sua.",
    ])
    + aviso("<strong>Não foi você?</strong> Ignore este e-mail: sua senha continua a mesma. O link vale por 1 hora e só funciona uma vez.")
    + link_reserva(l)))

l = L("email", "/comecar")
modelos["confirmacao"] = ("Confirme seu e-mail e comece no uau foods", base(
    "Bem-vindo ao uau foods!",
    "Confirme seu e-mail para montar o seu restaurante. São 14 dias grátis com tudo liberado.",
    p("Que bom ter você aqui. Falta só confirmar que este e-mail é seu para começar.")
    + botao(l, "Confirmar e-mail")
    + caixa("Seus próximos passos", [
        "Crie o seu restaurante: nome, endereço do site e cores.",
        "Monte o cardápio (dá para importar por planilha).",
        "Cadastre mesas, equipe e impressora, e abra o caixa para um teste.",
    ])
    + aviso("São <strong>14 dias grátis com tudo liberado</strong>, sem cartão de crédito. Se você não criou esta conta, ignore este e-mail.")
    + link_reserva(l)))

l = L("email_change", "/painel/perfil")
modelos["troca_email"] = ("Confirme seu novo e-mail", base(
    "Confirme seu novo e-mail",
    "Confirme a troca do e-mail de acesso da sua conta.",
    p("Você pediu para trocar o e-mail de acesso da sua conta:")
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;background:#fff8ef;border-radius:12px">'
      '<tr><td style="padding:14px 18px;font-size:14px;line-height:1.7;color:#5a4034">'
      'De: <strong style="color:#2b1a12">{{ .Email }}</strong><br>Para: <strong style="color:#2b1a12">{{ .NewEmail }}</strong></td></tr></table>\n'
    + botao(l, "Confirmar novo e-mail")
    + aviso("A troca só vale depois de tocar no botão. <strong>Não foi você?</strong> Ignore este e-mail e troque sua senha em Meu perfil.")
    + link_reserva(l)))

l = L("magiclink", "/inicio")
modelos["link_acesso"] = ("Seu link de acesso", base(
    "Seu link de acesso",
    "Toque no botão para entrar. O link vale por 1 hora.",
    p(f"Toque no botão para entrar na sua conta {EMAIL}, sem precisar da senha.")
    + botao(l, "Entrar")
    + aviso("O link vale por 1 hora e só funciona uma vez. <strong>Não foi você que pediu?</strong> Ignore este e-mail.")
    + link_reserva(l)))

l = L("invite", "/nova-senha")
modelos["convite"] = ("Você foi convidado para o uau foods", base(
    "Você foi convidado",
    "Aceite o convite e escolha sua senha.",
    p(f"Você recebeu um convite para acessar o sistema com o e-mail {EMAIL}.")
    + botao(l, "Aceitar convite")
    + caixa("Como funciona", ["Toque em Aceitar convite.", "Escolha a sua senha.", "Pronto: você já entra no painel."])
    + aviso("Se você não esperava este convite, ignore este e-mail.")
    + link_reserva(l)))

modelos["reautenticacao"] = ("Seu código de confirmação", base(
    "Seu código de confirmação",
    "Use o código para confirmar a alteração.",
    p("Use este código para confirmar a alteração que você está fazendo na sua conta:")
    + '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px"><tr>'
      '<td style="background:#fff8ef;border:2px dashed #f59600;border-radius:12px;padding:14px 26px;font-size:32px;font-weight:bold;letter-spacing:8px;color:#2b1a12">{{ .Token }}</td>'
      '</tr></table>\n'
    + aviso("O código vale por poucos minutos. <strong>Não foi você?</strong> Troque sua senha.")))

assuntos = {}
for nome, (assunto, html) in modelos.items():
    open(f"supabase/templates/{nome}.html", "w", encoding="utf-8", newline="\n").write(html)
    assuntos[nome] = assunto
json.dump(assuntos, open("supabase/templates/assuntos.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("ok", list(assuntos))
