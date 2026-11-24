import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDataNascimento,
  formatarDataNascimento,
  dataNascimentoParaInput,
  calcularInfoAniversario,
  extrairProdutosDaVenda,
  mapearComprasPorCliente,
  emailEhPlaceholder,
  montarLinkWhatsappCliente,
  obterIniciaisCliente,
} from './resumoCliente';

describe('datas de nascimento de clientes', () => {
  it('interpreta formatos ISO, brasileiro, sem ano e 8 dígitos', () => {
    assert.deepEqual(parseDataNascimento('1995-05-12'), { dia: 12, mes: 5, ano: 1995 });
    assert.deepEqual(parseDataNascimento('1995-05-12T00:00:00.000Z'), { dia: 12, mes: 5, ano: 1995 });
    assert.deepEqual(parseDataNascimento('12/05/1995'), { dia: 12, mes: 5, ano: 1995 });
    assert.deepEqual(parseDataNascimento('12-05-1995'), { dia: 12, mes: 5, ano: 1995 });
    assert.deepEqual(parseDataNascimento('12051995'), { dia: 12, mes: 5, ano: 1995 });
    assert.deepEqual(parseDataNascimento('12/05'), { dia: 12, mes: 5 });
  });

  it('rejeita datas inválidas de calendário', () => {
    assert.equal(parseDataNascimento('30/02/1995'), null);
    assert.equal(parseDataNascimento('29/02/2023'), null);
    assert.deepEqual(parseDataNascimento('29/02/2024'), { dia: 29, mes: 2, ano: 2024 });
    assert.equal(parseDataNascimento(''), null);
  });

  it('formata para exibição BR e para input date', () => {
    assert.equal(formatarDataNascimento('1995-05-12'), '12/05/1995');
    assert.equal(formatarDataNascimento('5/3/1990'), '05/03/1990');
    assert.equal(formatarDataNascimento('12/05'), '12/05');
    assert.equal(formatarDataNascimento('texto livre'), 'texto livre');
    assert.equal(formatarDataNascimento(''), null);

    assert.equal(dataNascimentoParaInput('12/05/1995'), '1995-05-12');
    assert.equal(dataNascimentoParaInput('1995-05-12'), '1995-05-12');
    assert.equal(dataNascimentoParaInput('12/05'), '');
  });

  it('calcula idade, aniversariante do dia e dias restantes', () => {
    const hoje = new Date(2026, 10, 24); // 24/11/2026

    const hojeNasc = calcularInfoAniversario('24/11/1996', hoje);
    assert.ok(hojeNasc);
    assert.equal(hojeNasc.dataFormatada, '24/11/1996');
    assert.equal(hojeNasc.idade, 30);
    assert.equal(hojeNasc.aniversarioHoje, true);
    assert.equal(hojeNasc.aniversarioNoMes, true);
    assert.equal(hojeNasc.diasParaAniversario, 0);

    const emCincoDias = calcularInfoAniversario('1990-11-29', hoje);
    assert.ok(emCincoDias);
    assert.equal(emCincoDias.idade, 35);
    assert.equal(emCincoDias.aniversarioHoje, false);
    assert.equal(emCincoDias.aniversarioNoMes, true);
    assert.equal(emCincoDias.diasParaAniversario, 5);

    const jaPassou = calcularInfoAniversario('20/11/2000', hoje);
    assert.ok(jaPassou);
    assert.equal(jaPassou.idade, 26);
    assert.equal(jaPassou.aniversarioHoje, false);
    assert.equal(jaPassou.aniversarioNoMes, true);
    assert.equal(jaPassou.diasParaAniversario, 361);
  });
});

