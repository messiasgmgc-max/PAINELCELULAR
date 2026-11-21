import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  dentroHorarioComercial,
  selecionarProximoAgenteRodizio,
  type RegraRodizio,
} from './rodizio';
import { calcularDelayAntiBanMs, validarJanelaAntiBan } from './campanhas';

const REGRA_BASE: RegraRodizio = {
  setor: 'Vendas',
  ativo: true,
  estrategia: 'round_robin',
  limite_simultaneo: 3,
  respeitar_online: true,
  horario_inicio: '09:00',
  horario_fim: '19:00',
  dias_semana: [1, 2, 3, 4, 5, 6],
  agentes: ['Ana', 'Bruno'],
  ultimo_indice: -1,
};

const QUARTA_COMERCIAL = new Date(2026, 10, 18, 14, 30); // Quarta-feira 14:30
const QUARTA_NOITE = new Date(2026, 10, 18, 21, 0); // Quarta-feira 21:00
const DOMINGO = new Date(2026, 10, 22, 14, 30); // Domingo 14:30

describe('CRM Bridge — Rodízio Inteligente & Campanhas Anti-Ban', () => {
  it('verifica horário comercial e dias da semana corretamente', () => {
    assert.equal(
      dentroHorarioComercial('09:00', '19:00', [1, 2, 3, 4, 5, 6], QUARTA_COMERCIAL),
      true
    );
    assert.equal(
      dentroHorarioComercial('09:00', '19:00', [1, 2, 3, 4, 5, 6], QUARTA_NOITE),
      false
    );
    assert.equal(
      dentroHorarioComercial('09:00', '19:00', [1, 2, 3, 4, 5, 6], DOMINGO),
      false
    );
  });

  it('executa rotação round-robin completa inclusive a partir do índice 0', () => {
    const r1 = selecionarProximoAgenteRodizio(REGRA_BASE, undefined, QUARTA_COMERCIAL);
    assert.equal(r1.agenteSelecionado, 'Ana');
    assert.equal(r1.proximoIndice, 0);

    const r2 = selecionarProximoAgenteRodizio(
      { ...REGRA_BASE, ultimo_indice: r1.proximoIndice },
      undefined,
      QUARTA_COMERCIAL
    );
    assert.equal(r2.agenteSelecionado, 'Bruno');
    assert.equal(r2.proximoIndice, 1);

    const r3 = selecionarProximoAgenteRodizio(
      { ...REGRA_BASE, ultimo_indice: r2.proximoIndice },
      undefined,
      QUARTA_COMERCIAL
    );
    assert.equal(r3.agenteSelecionado, 'Ana');
    assert.equal(r3.proximoIndice, 0);
  });

  it('pula agentes offline/ocupados e agentes no limite simultâneo', () => {
    const resOffline = selecionarProximoAgenteRodizio(
      REGRA_BASE,
      {
        Ana: { status: 'offline', conversasAbertas: 0 },
        Bruno: { status: 'online', conversasAbertas: 1 },
      },
      QUARTA_COMERCIAL
    );
    assert.equal(resOffline.agenteSelecionado, 'Bruno');
    assert.equal(resOffline.proximoIndice, 1);

    const resBusyELimite = selecionarProximoAgenteRodizio(
      { ...REGRA_BASE, agentes: ['Ana', 'Bruno', 'Carla'], ultimo_indice: -1 },
      {
        Ana: { status: 'busy', conversasAbertas: 0 },
        Bruno: { status: 'online', conversasAbertas: 3 },
        Carla: { status: 'online', conversasAbertas: 2 },
      },
      QUARTA_COMERCIAL
    );
    assert.equal(resBusyELimite.agenteSelecionado, 'Carla');
    assert.equal(resBusyELimite.proximoIndice, 2);
  });

  it('retorna fallback fora_horario_comercial fora do expediente', () => {
    const fora = selecionarProximoAgenteRodizio(REGRA_BASE, undefined, QUARTA_NOITE);
    assert.equal(fora.agenteSelecionado, null);
    assert.equal(fora.motivoFallback, 'fora_horario_comercial');
  });

  it('valida janela anti-ban e calcula delay aleatório dentro dos limites', () => {
    const ok = validarJanelaAntiBan('09:00', '19:00', new Date(2026, 10, 18, 11, 0));
    assert.equal(ok.permitido, true);

    const bloqueado = validarJanelaAntiBan('09:00', '19:00', new Date(2026, 10, 18, 22, 30));
    assert.equal(bloqueado.permitido, false);
    assert.ok(bloqueado.motivo && bloqueado.motivo.length > 0);

    for (let i = 0; i < 20; i++) {
      const delay = calcularDelayAntiBanMs(25, 65);
      assert.ok(Number.isInteger(delay));
      assert.ok(delay >= 25000 && delay <= 65000, `Delay fora do intervalo: ${delay}`);
    }
  });
});
