import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ErroVenda, interpretarErroVenda, montarArgumentosVenda, registrarVendaAtomica } from './vendaAtomica';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('Argumentos da venda atômica', () => {
  it('descarta ids que não são uuid e repetidos', () => {
    const args = montarArgumentosVenda({
      venda: { loja_id: A },
      aparelhoIds: [A, A, 'ap_123', undefined, null, B],
      permitirForaDoEstoque: ['', B],
      camposAparelho: { [A]: { cliente: 'Lucas' }, 'nao-uuid': { cliente: 'x' } },
      usuarioId: 'usuario-local',
      avaliacaoId: 'abc',
    });
    assert.deepEqual(args.p_aparelho_ids, [A, B]);
    assert.deepEqual(args.p_permitir_fora_do_estoque, [B]);
    assert.deepEqual(args.p_campos_aparelho, { [A]: { cliente: 'Lucas' } });
    assert.equal(args.p_usuario_id, null);
    assert.equal(args.p_avaliacao_id, null);
    assert.equal(args.p_venda_id, null);
    assert.equal(args.p_origem, 'venda');
  });
});

describe('Erros da venda atômica', () => {
  it('aparelho vendido em outro terminal vira mensagem com o modelo', () => {
    const erro = interpretarErroVenda({ code: 'P0001', message: 'FORA_DO_ESTOQUE: iPhone 13 128GB' });
    assert.equal(erro.codigo, 'fora_do_estoque');
    assert.equal(erro.detalhe, 'iPhone 13 128GB');
    assert.match(erro.message, /iPhone 13 128GB já saiu do estoque/);
    assert.match(erro.message, /Nada foi gravado/);
  });

  it('IMEI da troca já no estoque', () => {
    const erro = interpretarErroVenda({
      code: '23505',
      message: 'duplicate key value violates unique constraint "uq_aparelhos_imei_completo_no_estoque"',
    });
    assert.equal(erro.codigo, 'imei_duplicado');
  });

  it('função ainda não criada no banco', () => {
    assert.equal(interpretarErroVenda({ code: 'PGRST202', message: 'Could not find the function' }).codigo, 'funcao_ausente');
  });

  it('erro desconhecido mantém a mensagem do banco', () => {
    const erro = interpretarErroVenda({ message: 'permission denied for table vendas' });
    assert.equal(erro.codigo, 'falha');
    assert.match(erro.message, /permission denied/);
  });
});

describe('Chamada da venda atômica', () => {
  it('devolve a venda, os baixados e o aparelho da troca', async () => {
    const chamadas: Array<{ nome: string; args: Record<string, unknown> }> = [];
    const cliente = {
      rpc: async (nome: string, args: Record<string, unknown>) => {
        chamadas.push({ nome, args });
        return { data: { venda: { id: A, valor: 3000 }, baixados: 1, trade_in_id: B, lote_id: 'lote' }, error: null };
      },
    };
    const r = await registrarVendaAtomica(cliente as never, { venda: { loja_id: A }, aparelhoIds: [A] });
    assert.equal(chamadas[0].nome, 'registrar_venda_atomica');
    assert.equal(r.venda.id, A);
    assert.equal(r.baixados, 1);
    assert.equal(r.tradeInId, B);
  });

  it('erro do banco sobe como ErroVenda, sem venda parcial', async () => {
    const cliente = {
      rpc: async () => ({ data: null, error: { code: 'P0001', message: 'FORA_DO_ESTOQUE: iPhone 15' } }),
    };
    await assert.rejects(
      registrarVendaAtomica(cliente as never, { venda: { loja_id: A }, aparelhoIds: [A] }),
      (e: unknown) => e instanceof ErroVenda && e.codigo === 'fora_do_estoque'
    );
  });
});

describe('Venda cancelada', () => {
  it('editar venda cancelada vira mensagem clara', () => {
    const erro = interpretarErroVenda({ code: 'P0001', message: 'VENDA_CANCELADA' });
    assert.equal(erro.codigo, 'venda_cancelada');
    assert.match(erro.message, /cancelada/);
  });
});
