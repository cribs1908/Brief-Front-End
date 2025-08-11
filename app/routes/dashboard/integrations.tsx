"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import { IconBrandGoogle, IconMail } from "@tabler/icons-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";

export default function IntegrationsPage() {
  const status = useQuery(api.integrations.getIntegrationStatus) || { googleAds: false, gmail: false };
  // Se torniamo dai callback con query ?connected=..., aggiorniamo la vista e mostriamo un toast
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) {
      toast.success(`Integrazione ${connected === "gmail" ? "Gmail" : "Google Ads"} connessa`);
      window.history.replaceState(null, "", "/dashboard/integrations");
    }
    if (error) {
      toast.error("Errore durante il collegamento");
      window.history.replaceState(null, "", "/dashboard/integrations");
    }
  }, []);
  const createGAUrl = useAction(api.integrations.createGoogleAdsOAuthUrl);
  const createGmailUrl = useAction(api.integrations.createGmailOAuthUrl);
  const disconnect = useMutation(api.integrations.disconnectIntegration);
  const [loading, setLoading] = useState<{ ga?: boolean; gmail?: boolean; dga?: boolean; dgmail?: boolean }>({});

  const handleConnectGA = async () => {
    try {
      setLoading((s) => ({ ...s, ga: true }));
      const { url } = await createGAUrl({});
      window.location.href = url;
    } catch (e: any) {
      toast.error("Connessione Google Ads fallita");
      setLoading((s) => ({ ...s, ga: false }));
    }
  };
  const handleConnectGmail = async () => {
    try {
      setLoading((s) => ({ ...s, gmail: true }));
      const { url } = await createGmailUrl({});
      window.location.href = url;
    } catch (e: any) {
      toast.error("Connessione Gmail fallita");
      setLoading((s) => ({ ...s, gmail: false }));
    }
  };
  const handleDisconnect = async (service: "google_ads" | "gmail") => {
    try {
      service === "google_ads"
        ? setLoading((s) => ({ ...s, dga: true }))
        : setLoading((s) => ({ ...s, dgmail: true }));
      await disconnect({ service });
      toast.success("Disconnesso");
    } catch (e) {
      toast.error("Operazione fallita");
    } finally {
      setLoading({});
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ServiceCard
              icon={<IconBrandGoogle size={20} />}
              title="Google Ads"
              description="Connetti in modo sicuro via OAuth con permessi di sola lettura."
              statusLabel={status.googleAds ? "Connesso" : "Non connesso"}
              primaryActionLabel={status.googleAds ? "Disconnetti" : "Connetti Google Ads"}
              onPrimaryClick={status.googleAds ? () => handleDisconnect("google_ads") : handleConnectGA}
              loading={!!loading.ga || !!loading.dga}
            />
            <ServiceCard
              icon={<IconMail size={20} />}
              title="Gmail"
              description="Collega Gmail per creare bozze email pronte all'invio."
              statusLabel={status.gmail ? "Connesso" : "Non connesso"}
              primaryActionLabel={status.gmail ? "Disconnetti" : "Connetti Gmail"}
              onPrimaryClick={status.gmail ? () => handleDisconnect("gmail") : handleConnectGmail}
              loading={!!loading.gmail || !!loading.dgmail}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ServiceCard({
  icon,
  title,
  description,
  statusLabel,
  primaryActionLabel,
  onPrimaryClick,
  loading,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  statusLabel: string;
  primaryActionLabel: string;
  onPrimaryClick?: () => void;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        <Badge variant="secondary">{statusLabel}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <CardDescription>{description}</CardDescription>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Permessi richiesti:</span>
          <ul className="list-disc pl-4">
            <li>Lettura dati</li>
            <li>Accesso limitato</li>
          </ul>
        </div>
        <Separator />
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" data-slot="button" data-variant="default" onClick={onPrimaryClick} disabled={loading}>
            {loading ? "Attendere..." : primaryActionLabel}
          </Button>
          <Button size="sm" variant="outline" data-slot="button" data-variant="outline">
            Gestisci permessi
          </Button>
        </div>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">OAuth via Google</CardFooter>
    </Card>
  );
}


