"use client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Label } from "~/components/ui/label";
import { Checkbox } from "~/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SelectItem as Item } from "~/components/ui/select";
import { toast } from "sonner";

export default function SchedulingPage() {
  const automations = useQuery(api.automations.listAutomations) || [];
  const clients = useQuery(api.clients.listClients) || [];
  const upsertGlobal = useMutation(api.automations.upsertGlobalAutomation);
  const upsertClient = useMutation(api.automations.upsertClientAutomation);
  const [enabled, setEnabled] = useState(false);
  const [day, setDay] = useState("monday");
  const [time, setTime] = useState("09:00");
  const dayMap: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const [saving, setSaving] = useState(false);
  const nextRows = useMemo(() => {
    return automations.map((a) => {
      const cl = a.clientId ? clients.find((c) => c._id === a.clientId)?.name : "Tutti i clienti";
      const dayName = Object.keys(dayMap).find((k) => dayMap[k] === a.dayOfWeek) || "";
      return { client: cl, day: capitalize(dayName), time: a.timeOfDay, next: "—" };
    });
  }, [automations, clients]);

  const onSaveGlobal = async () => {
    try {
      setSaving(true);
      await upsertGlobal({ enabled, dayOfWeek: dayMap[day], timeOfDay: time });
      toast.success("Schedulazione salvata");
    } catch {
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
              <CardTitle className="text-base">Automazione globale</CardTitle>
              <CardDescription>Imposta l'invio automatico per tutti i clienti</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="flex items-center gap-2 md:col-span-4">
                <Checkbox id="enable" checked={enabled} onCheckedChange={(v) => setEnabled(!!v)} />
                <Label htmlFor="enable">Abilita schedulazione</Label>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Giorno</Label>
                <Select value={day} onValueChange={setDay}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monday">Lunedì</SelectItem>
                    <SelectItem value="tuesday">Martedì</SelectItem>
                    <SelectItem value="wednesday">Mercoledì</SelectItem>
                    <SelectItem value="thursday">Giovedì</SelectItem>
                    <SelectItem value="friday">Venerdì</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Orario</Label>
                <Select value={time} onValueChange={setTime}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }).map((_, i) => {
                      const hour = String(i).padStart(2, "0");
                      return (
                        <SelectItem key={hour} value={`${hour}:00`}>{hour}:00</SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-4">
                <Button size="sm" data-slot="button" data-variant="default" onClick={onSaveGlobal} disabled={saving}>
                  {saving ? "Salvataggio..." : "Salva schedulazione"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Automazioni per cliente</CardTitle>
              <CardDescription>Elenco e prossime esecuzioni</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Giorno</TableHead>
                    <TableHead>Ora</TableHead>
                    <TableHead>Prossima esecuzione</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nextRows.map((row) => (
                    <TableRow key={`${row.client}-${row.time}`}>
                      <TableCell>{row.client}</TableCell>
                      <TableCell>{row.day}</TableCell>
                      <TableCell>{row.time}</TableCell>
                      <TableCell>{row.next}</TableCell>
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

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}


