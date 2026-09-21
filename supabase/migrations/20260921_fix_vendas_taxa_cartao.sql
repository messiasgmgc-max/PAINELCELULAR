-- ====================================================================
-- FIX: TAXA DE CARTÃO DEFAULT NA TABELA VENDAS E REGISTRAR_VENDA_ATOMICA
--
-- A coluna taxa_cartao tinha NOT NULL constraint sem default em algumas instâncias
-- do banco. Esta migration garante o DEFAULT 0 na coluna e atualiza a função
-- registrar_venda_atomica para incluir 'taxa_cartao', 0 nos valores padrões.
-- ====================================================================

ALTER TABLE public.vendas
  ALTER COLUMN taxa_cartao SET DEFAULT 0;

UPDATE public.vendas
   SET taxa_cartao = 0
 WHERE taxa_cartao IS NULL;

CREATE OR REPLACE FUNCTION public.registrar_venda_atomica(
  p_venda jsonb,
  p_aparelho_ids uuid[] DEFAULT '{}'::uuid[],
  p_venda_id uuid DEFAULT NULL,
  p_permitir_fora_do_estoque uuid[] DEFAULT '{}'::uuid[],
  p_campos_aparelho jsonb DEFAULT '{}'::jsonb,
  p_trade_in jsonb DEFAULT NULL,
  p_avaliacao_id uuid DEFAULT NULL,
  p_origem text DEFAULT 'venda',
  p_usuario_id uuid DEFAULT NULL,
  p_usuario_nome text DEFAULT NULL,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
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
  v_uuid CONSTANT text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  IF p_venda IS NULL OR jsonb_typeof(p_venda) <> 'object' THEN
    RAISE EXCEPTION 'VENDA_INVALIDA' USING errcode = 'P0001';
  END IF;

  SELECT coalesce(jsonb_object_agg(chave, valor), '{}'::jsonb)
    INTO v_payload
    FROM jsonb_each(p_venda - 'id') AS e(chave, valor)
   WHERE valor <> '""'::jsonb;

  v_loja := nullif(v_payload ->> 'loja_id', '')::uuid;
  IF v_loja IS NULL THEN
    RAISE EXCEPTION 'VENDA_SEM_LOJA' USING errcode = 'P0001';
  END IF;

  v_ids := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_aparelho_ids, '{}'::uuid[])) AS x WHERE x IS NOT NULL);

  IF p_venda_id IS NOT NULL THEN
    SELECT * INTO v_venda FROM public.vendas WHERE id = p_venda_id AND loja_id = v_loja FOR UPDATE;
    IF NOT found THEN
      RAISE EXCEPTION 'VENDA_NAO_ENCONTRADA' USING errcode = 'P0001';
    END IF;
    v_permitidos := v_permitidos || ARRAY(
      SELECT (item ->> 'aparelhoId')::uuid
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_venda.itens) = 'array' THEN v_venda.itens ELSE '[]'::jsonb END) AS item
       WHERE item ->> 'aparelhoId' ~ v_uuid
    );
  END IF;

  PERFORM 1 FROM public.aparelhos WHERE id = ANY(v_ids) ORDER BY id FOR UPDATE;

  SELECT string_agg(x::text, ', ')
    INTO v_faltando
    FROM unnest(v_ids) AS x
   WHERE NOT EXISTS (SELECT 1 FROM public.aparelhos a WHERE a.id = x AND a.loja_id = v_loja);
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'APARELHO_NAO_ENCONTRADO: %', v_faltando USING errcode = 'P0001';
  END IF;

  SELECT string_agg(coalesce(nullif(trim(concat_ws(' ', a.modelo, a.capacidade)), ''), 'aparelho'), ', ')
    INTO v_fora
    FROM public.aparelhos a
   WHERE a.id = ANY(v_ids)
     AND NOT (
       a.ativo IS DISTINCT FROM FALSE
       AND coalesce(a.status, 'disponivel') NOT IN ('vendido', 'baixado')
       AND a.condicao IS DISTINCT FROM 'vendido'
     )
     AND NOT (a.id = ANY(v_permitidos));
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'FORA_DO_ESTOQUE: %', v_fora USING errcode = 'P0001';
  END IF;

  SELECT jsonb_agg(
           CASE
             WHEN a.id IS NOT NULL
              AND NOT (e.item ? 'condicaoOriginal')
              AND a.condicao IS NOT NULL
              AND a.condicao <> 'vendido'
               THEN e.item || jsonb_build_object('condicaoOriginal', a.condicao)
             ELSE e.item
           END
           ORDER BY e.ordem)
    INTO v_itens
    FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(v_payload -> 'itens') = 'array' THEN v_payload -> 'itens' ELSE '[]'::jsonb END
         ) WITH ORDINALITY AS e(item, ordem)
    LEFT JOIN public.aparelhos a
      ON a.id::text = e.item ->> 'aparelhoId'
     AND a.loja_id = v_loja;

  v_payload := v_payload || jsonb_build_object('itens', coalesce(v_itens, '[]'::jsonb), 'loja_id', v_loja);

  IF p_venda_id IS NULL THEN
    INSERT INTO public.vendas
    SELECT (jsonb_populate_record(
      NULL::public.vendas,
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
        'dados_cliente_pendente', false,
        'taxa_cartao', 0
      ) || v_payload
    )).*
    RETURNING * INTO v_venda;
  ELSE
    v_venda := jsonb_populate_record(v_venda, v_payload);
    UPDATE public.vendas
       SET "clienteId" = v_venda."clienteId",
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
           dados_cliente_pendente = v_venda.dados_cliente_pendente,
           taxa_cartao = coalesce(v_venda.taxa_cartao, 0)
     WHERE id = p_venda_id
     RETURNING * INTO v_venda;
  END IF;

  v_data := coalesce(v_venda."dataPagamento", now());

  WITH alvo AS (
    SELECT a.id, a.loja_id, a.ativo, a.status, a.condicao, a.data_saida, a.motivo_saida
      FROM public.aparelhos a
     WHERE a.id = ANY(v_ids)
       AND a.loja_id = v_loja
       AND (
         (a.ativo IS DISTINCT FROM FALSE
          AND coalesce(a.status, 'disponivel') NOT IN ('vendido', 'baixado')
          AND a.condicao IS DISTINCT FROM 'vendido')
         OR (a.ativo = FALSE AND a.status = 'baixado')
       )
  ),
  atualizados AS (
    UPDATE public.aparelhos a
       SET ativo = FALSE,
           status = 'vendido',
           data_saida = v_data,
           motivo_saida = 'venda',
           cliente = CASE
             WHEN coalesce(p_campos_aparelho -> a.id::text, '{}'::jsonb) ? 'cliente'
               THEN p_campos_aparelho -> a.id::text ->> 'cliente'
             ELSE a.cliente
           END,
           observacoes = CASE
             WHEN coalesce(p_campos_aparelho -> a.id::text, '{}'::jsonb) ? 'observacoes'
               THEN p_campos_aparelho -> a.id::text ->> 'observacoes'
             ELSE a.observacoes
           END
      FROM alvo
     WHERE a.id = alvo.id
    RETURNING a.id
  ),
  movimentos AS (
    INSERT INTO public.movimentacoes_estoque
      (loja_id, aparelho_id, tipo, origem, lote_id, usuario_id, usuario_nome, valor_anterior, valor_novo, observacao)
    SELECT alvo.loja_id,
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
      FROM alvo
      JOIN atualizados USING (id)
    RETURNING 1
  )
  SELECT count(*) INTO v_baixados FROM movimentos;

  IF p_trade_in IS NOT NULL AND jsonb_typeof(p_trade_in) = 'object' THEN
    SELECT coalesce(jsonb_object_agg(chave, valor), '{}'::jsonb)
      INTO v_trade_in
      FROM jsonb_each(p_trade_in - 'id' - 'data_saida' - 'motivo_saida') AS e(chave, valor)
     WHERE valor <> '""'::jsonb AND valor <> 'null'::jsonb;

    IF coalesce(v_trade_in ->> 'condicao', '') IN ('', 'vendido') THEN
      v_trade_in := v_trade_in || jsonb_build_object('condicao', 'seminovo');
    END IF;

    INSERT INTO public.aparelhos
    SELECT (jsonb_populate_record(
      NULL::public.aparelhos,
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
    RETURNING id INTO v_trade_in_id;

    INSERT INTO public.movimentacoes_estoque
      (loja_id, aparelho_id, tipo, origem, lote_id, usuario_id, usuario_nome, valor_anterior, valor_novo, observacao)
    SELECT v_loja, t.id, 'entrada', coalesce(p_origem, 'venda'), v_lote, p_usuario_id, p_usuario_nome, NULL,
           jsonb_build_object('ativo', t.ativo, 'status', t.status, 'condicao', t.condicao,
                              'data_saida', null, 'motivo_saida', null),
           'Recebido como troca na venda #' || upper(right(v_venda.id::text, 6))
      FROM public.aparelhos t
     WHERE t.id = v_trade_in_id;
  END IF;

  IF p_avaliacao_id IS NOT NULL THEN
    UPDATE public.avaliacoes_upgrade
       SET status = 'convertido_venda',
           venda_id = v_venda.id,
           aparelho_id_gerado = coalesce(v_trade_in_id, aparelho_id_gerado)
     WHERE id = p_avaliacao_id
       AND loja_id = v_loja;
  END IF;

  RETURN jsonb_build_object(
    'venda', to_jsonb(v_venda),
    'baixados', v_baixados,
    'trade_in_id', v_trade_in_id,
    'lote_id', v_lote
  );
END;
$$;
