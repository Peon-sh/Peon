"use client"

import { SshTerminal } from "@/components/terminal/ssh-terminal"

export function TerminalSection({ serverId }: { serverId: string }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <SshTerminal serverId={serverId} className="min-h-0 flex-1" />
    </div>
  )
}
