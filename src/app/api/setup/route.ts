import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, route } from '@/lib/http/response';
import { setAuthCookie } from '@/lib/auth/cookies';
import { extractSessionMeta } from '@/lib/auth/session-meta';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { hashPassword, validatePassword } from '@/lib/auth/password';
import { generateJWT } from '@/lib/auth/jwt';
import { AuthSessionService } from '@/services/internal/auth/sessions';
import { createPersonalWorkspace } from '@/services/internal/workspace/provisioning';
import { ensureLocalServer } from '@/services/internal/server/local-server';
import { consumeSetupToken, verifySetupToken } from '@/services/internal/instance/setup-token';

const setupSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  /** Register the Peon host itself as a deployment target. */
  useLocalServer: z.boolean().optional().default(true),
});

/** Check a setup link without consuming it, so the page can render or refuse. */
export const GET = route(async (request: NextRequest) => {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  return ok({ valid: await verifySetupToken(token) });
});

/**
 * Create the first administrator from a one-time setup link.
 *
 * Exists because a fresh installation has no working email, so the normal OTP
 * signup cannot run — and the alternative, shipping default credentials, is
 * worse. Refuses outright once any user exists, so a leaked token cannot be
 * replayed later against a live instance.
 */
export const POST = route(async (request: NextRequest) => {
  const body = setupSchema.parse(await request.json());

  const passwordError = validatePassword(body.password);
  if (passwordError) throw new ValidationError(passwordError);

  // Re-checked inside consumeSetupToken; checked here too so we fail before
  // doing any work.
  if ((await prisma.user.count()) > 0) {
    throw new ForbiddenError(
      'This instance is already set up. Sign in instead.',
      'ALREADY_SETUP',
    );
  }

  // Consumes atomically — two concurrent requests cannot both succeed.
  await consumeSetupToken(body.token);

  const user = await prisma.user.create({
    data: {
      email: body.email.toLowerCase().trim(),
      name: body.name.trim(),
      passwordHash: await hashPassword(body.password),
      // No mailbox round trip is possible here; the setup link proves control
      // of the server, which is a stronger claim than owning the address.
      emailVerifiedAt: new Date(),
      isInstanceAdmin: true,
      isOnboarded: false,
    },
  });

  const workspace = await createPersonalWorkspace(user);

  if (body.useLocalServer) {
    try {
      await ensureLocalServer({ workspaceId: workspace.id });
    } catch (err) {
      // Never fail setup over this; the server can be added from the UI.
      console.error('[setup] failed to register the local server:', err);
    }
  }

  // Record the owner so instance settings are reachable immediately.
  await prisma.instanceSettings
    .upsert({
      where: { id: 'instance' },
      create: { id: 'instance' },
      update: {},
    })
    .catch(() => undefined);

  const session = await AuthSessionService.create(user.id, extractSessionMeta(request.headers));
  const token = await generateJWT({
    userId: user.id,
    email: user.email,
    name: user.name,
    isInstanceAdmin: true,
    isInstanceOwner: true,
    isOnboarded: false,
    profilePicture: null,
    sid: session.id,
  });
  await setAuthCookie(token);

  return ok({
    user: { id: user.id, email: user.email, name: user.name },
    workspaceId: workspace.id,
  });
});
