import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  consumirPreselecaoEtiquetas,
  guardarPreselecaoEtiquetas,
  idsParaEtiquetar,
  semEtiqueta,
} from './pendentes';

function memoria() {
  const dados = new Map<string, string>();
  return {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    removeItem: (k: string) => void dados.delete(k),
  };
}

describe('Etiquetas pendentes', () => {
  it('sem etiqueta é contador zerado ou ausente', () => {
    assert.ok(semEtiqueta({}));
    assert.ok(semEtiqueta({ etiquetas_impressas: 0 }));
    assert.ok(semEtiqueta({ etiquetas_impressas: null }));
    assert.equal(semEtiqueta({ etiquetas_impressas: 2 }), false);
    assert.equal(semEtiqueta({ etiquetasImpressas: 1 }), false);
    assert.equal(semEtiqueta(null), false);
  });

  it('lista aplicada: novos e existentes nunca etiquetados, sem repetir', () => {
    const ids = idsParaEtiquetar({
      idsCriados: ['n1', 'n2'],
      atualizados: [
        { id: 'e1', etiquetas_impressas: 0 },
        { id: 'e2', etiquetas_impressas: 3 },
        { id: 'n1' },
      ],
    });
    assert.deepEqual(ids, ['n1', 'n2', 'e1']);
  });

  it('pré-seleção é lida uma vez só', () => {
    const armazenamento = memoria();
    guardarPreselecaoEtiquetas(['a', 'b'], armazenamento, 1000);
    assert.deepEqual(consumirPreselecaoEtiquetas(armazenamento, 2000), ['a', 'b']);
    assert.equal(consumirPreselecaoEtiquetas(armazenamento, 3000), null);
  });

  it('pré-seleção antiga ou quebrada é ignorada', () => {
    const armazenamento = memoria();
    guardarPreselecaoEtiquetas(['a'], armazenamento, 0);
    assert.equal(consumirPreselecaoEtiquetas(armazenamento, 16 * 60 * 1000), null);

    armazenamento.setItem('phonecenter:etiquetas:preselecao', '{quebrado');
    assert.equal(consumirPreselecaoEtiquetas(armazenamento, 0), null);
    assert.equal(consumirPreselecaoEtiquetas(null), null);
  });
});
