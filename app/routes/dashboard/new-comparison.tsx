"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Input } from "~/components/ui/input";
import { useComparison } from "~/state/comparison";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";

export default function NewComparisonPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { state, addFiles, removeFile, startProcessing, regenerateTable, setFilters, setSort, exportCSV, copyKeynote, saveToArchive } = useComparison();
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
                <div className="flex items-center justify-between gap-3 mb-3">
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
  const { state, setSort } = useComparison();
  const table = state.table!;

  const filteredRows = useMemo(() => {
    let rows = table.rows;
    const q = table.filters.query.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.key.toLowerCase().includes(q));
    // categorie: se presenti in filters.categories
    const actives = Object.entries(table.filters.categories).filter(([, v]) => v).map(([k]) => k);
    if (actives.length) rows = rows.filter((r) => actives.includes(r.category));
    // ordinamento
    if (table.sort) {
      const { columnIndex, direction } = table.sort;
      rows = [...rows].sort((a, b) => {
        const av = columnIndex === 0 ? a.key : a.values[columnIndex - 1];
        const bv = columnIndex === 0 ? b.key : b.values[columnIndex - 1];
        const cmp = String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true, sensitivity: "base" });
        return direction === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [table]);

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
              <TableCell className="font-medium">{r.key}</TableCell>
              {r.values.map((v, i) => (
                <TableCell key={i}>{renderCell(v)}</TableCell>
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

function FiltersPanel() {
  const { state, setFilters } = useComparison();
  const filters = state.table!.filters;
  const toggle = (key: string) => setFilters({ ...filters, categories: { ...filters.categories, [key]: !filters.categories[key] } });
  return (
    <div className="rounded-md border p-3" data-slot="input">
      <div className="text-sm font-medium mb-2">Filtri</div>
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

