import fs from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/prisma';
import {
  getPlatformObject,
  isPlatformS3Configured,
  uploadPlatformObject,
} from '@/services/external/s3/assets';
import { PlatformS3Keys } from '@/services/external/s3/keys';

const PREVIEW_DIR = path.join(process.cwd(), '.data', 'deployment-previews');

function serviceUrl(fqdn: string): string {
  const host = fqdn.split(',')[0]?.trim();
  if (!host) throw new Error('No domain configured for screenshot.');
  return host.startsWith('http') ? host : `https://${host}`;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isLocalPath(value: string): boolean {
  return value.startsWith('/') || value.startsWith('.');
}

/**
 * Capture a deployment preview screenshot and persist a lifetime-public S3 URL
 * (or a local path when platform S3 is not configured).
 */
export async function captureDeploymentPreview(
  deploymentId: string,
  fqdn: string | null | undefined,
): Promise<void> {
  if (!fqdn?.trim()) return;

  let localPath: string | null = null;
  try {
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: {
        id: true,
        service: { select: { uuid: true } },
      },
    });
    if (!deployment) return;

    const { chromium } = await import('playwright');
    await fs.mkdir(PREVIEW_DIR, { recursive: true });
    localPath = path.join(PREVIEW_DIR, `${deploymentId}.png`);

    // Docker/root: sandboxing fails without these flags; shm is often tiny in containers.
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(serviceUrl(fqdn), { waitUntil: 'networkidle', timeout: 45_000 });
      await page.screenshot({ path: localPath, type: 'png', fullPage: false });
    } finally {
      await browser.close();
    }

    const png = await fs.readFile(localPath);
    let previewImagePath = localPath;

    if (isPlatformS3Configured()) {
      const key = PlatformS3Keys.deploymentPreview(deployment.service.uuid, deploymentId);
      const uploaded = await uploadPlatformObject({
        key,
        body: png,
        contentType: 'image/png',
        // Lifetime public URL via permanent object URL + public-read when ACLs allowed.
        publicRead: true,
      });
      // Prefer the permanent public URL; falls back to max-expiry presign if needed by callers.
      previewImagePath = uploaded.publicUrl || uploaded.presignedUrl;
      await fs.unlink(localPath).catch(() => undefined);
      localPath = null;
    }

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { previewImagePath },
    });
  } catch (err) {
    if (localPath) await fs.unlink(localPath).catch(() => undefined);
    const message = err instanceof Error ? err.message : String(err);
    if (/Executable doesn't exist|playwright install/i.test(message)) {
      console.warn(
        `[deployment-preview] skipped for ${deploymentId}: Playwright Chromium is not installed in this image. Rebuild the worker with docker/Dockerfile.worker.`,
      );
      return;
    }
    console.error(`[deployment-preview] capture failed for ${deploymentId}:`, err);
  }
}

/**
 * Resolve preview image bytes from a stored public URL, S3 key, or legacy local path.
 */
export async function readDeploymentPreview(deploymentId: string): Promise<Buffer | null> {
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    select: {
      previewImagePath: true,
      service: { select: { uuid: true } },
    },
  });
  if (!deployment?.previewImagePath) return null;

  const stored = deployment.previewImagePath;
  const canonicalKey = PlatformS3Keys.deploymentPreview(deployment.service.uuid, deploymentId);

  try {
    if (isHttpUrl(stored)) {
      const res = await fetch(stored);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      // Public URL may 403 without ACL/policy — fall back to authenticated GetObject.
      if (isPlatformS3Configured()) return await getPlatformObject(canonicalKey);
      return null;
    }

    if (isLocalPath(stored)) {
      return await fs.readFile(stored);
    }

    if (isPlatformS3Configured()) {
      return await getPlatformObject(stored);
    }
  } catch {
    if (isPlatformS3Configured()) {
      try {
        return await getPlatformObject(canonicalKey);
      } catch {
        return null;
      }
    }
  }

  return null;
}
