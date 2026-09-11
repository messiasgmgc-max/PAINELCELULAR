'use client';

import { createContext, useContext } from 'react';

/**
 * Quanto movimento a /assinar pode ter.
 *  - completo: animações automáticas, tilt, giroscópio, contadores.
 *  - reduzido: o sistema pediu menos movimento. Nada anda sozinho; o que a
 *    pessoa arrasta (slider, iPhone) continua funcionando.
 *  - previa: cópia sem interação dentro da tela do notebook. Tudo parado no
 *    estado final, sem ouvintes, para não pesar e bater pixel a pixel.
 */
export type ModoMovimento = 'completo' | 'reduzido' | 'previa';

const ContextoMovimento = createContext<ModoMovimento>('completo');

export const MovimentoProvider = ContextoMovimento.Provider;

export function useModoMovimento(): ModoMovimento {
  return useContext(ContextoMovimento);
}
