'use client';

import { useEffect } from 'react';
import { collectAttributionForSignup } from '@/lib/attribution';

/** Capture / stash first-touch attribution on auth pages (register, login). */
export function AttributionCapture() {
  useEffect(() => {
    collectAttributionForSignup();
  }, []);
  return null;
}
