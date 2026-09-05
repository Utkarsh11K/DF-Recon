import type {
  Project, Batch, UploadedFile, Rule, Exclusion, Mapping,
  ReconciliationResult, AuditEntry, ColumnProfile
} from './types';

// ── Helpers ──────────────────────────────────────────────────────────────────

const id = () => Math.random().toString(36).slice(2, 10);
const iso = (daysAgo = 0) => new Date(Date.now() - daysAgo * 86400000).toISOString();

// ── Column profiles ───────────────────────────────────────────────────────────

const customerCols: ColumnProfile[] = [
  { name: 'customer_id', dataType: 'string', nullCount: 0, uniqueCount: 1000, sampleValues: ['C001', 'C002', 'C003'], isPrimaryKeyCandidate: true },
  { name: 'first_name', dataType: 'string', nullCount: 2, uniqueCount: 812, sampleValues: ['Alice', 'Bob', 'Carol'], isPrimaryKeyCandidate: false },
  { name: 'last_name', dataType: 'string', nullCount: 1, uniqueCount: 734, sampleValues: ['Smith', 'Jones', 'Williams'], isPrimaryKeyCandidate: false },
  { name: 'email', dataType: 'string', nullCount: 15, uniqueCount: 985, sampleValues: ['alice@acme.com', 'bob@corp.net'], isPrimaryKeyCandidate: true },
  { name: 'phone', dataType: 'string', nullCount: 42, uniqueCount: 940, sampleValues: ['+44 7700 900123', '+44 7700 900456'], isPrimaryKeyCandidate: false },
  { name: 'account_balance', dataType: 'number', nullCount: 0, uniqueCount: 998, sampleValues: ['1250.00', '3400.50', '780.25'], isPrimaryKeyCandidate: false },
  { name: 'created_date', dataType: 'date', nullCount: 0, uniqueCount: 620, sampleValues: ['2024-01-15', '2024-02-20'], isPrimaryKeyCandidate: false },
  { name: 'status', dataType: 'string', nullCount: 0, uniqueCount: 4, sampleValues: ['active', 'inactive', 'pending'], isPrimaryKeyCandidate: false },
];

const transactionCols: ColumnProfile[] = [
  { name: 'txn_id', dataType: 'string', nullCount: 0, uniqueCount: 5000, sampleValues: ['TXN-0001', 'TXN-0002'], isPrimaryKeyCandidate: true },
  { name: 'cust_ref', dataType: 'string', nullCount: 0, uniqueCount: 850, sampleValues: ['C001', 'C002'], isPrimaryKeyCandidate: false },
  { name: 'amount', dataType: 'number', nullCount: 3, uniqueCount: 4820, sampleValues: ['99.99', '250.00', '1500.00'], isPrimaryKeyCandidate: false },
  { name: 'currency', dataType: 'string', nullCount: 0, uniqueCount: 6, sampleValues: ['GBP', 'USD', 'EUR'], isPrimaryKeyCandidate: false },
  { name: 'txn_date', dataType: 'date', nullCount: 0, uniqueCount: 365, sampleValues: ['2024-06-01', '2024-06-02'], isPrimaryKeyCandidate: false },
  { name: 'type', dataType: 'string', nullCount: 0, uniqueCount: 5, sampleValues: ['credit', 'debit', 'refund'], isPrimaryKeyCandidate: false },
  { name: 'description', dataType: 'string', nullCount: 120, uniqueCount: 3200, sampleValues: ['Online purchase', 'ATM withdrawal'], isPrimaryKeyCandidate: false },
];

// ── Files ─────────────────────────────────────────────────────────────────────

export const demoFiles: UploadedFile[] = [
  {
    id: 'f001',
    name: 'customers_source.csv',
    size: 245760,
    type: 'text/csv',
    uploadedAt: iso(10),
    columns: customerCols,
    rowCount: 1000,
    sampleData: [
      { customer_id: 'C001', first_name: 'Alice', last_name: 'Smith', email: 'alice@acme.com', account_balance: 1250.0, status: 'active' },
      { customer_id: 'C002', first_name: 'Bob', last_name: 'Jones', email: 'bob@corp.net', account_balance: 3400.5, status: 'active' },
      { customer_id: 'C003', first_name: 'Carol', last_name: 'Williams', email: null, account_balance: 780.25, status: 'inactive' },
    ],
  },
  {
    id: 'f002',
    name: 'customers_target.xlsx',
    size: 312480,
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    uploadedAt: iso(10),
    columns: customerCols.map(c => ({ ...c, name: c.name === 'customer_id' ? 'cust_id' : c.name })),
    rowCount: 998,
    sampleData: [
      { cust_id: 'C001', first_name: 'Alice', last_name: 'Smith', email: 'alice@acme.com', account_balance: 1250.0, status: 'ACTIVE' },
      { cust_id: 'C002', first_name: 'Bob', last_name: 'Jones', email: 'bob@corp.net', account_balance: 3400.5, status: 'ACTIVE' },
    ],
  },
  {
    id: 'f003',
    name: 'transactions_source.csv',
    size: 1048576,
    type: 'text/csv',
    uploadedAt: iso(5),
    columns: transactionCols,
    rowCount: 5000,
    sampleData: [
      { txn_id: 'TXN-0001', cust_ref: 'C001', amount: 99.99, currency: 'GBP', txn_date: '2024-06-01', type: 'debit' },
      { txn_id: 'TXN-0002', cust_ref: 'C002', amount: 250.0, currency: 'USD', txn_date: '2024-06-01', type: 'credit' },
    ],
  },
];

