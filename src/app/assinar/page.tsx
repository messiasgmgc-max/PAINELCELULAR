'use client';

import dynamic from 'next/dynamic';

/**
 * /assinar: a página de assinatura com a abertura 3D controlada pelo scroll.
 * O conteúdo e a lógica da assinatura ficam em components/assinar/AssinarPage.
 *
 * Carregada só no navegador: a cena precisa saber o tamanho da tela e o suporte
 * a 3D antes do primeiro desenho, para não trocar de layout depois de aparecer.
 */
const AssinarExperience = dynamic(
  () => import('@/components/assinar/AssinarExperience').then((m) => m.AssinarExperience),
  { ssr: false, loading: () => <div className="min-h-screen bg-slate-950" aria-busy="true" /> }
);

export default function AssinarRoute() {
  return <AssinarExperience />;
}
