import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { Poppins, PT_Sans } from 'next/font/google';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/toaster';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { FirebaseClientProvider } from '@/firebase';

const fontSans = PT_Sans({ 
  subsets: ['latin'], 
  variable: '--font-sans',
  weight: ['400', '700']
});

const fontHeadline = Poppins({
  subsets: ['latin'],
  variable: '--font-headline',
  weight: ['400', '600', '700']
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
      </head>
      <body className={cn('min-h-screen flex flex-col bg-background font-sans antialiased', fontSans.variable, fontHeadline.variable)}>
        <FirebaseClientProvider>
            <Header />
            <main className="flex-1">
              {children}
            </main>
            {!hideFooter && <Footer />}
            <Toaster />
        </FirebaseClientProvider>
      </body>
    </html>
  )
}
