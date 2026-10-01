"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { Network, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField, FormSection } from "@/components/app/page"
import { Callout } from "@/components/app/callout"
import { ConfirmButton } from "@/components/app/confirm"
import { DataTable } from "@/components/app/data-table"
import { EmptyState } from "@/components/app/empty-state"
import { LocalDateTime } from "@/components/app/local-datetime"
import {
  createDestination,
  deleteDestination,
  type ServerDetail,
} from "@/services/api/server"

export function DestinationsSection({
  server,
  onChanged,
}: {
  server: ServerDetail
  onChanged: () => void
}) {
  const [name, setName] = useState("")
  const [network, setNetwork] = useState("peon")

  const createMut = useMutation({
    mutationFn: () => createDestination(server.id, { name, network }),
    onSuccess: async () => {
      onChanged()
      setName("")
      setNetwork("peon")
      toast.success("Destination added")
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const deleteMut = useMutation({
    mutationFn: (destId: string) => deleteDestination(server.id, destId),
    onSuccess: async () => {
      onChanged()
      toast.success("Destination deleted")
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <div className="space-y-6">
      <Callout title="What is a destination?">
        <p>
          A destination is a Docker network on this server where your apps are
          deployed. The server is the machine; the destination is which network
          those containers join so they can talk to each other and to the
          traffic gateway.
        </p>
        <p>
          Every server starts with a{" "}
          <span className="text-foreground font-medium">default</span>{" "}
          destination (network{" "}
          <span className="text-foreground font-mono">peon</span>). Add another
          if you need an isolated network for a separate set of services.
        </p>
        <div className="border-border bg-background rounded-md border px-3 py-2.5">
          <div className="text-foreground mb-1 text-sm font-medium">Example</div>
          <p>
            Deploy your marketing site and API on the{" "}
            <span className="text-foreground font-medium">default</span>{" "}
            destination so they share the{" "}
            <span className="font-mono">peon</span> network with the gateway.
            Create a second destination named{" "}
            <span className="text-foreground font-medium">staging</span> with
            network <span className="font-mono">peon-staging</span> for preview
            apps that should stay isolated from production containers on the
            same server.
          </p>
        </div>
      </Callout>

      <FormSection
        title="Add destination"
        footer={
          <Button
            onClick={() => createMut.mutate()}
            disabled={!name || createMut.isPending}
          >
            Add destination
          </Button>
        }
      >
        <FormField label="Name" htmlFor="d-name">
          <Input
            id="d-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. staging"
          />
        </FormField>
        <FormField label="Docker network" htmlFor="d-network">
          <Input
            id="d-network"
            className="font-mono"
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
            placeholder="peon"
          />
        </FormField>
      </FormSection>

      <DataTable
        columns={[
          {
            key: "name",
            header: "Name",
            cell: (d) => <span className="font-medium">{d.name}</span>,
          },
          {
            key: "network",
            header: "Network",
            cell: (d) => <span className="font-mono">{d.network}</span>,
          },
          {
            key: "created",
            header: "Created",
            cell: (d) => (
              <LocalDateTime
                value={d.createdAt}
                className="text-muted-foreground"
              />
            ),
          },
          {
            key: "actions",
            header: "",
            align: "right",
            cell: (d) => (
              <ConfirmButton
                title={`Delete destination "${d.name}"?`}
                description={`Removes this destination (Docker network ${d.network}) from Peon. Services still using it may need to be reassigned.`}
                confirmLabel="Delete"
                variant="ghost"
                disabled={deleteMut.isPending}
                onConfirm={() => deleteMut.mutate(d.id)}
              >
                <Trash2 className="size-4" /> Delete
              </ConfirmButton>
            ),
          },
        ]}
        rows={server.destinations}
        rowKey={(d) => d.id}
        emptyState={
          <EmptyState
            icon={Network}
            title="No destinations yet"
            description="Add a destination above to deploy services onto another Docker network."
          />
        }
      />
    </div>
  )
}
