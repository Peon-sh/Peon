"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { Check, LoaderCircle, X } from "lucide-react"
import { Panel } from "@/components/app/page"
import { LocalDateTime } from "@/components/app/local-datetime"
import {
  listServerLogs,
  type ServerOperationLog,
} from "@/services/api/server"
import { cn } from "@/lib/utils"

export function TabWithActivity({
  serverId,
  children,
}: {
  serverId: string
  children: ReactNode
}) {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">{children}</div>
      <ServerActivityPanel serverId={serverId} />
    </div>
  )
}

export function ServerActivityPanel({ serverId }: { serverId: string }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["server-logs", serverId],
    queryFn: () => listServerLogs(serverId),
    refetchInterval: 2000,
  })

  // Newest first so the latest step is visible without scrolling.
  const ordered = [...logs].reverse()
  const latest = logs[logs.length - 1]
  const runStartedAt = latest
    ? (logs.find((l) => l.sessionId === latest.sessionId)?.createdAt ??
      logs[0]?.createdAt)
    : null

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = 0
  }, [latest?.id, ordered.length])

  return (
    <aside className="flex min-h-0 w-full flex-col xl:sticky xl:top-0 xl:self-start">
      <Panel
        title="Activity"
        padded={false}
        className="flex h-[min(70vh,calc(100svh-8rem))] min-h-0 flex-col xl:h-[calc(100svh-3rem-3rem)]"
        contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="shrink-0 border-b px-4 py-2.5">
          <div className="text-base font-medium">
            {latest ? operationTitle(latest.operation) : "No operation yet"}
          </div>
          {runStartedAt ? (
            <div className="text-muted-foreground mt-0.5 text-sm">
              Latest run started{" "}
              <LocalDateTime value={runStartedAt} style="time" />
              <span> · newest first</span>
            </div>
          ) : null}
        </div>
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
        >
          {isLoading ? (
            <p className="text-muted-foreground text-sm">
              Loading activity…
            </p>
          ) : ordered.length ? (
            <div className="space-y-3">
              {ordered.map((log) => (
                <StepLine
                  key={log.id}
                  log={log}
                  isLatest={log.id === latest?.id}
                />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Connect to server or manage the gateway to see the latest run
              here.
            </p>
          )}
        </div>
      </Panel>
    </aside>
  )
}

function operationTitle(operation: string): string {
  if (operation === "validate") return "Connection check"
  if (operation.startsWith("proxy.")) {
    const action = operation.replace("proxy.", "")
    if (action === "start") return "Turn on gateway"
    if (action === "stop") return "Turn off gateway"
    if (action === "restart") return "Reload gateway"
    return `Gateway ${action}`
  }
  if (operation === "cleanup") return "Cleanup server"
  return operation
}

function stepState(
  log: ServerOperationLog,
  isLatest: boolean
): "done" | "running" | "error" {
  if (log.level === "error") return "error"
  const doneWords = [
    "queued",
    "ok",
    "ready",
    "completed",
    "started",
    "stopped",
    "installed",
  ]
  if (doneWords.some((word) => log.message.toLowerCase().includes(word)))
    return "done"
  return isLatest ? "running" : "done"
}

function StepLine({
  log,
  isLatest,
}: {
  log: ServerOperationLog
  isLatest: boolean
}) {
  const state = stepState(log, isLatest)
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
        {state === "error" ? (
          <X className="size-4 text-destructive" />
        ) : state === "running" ? (
          <LoaderCircle className="size-4 text-muted-foreground animate-spin" />
        ) : (
          <Check className="text-success size-4" />
        )}
      </span>
      <div className="min-w-0">
        <div
          className={cn(
            "font-mono text-sm leading-5 break-words",
            state === "error" ? "text-destructive" : "text-foreground"
          )}
        >
          {log.message}
        </div>
        <div className="text-muted-foreground mt-0.5 font-mono text-xs">
          <LocalDateTime value={log.createdAt} style="time" />
        </div>
      </div>
    </div>
  )
}
