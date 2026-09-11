'use client';

import dynamic from 'next/dynamic';

/**
 * Página de TESTE: /assinar com abertura 3D controlada pelo scroll.
 * A /assinar original continua igual; esta rota só a envolve na experiência.
 *
 * Carregada só no navegador: a cena precisa saber o tamanho da tela e o suporte
 * a 3D antes do primeiro desenho, para não trocar de layout depois de aparecer.
 */
const AssinarExperience = dynamic(
  () => import('@/components/assinar/AssinarExperience').then((m) => m.AssinarExperience),
  { ssr: false, loading: () => <div className="min-h-screen bg-slate-950" aria-busy="true" /> }
);

export default function AssinarTeste3dPage() {
  return <AssinarExperience />;
}
