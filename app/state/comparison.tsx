"use client";
import React, { createContext, useCallback, useContext, useMemo, useReducer } from "react";
import { useLocalStorage } from "~/hooks/use-local-storage";

export type ComparisonFile = { id: string; name: string; size: number; vendorName?: string; storageId?: string; uploading?: boolean };
export type SortState = { columnIndex: number; direction: "asc" | "desc" } | null;
export type FiltersState = {
  query: string;
  categories: Record<string, boolean>;
  showDifferencesOnly: boolean;
  showRedFlagsOnly: boolean;
  showPinnedOnly: boolean;
  showSignificantOnly: boolean;
  significancePercent: number; // soglia differenza per considerare "significativo"
  priority: "Performance" | "Compliance" | "Pricing";
};

export type ComparisonTable = {
  columns: string[]; // ["Metrica", ...fileNames]
  vendorMeta: { vendor: string; source: string; docId: string; dateParsed: number }[];
  rows: { key: string; type: "numeric" | "boolean" | "text"; category: string; values: (string | number | boolean | null)[] }[];
  sort: SortState;
  filters: FiltersState;
  pinnedKeys: string[];
};

export type ArchiveItem = {
  id: string;
  name: string;
  createdAt: number;
  files: ComparisonFile[];
  table: ComparisonTable;
};

type Processing = { step: 0 | 1 | 2 | 3; running: boolean };

type UnitsPreferences = {
  throughput?: "mbps" | "gbps";
  storage?: "gb" | "tb";
  latency?: "ms" | "s";
};

type SynonymsMap = Record<string, string>; // termine -> canonico

type State = {
  files: ComparisonFile[];
  hasResults: boolean;
  processing: Processing;
  table: ComparisonTable | null;
  archive: ArchiveItem[];
  units: UnitsPreferences;
  synonyms: SynonymsMap;
};

type Action =
  | { type: "ADD_FILES"; files: ComparisonFile[] }
  | { type: "REMOVE_FILE"; id: string }
  | { type: "SET_RESULTS"; has: boolean }
  | { type: "SET_PROCESSING"; processing: Processing }
  | { type: "SET_TABLE"; table: ComparisonTable | null }
  | { type: "SET_TABLE_SORT"; sort: SortState }
  | { type: "SET_TABLE_FILTERS"; filters: FiltersState }
  | { type: "ARCHIVE_ADD"; item: ArchiveItem }
  | { type: "ARCHIVE_DELETE"; id: string }
  | { type: "SET_UNITS"; units: UnitsPreferences }
  | { type: "SET_SYNONYMS"; synonyms: SynonymsMap };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD_FILES": {
      const existing = new Map(state.files.map((f) => [f.id, f] as const));
      action.files.forEach((f) => existing.set(f.id, f));
      return { ...state, files: Array.from(existing.values()) };
    }
    case "REMOVE_FILE":
      return { ...state, files: state.files.filter((f) => f.id !== action.id) };
    case "SET_RESULTS":
      return { ...state, hasResults: action.has };
    case "SET_PROCESSING":
      return { ...state, processing: action.processing };
    case "SET_TABLE":
      return { ...state, table: action.table };
    case "SET_TABLE_SORT":
      return state.table ? { ...state, table: { ...state.table, sort: action.sort } } : state;
    case "SET_TABLE_FILTERS":
      return state.table ? { ...state, table: { ...state.table, filters: action.filters } } : state;
    case "ARCHIVE_ADD":
      return { ...state, archive: [action.item, ...state.archive].slice(0, 100) };
    case "ARCHIVE_DELETE":
      return { ...state, archive: state.archive.filter((a) => a.id !== action.id) };
    case "SET_UNITS":
      return { ...state, units: { ...state.units, ...action.units } };
    case "SET_SYNONYMS":
      return { ...state, synonyms: action.synonyms };
    default:
      return state;
  }
}

const defaultFilters: FiltersState = {
  query: "",
  categories: { Performance: true, Pricing: true, Compliance: true, Supporto: true, SDK: true },
  showDifferencesOnly: false,
  showRedFlagsOnly: false,
  showPinnedOnly: false,
  showSignificantOnly: false,
  significancePercent: 10,
  priority: "Performance",
};

