"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField, FormSection } from "@/components/app/page"
import { ConfirmButton } from "@/components/app/confirm"
import {
  cleanupServer,
  updateServer,
  type ServerDetail,
} from "@/services/api/server"
import { NumberField, ToggleRow } from "@/components/server/fields"

export function AdvancedSection({
  server,
  onSaved,
}: {
  server: ServerDetail
  onSaved: () => void
}) {
  const qc = useQueryClient()
  const [forceDockerCleanup, setForceDockerCleanup] = useState(
    server.settings?.forceDockerCleanup ?? false
  )
  const [deleteUnusedVolumes, setDeleteUnusedVolumes] = useState(
    server.settings?.deleteUnusedVolumes ?? false
  )
  const [deleteUnusedNetworks, setDeleteUnusedNetworks] = useState(
    server.settings?.deleteUnusedNetworks ?? false
  )
  const [concurrentBuilds, setConcurrentBuilds] = useState(
    String(server.settings?.concurrentBuilds ?? 2)
  )
  const [deploymentQueueLimit, setDeploymentQueueLimit] = useState(
    String(server.settings?.deploymentQueueLimit ?? 25)
  )
  const [dockerCleanupFrequency, setDockerCleanupFrequency] = useState(
    server.settings?.dockerCleanupFrequency ?? "0 0 * * *"
  )
  const [dockerCleanupThreshold, setDockerCleanupThreshold] = useState(
    String(server.settings?.dockerCleanupThreshold ?? 80)
  )

  const saveMut = useMutation({
    mutationFn: () =>
      updateServer(server.id, {
        forceDockerCleanup,
        deleteUnusedVolumes,
        deleteUnusedNetworks,
        concurrentBuilds: Number(concurrentBuilds) || 2,
        deploymentQueueLimit: Number(deploymentQueueLimit) || 25,
        dockerCleanupFrequency,
        dockerCleanupThreshold: Number(dockerCleanupThreshold) || 80,
      }),
    onSuccess: async () => {
      onSaved()
      toast.success("Advanced server settings saved")
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const cleanupMut = useMutation({
    mutationFn: () => cleanupServer(server.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["server-logs", server.id] })
      toast.success("Cleanup started. Watch activity for live logs.")
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const savedVolumes = server.settings?.deleteUnusedVolumes ?? false
  const savedNetworks = server.settings?.deleteUnusedNetworks ?? false

  const saveFooter = (
    <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
      Save advanced settings
    </Button>
  )

  return (
    <div className="space-y-6">
      <FormSection title="Build and deployment limits" footer={saveFooter}>
        <NumberField
          label="Concurrent builds"
          value={concurrentBuilds}
          onChange={setConcurrentBuilds}
        />
        <NumberField
          label="Deployment queue limit"
          value={deploymentQueueLimit}
          onChange={setDeploymentQueueLimit}
        />
      </FormSection>

      <FormSection
        title="Docker cleanup"
        footer={
          <>
            <ConfirmButton
              title="Trigger Docker cleanup?"
              description={
                <>
                  This will prune unused images, builders, and stopped
                  containers on this server.
                  {savedVolumes
                    ? " Unused volumes will also be deleted."
                    : " Unused volumes are kept (toggle is off in saved settings)."}
                  {savedNetworks
                    ? " Unused networks will also be deleted."
                    : " Unused networks are kept (toggle is off in saved settings)."}{" "}
                  Save advanced settings first if you changed the volume/network
                  toggles.
                </>
              }
              confirmLabel="Trigger cleanup"
              variant="outline"
              confirmVariant="default"
              size="default"
              disabled={cleanupMut.isPending}
              onConfirm={() => cleanupMut.mutate()}
            >
              {cleanupMut.isPending ? "Starting…" : "Trigger manual cleanup"}
            </ConfirmButton>
            {saveFooter}
          </>
        }
      >
        <ToggleRow
          label="Force Docker cleanup"
          description="When enabled, scheduled cleanups always prune unused images, builders, and containers. When disabled, cleanup only runs if disk usage meets the threshold below."
          checked={forceDockerCleanup}
          onCheckedChange={setForceDockerCleanup}
        />
        <FormField label="Cleanup cron" htmlFor="cleanup-frequency">
          <Input
            id="cleanup-frequency"
            className="font-mono"
            value={dockerCleanupFrequency}
            onChange={(e) => setDockerCleanupFrequency(e.target.value)}
          />
        </FormField>
        {!forceDockerCleanup ? (
          <NumberField
            label="Cleanup threshold (%)"
            value={dockerCleanupThreshold}
            onChange={setDockerCleanupThreshold}
          />
        ) : null}
        <ToggleRow
          label="Delete unused volumes"
          description="Permanently removes volumes not attached to running containers. Data from stopped containers can be lost."
          checked={deleteUnusedVolumes}
          onCheckedChange={setDeleteUnusedVolumes}
        />
        <ToggleRow
          label="Delete unused networks"
          description="Removes networks not attached to running containers. Can break connectivity for stopped workloads."
          checked={deleteUnusedNetworks}
          onCheckedChange={setDeleteUnusedNetworks}
        />
      </FormSection>
    </div>
  )
}
