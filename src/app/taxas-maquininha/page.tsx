import type { Metadata } from 'next';
import Home from '../page';

export const metadata: Metadata = {
  title: 'Taxas - Simulador de Maquininha',
  description: 'Simulador rápido de parcelamento e taxas de maquininha de cartão.',
  manifest: '/manifest-taxas.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Taxas',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    apple: '/icon-192.png',
  },
};

export default function TaxasPage() {
  return <Home />;
}
