-- ====================================================================
-- MIGRATION DE DADOS (item 4 do roteiro): condicao nunca é 'vendido'
--
-- status   = ciclo de vida (disponivel | vendido | baixado | manutencao)
-- condicao = estado físico (novo | lacrado | seminovo | usado | danificado)
--
-- Não mexe em schema. NÃO foi aplicada: rode a PRÉVIA abaixo e aplique só
-- depois de conferir os números.
--
-- ESCOPO: aparelhos com status='vendido' E condicao='vendido' (47 em 10/09/2026).
-- A condição física volta do que a venda registrou (itens[].condicaoOriginal ou
-- itens[].condicao). Sem registro, usa 'seminovo', o mesmo palpite que o painel
-- já usa ao devolver um aparelho (condicaoParaDevolucao).
--
-- FORA DE ESCOPO, de propósito:
--  * 160 aparelhos ativo=false + status='disponivel' + condicao='vendido'.
--    Não se sabe se foram vendidos ou baixados: só a conferência física resolve.
--    A migration aborta se algum deles for alterado.
--  * 16 aparelhos status='vendido' sem data_saida continuam sem data_saida
--    (não inventamos data).
--  * A decidir com o dono da loja (não mexidos aqui):
--      - 40 aparelhos ativo=false + status='disponivel' com condição física
--        (fora do estoque sem dizer se foi venda ou baixa);
--      - 2 aparelhos ativo=true + status='vendido' com data_saida (voltaram
--        ao estoque por uma edição antiga que forçava ativo=true).
--
-- PRÉVIA (somente leitura):
--   select count(*) filter (where status='vendido' and condicao='vendido') as alvo,
--          count(*) filter (where ativo=false and coalesce(status,'disponivel')='disponivel'
--                           and condicao='vendido') as legados_ambiguos_intocados
--   from public.aparelhos;
-- ====================================================================

begin;

create temp table _lote_migracao on commit drop as
select gen_random_uuid() as id;

create temp table _ambiguos_antes on commit drop as
select count(*) as n
from public.aparelhos
where ativo = false and coalesce(status, 'disponivel') = 'disponivel' and condicao = 'vendido';

create temp table _condicao_legada on commit drop as
with alvo as (
  select a.id, a.loja_id
  from public.aparelhos a
  where a.status = 'vendido' and a.condicao = 'vendido'
),
itens as (
  select
    (item ->> 'aparelhoId') as aparelho_id,
    v.loja_id,
    lower(trim(coalesce(nullif(item ->> 'condicaoOriginal', ''), nullif(item ->> 'condicao', '')))) as condicao,
    v."dataPagamento" as data_venda
  from public.vendas v
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(v.itens) = 'array' then v.itens else '[]'::jsonb end
  ) as item
  where (item ->> 'aparelhoId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
),
da_venda as (
  select distinct on (aparelho_id) aparelho_id::uuid as aparelho_id, loja_id, condicao
  from itens
  where condicao in ('novo', 'lacrado', 'seminovo', 'usado', 'danificado')
  order by aparelho_id, data_venda desc nulls last
)
select
  alvo.id,
  alvo.loja_id,
  coalesce(da_venda.condicao, 'seminovo') as condicao_nova,
  (da_venda.condicao is not null) as veio_da_venda
from alvo
left join da_venda
  on da_venda.aparelho_id = alvo.id
 and (da_venda.loja_id is null or alvo.loja_id is null or da_venda.loja_id = alvo.loja_id);

-- Trilha: uma linha por aparelho, todas no mesmo lote.
insert into public.movimentacoes_estoque
  (loja_id, aparelho_id, tipo, origem, lote_id, usuario_nome, valor_anterior, valor_novo, observacao)
select
  t.loja_id,
  t.id,
  'edicao',
  'migracao_ciclo_vida',
  (select id from _lote_migracao),
  'migração 20260910 (ciclo de vida)',
  jsonb_build_object('condicao', 'vendido'),
  jsonb_build_object('condicao', t.condicao_nova),
  case
    when t.veio_da_venda then 'Condição física recuperada do item da venda.'
    else 'A venda não registrou a condição: usado o palpite padrão seminovo.'
  end
from _condicao_legada t
where t.loja_id is not null;

update public.aparelhos a
set condicao = t.condicao_nova
from _condicao_legada t
where a.id = t.id
  and a.status = 'vendido'
  and a.condicao = 'vendido';

do $$
declare
  restantes integer;
  ambiguos_depois integer;
  ambiguos_antes integer;
begin
  select count(*) into restantes
  from public.aparelhos
  where status = 'vendido' and condicao = 'vendido';
  if restantes > 0 then
    raise exception 'Ainda há % aparelho(s) com status=vendido e condicao=vendido.', restantes;
  end if;

  select n into ambiguos_antes from _ambiguos_antes;
  select count(*) into ambiguos_depois
  from public.aparelhos
  where ativo = false and coalesce(status, 'disponivel') = 'disponivel' and condicao = 'vendido';
  if ambiguos_depois <> ambiguos_antes then
    raise exception 'Os legados ambíguos mudaram (% -> %). Nada foi aplicado.', ambiguos_antes, ambiguos_depois;
  end if;
end $$;

commit;