// ── Projects ──────────────────────────────────────────────────────────────────

export const demoProjects: Project[] = [
  {
    id: 'p001',
    name: 'CJBS Customer Migration',
    description: 'Migrate customer master data from legacy CRM to Salesforce. Full reconciliation across 1,000 records.',
    status: 'active',
    createdAt: iso(15),
    updatedAt: iso(2),
    batchCount: 2,
    tags: ['migration', 'crm', 'salesforce'],
  },
  {
    id: 'p002',
    name: 'Etairos Transaction Sync',
    description: 'Reconcile 5,000 financial transactions between source ERP and target data warehouse.',
    status: 'active',
    createdAt: iso(8),
    updatedAt: iso(1),
    batchCount: 1,
    tags: ['finance', 'erp', 'transactions'],
  },
  {
    id: 'p003',
    name: 'HR Employee Records Audit',
    description: 'Audit employee records across HR system and payroll platform.',
    status: 'completed',
    createdAt: iso(45),
    updatedAt: iso(20),
    batchCount: 3,
    tags: ['hr', 'payroll', 'audit'],
  },
];

// ── Batches ───────────────────────────────────────────────────────────────────

export const demoBatches: Batch[] = [
  {
    id: 'b001',
    projectId: 'p001',
    name: 'Batch 1 – Initial Load',
    description: 'First reconciliation batch for customer master records.',
    status: 'completed',
    createdAt: iso(12),
    updatedAt: iso(2),
    sourceFile: demoFiles[0],
    targetFile: demoFiles[1],
    wizardStep: 'export',
    completedSteps: ['discovery', 'key-detection', 'rules', 'exclusions', 'mapping', 'pre-load', 'reconciliation', 'export'],
    recordCount: 1000,
    matchRate: 97.2,
  },
  {
    id: 'b002',
    projectId: 'p001',
    name: 'Batch 2 – Delta Load',
    description: 'Incremental batch after data corrections.',
    status: 'in_progress',
    createdAt: iso(3),
    updatedAt: iso(1),
    sourceFile: demoFiles[0],
    targetFile: demoFiles[1],
    wizardStep: 'rules',
    completedSteps: ['discovery', 'key-detection'],
    recordCount: 1000,
    matchRate: undefined,
  },
  {
    id: 'b003',
    projectId: 'p002',
    name: 'Transactions Q2 2024',
    description: 'Q2 transaction reconciliation batch.',
    status: 'in_progress',
    createdAt: iso(5),
    updatedAt: iso(1),
    sourceFile: demoFiles[2],
    targetFile: undefined,
    wizardStep: 'key-detection',
    completedSteps: ['discovery'],
    recordCount: 5000,
    matchRate: undefined,
  },
];

// ── Rules ─────────────────────────────────────────────────────────────────────

export const demoRules: Rule[] = [
  {
    id: 'r001',
    batchId: 'b001',
    name: 'Email Format Validation',
    description: 'Validates that email column contains valid email addresses.',
    column: 'email',
    type: 'regex',
    severity: 'error',
    config: { pattern: '^[^@]+@[^@]+\\.[^@]+$' },
    enabled: true,
    createdAt: iso(11),
  },
  {
    id: 'r002',
    batchId: 'b001',
    name: 'Balance Non-Negative',
    description: 'Account balance must be >= 0.',
    column: 'account_balance',
    type: 'range',
    severity: 'error',
    config: { min: 0 },
    enabled: true,
    createdAt: iso(11),
  },
  {
    id: 'r003',
    batchId: 'b001',
    name: 'Status Lookup',
    description: 'Status must be one of the allowed values.',
    column: 'status',
    type: 'lookup',
    severity: 'warning',
    config: { values: ['active', 'inactive', 'pending', 'suspended'] },
    enabled: true,
    createdAt: iso(10),
  },
];

// ── Exclusions ────────────────────────────────────────────────────────────────

export const demoExclusions: Exclusion[] = [
  {
    id: 'e001',
    batchId: 'b001',
    name: 'Exclude Test Accounts',
    description: 'Remove all accounts with "test" in email address.',
    column: 'email',
    operator: 'contains',
    value: 'test',
    enabled: true,
    createdAt: iso(10),
  },
  {
    id: 'e002',
    batchId: 'b001',
    name: 'Exclude Null Emails',
    description: 'Exclude records where email is null.',
    column: 'email',
    operator: 'isNull',
    value: '',
    enabled: false,
    createdAt: iso(9),
  },
];

// ── Mappings ──────────────────────────────────────────────────────────────────

