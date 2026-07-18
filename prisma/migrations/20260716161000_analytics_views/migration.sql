-- Read-only SQL views for peon-analytics (optional optimization; always fresh).
CREATE OR REPLACE VIEW analytics_signup_daily AS
SELECT date_trunc('day', "createdAt")::date AS day, COUNT(*)::int AS count
FROM "User"
GROUP BY 1;

CREATE OR REPLACE VIEW analytics_onboarding_daily AS
SELECT date_trunc('day', "onboardingCompletedAt")::date AS day, COUNT(*)::int AS count
FROM "User"
WHERE "onboardingCompletedAt" IS NOT NULL
GROUP BY 1;

CREATE OR REPLACE VIEW analytics_deployment_daily AS
SELECT
  date_trunc('day', "createdAt")::date AS day,
  status::text AS status,
  COUNT(*)::int AS count
FROM "Deployment"
GROUP BY 1, 2;

CREATE OR REPLACE VIEW analytics_workspace_summary AS
SELECT
  w.id AS workspace_id,
  w.name,
  w.personal,
  w."isSystem" AS is_system,
  w."createdAt" AS created_at,
  (SELECT COUNT(*)::int FROM "WorkspaceMembership" wm WHERE wm."workspaceId" = w.id) AS member_count,
  (SELECT COUNT(*)::int FROM "Project" p WHERE p."workspaceId" = w.id) AS project_count,
  (SELECT COUNT(*)::int FROM "Server" s WHERE s."workspaceId" = w.id) AS server_count,
  (SELECT COUNT(*)::int FROM "Project" p JOIN "Service" sv ON sv."projectId" = p.id WHERE p."workspaceId" = w.id AND sv."deletedAt" IS NULL) AS service_count,
  (SELECT MAX(d."createdAt") FROM "Project" p JOIN "Service" sv ON sv."projectId" = p.id JOIN "Deployment" d ON d."serviceId" = sv.id WHERE p."workspaceId" = w.id) AS last_deployment_at
FROM "Workspace" w;
