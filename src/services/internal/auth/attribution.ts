import { prisma } from '@/lib/prisma';
import {
  sanitizeAttributionInput,
  type AttributionInput,
} from '@/lib/attribution';

/** Persist first-touch attribution once. No-op if empty, invalid, or row already exists. */
export async function writeUserAttributionOnce(
  userId: string,
  raw: AttributionInput | null | undefined,
): Promise<void> {
  const attribution = sanitizeAttributionInput(raw);
  if (!attribution) return;

  const existing = await prisma.userAttribution.findUnique({ where: { userId } });
  if (existing) return;

  let capturedAt: Date | undefined;
  if (attribution.capturedAt) {
    const parsed = new Date(attribution.capturedAt);
    if (!Number.isNaN(parsed.getTime())) capturedAt = parsed;
  }

  await prisma.userAttribution.create({
    data: {
      userId,
      utmSource: attribution.utmSource,
      utmMedium: attribution.utmMedium,
      utmCampaign: attribution.utmCampaign,
      utmContent: attribution.utmContent,
      utmTerm: attribution.utmTerm,
      ref: attribution.ref,
      gclid: attribution.gclid,
      fbclid: attribution.fbclid,
      msclkid: attribution.msclkid,
      campaign: attribution.campaign,
      landingPath: attribution.landingPath,
      landingUrl: attribution.landingUrl,
      referrer: attribution.referrer,
      rawQuery: attribution.rawQuery ?? undefined,
      capturedAt,
    },
  });
}
