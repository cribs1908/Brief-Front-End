"use client";
import { useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { useComparison } from "~/state/comparison";
import { Link, useNavigate } from "react-router";

export default function Page() {
  const { state, addFiles } = useComparison();
  const navigate = useNavigate();

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length >= 2) {
      addFiles(files);
      navigate("/dashboard/new-comparison");
    }
  }, [addFiles, navigate]);

  const recent = state.archive.slice(0, 5);

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6 flex flex-col gap-4">
          <Card data-slot="card">
            <CardHeader>
              <CardTitle className="text-base">Dashboard</CardTitle>
              <CardDescription>Benvenuto nel PDF Comparison Tool</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                Carica PDF da "Nuovo Confronto" per iniziare. Troverai i tuoi confronti in "Archivio" e gli insight in "Statistiche".
              </div>
            </CardContent>
          </Card>

          <Card data-slot="card">
            <CardHeader>
              <CardTitle className="text-base">Caricamento rapido</CardTitle>
              <CardDescription>Trascina qui 2–3 PDF per iniziare subito</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="rounded-md border border-[--border] bg-[rgba(12,18,26,0.3)] p-6 text-center"
                data-slot="input"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <div className="text-sm text-muted-foreground">Rilascia i file qui per aprire "Nuovo Confronto" già popolato</div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card data-slot="card">
              <CardHeader>
                <CardTitle className="text-base">Confronti recenti</CardTitle>
                <CardDescription>Ultimi 5</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>PDF</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recent.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{new Date(r.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>{r.files.length}</TableCell>
                        <TableCell className="text-right text-sm">
                          <Link to={`/dashboard/archive`}>Apri</Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card data-slot="card">
              <CardHeader>
                <CardTitle className="text-base">Mappa sinonimi</CardTitle>
                <CardDescription>Stato (placeholder)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">Voci mappate: {Object.keys(state.synonyms).length}</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
