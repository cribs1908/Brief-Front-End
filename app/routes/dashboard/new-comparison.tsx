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
import { Badge } from "~/components/ui/badge";
import { Link } from "react-router";
import { useLocalStorage } from "~/hooks/use-local-storage";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "~/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader as DialogHeaderUI, DialogTitle as DialogTitleUI, DialogTrigger } from "~/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { IconTrash, IconFilter, IconDotsVertical } from "@tabler/icons-react";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";

function ExecutiveSummary() {
  const { state } = useComparison();
  if (!state.table) return null;
  const vendors = state.table.vendorMeta.map((v) => v.vendor);
  const findRow = (key: string) => state.table!.rows.find((r) => r.key === key);
  const sla = findRow("Uptime SLA (%)");
  const price = findRow("Monthly Price ($)");
  const support = findRow("Support Response (hrs)");

  const priority = state.table.filters.priority;
  const scoreFor = (vendorIdx: number) => {
    let score = 0;
    const catWeight = (cat: string) => (cat === priority ? 3 : cat === "Compliance" ? 2 : 1);
    for (const r of state.table!.rows) {
      if (r.type !== "numeric") continue;
      const values = r.values.filter((v): v is number => typeof v === "number");
      if (!values.length) continue;
      const best = isMinBetter(r.key) ? Math.min(...values) : Math.max(...values);
      const v = r.values[vendorIdx];
      if (typeof v === "number" && v === best) score += catWeight(r.category);
    }
    return score;
  };
  const ranking = vendors
    .map((name, i) => ({ name, score: scoreFor(i), idx: i }))
    .sort((a, b) => b.score - a.score);

  const leader = ranking[0];
  const risks: string[] = [];
  if (sla && sla.values.some((v) => typeof v === "number" && v < 99.9)) risks.push("SLA < 99.9%");
  if (support && support.values.some((v) => typeof v === "number" && v > 24)) risks.push("Supporto > 24h");
  if (findRow("SOC2")?.values.includes(false)) risks.push("SOC2 mancante");

  const cheaper = price ? (() => {
    const nums = price.values.filter((v): v is number => typeof v === "number");
    if (nums.length < 2) return null;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const minIdx = price.values.findIndex((v) => v === min);
    const maxIdx = price.values.findIndex((v) => v === max);
    const diff = max === 0 ? 0 : Math.round(((max - min) / max) * 100);
    return { vendor: vendors[minIdx], diff };
  })() : null;

  const sentence1 = `Per priorità ${priority}, ${leader?.name ?? vendors[0]} è leader; rischi principali: ${risks.length ? risks.join(", ") : "nessuno rilevante"}.`;
  const sentence2 = cheaper ? `${cheaper.vendor} ha costo inferiore del ${cheaper.diff}% rispetto al più caro; verifica SLA e supporto.` : `Valuta trade-off tra prezzo e SLA rispetto alle priorità.`;

  return (
    <div className="rounded-md border p-3 mb-3" data-slot="input">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {sentence1} {sentence2}
        </div>
      </div>
    </div>
  );
}