function toTitleCaseVendor(fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, "").replace(/[-_]/g, " ").trim();
  return base
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

const MIN_IS_BETTER = new Set(["Monthly Price ($)", "Support Response (hrs)"]);

function buildMockTable(files: ComparisonFile[], synonyms: SynonymsMap): ComparisonTable {
  const vendors = files.map((f) => f.vendorName?.trim() || toTitleCaseVendor(f.name));
  const columns = ["Metrica", ...vendors];
  const vendorMeta = files.map((f, i) => ({
    vendor: vendors[i] || `Vendor ${i + 1}`,
    source: f.name,
    docId: `${Date.now()}-${i}`,
    dateParsed: Date.now(),
  }));

  const normalize = (term: string) => synonyms[term] || term;
  // Profiles: 0 High-Perf, 1 Balanced, 2 Budget, others random around
  const profile = (idx: number) => (idx % 3 === 0 ? "high" : idx % 3 === 1 ? "balanced" : "budget");

  const metric = (key: string, category: string, type: "numeric" | "boolean" | "text", values: any[]) => ({
    key: normalize(key),
    category,
    type,
    values: values.slice(0, files.length),
  });

  const numericByProfile = (base: { high: number; balanced: number; budget: number }, jitter = 0) =>
    vendors.map((_, i) => {
      const p = profile(i);
      const val = p === "high" ? base.high : p === "balanced" ? base.balanced : base.budget;
      const j = jitter ? (Math.random() * 2 - 1) * jitter : 0;
      return Math.max(0, Math.round((val + j) * 100) / 100);
    });

  const booleanByProfile = (base: { high: boolean; balanced: boolean; budget: boolean }) =>
    vendors.map((_, i) => (profile(i) === "high" ? base.high : profile(i) === "balanced" ? base.balanced : base.budget));

  const pickFrom = (arr: string[], nMin: number, nMax: number) => {
    const n = Math.min(arr.length, Math.max(nMin, Math.floor(Math.random() * (nMax - nMin + 1)) + nMin));
    const copy = [...arr];
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * copy.length);
      out.push(copy.splice(idx, 1)[0]);
    }
    return out.join(", ");
  };

  const rows = [
    metric("Throughput (req/s)", "Performance", "numeric", numericByProfile({ high: 2000, balanced: 1200, budget: 700 }, 150)),
    metric("Concurrent Flags", "Performance", "numeric", numericByProfile({ high: 1000, balanced: 600, budget: 300 }, 50)),
    metric("SDKs Supported (count)", "SDK", "numeric", numericByProfile({ high: 12, balanced: 8, budget: 5 }, 1)),
    metric("Max Environments", "Performance", "numeric", numericByProfile({ high: 12, balanced: 8, budget: 6 }, 1)),
    metric("Evaluations/ms", "Performance", "numeric", numericByProfile({ high: 150, balanced: 90, budget: 60 }, 5)),
    metric("Data Retention (days)", "Performance", "numeric", numericByProfile({ high: 365, balanced: 180, budget: 90 }, 10)),
    metric("Uptime SLA (%)", "Compliance", "numeric", numericByProfile({ high: 99.99, balanced: 99.9, budget: 99.5 }, 0.05)),
    metric("Monthly Price ($)", "Pricing", "numeric", numericByProfile({ high: 199, balanced: 99, budget: 49 }, 5)),
    metric("Seats Included", "Pricing", "numeric", numericByProfile({ high: 50, balanced: 20, budget: 10 }, 2)),
    metric("Support Response (hrs)", "Supporto", "numeric", numericByProfile({ high: 2, balanced: 8, budget: 24 }, 1)),

    metric("Audit Logs", "Compliance", "boolean", booleanByProfile({ high: true, balanced: true, budget: false })),
    metric("SAML/SSO", "Compliance", "boolean", booleanByProfile({ high: true, balanced: true, budget: false })),
    metric("SOC2", "Compliance", "boolean", booleanByProfile({ high: true, balanced: true, budget: false })),
    metric("GDPR", "Compliance", "boolean", booleanByProfile({ high: true, balanced: true, budget: true })),
    metric("On-Prem / Self-Host", "Compliance", "boolean", booleanByProfile({ high: true, balanced: false, budget: false })),

    metric("Pricing Model", "Pricing", "text", vendors.map((_, i) => (profile(i) === "high" ? "Usage-Based" : profile(i) === "balanced" ? "Tiered" : "Flat"))),
    metric("SLA Tier", "Compliance", "text", vendors.map((_, i) => (profile(i) === "high" ? "Enterprise" : profile(i) === "balanced" ? "Premium" : "Standard"))),
    metric("Flag Types", "SDK", "text", vendors.map(() => pickFrom(["Boolean", "Multivariant", "Dynamic"], 2, 3))),
    metric("Rollout Strategies", "SDK", "text", vendors.map(() => pickFrom(["Gradual", "Targeted", "A/B", "Rules"], 2, 4))),
    metric("Environments", "SDK", "text", vendors.map(() => pickFrom(["Dev", "Staging", "Prod"], 2, 3))),
    metric("SDK Languages", "SDK", "text", vendors.map(() => pickFrom(["Java", "JS", "Python", "Go", "Swift", "Ruby", "C#"], 3, 6))),
  ];

  return { columns, vendorMeta, rows, sort: null, filters: defaultFilters, pinnedKeys: [] };
}

