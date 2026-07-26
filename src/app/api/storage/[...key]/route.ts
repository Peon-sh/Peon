import type { NextRequest } from 'next/server';
import { handleError } from '@/lib/http/response';
import { requireUser } from '@/lib/auth/context';
import { NotFoundError } from '@/lib/errors';
import { getStorageProvider, resolveStorageDriver } from '@/lib/storage';

type Ctx = { params: Promise<{ key: string[] }> };

/** Conservative content types for what platform storage actually holds. */
const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

function contentTypeFor(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

/**
 * Serve objects held by the local storage provider.
 *
 * S3 installations never reach this route — their objects are fetched straight
 * from the bucket — so it exists purely so `STORAGE_DRIVER=local` has somewhere
 * to serve avatars and deployment screenshots from.
 *
 * Access requires a session. Local storage sits on the control-plane disk with
 * no bucket ACLs in front of it, so authentication is the only thing standing
 * between a guessed key and the object.
 */
export const GET = async (_req: NextRequest, { params }: Ctx) => {
  try {
    if (resolveStorageDriver() !== 'local') {
      throw new NotFoundError('Object not found.');
    }
    await requireUser();

    const { key } = await params;
    const objectKey = key.map(decodeURIComponent).join('/');

    const storage = await getStorageProvider();
    const body = await storage.get(objectKey);
    if (!body) throw new NotFoundError('Object not found.');

    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': contentTypeFor(objectKey),
        'Content-Length': String(body.byteLength),
        // Private: this is per-user content behind a session.
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return handleError(error);
  }
};
