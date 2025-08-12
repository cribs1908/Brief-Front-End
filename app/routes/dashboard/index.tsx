"use client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

export default function Page() {
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
        </div>
      </div>
    </div>
  );
}
