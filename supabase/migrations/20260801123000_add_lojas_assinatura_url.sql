alter table public.lojas
add column if not exists assinatura_url text;

comment on column public.lojas.assinatura_url is 'Imagem da assinatura/caneta da loja (URL ou base64) usada em recibos e PDFs de compra';
