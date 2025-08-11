"use client";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { toast } from "sonner";

export default function ClientsPage() {
  const clients = useQuery(api.clients.listClients) || [];
  const createClient = useMutation(api.clients.createClient);
  const updateClient = useMutation(api.clients.updateClient);
  const [openNew, setOpenNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", googleAdsCustomerId: "", language: "it", tone: "amichevole", signature: "" });

  const onSave = async () => {
    try {
      setSaving(true);
      await createClient({
        name: form.name,
        googleAdsCustomerId: form.googleAdsCustomerId || undefined,
        preferences: {
          language: form.language,
          tone: form.tone,
          signature: form.signature,
        },
      });
      toast.success("Cliente creato");
      setOpenNew(false);
      setForm({ name: "", googleAdsCustomerId: "", language: "it", tone: "amichevole", signature: "" });
    } catch (e) {
      toast.error("Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6 flex flex-col gap-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Clienti e account</CardTitle>
                  <CardDescription>Gestione multi-cliente e preferenze per report.</CardDescription>
                </div>
                <Button size="sm" data-slot="button" data-variant="default" onClick={() => setOpenNew((o) => !o)}>
                  {openNew ? "Chiudi" : "Aggiungi cliente"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {openNew && (
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 border p-3 rounded-md" data-slot="input">
                  <div className="flex flex-col gap-1">
                    <Label>Nome</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label>Google Ads ID</Label>
                    <Input placeholder="123-456-7890" value={form.googleAdsCustomerId} onChange={(e) => setForm({ ...form, googleAdsCustomerId: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label>Lingua</Label>
                    <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="it">Italiano</SelectItem>
                        <SelectItem value="en">Inglese</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label>Tono</Label>
                    <Select value={form.tone} onValueChange={(v) => setForm({ ...form, tone: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="formale">Formale</SelectItem>
                        <SelectItem value="amichevole">Amichevole</SelectItem>
                        <SelectItem value="diretto">Diretto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1 md:col-span-5">
                    <Label>Firma</Label>
                    <textarea value={form.signature} onChange={(e) => setForm({ ...form, signature: e.target.value })} rows={3} data-slot="input" className="min-h-20 rounded-md border bg-transparent p-2 text-sm" />
                  </div>
                  <div className="md:col-span-5 flex gap-2">
                    <Button size="sm" data-slot="button" data-variant="default" onClick={onSave} disabled={saving}>{saving ? "Salvataggio..." : "Salva"}</Button>
                  </div>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Account Google Ads</TableHead>
                    <TableHead>Lingua</TableHead>
                    <TableHead>Tono</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((c) => (
                    <TableRow key={c._id}>
                      <TableCell>{c.name}</TableCell>
                      <TableCell>{c.googleAdsCustomerId || "—"}</TableCell>
                      <TableCell>{c.preferences?.language?.toUpperCase() || "—"}</TableCell>
                      <TableCell>{c.preferences?.tone || "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" data-slot="button" data-variant="outline" onClick={async () => {
                            const newId = prompt("Google Ads ID", c.googleAdsCustomerId || "");
                            if (newId === null) return;
                            try {
                              await updateClient({ clientId: c._id, googleAdsCustomerId: newId || undefined });
                              toast.success("Aggiornato");
                            } catch {
                              toast.error("Errore aggiornamento");
                            }
                          }}>Preferenze</Button>
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


