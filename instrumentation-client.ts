import posthog from 'posthog-js';

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();

if (token) {
  posthog.init(token, {
    // Managed reverse proxy (avoids ad blockers); override with NEXT_PUBLIC_POSTHOG_HOST.
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://t.advant.xyz',
    // Required when using a proxy so toolbar / recording links open PostHog UI.
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST || 'https://us.posthog.com',
    defaults: '2026-05-30',
    person_profiles: 'identified_only',
  });
}