export const demoMappings: Mapping[] = [
  {
    id: 'm001',
    batchId: 'b001',
    sourceColumn: 'customer_id',
    targetColumn: 'cust_id',
    transformType: 'direct',
    transformConfig: {},
    enabled: true,
    createdAt: iso(10),
  },
  {
    id: 'm002',
    batchId: 'b001',
    sourceColumn: 'status',
    targetColumn: 'status',
    transformType: 'upper',
    transformConfig: {},
    enabled: true,
    createdAt: iso(10),
  },
  {
    id: 'm003',
    batchId: 'b001',
    sourceColumn: 'first_name',
    targetColumn: 'first_name',
    transformType: 'trim',
    transformConfig: {},
    enabled: true,
    createdAt: iso(10),
  },
  {
    id: 'm004',
    batchId: 'b001',
    sourceColumn: 'account_balance',
    targetColumn: 'account_balance',
    transformType: 'direct',
    transformConfig: {},
    enabled: true,
    createdAt: iso(10),
  },
];

// ── Reconciliation ────────────────────────────────────────────────────────────

export const demoReconciliations: ReconciliationResult[] = [
  {
    batchId: 'b001',
    runAt: iso(2),
    totalSource: 1000,
    totalTarget: 998,
    matched: 972,
    unmatchedSource: 28,
    unmatchedTarget: 26,
    matchRate: 97.2,
    discrepancies: [
      { id: 'd001', key: 'C003', field: 'email', sourceValue: '', targetValue: 'carol@old.net', type: 'value_mismatch' },
      { id: 'd002', key: 'C047', field: 'account_balance', sourceValue: '1200.00', targetValue: '1250.00', type: 'value_mismatch' },
      { id: 'd003', key: 'C198', field: 'status', sourceValue: 'inactive', targetValue: 'INACTIVE', type: 'value_mismatch' },
      { id: 'd004', key: 'C245', field: '', sourceValue: 'C245', targetValue: '', type: 'missing_target' },
      { id: 'd005', key: 'C891', field: '', sourceValue: '', targetValue: 'C891', type: 'missing_source' },
    ],
    summary: [
      { column: 'customer_id', matched: 998, mismatched: 0, missingSource: 0, missingTarget: 2 },
      { column: 'email', matched: 970, mismatched: 15, missingSource: 15, missingTarget: 0 },
      { column: 'account_balance', matched: 988, mismatched: 10, missingSource: 0, missingTarget: 2 },
      { column: 'status', matched: 964, mismatched: 34, missingSource: 0, missingTarget: 2 },
    ],
  },
];

// ── Audit Trail ───────────────────────────────────────────────────────────────

export const demoAuditEntries: AuditEntry[] = [
  { id: 'a001', timestamp: iso(0), action: 'RECONCILIATION_RUN', entity: 'Batch', entityId: 'b001', entityName: 'Batch 1 – Initial Load', user: 'System', details: 'Reconciliation completed. Match rate: 97.2%', status: 'success' },
  { id: 'a002', timestamp: iso(1), action: 'MAPPING_UPDATED', entity: 'Mapping', entityId: 'm002', entityName: 'status → status', user: 'Admin', details: 'Transform changed from direct to upper', status: 'info' },
  { id: 'a003', timestamp: iso(1), action: 'RULE_CREATED', entity: 'Rule', entityId: 'r003', entityName: 'Status Lookup', user: 'Admin', details: 'New validation rule added for status column', status: 'success' },
  { id: 'a004', timestamp: iso(2), action: 'FILE_UPLOADED', entity: 'File', entityId: 'f002', entityName: 'customers_target.xlsx', user: 'Admin', details: 'Target file uploaded (998 rows, 8 columns)', status: 'success' },
  { id: 'a005', timestamp: iso(2), action: 'FILE_UPLOADED', entity: 'File', entityId: 'f001', entityName: 'customers_source.csv', user: 'Admin', details: 'Source file uploaded (1000 rows, 8 columns)', status: 'success' },
  { id: 'a006', timestamp: iso(3), action: 'BATCH_CREATED', entity: 'Batch', entityId: 'b002', entityName: 'Batch 2 – Delta Load', user: 'Admin', details: 'New batch created in project CJBS Customer Migration', status: 'success' },
  { id: 'a007', timestamp: iso(5), action: 'PROJECT_CREATED', entity: 'Project', entityId: 'p002', entityName: 'Etairos Transaction Sync', user: 'Admin', details: 'Project created', status: 'success' },
  { id: 'a008', timestamp: iso(8), action: 'EXCLUSION_CREATED', entity: 'Exclusion', entityId: 'e001', entityName: 'Exclude Test Accounts', user: 'Admin', details: 'Exclusion rule applied: email contains "test"', status: 'success' },
  { id: 'a009', timestamp: iso(10), action: 'KEY_DETECTED', entity: 'Batch', entityId: 'b001', entityName: 'Batch 1 – Initial Load', user: 'System', details: 'Primary key detected: customer_id → cust_id (confidence: 98.4%)', status: 'success' },
  { id: 'a010', timestamp: iso(15), action: 'PROJECT_CREATED', entity: 'Project', entityId: 'p001', entityName: 'CJBS Customer Migration', user: 'Admin', details: 'Project created', status: 'success' },
];
