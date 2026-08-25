'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/app/modal';
import {
  dismissWelcomeTutorial,
  shouldShowWelcomeTutorial,
} from '@/lib/welcome-tutorial';

const YOUTUBE_VIDEO_ID = 's-o9yqc1SUc';

/**
 * One-shot YouTube tutorial after a user completes onboarding.
 * Triggered via localStorage flag set in the onboarding finish flow.
 */
export function WelcomeTutorialDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (shouldShowWelcomeTutorial()) {
      setOpen(true);
    }
  }, []);

  const dismiss = () => {
    dismissWelcomeTutorial();
    setOpen(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
        else setOpen(true);
      }}
    >
      <ModalContent size="xl" className="sm:max-w-3xl">
        <ModalHeader>
          <ModalTitle>Quick tour of Peon</ModalTitle>
          <ModalDescription>
            Watch this short walkthrough to see how to connect a server and deploy your first app.
          </ModalDescription>
        </ModalHeader>
        <ModalBody className="p-0 sm:px-4 sm:pb-2">
          <div className="bg-muted relative aspect-video w-full overflow-hidden rounded-md">
            <iframe
              src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?rel=0`}
              title="Peon product tutorial"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 h-full w-full border-0"
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button type="button" onClick={dismiss}>
            Got it
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
