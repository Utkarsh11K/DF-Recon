'use client';
import { useState, useMemo, useRef } from 'react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  FolderKanban, Plus, Search, Pencil, Trash2, Layers,
  ChevronDown, ChevronRight, Wand2, Calendar, Tag,
  MoreVertical, Eye, ArrowUpDown, FileSearch
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDate, formatPercent, statusColor, cn } from '@/lib/utils';
import { createUploadedFileRecord, getBatchKey, getFileRole, parsePathHierarchy, ROLE_PATTERNS } from '@/lib/project-files';
import type { Project, Batch, ProjectStatus, BatchStatus } from '@/lib/types';
import Link from 'next/link';

// ─── Project Form ─────────────────────────────────────────────────────────────
interface ProjectFormData { name: string; description: string; folderPath: string; status: ProjectStatus; tags: string; }

function ProjectModal({ open, onClose, initial }: {
  open: boolean; onClose: () => void; initial?: Project;
}) {
  const { dispatch, genId, addAudit, state } = useStore();
  const { toast } = useToast();
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [detectedBatches, setDetectedBatches] = useState<{name: string; moduleName?: string}[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [form, setForm] = useState<ProjectFormData>({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    folderPath: initial?.folderPath ?? '',
    status: initial?.status ?? 'active',
    tags: initial?.tags.join(', ') ?? '',
  });
  const [errors, setErrors] = useState<Partial<ProjectFormData>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleFolderPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setSelectedFiles(Array.from(files));
    const firstFile = files[0];
    const relPath = firstFile.webkitRelativePath || firstFile.name;
    const folderName = relPath.includes('/') ? relPath.split('/')[0] : relPath.split('\\')[0];
    const computedPath = `C:\\Projects\\${folderName}`;
    setForm(f => ({ ...f, folderPath: computedPath }));

    // Auto-detect batches from folder structure
    const batches = new Map<string, {name: string, moduleName?: string}>();
    for (let i = 0; i < files.length; i++) {
      const itemRelPath = files[i].webkitRelativePath || files[i].name;
      const parsed = parsePathHierarchy(itemRelPath);
      if (parsed && parsed.batchName) {
        if (!batches.has(parsed.batchName)) {
          batches.set(parsed.batchName, { name: parsed.batchName, moduleName: parsed.moduleName });
        }
      }
    }

    const batchList = Array.from(batches.values()).map(b => ({
      name: b.name,
      moduleName: b.moduleName,
    }));
    setDetectedBatches(batchList);

    toast(`Picked folder: ${folderName} (${files.length} files detected). Found ${batchList.length} batches.`, 'info');
  };

  const validate = () => {
    const e: Partial<ProjectFormData> = {};
    if (!form.name.trim()) e.name = 'Project name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    
    // Check for duplicate name if creating a new project
    if (!initial) {
      const isDuplicate = state.projects.some(p => p.name.trim().toLowerCase() === form.name.trim().toLowerCase());
      if (isDuplicate) {
        setErrors(prev => ({ ...prev, name: "A project with this name already exists" }));
        toast("A project with this name already exists", "error");
        return;
      }
    }

    setSubmitting(true);
    
    const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean);
    const now = new Date().toISOString();
    const batchIdsByName = new Map<string, string>();
    const batchesToPersist: Batch[] = [];

    if (initial) {
      const updated: Project = { ...initial, ...form, folderPath: form.folderPath.trim(), tags, updatedAt: now };
      addAudit('PROJECT_UPDATED', 'Project', initial.id, form.name, `Project "${form.name}" updated`);
      
      // Optionally add newly detected batches to existing project
      const existingBatches = state.batches.filter(b => b.projectId === initial.id).map(b => b.name);
      state.batches.filter(b => b.projectId === initial.id).forEach(batch => batchIdsByName.set(batch.name, batch.id));
      let newCount = 0;
      detectedBatches.forEach(bInfo => {
        if (!existingBatches.includes(bInfo.name)) {
          const batchId = genId();
          const batch: Batch = {
            id: batchId, projectId: initial.id, name: bInfo.name, description: `Auto-generated from folder ${bInfo.name}`,
            folderPath: form.folderPath.trim(),
            status: 'pending', createdAt: now, updatedAt: now,
            wizardStep: 'discovery', completedSteps: [],
          };
          batchesToPersist.push(batch);
          batchIdsByName.set(batch.name, batch.id);
          addAudit('BATCH_CREATED', 'Batch', batchId, bInfo.name, `Batch "${bInfo.name}" auto-created from folder structure`);
          newCount++;
        }
      });
      batchesToPersist.forEach(batch => dispatch({ type: 'ADD_BATCH', payload: batch }));
      dispatch({ type: 'UPDATE_PROJECT', payload: updated });
      if (newCount > 0) {
        dispatch({ type: 'UPDATE_PROJECT', payload: { ...updated, batchCount: updated.batchCount + newCount } });
        toast(`Added ${newCount} new batches to project!`, 'success');
      } else toast('Project updated', 'success');

      const projectToPersist = newCount > 0 ? { ...updated, batchCount: updated.batchCount + newCount } : updated;
      await persistPickedFiles(initial.id, batchIdsByName, initial.fileManifest ?? [], projectToPersist);
    } else {
      const id = genId();
      
      // CALL BACKEND API TO PARSE FOLDER STRUCTURE INTO DB
      const fd = new FormData();
      fd.append("name", form.name.trim());
      fd.append("description", form.description.trim());
      fd.append("folder_path", form.folderPath.trim());
      fd.append("status", form.status);
      fd.append("tags", tags.join(","));
      
      const filePaths = selectedFiles.map(f => f.webkitRelativePath || f.name);
      fd.append("file_paths", JSON.stringify(filePaths));
      
      let backendBatches = [];
      let backendProjectId = null;
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const res = await fetch(`${apiBase}/api/v1/projects/import-from-path`, {
          method: "POST",
          body: fd
        });
        const data = await res.json();
        
        if (!res.ok) {
          toast(data.detail || "Failed to create project on backend.", "error");
          setSubmitting(false);
          return; // Stop creation on frontend
        }
        
        if (data && data.batches) {
            backendBatches = data.batches;
        }
        if (data && data.project_id) {
            backendProjectId = data.project_id;
        }
      } catch (err) {
        console.error("Backend DB sync failed", err);
      }

      const finalProjectId = backendProjectId || id;

      // If backend returned batches, use those. Otherwise fallback to UI detection.
      const finalBatchesToCreate = backendBatches.length > 0 
          ? backendBatches.map((b: any) => ({ id: b.id, name: b.name })) 
          : detectedBatches;

      const project: Project = {
        id: finalProjectId, name: form.name.trim(), description: form.description.trim(),
        folderPath: form.folderPath.trim(),
        status: form.status, tags, batchCount: finalBatchesToCreate.length, fileManifest: [],
        createdAt: now, updatedAt: now,
      };
      dispatch({ type: 'ADD_PROJECT', payload: project });
      addAudit('PROJECT_CREATED', 'Project', finalProjectId, form.name, `Project "${form.name}" created with Folder Path: ${form.folderPath}`);
      
      finalBatchesToCreate.forEach((bInfo: { id?: string; name: string }) => {
        const batchId = bInfo.id || `${finalProjectId}_${bInfo.name}`; // Use backend ID, otherwise prefix with project id
        batchIdsByName.set(bInfo.name, batchId);
        const batch: Batch = {
          id: batchId, projectId: finalProjectId, name: bInfo.name, description: `Auto-generated from folder`,
          folderPath: form.folderPath.trim(), status: 'pending', createdAt: now, updatedAt: now,
          wizardStep: 'discovery', completedSteps: [],
        };
        batchesToPersist.push(batch);
        addAudit('BATCH_CREATED', 'Batch', batchId, bInfo.name, `Batch "${bInfo.name}" auto-created from folder structure`);
      });
      batchesToPersist.forEach(batch => dispatch({ type: 'ADD_BATCH', payload: batch }));

      if (finalBatchesToCreate.length > 0) {
        toast(`Project created with ${finalBatchesToCreate.length} auto-detected batches! Files uploading in background...`, 'success');
      } else {
        toast('Project created successfully! Files uploading in background...', 'success');
      }

      // Fire file background persistence asynchronously so popup closes instantly
      void persistPickedFiles(finalProjectId, batchIdsByName, [], project);
    }
    setSubmitting(false);
    onClose();

    async function persistPickedFiles(projectId: string, idsByName: Map<string, string>, existingManifest: Project['fileManifest'], projectBase: Project) {
      if (selectedFiles.length === 0) return;
      const records: { record: any; manifest: any }[] = [];

      for (const file of selectedFiles) {
        const relativePath = file.webkitRelativePath || file.name;
        const batchKey = getBatchKey(relativePath);
        let batchId = batchKey ? idsByName.get(batchKey) : undefined;
        if (!batchId && batchKey) {
          for (const [k, v] of idsByName.entries()) {
            if (k.toLowerCase() === batchKey.toLowerCase() || k.toLowerCase().includes(batchKey.toLowerCase()) || batchKey.toLowerCase().includes(k.toLowerCase())) {
              batchId = v;
              break;
            }
          }
        }
        if (!batchId && idsByName.size === 1) {
          batchId = idsByName.values().next().value;
        }
        const role = getFileRole(relativePath);

        try {
          const item = await createUploadedFileRecord(file, projectId, batchId, batchKey ?? file.name, role);
          records.push(item);
          dispatch({ type: 'ADD_FILE', payload: item.record });

          if (item.record.batchId && (item.record.role === 'source' || item.record.role === 'target')) {
            const batch = [...state.batches, ...batchesToPersist].find(b => b.id === item.record.batchId);
            if (batch) {
              dispatch({
                type: 'UPDATE_BATCH',
                payload: {
                  ...batch,
                  sourceFile: item.record.role === 'source' ? item.record : batch.sourceFile,
                  targetFile: item.record.role === 'target' ? item.record : batch.targetFile,
                  recordCount: item.record.role === 'source' ? item.record.rowCount : batch.recordCount,
                  updatedAt: now,
                },
              });
            }
          }
        } catch (err) {
          console.error('Failed to upload file:', file.name, err);
        }
      }

      const manifest = [...(existingManifest ?? []), ...records.map(item => item.manifest)];
      dispatch({ type: 'UPDATE_PROJECT', payload: { ...projectBase, fileManifest: manifest, updatedAt: now } });
    }
  };

  return (
    <Modal open={open} onClose={onClose}
      title={initial ? 'Edit Project' : 'New Project'}
      footer={<>
        <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button size="sm" onClick={handleSubmit} loading={submitting}>{initial ? 'Save Changes' : 'Create Project'}</Button>
      </>}
    >
      <div className="space-y-4">
        <Input label="Project Name" placeholder="e.g. CJBS Customer Migration" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))} error={errors.name} />
        
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">Folder Architecture Path</label>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="e.g. C:\\Data\\Customer_Migration_Root"
                value={form.folderPath}
                onChange={e => setForm(f => ({ ...f, folderPath: e.target.value }))}
              />
            </div>
            <input
              type="file"
              ref={folderInputRef}
              className="hidden"
              // @ts-expect-error - webkitdirectory is standard non-standard attribute for directory picking
              webkitdirectory=""
              directory=""
              multiple
              onChange={handleFolderPicked}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<FileSearch size={14} />}
              onClick={() => folderInputRef.current?.click()}
              title="Pick folder directly from computer"
            >
              Pick Folder
            </Button>
          </div>
          <p className="text-xs text-slate-400 mt-1">Select root directory directly from your computer or type path.</p>
        </div>
        <Textarea label="Description" placeholder="Describe the purpose of this project…"
          value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        <Select label="Status" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as ProjectStatus }))}>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </Select>
        <Input label="Tags" placeholder="migration, crm, finance (comma-separated)"
          value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
          hint="Separate tags with commas" />
      </div>
    </Modal>
  );
}

