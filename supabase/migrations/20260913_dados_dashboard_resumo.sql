-- ====================================================================
-- DASHBOARD COM NÚMEROS CALCULADOS NO BANCO
--
-- O DashboardTab baixava todas as vendas (select *) e somava no navegador:
--   * venda sem data entrava como de hoje;
--   * o dia vinha em UTC (venda das 22h caía no dia seguinte);
--   * cancelada era filtrada em JS, e taxa de cartão não descontava do lucro.
--
-- dashboard_resumo agrega no banco, respeitando a RLS (security invoker):
--   * dia da venda = "dataPagamento" no fuso America/Sao_Paulo. É a data real
--     escolhida no PDV (obterDataHoraVenda em src/lib/utils.ts grava a data com
--     a hora da confirmação; as antigas 12:00/15:00 UTC continuam no mesmo dia).
--     A tabela vendas não tem created_at. Venda sem data NÃO entra;
--   * cancelada ou estornada não entra (src/lib/vendas/situacao.ts);
--   * lucro líquido = lucro bruto - vendas.taxa_cartao;
--   * venda com vários pagamentos divide o valor na proporção de cada um;
--   * capital parado: aparelhos no estoque (mesma regra de estaNoEstoque em
--     src/lib/estoque/ciclo.ts) por modelo/capacidade, com dias desde
--     "dataCadastro" (data real de entrada: nenhuma movimentação é anterior a
--     ela) e alerta acima de 60 dias.
-- Espelho testado das regras: src/lib/dashboard/resumo.ts.
-- ====================================================================

-- Contrato com a trilha do PDV (que grava a taxa): mesmo nome e tipo.
alter table public.vendas
  add column if not exists taxa_cartao numeric(12,2) not null default 0;

create index if not exists idx_vendas_loja_data_pagamento on public.vendas (loja_id, "dataPagamento");

drop function if exists public.dashboard_resumo(date, date);