describe('extração de último produto e histórico por cliente', () => {
  it('extrai produtos de itens JSON, múltiplos itens e fallbacks legados', () => {
    assert.deepEqual(
      extrairProdutosDaVenda({
        itens: [{ descricao: 'iPhone 15 Pro Max 256GB Titânio', quantidade: 1 }],
      }),
      {
        resumo: 'iPhone 15 Pro Max 256GB Titânio',
        itens: ['iPhone 15 Pro Max 256GB Titânio'],
      }
    );

    assert.deepEqual(
      extrairProdutosDaVenda({
        itens: [
          { descricao: 'iPhone 14 128GB', quantidade: 1 },
          { descricao: 'Capinha MagSafe', quantidade: 2 },
        ],
      }),
      {
        resumo: 'iPhone 14 128GB (+1 item)',
        itens: ['iPhone 14 128GB', 'Capinha MagSafe (x2)'],
      }
    );

    assert.deepEqual(
      extrairProdutosDaVenda({
        itens: [],
        aparelhoDescricao: 'Samsung Galaxy S24 Ultra 512GB',
      }),
      {
        resumo: 'Samsung Galaxy S24 Ultra 512GB',
        itens: ['Samsung Galaxy S24 Ultra 512GB'],
      }
    );

    assert.deepEqual(
      extrairProdutosDaVenda({
        descricao: 'Venda Gerada por IA - iPhone 13 128GB Preto',
      }),
      {
        resumo: 'iPhone 13 128GB Preto',
        itens: ['iPhone 13 128GB Preto'],
      }
    );
  });

  it('mapeia último produto comprado ignorando vendas canceladas e inativas', () => {
    const clientes = [
      { id: 'cli-1', nome: 'Maria Clara Souza' },
      { id: 'cli-2', nome: 'João Pedro Lima' },
      { id: 'cli-3', nome: 'Ana Sem Compras' },
    ];

    const vendas = [
      // Venda antiga da Maria por ID
      {
        id: 'v-1',
        clienteId: 'cli-1',
        clienteNome: 'Maria Clara Souza',
        itens: [{ descricao: 'iPhone 13 128GB', quantidade: 1 }],
        valor: 3200,
        dataPagamento: '2025-06-10T14:00:00Z',
        status: 'pago',
        ativo: true,
      },
      // Venda mais recente da Maria — deve ser o último produto
      {
        id: 'v-2',
        clienteId: 'cli-1',
        clienteNome: 'Maria Clara Souza',
        itens: [{ descricao: 'iPhone 16 Pro 256GB', quantidade: 1 }],
        valor: 7490,
        dataPagamento: '2026-10-15T18:30:00Z',
        status: 'pago',
        ativo: true,
      },
      // Venda ainda mais recente da Maria, mas CANCELADA — deve ser ignorada
      {
        id: 'v-3',
        clienteId: 'cli-1',
        clienteNome: 'Maria Clara Souza',
        itens: [{ descricao: 'iPhone 16 Pro Max Cancelado', quantidade: 1 }],
        valor: 8990,
        dataPagamento: '2026-11-20T10:00:00Z',
        status: 'cancelado',
        ativo: true,
      },
      // Venda do João sem clienteId (fallback por nome sem acento)
      {
        id: 'v-4',
        clienteId: null,
        clienteNome: 'joao pedro lima',
        aparelhoDescricao: 'AirPods Pro 2',
        valor: 1590,
        dataPagamento: '2026-09-01T12:00:00Z',
        status: 'pago',
        ativo: true,
      },
      // Venda genérica — nunca deve ser atribuída
      {
        id: 'v-5',
        clienteId: null,
        clienteNome: 'Cliente Balcão',
        aparelhoDescricao: 'Película 3D',
        valor: 50,
        dataPagamento: '2026-11-22T12:00:00Z',
        status: 'pago',
        ativo: true,
      },
    ];

    const mapa = mapearComprasPorCliente(clientes, vendas);

    const maria = mapa.get('cli-1');
    assert.ok(maria);
    assert.equal(maria.ultimoProduto, 'iPhone 16 Pro 256GB');
    assert.equal(maria.totalCompras, 2);
    assert.equal(maria.totalGasto, 10690);
    assert.equal(maria.valorUltimaCompra, 7490);
    assert.equal(maria.historico.length, 2);

    const joao = mapa.get('cli-2');
    assert.ok(joao);
    assert.equal(joao.ultimoProduto, 'AirPods Pro 2');
    assert.equal(joao.totalCompras, 1);

    assert.equal(mapa.get('cli-3'), undefined);
  });

  it('evita atribuir vendas sem clienteId quando há homônimos', () => {
    const clientes = [
      { id: 'cli-a', nome: 'Carlos Silva' },
      { id: 'cli-b', nome: 'Carlos Silva' },
    ];
    const vendas = [
      {
        id: 'v-sem-id',
        clienteId: null,
        clienteNome: 'Carlos Silva',
        aparelhoDescricao: 'iPhone 15',
        valor: 5000,
        dataPagamento: '2026-10-01T10:00:00Z',
        status: 'pago',
      },
      {
        id: 'v-com-id',
        clienteId: 'cli-b',
        clienteNome: 'Carlos Silva',
        aparelhoDescricao: 'iPhone 16',
        valor: 6500,
        dataPagamento: '2026-10-02T10:00:00Z',
        status: 'pago',
      },
    ];

    const mapa = mapearComprasPorCliente(clientes, vendas);
    assert.equal(mapa.get('cli-a'), undefined);
    assert.equal(mapa.get('cli-b')?.ultimoProduto, 'iPhone 16');
  });
});

describe('utilitários de apresentação do cliente', () => {
  it('identifica emails placeholder e gera links de WhatsApp e iniciais', () => {
    assert.equal(emailEhPlaceholder('sem@email.com'), true);
    assert.equal(emailEhPlaceholder('joao@sem-email.local'), true);
    assert.equal(emailEhPlaceholder(''), true);
    assert.equal(emailEhPlaceholder('joao@gmail.com'), false);

    assert.equal(montarLinkWhatsappCliente('(11) 99999-8888', 'João Silva'), 'https://wa.me/5511999998888');
    assert.ok(
      montarLinkWhatsappCliente('11999998888', 'Maria Clara', true)?.includes('Feliz%20anivers%C3%A1rio')
    );
    assert.equal(montarLinkWhatsappCliente('12345', 'Curto'), null);

    assert.equal(obterIniciaisCliente('Maria Clara Souza'), 'MS');
    assert.equal(obterIniciaisCliente('João'), 'JO');
  });
});
