-- ====================================================================
-- VENDA ATÔMICA
--
-- Antes, a venda era gravada numa chamada e a baixa do estoque em outra.
-- Entre as duas, dois terminais conseguiam vender o mesmo iPhone, e uma
-- falha no meio deixava venda sem baixa ou baixa sem venda. O aparelho de
-- troca era cadastrado depois, fora da transação, com uma coluna que nem
-- existia (bateria), e a tela dizia que ele tinha entrado no estoque.
--
-- registrar_venda_atomica faz tudo numa transação só:
--   1. trava os aparelhos da venda (SELECT ... FOR UPDATE);
--   2. recusa a venda inteira se algum aparelho já saiu do estoque, a não ser
--      que tenha sido escolhido de propósito (vincular venda antiga) ou já
--      estivesse na venda que está sendo editada;
--   3. grava ou atualiza a venda, guardando a condição física de cada item;
--   4. baixa os aparelhos (status vendido + data_saida + motivo_saida);
--   5. cadastra o aparelho de troca, se houver;
--   6. registra tudo em movimentacoes_estoque no mesmo lote.
-- Qualquer erro desfaz tudo.
--
-- SECURITY INVOKER: roda com as permissões de quem chama, então a RLS
-- "Isolamento por Loja" continua valendo no painel. O bot usa service role.
-- ====================================================================

