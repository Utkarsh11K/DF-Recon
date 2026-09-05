'use client';
import { useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Key, ShieldCheck, FilterX, GitMerge,
  Eye, Activity, Download, CheckCircle2, ChevronRight
} from 'lucide-react';
import type { WizardStep } from '@/lib/types';
import type { WizardContext } from './steps/shared';

import { StepDiscovery }     from './steps/StepDiscovery';
import { StepKeyDetection }  from './steps/StepKeyDetection';
import { StepRules }         from './steps/StepRules';
import { StepExclusions }    from './steps/StepExclusions';
import { StepMapping }       from './steps/StepMapping';
import { StepPreLoad }       from './steps/StepPreLoad';
import { StepReconciliation }from './steps/StepReconciliation';
import { StepExport }        from './steps/StepExport';

const WIZARD_STEPS: { id: WizardStep; label: string; short: string; icon: React.ElementType }[] = [
  { id: 'discovery',      label: 'Discovery',      short: '1', icon: Upload },
  { id: 'key-detection',  label: 'Key Detection',  short: '2', icon: Key },
  { id: 'rules',          label: 'Rules & Quality', short: '3', icon: ShieldCheck },
  { id: 'exclusions',     label: 'Exclusions',     short: '4', icon: FilterX },
  { id: 'mapping',        label: 'Mapping',         short: '5', icon: GitMerge },
  { id: 'pre-load',       label: 'Pre-Load',        short: '6', icon: Eye },
  { id: 'reconciliation', label: 'Reconciliation',  short: '7', icon: Activity },
  { id: 'export',         label: 'Report Export',   short: '8', icon: Download },
];

export function WizardShell() {
  const searchParams = useSearchParams();
  const batchIdParam = searchParams.get('batchId');
  const { state, dispatch, addAudit } = useStore();

  const existingBatch = batchIdParam ? state.batches.find(b => b.id === batchIdParam) : null;
  const [activeBatchId, setActiveBatchId] = useState<string | null>(existingBatch?.id ?? null);
  const activeBatch = (activeBatchId ? state.batches.find(b => b.id === activeBatchId) : null) ?? null;

  const [currentStep, setCurrentStep] = useState<WizardStep>(
    existingBatch?.wizardStep ?? 'discovery'
  );

  // ── Shared wizard context (data flowing step→step) ──────────────────────────
  const [wizardCtx, setWizardCtx] = useState<WizardContext>({
    sourceKey: '',
    targetKey: '',
    keyConfidence: 0,
  });

  const patchCtx = useCallback((patch: Partial<WizardContext>) => {
    setWizardCtx(prev => ({ ...prev, ...patch }));
  }, []);

  const stepIndex = WIZARD_STEPS.findIndex(s => s.id === currentStep);

  // Every step tab is always clickable
  const goToStep = useCallback((step: WizardStep) => setCurrentStep(step), []);

  const advanceStep = useCallback((batchId?: string) => {
    const id = batchId ?? activeBatchId;
    const next = WIZARD_STEPS[stepIndex + 1];
    if (!next) return;
    if (id) {
      const batch = state.batches.find(b => b.id === id);
      if (batch) {
        const completedSteps = Array.from(new Set([...batch.completedSteps, currentStep])) as WizardStep[];
        dispatch({
          type: 'UPDATE_BATCH',
          payload: {
            ...batch, wizardStep: next.id, completedSteps,
            status: next.id === 'export' ? 'completed' : 'in_progress',
            updatedAt: new Date().toISOString(),
          },
        });
        addAudit(
          `WIZARD_STEP_${currentStep.toUpperCase().replace(/-/g, '_')}`,
          'Batch', id, batch.name,
          `Completed step: ${WIZARD_STEPS[stepIndex].label}`
        );
      }
    }
    setCurrentStep(next.id);
  }, [activeBatchId, stepIndex, currentStep, state.batches, dispatch, addAudit]);

  const goBack = useCallback(() => {
    const prev = WIZARD_STEPS[stepIndex - 1];
    if (prev) setCurrentStep(prev.id);
  }, [stepIndex]);

  const stepProps = {
    batch: activeBatch,
    onBatchCreated: (id: string) => setActiveBatchId(id),
    onAdvance: advanceStep,
    onBack: goBack,
    wizardCtx,
    onCtxChange: patchCtx,
  };

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* ── Top step progress bar — every tab always clickable ── */}
      <div className="bg-white border-b border-slate-200 px-4 lg:px-6 py-3 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {WIZARD_STEPS.map((step, idx) => {
            const isCompleted = activeBatch?.completedSteps.includes(step.id) ?? false;
            const isCurrent   = currentStep === step.id;
            return (
              <div key={step.id} className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => goToStep(step.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 whitespace-nowrap cursor-pointer',
                    isCurrent   ? 'bg-indigo-600 text-white shadow-sm'
                    : isCompleted ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                  )}
                >
                  {isCompleted && !isCurrent ? <CheckCircle2 size={13} /> : <step.icon size={13} />}
                  <span className="hidden sm:inline">{step.label}</span>
                  <span className="sm:hidden">{step.short}</span>
                </button>
                {idx < WIZARD_STEPS.length - 1 && <ChevronRight size={12} className="text-slate-300 shrink-0" />}
              </div>
            );
          })}
        </div>
        {activeBatch && (
          <p className="text-xs text-slate-400 mt-2">
            Batch: <span className="font-medium text-slate-600">{activeBatch.name}</span>
            {wizardCtx.sourceKey && (
              <span className="ml-3">
                Key: <span className="font-mono text-indigo-600">{wizardCtx.sourceKey}</span>
                {' → '}
                <span className="font-mono text-violet-600">{wizardCtx.targetKey}</span>
              </span>
            )}
          </p>
        )}
      </div>

      {/* ── Step content ── */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.18 }}
          >
            {currentStep === 'discovery'      && <StepDiscovery      {...stepProps} />}
            {currentStep === 'key-detection'  && <StepKeyDetection   {...stepProps} />}
            {currentStep === 'rules'          && <StepRules          {...stepProps} />}
            {currentStep === 'exclusions'     && <StepExclusions     {...stepProps} />}
            {currentStep === 'mapping'        && <StepMapping        {...stepProps} />}
            {currentStep === 'pre-load'       && <StepPreLoad        {...stepProps} />}
            {currentStep === 'reconciliation' && <StepReconciliation {...stepProps} />}
            {currentStep === 'export'         && <StepExport         {...stepProps} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