// --- Backend integration (Convex HTTP) ---
const API_BASE: string = (import.meta as any).env?.VITE_CONVEX_URL || "";
const DISABLE_MOCKS: boolean = ((import.meta as any).env?.VITE_DISABLE_MOCKS || "true").toString() === "true";

async function getUploadUrl(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/upload-url`);
  if (!res.ok) throw new Error("Upload URL non disponibile");
  const data = await res.json();
  return data.url as string;
}

async function uploadPdfToStorage(file: File): Promise<string> {
  const url = await getUploadUrl();
  const up = await fetch(url, { method: "POST", body: file });
  if (!up.ok) throw new Error("Upload fallito");
  const json = await up.json();
  if (!json.storageId) throw new Error("storageId mancante");
  return json.storageId as string;
}

type BackendDataset = {
  vendors: { id: string; name: string }[];
  metrics: { metric_id: string; label: string; optimality?: "max" | "min" }[];
  matrix: Record<string, Record<string, any>>;
  deltas: Record<string, number | null>;
  best_vendor_by_metric: Record<string, string | null>;
  missing_flags: Record<string, Record<string, boolean>>;
  synonym_map_version?: string;
};

function buildTableFromDataset(ds: BackendDataset): ComparisonTable {
  const vendorOrder = ds.vendors.map((v) => v.id);
  const columns = ["Metrica", ...ds.vendors.map((v) => v.name)];
  const vendorMeta = ds.vendors.map((v) => ({ vendor: v.name, source: v.name, docId: v.id, dateParsed: Date.now() }));
  const rows = ds.metrics.map((m) => {
    const values = vendorOrder.map((vid) => {
      const cell = ds.matrix?.[m.metric_id]?.[vid] ?? null;
      if (!cell) return null;
      const val = cell.value_normalized ?? cell.value ?? null;
      const unit = cell.unit_normalized ?? cell.unit ?? undefined;
      if (typeof val === "number") return val;
      if (typeof val === "boolean") return val;
      if (val === null) return null;
      return unit ? `${val} ${unit}` : String(val);
    });
    const type: "numeric" | "boolean" | "text" = values.every((v) => typeof v === "number" || v === null)
      ? "numeric"
      : values.every((v) => typeof v === "boolean" || v === null)
      ? "boolean"
      : "text";
    return { key: m.label, category: "Performance", type, values };
  });
  return { columns, vendorMeta, rows, sort: null, filters: defaultFilters, pinnedKeys: [] };
}

type Ctx = {
  state: State;
  addFiles: (files: FileList | File[]) => void;
  removeFile: (id: string) => void;
  renameVendor: (fileId: string, vendorName: string) => void;
  startProcessing: () => Promise<void>;
  regenerateTable: () => void;
  setSort: (sort: SortState) => void;
  setFilters: (filters: FiltersState) => void;
  exportCSV: () => void;
  copyKeynote: () => Promise<void>;
  saveToArchive: (name: string) => void;
  loadFromArchive: (id: string) => void;
  deleteFromArchive: (id: string) => void;
  setUnits: (u: UnitsPreferences) => void;
  setSynonyms: (m: SynonymsMap) => void;
  togglePin: (metricKey: string) => void;
  isPinned: (metricKey: string) => boolean;
  getVisibleRows: () => State["table"] extends infer T ? T extends ComparisonTable ? T["rows"] : never : never;
};

const ComparisonContext = createContext<Ctx | null>(null);

export function ComparisonProvider({ children }: { children: React.ReactNode }) {
  const [persisted, setPersisted] = useLocalStorage<State>("comparison-state:v1", {
    files: [],
    hasResults: false,
    processing: { step: 0, running: false },
    table: null,
    archive: [],
    units: {},
    synonyms: {},
  });
  const [state, dispatch] = useReducer(reducer, persisted);

  // In-memory cache dei File caricati (non persistito)
  const filesDataRef = React.useRef<Map<string, File>>(new Map());

  // persist
  React.useEffect(() => setPersisted(state), [state, setPersisted]);

  const addFiles = useCallback(async (input: FileList | File[]) => {
    const list = Array.from(input as any as File[]);
    const next = list.map((f) => {
      const id = `${f.name}-${f.size}-${f.lastModified}`;
      return { id, name: f.name, size: f.size, uploading: true } as ComparisonFile;
    });
    dispatch({ type: "ADD_FILES", files: next });

    // Upload files immediately in parallel
    for (const f of list) {
      try {
        const id = `${f.name}-${f.size}-${f.lastModified}`;
        const storageId = await uploadPdfToStorage(f);
        // Update just this file with storageId
        dispatch({ 
          type: "ADD_FILES", 
          files: [{ id, name: f.name, size: f.size, storageId, uploading: false }] 
        });
      } catch (error) {
        console.error(`Failed to upload ${f.name}:`, error);
        // Mark as failed upload
        const id = `${f.name}-${f.size}-${f.lastModified}`;
        dispatch({ 
          type: "ADD_FILES", 
          files: [{ id, name: f.name, size: f.size, uploading: false }] 
        });
      }
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    filesDataRef.current.delete(id);
    dispatch({ type: "REMOVE_FILE", id });
  }, []);

  const renameVendor = useCallback((fileId: string, vendorName: string) => {
    const nextFiles = state.files.map((f) => (f.id === fileId ? { ...f, vendorName } : f));
    dispatch({ type: "ADD_FILES", files: nextFiles });
    if (!DISABLE_MOCKS) {
    const table = buildMockTable(nextFiles, state.synonyms);
    dispatch({ type: "SET_TABLE", table: { ...table, pinnedKeys: state.table?.pinnedKeys || [] } });
    dispatch({ type: "SET_RESULTS", has: !!nextFiles.length });
    }
  }, [state]);

  const regenerateTable = useCallback(() => {
    if (DISABLE_MOCKS) {
      // In produzione non rigeneriamo mock: il bottone diventa no-op
      return;
    }
    const table = buildMockTable(state.files, state.synonyms);
    dispatch({ type: "SET_TABLE", table: { ...table, pinnedKeys: [] } });
    dispatch({ type: "SET_RESULTS", has: true });
  }, [state.files, state.synonyms]);

  const startProcessing = useCallback(async () => {
    if (state.files.length < 2) return;
    
    // Check if all files have been uploaded
    const unuploadedFiles = state.files.filter(f => !f.storageId || f.uploading);
    if (unuploadedFiles.length > 0) {
      alert(`Aspetta che tutti i file vengano caricati. File in corso: ${unuploadedFiles.map(f => f.name).join(', ')}`);
      return;
    }

    try {
      dispatch({ type: "SET_PROCESSING", processing: { step: 1, running: true } });
      
      // Use already uploaded storageIds
      const items = state.files.map((meta) => {
        if (!meta.storageId) throw new Error(`StorageId mancante per ${meta.name}`);
        const vendor_hint = meta.vendorName?.trim() || meta.name.replace(/\.pdf$/i, "");
        return { storageId: meta.storageId, vendor_hint };
      });

      // Create job
      const res = await fetch(`${API_BASE}/api/jobs/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdf_list: items, job_name: "Confronto" }),
      });
      if (!res.ok) throw new Error("Creazione job fallita");
      const { job_id } = await res.json();

      // Poll status
      let status = "queued";
      let tries = 0;
      while (!["ready", "ready_partial", "failed", "failed_no_signal"].includes(status) && tries < 300) {
        const s = await fetch(`${API_BASE}/api/jobs/status?jobId=${encodeURIComponent(job_id)}`);
        if (!s.ok) throw new Error("Status non disponibile");
        const js = await s.json();
        status = js?.job?.status || status;
        const stage = js?.job?.progress?.stage as string | undefined;
        const step = stage === "aggregating" ? 3 : stage === "extracting" ? 1 : 2;
        dispatch({ type: "SET_PROCESSING", processing: { step, running: true } });
        if (["ready", "ready_partial"].includes(status)) break;
        await new Promise((r) => setTimeout(r, 1500));
        tries++;
      }

      // Fetch dataset
      const d = await fetch(`${API_BASE}/api/jobs/dataset?jobId=${encodeURIComponent(job_id)}`);
      if (!d.ok) throw new Error("Dataset non disponibile");
      const dataset: BackendDataset = await d.json();
      const table = buildTableFromDataset(dataset);
      dispatch({ type: "SET_TABLE", table });
      dispatch({ type: "SET_RESULTS", has: true });
    } catch (e) {
      console.error(e);
    } finally {
    dispatch({ type: "SET_PROCESSING", processing: { step: 0, running: false } });
    }
  }, [state.files]);

  const setSort = useCallback((sort: SortState) => dispatch({ type: "SET_TABLE_SORT", sort }), []);
  const setFilters = useCallback((filters: FiltersState) => dispatch({ type: "SET_TABLE_FILTERS", filters }), []);

  const getVisibleRows = useCallback(() => {
    const table = state.table;
    if (!table) return [] as any;
    const activeCats = Object.entries(table.filters.categories).filter(([, v]) => v).map(([k]) => k);
    let rows = table.rows.filter((r) => activeCats.includes(r.category));
    const q = table.filters.query.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.key.toLowerCase().includes(q));

    // differences-only
    if (table.filters.showDifferencesOnly) {
      rows = rows.filter((r) => {
        const vals = r.values.map((v: string | number | boolean | null) => (v === null ? "—" : String(v)));
        return new Set(vals).size > 1;
      });
    }
    // significant-only (numerico): spread percent > threshold
    if (table.filters.showSignificantOnly) {
      const thr = Math.max(0, table.filters.significancePercent) / 100;
      rows = rows.filter((r) => isSignificantRow(r, thr));
    }
    // red-flags-only
    if (table.filters.showRedFlagsOnly) {
      rows = rows.filter((r) => isRedFlagRow(r));
    }
    // pinned-only
    if (table.filters.showPinnedOnly && table.pinnedKeys.length) {
      rows = rows.filter((r) => table.pinnedKeys.includes(r.key));
    }

    // sorting
    if (table.sort) {
      const { columnIndex, direction } = table.sort;
      rows = [...rows].sort((a, b) => compareCells(a, b, columnIndex, direction));
    }
    // pin ordering: mantieni i "pinned" in testa nell'ordine di pin
    if (table.pinnedKeys.length) {
      const pinOrder = new Map(table.pinnedKeys.map((k, i) => [k, i] as const));
      rows = rows.sort((a, b) => (pinOrder.has(a.key) || pinOrder.has(b.key) ? (pinOrder.get(a.key) ?? 1e9) - (pinOrder.get(b.key) ?? 1e9) : 0));
    }
    return rows;
  }, [state.table]);

  const exportCSV = useCallback(() => {
    if (!state.table) return;
    const rows = getVisibleRows();
    const lines = [state.table.columns.join(",")];
    for (const row of rows) {
      const vals = row.values.map((v: string | number | boolean | null) => (v === null ? "" : String(v)));
      lines.push([row.key, ...vals].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "confronto.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [state.table, getVisibleRows]);

  const copyKeynote = useCallback(async () => {
    if (!state.table) return;
    const rows = getVisibleRows();
    const lines = [state.table.columns.join("\t")];
    for (const row of rows) {
      const vals = row.values.map((v: string | number | boolean | null) => (v === null ? "" : String(v)));
      lines.push([row.key, ...vals].join("\t"));
    }
    lines.push("\n— Generated by Brief (demo)");
    await navigator.clipboard.writeText(lines.join("\n"));
  }, [state.table, getVisibleRows]);

  const saveToArchive = useCallback((name: string) => {
    if (!state.table) return;
    const item: ArchiveItem = {
      id: String(Date.now()),
      name,
      createdAt: Date.now(),
      files: state.files,
      table: state.table,
    };
    dispatch({ type: "ARCHIVE_ADD", item });
  }, [state.files, state.table]);

  const loadFromArchive = useCallback((id: string) => {
    const it = state.archive.find((a) => a.id === id);
    if (!it) return;
    dispatch({ type: "ADD_FILES", files: it.files });
    dispatch({ type: "SET_TABLE", table: it.table });
    dispatch({ type: "SET_RESULTS", has: true });
  }, [state.archive]);

  const deleteFromArchive = useCallback((id: string) => dispatch({ type: "ARCHIVE_DELETE", id }), []);

  const setUnits = useCallback((u: UnitsPreferences) => dispatch({ type: "SET_UNITS", units: u }), []);
  const setSynonyms = useCallback((m: SynonymsMap) => dispatch({ type: "SET_SYNONYMS", synonyms: m }), []);

  const togglePin = useCallback((metricKey: string) => {
    const t = state.table;
    if (!t) return;
    const exists = t.pinnedKeys.includes(metricKey);
    const next = exists ? t.pinnedKeys.filter((k) => k !== metricKey) : [...t.pinnedKeys, metricKey];
    dispatch({ type: "SET_TABLE", table: { ...t, pinnedKeys: next } });
  }, [state.table]);

  const isPinned = useCallback((metricKey: string) => !!state.table?.pinnedKeys.includes(metricKey), [state.table]);

  const ctx = useMemo<Ctx>(() => ({
    state,
    addFiles,
    removeFile,
    renameVendor,
    startProcessing,
    regenerateTable,
    setSort,
    setFilters,
    exportCSV,
    copyKeynote,
    saveToArchive,
    loadFromArchive,
    deleteFromArchive,
    setUnits,
    setSynonyms,
    togglePin,
    isPinned,
    getVisibleRows,
  }), [state, addFiles, removeFile, startProcessing, regenerateTable, setSort, setFilters, exportCSV, copyKeynote, saveToArchive, loadFromArchive, deleteFromArchive, setUnits, setSynonyms, togglePin, isPinned, getVisibleRows]);

  return <ComparisonContext.Provider value={ctx}>{children}</ComparisonContext.Provider>;
}

export function useComparison() {
  const ctx = useContext(ComparisonContext);
  if (!ctx) throw new Error("useComparison must be used within ComparisonProvider");
  return ctx;
}

// Helpers esportati per UI
export function isMinBetter(key: string) {
  return key === "Monthly Price ($)" || key === "Support Response (hrs)";
}
export function compareCells(a: ComparisonTable["rows"][number], b: ComparisonTable["rows"][number], columnIndex: number, direction: "asc" | "desc") {
  const av = columnIndex === 0 ? a.key : a.values[columnIndex - 1];
  const bv = columnIndex === 0 ? b.key : b.values[columnIndex - 1];
  let cmp = 0;
  if (typeof av === "boolean" && typeof bv === "boolean") cmp = av === bv ? 0 : av ? -1 : 1;
  else if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
  else cmp = String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true, sensitivity: "base" });
  return direction === "asc" ? cmp : -cmp;
}
export function isRedFlagRow(r: ComparisonTable["rows"][number]) {
  if (r.key === "SOC2" || r.key === "GDPR") return r.values.some((v) => v === false);
  if (r.key === "Support Response (hrs)") return r.values.some((v) => typeof v === "number" && v > 24);
  if (r.key === "Uptime SLA (%)") return r.values.some((v) => typeof v === "number" && v < 99.9);
  return false;
}
export function isSignificantRow(r: ComparisonTable["rows"][number], thresholdRatio: number) {
  if (r.type !== "numeric") return true; // per boolean/text consideriamo non-bloccante
  const nums = r.values.filter((v): v is number => typeof v === "number");
  if (nums.length < 2) return false;
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  if (max === 0 && min === 0) return false;
  const ratio = isMinBetter(r.key) ? (max - min) / max : (max - min) / min;
  return ratio >= thresholdRatio;
}



