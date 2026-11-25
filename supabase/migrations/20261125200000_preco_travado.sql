-- Preço da assinatura travado no momento em que o dono escolheu o plano.
--
-- Até aqui o preço vinha sempre da tabela de planos do código (`src/lib/planos.ts`). Com a
-- promoção de Black Friday, dois restaurantes no mesmo plano podem pagar valores diferentes:
-- quem assinou durante a promoção tem o valor promocional garantido, e quem assinar depois paga
-- o cheio. O valor cobrado é o que está no Asaas, então ele precisa estar aqui também — senão a
-- receita do painel da plataforma (hoje `assinaturas ativas × preço do plano`) passa a mentir.
--
-- `preco_garantido_ate` é a promessa feita ao cliente ("o valor não sobe antes desta data").
-- Nada no sistema aumenta o preço sozinho quando essa data passa: subir mensalidade de alguém
-- é decisão de gente, com aviso, não efeito colateral de uma migração.

alter table public.assinaturas
  add column preco_centavos integer check (preco_centavos is null or preco_centavos >= 0),
  add column preco_garantido_ate timestamptz,
  add column promocao text;

comment on column public.assinaturas.preco_centavos is
  'Mensalidade que está valendo, gravada quando o plano foi escolhido. Null = usar o preço do plano.';
comment on column public.assinaturas.preco_garantido_ate is
  'Até quando o valor acima não sobe (promessa feita na contratação). Não dispara nada ao vencer.';
comment on column public.assinaturas.promocao is
  'Qual promoção deu esse preço, para o suporte e o financeiro saberem de onde veio.';

-- Ninguém escreve pela API: quem grava é o servidor com a chave secreta, depois de falar com o
-- Asaas (os grants por coluna de `assinaturas` já valem para as colunas novas; a tabela só tem
-- política de leitura para o dono).
