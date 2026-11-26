import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Bricolage_Grotesque, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';

// Fuentes auto-hospedadas por Next.js: se descargan en build y se sirven
// desde el mismo dominio. Elimina la petición bloqueante a fonts.googleapis.com
// (Lighthouse móvil: -1770 ms en render-blocking) y elimina la dependencia
// externa del CSP.
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-bricolage',
  weight: ['500', '700'],
});

const plex = IBM_Plex_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-plex',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'Reserva de Salas',
  description: 'Sistema de Gestión y Reserva de Salas, Laboratorios y Auditorios',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon.svg',
    apple: '/icons/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#dc2626',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning className={`${bricolage.variable} ${plex.variable}`}>
      <body>
        {children}
        <Script id="sw-register" strategy="afterInteractive">
          {`if ('serviceWorker' in navigator) {
            window.addEventListener('load', function () {
              navigator.serviceWorker.register('/sw.js').catch(function () {});
            });
          }`}
        </Script>
      </body>
    </html>
  );
}
