import type { Metadata } from 'next';
import './globals.css';
import { StoreProvider } from '@/lib/store';
import { ToastProvider } from '@/components/ui/Toast';
import { AppLayout } from '@/components/layout/AppLayout';

export const metadata: Metadata = {
  title: 'DF-Recon – Enterprise Data Reconciliation Platform',
  description: 'Production-grade data reconciliation, migration, and audit platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased">
        <StoreProvider>
          <ToastProvider>
            <AppLayout>
              {children}
            </AppLayout>
          </ToastProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
