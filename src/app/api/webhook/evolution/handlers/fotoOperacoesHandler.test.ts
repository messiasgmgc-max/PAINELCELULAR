import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarResultadoVision,
  expandirModeloEtiqueta,
  normalizarCapacidadeVision,
} from '@/lib/image-vision-ocr';
import {
  detectarVendaAtacadoComFoto,
  avaliarEstoqueVendaAtacadoComFoto,
  limparNomeModelo,
  type AparelhoEstoqueConsulta,
} from '../notinhaAutomatica';
import {
  extrairImeiCorrecaoRapida,
  ehLegendaEntradaFotoDireta,
  aplicarImeiEmAtacadoPendente,
  formatarMensagemAtacadoPendente,
  construirDadosEntradaDeVision,
  formatarResumoDadosEntradaFoto,
  executarEntradaEstoquePorFoto,
  type DadosVendaAtacadoPendente,
} from './fotoOperacoesHandler';

function criarSupabaseMockEntrada(aparelhosExistentes: any[] = []) {
  const inseridosAparelhos: any[] = [];
  const inseridosMovs: any[] = [];

  const supabase: any = {
    from(tabela: string) {
      if (tabela === 'aparelhos') {
        return {
          select() {
            return {
              eq() {
                return {
                  or() {
                    return {
                      limit() {
                        return Promise.resolve({ data: aparelhosExistentes, error: null });
                      },
                    };
                  },
                };
              },
            };
          },
          insert(registro: any) {
            const salvo = { id: `ap-new-${inseridosAparelhos.length + 1}`, ...registro };
            inseridosAparelhos.push(salvo);
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({ data: salvo, error: null });
                  },
                };
              },
            };
          },
        };
      }
      if (tabela === 'movimentacoes_estoque') {
        return {
          insert(rows: any) {
            inseridosMovs.push(...(Array.isArray(rows) ? rows : [rows]));
            return Promise.resolve({ data: rows, error: null });
          },
        };
      }
      return {
        insert: async () => ({ data: null, error: null }),
        upsert: async () => ({ data: null, error: null }),
      };
    },
  };

  return { supabase, inseridosAparelhos, inseridosMovs };
}

test('normalizarResultadoVision expande 15PM 256 e descarta IMEI cortado de 3 dígitos (887)', () => {
  const resultado = normalizarResultadoVision({
    tipo_documento: 'etiqueta_caixa',
    modelo: '15PM 256',
    capacidade: null,
    cor: null,
    imei: '887',
    saude_bateria: null,
  });

  assert.equal(resultado.modelo, 'iPhone 15 Pro Max');
  assert.equal(resultado.capacidade, '256GB');
  assert.equal(resultado.imei, null);
});

test('normalizarResultadoVision extrai 16PM, 256GB, 84%, IMEI 6147, Desert e Traseira quebrada', () => {
  const resultado = normalizarResultadoVision({
    tipo_documento: 'etiqueta_caixa',
    modelo: '16pm',
    capacidade: '256',
    cor: 'Desert Titanium',
    imei: '6147',
    saude_bateria: 84,
    observacoes: 'Traseira quebrada',
    data_entrada: '21/11',
  });

  assert.equal(resultado.modelo, 'iPhone 16 Pro Max');
  assert.equal(resultado.capacidade, '256GB');
  assert.equal(resultado.cor, 'Desert');
  assert.equal(resultado.imei, '6147');
  assert.equal(resultado.saude_bateria, 84);
  assert.equal(resultado.observacoes, 'Traseira quebrada');
  assert.equal(resultado.data_entrada, '21/11');
});

test('expandirModeloEtiqueta e limparNomeModelo tratam abreviações 16PM, 15P, 16e, 18PM', () => {
  assert.equal(expandirModeloEtiqueta('16pm').modelo, 'iPhone 16 Pro Max');
  assert.equal(expandirModeloEtiqueta('15P 128').modelo, 'iPhone 15 Pro');
  assert.equal(expandirModeloEtiqueta('15P 128').capacidadeExtraida, '128GB');
  assert.equal(expandirModeloEtiqueta('16e 256').modelo, 'iPhone 16e');
  assert.equal(expandirModeloEtiqueta('18PM 512').modelo, 'iPhone 18 Pro Max');
  assert.equal(normalizarCapacidadeVision('1t'), '1TB');
  assert.equal(limparNomeModelo('15PM 256'), 'iPhone 15 Pro Max');
});

test('detectarVendaAtacadoComFoto remove "vendido" do nome do comprador ("Edgard vendido por R$4150")', () => {
  const venda = detectarVendaAtacadoComFoto('Edgard vendido por R$4150');
  assert.ok(venda);
  assert.equal(venda.clienteNome, 'Edgard');
  assert.equal(venda.valor, 4150);
});

