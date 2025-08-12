"use client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "~/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useComparison } from "~/state/comparison";

export default function StatsPage() {
  const { state, exportCSV } = useComparison();
  // mock: conteggio ricorrenze di alcune metriche
  const topMetrics = (() => {
    const counts = new Map<string, number>();
    for (const row of state.table?.rows || []) counts.set(row.key, (counts.get(row.key) || 0) + 1);
    return Array.from(counts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  })();

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6 flex flex-col gap-4">
          <Card data-slot="card">
            <CardHeader>
              <CardTitle className="text-base">Statistiche</CardTitle>
              <CardDescription>Insight aggregati (placeholder)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-muted-foreground">Dati fittizi per demo UX</div>
                <button className="underline text-sm" onClick={exportCSV}>Esporta CSV</button>
              </div>
              <ChartContainer config={{ value: { label: "Ricorrenza (conteggi)", color: "#9CC7D8" } }} className="h-[260px]">
                <BarChart data={topMetrics} margin={{ left: 12, right: 12 }}>
                  <CartesianGrid vertical={false} stroke="#0C121A" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} interval={0} angle={0} dy={6} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                  <Bar dataKey="value" fill="#9CC7D8" radius={[4, 4, 0, 0]} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

