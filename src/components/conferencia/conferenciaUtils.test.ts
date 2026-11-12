import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gerarTextoWhatsAppFaltantes, observacaoParaConferencia } from './conferenciaUtils';
import type { AcaoFaltante } from './types';

describe('observacaoParaConferencia', () => {
  it('remove tags técnicas e preserva observações do aparelho', () => {
    const raw = 'Obs: Face ID ok, caixa original | Bateria: 89% | ID: 12345678';
    assert.equal(observacaoParaConferencia(raw), 'Face ID ok, caixa original');
  });

  it('remove tags [MANUTENCAO:...] e BAIXA_ESTOQUE: mantendo o restante', () => {
    const raw =
      'Tela com detalhe leve\n[MANUTENCAO:status=com_tecnico|tecnico_nome=Oficina|data=2026-11-12]';
    assert.equal(observacaoParaConferencia(raw), 'Tela com detalhe leve');

    const baixa = 'BAIXA_ESTOQUE:2026-11-12T10:00:00Z:Baixa automática na conferência';
    assert.equal(observacaoParaConferencia(baixa), '');
  });
});

describe('gerarTextoWhatsAppFaltantes', () => {
  it('separa saídas por tipo e exibe bateria e observações', () => {
    const faltantes = [
      {
        id: '1',
        modelo: 'iPhone 15 Pro',
        capacidade: '256GB',
        cor: 'Natural',
        imei: '351234567891234',
        saude_bateria: '91%',
        observacoes: 'Obs: Face ID ok, caixa original | Bateria: 91%',
      },
      {
        id: '2',
        modelo: 'iPhone 13',
        capacidade: '128GB',
        cor: 'Azul',
        imei: '359876543215678',
        saudeBateria: '84',
        observacoes: 'Sem detalhes',
      },
      {
        id: '3',
        modelo: 'iPhone 14 Pro Max',
        capacidade: '256GB',
        cor: 'Roxo',
        imei: '351112223339012',
        observacoes: 'Bateria: 79% | Trocar alto-falante',
      },
      {
        id: '4',
        modelo: 'iPhone 12',
        capacidade: '64GB',
        cor: 'Preto',
        codigo: '00004455',
      },
    ];

    const acoes: Record<string, AcaoFaltante> = {
      '1': 'vendido',
      '2': 'atacado',
      '3': 'manutencao',
      '4': 'remover',
    };

    const texto = gerarTextoWhatsAppFaltantes('Lucas Imports', 45, 41, faltantes, acoes);

    assert.ok(texto.includes('CONFERÊNCIA DE ESTOQUE - LUCAS IMPORTS'));
    assert.ok(texto.includes('41 de 45 encontrados (4 faltantes)'));
    assert.ok(texto.includes('📋 Saídas: 1 Venda Varejo · 1 Atacado · 1 Manutenção · 1 Baixa/Extravio'));

    assert.ok(texto.includes('🛒 *VENDIDOS - VAREJO* (1):'));
    assert.ok(texto.includes('📦 *VENDIDOS - ATACADO* (1):'));
    assert.ok(texto.includes('🛠️ *ENCAMINHADOS PARA MANUTENÇÃO* (1):'));
    assert.ok(texto.includes('❌ *BAIXA (EXTRAVIO / PERDA)* (1):'));

    assert.ok(texto.includes('🔋 91%'));
    assert.ok(texto.includes('🔋 84%'));
    assert.ok(texto.includes('🔋 79%'));
    assert.ok(texto.includes('IMEI ...1234'));
    assert.ok(texto.includes('Cód 00004455'));

    assert.ok(texto.includes('📝 _Obs: Face ID ok, caixa original_'));
    assert.ok(texto.includes('📝 _Obs: Sem detalhes_'));
    assert.ok(texto.includes('📝 _Obs: Trocar alto-falante_'));
  });

  it('retorna mensagem de 100% conferido quando não há faltantes', () => {
    const texto = gerarTextoWhatsAppFaltantes('Lucas Imports', 30, 30, []);
    assert.ok(texto.includes('ESTOQUE 100% CONFERIDO! NENHUM FALTANTE!'));
  });
});
