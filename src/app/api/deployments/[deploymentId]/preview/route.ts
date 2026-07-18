import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { route } from '@/lib/http/response';
import { requireProjectAccess } from '@/lib/auth/access';
import { ServiceModule } from '@/services/internal/service/service';
import { readDeploymentPreview } from '@/services/internal/deploy/screenshot';

type Ctx = { params: Promise<{ deploymentId: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { deploymentId } = await params;
  const deployment = await ServiceModule.getDeployment(deploymentId);
  await requireProjectAccess(deployment.service.projectId);
  const image = await readDeploymentPreview(deploymentId);
  if (!image) return new NextResponse('Preview not available', { status: 404 });
  return new NextResponse(new Uint8Array(image), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300',
    },
  });
});
