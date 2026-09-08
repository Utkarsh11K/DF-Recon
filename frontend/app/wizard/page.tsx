'use client';
import { Suspense } from 'react';
import { WizardShell } from './WizardShell';

export default function WizardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading wizard…</div>}>
      <WizardShell />
    </Suspense>
  );
}
