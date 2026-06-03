import type { Metadata } from 'next';
import { Providers } from './providers';
import Navbar from '@/components/Navbar';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gatepass | Scalable Event Ticketing Platform',
  description: 'A production-grade event ticketing platform with real-time capacity locking, secure QR tickets, and advanced organizer analytics.',
  keywords: 'event ticketing, stripe payments, ticket scanning, gatepass, concurrency control',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full bg-zinc-950 text-zinc-100 antialiased">
      <body className="min-h-full flex flex-col font-sans">
        <Providers>
          <Navbar />
          <main className="flex-1 flex flex-col">
            {children}
          </main>
          <footer className="border-t border-zinc-900 bg-zinc-950/60 py-6 text-center text-xs text-zinc-500 font-mono">
            &copy; {new Date().getFullYear()} Gatepass Event ticketing. Built with Next.js, Express, Postgres & Redis.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