test('Opção A: venda atacado com etiqueta sem IMEI fica pendente e fecha ao responder "Imei 7887"', () => {
  const estoque: AparelhoEstoqueConsulta[] = [
    {
      id: 'ap-1',
      modelo: 'iPhone 15 Pro Max',
      capacidade: '256GB',
      cor: 'Natural',
      imei: '351234567891111',
      status: 'disponivel',
      ativo: true,
      custo: 3700,
    },
    {
      id: 'ap-2',
      modelo: 'iPhone 15 Pro Max',
      capacidade: '256GB',
      cor: 'Natural',
      imei: '351234567897887',
      status: 'disponivel',
      ativo: true,
      custo: 3750,
    },
  ];

  const fotoSemImei = {
    imei: '887', // 3 dígitos inválidos — deve ser ignorado
    modelo: '15PM 256',
    capacidade: '256GB',
    cor: null,
    pushName: 'Messias',
    timestamp: Date.now(),
  };

  // Sem IMEI válido e com 2 unidades no estoque → não confirma automaticamente
  const avaliacaoInicial = avaliarEstoqueVendaAtacadoComFoto([fotoSemImei], estoque);
  assert.equal(avaliacaoInicial.todosConfirmadosNoEstoque, false);

  const pendente: DadosVendaAtacadoPendente = {
    id: 'atacado-pend-1',
    lojaId: 'loja-1',
    vendaAtacado: {
      clienteNome: 'Edgard',
      valor: 4150,
      formaPagamento: 'pix',
    },
    fotos: [{ ...fotoSemImei, imei: null, modelo: 'iPhone 15 Pro Max' }],
    usuarioNome: 'Messias',
    motivoEstoque: avaliacaoInicial.itens[0].cruzamento.mensagem,
    criadoEm: Date.now(),
  };

  const msgPend = formatarMensagemAtacadoPendente(pendente);
  assert.match(msgPend, /VENDA ATACADO PENDENTE/i);
  assert.match(msgPend, /Edgard/);
  assert.match(msgPend, /4\.150,00/);

  // Usuário responde "Imei 7887"
  const imeiExtraido = extrairImeiCorrecaoRapida('Imei 7887', false);
  assert.equal(imeiExtraido, '7887');
  assert.equal(extrairImeiCorrecaoRapida('7887', false), null);
  assert.equal(extrairImeiCorrecaoRapida('7887', true), '7887');

  const { dadosAtualizados, avaliacao } = aplicarImeiEmAtacadoPendente(
    pendente,
    imeiExtraido!,
    estoque
  );
  assert.equal(avaliacao.todosConfirmadosNoEstoque, true);
  assert.equal(avaliacao.itens[0].cruzamento.aparelhoEncontrado?.id, 'ap-2');
  assert.equal(dadosAtualizados.fotos[0].imei, '7887');
});

test('Cadastro no estoque pela foto + etiqueta (16PM 256 84% 6147 Desert Traseira quebrada)', async () => {
  assert.equal(ehLegendaEntradaFotoDireta('entrada'), true);
  assert.equal(ehLegendaEntradaFotoDireta('cadastrar'), true);
  assert.equal(ehLegendaEntradaFotoDireta('Edgard vendido por R$4150'), false);

  const dados = construirDadosEntradaDeVision(
    {
      tipo_documento: 'etiqueta_caixa',
      modelo: '16pm',
      capacidade: '256',
      cor: 'Desert Titanium',
      imei: '6147',
      saude_bateria: 84,
      observacoes: 'Traseira quebrada',
      data_entrada: '21/11',
    },
    'loja-1',
    'entrada custo 4200',
    'Messias'
  );

  assert.ok(dados);
  assert.equal(dados.modelo, 'iPhone 16 Pro Max');
  assert.equal(dados.capacidade, '256GB');
  assert.equal(dados.bateria, 84);
  assert.equal(dados.imei, '6147');
  assert.equal(dados.cor, 'Desert');
  assert.equal(dados.observacoes, 'Traseira quebrada');
  assert.equal(dados.custo, 4200);
  assert.ok(dados.dataEntrada?.endsWith('-11-21'));

  const resumo = formatarResumoDadosEntradaFoto(dados);
  assert.match(resumo, /iPhone 16 Pro Max/);
  assert.match(resumo, /256GB/);
  assert.match(resumo, /84%/);
  assert.match(resumo, /6147/);
  assert.match(resumo, /Desert/);
  assert.match(resumo, /Traseira quebrada/);

  const { supabase, inseridosAparelhos, inseridosMovs } = criarSupabaseMockEntrada([]);
  const res = await executarEntradaEstoquePorFoto(supabase, 'loja-1', dados);
  assert.equal(res.sucesso, true);
  assert.equal(inseridosAparelhos.length, 1);
  assert.equal(inseridosAparelhos[0].modelo, 'iPhone 16 Pro Max');
  assert.equal(inseridosAparelhos[0].capacidade, '256GB');
  assert.equal(inseridosAparelhos[0].cor, 'Desert');
  assert.equal(inseridosAparelhos[0].imei, '6147');
  assert.equal(inseridosAparelhos[0].saude_bateria, '84%');
  assert.match(inseridosAparelhos[0].observacoes, /Traseira quebrada/);
  assert.equal(inseridosMovs.length, 1);

  // Não permite cadastrar duplicado caso o IMEI já esteja ativo no estoque
  const { supabase: supDup, inseridosAparelhos: insDup } = criarSupabaseMockEntrada([
    {
      id: 'ap-existente',
      modelo: 'iPhone 16 Pro Max',
      capacidade: '256GB',
      cor: 'Desert',
      imei: '359999999996147',
      status: 'disponivel',
      ativo: true,
    },
  ]);
  const resDup = await executarEntradaEstoquePorFoto(supDup, 'loja-1', dados);
  assert.equal(resDup.sucesso, false);
  assert.equal(resDup.duplicado, true);
  assert.equal(insDup.length, 0);
});