export default function NewComparisonPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { state, addFiles, removeFile, startProcessing, regenerateTable, setFilters, setSort, exportCSV, copyKeynote, saveToArchive, togglePin, isPinned, renameVendor } = useComparison();
  const [savingName, setSavingName] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const [notes, setNotes] = useLocalStorage<string>("comparison-notes", "");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState<null | string>(null);

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
                        <TableHead>Fornitore</TableHead>
                        <TableHead>Dimensione</TableHead>
                        <TableHead>Stato</TableHead>
                        <TableHead className="w-[1%]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {state.files.map((f) => (
                        <TableRow key={f.id} className="transition-colors hover:bg-[rgba(11,30,39,0.5)]">
                          <TableCell className="text-sm">{f.name}</TableCell>
                          <TableCell>
                          <Input data-slot="input" className="h-8" defaultValue={f.vendorName || f.name.replace(/\.pdf$/i, "")} onBlur={(e) => renameVendor(f.id, e.target.value)} />
                          </TableCell>
                          <TableCell className="text-sm">{(f.size / 1024).toFixed(1)} KB</TableCell>
                          <TableCell className="text-xs text-muted-foreground">caricato</TableCell>
                          <TableCell>
                            <Dialog open={deleteOpen === f.id} onOpenChange={(o) => setDeleteOpen(o ? f.id : null)}>
                              <DialogTrigger asChild>
                                <Button
                                  data-slot="button"
                                  variant="outline"
                                  size="sm"
                                  aria-label="Rimuovi file"
                                  className="border-destructive/50 text-destructive hover:bg-destructive/20"
                                  onClick={() => setDeleteOpen(f.id)}
                                >
                                  <IconTrash size={16} />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeaderUI>
                                  <DialogTitleUI>Rimuovere questo file?</DialogTitleUI>
                                  <DialogDescription>Questa azione non può essere annullata.</DialogDescription>
                                </DialogHeaderUI>
                                <DialogFooter>
                                  <Button data-slot="button" variant="outline" onClick={() => setDeleteOpen(null)}>Annulla</Button>
                                  <Button data-slot="button" variant="destructive" onClick={() => { handleRemove(f.id); setDeleteOpen(null); }}>Elimina</Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Stepper lineare pulito */}
                  <div className="mt-4">
                    <div className="flex items-center gap-3">
                      {[
                        { label: "Estrazione", idx: 1 },
                        { label: "Normalizzazione", idx: 2 },
                        { label: "Generazione", idx: 3 },
                      ].map((s, i, arr) => {
                        const isActive = state.processing.running && state.processing.step === s.idx;
                        const isDone = !state.processing.running && state.hasResults;
                        return (
                          <div key={s.idx} className="flex items-center gap-3">
                            <div className={`size-7 rounded-full border flex items-center justify-center text-[11px] ${isActive ? "bg-[rgba(11,30,39,0.5)]" : ""}`} data-slot="input">
                              {s.idx}
                            </div>
                            <div className="text-xs text-muted-foreground min-w-24">{s.label}</div>
                            {i < arr.length - 1 && <div className="h-px w-10 bg-[rgba(12,18,26,0.9)]" />}
                          </div>
                        );
                      })}
                      <div className="ml-auto flex items-center gap-2">
                        {state.processing.running && <Badge variant="secondary">in corso</Badge>}
                        {!state.processing.running && state.hasResults && <Badge>completato</Badge>}
                      </div>
                    </div>
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
            <>
              <Card data-slot="card">
                <CardHeader>
                  <CardTitle className="text-base">Confronto Fornitori</CardTitle>
                  <CardDescription>Filtra, evidenzia e esporta</CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Toolbar non-sticky; solo il bottone Filter lo è */}
                  <div data-slot="toolbar" className="mb-3 mt-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button data-slot="button" variant="outline" size="sm" onClick={exportCSV}>Esporta CSV</Button>
                      <Button data-slot="button" variant="outline" size="sm" onClick={copyKeynote}>Copia in Keynote</Button>
                      <Input data-slot="input" value={savingName} onChange={(e) => setSavingName(e.target.value)} placeholder="Nome confronto" className="h-8 w-40" />
                      <Button data-slot="button" size="sm" onClick={() => { saveToArchive(savingName || "Confronto"); setJustSaved(true); }}>Salva</Button>
                      {justSaved && (
                        <div className="flex items-center gap-2 text-xs">
                          <Link to="/dashboard/archive" className="underline">Apri in Archivio</Link>
                          <button className="underline" onClick={() => navigator.clipboard.writeText(window.location.href)}>Condividi link interno</button>
                        </div>
                      )}
                      <div className="ml-auto flex items-center gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button data-slot="button" variant="outline" size="sm"><IconDotsVertical size={16} /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={exportCSV}>Esporta CSV</DropdownMenuItem>
                            <DropdownMenuItem onClick={copyKeynote}>Copia in Keynote</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { saveToArchive(savingName || "Confronto"); setJustSaved(true); }}>Salva</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <div data-slot="filter-sticky" className="inline-block">
                          <Sheet open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
                            <SheetTrigger asChild>
                              <Button data-slot="button" size="sm">
                                <IconFilter size={16} />
                                Filter
                              </Button>
                            </SheetTrigger>
                            <SheetContent side="right" className="w-full sm:max-w-md">
                            <SheetHeader>
                              <SheetTitle>Filtri</SheetTitle>
                            </SheetHeader>
                            <div className="p-4 space-y-4 overflow-y-auto">
                              <FiltersPanel />
                            </div>
                            </SheetContent>
                          </Sheet>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Executive Summary sotto la toolbar */}
                  <ExecutiveSummary />

                  {/* Contenuti principali: header vendor + tabella */}
                  <VendorsHeader />
                  <ComparisonTableWrapper />
                </CardContent>
              </Card>

              {/* Sezione Insight e Note separata */}
              <Card data-slot="card">
                <CardHeader>
                  <CardTitle className="text-base">Insight e Note</CardTitle>
                  <CardDescription>Riepiloghi, differenze e annotazioni</CardDescription>
                </CardHeader>
                <CardContent>
                  <InsightsPanel notes={notes} setNotes={setNotes} />
                </CardContent>
              </Card>
            </>
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

