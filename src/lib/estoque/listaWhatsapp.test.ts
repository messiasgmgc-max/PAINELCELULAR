import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bateriaParaLista,
  observacaoParaLista,
  gerarListaEstoqueWhatsApp,
  sortGruposModelos,
  detectarComandoListaEstoque,
} from './listaWhatsapp';

describe('Lista de estoque para WhatsApp', () => {
  it('observação entre parênteses não fica "(Obs: (...))"', () => {
    assert.equal(observacaoParaLista('Obs: (CAM USADA) | ID: 43364592 | Bateria: 89% | IMEI: 2275'), 'CAM USADA');
    assert.equal(observacaoParaLista('Obs: ( TRASEIRA E TELA BOLINHA) | ID: 26381642 | Bateria: 87% | IMEI: 5030'), 'TRASEIRA E TELA BOLINHA');
    assert.equal(observacaoParaLista('Obs: (BG/TG) | ID: 87020617 | Bateria: 91% | IMEI: 9659'), 'BG/TG');
  });

  it('observação sem parênteses continua igual', () => {
    assert.equal(observacaoParaLista('Obs: TELA QUEBRADA | ID: 86971010 | Bateria: 82% | IMEI: 0188'), 'TELA QUEBRADA');
    assert.equal(observacaoParaLista('Obs: MSG BATERIA | ID: 09537670 | IMEI: 7954'), 'MSG BATERIA');
  });

  it('só dados técnicos não viram observação', () => {
    assert.equal(observacaoParaLista('ID: 16464341 | Bateria: 83% | IMEI: 3305'), '');
    assert.equal(observacaoParaLista('89% bateria | IMEI: 1234'), '');
    assert.equal(observacaoParaLista(null), '');
    assert.equal(observacaoParaLista('Obs: ' + 'X'.repeat(80)), '');
  });

  it('bateria mantém a porcentagem', () => {
    assert.equal(bateriaParaLista({ saude_bateria: '89%', observacoes: 'Obs: (CAM USADA) | Bateria: 89%' }), '89%');
    assert.equal(bateriaParaLista({ saude_bateria: '84' }), '84%');
  });

  it('sem coluna, a bateria vem da observação', () => {
    assert.equal(bateriaParaLista({ observacoes: 'Obs: (FACEID OFF) | ID: 1 | Bateria: 83% | IMEI: 3305' }), '83%');
    assert.equal(bateriaParaLista({ observacoes: 'Troca de tela | 91% bat' }), '91%');
    assert.equal(bateriaParaLista({ observacoes: 'Obs: MSG BATERIA | ID: 09537670' }), '');
    assert.equal(bateriaParaLista(null), '');
  });

  it('ordena linha 18 no topo (18 Pro Max, 18 Pro, 18) e mantém 16e colado na linha 16', () => {
    const embaralhados = [
      'iPhone 15 Pro Max',
      'iPhone 16e',
      'iPhone 18 Pro',
      'iPhone 16 Pro Max',
      'iPad Air 5',
      'iPhone 18',
      'iPhone 16',
      'Galaxy A16',
      'iPhone 17 Pro',
      'iPhone 18 Pro Max',
      'iPhone 16 Pro',
      'iPhone 17 Air',
    ];

    const ordenados = [...embaralhados].sort(sortGruposModelos);
    assert.deepEqual(ordenados, [
      'iPhone 18 Pro Max',
      'iPhone 18 Pro',
      'iPhone 18',
      'iPhone 17 Pro',
      'iPhone 17 Air',
      'iPhone 16 Pro Max',
      'iPhone 16 Pro',
      'iPhone 16',
      'iPhone 16e',
      'iPhone 15 Pro Max',
      'iPad Air 5',
      'Galaxy A16',
    ]);
  });

  it('separa tipos (Lacrados/Novos, Seminovos, Acessórios) com quantidades certas e mantém 16e junto dos 16 e 18 Pro junto da linha 18', () => {
    const estoque = [
      { id: '1', modelo: '18 Pro', capacidade: '256GB', cor: 'Preto', condicao: 'novo', status: 'disponivel', ativo: true, imei: '1111' },
      { id: '2', modelo: 'iPhone 18 Pro Max', capacidade: '512GB', cor: 'Natural', condicao: 'lacrado', status: null, ativo: true, imei: '2222' },
      { id: '3', modelo: '16e', capacidade: '128GB', cor: 'Branco', condicao: 'novo', status: 'disponivel', ativo: true, imei: '3333' },
      { id: '4', modelo: 'iPhone 16', capacidade: '128GB', cor: 'Azul', condicao: 'novo', status: 'disponivel', ativo: true, imei: '4444' },
      { id: '5', modelo: 'iPhone 16e', capacidade: '128GB', cor: 'Preto', condicao: 'seminovo', saude_bateria: '98%', status: 'disponivel', ativo: true, imei: '5555' },
      { id: '6', modelo: 'iPhone 16', capacidade: '128GB', cor: 'Rosa', condicao: 'seminovo', saude_bateria: '95%', status: null, ativo: true, imei: '6666' },
      { id: '7', modelo: 'iPhone 15 Pro', capacidade: '256GB', cor: 'Azul', condicao: 'seminovo', saude_bateria: '90%', status: 'disponivel', ativo: true, imei: '7777' },
      { id: '8', modelo: 'AirPods Pro 2', categoria: 'acessorio', cor: 'Branco', condicao: 'novo', quantidade: 3, status: 'disponivel', ativo: true },
      // Vendido não entra na conta
      { id: '9', modelo: 'iPhone 14', capacidade: '128GB', cor: 'Preto', condicao: 'seminovo', status: 'vendido', ativo: false, imei: '9999' },
    ];

    const lista = gerarListaEstoqueWhatsApp(estoque, { nomeLoja: 'LUCAS IMPORTS' });

    // Total real: 4 lacrados + 3 seminovos + 3 acessórios = 10
    assert.match(lista, /Total: \*10 aparelhos\* em estoque/);
    assert.match(lista, /🆕 Lacrados\/Novos: \*4\* \| 📱 Seminovos: \*3\* \| 🎧 Acessórios: \*3\*/);

    // Seções separadas com suas quantidades
    assert.match(lista, /🆕 \*LACRADOS \/ NOVOS \(4\)\*/);
    assert.match(lista, /📱 \*SEMINOVOS \(3\)\*/);
    assert.match(lista, /🎧 \*ACESSÓRIOS \(3\)\*/);

    // Ordem correta dentro de LACRADOS: 18 Pro Max -> 18 Pro -> 16 -> 16e
    const blocoLacrados = lista.split('📱 *SEMINOVOS')[0];
    const idx18pm = blocoLacrados.indexOf('*iPhone 18 Pro Max (1)*');
    const idx18p = blocoLacrados.indexOf('*iPhone 18 Pro (1)*');
    const idx16 = blocoLacrados.indexOf('*iPhone 16 (1)*');
    const idx16e = blocoLacrados.indexOf('*iPhone 16e (1)*');
    assert.ok(idx18pm !== -1 && idx18p !== -1 && idx16 !== -1 && idx16e !== -1);
    assert.ok(idx18pm < idx18p && idx18p < idx16 && idx16 < idx16e);

    // Ordem correta dentro de SEMINOVOS: 16 -> 16e -> 15 Pro
    const blocoSeminovos = lista.split('📱 *SEMINOVOS')[1].split('🎧 *ACESSÓRIOS')[0];
    const idxSemi16 = blocoSeminovos.indexOf('*iPhone 16 (1)*');
    const idxSemi16e = blocoSeminovos.indexOf('*iPhone 16e (1)*');
    const idxSemi15p = blocoSeminovos.indexOf('*iPhone 15 Pro (1)*');
    assert.ok(idxSemi16 !== -1 && idxSemi16e !== -1 && idxSemi15p !== -1);
    assert.ok(idxSemi16 < idxSemi16e && idxSemi16e < idxSemi15p);
  });

  it('lista de atacado segue o mesmo padrão da lista de estoque, trocando IMEI por valor de atacado e obs', () => {
    const estoque = [
      {
        id: '1',
        modelo: 'iPhone 16 Pro Max',
        capacidade: '256GB',
        cor: 'Natural',
        condicao: 'novo',
        status: 'disponivel',
        ativo: true,
        imei: '351111111111111',
        codigo: '11112222',
        preco: 7500,
        precoAtacado: 6800,
      },
      {
        id: '2',
        modelo: 'iPhone 15 Pro',
        capacidade: '256GB',
        cor: 'Azul',
        condicao: 'seminovo',
        saude_bateria: '90%',
        status: 'disponivel',
        ativo: true,
        imei: '352222222222222',
        codigo: '33334444',
        preco: 5200,
        preco_atacado: 4800,
        observacoes: 'Obs: (CAM USADA) | ID: 33334444 | Bateria: 90% | IMEI: 352222222222222',
      },
      {
        id: '3',
        modelo: 'iPhone 14',
        capacidade: '128GB',
        cor: 'Preto',
        condicao: 'seminovo',
        saude_bateria: '88%',
        status: 'disponivel',
        ativo: true,
        imei: '353333333333333',
        preco: 2900,
        observacoes: 'Obs: TELA TROCADA | IMEI: 353333333333333',
      },
      // Em manutenção não deve aparecer nem no varejo nem no atacado
      {
        id: '4',
        modelo: 'iPhone 13',
        capacidade: '128GB',
        cor: 'Branco',
        condicao: 'seminovo',
        status: 'manutencao',
        ativo: true,
        imei: '354444444444444',
        precoAtacado: 2100,
        observacoes: '[MANUTENCAO:Tecnico:Joao]',
      },
    ];

    const listaEstoque = gerarListaEstoqueWhatsApp(estoque, { nomeLoja: 'LUCAS IMPORTS' });
    const listaAtacado = gerarListaEstoqueWhatsApp(estoque, { modoAtacado: true, nomeLoja: 'LUCAS IMPORTS' });

    // Mesmo total e mesmas seções do !estoque (sem manutenção)
    assert.match(listaEstoque, /Total: \*3 aparelhos\* em estoque/);
    assert.match(listaAtacado, /Total: \*3 aparelhos\* em estoque/);
    assert.match(listaAtacado, /🆕 Lacrados\/Novos: \*1\* \| 📱 Seminovos: \*2\*/);
    assert.match(listaAtacado, /🆕 \*LACRADOS \/ NOVOS \(1\)\*/);
    assert.match(listaAtacado, /📱 \*SEMINOVOS \(2\)\*/);
    assert.ok(!listaAtacado.includes('MANUTENÇÃO'));
    assert.ok(!listaAtacado.includes('iPhone 13'));

    // No estoque normal aparece IMEI + obs
    assert.ok(listaEstoque.includes('🔘 256GB Natural - 351111111111111'));
    assert.ok(listaEstoque.includes('🔵 256GB Azul 90% - 352222222222222 (CAM USADA)'));

    // Na lista de atacado NÃO aparece nenhum IMEI nem código, e aparece valor de atacado + obs
    assert.ok(!listaAtacado.includes('351111111111111'));
    assert.ok(!listaAtacado.includes('352222222222222'));
    assert.ok(!listaAtacado.includes('353333333333333'));
    assert.ok(!listaAtacado.includes('11112222'));
    assert.ok(!listaAtacado.includes('33334444'));
    assert.ok(listaAtacado.includes('🔘 256GB Natural - *R$ 6.800*'));
    assert.ok(listaAtacado.includes('🔵 256GB Azul 90% - *R$ 4.800* (CAM USADA)'));
    assert.ok(listaAtacado.includes('⚫️ 128GB Preto 88% - *R$ 2.900* (TELA TROCADA)'));

    // No modo completo (interno), inclui código e manutenção quando solicitado
    const listaCompleta = gerarListaEstoqueWhatsApp(estoque, {
      modoAtacado: true,
      incluirCodigo: true,
      incluirManutencao: true,
      nomeLoja: 'LUCAS IMPORTS',
    });
    assert.ok(listaCompleta.includes('🔵 256GB Azul 90% - *R$ 4.800* (352222222222222) (CAM USADA)'));
    assert.ok(listaCompleta.includes('EM MANUTENÇÃO'));
  });

  it('detectarComandoListaEstoque diferencia !estoque, !lista atacado e !estoque completo', () => {
    assert.equal(detectarComandoListaEstoque('!lista atacado'), 'atacado');
    assert.equal(detectarComandoListaEstoque('!lista de atacado'), 'atacado');
    assert.equal(detectarComandoListaEstoque('!listaatacado'), 'atacado');
    assert.equal(detectarComandoListaEstoque('!estoque atacado'), 'atacado');
    assert.equal(detectarComandoListaEstoque('manda a lista de atacado'), 'atacado');
    assert.equal(detectarComandoListaEstoque('lista atacado'), 'atacado');

    assert.equal(detectarComandoListaEstoque('!estoque'), 'estoque');
    assert.equal(detectarComandoListaEstoque('!lista'), 'estoque');
    assert.equal(detectarComandoListaEstoque('manda a lista atualizada'), 'estoque');
    assert.equal(detectarComandoListaEstoque('estoque'), 'estoque');

    assert.equal(detectarComandoListaEstoque('!estoque completo'), 'completo');
    assert.equal(detectarComandoListaEstoque('!lista completa'), 'completo');

    assert.equal(detectarComandoListaEstoque('!vender 1234 2500'), null);
    assert.equal(detectarComandoListaEstoque('vendi um iphone atacado por 2500'), null);
  });
});
