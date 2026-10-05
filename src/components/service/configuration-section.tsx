'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Eye, EyeOff, Copy } from 'lucide-react';
import { githubRepoSlug } from '@/lib/github-urls';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  updateService,
  listServers,
  getServiceConfig,
  updateServiceConfig,
  type ServiceDetail,
  type ServiceConfigField,
} from '@/services/api/service';
import { listPrivateKeys } from '@/services/api/privatekey';
import { listGithubSourceBranches, listGithubSourceRepositories, listSources } from '@/services/api/sources';
import { FormField, FormSection } from '@/components/app/page';
import { useAuthStore } from '@/store/auth';
import { Field, ToggleField } from './fields';
import { PreviewDnsGuide } from './domains-section';

export function ConfigurationSection({
  svc,
  onSaved,
  onSettingsChanged,
}: {
  svc: ServiceDetail;
  onSaved: () => void;
  onSettingsChanged: () => void;
}) {
  const workspaceId = useAuthStore((s) => s.currentWorkspaceId);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const hasOverride = (k: string) => Object.prototype.hasOwnProperty.call(form, k);
  const val = <T,>(k: keyof ServiceDetail, fallback: T): T =>
    hasOverride(k as string) ? (form[k as string] as T) : ((svc[k] as T) ?? fallback);
  const settingVal = <T,>(k: keyof NonNullable<ServiceDetail['settings']>, fallback: T): T =>
    hasOverride(k as string) ? (form[k as string] as T) : ((svc.settings?.[k] as T) ?? fallback);

  const { data: servers } = useQuery({
    queryKey: ['servers', workspaceId],
    queryFn: () => listServers(workspaceId!),
    enabled: !!workspaceId,
  });

  const { data: sources } = useQuery({
    queryKey: ['sources', workspaceId],
    queryFn: () => listSources(workspaceId!),
    enabled: !!workspaceId,
  });
  const { data: privateKeys } = useQuery({
    queryKey: ['private-keys', workspaceId],
    queryFn: () => listPrivateKeys(workspaceId!),
    enabled: !!workspaceId,
  });

  const githubSources = sources?.github ?? [];
  const gitlabSources = sources?.gitlab ?? [];
  const connectedGithubSources = githubSources.filter(
    (source) => source.status === 'CONNECTED' || source.kind === 'CUSTOM',
  );
  const gitSourceType = val('gitSourceType', svc.gitSourceType ?? 'PUBLIC');
  const gitUiMode: 'PUBLIC' | 'GIT_APP' | 'DEPLOY_KEY' =
    gitSourceType === 'GITHUB_APP' || gitSourceType === 'GITLAB_APP'
      ? 'GIT_APP'
      : gitSourceType === 'DEPLOY_KEY'
        ? 'DEPLOY_KEY'
        : 'PUBLIC';

  const selectedGithubAppId =
    gitSourceType === 'GITHUB_APP'
      ? (val('githubAppId', svc.githubAppId ?? '') || connectedGithubSources[0]?.id || '')
      : '';
  const selectedGitlabAppId =
    gitSourceType === 'GITLAB_APP' ? (val('gitlabAppId', svc.gitlabAppId ?? '') || gitlabSources[0]?.id || '') : '';
  const selectedGithubSource = connectedGithubSources.find((s) => s.id === selectedGithubAppId);
  const selectedGitAppConnection =
    gitSourceType === 'GITHUB_APP' && selectedGithubAppId
      ? `github:${selectedGithubAppId}`
      : gitSourceType === 'GITLAB_APP' && selectedGitlabAppId
        ? `gitlab:${selectedGitlabAppId}`
        : '';
  const currentRepoSlug = githubRepoSlug(val('gitRepository', svc.gitRepository ?? ''));

  // Same defaults the previous effect applied when sources load (keeps Save dirtyable).
  const defaultGithubAppId =
    gitSourceType === 'GITHUB_APP' &&
    !val('githubAppId', svc.githubAppId ?? '') &&
    connectedGithubSources[0]?.id
      ? connectedGithubSources[0].id
      : null;
  const defaultGitlabAppId =
    gitSourceType === 'GITLAB_APP' &&
    !val('gitlabAppId', svc.gitlabAppId ?? '') &&
    gitlabSources[0]?.id
      ? gitlabSources[0].id
      : null;
  const [prevGitDefaults, setPrevGitDefaults] = useState({
    defaultGithubAppId,
    defaultGitlabAppId,
  });
  if (
    defaultGithubAppId !== prevGitDefaults.defaultGithubAppId ||
    defaultGitlabAppId !== prevGitDefaults.defaultGitlabAppId
  ) {
    setPrevGitDefaults({ defaultGithubAppId, defaultGitlabAppId });
    if (defaultGithubAppId) set('githubAppId', defaultGithubAppId);
    if (defaultGitlabAppId) set('gitlabAppId', defaultGitlabAppId);
  }

  const { data: githubRepos, isLoading: reposLoading, isError: reposError } = useQuery({
    queryKey: ['github-source-repos', selectedGithubAppId],
    queryFn: () => listGithubSourceRepositories(selectedGithubAppId),
    enabled: gitSourceType === 'GITHUB_APP' && !!selectedGithubAppId,
    retry: false,
  });

  const { data: githubBranches, isLoading: branchesLoading } = useQuery({
    queryKey: ['github-source-branches', selectedGithubAppId, currentRepoSlug],
    queryFn: () => listGithubSourceBranches(selectedGithubAppId, currentRepoSlug!),
    enabled: gitSourceType === 'GITHUB_APP' && !!selectedGithubAppId && !!currentRepoSlug,
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = { ...form };
      if (gitSourceType === 'GITHUB_APP' && selectedGithubAppId && payload.githubAppId == null) {
        payload.githubAppId = selectedGithubAppId;
      }
      if (gitSourceType === 'GITLAB_APP' && selectedGitlabAppId && payload.gitlabAppId == null) {
        payload.gitlabAppId = selectedGitlabAppId;
      }
      return updateService(svc.id, payload);
    },
    onSuccess: async () => {
      setForm({});
      onSaved();
      toast.success('Saved');
      onSettingsChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const isGit = ['GIT_APP', 'DOCKERFILE', 'NIXPACKS', 'STATIC'].includes(svc.kind);
  const isDb = svc.kind === 'DATABASE';
  // Databases are TCP services: no HTTP domains / proxy flags / HTTP healthcheck.
  const hasHttpSurface = !isDb;
  const buildPack = val('buildPack', svc.buildPack ?? 'NIXPACKS');
  // Show Dockerfile Location whenever the build pack is Dockerfile.
  const isDockerfilePack = buildPack === 'DOCKERFILE' || svc.kind === 'DOCKERFILE';
  const dirty = Object.keys(form).length > 0;
  const saveFooter = (
    <Button size="sm" onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending}>
      Save
    </Button>
  );

  return (
    <div className="space-y-4">
      <FormSection id="general" title="General" footer={saveFooter}>
        <Field label="Name">
          <Input value={val('name', '')} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Description">
          <Input value={val('description', '') ?? ''} onChange={(e) => set('description', e.target.value || null)} />
        </Field>
        <Field label="Server">
          <SearchableSelect
            value={val('serverId', '') ?? ''}
            onValueChange={(v) => set('serverId', v)}
            placeholder="Select server"
            options={(servers ?? []).map((s) => ({
              value: s.id,
              label: `${s.name} (${s.ip})`,
              keywords: s.ip,
            }))}
          />
          {!svc.serverId && (
            <p className="text-muted-foreground text-sm">Assign a server before deploying this service.</p>
          )}
        </Field>
        {isGit && (
          <Field
            label="Build pack"
            tooltip="How the image is built. Static: copies the base directory into nginx:alpine and serves files on port 80 (use for HTML/CSS/JS sites). Nixpacks/Railpack: auto-detect frameworks. Dockerfile: use your Dockerfile."
          >
            <SearchableSelect
              value={val('buildPack', 'NIXPACKS')}
              onValueChange={(v) => set('buildPack', v)}
              placeholder="Select build pack"
              options={[
                { value: 'NIXPACKS', label: 'Nixpacks' },
                { value: 'RAILPACK', label: 'Railpack' },
                { value: 'DOCKERFILE', label: 'Dockerfile' },
                { value: 'STATIC', label: 'Static' },
              ]}
            />
          </Field>
        )}
      </FormSection>

      {isGit && (
        <FormSection id="git-source" title="Git source" footer={saveFooter}>
          <Field label="Git source type">
            <SearchableSelect
              value={gitUiMode}
              onValueChange={(mode) => {
                if (mode === 'PUBLIC') {
                  set('gitSourceType', 'PUBLIC');
                  set('githubAppId', null);
                  set('gitlabAppId', null);
                  set('privateKeyId', null);
                  set('repositoryProjectId', null);
                } else if (mode === 'DEPLOY_KEY') {
                  set('gitSourceType', 'DEPLOY_KEY');
                  set('githubAppId', null);
                  set('gitlabAppId', null);
                  set('repositoryProjectId', null);
                } else {
                  // Git App — prefer GitHub connection, else GitLab.
                  if (connectedGithubSources[0]) {
                    set('gitSourceType', 'GITHUB_APP');
                    set('githubAppId', connectedGithubSources[0].id);
                    set('gitlabAppId', null);
                  } else if (gitlabSources[0]) {
                    set('gitSourceType', 'GITLAB_APP');
                    set('gitlabAppId', gitlabSources[0].id);
                    set('githubAppId', null);
                  } else {
                    set('gitSourceType', 'GITHUB_APP');
                    set('githubAppId', null);
                    set('gitlabAppId', null);
                  }
                  set('privateKeyId', null);
                }
              }}
              placeholder="Select source type"
              options={[
                { value: 'GIT_APP', label: 'Git app' },
                { value: 'PUBLIC', label: 'Public repository' },
                { value: 'DEPLOY_KEY', label: 'Deploy key' },
              ]}
            />
          </Field>

          {gitUiMode === 'GIT_APP' ? (
            <>
              <Field label="Connection">
                <SearchableSelect
                  value={selectedGitAppConnection}
                  onValueChange={(value) => {
                    set('gitRepository', '');
                    set('repositoryProjectId', null);
                    set('gitBranch', 'main');
                    if (value.startsWith('github:')) {
                      set('gitSourceType', 'GITHUB_APP');
                      set('githubAppId', value.slice('github:'.length));
                      set('gitlabAppId', null);
                    } else if (value.startsWith('gitlab:')) {
                      set('gitSourceType', 'GITLAB_APP');
                      set('gitlabAppId', value.slice('gitlab:'.length));
                      set('githubAppId', null);
                      set('repositoryProjectId', null);
                    }
                  }}
                  placeholder={
                    connectedGithubSources.length || gitlabSources.length
                      ? 'Select connection'
                      : 'No connections — add one under Sources'
                  }
                  disabled={!connectedGithubSources.length && !gitlabSources.length}
                  options={[
                    ...connectedGithubSources.map((source) => ({
                      value: `github:${source.id}`,
                      label:
                        source.kind === 'PLATFORM'
                          ? `GitHub (Peon)${source.organization ? `: ${source.organization}` : ''}`
                          : `GitHub: ${source.name}`,
                    })),
                    ...gitlabSources.map((source) => ({
                      value: `gitlab:${source.id}`,
                      label: `GitLab: ${source.name}`,
                    })),
                  ]}
                />
              </Field>
              {selectedGithubSource?.status && selectedGithubSource.status !== 'CONNECTED' ? (
                <p className="text-muted-foreground text-sm">
                  This GitHub connection is {selectedGithubSource.status.toLowerCase()}. Reconnect under
                  Sources before deploying.
                </p>
              ) : null}
              {gitSourceType === 'GITHUB_APP' ? (
                <>
                  <Field label="Repository">
                    <SearchableSelect
                      value={currentRepoSlug ?? ''}
                      onValueChange={(fullName) => {
                        const repo = githubRepos?.find((r) => r.fullName === fullName);
                        set('gitRepository', repo?.cloneUrl ?? fullName);
                        set('repositoryProjectId', repo?.id ?? null);
                        set('gitBranch', repo?.defaultBranch ?? val('gitBranch', 'main'));
                      }}
                      placeholder={
                        reposLoading
                          ? 'Loading repositories…'
                          : reposError
                            ? 'Failed to load repositories'
                            : 'Select repository'
                      }
                      emptyText={
                        reposError
                          ? 'Could not load repositories — check Sources connection'
                          : 'No repositories found for this installation'
                      }
                      disabled={
                        reposLoading ||
                        reposError ||
                        !selectedGithubAppId ||
                        selectedGithubSource?.status === 'DISCONNECTED'
                      }
                      options={(githubRepos ?? []).map((repo) => ({
                        value: repo.fullName,
                        label: `${repo.fullName}${repo.private ? ' · private' : ''}`,
                        keywords: repo.fullName,
                      }))}
                    />
                  </Field>
                  <Field label="Branch">
                    <SearchableSelect
                      value={val('gitBranch', '') || 'main'}
                      onValueChange={(branch) => set('gitBranch', branch)}
                      placeholder={branchesLoading ? 'Loading branches…' : 'Select branch'}
                      disabled={!currentRepoSlug || branchesLoading}
                      options={(
                        githubBranches?.length
                          ? githubBranches
                          : [val('gitBranch', svc.gitBranch ?? 'main') || 'main']
                      ).map((branch) => ({
                        value: branch,
                        label: branch,
                      }))}
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Git repository">
                    <Input
                      value={val('gitRepository', '')}
                      onChange={(e) => set('gitRepository', e.target.value)}
                      placeholder="https://gitlab.com/group/project.git"
                    />
                  </Field>
                  <Field label="Branch">
                    <Input
                      value={val('gitBranch', '')}
                      onChange={(e) => set('gitBranch', e.target.value)}
                    />
                  </Field>
                </>
              )}
            </>
          ) : (
            <>
              <Field label="Git repository">
                <Input
                  value={val('gitRepository', '')}
                  onChange={(e) => set('gitRepository', e.target.value)}
                  placeholder="https://github.com/org/repo.git"
                />
              </Field>
              <Field label="Branch">
                <Input
                  value={val('gitBranch', '')}
                  onChange={(e) => set('gitBranch', e.target.value)}
                />
              </Field>
            </>
          )}

          {gitUiMode === 'DEPLOY_KEY' && (
            <Field label="Private key">
              <SearchableSelect
                value={val('privateKeyId', '') || 'none'}
                onValueChange={(id) => set('privateKeyId', id === 'none' ? null : id)}
                placeholder="Select private key"
                options={[
                  { value: 'none', label: 'No private key' },
                  ...(privateKeys ?? []).map((key) => ({ value: key.id, label: key.name })),
                ]}
              />
            </Field>
          )}
        </FormSection>
      )}

      {isGit && (
        <FormSection id="build" title="Build" footer={saveFooter}>
          {!isDockerfilePack && (
            <>
              <Field
                label="Install command"
                tooltip="Overrides the pack’s install step (Nixpacks/Railpack via NIXPACKS_INSTALL_CMD). Example: pnpm install --frozen-lockfile. Leave empty to let the pack detect it."
              >
                <Input value={val('installCommand', '') ?? ''} onChange={(e) => set('installCommand', e.target.value || null)} />
              </Field>
              <Field
                label="Build command"
                tooltip="Overrides the pack’s build step (NIXPACKS_BUILD_CMD). Example: pnpm run build. Leave empty to use the pack’s detected build command."
              >
                <Input value={val('buildCommand', '') ?? ''} onChange={(e) => set('buildCommand', e.target.value || null)} />
              </Field>
              <Field
                label="Start command"
                tooltip="Overrides the pack’s start command (NIXPACKS_START_CMD) used when the container runs. Example: node server.js or pnpm start."
              >
                <Input value={val('startCommand', '') ?? ''} onChange={(e) => set('startCommand', e.target.value || null)} />
              </Field>
            </>
          )}
          {isDockerfilePack && (
            <Field
              label="Start command"
              tooltip="Optional command that overrides the image CMD when the container starts. Leave empty to use the Dockerfile CMD as-is."
            >
              <Input
                placeholder="Leave empty to use Dockerfile CMD"
                value={val('startCommand', '') ?? ''}
                onChange={(e) => set('startCommand', e.target.value || null)}
              />
            </Field>
          )}
          <>
            <Field
              label="Base directory"
              tooltip="Repo subdirectory used as the build context (e.g. /apps/web). Defaults to / (repository root). Dockerfile location and install/build commands run relative to this."
            >
              <Input value={val('baseDirectory', '/')} onChange={(e) => set('baseDirectory', e.target.value || '/')} />
            </Field>
            {isDockerfilePack ? (
              <Field
                label="Dockerfile location"
                tooltip="Path to the Dockerfile, resolved with the base directory (e.g. /Dockerfile or /docker/Dockerfile.worker). Used unless inline Dockerfile content is set."
              >
                <Input
                  placeholder="/Dockerfile"
                  value={val('dockerfilePath', '/Dockerfile')}
                  onChange={(e) => set('dockerfilePath', e.target.value || '/Dockerfile')}
                />
                <p className="text-muted-foreground text-sm">
                  Resolved with base directory (e.g. <code>/docker/Dockerfile.worker</code>).
                </p>
              </Field>
            ) : (
              <Field
                label="Publish directory"
                tooltip="Folder of built static assets (e.g. dist/out), relative to Base directory. Static pack currently serves the Base directory itself — put built files there (or set Base to your output folder)."
              >
                <Input
                  value={val('publishDirectory', '') ?? ''}
                  onChange={(e) => set('publishDirectory', e.target.value || null)}
                />
              </Field>
            )}
            <Field
              label="Ports exposed / mappings"
              tooltip="Container listen port or host:container mappings (comma-separated), e.g. 3000 or 8080:3000,8443:443. With no domain, these are published on the host. With a domain, host ports are not opened — the first port is used as the proxy/healthcheck target unless you set a healthcheck port."
            >
              <Input
                placeholder="3000 or 8080:3000,8443:443"
                value={val('ports', '') ?? ''}
                onChange={(e) => set('ports', e.target.value || null)}
              />
            </Field>
          </>
          <Field
            label="Watch paths"
            tooltip="Optional glob patterns (one per line). Auto-deploy from GitHub only runs when a push changes files matching these paths. Leave empty to deploy on every push to the branch."
          >
            <Textarea
              className="font-mono min-h-20"
              placeholder="src/pages/**"
              value={settingVal('watchPaths', '') ?? ''}
              onChange={(e) => set('watchPaths', e.target.value || null)}
            />
          </Field>
          <ToggleField
            label="Disable build cache"
            tooltip="Always rebuild without Docker/Nixpacks cache and clear the cached source on the server. Slower builds, useful when cached layers cause stale output."
            checked={settingVal('disableBuildCache', false)}
            onCheckedChange={(c) => set('disableBuildCache', c)}
          />
        </FormSection>
      )}

      {isDockerfilePack && (
        <FormSection title="Dockerfile" footer={saveFooter}>
          <Field label="Inline Dockerfile content">
            <Textarea
              className="font-mono min-h-32"
              placeholder="Optional — overrides the file at Dockerfile location when set"
              value={val('dockerfileContent', '') ?? ''}
              onChange={(e) => set('dockerfileContent', e.target.value || null)}
            />
          </Field>
        </FormSection>
      )}

      {svc.kind === 'DOCKER_IMAGE' && (
        <FormSection title="Docker registry" footer={saveFooter}>
            <Field label="Image">
              <Input value={val('dockerRegistryImage', '')} onChange={(e) => set('dockerRegistryImage', e.target.value)} />
            </Field>
            <Field label="Tag">
              <Input value={val('dockerRegistryTag', 'latest')} onChange={(e) => set('dockerRegistryTag', e.target.value)} />
            </Field>
            <Field
              label="Ports exposed / mappings"
              tooltip="Container listen port or host:container mappings (comma-separated), e.g. 3000 or 8080:3000,8443:443. With no domain, these are published on the host. With a domain, host ports are not opened — the first port is used as the proxy/healthcheck target unless you set a healthcheck port."
            >
              <Input
                placeholder="3000 or 8080:3000,8443:443"
                value={val('ports', '') ?? ''}
                onChange={(e) => set('ports', e.target.value || null)}
              />
            </Field>
          </FormSection>
      )}

      {svc.kind === 'COMPOSE' && (
        <FormSection title="Compose" footer={saveFooter}>
            <Textarea
              className="font-mono min-h-64"
              aria-label="Compose file"
              value={val('dockerComposeRaw', '')}
              onChange={(e) => set('dockerComposeRaw', e.target.value)}
            />
          </FormSection>
      )}

      {(svc.kind === 'DATABASE' || svc.kind === 'COMPOSE') && (
        <ServiceConfigPanel serviceId={svc.id} onSaved={onSaved} onSettingsChanged={onSettingsChanged} />
      )}

      {svc.kind === 'DATABASE' && (
        <FormSection title="Public access" footer={saveFooter}>
            <ToggleField
              label="Publicly accessible"
              tooltip="Publish the database port on the host so clients can connect from outside the Docker network. Prefer keeping this off and using private networking when possible."
              checked={val('databasePublic', false)}
              onCheckedChange={(c) => set('databasePublic', c)}
            />
            <Field label="Public port">
              <Input
                type="number"
                value={String(val('databasePublicPort', '') ?? '')}
                onChange={(e) => set('databasePublicPort', e.target.value ? Number(e.target.value) : null)}
              />
            </Field>
          </FormSection>
      )}

      {svc.kind !== 'COMPOSE' && (
        <FormSection
          id="healthcheck"
          title="Healthcheck"
          description={
            isDb
              ? 'Docker probe timing for the database container (the probe command is engine-specific).'
              : "Define how your container's health should be checked (Docker HEALTHCHECK on the running container)."
          }
          footer={saveFooter}
        >
          <ToggleField
            label="Enabled"
            tooltip={
              isDb
                ? 'Run Docker HEALTHCHECK probes on the database container using engine-specific commands and the timing fields below.'
                : 'Add a Docker HEALTHCHECK to the running container using the method, path, and timing options below. Failed probes mark the container unhealthy.'
            }
            checked={val('healthCheckEnabled', false)}
            onCheckedChange={(c) => set('healthCheckEnabled', c)}
          />
          {hasHttpSurface && (
          <>
            <Field label="Method">
              <SearchableSelect
                value={val('healthCheckMethod', 'GET')}
                onValueChange={(v) => set('healthCheckMethod', v)}
                placeholder="Select method"
                options={['GET', 'HEAD', 'POST', 'OPTIONS'].map((m) => ({ value: m, label: m }))}
              />
            </Field>
            <Field label="Scheme">
              <SearchableSelect
                value={val('healthCheckScheme', 'http')}
                onValueChange={(v) => set('healthCheckScheme', v)}
                placeholder="Select scheme"
                options={[
                  { value: 'http', label: 'http' },
                  { value: 'https', label: 'https' },
                ]}
              />
            </Field>
            <Field label="Host">
              <Input
                placeholder="localhost"
                value={val('healthCheckHost', 'localhost')}
                onChange={(e) => set('healthCheckHost', e.target.value || 'localhost')}
              />
            </Field>
            <Field label="Port">
              <Input
                placeholder="Defaults to first exposed port"
                value={val('healthCheckPort', '') ?? ''}
                onChange={(e) => set('healthCheckPort', e.target.value || null)}
              />
            </Field>
            <Field label="Path">
              <Input
                placeholder="/"
                value={val('healthCheckPath', '') ?? ''}
                onChange={(e) => set('healthCheckPath', e.target.value || null)}
              />
            </Field>
          </>
          )}
          {hasHttpSurface && (
          <>
            <Field label="Return code">
              <Input
                type="number"
                value={String(val('healthCheckReturnCode', 200))}
                onChange={(e) => set('healthCheckReturnCode', Number(e.target.value) || 200)}
              />
            </Field>
            <Field label="Response text (optional, body must contain)">
              <Input
                placeholder="OK"
                value={val('healthCheckResponseText', '') ?? ''}
                onChange={(e) => set('healthCheckResponseText', e.target.value || null)}
              />
            </Field>
          </>
          )}
          <>
            <Field label="Interval (s)">
              <Input
                type="number"
                value={String(val('healthCheckInterval', 5))}
                onChange={(e) => set('healthCheckInterval', Number(e.target.value) || 5)}
              />
            </Field>
            <Field label="Timeout (s)">
              <Input
                type="number"
                value={String(val('healthCheckTimeout', 5))}
                onChange={(e) => set('healthCheckTimeout', Number(e.target.value) || 5)}
              />
            </Field>
            <Field label="Retries">
              <Input
                type="number"
                value={String(val('healthCheckRetries', 10))}
                onChange={(e) => set('healthCheckRetries', Number(e.target.value) || 10)}
              />
            </Field>
            <Field label="Start period (s)">
              <Input
                type="number"
                value={String(val('healthCheckStartPeriod', 5))}
                onChange={(e) => set('healthCheckStartPeriod', Number(e.target.value) || 5)}
              />
            </Field>
          </>
        </FormSection>
      )}

      <FormSection id="advanced" title="Advanced" footer={saveFooter}>
        {isGit && (
          <PreviewDnsGuide
            serverIp={svc.server?.ip}
            wildcardDomain={
              (servers ?? []).find((s) => s.id === (val('serverId', '') ?? svc.serverId))?.settings
                ?.wildcardDomain ??
              svc.server?.settings?.wildcardDomain ??
              null
            }
          />
        )}
        <>
          {isGit && (
            <>
              <ToggleField
                label="Auto deploy"
                tooltip="When enabled, push and service webhook events for this branch queue a new deployment. Turn off to require manual Deploy / Redeploy only."
                checked={settingVal('isAutoDeployEnabled', true)}
                onCheckedChange={(c) => set('isAutoDeployEnabled', c)}
              />
              <ToggleField
                label="Preview deployments"
                tooltip="On pull requests targeting this service’s branch, deploy {shortSha}.{serverWildcardDomain}, post a sticky GitHub comment, create a GitHub Check, and a Deployments timeline entry (like Vercel). Requires server Wildcard domain and GitHub App permissions: Pull requests Write, Issues Write, Checks Write, Deployments Write, and the Pull request webhook event."
                checked={settingVal('isPreviewDeploymentsEnabled', false)}
                onCheckedChange={(c) => set('isPreviewDeploymentsEnabled', c)}
              />
              <ToggleField
                label="Static site"
                tooltip="How to use: set Build pack → Static, put site assets under the Base directory (index.html, etc.), set Ports to 80, then Deploy. Peon wraps the folder in nginx:alpine and serves files on :80. This flag is saved for parity; the build pack is what activates static hosting."
                checked={settingVal('isStatic', false)}
                onCheckedChange={(c) => set('isStatic', c)}
              />
              <ToggleField
                label="Single-page app fallback"
                tooltip="How to use: use Build pack → Static for a client-side router (React Router, Vue Router, etc.), then enable this. Intended to rewrite unknown paths to index.html so deep links don’t 404. Flag is saved; Peon’s Static pack still uses default nginx (SPA rewrite not applied yet)."
                checked={settingVal('isSpa', false)}
                onCheckedChange={(c) => set('isSpa', c)}
              />
            </>
          )}
        </>
        {svc.kind === 'COMPOSE' && (
          <ToggleField
            label="Raw compose deployment"
            tooltip="Deploy your docker-compose.yml as-is — Peon will not inject container_name, the peon network, or proxy labels. Configure Traefik/Caddy yourself. Domains in Peon won’t apply until you add labels. Prefer leaving this off."
            checked={settingVal('isRawComposeDeploymentEnabled', false)}
            onCheckedChange={(c) => set('isRawComposeDeploymentEnabled', c)}
          />
        )}
        {(svc.kind !== 'COMPOSE' && svc.kind !== 'DATABASE') && (
          <ToggleField
            label="Rolling update"
            tooltip="Start the new container beside the old one, wait until it is healthy, then stop the old container. Requires a domain (Traefik/Caddy) and no host port mappings. Turn off to recreate in place."
            checked={settingVal('rollingUpdate', true)}
            onCheckedChange={(c) => set('rollingUpdate', c)}
          />
        )}
        {!isDb && (
        <>
          <Field
            label="Pre-deploy command"
            tooltip="Shell command run on the server after the image is built and before docker compose up (e.g. cache warm or migrate prep). Leave empty to skip."
          >
            <Input
              value={settingVal('preDeployCommand', '') ?? ''}
              onChange={(e) => set('preDeployCommand', e.target.value || null)}
            />
          </Field>
          <Field
            label="Post-deploy command"
            tooltip="Shell command run on the server after compose is up and the container is ready (e.g. migrate, seed). Leave empty to skip."
          >
            <Input
              value={settingVal('postDeployCommand', '') ?? ''}
              onChange={(e) => set('postDeployCommand', e.target.value || null)}
            />
          </Field>
        </>
        )}
        <Field
          label="Custom Docker options"
          tooltip="Extra docker run flags merged into compose on deploy. Supported: --cap-add, --cap-drop, --security-opt, --sysctl, --ulimit, --device, --shm-size, --dns, --init, --privileged, --ip, --ip6, --gpus, --hostname, --entrypoint. Example: --cap-add SYS_ADMIN --ulimit nofile=65536:65536"
        >
          <Input
            placeholder="--cap-add SYS_ADMIN --ulimit nofile=65536"
            value={settingVal('customDockerRunOptions', '') ?? ''}
            onChange={(e) => set('customDockerRunOptions', e.target.value || null)}
          />
        </Field>
        {!isDb && (
        <Field
          label="Labels"
          tooltip="Extra Docker labels (one per line), merged into the service compose labels alongside Peon’s proxy labels. Useful for Traefik/Caddy middlewares or custom metadata."
        >
          <Textarea
            className="font-mono min-h-24"
            placeholder="traefik.http.middlewares..."
            value={settingVal('customLabels', '') ?? ''}
            onChange={(e) => set('customLabels', e.target.value || null)}
          />
        </Field>
        )}
      </FormSection>

      <FormSection id="resource-limits" title="Resource limits" footer={saveFooter}>
        <Field
          label="CPU limit"
          tooltip="Docker CPU limit for the container (e.g. 0.5 = half a core). Leave empty for no limit. Applied on deploy via compose."
        >
          <Input
            placeholder="0.5"
            value={settingVal('cpuLimit', '') ?? ''}
            onChange={(e) => set('cpuLimit', e.target.value || null)}
          />
        </Field>
        <Field
          label="Memory limit"
          tooltip="Docker memory limit (e.g. 512m or 1g). Leave empty for no limit. Applied on deploy via compose."
        >
          <Input
            placeholder="512m"
            value={settingVal('memoryLimit', '') ?? ''}
            onChange={(e) => set('memoryLimit', e.target.value || null)}
          />
        </Field>
        <Field
          label="Docker images to keep"
          tooltip="After each successful build, keep this many previous peon/* image tags plus the currently running one (for rollback). Set 0 to keep only the running image. PR/preview tags are always removed. Applies to git-built apps, not registry pulls."
        >
          <Input
            type="number"
            value={String(settingVal('dockerImagesToKeep', 3))}
            onChange={(e) => set('dockerImagesToKeep', Number(e.target.value || 3))}
          />
        </Field>
        <Field
          label="Stop grace period (seconds)"
          tooltip="Seconds Docker waits for a graceful shutdown on stop/restart/redeploy before SIGKILL. Applied as stop_grace_period in compose."
        >
          <Input
            type="number"
            value={String(settingVal('stopGracePeriod', 30))}
            onChange={(e) => set('stopGracePeriod', Number(e.target.value || 30))}
          />
        </Field>
      </FormSection>
    </div>
  );
}

/**
 * Renders the declarative service-specific configuration (database
 * credentials / marketplace app fields) resolved by the backend. Sections and
 * fields are data-driven - see src/lib/service-config.
 */
function ServiceConfigPanel({
  serviceId,
  onSaved,
  onSettingsChanged,
}: {
  serviceId: string;
  onSaved: () => void;
  onSettingsChanged: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const { data } = useQuery({
    queryKey: ['service-config', serviceId],
    queryFn: () => getServiceConfig(serviceId),
  });

  const saveMut = useMutation({
    mutationFn: () => updateServiceConfig(serviceId, form),
    onSuccess: async () => {
      setForm({});
      await qc.invalidateQueries({ queryKey: ['service-config', serviceId] });
      onSaved();
      toast.success('Configuration saved');
      onSettingsChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  if (!data || data.sections.length === 0) return null;
  const dirty = Object.keys(form).length > 0;

  return (
    <>
      {data.sections.map((section) => (
        <FormSection
          key={section.id}
          title={section.title}
          footer={
            section.fields.some((f) => !f.readonly) ? (
              <Button size="sm" onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending}>
                Save
              </Button>
            ) : undefined
          }
        >
          {section.fields.map((field) => (
            <ConfigFieldInput
              key={field.key}
              field={field}
              value={form[field.key] ?? data.values[field.key] ?? ''}
              onChange={(v) => setForm((f) => ({ ...f, [field.key]: v }))}
            />
          ))}
        </FormSection>
      ))}
    </>
  );
}

function ConfigFieldInput({
  field,
  value,
  onChange,
}: {
  field: ServiceConfigField;
  value: string;
  onChange: (v: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const masked = field.isPassword && !revealed;

  return (
    <FormField
      label={
        <>
          {field.label}
          {field.required && !field.readonly && <span className="text-destructive"> *</span>}
        </>
      }
      description={field.helper}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <Input
          className="min-w-0 flex-1 font-mono"
          type={masked ? 'password' : 'text'}
          value={value}
          readOnly={field.readonly}
          onChange={(e) => onChange(e.target.value)}
        />
        {field.isPassword && (
          <Button variant="ghost" size="icon" className="shrink-0" aria-label={revealed ? 'Hide' : 'Reveal'} onClick={() => setRevealed(!revealed)}>
            {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </Button>
        )}
        {field.readonly && (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label="Copy"
            onClick={() => {
              void navigator.clipboard.writeText(value);
              toast.success('Copied');
            }}
          >
            <Copy className="size-3.5" />
          </Button>
        )}
      </div>
    </FormField>
  );
}
