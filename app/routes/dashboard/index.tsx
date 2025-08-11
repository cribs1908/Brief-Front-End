"use client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { IconBrandGoogle, IconMail } from "@tabler/icons-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function Page() {
  const status = useQuery(api.integrations.getIntegrationStatus) || { googleAds: false, gmail: false };
  const reports = useQuery(api.reports.listReports, {}) || [];
  const clients = useQuery(api.clients.listClients) || [];
  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6 flex flex-col gap-4">
          {/* Blocco 1: stato integrazioni */}
          <Card data-slot="card">
            <CardHeader>
              <CardTitle className="text-base">Stato integrazioni</CardTitle>
              <CardDescription>Google Ads e Gmail</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <IntegrationStatus
                icon={<IconBrandGoogle size={18} />}
                name="Google Ads"
                connected={!!status.googleAds}
              />
              <IntegrationStatus
                icon={<IconMail size={18} />}
                name="Gmail"
                connected={!!status.gmail}
              />
            </CardContent>
          </Card>

          {/* Blocco 2: conteggi */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <StatCard title="Clienti collegati" value={String(clients.length)} subtitle="Attivi in questo workspace" />
            <StatCard title="Report ultimi 7 giorni" value={String(reports.filter(r => r.createdAt > Date.now()-7*24*60*60*1000).length)} subtitle="Generati recentemente" />
          </div>

          {/* Blocco 3: prossime automazioni */}
          <Card data-slot="card">
            <CardHeader>
              <CardTitle className="text-base">Prossime automazioni pianificate</CardTitle>
              <CardDescription>Esecuzioni previste</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Stato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[] /* placeholder: si può mostrare storico automations se necessario */}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function IntegrationStatus({ icon, name, connected }: { icon: React.ReactNode; name: string; connected: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-3" data-slot="input">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm">{name}</span>
      </div>
      <Badge variant="secondary">{connected ? "Connesso" : "Non connesso"}</Badge>
    </div>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <Card data-slot="card">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}