create or replace function public.dashboard_resumo(p_inicio date, p_fim date, p_loja_id uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with parametros as (
    select
      coalesce(p_loja_id, public.get_user_loja_id()) as loja_id,
      least(p_inicio, p_fim) as inicio,
      greatest(p_inicio, p_fim) as fim,
      (least(p_inicio, p_fim)::timestamp at time zone 'America/Sao_Paulo') as desde,
      ((greatest(p_inicio, p_fim) + 1)::timestamp at time zone 'America/Sao_Paulo') as ate,
      (now() at time zone 'America/Sao_Paulo')::date as hoje,
      60 as limite_dias
  ),
  vendas_validas as (
    select
      v.id,
      (v."dataPagamento" at time zone 'America/Sao_Paulo')::date as dia,
      coalesce(v.valor, 0) as valor,
      coalesce(v.custo, 0) as custo,
      coalesce(v.lucro, coalesce(v.valor, 0) - coalesce(v.custo, 0)) as lucro_bruto,
      coalesce(v.taxa_cartao, 0) as taxas,
      nullif(btrim(v.metodo), '') as metodo,
      v.pagamentos
    from public.vendas v
    cross join parametros p
    where v.loja_id = p.loja_id
      and v."dataPagamento" is not null
      and v."dataPagamento" >= p.desde
      and v."dataPagamento" < p.ate
      and lower(btrim(coalesce(v.status, ''))) not like 'cancel%'
      and lower(btrim(coalesce(v.status, ''))) not like 'estorn%'
  ),
  totais as (
    select
      count(*) as quantidade,
      coalesce(sum(valor), 0) as faturamento,
      coalesce(sum(custo), 0) as custo,
      coalesce(sum(lucro_bruto), 0) as lucro_bruto,
      coalesce(sum(taxas), 0) as taxas
    from vendas_validas
  ),
  por_dia as (
    select
      dia,
      count(*) as quantidade,
      sum(valor) as faturamento,
      sum(custo) as custo,
      sum(lucro_bruto) as lucro_bruto,
      sum(taxas) as taxas
    from vendas_validas
    group by dia
  ),
  pagamentos_da_venda as (
    select
      vv.id,
      vv.valor as valor_venda,
      vv.metodo,
      nullif(btrim(e.value ->> 'metodo'), '') as metodo_pagamento,
      case
        when (e.value ->> 'valor') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then btrim(e.value ->> 'valor')::numeric
        else 0
      end as valor_pagamento
    from vendas_validas vv
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(vv.pagamentos) = 'array' then vv.pagamentos else '[]'::jsonb end
    ) e
  ),
  soma_pagamentos as (
    select id, sum(valor_pagamento) as total
    from pagamentos_da_venda
    where valor_pagamento > 0
    group by id
  ),
  formas as (
    select
      pv.id,
      coalesce(pv.metodo_pagamento, pv.metodo, 'nao_informado') as forma,
      pv.valor_venda * pv.valor_pagamento / sp.total as valor
    from pagamentos_da_venda pv
    join soma_pagamentos sp on sp.id = pv.id
    where pv.valor_pagamento > 0
      and sp.total > 0
    union all
    select vv.id, coalesce(vv.metodo, 'nao_informado'), vv.valor
    from vendas_validas vv
    where not exists (select 1 from soma_pagamentos sp where sp.id = vv.id and sp.total > 0)
  ),
  por_forma as (
    select forma, count(distinct id) as quantidade, sum(valor) as valor
    from formas
    group by forma
  ),
  estoque as (
    select
      coalesce(nullif(btrim(a.modelo), ''), 'Sem modelo') as modelo,
      coalesce(nullif(btrim(a.capacidade), ''), '') as capacidade,
      greatest(coalesce(a.quantidade, 1), 1) as qtd,
      a.custo::numeric as custo,
      case
        when a."dataCadastro" is null then null
        else greatest(p.hoje - (a."dataCadastro" at time zone 'America/Sao_Paulo')::date, 0)
      end as dias,
      p.limite_dias
    from public.aparelhos a
    cross join parametros p
    where a.loja_id = p.loja_id
      and a.ativo is distinct from false
      and coalesce(nullif(a.status, ''), 'disponivel') not in ('vendido', 'baixado', 'cliente')
      and a.condicao is distinct from 'vendido'
  ),
  capital as (
    select
      modelo,
      capacidade,
      sum(qtd) as quantidade,
      round(sum(coalesce(custo, 0) * qtd), 2) as custo_parado,
      count(*) filter (where custo is null) as sem_custo,
      max(dias) as dias_mais_antigo,
      round(avg(dias))::integer as dias_medio,
      coalesce(sum(qtd) filter (where dias > limite_dias), 0) as acima_limite
    from estoque
    group by modelo, capacidade
  )
  select jsonb_build_object(
    'inicio', (select inicio from parametros),
    'fim', (select fim from parametros),
    'fuso', 'America/Sao_Paulo',
    'limite_dias_parado', (select limite_dias from parametros),
    'totais', (
      select jsonb_build_object(
        'quantidade', t.quantidade,
        'faturamento', round(t.faturamento, 2),
        'custo', round(t.custo, 2),
        'lucro_bruto', round(t.lucro_bruto, 2),
        'taxas', round(t.taxas, 2),
        'lucro_liquido', round(t.lucro_bruto - t.taxas, 2),
        'ticket_medio', case when t.quantidade > 0 then round(t.faturamento / t.quantidade, 2) else 0 end
      )
      from totais t
    ),
    'por_dia', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dia', d.dia,
        'quantidade', d.quantidade,
        'faturamento', round(d.faturamento, 2),
        'custo', round(d.custo, 2),
        'lucro_bruto', round(d.lucro_bruto, 2),
        'taxas', round(d.taxas, 2),
        'lucro_liquido', round(d.lucro_bruto - d.taxas, 2)
      ) order by d.dia)
      from por_dia d
    ), '[]'::jsonb),
    'por_forma_pagamento', coalesce((
      select jsonb_agg(jsonb_build_object(
        'forma', f.forma,
        'quantidade', f.quantidade,
        'valor', round(f.valor, 2)
      ) order by f.valor desc)
      from por_forma f
    ), '[]'::jsonb),
    'capital_parado', jsonb_build_object(
      'quantidade', (select coalesce(sum(qtd), 0) from estoque),
      'custo_parado', (select round(coalesce(sum(coalesce(custo, 0) * qtd), 0), 2) from estoque),
      'acima_limite', (select coalesce(sum(qtd) filter (where dias > limite_dias), 0) from estoque),
      'grupos', coalesce((
        select jsonb_agg(jsonb_build_object(
          'modelo', c.modelo,
          'capacidade', c.capacidade,
          'quantidade', c.quantidade,
          'custo_parado', c.custo_parado,
          'sem_custo', c.sem_custo,
          'dias_mais_antigo', c.dias_mais_antigo,
          'dias_medio', c.dias_medio,
          'acima_limite', c.acima_limite
        ) order by c.custo_parado desc, c.modelo, c.capacidade)
        from capital c
      ), '[]'::jsonb)
    )
  );
$$;

revoke all on function public.dashboard_resumo(date, date, uuid) from public, anon;
grant execute on function public.dashboard_resumo(date, date, uuid) to authenticated, service_role;
