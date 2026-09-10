import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AparelhoRemontagem,
  DependenciasRemontagem,
  ItemListaImportada,
  avaliarTravaBaixa,
  encontrarEquivalente,
  executarPlanoRemontagem,
  planejarRemontagem,
} from './remontagem';
import { criarSupabaseFake } from './testes/supabaseFake';

const obterCodigo = (a: AparelhoRemontagem) => String((a as { codigo?: string }).codigo || '');

function aparelho(i: number, extra: Record<string, unknown> = {}): AparelhoRemontagem {
  return {
    id: `ap-${i}`,
    loja_id: 'LOJA',
    codigo: String(10000000 + i),
    modelo: `iPhone ${i}`,
    imei: `3500000000${String(i).padStart(5, '0')}`,
    ativo: true,
    status: 'disponivel',
    condicao: 'seminovo',
    data_saida: null,
    motivo_saida: null,
    ...extra,
  } as AparelhoRemontagem;
}

function itemPara(i: number, extra: Partial<ItemListaImportada> = {}): ItemListaImportada {
  return {
    idEtiqueta: String(10000000 + i),
    idEtiquetaInformado: true,
    modelo: `iPhone ${i}`,
    condicao: 'seminovo',
    custo: 1000,
    preco: 1300,
    isCellular: true,
    ...extra,
  };
}

function dependencias(fake: ReturnType<typeof criarSupabaseFake>, logs: unknown[] = []): DependenciasRemontagem {
  return {
    lojaId: 'LOJA',
    usuarioNome: 'Teste',
    criarAparelho: async (item) => {
      const novo = { id: `novo-${item.idEtiqueta}`, loja_id: 'LOJA', ativo: true, status: 'disponivel', condicao: item.condicao };
      fake.tabelas.aparelhos.push(novo);
      return novo;
    },
    dadosCadastrais: (item) => ({ preco: item.preco, modelo: item.modelo }),
    registrarLog: async (p) => {
      logs.push(p);
    },
  };
}

describe('INCIDENTE 10/09/2026: lista com 1 item contra 112 ativos', () => {
  const estoque = () => Array.from({ length: 112 }, (_, i) => aparelho(i));

  it('o plano bloqueia a baixa dos 111 que não estão na lista', () => {
    const plano = planejarRemontagem({ itens: [itemPara(0)], aparelhos: estoque(), obterCodigo });

    assert.equal(plano.atualizar.length, 1);
    assert.equal(plano.baixar.length, 111);
    assert.equal(plano.trava.bloqueada, true);
    assert.match(plano.trava.motivo || '', /incompleta/);
  });

  it('mesmo pedindo a baixa, o executor NÃO baixa nenhum aparelho', async () => {
    const fake = criarSupabaseFake({ aparelhos: estoque() });
    const logs: any[] = [];
    const plano = planejarRemontagem({ itens: [itemPara(0)], aparelhos: fake.tabelas.aparelhos as AparelhoRemontagem[], obterCodigo });

    const r = await executarPlanoRemontagem(fake.client, plano, { incluirBaixa: true }, dependencias(fake, logs));

    assert.equal(r.baixados, 0);
    assert.equal(r.baixaBloqueada, true);
    const ativos = fake.tabelas.aparelhos.filter((a) => a.ativo !== false);
    assert.equal(ativos.length, 112, 'nenhum aparelho pode sair do estoque');
    assert.ok(!fake.tabelas.aparelhos.some((a) => a.condicao === 'vendido'));
    assert.ok(!(fake.tabelas.movimentacoes_estoque || []).some((m) => m.tipo === 'baixa'));
    assert.match(logs[0].detalhes, /BAIXA BLOQUEADA/);
  });

  it('um plano adulterado dizendo "não bloqueado" continua sem baixar', async () => {
    const fake = criarSupabaseFake({ aparelhos: estoque() });
    const plano = planejarRemontagem({ itens: [itemPara(0)], aparelhos: fake.tabelas.aparelhos as AparelhoRemontagem[], obterCodigo });
    plano.trava = { bloqueada: false };

    const r = await executarPlanoRemontagem(fake.client, plano, { incluirBaixa: true }, dependencias(fake));

    assert.equal(r.baixados, 0);
    assert.equal(fake.tabelas.aparelhos.filter((a) => a.ativo !== false).length, 112);
  });
});

