"use client"

import { useState } from "react"
import Link from "next/link"
import { useMutation, useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Activity, Cpu, HardDrive, MemoryStick, Terminal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SearchableSelect } from "@/components/ui/searchable-select"
import {
  FormField,
  FormSection,
  KeyValueList,
  Panel,
} from "@/components/app/page"
import { StatCard } from "@/components/app/stat-card"
import { LocalDateTime } from "@/components/app/local-datetime"
import {
  updateServer,
  validateServer,
  type ServerDetail,
} from "@/services/api/server"
import { listPrivateKeys } from "@/services/api/privatekey"
import { useAuthStore } from "@/store/auth"
import {
  ConnectionStep,
  ConnectionStepConnector,
} from "@/components/server/fields"

export function GeneralSection({
  server,
  onSaved,
}: {
  server: ServerDetail
  onSaved: () => void
}) {
  const workspaceId = useAuthStore((s) => s.currentWorkspaceId)
  const [name, setName] = useState(server.name)
  const [description, setDescription] = useState(server.description ?? "")
  const [ip, setIp] = useState(server.ip)
  const [port, setPort] = useState(String(server.port))
  const [user, setUser] = useState(server.user)
  const [privateKeyId, setPrivateKeyId] = useState(server.privateKeyId ?? "")
  const [wildcardDomain, setWildcardDomain] = useState(
    server.settings?.wildcardDomain ?? ""
  )
  const [proxyType, setProxyType] = useState(server.proxyType)
  const [connectionTimeout, setConnectionTimeout] = useState(
    String(server.settings?.connectionTimeout ?? 30)
  )

  const { data: keys } = useQuery({
    queryKey: ["private-keys", workspaceId],
    queryFn: () => listPrivateKeys(workspaceId!),
    enabled: !!workspaceId,
  })

  const saveMut = useMutation({
    mutationFn: () =>
      updateServer(server.id, {
        name,
        description: description || null,
        ip,
        port: Number(port) || 22,
        user,
        privateKeyId: privateKeyId || null,
        proxyType,
        wildcardDomain: wildcardDomain || null,
        connectionTimeout: Number(connectionTimeout) || 30,
      }),
    onSuccess: async () => {
      onSaved()
      toast.success("Server updated")
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const connectMut = useMutation({
    mutationFn: () =>
      validateServer(server.id, {
        ip,
        port: Number(port) || 22,
        user,
        privateKeyId: privateKeyId || null,
        connectionTimeout: Number(connectionTimeout) || 30,
      }),
    onSuccess: () => {
      onSaved()
      toast.success(
        server.isUsable
          ? "Reconnect to server started. Watch activity for live logs."
          : "Connect to server started. Watch activity for live logs."
      )
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const metrics = server.settings?.agentHostMetrics
  const agentLive = server.settings?.isAgentLive === true
  const cpu = metrics?.cpu_percent
  const mem = metrics?.memory_percent
  const disk = metrics?.disk_percent_root
  const free = disk != null ? Math.max(0, 100 - disk) : null
  const containerCount = server.settings?.agentContainers?.length
  const proxyTypeChanged = proxyType !== server.proxyType
  const proxySwitchBlocked =
    proxyTypeChanged && server.proxyStatus === "running"

  // Thresholds match the pre-redesign MetricCard: used % >= 90 red, >= 75 amber;
  // free % < 15 red, < 30 amber. No tone while the metric is unknown.
  type MetricTone = "default" | "warning" | "destructive"
  const usedTone = (pct: number | null | undefined): MetricTone =>
    pct == null ? "default" : pct >= 90 ? "destructive" : pct >= 75 ? "warning" : "default"
  const freeTone = (pct: number | null | undefined): MetricTone =>
    pct == null ? "default" : pct < 15 ? "destructive" : pct < 30 ? "warning" : "default"

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="CPU"
          icon={Cpu}
          tone={usedTone(cpu)}
          value={cpu != null ? `${Math.round(cpu)}%` : "—"}
          hint={agentLive ? "From peon-ping-pong" : "Waiting for agent"}
        />
        <StatCard
          label="RAM"
          icon={MemoryStick}
          tone={usedTone(mem)}
          value={mem != null ? `${Math.round(mem)}%` : "—"}
          hint={agentLive ? "From peon-ping-pong" : "Waiting for agent"}
        />
        <StatCard
          label="Disk used"
          icon={HardDrive}
          tone={usedTone(disk)}
          value={disk != null ? `${Math.round(disk)}%` : "—"}
          hint={
            agentLive
              ? containerCount != null
                ? `${containerCount} containers`
                : "From peon-ping-pong"
              : "Waiting for agent"
          }
        />
        <StatCard
          label="Free space"
          icon={HardDrive}
          tone={freeTone(free)}
          value={free != null ? `${Math.round(free)}%` : "—"}
          hint={agentLive ? "Root filesystem" : "Waiting for agent"}
        />
      </div>

      <Panel
        title="Connection"
        contentClassName="space-y-4"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground text-sm">
              {connectMut.isPending
                ? "Saving and connecting…"
                : "Saves host settings, then connects. Progress shows in Activity."}
            </span>
            <Button
              onClick={() => connectMut.mutate()}
              disabled={connectMut.isPending || !privateKeyId}
            >
              {server.isReachable ? "Reconnect to server" : "Connect to server"}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <ConnectionStep
            icon={Terminal}
            label="SSH"
            status={server.isReachable ? "Online" : "Offline"}
            about={
              server.isReachable
                ? "Session to this host works."
                : "Check IP, port, and key."
            }
            tone={server.isReachable ? "success" : "destructive"}
          />
          <ConnectionStepConnector />
          <ConnectionStep
            icon={HardDrive}
            label="Setup"
            status={server.isUsable ? "Ready" : "Needed"}
            about={
              server.isUsable
                ? "Docker ready for deploys."
                : "Connect to finish install."
            }
            tone={server.isUsable ? "success" : "muted"}
          />
          <ConnectionStepConnector />
          <ConnectionStep
            icon={Activity}
            label="Agent"
            status={
              agentLive
                ? "Live"
                : server.settings?.isSentinelEnabled
                  ? "Waiting"
                  : "Not installed"
            }
            about={
              agentLive
                ? "Sending host metrics."
                : server.settings?.isSentinelEnabled
                  ? "No recent heartbeat."
                  : "Installs on Connect."
            }
            tone={
              agentLive
                ? "success"
                : server.settings?.isSentinelEnabled
                  ? "warning"
                  : "muted"
            }
          />
        </div>
        <KeyValueList
          items={[
            {
              label: "Last heartbeat",
              value: server.settings?.agentLastSeenAt ? (
                <LocalDateTime value={server.settings.agentLastSeenAt} />
              ) : (
                "—"
              ),
            },
          ]}
        />
      </Panel>

      <FormSection
        title="General"
        footer={
          <Button
            onClick={() => {
              if (proxySwitchBlocked) {
                toast.error(
                  "Current gateway is running. Turn it off first, then change gateway type."
                )
                return
              }
              saveMut.mutate()
            }}
            disabled={!privateKeyId || saveMut.isPending}
          >
            Save changes
          </Button>
        }
      >
        <FormField label="Name" htmlFor="g-name">
          <Input
            id="g-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <FormField label="Description" htmlFor="g-description">
          <Input
            id="g-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
        <FormField label="User" htmlFor="g-user">
          <Input
            id="g-user"
            value={user}
            onChange={(e) => setUser(e.target.value)}
          />
        </FormField>
        <FormField
          label="IP or hostname"
          htmlFor="g-ip"
          description="IPv4, IPv6, or DNS hostname, passed straight to SSH."
        >
          <Input
            id="g-ip"
            className="font-mono"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="203.0.113.10, 2001:db8::1, or host.example.com"
          />
        </FormField>
        <FormField label="Port" htmlFor="g-port">
          <Input
            id="g-port"
            value={port}
            onChange={(e) => setPort(e.target.value)}
          />
        </FormField>
        <FormField
          label="SSH key"
          description={
            !keys?.length ? (
              <>
                No SSH keys yet.{" "}
                <Link
                  href="/keys-and-tokens"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Add one under MCP & SSH keys
                </Link>
                .
              </>
            ) : undefined
          }
        >
          <SearchableSelect
            value={privateKeyId}
            onValueChange={setPrivateKeyId}
            placeholder="Select SSH key"
            options={[
              ...(keys ?? []).map((k) => ({ value: k.id, label: k.name })),
              ...(privateKeyId &&
              !keys?.some((k) => k.id === privateKeyId) &&
              server.privateKey
                ? [
                    {
                      value: server.privateKey.id,
                      label: server.privateKey.name,
                    },
                  ]
                : []),
            ]}
          />
        </FormField>
        <FormField label="Wildcard domain" htmlFor="g-wildcard">
          <Input
            id="g-wildcard"
            placeholder="https://example.com"
            value={wildcardDomain}
            onChange={(e) => setWildcardDomain(e.target.value)}
          />
        </FormField>
        <FormField label="SSH connection timeout (s)" htmlFor="g-timeout">
          <Input
            id="g-timeout"
            value={connectionTimeout}
            onChange={(e) => setConnectionTimeout(e.target.value)}
          />
        </FormField>
        <FormField
          label="Gateway type"
          description={
            <>
              Reverse proxy Peon installs on this server to route public HTTPS
              to your apps. Choose{" "}
              <span className="text-foreground">None</span> if you only need
              SSH or private networks.
            </>
          }
        >
          <SearchableSelect
            value={proxyType}
            onValueChange={(v) => setProxyType(v as ServerDetail["proxyType"])}
            placeholder="Select gateway type"
            options={[
              { value: "TRAEFIK", label: "Traefik" },
              { value: "CADDY", label: "Caddy" },
              { value: "NONE", label: "None" },
            ]}
          />
        </FormField>
      </FormSection>
    </div>
  )
}
