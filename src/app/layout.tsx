import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { Outfit, Plus_Jakarta_Sans } from 'next/font/google';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/toaster';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { FirebaseClientProvider } from '@/firebase';
import { PassengerGlobalMonitor } from '@/components/passenger-global-monitor';

export const metadata: Metadata = {
  title: 'BharatBus',
  description: 'BharatBus Management System',
  manifest: '/manifest.json',
};

export const viewport = {
  themeColor: '#2563eb',
};

const fontSans = Outfit({ 
  subsets: ['latin'], 
  variable: '--font-sans',
  weight: ['300', '400', '500', '600', '700']
});

const fontHeadline = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-headline',
  weight: ['400', '600', '700', '800']
});

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerList = await headers();
  const pathname = headerList.get('x-pathname') || '';
  const hideFooter = pathname.startsWith('/book');

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>BharatBus - Your Journey, Your Way</title>
        <meta name="description" content="Search, book, and manage your bus tickets with ease. AI-powered travel planning included." />
        <link
            rel="stylesheet"
            href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
            integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
            crossOrigin=""
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined') {
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then(function(regs) {
                    for (var r of regs) { r.unregister(); }
                  });
                }
                if ('caches' in window) {
                  caches.keys().then(function(names) {
                    for (var n of names) { caches.delete(n); }
                  });
                }
              }
            `,
          }}
        />
      </head>
      <body className={cn('min-h-screen flex flex-col bg-background font-sans antialiased', fontSans.variable, fontHeadline.variable)}>
        <FirebaseClientProvider>
            <Header />
            <main className="flex-1">
              {children}
            </main>
            {!hideFooter && <Footer />}
            <Toaster />
            <PassengerGlobalMonitor />
        </FirebaseClientProvider>
      </body>
    </html>
  )
}