describe('Remontagem legítima', () => {
  it('baixa só os ausentes, com status=baixado, preservando a condição e auditando o lote', async () => {
    const aparelhos = Array.from({ length: 20 }, (_, i) => aparelho(i, i === 19 ? { condicao: 'novo' } : {}));
    const fake = criarSupabaseFake({ aparelhos });
    const logs: any[] = [];
    const itens = Array.from({ length: 18 }, (_, i) => itemPara(i));

    const plano = planejarRemontagem({ itens, aparelhos: fake.tabelas.aparelhos as AparelhoRemontagem[], obterCodigo });
    assert.equal(plano.baixar.length, 2);
    assert.equal(plano.trava.bloqueada, false);

    const r = await executarPlanoRemontagem(fake.client, plano, { incluirBaixa: true }, dependencias(fake, logs));

    assert.equal(r.baixados, 2);
    const baixado = fake.tabelas.aparelhos.find((a) => a.id === 'ap-19')!;
    assert.equal(baixado.ativo, false);
    assert.equal(baixado.status, 'baixado');
    assert.equal(baixado.condicao, 'novo', 'baixa não pode apagar a condição física');
    assert.equal(baixado.motivo_saida, 'baixa_massa');
    assert.ok(baixado.data_saida);

    const baixas = fake.tabelas.movimentacoes_estoque.filter((m) => m.tipo === 'baixa');
    assert.equal(baixas.length, 2);
    assert.ok(baixas.every((m) => m.lote_id === r.loteId));
    assert.equal(logs[0].acao, 'Baixa em massa (Remontar MercadoPhone)');
    assert.deepEqual(logs[0].valor_novo.ids_baixados.sort(), ['ap-18', 'ap-19']);
    assert.ok(logs[0].valor_anterior, 'o log precisa do estado anterior');
  });

  it('sem confirmação da baixa, só atualiza os encontrados', async () => {
    const aparelhos = Array.from({ length: 20 }, (_, i) => aparelho(i));
    const fake = criarSupabaseFake({ aparelhos });
    const plano = planejarRemontagem({ itens: [itemPara(0), itemPara(1)], aparelhos: fake.tabelas.aparelhos as AparelhoRemontagem[], obterCodigo });

    const r = await executarPlanoRemontagem(fake.client, plano, { incluirBaixa: false }, dependencias(fake));

    assert.equal(r.baixados, 0);
    assert.equal(r.atualizados, 2);
    assert.equal(fake.tabelas.aparelhos.filter((a) => a.ativo !== false).length, 20);
  });

  it('não ressuscita aparelho vendido de verdade que aparece na lista', () => {
    const aparelhos = [aparelho(0, { ativo: false, status: 'vendido', condicao: 'vendido' }), aparelho(1)];
    const plano = planejarRemontagem({ itens: [itemPara(0), itemPara(1)], aparelhos, obterCodigo });

    assert.equal(plano.conflitosVendidos.length, 1);
    assert.equal(plano.conflitosVendidos[0].aparelho.id, 'ap-0');
    assert.ok(!plano.atualizar.some((u) => u.aparelho.id === 'ap-0'));
  });

  it('não reativa o legado ambíguo (desativado com a condição antiga de venda)', async () => {
    const aparelhos = [aparelho(0, { ativo: false, status: 'disponivel', condicao: 'vendido' }), aparelho(1)];
    const plano = planejarRemontagem({ itens: [itemPara(0), itemPara(1)], aparelhos, obterCodigo });

    assert.equal(plano.conflitosVendidos.length, 1);
    assert.ok(!plano.atualizar.some((u) => u.aparelho.id === 'ap-0'));

    // Nem um plano adulterado faz o executor mexer nele.
    const fake = criarSupabaseFake({ aparelhos });
    const adulterado = { ...plano, atualizar: [{ item: itemPara(0), aparelho: aparelhos[0], reativa: true }] };
    await executarPlanoRemontagem(fake.client, adulterado, { incluirBaixa: false }, dependencias(fake));
    const linha = fake.tabelas.aparelhos.find((a) => a.id === 'ap-0');
    assert.equal(linha?.ativo, false);
    assert.equal(linha?.condicao, 'vendido');
  });

  it('reativa aparelho baixado que a lista confirma estar na loja', () => {
    const aparelhos = [aparelho(0, { ativo: false, status: 'baixado' }), aparelho(1)];
    const plano = planejarRemontagem({ itens: [itemPara(0), itemPara(1)], aparelhos, obterCodigo });

    const alvo = plano.atualizar.find((u) => u.aparelho.id === 'ap-0');
    assert.ok(alvo);
    assert.equal(alvo!.reativa, true);
  });

  it('aparelho em manutenção nunca é baixado por remontagem', () => {
    const aparelhos = [...Array.from({ length: 15 }, (_, i) => aparelho(i)), aparelho(99, { status: 'manutencao' })];
    const itens = Array.from({ length: 15 }, (_, i) => itemPara(i));
    const plano = planejarRemontagem({ itens, aparelhos, obterCodigo });

    assert.equal(plano.baixar.length, 0);
    assert.equal(plano.preservadosManutencao.length, 1);
  });
});

