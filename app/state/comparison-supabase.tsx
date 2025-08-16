"use client";
import React, { createContext, useCallback, useContext, useMemo, useReducer } from "react";
import { useLocalStorage } from "~/hooks/use-local-storage";
import { apiGateway } from "~/lib/api-gateway";

export type ComparisonFile = { 
  id: string; 
  name: string; 
  size: number; 
  vendorName?: string; 
  documentId?: string; 
  uploading?: boolean;
  uploaded?: boolean;
  error?: string;
};

export type SortState = { columnIndex: number; direction: "asc" | "desc" } | null;

export type FiltersState = {
  query: string;
  categories: Record<string, boolean>;
  showDifferencesOnly: boolean;
  showRedFlagsOnly: boolean;
  showPinnedOnly: boolean;
  showSignificantOnly: boolean;
  significancePercent: number;
  priority: "Performance" | "Compliance" | "Pricing";
};

export type ComparisonTable = {
  columns: string[];
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

type State = {
  files: ComparisonFile[];
  hasResults: boolean;
  processing: Processing;
  table: ComparisonTable | null;
  archive: ArchiveItem[];
  currentJobId?: string;
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
  | { type: "SET_JOB_ID"; jobId?: string };

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
    case "SET_JOB_ID":
      return { ...state, currentJobId: action.jobId };
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

// Convert API Gateway results to frontend table format
function buildTableFromAPIGatewayResults(results: any): ComparisonTable {
  if (!results || !results.columns || !results.rows) {
    return {
      columns: ["Metrica"],
      vendorMeta: [],
      rows: [],
      sort: null,
      filters: defaultFilters,
      pinnedKeys: []
    };
  }

  // Build columns from document IDs
  const columns = ["Metrica", ...results.rows.map((row: any, index: number) => {
    return `Document ${index + 1}`;
  })];

  // Build vendor metadata
  const vendorMeta = results.rows.map((row: any, index: number) => {
    return {
      vendor: `Document ${index + 1}`,
      source: `Document ${row.document_id}`,
      docId: row.document_id,
      dateParsed: Date.now(),
    };
  });

  // Transform from document-centric to metric-centric structure
  const metricRows: any[] = [];
  
  // For each column (field), create a row across all documents
  for (const column of results.columns) {
    const metricKey = column.label || column.id;
    
    // Collect values for this metric across all documents
    const values = results.rows.map((row: any) => {
      const cell = row.cells[column.id];
      if (!cell || cell.value === null) return null;
      
      // Handle different value types
      if (typeof cell.value === 'boolean') return cell.value;
      if (typeof cell.value === 'number') return cell.value;
      
      // For string values, include unit if present
      if (cell.unit && cell.unit !== 'boolean') {
        return `${cell.value} ${cell.unit}`;
      }
      
      return String(cell.value);
    });

    // Determine type based on values
    let type: "numeric" | "boolean" | "text" = "text";
    const nonNullValues = values.filter((v: any) => v !== null);
    
    if (nonNullValues.length > 0) {
      if (nonNullValues.every((v: any) => typeof v === "boolean")) {
        type = "boolean";
      } else if (nonNullValues.every((v: any) => typeof v === "number")) {
        type = "numeric";  
      }
    }

    // Infer category from metric name
    const category = inferCategoryFromLabel(metricKey);

    metricRows.push({
      key: metricKey,
      category,
      type,
      values
    });
  }

  return {
    columns,
    vendorMeta,
    rows: metricRows,
    sort: null,
    filters: defaultFilters,
    pinnedKeys: []
  };
}

// Legacy function for backward compatibility  
function buildTableFromSupabaseResults(results: any, documents: any[]): ComparisonTable {
  return buildTableFromAPIGatewayResults(results);
}

function inferCategoryFromLabel(label: string): string {
  const lowerLabel = label.toLowerCase();
  
  if (lowerLabel.includes("throughput") || lowerLabel.includes("req/s") || lowerLabel.includes("performance")) {
    return "Performance";
  }
  if (lowerLabel.includes("price") || lowerLabel.includes("cost") || lowerLabel.includes("$")) {
    return "Pricing";
  }
  if (lowerLabel.includes("soc2") || lowerLabel.includes("gdpr") || lowerLabel.includes("compliance")) {
    return "Compliance";
  }
  if (lowerLabel.includes("support") || lowerLabel.includes("sla") || lowerLabel.includes("uptime")) {
    return "Supporto";
  }
  
  return "Performance";
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
  togglePin: (metricKey: string) => void;
  isPinned: (metricKey: string) => boolean;
  getVisibleRows: () => State["table"] extends infer T ? T extends ComparisonTable ? T["rows"] : never : never;
};

const ComparisonContext = createContext<Ctx | null>(null);

export function ComparisonProvider({ children }: { children: React.ReactNode }) {
  const [persisted, setPersisted] = useLocalStorage<State>("comparison-state:supabase:v1", {
    files: [],
    hasResults: false,
    processing: { step: 0, running: false },
    table: null,
    archive: [],
  });
  const [state, dispatch] = useReducer(reducer, persisted);

  // Persist state changes
  React.useEffect(() => setPersisted(state), [state, setPersisted]);

  // Reset processing state on mount if left hanging
  React.useEffect(() => {
    if (state.processing.running) {
      dispatch({ type: "SET_PROCESSING", processing: { step: 0, running: false } });
    }
  }, []);

  const addFiles = useCallback(async (input: FileList | File[]) => {
    const list = Array.from(input as any as File[]);
    const next = list.map((f) => {
      const id = `${f.name}-${f.size}-${f.lastModified}`;
      return { id, name: f.name, size: f.size, uploading: true } as ComparisonFile;
    });
    dispatch({ type: "ADD_FILES", files: next });

    try {
      // Step 1: Create job and get signed upload URLs
      console.log('🚀 Creating job with API Gateway...');
      const jobResponse = await apiGateway.createJob({
        fileCount: list.length,
        domainMode: 'auto'
      });
      
      dispatch({ type: "SET_JOB_ID", jobId: jobResponse.job_id });
      console.log('✅ Job created:', jobResponse.job_id);

      // Step 2: Upload files using signed URLs
      const uploadedFiles: { originalName: string; storagePath: string; size: number }[] = [];
      
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const uploadUrl = jobResponse.upload_urls[i];
        
        if (!uploadUrl) {
          throw new Error(`No upload URL for file ${file.name}`);
        }

        try {
          const id = `${file.name}-${file.size}-${file.lastModified}`;
          console.log(`📤 Uploading ${file.name} via signed URL...`);
          
          // Upload to signed URL
          const uploadResponse = await fetch(uploadUrl.url, {
            method: 'PUT',
            body: file,
            headers: {
              'Content-Type': 'application/pdf'
            }
          });

          if (!uploadResponse.ok) {
            throw new Error(`Upload failed: ${uploadResponse.statusText}`);
          }

          // Track successful upload
          uploadedFiles.push({
            originalName: file.name,
            storagePath: uploadUrl.path,
            size: file.size
          });

          const vendorName = toTitleCaseVendor(file.name);
          
          // Update file with success
          dispatch({ 
            type: "ADD_FILES", 
            files: [{ 
              id, 
              name: file.name, 
              size: file.size, 
              vendorName,
              documentId: jobResponse.job_id, // Use job ID temporarily 
              uploading: false,
              uploaded: true
            }] 
          });
          
          console.log(`✅ ${file.name} uploaded successfully`);
          
        } catch (error) {
          console.error(`❌ Failed to upload ${file.name}:`, error);
          const id = `${file.name}-${file.size}-${file.lastModified}`;
          dispatch({ 
            type: "ADD_FILES", 
            files: [{ 
              id, 
              name: file.name, 
              size: file.size, 
              uploading: false,
              error: error instanceof Error ? error.message : 'Upload failed'
            }] 
          });
        }
      }

      // Step 3: Complete upload and start processing
      if (uploadedFiles.length > 0) {
        console.log('📋 Completing upload for', uploadedFiles.length, 'files...');
        await apiGateway.completeUpload({
          jobId: jobResponse.job_id,
          files: uploadedFiles
        });
        console.log('✅ Upload completed, processing will start automatically');
      }

    } catch (error) {
      console.error('❌ Failed to create job or upload files:', error);
      
      // Mark all files as failed
      for (const file of list) {
        const id = `${file.name}-${file.size}-${file.lastModified}`;
        dispatch({ 
          type: "ADD_FILES", 
          files: [{ 
            id, 
            name: file.name, 
            size: file.size, 
            uploading: false,
            error: error instanceof Error ? error.message : 'Job creation failed'
          }] 
        });
      }
    }
  }, []);

  const removeFile = useCallback(async (id: string) => {
    const file = state.files.find(f => f.id === id);
    // Note: With API Gateway, file deletion is handled automatically when job is deleted
    // For now, just remove from UI state
    dispatch({ type: "REMOVE_FILE", id });
  }, [state.files]);

  const renameVendor = useCallback(async (fileId: string, vendorName: string) => {
    const file = state.files.find(f => f.id === fileId);
    // Note: Vendor name changes will be handled during processing
    // For now, just update UI state
    const nextFiles = state.files.map((f) => (f.id === fileId ? { ...f, vendorName } : f));
    dispatch({ type: "ADD_FILES", files: nextFiles });
  }, [state.files]);

  const startProcessing = useCallback(async () => {
    if (state.files.length < 2) return;
    
    if (!state.currentJobId) {
      alert('No job ID available. Please upload files first.');
      return;
    }
    
    console.log("=== STARTING API GATEWAY PROCESSING ===");
    console.log("Job ID:", state.currentJobId);
    console.log("Files to process:", state.files.map(f => ({ name: f.name, uploaded: f.uploaded })));
    
    // Check if all files have been uploaded
    const unuploadedFiles = state.files.filter(f => !f.uploaded || f.uploading || f.error);
    if (unuploadedFiles.length > 0) {
      const errorFiles = unuploadedFiles.filter(f => f.error);
      const uploadingFiles = unuploadedFiles.filter(f => f.uploading);
      
      let message = '';
      if (errorFiles.length > 0) {
        message += `Errori di upload: ${errorFiles.map(f => f.name).join(', ')}. `;
      }
      if (uploadingFiles.length > 0) {
        message += `File in caricamento: ${uploadingFiles.map(f => f.name).join(', ')}. `;
      }
      
      alert(message + 'Assicurati che tutti i file siano caricati correttamente.');
      return;
    }

    try {
      dispatch({ type: "SET_PROCESSING", processing: { step: 1, running: true } });
      
      // Monitor job status until completion
      console.log("📊 Monitoring job status...");
      
      let attempts = 0;
      const maxAttempts = 60; // 2 minutes with 2s intervals
      
      while (attempts < maxAttempts) {
        dispatch({ type: "SET_PROCESSING", processing: { step: 2, running: true } });
        
        const statusResponse = await apiGateway.getJobStatus(state.currentJobId);
        console.log(`Status check ${attempts + 1}:`, statusResponse.status, `(${statusResponse.progress}%)`);
        
        if (statusResponse.status === 'READY') {
          // Job completed successfully
          dispatch({ type: "SET_PROCESSING", processing: { step: 3, running: true } });
          
          console.log("🎉 Processing completed! Getting results...");
          const results = await apiGateway.getJobResults(state.currentJobId);
          
          if (!results || !results.columns || !results.rows) {
            throw new Error("No results generated");
          }
          
          // Convert API Gateway results to table format
          const table = buildTableFromAPIGatewayResults(results);
          
          dispatch({ type: "SET_TABLE", table });
          dispatch({ type: "SET_RESULTS", has: true });
          
          console.log("✅ Results loaded successfully");
          break;
          
        } else if (statusResponse.status === 'FAILED') {
          throw new Error(statusResponse.error || 'Job processing failed');
          
        } else if (statusResponse.status === 'CANCELLED') {
          throw new Error('Job was cancelled');
          
        } else {
          // Still processing, wait and retry
          await new Promise(resolve => setTimeout(resolve, 2000));
          attempts++;
        }
      }
      
      if (attempts >= maxAttempts) {
        throw new Error('Processing timeout - job did not complete within 2 minutes');
      }
      
    } catch (error) {
      console.error("❌ Processing failed:", error);
      
      // Create error table
      const errorTable = {
        columns: ["Metrica", ...state.files.map(f => f.vendorName || f.name.replace(/\.pdf$/i, ""))],
        vendorMeta: state.files.map((f, i) => ({ 
          vendor: f.vendorName || f.name.replace(/\.pdf$/i, ""), 
          source: f.name, 
          docId: `error-${i}`, 
          dateParsed: Date.now() 
        })),
        rows: [{
          key: "Extraction Status",
          category: "Performance", 
          type: "text" as const,
          values: state.files.map(() => `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }],
        sort: null,
        filters: defaultFilters,
        pinnedKeys: []
      };
      
      dispatch({ type: "SET_TABLE", table: errorTable });
      dispatch({ type: "SET_RESULTS", has: true });
      
    } finally {
      dispatch({ type: "SET_PROCESSING", processing: { step: 0, running: false } });
    }
  }, [state.files, state.currentJobId]);

  const regenerateTable = useCallback(() => {
    // For now, just re-run processing
    startProcessing();
  }, [startProcessing]);

  const setSort = useCallback((sort: SortState) => dispatch({ type: "SET_TABLE_SORT", sort }), []);
  const setFilters = useCallback((filters: FiltersState) => dispatch({ type: "SET_TABLE_FILTERS", filters }), []);

  const getVisibleRows = useCallback(() => {
    const table = state.table;
    if (!table) return [] as any;
    
    const activeCats = Object.entries(table.filters.categories).filter(([, v]) => v).map(([k]) => k);
    let rows = table.rows.filter((r) => activeCats.includes(r.category));
    
    const q = table.filters.query.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.key.toLowerCase().includes(q));

    if (table.filters.showDifferencesOnly) {
      rows = rows.filter((r) => {
        const vals = r.values.map((v: string | number | boolean | null) => (v === null ? "—" : String(v)));
        return new Set(vals).size > 1;
      });
    }

    if (table.filters.showPinnedOnly && table.pinnedKeys.length) {
      rows = rows.filter((r) => table.pinnedKeys.includes(r.key));
    }

    if (table.sort) {
      const { columnIndex, direction } = table.sort;
      rows = [...rows].sort((a, b) => {
        const av = columnIndex === 0 ? a.key : a.values[columnIndex - 1];
        const bv = columnIndex === 0 ? b.key : b.values[columnIndex - 1];
        let cmp = 0;
        if (typeof av === "boolean" && typeof bv === "boolean") cmp = av === bv ? 0 : av ? -1 : 1;
        else if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
        else cmp = String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true, sensitivity: "base" });
        return direction === "asc" ? cmp : -cmp;
      });
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
    lines.push("\n— Generated by Brief with Supabase");
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
    togglePin,
    isPinned,
    getVisibleRows,
  }), [
    state, addFiles, removeFile, renameVendor, startProcessing, regenerateTable, 
    setSort, setFilters, exportCSV, copyKeynote, saveToArchive, loadFromArchive, 
    deleteFromArchive, togglePin, isPinned, getVisibleRows
  ]);

  return <ComparisonContext.Provider value={ctx}>{children}</ComparisonContext.Provider>;
}

export function useComparison() {
  const ctx = useContext(ComparisonContext);
  if (!ctx) throw new Error("useComparison must be used within ComparisonProvider");
  return ctx;
}

// Helper functions (keeping the same interface)
export function isMinBetter(key: string) {
  return key === "Monthly Price ($)" || key === "Support Response (hrs)";
}

export function compareCells(a: any, b: any, columnIndex: number, direction: "asc" | "desc") {
  const av = columnIndex === 0 ? a.key : a.values[columnIndex - 1];
  const bv = columnIndex === 0 ? b.key : b.values[columnIndex - 1];
  let cmp = 0;
  if (typeof av === "boolean" && typeof bv === "boolean") cmp = av === bv ? 0 : av ? -1 : 1;
  else if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
  else cmp = String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true, sensitivity: "base" });
  return direction === "asc" ? cmp : -cmp;
}

export function isRedFlagRow(r: any) {
  if (r.key === "SOC2" || r.key === "GDPR") return r.values.some((v: any) => v === false);
  if (r.key === "Support Response (hrs)") return r.values.some((v: any) => typeof v === "number" && v > 24);
  if (r.key === "Uptime SLA (%)") return r.values.some((v: any) => typeof v === "number" && v < 99.9);
  return false;
}

export function isSignificantRow(r: any, thresholdRatio: number) {
  if (r.type !== "numeric") return true;
  const nums = r.values.filter((v: any): v is number => typeof v === "number");
  if (nums.length < 2) return false;
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  if (max === 0 && min === 0) return false;
  const ratio = isMinBetter(r.key) ? (max - min) / max : (max - min) / min;
  return ratio >= thresholdRatio;
}