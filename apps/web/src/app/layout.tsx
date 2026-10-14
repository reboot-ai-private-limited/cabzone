import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Cabzonee Admin',
  description: 'Cabzonee Operations & Management Console',
  icons: {
    icon: '/brand/cabzone-app-icon.png',
    apple: '/brand/cabzone-app-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface-sunken text-text antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