describe('Correspondência entre lista e estoque', () => {
  it('ignora ID de etiqueta inventado pelo parser', () => {
    const aparelhos = [aparelho(5)];
    const item = itemPara(5, { idEtiquetaInformado: false, sufixoSerial: '' });

    assert.equal(encontrarEquivalente(item, aparelhos, obterCodigo), undefined);
  });

  it('exige a marca "ID: <id>" nas observações, não um número solto', () => {
    const semMarca = [aparelho(0, { codigo: '', observacoes: 'Custo 12345678 pago em pix' })];
    const comMarca = [aparelho(0, { codigo: '', observacoes: 'Obs: tela | ID: 12345678 | Bateria: 90%' })];
    const item = itemPara(0, { idEtiqueta: '12345678', sufixoSerial: '' });

    assert.equal(encontrarEquivalente(item, semMarca, obterCodigo), undefined);
    assert.equal(encontrarEquivalente(item, comMarca, obterCodigo)?.id, 'ap-0');
  });

  it('final de IMEI que aponta para dois aparelhos não casa com nenhum', () => {
    const aparelhos = [
      aparelho(1, { codigo: '', imei: '350000000002605' }),
      aparelho(2, { codigo: '', imei: '359999999992605' }),
    ];
    const item = itemPara(0, { idEtiquetaInformado: false, sufixoSerial: '2605' });

    assert.equal(encontrarEquivalente(item, aparelhos, obterCodigo), undefined);
  });

  it('final de IMEI único casa', () => {
    const aparelhos = [aparelho(1, { codigo: '', imei: '350000000002605' }), aparelho(2, { codigo: '', imei: '359999999997777' })];
    const item = itemPara(0, { idEtiquetaInformado: false, sufixoSerial: '2605' });

    assert.equal(encontrarEquivalente(item, aparelhos, obterCodigo)?.id, 'ap-1');
  });

  it('um aparelho não é casado com dois itens da lista', () => {
    const aparelhos = [aparelho(0)];
    const plano = planejarRemontagem({ itens: [itemPara(0), itemPara(0)], aparelhos, obterCodigo });

    assert.equal(plano.atualizar.length, 1);
    assert.equal(plano.criar.length, 1);
  });
});

describe('Trava de sanidade', () => {
  it('bloqueia quando saem mais aparelhos do que a lista tem', () => {
    assert.equal(avaliarTravaBaixa({ baixas: 4, itensImportados: 3, ativos: 5 }).bloqueada, true);
  });

  it('bloqueia acima de 30% do estoque ativo', () => {
    assert.equal(avaliarTravaBaixa({ baixas: 16, itensImportados: 40, ativos: 50 }).bloqueada, true);
    assert.equal(avaliarTravaBaixa({ baixas: 15, itensImportados: 40, ativos: 50 }).bloqueada, false);
  });

  it('em estoque muito pequeno só a regra de contagem vale', () => {
    // 2 de 5 é 40%, mas bloquear aqui impediria qualquer loja pequena de remontar.
    assert.equal(avaliarTravaBaixa({ baixas: 2, itensImportados: 3, ativos: 5 }).bloqueada, false);
  });

  it('sem baixa não há o que bloquear', () => {
    assert.equal(avaliarTravaBaixa({ baixas: 0, itensImportados: 0, ativos: 100 }).bloqueada, false);
  });
});
