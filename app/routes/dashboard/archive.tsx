"use client";
import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Input } from "~/components/ui/input";
import { useComparison } from "~/state/comparison";

export default function ArchivePage() {
  const { state, loadFromArchive, deleteFromArchive } = useComparison();
  const items = useMemo(() => state.archive, [state.archive]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6 flex flex-col gap-4">
          <Card data-slot="card">
            <CardHeader>
              <CardTitle className="text-base">Archivio</CardTitle>
              <CardDescription>I tuoi confronti salvati</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Input data-slot="input" placeholder="Cerca per nome..." />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>PDF</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="font-medium">{it.name}</TableCell>
                      <TableCell>{new Date(it.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>{it.files.length}</TableCell>
                      <TableCell className="text-right text-sm">
                        <button className="underline mr-3" onClick={() => loadFromArchive(it.id)}>Apri</button>
                        <button className="underline mr-3" onClick={() => { /* duplicazione simulata */ }}>Duplica</button>
                        <button className="underline text-red-400" onClick={() => deleteFromArchive(it.id)}>Elimina</button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