// ─── Batch Form ───────────────────────────────────────────────────────────────
function BatchModal({ open, onClose, projectId, initial }: {
  open: boolean; onClose: () => void; projectId: string; initial?: Batch;
}) {
  const { dispatch, genId, addAudit, state } = useStore();
  const { toast } = useToast();
  const proj = state.projects.find(p => p.id === projectId);
  const [form, setForm] = useState({ name: initial?.name ?? '', description: initial?.description ?? '', status: initial?.status ?? 'pending' as BatchStatus });
  const [errors, setErrors] = useState<{ name?: string }>({});

  const validate = () => {
    const e: { name?: string } = {};
    if (!form.name.trim()) e.name = 'Batch name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    if (initial) {
      dispatch({ type: 'UPDATE_BATCH', payload: { ...initial, ...form, updatedAt: new Date().toISOString() } });
      addAudit('BATCH_UPDATED', 'Batch', initial.id, form.name, `Batch "${form.name}" updated`);
      toast('Batch updated', 'success');
    } else {
      const id = genId();
      const batch: Batch = {
        id, projectId, name: form.name.trim(), description: form.description.trim(),
        folderPath: proj?.folderPath,
        status: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        wizardStep: 'discovery', completedSteps: [],
      };
      dispatch({ type: 'ADD_BATCH', payload: batch });
      // update project batch count
      if (proj) dispatch({ type: 'UPDATE_PROJECT', payload: { ...proj, batchCount: proj.batchCount + 1, updatedAt: new Date().toISOString() } });
      addAudit('BATCH_CREATED', 'Batch', id, form.name, `Batch "${form.name}" created`);
      toast('Batch created', 'success');
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Batch' : 'New Batch'}
      footer={<>
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={handleSubmit}>{initial ? 'Save Changes' : 'Create Batch'}</Button>
      </>}
    >
      <div className="space-y-4">
        <Input label="Batch Name" placeholder="e.g. Batch 1 – Initial Load"
          value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} error={errors.name} />
        <Textarea label="Description" placeholder="Describe the scope of this batch…"
          value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
      </div>
    </Modal>
  );
}

