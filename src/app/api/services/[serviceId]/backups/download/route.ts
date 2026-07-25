import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { route } from '@/lib/http/response';
import { requireProjectManage } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';
import { openBackupDownload } from '@/services/internal/backup/engine';
import { ValidationError } from '@/lib/errors';

type Ctx = { params: Promise<{ serviceId: string }> };

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Download a successful backup dump from the managed server. */
export const GET = route(async (request: NextRequest, { params }: Ctx) => {
  const { serviceId } = await params;
  const projectId = await ServiceModule.projectIdFor(serviceId);
  await requireProjectManage(projectId);

  const filename = request.nextUrl.searchParams.get('filename')?.trim();
  if (!filename) throw new ValidationError('filename query parameter is required.');

  const { stream, filename: safeName, contentType, size } = await openBackupDownload(
    serviceId,
    filename,
  );

  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Content-Length': String(size),
      'Cache-Control': 'no-store',
    },
  });
});
