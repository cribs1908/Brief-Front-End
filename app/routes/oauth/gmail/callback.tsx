"use client";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "~/components/ui/card";

export default function GmailOAuthReturn() {
  useEffect(() => {
    const convexUrl = import.meta.env.VITE_CONVEX_URL as string;
    const qs = window.location.search || "";
    if (convexUrl) {
      window.location.replace(`${convexUrl}/oauth/gmail/callback${qs}`);
    }
  }, []);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card data-slot="card" className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="text-base">Collegamento Gmail</CardTitle>
          <CardDescription>Reindirizzamento in corso…</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Attendi qualche secondo mentre completiamo il collegamento.
        </CardContent>
      </Card>
    </div>
  );
}


