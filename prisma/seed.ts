import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/lib/prisma/generated/client';
import { slugify } from '../src/lib/utils/slug';

const DEMO_EMAIL = 'demo@peon.local';
const DEMO_PASSWORD = 'Demo1234!';
const DEMO_NAME = 'Demo User';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function seedDemoUser() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {
      passwordHash,
      name: DEMO_NAME,
      emailVerifiedAt: new Date(),
      isInstanceAdmin: true,
      isOnboarded: true,
    },
    create: {
      email: DEMO_EMAIL,
      name: DEMO_NAME,
      passwordHash,
      emailVerifiedAt: new Date(),
      isInstanceAdmin: true,
      isOnboarded: true,
    },
  });

  const hasWorkspace = await prisma.workspaceMembership.findFirst({
    where: { userId: user.id },
  });

  if (!hasWorkspace) {
    await prisma.workspace.create({
      data: {
        name: `${DEMO_NAME}'s Workspace`,
        slug: slugify('demo-user'),
        personal: true,
        ownerId: user.id,
        memberships: {
          create: { userId: user.id, role: 'OWNER' },
        },
      },
    });
  }

  console.log(`Demo user ready: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

async function main() {
  await prisma.instanceSettings.upsert({
    where: { id: 'instance' },
    update: {},
    create: { id: 'instance', instanceName: 'Peon' },
  });

  await prisma.oauthSetting.upsert({
    where: { provider: 'google' },
    update: {},
    create: {
      provider: 'google',
      enabled: Boolean(process.env.GOOGLE_CLIENT_ID),
      clientId: process.env.GOOGLE_CLIENT_ID ?? null,
    },
  });

  await seedDemoUser();
  await seedChatSupportedModels();

  console.log('Seed complete.');
}

async function seedChatSupportedModels() {
  // Catalog synced from OpenAI + Anthropic docs (July 2026).
  // OpenAI: https://developers.openai.com/api/docs/models
  // Anthropic: https://platform.claude.com/docs/en/about-claude/models/overview
  const models = [
    {
      id: 'csm_openai_gpt56_sol',
      provider: 'OPENAI' as const,
      modelId: 'gpt-5.6-sol',
      displayName: 'GPT-5.6 Sol',
      sortOrder: 10,
      supportsReasoning: true,
    },
    {
      id: 'csm_openai_gpt56_terra',
      provider: 'OPENAI' as const,
      modelId: 'gpt-5.6-terra',
      displayName: 'GPT-5.6 Terra',
      sortOrder: 20,
      supportsReasoning: true,
    },
    {
      id: 'csm_openai_gpt56_luna',
      provider: 'OPENAI' as const,
      modelId: 'gpt-5.6-luna',
      displayName: 'GPT-5.6 Luna',
      sortOrder: 30,
      supportsReasoning: true,
    },
    {
      id: 'csm_openai_gpt55',
      provider: 'OPENAI' as const,
      modelId: 'gpt-5.5',
      displayName: 'GPT-5.5',
      sortOrder: 40,
      supportsReasoning: true,
    },
    {
      id: 'csm_anthropic_fable5',
      provider: 'ANTHROPIC' as const,
      modelId: 'claude-fable-5',
      displayName: 'Claude Fable 5',
      sortOrder: 10,
      supportsReasoning: true,
    },
    {
      id: 'csm_anthropic_opus48',
      provider: 'ANTHROPIC' as const,
      modelId: 'claude-opus-4-8',
      displayName: 'Claude Opus 4.8',
      sortOrder: 20,
      supportsReasoning: true,
    },
    {
      id: 'csm_anthropic_sonnet5',
      provider: 'ANTHROPIC' as const,
      modelId: 'claude-sonnet-5',
      displayName: 'Claude Sonnet 5',
      sortOrder: 30,
      supportsReasoning: true,
    },
  ];

  const keepIds = models.map((model) => model.modelId);

  for (const model of models) {
    await prisma.chatSupportedModel.upsert({
      where: { provider_modelId: { provider: model.provider, modelId: model.modelId } },
      update: {
        displayName: model.displayName,
        enabled: true,
        sortOrder: model.sortOrder,
        supportsReasoning: model.supportsReasoning,
      },
      create: model,
    });
  }

  await prisma.chatSupportedModel.updateMany({
    where: { modelId: { notIn: keepIds } },
    data: { enabled: false },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
