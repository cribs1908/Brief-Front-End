"use client";
import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Input } from "~/components/ui/input";

export default function ArchivePage() {
  const items = useMemo(() => [
    { id: "1", name: "Confronto Feature Flags", date: "2025-08-10", pdfs: 3 },
    { id: "2", name: "SDK Auth Providers", date: "2025-08-08", pdfs: 2 },
  ], []);

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
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="font-medium">{it.name}</TableCell>
                      <TableCell>{it.date}</TableCell>
                      <TableCell>{it.pdfs}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">Apri</TableCell>
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

