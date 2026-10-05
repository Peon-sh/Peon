"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Panel } from "@/components/app/page"
import {
  Modal,
  ModalBody,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
} from "@/components/app/modal"
import {
  deleteServer,
  getServer,
  type ServerDetail,
} from "@/services/api/server"

export function DangerSection({ server }: { server: ServerDetail }) {
  const router = useRouter()
  const qc = useQueryClient()
  const [confirmName, setConfirmName] = useState("")
  const [deleteResources, setDeleteResources] = useState(false)

  // Fresh count when opening Danger — avoids stale React Query payloads from before resourceCount existed.
  const { data: live } = useQuery({
    queryKey: ["server", server.id, "danger"],
    queryFn: () => getServer(server.id),
    refetchOnMount: "always",
    staleTime: 0,
  })
  const resourceCount =
    live?.resourceCount ??
    live?._count?.services ??
    server.resourceCount ??
    server._count?.services ??
    0
  const nameMatches = confirmName.trim() === server.name
  const canDelete = nameMatches && (resourceCount === 0 || deleteResources)

  const deleteMut = useMutation({
    mutationFn: () =>
      deleteServer(server.id, {
        confirmName: confirmName.trim(),
        deleteResources: resourceCount > 0 ? deleteResources : false,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["servers"] })
      toast.success("Server deleted")
      router.push("/servers")
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <Panel
      title="Danger zone"
      description="Irreversible actions for this server."
      className="border-destructive/40"
      contentClassName="space-y-3"
      footer={
        <Modal
          onOpenChange={(open) => {
            if (!open) {
              setConfirmName("")
              setDeleteResources(false)
            }
          }}
        >
          <ModalTrigger asChild>
            <Button variant="destructive">
              <Trash2 className="size-4" /> Delete server
            </Button>
          </ModalTrigger>
          <ModalContent>
            <ModalHeader>
              <ModalTitle>Delete &quot;{server.name}&quot;?</ModalTitle>
            </ModalHeader>
            <ModalBody className="space-y-4">
              <ModalDescription>
                This removes the server from Peon. Type the server name to
                confirm.
              </ModalDescription>
              <div className="space-y-2">
                <Label htmlFor="confirm-server-name">Server name</Label>
                <Input
                  id="confirm-server-name"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={server.name}
                  autoComplete="off"
                />
              </div>
              {resourceCount > 0 ? (
                <label className="flex items-start gap-2 text-base">
                  <Checkbox
                    checked={deleteResources}
                    onCheckedChange={(v) => setDeleteResources(v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    Delete all resources ({resourceCount} total)
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      Stops containers on the host and deletes those services
                      from Peon. Without this, the server cannot be deleted.
                    </span>
                  </span>
                </label>
              ) : null}
            </ModalBody>
            <ModalFooter>
              <ModalClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </ModalClose>
              <Button
                type="button"
                variant="destructive"
                disabled={!canDelete || deleteMut.isPending}
                onClick={() => deleteMut.mutate()}
              >
                Delete server
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      }
    >
      <p className="text-base text-muted-foreground">
        Permanently remove this server from Peon
        {resourceCount > 0
          ? `, including the option to delete its ${resourceCount} service${resourceCount === 1 ? "" : "s"} and stop their containers`
          : ""}
        . This does not destroy the remote machine itself.
      </p>
      {resourceCount > 0 ? (
        <p className="text-warning text-base">
          This server has {resourceCount} resource
          {resourceCount === 1 ? "" : "s"}. You must confirm deleting them in
          the dialog before the server can be removed.
        </p>
      ) : (
        <p className="text-muted-foreground text-base">
          No services are placed on this server, so it can be deleted after name
          confirmation.
        </p>
      )}
    </Panel>
  )
}
