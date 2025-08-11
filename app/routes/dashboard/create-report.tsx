"use client";
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Label } from "~/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";

export default function CreateReportPage() {
  const clients = useQuery(api.clients.listClients) || [];
  const [client, setClient] = useState<string>("");
  const TEST_CLIENT_VALUE = "__CLIENTE_TEST__";
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [language, setLanguage] = useState("it");
  const [tone, setTone] = useState("amichevole");
  const [signature, setSignature] = useState("Team Agenzia\nFirma standard");
  const [model, setModel] = useState("gpt-4o-mini");
  const [notes, setNotes] = useState("");
  const generate = useAction(api.reports.generateReport);
  const createDraft = useAction(api.reports.createGmailDraft);
  const ensureTestClient = useMutation(api.clients.ensureTestClient);
  const sendNow = useAction(api.reports.sendGmailMessage as any);
  const [loading, setLoading] = useState<{ gen?: boolean; draft?: boolean; dl?: boolean }>({});
  const selectedClient = useMemo(() => clients.find((c) => c._id === client), [clients, client]);
  const [lastReportId, setLastReportId] = useState<string | null>(null);

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6 flex flex-col gap-4">
          {/* Step 1 */}
          <Card data-slot="card">
            <CardHeader>
              <CardTitle className="text-base">Step 1 — Selezione cliente e periodo</CardTitle>
              <CardDescription>Identifica il cliente e il range temporale del report.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="flex flex-col gap-2">
                <Label>Cliente</Label>
                <Select
                  value={client}
                  onValueChange={async (val) => {
                    if (val === TEST_CLIENT_VALUE) {
                      try {
                        const test: any = await ensureTestClient({} as any);
                        if (test && test._id) setClient(test._id);
                      } catch {
                        toast.error("Errore creazione cliente di test");
                      }
                      return;
                    }
                    setClient(val);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TEST_CLIENT_VALUE}>Cliente di test (mock)</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Periodo (da)</Label>
                <Input value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} type="date" data-slot="input" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Periodo (a)</Label>
                <Input value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} type="date" data-slot="input" />
              </div>
            </CardContent>
          </Card>

          {/* Step 2 */}
          <Card data-slot="card">
            <CardHeader>
              <CardTitle className="text-base">Step 2 — Lingua e tono</CardTitle>
              <CardDescription>Personalizza la comunicazione per il cliente.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="flex flex-col gap-2">
                <Label>Lingua</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="it">Italiano</SelectItem>
                    <SelectItem value="en">Inglese</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Tono</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="formale">Formale</SelectItem>
                    <SelectItem value="amichevole">Amichevole</SelectItem>
                    <SelectItem value="diretto">Diretto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Modello AI</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona modello" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4o-mini">GPT-4o mini</SelectItem>
                    <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                    <SelectItem value="o4-mini">o4-mini (reasoning light)</SelectItem>
                    <SelectItem value="o3-mini">o3-mini (reasoning)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Step 3 */}
          <Card data-slot="card">
            <CardHeader>
              <CardTitle className="text-base">Step 3 — Anteprima report</CardTitle>
              <CardDescription>Rivedi e modifica firma o note.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <Tabs defaultValue="preview" className="w-full">
                <TabsList>
                  <TabsTrigger value="preview">Anteprima</TabsTrigger>
                  <TabsTrigger value="html">HTML</TabsTrigger>
                </TabsList>
                <TabsContent value="preview" className="space-y-6">
                  <Section title="5 Win" items={["CTR in aumento del 12%","CPA ridotto del 9%","ROAS +15%","Top campaign: Brand IT","Clic +8% rispetto al periodo precedente"]} />
                  <Section title="5 Rischi" items={["Calo conversioni su Search Generic (-7%)","CPC in aumento su Shopping","Campagna Display con bassa qualità","Budget limitato su Brand","ROAS instabile su Smart Shopping"]} />
                  <Section title="3 Azioni" items={["Aumentare budget su Brand del 10%","Bloccare keyword con bassa qualità","Testare nuove creatività per Display"]} />
                </TabsContent>
                <TabsContent value="html">
                  <pre className="text-xs whitespace-pre-wrap text-muted-foreground">
{`<h3>Win</h3>
<ul>
  <li>CTR in aumento del 12%</li>
  <li>CPA ridotto del 9%</li>
  <li>ROAS +15%</li>
  <li>Top campaign: Brand IT</li>
  <li>Clic +8% rispetto al periodo precedente</li>
</ul>
<h3>Rischi</h3>
<ul>
  <li>Calo conversioni su Search Generic (-7%)</li>
  <li>CPC in aumento su Shopping</li>
  <li>Campagna Display con bassa qualità</li>
  <li>Budget limitato su Brand</li>
  <li>ROAS instabile su Smart Shopping</li>
</ul>
<h3>Azioni</h3>
<ul>
  <li>Aumentare budget su Brand del 10%</li>
  <li>Bloccare keyword con bassa qualità</li>
  <li>Testare nuove creatività per Display</li>
</ul>`}
                  </pre>
                </TabsContent>
              </Tabs>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label>Firma</Label>
                  <textarea
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                    rows={4}
                    data-slot="input"
                    className="min-h-24 w-full rounded-md border bg-transparent p-2 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Note</Label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    placeholder="Note interne opzionali"
                    data-slot="input"
                    className="min-h-24 w-full rounded-md border bg-transparent p-2 text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 4 */}
          <div className="flex gap-2">
            <Button size="sm" data-slot="button" data-variant="default" disabled={!client || !periodFrom || !periodTo || loading.gen}
              onClick={async () => {
                try {
                  setLoading((s) => ({ ...s, gen: true }));
                  const report = await generate({
                    clientId: client as any,
                    periodStart: new Date(periodFrom).getTime(),
                    periodEnd: new Date(periodTo).getTime(),
                    language,
                    tone,
                    signature,
                    notes,
                    model,
                  });
                  setLastReportId(report?._id || null);
                  toast.success("Report generato");
                } catch (e) {
                  toast.error("Errore generazione");
                } finally {
                  setLoading((s) => ({ ...s, gen: false }));
                }
              }}>
              {loading.gen ? "Generazione..." : "Genera"}
            </Button>
            <Button size="sm" variant="outline" data-slot="button" data-variant="outline" disabled={!lastReportId || loading.draft}
              onClick={async () => {
                try {
                  setLoading((s) => ({ ...s, draft: true }));
                  const sender = prompt("Email mittente (Gmail)") || "";
                  const recipient = prompt("Email destinatario") || "";
                  if (!sender || !recipient) return;
                  await createDraft({ reportId: lastReportId as any, senderEmail: sender, recipientEmail: recipient });
                  toast.success("Bozza creata in Gmail");
                } catch {
                  toast.error("Errore creazione bozza");
                } finally {
                  setLoading((s) => ({ ...s, draft: false }));
                }
              }}>
              {loading.draft ? "Creazione..." : "Apri in Gmail"}
            </Button>
            <Button size="sm" variant="outline" data-slot="button" data-variant="outline" disabled={!lastReportId || loading.dl}
              onClick={async () => {
                try {
                  setLoading((s) => ({ ...s, dl: true }));
                  const sender = prompt("Email mittente (Gmail)") || "";
                  const recipient = prompt("Email destinatario") || "";
                  if (!sender || !recipient) return;
                  await sendNow({ reportId: lastReportId as any, senderEmail: sender, recipientEmail: recipient } as any);
                  toast.success("Email inviata");
                } catch {
                  toast.error("Errore invio email");
                } finally {
                  setLoading((s) => ({ ...s, dl: false }));
                }
              }}>
              Invia
            </Button>
            <Button size="sm" variant="outline" data-slot="button" data-variant="outline" disabled={!lastReportId}
              onClick={() => {
                window.open(`/api/reports/download/eml?id=${lastReportId}`, "_blank");
              }}>
              .eml
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold tracking-tight">{title}</h3>
      <ul className="list-disc pl-5 marker:text-foreground/70 space-y-1">
        {items.map((item, idx) => (
          <li key={idx} className="text-sm text-muted-foreground">{item}</li>
        ))}
      </ul>
    </div>
  );
}


