"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Input } from "~/components/ui/input";
import { useComparison, isMinBetter, compareCells, isRedFlagRow, isSignificantRow } from "~/state/comparison";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";

function ExecutiveSummary() {
  const { state } = useComparison();
  if (!state.table) return null;
  const vendors = state.table.vendorMeta.map((v) => v.vendor);
  const pick = (key: string) => state.table!.rows.find((r) => r.key === key);
  const sla = pick("Uptime SLA (%)");
  const price = pick("Monthly Price ($)");
  const support = pick("Support Response (hrs)");
  const s = (r: typeof sla) => (r ? r.values : []);
  const text = `SLA: ${s(sla).join(" | ")}. Prezzo mensile: ${s(price).join(" | ")}. Risposta supporto (h): ${s(support).join(" | ")}.`;
  return (
    <div className="rounded-md border p-3 mb-3" data-slot="input">
      <div className="text-sm text-muted-foreground">
        Executive Summary (mock): {vendors.join(", ")}. {text}
      </div>
    </div>
  );
}

export default function NewComparisonPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { state, addFiles, removeFile, startProcessing, regenerateTable, setFilters, setSort, exportCSV, copyKeynote, saveToArchive, togglePin, isPinned } = useComparison();
  const [savingName, setSavingName] = useState("");

  const onSelectFiles = useCallback((list: FileList | null) => {
    if (!list) return;
    addFiles(list);
  }, [addFiles]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    onSelectFiles(e.dataTransfer.files);
  }, [onSelectFiles]);

  const handleBrowse = useCallback(() => inputRef.current?.click(), []);
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => onSelectFiles(e.target.files), [onSelectFiles]);
  const handleRemove = useCallback((id: string) => removeFile(id), [removeFile]);

  const canStart = useMemo(() => state.files.length >= 2, [state.files.length]);
  const startSimulated = useCallback(() => {
    void startProcessing();
  }, [startProcessing]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6 flex flex-col gap-4">
          <Card data-slot="card">
            <CardHeader>
              <CardTitle className="text-base">Nuovo Confronto</CardTitle>
              <CardDescription>Carica PDF e avvia il confronto</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="rounded-md border border-[--border] bg-[rgba(12,18,26,0.3)] p-6 text-center"
                data-slot="input"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <div className="text-sm text-muted-foreground mb-3">Trascina qui i PDF oppure</div>
                <Button data-slot="button" onClick={handleBrowse}>Scegli file</Button>
                <input ref={inputRef} type="file" multiple accept="application/pdf" className="hidden" onChange={handleInputChange} />
              </div>

              {state.files.length > 0 && (
                <div className="mt-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File</TableHead>
                        <TableHead>Dimensione</TableHead>
                        <TableHead>Stato</TableHead>
                        <TableHead className="w-[1%]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {state.files.map((f) => (
                        <TableRow key={f.id}>
                          <TableCell className="text-sm">{f.name}</TableCell>
                          <TableCell className="text-sm">{(f.size / 1024).toFixed(1)} KB</TableCell>
                          <TableCell className="text-xs text-muted-foreground">caricato</TableCell>
                          <TableCell>
                            <Button data-slot="button" variant="outline" size="sm" onClick={() => handleRemove(f.id)}>Rimuovi</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Barra progressiva a step */}
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {[
                      { label: "Estrazione", idx: 1 },
                      { label: "Normalizzazione", idx: 2 },
                      { label: "Generazione", idx: 3 },
                    ].map((s) => (
                      <div key={s.idx} className={`rounded-md border p-3 text-center ${state.processing.step >= s.idx && state.processing.running ? "bg-[rgba(11,30,39,0.5)]" : ""}`} data-slot="input">
                        <div className="text-xs text-muted-foreground">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    <Button data-slot="button" variant="outline" onClick={regenerateTable} disabled={state.processing.running || state.files.length === 0}>Rigenera</Button>
                    <Button data-slot="button" onClick={startSimulated} disabled={!canStart || state.processing.running}>Avvia Confronto</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {state.hasResults && state.table && (
            <Card data-slot="card">
              <CardHeader>
                <CardTitle className="text-base">Tabella Comparativa</CardTitle>
                <CardDescription>Vista interattiva (placeholder)</CardDescription>
              </CardHeader>
              <CardContent>
                <ExecutiveSummary />
                <div className="flex items-center justify-between gap-3 mb-3 sticky top-[calc(var(--header-height)+8px)] bg-[--background] z-10 py-2">
                  <div className="flex items-center gap-2">
                    <Button data-slot="button" variant="outline" size="sm" onClick={exportCSV}>Esporta CSV</Button>
                    <Button data-slot="button" variant="outline" size="sm" onClick={copyKeynote}>Copia in Keynote</Button>
                    <div className="flex items-center gap-2">
                      <Input data-slot="input" value={savingName} onChange={(e) => setSavingName(e.target.value)} placeholder="Nome confronto" className="h-8 w-40" />
                      <Button data-slot="button" size="sm" onClick={() => saveToArchive(savingName || "Confronto")}>Salva</Button>
                    </div>
                  </div>
                  <FiltersQuick onChangeQuery={(q) => state.table && setFilters({ ...state.table.filters, query: q })} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
                  <ComparisonTable />
                  <FiltersPanel />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function FiltersQuick({ onChangeQuery }: { onChangeQuery: (q: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Input data-slot="input" placeholder="Filtra metriche" className="h-8 w-48" onChange={(e) => onChangeQuery(e.target.value)} />
    </div>
  );
}

function ComparisonTable() {
  const { state, setSort, togglePin, isPinned } = useComparison();
  const table = state.table!;

  const filteredRows = useMemo(() => {
    // delega alla logica condivisa per coerenza con export/copy
    return state.table ? getVisibleRowsForUI(state.table) : [];
  }, [state.table]);

  const onSort = (idx: number) => {
    const next = !table.sort || table.sort.columnIndex !== idx
      ? { columnIndex: idx, direction: "asc" as const }
      : { columnIndex: idx, direction: table.sort.direction === "asc" ? "desc" : "asc" };
    setSort(next);
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {table.columns.map((c, i) => (
              <TableHead key={c} onClick={() => onSort(i)} className="cursor-pointer select-none">
                {c}
                {table.sort?.columnIndex === i && (
                  <span className="ml-1 text-xs text-muted-foreground">{table.sort.direction === "asc" ? "▲" : "▼"}</span>
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredRows.map((r) => (
            <TableRow key={r.key}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <button className="text-xs underline" onClick={() => togglePin(r.key)}>{isPinned(r.key) ? "Unpin" : "Pin"}</button>
                  <span>{r.key}</span>
                  <MetricInfo keyName={r.key} />
                </div>
              </TableCell>
              {r.values.map((v, i) => (
                <TableCell key={i} className={bestClass(r, i, v)}>{renderCell(v)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function renderCell(v: string | number | boolean | null) {
  if (v === null || v === undefined) return <span className="text-muted-foreground">—</span>;
  if (typeof v === "boolean") return <span className="text-xs" data-slot="badge">{v ? "Vero" : "Falso"}</span>;
  if (typeof v === "number") return <span>{v}</span>;
  return <span>{v}</span>;
}

function bestClass(r: { key: string; type: "numeric" | "boolean" | "text"; values: any[] }, idx: number, v: any) {
  if (r.type === "numeric") {
    const nums = r.values.filter((x): x is number => typeof x === "number");
    if (!nums.length || typeof v !== "number") return "";
    const max = Math.max(...nums);
    const min = Math.min(...nums);
    const target = isMinBetter(r.key) ? min : max;
    const isBest = v === target;
    return isBest ? "bg-[rgba(11,30,39,0.5)]" : "";
  }
  if (r.type === "boolean") {
    if (v === true) return "bg-[rgba(11,30,39,0.5)]";
    return "";
  }
  return "";
}

function FiltersPanel() {
  const { state, setFilters } = useComparison();
  const filters = state.table!.filters;
  const toggle = (key: string) => setFilters({ ...filters, categories: { ...filters.categories, [key]: !filters.categories[key] } });
  return (
    <div className="rounded-md border p-3" data-slot="input">
      <div className="text-sm font-medium mb-2">Filtri</div>
      <div className="flex items-center gap-2 py-1">
        <Checkbox id="diff-only" checked={filters.showDifferencesOnly} onCheckedChange={() => setFilters({ ...filters, showDifferencesOnly: !filters.showDifferencesOnly })} />
        <Label htmlFor="diff-only" className="text-sm">Mostra solo differenze</Label>
      </div>
      <div className="flex items-center gap-2 py-1">
        <Checkbox id="red-only" checked={filters.showRedFlagsOnly} onCheckedChange={() => setFilters({ ...filters, showRedFlagsOnly: !filters.showRedFlagsOnly })} />
        <Label htmlFor="red-only" className="text-sm">Mostra solo red flags</Label>
      </div>
      <div className="flex items-center gap-2 py-1">
        <Checkbox id="pinned-only" checked={filters.showPinnedOnly} onCheckedChange={() => setFilters({ ...filters, showPinnedOnly: !filters.showPinnedOnly })} />
        <Label htmlFor="pinned-only" className="text-sm">Solo KPI fissati</Label>
      </div>
      <div className="flex items-center justify-between py-2">
        <Label htmlFor="sig" className="text-sm">Solo differenze significative</Label>
        <div className="flex items-center gap-2">
          <Input id="sig" data-slot="input" className="h-8 w-20" value={filters.significancePercent} onChange={(e) => setFilters({ ...filters, significancePercent: Number(e.target.value) || 0 })} />
          <span className="text-xs text-muted-foreground">%</span>
          <Checkbox checked={filters.showSignificantOnly} onCheckedChange={() => setFilters({ ...filters, showSignificantOnly: !filters.showSignificantOnly })} />
        </div>
      </div>
      {Object.keys(filters.categories).map((k) => (
        <label key={k} className="flex items-center gap-2 py-1">
          <Checkbox checked={!!filters.categories[k]} onCheckedChange={() => toggle(k)} id={`cat-${k}`} />
          <Label htmlFor={`cat-${k}`} className="text-sm">{k}</Label>
        </label>
      ))}
      <div className="mt-3 text-right text-xs text-muted-foreground">
        <button className="underline" onClick={() => setFilters({ ...filters, categories: Object.fromEntries(Object.keys(filters.categories).map((k) => [k, true])) })}>Reset</button>
      </div>
    </div>
  );
}

function MetricInfo({ keyName }: { keyName: string }) {
  const descriptions: Record<string, string> = {
    "Uptime SLA (%)": "Disponibilità garantita del servizio nel periodo. Valori > 99.9% sono considerati enterprise.",
    "Monthly Price ($)": "Costo mensile del piano comparato; per questa metrica minore è migliore.",
    "Support Response (hrs)": "Tempo medio di prima risposta del supporto; minore è migliore.",
    "Throughput (req/s)": "Richieste al secondo gestibili dal sistema in condizioni nominali.",
  };
  const content = descriptions[keyName] || "Metrica comparativa derivata dai documenti caricati.";
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-xs text-muted-foreground underline decoration-dotted cursor-help">info</span>
        </TooltipTrigger>
        <TooltipContent>
          <div className="max-w-xs text-xs leading-5">{content}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Helpers condivisi lato UI (mock-only)
import { type ComparisonTable as T } from "~/state/comparison";
function getVisibleRowsForUI(table: T) {
  const activeCats = Object.entries(table.filters.categories).filter(([, v]) => v).map(([k]) => k);
  let rows = table.rows.filter((r) => activeCats.includes(r.category));
  const q = table.filters.query.trim().toLowerCase();
  if (q) rows = rows.filter((r) => r.key.toLowerCase().includes(q));
  if (table.filters.showDifferencesOnly) {
    rows = rows.filter((r) => new Set(r.values.map((v) => (v === null ? "—" : String(v)))).size > 1);
  }
  if (table.filters.showSignificantOnly) {
    const thr = Math.max(0, table.filters.significancePercent) / 100;
    rows = rows.filter((r) => isSignificantRow(r, thr));
  }
  if (table.filters.showRedFlagsOnly) rows = rows.filter(isRedFlagRow);
  if (table.filters.showPinnedOnly && table.pinnedKeys.length) rows = rows.filter((r) => table.pinnedKeys.includes(r.key));
  if (table.sort) rows = [...rows].sort((a, b) => compareCells(a, b, table.sort!.columnIndex, table.sort!.direction));
  if (table.pinnedKeys.length) {
    const order = new Map(table.pinnedKeys.map((k, i) => [k, i] as const));
    rows = rows.sort((a, b) => (order.has(a.key) || order.has(b.key) ? (order.get(a.key) ?? 1e9) - (order.get(b.key) ?? 1e9) : 0));
  }
  return rows;
}

