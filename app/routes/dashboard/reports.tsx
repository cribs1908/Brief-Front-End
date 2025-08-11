"use client";
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function ReportsPage() {
  const clients = useQuery(api.clients.listClients) || [];
  const [client, setClient] = useState<string>("tutti");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const fromMs = useMemo(() => (from ? new Date(from).getTime() : undefined), [from]);
  const toMs = useMemo(() => (to ? new Date(to).getTime() : undefined), [to]);
  const reports = useQuery(api.reports.listReports, {
    clientId: client !== "tutti" ? (client as any) : undefined,
    from: fromMs,
    to: toMs,
  }) || [];
  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6 flex flex-col gap-4">
          {/* Filtri */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filtri</CardTitle>
              <CardDescription>Per cliente e periodo</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-5">
              <div className="flex flex-col gap-2">
                <Label>Cliente</Label>
                <Select value={client} onValueChange={setClient}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tutti" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tutti">Tutti</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Periodo (da)</Label>
                <Input type="date" data-slot="input" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Periodo (a)</Label>
                <Input type="date" data-slot="input" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button size="sm" data-slot="button" data-variant="default">Applica</Button>
              </div>
            </CardContent>
          </Card>

          {/* Tabella report */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reports</CardTitle>
              <CardDescription>Elenco dei report generati</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Periodo</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((r) => (
                    <TableRow key={r._id}>
                      <TableCell>{new Date(r.createdAt).toISOString().slice(0,10)}</TableCell>
                      <TableCell>{(clients.find((c) => c._id === r.clientId)?.name) || "—"}</TableCell>
                      <TableCell>{new Date(r.periodStart).toISOString().slice(0,10)} – {new Date(r.periodEnd).toISOString().slice(0,10)}</TableCell>
                      <TableCell>{r.status === "bozza" ? "Bozza salvata" : r.status}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" data-slot="button" data-variant="outline" onClick={() => window.open(`/api/reports/download/eml?id=${r._id}`, "_blank")}>.eml</Button>
                          <Button size="sm" variant="outline" data-slot="button" data-variant="outline" disabled>.pdf</Button>
                        </div>
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


