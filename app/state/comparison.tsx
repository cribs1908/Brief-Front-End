"use client";
import React, { createContext, useCallback, useContext, useMemo, useReducer } from "react";
import { useLocalStorage } from "~/hooks/use-local-storage";

export type ComparisonFile = { id: string; name: string; size: number };
export type SortState = { columnIndex: number; direction: "asc" | "desc" } | null;
export type FiltersState = { query: string; categories: Record<string, boolean> };

export type ComparisonTable = {
  columns: string[]; // ["Metrica", ...fileNames]
  rows: { key: string; type: "numeric" | "boolean" | "text"; category: string; values: (string | number | boolean | null)[] }[];
  sort: SortState;
  filters: FiltersState;
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

const defaultFilters: FiltersState = { query: "", categories: { Generale: true, Prezzi: true, SLA: true } };

function buildMockTable(files: ComparisonFile[], synonyms: SynonymsMap): ComparisonTable {
  const fileNames = files.map((f) => f.name);
  const columns = ["Metrica", ...fileNames];
  const normalize = (term: string) => synonyms[term] || term;
  const rows = [
    { key: normalize("Feature A"), type: "boolean" as const, category: "Generale", values: [true, false, true] },
    { key: normalize("Throughput"), type: "numeric" as const, category: "Prestazioni", values: [120, 80, 95] },
    { key: normalize("SLA"), type: "text" as const, category: "SLA", values: ["99.9%", "99.5%", "99.95%"] },
    { key: normalize("Prezzo"), type: "numeric" as const, category: "Prezzi", values: [49, 39, 59] },
  ].map((r) => ({ ...r, values: r.values.slice(0, files.length) }));

  return { columns, rows, sort: null, filters: defaultFilters };
}

type Ctx = {
  state: State;
  addFiles: (files: FileList | File[]) => void;
  removeFile: (id: string) => void;
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

  // persist
  React.useEffect(() => setPersisted(state), [state, setPersisted]);

  const addFiles = useCallback((input: FileList | File[]) => {
    const list = Array.from(input as any as File[]);
    const next = list.map((f) => ({ id: `${f.name}-${f.size}-${f.lastModified}`, name: f.name, size: f.size }));
    dispatch({ type: "ADD_FILES", files: next });
  }, []);

  const removeFile = useCallback((id: string) => dispatch({ type: "REMOVE_FILE", id }), []);

  const regenerateTable = useCallback(() => {
    const table = buildMockTable(state.files, state.synonyms);
    dispatch({ type: "SET_TABLE", table });
    dispatch({ type: "SET_RESULTS", has: true });
  }, [state.files, state.synonyms]);

  const startProcessing = useCallback(async () => {
    if (state.files.length < 2) return;
    dispatch({ type: "SET_PROCESSING", processing: { step: 1, running: true } });
    await new Promise((r) => setTimeout(r, 700)); // Estrazione
    dispatch({ type: "SET_PROCESSING", processing: { step: 2, running: true } });
    await new Promise((r) => setTimeout(r, 700)); // Normalizzazione
    dispatch({ type: "SET_PROCESSING", processing: { step: 3, running: true } });
    await new Promise((r) => setTimeout(r, 700)); // Generazione tabella
    regenerateTable();
    dispatch({ type: "SET_PROCESSING", processing: { step: 0, running: false } });
  }, [regenerateTable, state.files.length]);

  const setSort = useCallback((sort: SortState) => dispatch({ type: "SET_TABLE_SORT", sort }), []);
  const setFilters = useCallback((filters: FiltersState) => dispatch({ type: "SET_TABLE_FILTERS", filters }), []);

  const exportCSV = useCallback(() => {
    if (!state.table) return;
    const lines = [state.table.columns.join(",")];
    for (const row of state.table.rows) {
      const vals = row.values.map((v) => (v === null ? "" : String(v)));
      lines.push([row.key, ...vals].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "confronto.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [state.table]);

  const copyKeynote = useCallback(async () => {
    if (!state.table) return;
    const lines = [state.table.columns.join("\t")];
    for (const row of state.table.rows) {
      const vals = row.values.map((v) => (v === null ? "" : String(v)));
      lines.push([row.key, ...vals].join("\t"));
    }
    await navigator.clipboard.writeText(lines.join("\n"));
  }, [state.table]);

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

  const ctx = useMemo<Ctx>(() => ({
    state,
    addFiles,
    removeFile,
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
  }), [state, addFiles, removeFile, startProcessing, regenerateTable, setSort, setFilters, exportCSV, copyKeynote, saveToArchive, loadFromArchive, deleteFromArchive, setUnits, setSynonyms]);

  return <ComparisonContext.Provider value={ctx}>{children}</ComparisonContext.Provider>;
}

export function useComparison() {
  const ctx = useContext(ComparisonContext);
  if (!ctx) throw new Error("useComparison must be used within ComparisonProvider");
  return ctx;
}


