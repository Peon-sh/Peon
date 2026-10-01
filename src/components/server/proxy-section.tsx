"use client"

import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { FormField, FormSection } from "@/components/app/page"
import { StatusBadge } from "@/components/app/status-badge"
import { proxyAction, type ServerDetail } from "@/services/api/server"

export function ProxySection({
  server,
  onChanged,
}: {
  server: ServerDetail
  onChanged: () => void
}) {
  const actionMut = useMutation({
    mutationFn: (action: "start" | "stop" | "restart") =>
      proxyAction(server.id, action),
    onSuccess: async (_res, action) => {
      onChanged()
      const label =
        action === "stop"
          ? "Turning off gateway"
          : action === "restart"
            ? "Reloading gateway"
            : "Turning on gateway"
      toast.success(`${label}. Watch activity for live logs.`)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const gatewayName =
    server.proxyType === "CADDY"
      ? "Caddy"
      : server.proxyType === "NONE"
        ? null
        : "Traefik"
  const isOn = server.proxyStatus === "running"

  return (
    <FormSection
      title="Traffic gateway"
      description={
        gatewayName
          ? `The gateway (${gatewayName}) receives public HTTPS traffic and routes each domain to the right app container. Peon installs and manages it on this server.`
          : "No gateway is configured for this server. Change Gateway type under General if you want public HTTPS routing."
      }
      footer={
        server.proxyType !== "NONE" ? (
          <>
            <Button
              onClick={() => actionMut.mutate("start")}
              disabled={actionMut.isPending || isOn}
            >
              Turn on
            </Button>
            <Button
              variant="outline"
              onClick={() => actionMut.mutate("restart")}
              disabled={actionMut.isPending || !isOn}
            >
              Reload
            </Button>
            <Button
              variant="outline"
              onClick={() => actionMut.mutate("stop")}
              disabled={actionMut.isPending || !isOn}
            >
              Turn off
            </Button>
          </>
        ) : undefined
      }
    >
      <FormField label="Status">
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge
            status={
              isOn
                ? "On"
                : server.proxyStatus === "exited"
                  ? "Off"
                  : server.proxyStatus.charAt(0).toUpperCase() +
                    server.proxyStatus.slice(1)
            }
            tone={isOn ? "success" : "muted"}
          />
          {gatewayName ? (
            <span className="text-muted-foreground text-sm">{gatewayName}</span>
          ) : null}
        </span>
      </FormField>
      <FormField label="Actions">
        <div className="text-muted-foreground space-y-1 text-sm">
          <p>
            <span className="text-foreground font-medium">Turn on</span>{" "}
            installs and starts the gateway so domains can reach your apps.
          </p>
          <p>
            <span className="text-foreground font-medium">Reload</span>{" "}
            restarts the gateway with the current config (a brief blip is
            possible).
          </p>
          <p>
            <span className="text-foreground font-medium">Turn off</span> stops
            public routing on this server (apps keep running locally).
          </p>
        </div>
      </FormField>
    </FormSection>
  )
}