function ComparisonTableWrapper() {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  return <ComparisonTable collapsedGroups={collapsedGroups} setCollapsedGroups={(v) => setCollapsedGroups(v)} />;
}

function ComparisonTable({ collapsedGroups, setCollapsedGroups }: { collapsedGroups: Record<string, boolean>; setCollapsedGroups: (v: Record<string, boolean>) => void }) {
  const { state, setSort, togglePin, isPinned } = useComparison();
  const table = state.table!;

  const filteredRows = useMemo(() => {
    return state.table ? getVisibleRowsForUI(state.table) : [];
  }, [state.table]);

  const onSort = (idx: number) => {
    const direction: "asc" | "desc" = !table.sort || table.sort.columnIndex !== idx
      ? "asc"
      : (table.sort.direction === "asc" ? "desc" : "asc");
    setSort({ columnIndex: idx, direction });
  };

  const pinnedRows = filteredRows.filter((r) => table.pinnedKeys.includes(r.key));
  const nonPinnedRows = filteredRows.filter((r) => !table.pinnedKeys.includes(r.key));
  const grouped = nonPinnedRows.reduce<Record<string, typeof nonPinnedRows>>((acc, r) => {
    (acc[r.category] ||= []).push(r);
    return acc;
  }, {});
  // Mantieni visibili le intestazioni di gruppo anche quando "red flags only" nasconde tutte le righe del gruppo
  const groupOrder = Object.keys(grouped);

  const toggleGroup = (name: string) => setCollapsedGroups({ ...collapsedGroups, [name]: !collapsedGroups[name] });

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
          {filteredRows.length === 0 && (
            <TableRow>
              <TableCell colSpan={table.columns.length} className="text-center text-xs text-muted-foreground py-10">
                {state.table!.filters.showRedFlagsOnly ? (
                  <span>
                    Nessun rischio con le soglie attuali —
                    <button className="ml-1 underline" onClick={() => {/* handled nel pannello filtri */}}>modifica soglie</button>
                  </span>
                ) : (
                  "Nessun risultato per i criteri selezionati"
                )}
              </TableCell>
            </TableRow>
          )}
          {pinnedRows.length > 0 && (
            <>
              <TableRow>
                <TableCell colSpan={table.columns.length} className="text-xs uppercase tracking-wide text-muted-foreground">
                  KPI prioritarie
                </TableCell>
              </TableRow>
              {pinnedRows.map((r) => (
                <MetricRow key={`pin-${r.key}`} r={r} />
              ))}
              <TableRow>
                <TableCell colSpan={table.columns.length}>
                  <Separator />
                </TableCell>
              </TableRow>
            </>
          )}

          {Object.entries(grouped).map(([cat, rows]) => (
            <>
              <TableRow key={`h-${cat}`}>
                <TableCell colSpan={table.columns.length}>
                  <button className="mr-2 inline-flex items-center" onClick={() => toggleGroup(cat)} aria-label="Apri/Chiudi gruppo">
                    <span className={`inline-block transition-transform ${collapsedGroups[cat] ? "rotate-[-90deg]" : "rotate-0"}`}>▶</span>
                  </button>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground align-middle">{cat}</span>
                </TableCell>
              </TableRow>
              {!collapsedGroups[cat] && rows.map((r) => (
                <MetricRow key={`${cat}-${r.key}`} r={r} />
              ))}
            </>
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
      <div className="flex flex-wrap gap-2 mb-2">
        <Button data-slot="button" size="sm" variant="outline" onClick={() => setFilters({ ...filters, categories: { Performance: true, Pricing: false, Compliance: true, Supporto: true, SDK: false }, priority: "Performance" })}>Performance</Button>
        <Button data-slot="button" size="sm" variant="outline" onClick={() => setFilters({ ...filters, categories: { Performance: false, Pricing: true, Compliance: true, Supporto: true, SDK: false }, priority: "Pricing" })}>Pricing</Button>
        <Button data-slot="button" size="sm" variant="outline" onClick={() => setFilters({ ...filters, categories: { Performance: true, Pricing: true, Compliance: true, Supporto: true, SDK: false }, priority: "Compliance" })}>Compliance</Button>
        <Button data-slot="button" size="sm" variant="outline" onClick={() => setFilters({ ...filters })}>Personalizzato</Button>
      </div>
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
        <Label htmlFor="sig" className="text-sm">Soglia differenze in %</Label>
        <div className="flex items-center gap-2">
          <Input id="sig" data-slot="input" className="h-8 w-20" value={filters.significancePercent} onChange={(e) => setFilters({ ...filters, significancePercent: Number(e.target.value) || 0 })} />
          <span className="text-xs text-muted-foreground">%</span>
          <Checkbox checked={filters.showSignificantOnly} onCheckedChange={() => setFilters({ ...filters, showSignificantOnly: !filters.showSignificantOnly })} />
        </div>
      </div>
      <div className="flex items-center justify-between py-2">
        <Label className="text-sm">Priorità di analisi</Label>
        <div className="flex gap-2">
          {["Performance", "Compliance", "Pricing"].map((p) => (
            <button key={p} className={`text-xs px-2 py-1 rounded-md border ${filters.priority === p ? "bg-[rgba(11,30,39,0.5)]" : ""}`} onClick={() => setFilters({ ...filters, priority: p as any })}>{p}</button>
          ))}
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

function deltaBadge(r: { type: "numeric" | "boolean" | "text"; key: string; values: any[] }) {
  if (r.type !== "numeric") return null;
  const nums = r.values.filter((v): v is number => typeof v === "number");
  if (nums.length < 2) return null;
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  const base = isMinBetter(r.key) ? min : max;
  const spread = Math.abs(max - min);
  const denom = base === 0 ? 1 : base;
  const pct = Math.round((spread / denom) * 100);
  if (!isFinite(pct) || pct === 0) return null;
  return <Badge variant="outline">Δ {pct}%</Badge>;
}

function isCellRedFlag(r: { key: string; type: string }, value: any): boolean {
  if (r.key === "SOC2" || r.key === "GDPR") return value === false;
  if (r.key === "Support Response (hrs)") return typeof value === "number" && value > 24;
  if (r.key === "Uptime SLA (%)") return typeof value === "number" && value < 99.9;
  return false;
}

function MetricRow({ r }: { r: any }) {
  const { state, togglePin, isPinned } = useComparison();
  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          <button className="text-xs underline" onClick={() => togglePin(r.key)}>{isPinned(r.key) ? "Unpin" : "Pin"}</button>
          <span>{r.key}</span>
          {deltaBadge(r)}
          <MetricInfo keyName={r.key} />
        </div>
      </TableCell>
      {r.values.map((v: any, i: number) => (
        <TableCell key={i} className={`${bestClass(r, i, v)} ${state.table!.filters.showRedFlagsOnly && isCellRedFlag(r, v) ? "outline outline-1 outline-[--destructive]" : ""}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="truncate">{renderCell(v)}</div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-[11px] text-muted-foreground underline decoration-dotted cursor-help shrink-0">fonte</span>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="max-w-xs text-xs leading-5">
                    PDF: {state.table!.vendorMeta[i]?.source} — Pag. {Math.floor(Math.random() * 10) + 1}
                    <br />
                    “Estratto testuale di esempio dalla specifica...”
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </TableCell>
      ))}
    </TableRow>
  );
}

function VendorsHeader() {
  const { state } = useComparison();
  const vendors = state.table!.vendorMeta;
  const sla = state.table!.rows.find((r) => r.key === "Uptime SLA (%)");
  const price = state.table!.rows.find((r) => r.key === "Monthly Price ($)");
  const redCounts = redFlagCountPerVendor(state.table!);
  return (
    <div className="sticky top-[calc(var(--header-height)+4px)] z-10 bg-[--background] py-2 mb-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {vendors.map((v, i) => (
          <div key={v.vendor} className="rounded-md border p-3" data-slot="input">
            <div className="text-sm font-medium mb-1 truncate">{v.vendor}</div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>SLA {typeof sla?.values[i] === "number" ? `${sla?.values[i]}%` : "—"}</span>
              <span>Prezzo {typeof price?.values[i] === "number" ? `$${price?.values[i]}` : "—"}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-md border">{redCounts[i] ?? 0} red</span>
            </div>
            <div className="mt-2 flex gap-1 text-[10px]">
              {state.table!.rows.find((r) => r.key === "SOC2")?.values[i] !== false && <span className="px-1.5 py-0.5 rounded-md border">SOC2</span>}
              {state.table!.rows.find((r) => r.key === "GDPR")?.values[i] !== false && <span className="px-1.5 py-0.5 rounded-md border">GDPR</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function redFlagCountPerVendor(table: T): number[] {
  const counts = new Array(table.vendorMeta.length).fill(0);
  for (const r of table.rows) {
    for (let i = 0; i < table.vendorMeta.length; i++) {
      if (isCellRedFlag(r as any, r.values[i])) counts[i]++;
    }
  }
  return counts;
}

function LeftControls() {
  const { state, setFilters } = useComparison();
  const filters = state.table!.filters;
  return (
    <div className="flex flex-col gap-4 min-w-0">
      {/* Stepper e azioni sintetiche */}
      <div className="rounded-md border p-3" data-slot="input">
        <div className="text-sm font-medium mb-2">Step</div>
        <div className="grid grid-cols-3 gap-2">
          {["Estrazione", "Normalizzazione", "Generazione"].map((label, idx) => (
            <div key={label} className="rounded-md border p-2 text-center" data-slot="input">
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filtri completi */}
      <FiltersPanel />

      {/* Preset confronto */}
      <div className="rounded-md border p-3" data-slot="input">
        <div className="text-sm font-medium mb-2">Preset confronto</div>
        <div className="flex flex-wrap gap-2">
          <Button data-slot="button" size="sm" variant="outline" onClick={() => setFilters({ ...filters, categories: { Performance: true, Pricing: false, Compliance: true, Supporto: true, SDK: false }, priority: "Performance" })}>Performance</Button>
          <Button data-slot="button" size="sm" variant="outline" onClick={() => setFilters({ ...filters, categories: { Performance: false, Pricing: true, Compliance: true, Supporto: true, SDK: false }, priority: "Pricing" })}>Pricing</Button>
          <Button data-slot="button" size="sm" variant="outline" onClick={() => setFilters({ ...filters, categories: { Performance: true, Pricing: true, Compliance: true, Supporto: true, SDK: false }, priority: "Compliance" })}>Compliance</Button>
          <Button data-slot="button" size="sm" variant="outline" onClick={() => setFilters({ ...filters })}>Personalizzato</Button>
        </div>
      </div>
    </div>
  );
}

function InsightsPanel({ notes, setNotes }: { notes: string; setNotes: (v: string) => void }) {
  const { state } = useComparison();
  const table = state.table!;
  const redCounts = redFlagCountPerVendor(table);
  const hasRed = redCounts.some((n) => n > 0);

  const topDiffs = useMemo(() => {
    const numerics = table.rows.filter((r) => r.type === "numeric");
    const scored = numerics.map((r) => {
      const nums = r.values.filter((v): v is number => typeof v === "number");
      if (nums.length < 2) return { key: r.key, score: 0 };
      const max = Math.max(...nums);
      const min = Math.min(...nums);
      const denom = isMinBetter(r.key) ? (min || 1) : (max || 1);
      const pct = Math.round(((max - min) / denom) * 100);
      return { key: r.key, score: pct };
    });
    return scored.sort((a, b) => b.score - a.score).slice(0, 5);
  }, [table]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border p-3" data-slot="input">
        <div className="text-sm font-medium mb-2">Red flags</div>
        {!hasRed && table.filters.showRedFlagsOnly ? (
          <div className="text-xs text-muted-foreground">
            Nessun rischio rilevato con le soglie attuali
            <div className="mt-2"><a href="#filters" className="underline">Modifica soglie</a></div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {table.vendorMeta.map((v, i) => (
              <div key={v.vendor} className="flex items-center justify-between text-xs">
                <span>{v.vendor}</span>
                <span className="px-2 py-0.5 rounded-md border">{redCounts[i]} red</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-md border p-3" data-slot="input">
        <div className="text-sm font-medium mb-2">Top 5 differenze</div>
        <ul className="list-disc pl-4 text-xs text-muted-foreground">
          {topDiffs.map((d) => (
            <li key={d.key}>{d.key} — Δ {d.score}%</li>
          ))}
        </ul>
      </div>

      <div className="rounded-md border p-3" data-slot="input">
        <div className="text-sm font-medium mb-2">Note del confronto</div>
        <textarea className="w-full h-32 rounded-md border bg-transparent p-2 text-sm" placeholder="Scrivi note utili..." value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="mt-2 text-right text-xs text-muted-foreground">Salvato automaticamente</div>
      </div>
    </div>
  );
}

function ActiveFiltersChipsFallback() {
  const { state, setFilters } = useComparison();
  if (!state.table) return null;
  const f = state.table.filters;
  const chips: string[] = [];
  if (f.showDifferencesOnly) chips.push("Solo differenze");
  if (f.showRedFlagsOnly) chips.push("Solo red flags");
  if (f.showPinnedOnly) chips.push("Solo KPI fissati");
  chips.push(`Soglia ${f.significancePercent}%`);
  chips.push(...Object.entries(f.categories).filter(([, v]) => v).map(([k]) => k));
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <span key={c} className="text-[11px] px-2 py-0.5 rounded-md border">{c}</span>
        ))}
      </div>
      <button className="text-xs underline" onClick={() => setFilters({ ...f, query: "", showDifferencesOnly: false, showRedFlagsOnly: false, showPinnedOnly: false, showSignificantOnly: false, significancePercent: 10, categories: Object.fromEntries(Object.keys(f.categories).map((k) => [k, true])) as any })}>Reset</button>
    </div>
  );
}

