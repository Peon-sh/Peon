'use client';

import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/app/modal';
import { AddServerForm } from '@/components/app/add-server-form';

interface AddServerModalProps {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Add server" dialog: connect a host over SSH. Shared between the servers page and the dashboard.
 * Form state lives in AddServerForm, which unmounts with the dialog content, so closing resets it.
 */
export function AddServerModal({ workspaceId, open, onOpenChange }: AddServerModalProps) {
  const close = () => onOpenChange(false);
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size="xl">
        <ModalHeader>
          <ModalTitle>Add server</ModalTitle>
        </ModalHeader>
        <AddServerForm
          workspaceId={workspaceId}
          onCreated={close}
          onCancel={close}
          onNavigateAway={close}
          actionSize="sm"
          renderLayout={(fields, actions) => (
            <>
              <ModalBody>{fields}</ModalBody>
              <ModalFooter>{actions}</ModalFooter>
            </>
          )}
        />
      </ModalContent>
    </Modal>
  );
}
