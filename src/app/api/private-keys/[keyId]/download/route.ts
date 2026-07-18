import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { route } from '@/lib/http/response';
import { requireInfraAccess } from '@/lib/auth/access';
import { PrivateKeyService } from '@/services/internal/privatekey/privatekey';

type Ctx = { params: Promise<{ keyId: string }> };

/** Download decrypted private key as a .pem attachment. */
export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { keyId } = await params;
  const workspaceId = await PrivateKeyService.workspaceIdFor(keyId);
  await requireInfraAccess(workspaceId);
  const { filename, privateKey } = await PrivateKeyService.exportPrivateKey(keyId);

  return new NextResponse(privateKey, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-pem-file',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
});
