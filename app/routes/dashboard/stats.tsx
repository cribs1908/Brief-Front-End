"use client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "~/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

const data = [
  { name: "Feature A", value: 72 },
  { name: "Feature B", value: 54 },
  { name: "Supporto", value: 38 },
  { name: "SLA", value: 26 },
];

export default function StatsPage() {
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
              <ChartContainer
                config={{ value: { label: "Ricorrenza (%)", color: "#9CC7D8" } }}
                className="h-[260px]"
              >
                <BarChart data={data} margin={{ left: 12, right: 12 }}>
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