create or replace function public.registrar_venda_atomica(
  p_venda jsonb,
  p_aparelho_ids uuid[] default '{}'::uuid[],
  p_venda_id uuid default null,
  p_permitir_fora_do_estoque uuid[] default '{}'::uuid[],
  p_campos_aparelho jsonb default '{}'::jsonb,
  p_trade_in jsonb default null,
  p_avaliacao_id uuid default null,
  p_origem text default 'venda',
  p_usuario_id uuid default null,
  p_usuario_nome text default null,
  p_observacao text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_loja uuid;
  v_venda public.vendas;
  v_payload jsonb;
  v_itens jsonb;
  v_data timestamptz;
  v_lote uuid := gen_random_uuid();
  v_ids uuid[];
  v_permitidos uuid[] := coalesce(p_permitir_fora_do_estoque, '{}'::uuid[]);
  v_faltando text;
  v_fora text;
  v_baixados integer := 0;
  v_trade_in jsonb;
  v_trade_in_id uuid;
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if p_venda is null or jsonb_typeof(p_venda) <> 'object' then
    raise exception 'VENDA_INVALIDA' using errcode = 'P0001';
  end if;

  -- String vazia não vira uuid/número: some do payload e o padrão da coluna vale.
  select coalesce(jsonb_object_agg(chave, valor), '{}'::jsonb)
    into v_payload
    from jsonb_each(p_venda - 'id') as e(chave, valor)
   where valor <> '""'::jsonb;

  v_loja := nullif(v_payload ->> 'loja_id', '')::uuid;
  if v_loja is null then
    raise exception 'VENDA_SEM_LOJA' using errcode = 'P0001';
  end if;

  v_ids := array(select distinct x from unnest(coalesce(p_aparelho_ids, '{}'::uuid[])) as x where x is not null);

  -- Na edição, o que já estava na venda original não precisa estar no estoque.
  if p_venda_id is not null then
    select * into v_venda from public.vendas where id = p_venda_id and loja_id = v_loja for update;
    if not found then
      raise exception 'VENDA_NAO_ENCONTRADA' using errcode = 'P0001';
    end if;
    v_permitidos := v_permitidos || array(
      select (item ->> 'aparelhoId')::uuid
        from jsonb_array_elements(case when jsonb_typeof(v_venda.itens) = 'array' then v_venda.itens else '[]'::jsonb end) as item
       where item ->> 'aparelhoId' ~ v_uuid
    );
  end if;

  -- Trava em ordem de id: duas vendas simultâneas esperam uma pela outra em vez de travar.
  perform 1 from public.aparelhos where id = any(v_ids) order by id for update;

  select string_agg(x::text, ', ')
    into v_faltando
    from unnest(v_ids) as x
   where not exists (select 1 from public.aparelhos a where a.id = x and a.loja_id = v_loja);
  if v_faltando is not null then
    raise exception 'APARELHO_NAO_ENCONTRADO: %', v_faltando using errcode = 'P0001';
  end if;

  select string_agg(coalesce(nullif(trim(concat_ws(' ', a.modelo, a.capacidade)), ''), 'aparelho'), ', ')
    into v_fora
    from public.aparelhos a
   where a.id = any(v_ids)
     and not (
       a.ativo is distinct from false
       and coalesce(a.status, 'disponivel') not in ('vendido', 'baixado')
       and a.condicao is distinct from 'vendido'
     )
     and not (a.id = any(v_permitidos));
  if v_fora is not null then
    raise exception 'FORA_DO_ESTOQUE: %', v_fora using errcode = 'P0001';
  end if;

  -- Condição física de cada item, para um estorno devolver o aparelho como estava.
  select jsonb_agg(
           case
             when a.id is not null
              and not (e.item ? 'condicaoOriginal')
              and a.condicao is not null
              and a.condicao <> 'vendido'
               then e.item || jsonb_build_object('condicaoOriginal', a.condicao)
             else e.item
           end
           order by e.ordem)
    into v_itens
    from jsonb_array_elements(
           case when jsonb_typeof(v_payload -> 'itens') = 'array' then v_payload -> 'itens' else '[]'::jsonb end
         ) with ordinality as e(item, ordem)
    left join public.aparelhos a
      on a.id::text = e.item ->> 'aparelhoId'
     and a.loja_id = v_loja;

  v_payload := v_payload || jsonb_build_object('itens', coalesce(v_itens, '[]'::jsonb), 'loja_id', v_loja);

  if p_venda_id is null then
    insert into public.vendas
    select (jsonb_populate_record(
      null::public.vendas,
      jsonb_build_object(
        'id', gen_random_uuid(),
        'itens', '[]'::jsonb,
        'pagamentos', '[]'::jsonb,
        'dataPagamento', now(),
        'ativo', true,
        'tipo_entrega', 'Varejo',
        'saldoDevedor', 0,
        'valorPago', 0,
        'taxaJurosMensal', 0,
        'valorJuros', 0,
        'historicoAbatimentos', '[]'::jsonb,
        'dados_cliente_pendente', false
      ) || v_payload
    )).*
    returning * into v_venda;
  else
    v_venda := jsonb_populate_record(v_venda, v_payload);
    update public.vendas
       set "clienteId" = v_venda."clienteId",
           "clienteNome" = v_venda."clienteNome",
           vendedor = v_venda.vendedor,
           "tipoEntrega" = v_venda."tipoEntrega",
           itens = v_venda.itens,
           valor = v_venda.valor,
           custo = v_venda.custo,
           lucro = v_venda.lucro,
           "percentualLucro" = v_venda."percentualLucro",
           "dataPagamento" = v_venda."dataPagamento",
           status = v_venda.status,
           metodo = v_venda.metodo,
           descricao = v_venda.descricao,
           garantia = v_venda.garantia,
           "descontoTotal" = v_venda."descontoTotal",
           pagamentos = coalesce(v_venda.pagamentos, '[]'::jsonb),
           ativo = v_venda.ativo,
           tipo_entrega = v_venda.tipo_entrega,
           "saldoDevedor" = v_venda."saldoDevedor",
           "valorPago" = v_venda."valorPago",
           "dataVencimento" = v_venda."dataVencimento",
           "taxaJurosMensal" = v_venda."taxaJurosMensal",
           "valorJuros" = v_venda."valorJuros",
           "historicoAbatimentos" = v_venda."historicoAbatimentos",
           dados_cliente_pendente = v_venda.dados_cliente_pendente
     where id = p_venda_id
     returning * into v_venda;
  end if;

  v_data := coalesce(v_venda."dataPagamento", now());

  -- Baixa: quem está no estoque, ou um aparelho 'baixado' vinculado a esta venda.
  -- Vendido e legado ambíguo ficam como estão (a venda pode citá-los, mas não os move).
  with alvo as (
    select a.id, a.loja_id, a.ativo, a.status, a.condicao, a.data_saida, a.motivo_saida
      from public.aparelhos a
     where a.id = any(v_ids)
       and a.loja_id = v_loja
       and (
         (a.ativo is distinct from false
          and coalesce(a.status, 'disponivel') not in ('vendido', 'baixado')
          and a.condicao is distinct from 'vendido')
         or (a.ativo = false and a.status = 'baixado')
       )
  ),
  atualizados as (
    update public.aparelhos a
       set ativo = false,
           status = 'vendido',
           data_saida = v_data,
           motivo_saida = 'venda',
           cliente = case
             when coalesce(p_campos_aparelho -> a.id::text, '{}'::jsonb) ? 'cliente'
               then p_campos_aparelho -> a.id::text ->> 'cliente'
             else a.cliente
           end,
           observacoes = case
             when coalesce(p_campos_aparelho -> a.id::text, '{}'::jsonb) ? 'observacoes'
               then p_campos_aparelho -> a.id::text ->> 'observacoes'
             else a.observacoes
           end
      from alvo
     where a.id = alvo.id
    returning a.id
  ),
  movimentos as (
    insert into public.movimentacoes_estoque
      (loja_id, aparelho_id, tipo, origem, lote_id, usuario_id, usuario_nome, valor_anterior, valor_novo, observacao)
    select alvo.loja_id,
           alvo.id,
           'venda',
           coalesce(p_origem, 'venda'),
           v_lote,
           p_usuario_id,
           p_usuario_nome,
           jsonb_build_object('ativo', alvo.ativo, 'status', alvo.status, 'condicao', alvo.condicao,
                              'data_saida', alvo.data_saida, 'motivo_saida', alvo.motivo_saida),
           jsonb_build_object('ativo', false, 'status', 'vendido', 'data_saida', v_data, 'motivo_saida', 'venda'),
           coalesce(p_observacao, 'Venda') || ' #' || upper(right(v_venda.id::text, 6))
      from alvo
      join atualizados using (id)
    returning 1
  )
  select count(*) into v_baixados from movimentos;

  -- Aparelho recebido na troca: entra no estoque na mesma transação.
  if p_trade_in is not null and jsonb_typeof(p_trade_in) = 'object' then
    select coalesce(jsonb_object_agg(chave, valor), '{}'::jsonb)
      into v_trade_in
      from jsonb_each(p_trade_in - 'id' - 'data_saida' - 'motivo_saida') as e(chave, valor)
     where valor <> '""'::jsonb and valor <> 'null'::jsonb;

    if coalesce(v_trade_in ->> 'condicao', '') in ('', 'vendido') then
      v_trade_in := v_trade_in || jsonb_build_object('condicao', 'seminovo');
    end if;

    insert into public.aparelhos
    select (jsonb_populate_record(
      null::public.aparelhos,
      jsonb_build_object(
        'id', gen_random_uuid(),
        'dataCadastro', now(),
        'categoria', 'aparelho',
        'quantidade', 1,
        'precoAtacado', 0,
        'preco_atacado', 0,
        'etiquetas_impressas', 0,
        'custo_manutencao', 0,
        'updated_at', now()
      )
      || v_trade_in
      || jsonb_build_object('loja_id', v_loja, 'ativo', true, 'status', 'disponivel')
    )).*
    returning id into v_trade_in_id;

    insert into public.movimentacoes_estoque
      (loja_id, aparelho_id, tipo, origem, lote_id, usuario_id, usuario_nome, valor_anterior, valor_novo, observacao)
    select v_loja, t.id, 'entrada', coalesce(p_origem, 'venda'), v_lote, p_usuario_id, p_usuario_nome, null,
           jsonb_build_object('ativo', t.ativo, 'status', t.status, 'condicao', t.condicao,
                              'data_saida', null, 'motivo_saida', null),
           'Recebido como troca na venda #' || upper(right(v_venda.id::text, 6))
      from public.aparelhos t
     where t.id = v_trade_in_id;
  end if;

  if p_avaliacao_id is not null then
    update public.avaliacoes_upgrade
       set status = 'convertido_venda',
           venda_id = v_venda.id,
           aparelho_id_gerado = coalesce(v_trade_in_id, aparelho_id_gerado)
     where id = p_avaliacao_id
       and loja_id = v_loja;
  end if;

  return jsonb_build_object(
    'venda', to_jsonb(v_venda),
    'baixados', v_baixados,
    'trade_in_id', v_trade_in_id,
    'lote_id', v_lote
  );
end;
$$;

revoke all on function public.registrar_venda_atomica(jsonb, uuid[], uuid, uuid[], jsonb, jsonb, uuid, text, uuid, text, text) from public;
revoke all on function public.registrar_venda_atomica(jsonb, uuid[], uuid, uuid[], jsonb, jsonb, uuid, text, uuid, text, text) from anon;
grant execute on function public.registrar_venda_atomica(jsonb, uuid[], uuid, uuid[], jsonb, jsonb, uuid, text, uuid, text, text) to authenticated, service_role;

-- --------------------------------------------------------------------
-- Um IMEI completo não pode estar duas vezes no estoque da mesma loja.
-- Só vale para IMEI de 15 dígitos: a importação do MercadoPhone guarda
-- apenas os 4 últimos dígitos, que se repetem entre aparelhos diferentes.
-- Em 11/09/2026 havia 12 IMEIs completos e nenhum repetido no estoque.
-- --------------------------------------------------------------------
create unique index if not exists uq_aparelhos_imei_completo_no_estoque
  on public.aparelhos (loja_id, imei)
  where imei ~ '^[0-9]{15}$'
    and ativo is distinct from false
    and coalesce(status, 'disponivel') not in ('vendido', 'baixado')
    and condicao is distinct from 'vendido';
