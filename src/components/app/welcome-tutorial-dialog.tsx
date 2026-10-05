'use client';

import { useSyncExternalStore } from 'react';
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
  getWelcomeTutorialServerSnapshot,
  shouldShowWelcomeTutorial,
  subscribeWelcomeTutorial,
} from '@/lib/welcome-tutorial';

const YOUTUBE_VIDEO_ID = 's-o9yqc1SUc';

/**
 * One-shot YouTube tutorial after a user completes onboarding.
 * Triggered via localStorage flag set in the onboarding finish flow.
 */
export function WelcomeTutorialDialog() {
  const open = useSyncExternalStore(
    subscribeWelcomeTutorial,
    shouldShowWelcomeTutorial,
    getWelcomeTutorialServerSnapshot,
  );

  const dismiss = () => {
    dismissWelcomeTutorial();
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <ModalContent size="xl" className="sm:max-w-3xl">
        <ModalHeader>
          <ModalTitle>Quick tour of Peon</ModalTitle>
          <ModalDescription>
            Watch this short walkthrough to see how to connect a server and deploy your first app.
          </ModalDescription>
        </ModalHeader>
        <ModalBody className="px-6">
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