// ─── Batch Row ────────────────────────────────────────────────────────────────
const WIZARD_STEPS = ['discovery','key-detection','rules','exclusions','mapping','pre-load','reconciliation','export'] as const;
const STEP_LABELS: Record<string, string> = {
  'discovery': 'Discovery', 'key-detection': 'Key Detection', 'rules': 'Rules',
  'exclusions': 'Exclusions', 'mapping': 'Mapping', 'pre-load': 'Pre-Load',
  'reconciliation': 'Reconciliation', 'export': 'Export',
};

function BatchRow({ batch, onEdit, onDelete }: { batch: Batch; onEdit: () => void; onDelete: () => void }) {
  const stepIdx = WIZARD_STEPS.indexOf(batch.wizardStep as typeof WIZARD_STEPS[number]);
  const progress = batch.status === 'completed' ? 100 : Math.round((stepIdx / (WIZARD_STEPS.length - 1)) * 100);
  const statusMap: Record<BatchStatus, 'success' | 'info' | 'warning' | 'error' | 'outline'> = {
    completed: 'success', in_progress: 'info', pending: 'outline', failed: 'error',
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors rounded-lg">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
          <Layers size={14} className="text-violet-500" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-800 truncate">{batch.name}</div>
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span>{STEP_LABELS[batch.wizardStep]}</span>
            {batch.matchRate != null && <span>· {formatPercent(batch.matchRate)} match</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="hidden sm:flex items-center gap-2 w-28">
          <div className="flex-1 bg-slate-100 rounded-full h-1.5">
            <div className="h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
              style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs text-slate-400 w-8 text-right">{progress}%</span>
        </div>
        <Badge variant={statusMap[batch.status]}>{batch.status.replace('_', ' ')}</Badge>
        <Link href={`/wizard?batchId=${batch.id}`}>
          <button className="p-1.5 rounded-md hover:bg-indigo-50 text-indigo-500" title="Open Wizard">
            <Wand2 size={14} />
          </button>
        </Link>
        <button onClick={onEdit} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600" title="Edit">
          <Pencil size={14} />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500" title="Delete">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────
function ProjectCard({ project }: { project: Project }) {
  const { state, dispatch, addAudit } = useStore();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [editBatch, setEditBatch] = useState<Batch | undefined>();
  const [deleteBatch, setDeleteBatch] = useState<Batch | undefined>();

  const batches = state.batches.filter(b => b.projectId === project.id);
  const statusV: 'success' | 'info' | 'warning' | 'outline' = project.status === 'active' ? 'success' : project.status === 'completed' ? 'info' : project.status === 'paused' ? 'warning' : 'outline';

  const handleDeleteProject = () => {
    dispatch({ type: 'DELETE_PROJECT', payload: project.id });
    addAudit('PROJECT_DELETED', 'Project', project.id, project.name, `Project "${project.name}" deleted`);
    toast('Project deleted', 'info');
  };

  const handleDeleteBatch = (b: Batch) => {
    dispatch({ type: 'DELETE_BATCH', payload: b.id });
    dispatch({ type: 'UPDATE_PROJECT', payload: { ...project, batchCount: Math.max(0, project.batchCount - 1), updatedAt: new Date().toISOString() } });
    addAudit('BATCH_DELETED', 'Batch', b.id, b.name, `Batch "${b.name}" deleted`);
    toast('Batch deleted', 'info');
    setDeleteBatch(undefined);
  };

  return (
    <>
      <motion.div layout className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Project header */}
        <div className="px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <FolderKanban size={18} className="text-indigo-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-slate-900">{project.name}</h3>
                <Badge variant={statusV}>{project.status}</Badge>
              </div>
              {project.description && (
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{project.description}</p>
              )}
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Calendar size={11} /> {formatDate(project.createdAt)}
                </span>
                {project.folderPath && (
                  <span className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md font-mono" title="Folder Architecture Path">
                    <FolderKanban size={10} className="text-indigo-500" /> {project.folderPath}
                  </span>
                )}
                {project.tags.map(tag => (
                  <span key={tag} className="flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    <Tag size={9} /> {tag}
                  </span>
                ))}
                {project.repositoryPath && (
                  <span className="flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    GitHub: {project.repositoryPath}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => setShowEdit(true)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600" title="Edit project">
                <Pencil size={14} />
              </button>
              <button onClick={() => setShowDelete(true)} className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500" title="Delete project">
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* Batch summary row */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
            <button onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 transition-colors font-medium">
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {batches.length} Batch{batches.length !== 1 ? 'es' : ''}
            </button>
            <Button size="sm" variant="outline" icon={<Plus size={13} />} onClick={() => setShowBatchModal(true)}>
              Add Batch
            </Button>
          </div>
        </div>

        {/* Batches list */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-slate-100 bg-slate-50/50">
              <div className="px-3 py-2 space-y-1">
                {batches.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    No batches yet. Click &quot;Add Batch&quot; to create one.
                  </div>
                ) : batches.map(batch => (
                  <BatchRow key={batch.id} batch={batch}
                    onEdit={() => setEditBatch(batch)}
                    onDelete={() => setDeleteBatch(batch)} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <ProjectModal open={showEdit} onClose={() => setShowEdit(false)} initial={project} />
      <BatchModal open={showBatchModal} onClose={() => setShowBatchModal(false)} projectId={project.id} />
      {editBatch && <BatchModal open={!!editBatch} onClose={() => setEditBatch(undefined)} projectId={project.id} initial={editBatch} />}
      {deleteBatch && (
        <ConfirmDialog open={!!deleteBatch} onClose={() => setDeleteBatch(undefined)}
          onConfirm={() => handleDeleteBatch(deleteBatch)}
          title="Delete Batch" confirmLabel="Delete Batch"
          message={`Delete "${deleteBatch.name}"? This will also remove all associated rules, mappings and exclusions.`} />
      )}
      <ConfirmDialog open={showDelete} onClose={() => setShowDelete(false)}
        onConfirm={handleDeleteProject} title="Delete Project" confirmLabel="Delete Project"
        message={`Delete "${project.name}" and all ${batches.length} batch(es)? This cannot be undone.`} />
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const { state } = useStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'date'>('date');

  const filtered = useMemo(() => {
    let list = [...state.projects];
    if (search) list = list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase()));
    if (statusFilter !== 'all') list = list.filter(p => p.status === statusFilter);
    if (sortBy === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return list;
  }, [state.projects, search, statusFilter, sortBy]);

  return (
    <div className="p-4 lg:p-6 space-y-5 animate-fade-in">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Search projects…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
        <button onClick={() => setSortBy(s => s === 'name' ? 'date' : 'name')}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-600">
          <ArrowUpDown size={14} /> Sort: {sortBy === 'name' ? 'Name' : 'Date'}
        </button>
        <Button icon={<Plus size={15} />} onClick={() => setShowCreate(true)}>New Project</Button>
      </div>

      {/* Summary chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500">{filtered.length} project{filtered.length !== 1 ? 's' : ''}</span>
        {['active', 'in_progress', 'completed'].map(s => {
          const count = s === 'in_progress'
            ? state.batches.filter(b => b.status === 'in_progress').length
            : state.projects.filter(p => p.status === s).length;
          if (!count) return null;
          return <Badge key={s} variant={s === 'active' ? 'success' : s === 'completed' ? 'info' : 'warning'}>{count} {s.replace('_', ' ')}</Badge>;
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center py-20 text-center">
          <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
            <FolderKanban size={24} className="text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-700 mb-1">
            {search || statusFilter !== 'all' ? 'No projects match your filters' : 'No projects yet'}
          </p>
          <p className="text-xs text-slate-400 mb-4">
            {search || statusFilter !== 'all' ? 'Try adjusting your search or filters' : 'Create your first project to get started'}
          </p>
          {!search && statusFilter === 'all' && (
            <Button icon={<Plus size={14} />} size="sm" onClick={() => setShowCreate(true)}>Create First Project</Button>
          )}
        </div>
      )}

      {/* Project cards */}
      <div className="space-y-4">
        <AnimatePresence>
          {filtered.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={{ delay: i * 0.05 }}>
              <ProjectCard project={p} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <ProjectModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
