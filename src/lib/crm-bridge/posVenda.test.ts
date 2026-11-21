import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  REGRAS_POS_VENDA_PADRAO,
  estimarAvaliacaoAparelhoTexto,
  renderizarTemplatePosVenda,
  type TipoRegraPosVenda,
} from './posVenda';

describe('CRM Bridge — Pós-Venda Turbo & Recompra', () => {
  it('contém todas as 9 regras padrão esperadas', () => {
    const tiposEsperados: TipoRegraPosVenda[] = [
      'pos_venda_d0',
      'satisfacao_d7',
      'upgrade_d90',
      'upgrade_d180',
      'upgrade_d300',
      'garantia_d15',
      'aniversario',
      'proposta_24h',
      'os_status',
    ];

    assert.equal(REGRAS_POS_VENDA_PADRAO.length, 9);
    const tiposPresentes = REGRAS_POS_VENDA_PADRAO.map((r) => r.tipo);
    for (const tipo of tiposEsperados) {
      assert.ok(tiposPresentes.includes(tipo), `Regra ausente: ${tipo}`);
    }
  });

  it('renderiza template substituindo cliente (primeiro nome), loja, aparelho, avaliação, link Google e OS', () => {
    const msg = renderizarTemplatePosVenda(
      'Oi {{cliente}}! Da {{loja}} sobre {{aparelho}} ({{valor_avaliacao}}). Avalie: {{link_google}}. OS #{{os_numero}} -> {{os_status}}',
      {
        cliente: 'Lucas Silva',
        loja: 'PhoneCenter BH',
        aparelho: 'iPhone 15 Pro Max 256GB',
        valorAvaliacao: 5200,
        linkGoogle: 'https://g.page/r/phonecenter/review',
        osNumero: 482,
        osStatus: 'Pronto para retirada',
      }
    );

    assert.ok(msg.startsWith('Oi Lucas!'));
    assert.ok(!msg.includes('Silva'));
    assert.ok(msg.includes('PhoneCenter BH'));
    assert.ok(msg.includes('iPhone 15 Pro Max 256GB'));
    assert.match(msg, /R\$\s*5\.200,00/);
    assert.ok(msg.includes('https://g.page/r/phonecenter/review'));
    assert.ok(msg.includes('OS #482 -> Pronto para retirada'));
  });

  it('estima avaliação de upgrade para aparelho reconhecido e retorna undefined para item genérico', () => {
    const avaliacao = estimarAvaliacaoAparelhoTexto('iPhone 15 Pro Max 256GB Titânio');
    assert.ok(typeof avaliacao === 'number' && avaliacao > 0);

    const generico = estimarAvaliacaoAparelhoTexto('Cabo USB-C Genérico');
    assert.equal(generico, undefined);
  });
});
