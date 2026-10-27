import { MessageCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WHATSAPP_PK, WHATSAPP_US, whatsappLink } from "@/lib/license";

/**
 * Full security lock screen shown when the 1-device license lock, an expired
 * key or a revocation blocks access to the workspace.
 */
export function LicenseLockScreen({
  message,
  detail,
  onSignOut,
}: {
  message: string;
  detail?: string | null;
  onSignOut?: () => void | Promise<void>;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-lg border-destructive/40">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <ShieldAlert className="h-7 w-7 text-destructive" aria-hidden />
          </div>
          <CardTitle className="text-xl font-bold leading-relaxed">{message}</CardTitle>
          {detail ? <CardDescription>{detail}</CardDescription> : null}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Button asChild className="gradient-brand text-white">
              <a href={whatsappLink(WHATSAPP_PK, "Assalam o Alaikum! Mujhe apni HCM Lite license ke bare mein batana hai.")} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" /> WhatsApp (PK) +92-3140263346
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={whatsappLink(WHATSAPP_US, "Hello! I need help with my HCM Lite license.")} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" /> WhatsApp (US) +1-775-312-8079
              </a>
            </Button>
          </div>
          {onSignOut ? (
            <Button variant="ghost" className="w-full" onClick={() => void onSignOut()}>
              Sign out
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
