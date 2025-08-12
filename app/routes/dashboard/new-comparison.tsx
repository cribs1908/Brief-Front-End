"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";

type UploadedFile = {
  id: string;
  name: string;
  size: number;
  status: "caricato" | "in_coda" | "errore";
};

export default function NewComparisonPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [hasResults, setHasResults] = useState(false);

  const onSelectFiles = useCallback((list: FileList | null) => {
    if (!list) return;
    const next: UploadedFile[] = Array.from(list).map((f) => ({
      id: `${f.name}-${f.size}-${f.lastModified}`,
      name: f.name,
      size: f.size,
      status: "caricato",
    }));
    setFiles((prev) => {
      const existing = new Set(prev.map((p) => p.id));
      return [...prev, ...next.filter((n) => !existing.has(n.id))];
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    onSelectFiles(e.dataTransfer.files);
  }, [onSelectFiles]);

  const handleBrowse = useCallback(() => inputRef.current?.click(), []);
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => onSelectFiles(e.target.files), [onSelectFiles]);
  const handleRemove = useCallback((id: string) => setFiles((prev) => prev.filter((f) => f.id !== id)), []);

  const canStart = useMemo(() => files.length >= 2, [files.length]);
  const startComparison = useCallback(() => {
    // Solo frontend: mostriamo tabella placeholder coerente con front-end-structure.md
    setHasResults(true);
  }, []);

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

              {files.length > 0 && (
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
                      {files.map((f) => (
                        <TableRow key={f.id}>
                          <TableCell className="text-sm">{f.name}</TableCell>
                          <TableCell className="text-sm">{(f.size / 1024).toFixed(1)} KB</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{f.status}</TableCell>
                          <TableCell>
                            <Button data-slot="button" variant="outline" size="sm" onClick={() => handleRemove(f.id)}>Rimuovi</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="mt-4 flex justify-end">
                    <Button data-slot="button" onClick={startComparison} disabled={!canStart}>Avvia Confronto</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {hasResults && (
            <Card data-slot="card">
              <CardHeader>
                <CardTitle className="text-base">Tabella Comparativa</CardTitle>
                <CardDescription>Vista interattiva (placeholder)</CardDescription>
              </CardHeader>
              <CardContent>
                <ComparisonTable fileNames={files.map((f) => f.name)} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ComparisonTable({ fileNames }: { fileNames: string[] }) {
  const columns = ["Metrica", ...fileNames];
  const rows = [
    { key: "Feature A", values: ["Sì", "No", "Sì"] },
    { key: "Feature B", values: ["Alto", "Medio", "Basso"] },
    { key: "Supporto", values: ["Email", "Chat", "Email+Chat"] },
  ];

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c}>{c}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell className="font-medium">{r.key}</TableCell>
              {r.values.slice(0, fileNames.length).map((v, i) => (
                <TableCell key={i}>{v}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

