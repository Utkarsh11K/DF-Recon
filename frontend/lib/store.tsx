'use client';

import React, { createContext, useContext, useEffect, useReducer, useCallback } from 'react';
import type { AppState, Project, Batch, UploadedFile, Rule, Exclusion, Mapping, ReconciliationResult, AuditEntry } from './types';
import {
  demoProjects, demoBatches, demoFiles, demoRules,
  demoExclusions, demoMappings, demoReconciliations, demoAuditEntries
} from './demo-data';

// ── State ─────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'df-recon-state';

const emptyState: AppState = {
  projects: [],
  batches: [],
  files: [],
  rules: [],
  exclusions: [],
  mappings: [],
  reconciliations: [],
  auditEntries: [],
};

// ── Actions ───────────────────────────────────────────────────────────────────

type Action =
  | { type: 'LOAD_STATE'; payload: AppState }
  | { type: 'LOAD_DEMO' }
  | { type: 'CLEAR_WORKSPACE' }
  | { type: 'ADD_PROJECT'; payload: Project }
  | { type: 'UPDATE_PROJECT'; payload: Project }
  | { type: 'DELETE_PROJECT'; payload: string }
  | { type: 'ADD_BATCH'; payload: Batch }
  | { type: 'UPDATE_BATCH'; payload: Batch }
  | { type: 'DELETE_BATCH'; payload: string }
  | { type: 'ADD_FILE'; payload: UploadedFile }
  | { type: 'ADD_RULE'; payload: Rule }
  | { type: 'UPDATE_RULE'; payload: Rule }
  | { type: 'DELETE_RULE'; payload: string }
  | { type: 'ADD_EXCLUSION'; payload: Exclusion }
  | { type: 'UPDATE_EXCLUSION'; payload: Exclusion }
  | { type: 'DELETE_EXCLUSION'; payload: string }
  | { type: 'ADD_MAPPING'; payload: Mapping }
  | { type: 'UPDATE_MAPPING'; payload: Mapping }
  | { type: 'DELETE_MAPPING'; payload: string }
  | { type: 'ADD_RECONCILIATION'; payload: ReconciliationResult }
  | { type: 'ADD_AUDIT'; payload: AuditEntry };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOAD_STATE': return action.payload;
    case 'LOAD_DEMO': return {
      projects: demoProjects,
      batches: demoBatches,
      files: demoFiles,
      rules: demoRules,
      exclusions: demoExclusions,
      mappings: demoMappings,
      reconciliations: demoReconciliations,
      auditEntries: demoAuditEntries,
    };
    case 'CLEAR_WORKSPACE': return emptyState;
    case 'ADD_PROJECT': return { ...state, projects: [action.payload, ...state.projects] };
    case 'UPDATE_PROJECT': return { ...state, projects: state.projects.map(p => p.id === action.payload.id ? action.payload : p) };
    case 'DELETE_PROJECT': return {
      ...state,
      projects: state.projects.filter(p => p.id !== action.payload),
      batches: state.batches.filter(b => b.projectId !== action.payload),
    };
    case 'ADD_BATCH': return { ...state, batches: [action.payload, ...state.batches] };
    case 'UPDATE_BATCH': return { ...state, batches: state.batches.map(b => b.id === action.payload.id ? action.payload : b) };
    case 'DELETE_BATCH': return { ...state, batches: state.batches.filter(b => b.id !== action.payload) };
    case 'ADD_FILE': return { ...state, files: [action.payload, ...state.files] };
    case 'ADD_RULE': return { ...state, rules: [action.payload, ...state.rules] };
    case 'UPDATE_RULE': return { ...state, rules: state.rules.map(r => r.id === action.payload.id ? action.payload : r) };
    case 'DELETE_RULE': return { ...state, rules: state.rules.filter(r => r.id !== action.payload) };
    case 'ADD_EXCLUSION': return { ...state, exclusions: [action.payload, ...state.exclusions] };
    case 'UPDATE_EXCLUSION': return { ...state, exclusions: state.exclusions.map(e => e.id === action.payload.id ? action.payload : e) };
    case 'DELETE_EXCLUSION': return { ...state, exclusions: state.exclusions.filter(e => e.id !== action.payload) };
    case 'ADD_MAPPING': return { ...state, mappings: [action.payload, ...state.mappings] };
    case 'UPDATE_MAPPING': return { ...state, mappings: state.mappings.map(m => m.id === action.payload.id ? action.payload : m) };
    case 'DELETE_MAPPING': return { ...state, mappings: state.mappings.filter(m => m.id !== action.payload) };
    case 'ADD_RECONCILIATION': return { ...state, reconciliations: [action.payload, ...state.reconciliations] };
    case 'ADD_AUDIT': return { ...state, auditEntries: [action.payload, ...state.auditEntries] };
    default: return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

interface StoreContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  addAudit: (action: string, entity: string, entityId: string, entityName: string, details: string, status?: 'success' | 'error' | 'info') => void;
  genId: () => string;
  loadDemo: () => void;
  clearWorkspace: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, emptyState);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        dispatch({ type: 'LOAD_STATE', payload: JSON.parse(saved) });
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [state]);

  const genId = useCallback(() => Math.random().toString(36).slice(2, 10), []);

  const addAudit = useCallback((
    action: string,
    entity: string,
    entityId: string,
    entityName: string,
    details: string,
    status: 'success' | 'error' | 'info' = 'success'
  ) => {
    dispatch({
      type: 'ADD_AUDIT',
      payload: {
        id: Math.random().toString(36).slice(2, 10),
        timestamp: new Date().toISOString(),
        action,
        entity,
        entityId,
        entityName,
        user: 'Admin',
        details,
        status,
      },
    });
  }, []);

  const loadDemo = useCallback(() => {
    dispatch({ type: 'LOAD_DEMO' });
  }, []);

  const clearWorkspace = useCallback(() => {
    dispatch({ type: 'CLEAR_WORKSPACE' });
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <StoreContext.Provider value={{ state, dispatch, addAudit, genId, loadDemo, clearWorkspace }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
