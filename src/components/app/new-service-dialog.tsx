'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Boxes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
} from '@/components/app/modal';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  createService,
  listServers,
  type ServiceKind,
} from '@/services/api/service';
import { listPrivateKeys } from '@/services/api/privatekey';
import {
  listGithubSourceBranches,
  listGithubSourceRepositories,
  listSources,
} from '@/services/api/sources';
import { useAuthStore } from '@/store/auth';

const KIND_LABELS: Record<ServiceKind, string> = {
  GIT_APP: 'Application (Git)',
  DOCKERFILE: 'Dockerfile',
  DOCKER_IMAGE: 'Docker Image',
  STATIC: 'Static Site',
  NIXPACKS: 'Nixpacks',
  DATABASE: 'Database',
  COMPOSE: 'Compose',
};

const POSTGRES_IMAGES: { value: string; label: string }[] = [
  { value: 'postgres:18-alpine', label: 'PostgreSQL 18 (default)' },
  { value: 'postgres:17-alpine', label: 'PostgreSQL 17' },
  { value: 'postgres:16-alpine', label: 'PostgreSQL 16' },
  { value: 'supabase/postgres:17.4.1.032', label: 'Supabase PostgreSQL (with extensions)' },
  { value: 'postgis/postgis:17-3.5-alpine', label: 'PostGIS 17 (AMD only)' },
  { value: 'pgvector/pgvector:pg18', label: 'PGVector (PG 18)' },
  { value: 'pgvector/pgvector:pg17', label: 'PGVector (PG 17)' },
];

const DATABASE_ENGINES: { value: string; label: string }[] = [
  { value: 'POSTGRESQL', label: 'PostgreSQL' },
  { value: 'MYSQL', label: 'MySQL' },
  { value: 'MARIADB', label: 'MariaDB' },
  { value: 'MONGODB', label: 'MongoDB' },
  { value: 'REDIS', label: 'Redis' },
  { value: 'KEYDB', label: 'KeyDB' },
  { value: 'DRAGONFLY', label: 'Dragonfly' },
  { value: 'CLICKHOUSE', label: 'ClickHouse' },
];

export function NewServiceDialog({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated?: (serviceId: string) => void;
}) {
  const qc = useQueryClient();
  const workspaceId = useAuthStore((s) => s.currentWorkspaceId);
  const [open, setOpen] = useState(false);

  const [kind, setKind] = useState<ServiceKind>('GIT_APP');
  const [name, setName] = useState('');
  const [serverId, setServerId] = useState<string>('');
  const [gitRepository, setGitRepository] = useState('');
  const [repositoryProjectId, setRepositoryProjectId] = useState<number | null>(null);
  const [gitBranch, setGitBranch] = useState('main');
  const [gitBuildPack, setGitBuildPack] = useState('NIXPACKS');
  const [gitSourceMode, setGitSourceMode] = useState<'public' | 'git_app' | 'deploy_key'>('git_app');
  const [gitAppProvider, setGitAppProvider] = useState<'github' | 'gitlab'>('github');
  const [githubAppId, setGithubAppId] = useState('');
  const [gitlabAppId, setGitlabAppId] = useState('');
  const [privateKeyId, setPrivateKeyId] = useState('');
  const [selectedRepoFullName, setSelectedRepoFullName] = useState('');
  const [dockerImage, setDockerImage] = useState('');
  const [dockerTag, setDockerTag] = useState('latest');
  const [composeRaw, setComposeRaw] = useState('');
  const [databaseEngine, setDatabaseEngine] = useState('POSTGRESQL');
  const [databaseImage, setDatabaseImage] = useState('postgres:18-alpine');
  const [baseDirectory, setBaseDirectory] = useState('/');
  const [dockerfilePath, setDockerfilePath] = useState('/Dockerfile');
  const [ports, setPorts] = useState('');
  const [publishDirectory, setPublishDirectory] = useState('');

  const { data: servers } = useQuery({
    queryKey: ['servers', workspaceId],
    queryFn: () => listServers(workspaceId!),
    enabled: open && !!workspaceId,
  });

  const { data: sources } = useQuery({
    queryKey: ['sources', workspaceId],
    queryFn: () => listSources(workspaceId!),
    enabled: open && !!workspaceId,
  });
  const { data: privateKeys } = useQuery({
    queryKey: ['private-keys', workspaceId],
    queryFn: () => listPrivateKeys(workspaceId!),
    enabled: open && !!workspaceId && gitSourceMode === 'deploy_key',
  });
  const githubSources = sources?.github ?? [];
  const gitlabSources = sources?.gitlab ?? [];
  const connectedGithubSources = githubSources.filter(
    (source) => source.status === 'CONNECTED' || source.kind === 'CUSTOM',
  );
  const selectedGithubAppId =
    gitSourceMode === 'git_app' && gitAppProvider === 'github'
      ? githubAppId || connectedGithubSources[0]?.id || ''
      : '';
  const selectedGitlabAppId =
    gitSourceMode === 'git_app' && gitAppProvider === 'gitlab'
      ? gitlabAppId || gitlabSources[0]?.id || ''
      : '';
  const selectedGithubSource = connectedGithubSources.find((s) => s.id === selectedGithubAppId);
  const selectedGitAppConnection =
    gitAppProvider === 'github' && selectedGithubAppId
      ? `github:${selectedGithubAppId}`
      : gitAppProvider === 'gitlab' && selectedGitlabAppId
        ? `gitlab:${selectedGitlabAppId}`
        : '';

  const { data: githubRepos, isLoading: reposLoading } = useQuery({
    queryKey: ['github-source-repos', selectedGithubAppId],
    queryFn: () => listGithubSourceRepositories(selectedGithubAppId),
    enabled: open && gitSourceMode === 'git_app' && gitAppProvider === 'github' && !!selectedGithubAppId,
  });

  const { data: githubBranches } = useQuery({
    queryKey: ['github-source-branches', selectedGithubAppId, selectedRepoFullName],
    queryFn: () => listGithubSourceBranches(selectedGithubAppId, selectedRepoFullName),
    enabled:
      open &&
      gitSourceMode === 'git_app' &&
      gitAppProvider === 'github' &&
      !!selectedGithubAppId &&
      !!selectedRepoFullName,
  });

  const createMut = useMutation({
    mutationFn: () => {
      const base: Record<string, unknown> = { kind, name, serverId };
      const applyGitSource = () => {
        base.gitRepository = gitRepository;
        base.gitBranch = gitBranch;
        if (gitSourceMode === 'git_app' && gitAppProvider === 'github') {
          base.gitSourceType = 'GITHUB_APP';
          base.githubAppId = selectedGithubAppId;
          if (repositoryProjectId != null) base.repositoryProjectId = repositoryProjectId;
        } else if (gitSourceMode === 'git_app' && gitAppProvider === 'gitlab') {
          base.gitSourceType = 'GITLAB_APP';
          base.gitlabAppId = selectedGitlabAppId;
        } else if (gitSourceMode === 'deploy_key') {
          base.gitSourceType = 'DEPLOY_KEY';
          if (privateKeyId) base.privateKeyId = privateKeyId;
        } else {
          base.gitSourceType = 'PUBLIC';
        }
      };
      if (kind === 'GIT_APP') {
        applyGitSource();
        base.buildPack = gitBuildPack;
      } else if (kind === 'DOCKERFILE' || kind === 'NIXPACKS' || kind === 'STATIC') {
        applyGitSource();
      } else if (kind === 'DOCKER_IMAGE') {
        base.dockerRegistryImage = dockerImage;
        base.dockerRegistryTag = dockerTag;
        if (ports) base.ports = ports;
      } else if (kind === 'COMPOSE') {
        base.dockerComposeRaw = composeRaw;
      } else if (kind === 'DATABASE') {
        base.databaseEngine = databaseEngine;
        if (databaseEngine === 'POSTGRESQL') base.databaseImage = databaseImage;
      }
      if (kind === 'GIT_APP' || kind === 'DOCKERFILE' || kind === 'NIXPACKS' || kind === 'STATIC') {
        base.baseDirectory = baseDirectory || '/';
        if (ports) base.ports = ports;
        if (kind === 'STATIC' && publishDirectory) base.publishDirectory = publishDirectory;
        if (kind === 'DOCKERFILE' || (kind === 'GIT_APP' && gitBuildPack === 'DOCKERFILE')) {
          base.dockerfilePath = dockerfilePath || '/Dockerfile';
        }
      }
      return createService(projectId, base);
    },
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: ['services', projectId] });
      toast.success('Service created');
      setOpen(false);
      setName('');
      setServerId('');
      setGitRepository('');
      setRepositoryProjectId(null);
      setSelectedRepoFullName('');
      setGithubAppId('');
      setGitlabAppId('');
      setPrivateKeyId('');
      onCreated?.(created.id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const needsGit = kind === 'GIT_APP' || kind === 'DOCKERFILE' || kind === 'NIXPACKS' || kind === 'STATIC';
  const canSubmit =
    !!name &&
    !!serverId &&
    (kind === 'DOCKER_IMAGE'
      ? !!dockerImage
      : kind === 'COMPOSE'
        ? !!composeRaw
        : kind === 'DATABASE'
          ? true
          : !!gitRepository);
  return (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalTrigger asChild>
        <Button>
          <Boxes className="size-4" /> New Service
        </Button>
      </ModalTrigger>
      <ModalContent size="xl">
        <ModalHeader>
          <ModalTitle>New Service</ModalTitle>
          <ModalDescription>Create a deployable unit in this project.</ModalDescription>
        </ModalHeader>
        <ModalBody>
          {needsGit ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <SearchableSelect
                    value={kind}
                    onValueChange={(v) => setKind(v as ServiceKind)}
                    placeholder="Select type"
                    options={(Object.keys(KIND_LABELS) as ServiceKind[]).map((k) => ({
                      value: k,
                      label: KIND_LABELS[k],
                    }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="svc-name">Name</Label>
                  <Input id="svc-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <Label>Server</Label>
                  <SearchableSelect
                    value={serverId}
                    onValueChange={setServerId}
                    placeholder="Select server"
                    options={(servers ?? []).map((s) => ({
                      value: s.id,
                      label: `${s.name} (${s.ip})`,
                      keywords: s.ip,
                    }))}
                  />
                  {!servers?.length && (
                    <p className="text-muted-foreground text-[11px]">
                      Add and validate a server before creating deployable services.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="svc-port">Port</Label>
                  <Input
                    id="svc-port"
                    placeholder="3000"
                    value={ports}
                    onChange={(e) => setPorts(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="svc-basedir">Base directory</Label>
                  <Input
                    id="svc-basedir"
                    placeholder="/"
                    value={baseDirectory}
                    onChange={(e) => setBaseDirectory(e.target.value)}
                  />
                </div>

                {kind === 'STATIC' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="svc-publish">Publish directory</Label>
                    <Input
                      id="svc-publish"
                      placeholder="/dist"
                      value={publishDirectory}
                      onChange={(e) => setPublishDirectory(e.target.value)}
                    />
                  </div>
                )}

                {kind === 'GIT_APP' && (
                  <div className="space-y-1.5">
                    <Label>Build pack</Label>
                    <SearchableSelect
                      value={gitBuildPack}
                      onValueChange={setGitBuildPack}
                      placeholder="Select build pack"
                      options={[
                        { value: 'NIXPACKS', label: 'Nixpacks' },
                        { value: 'RAILPACK', label: 'Railpack' },
                        { value: 'DOCKERFILE', label: 'Dockerfile' },
                        { value: 'STATIC', label: 'Static' },
                      ]}
                    />
                  </div>
                )}

                {(kind === 'DOCKERFILE' || (kind === 'GIT_APP' && gitBuildPack === 'DOCKERFILE')) && (
                  <div className="space-y-1.5">
                    <Label htmlFor="svc-dockerfile">Dockerfile location</Label>
                    <Input
                      id="svc-dockerfile"
                      placeholder="/Dockerfile"
                      value={dockerfilePath}
                      onChange={(e) => setDockerfilePath(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Git source type</Label>
                  <SearchableSelect
                    value={gitSourceMode}
                    onValueChange={(value) => {
                      setSelectedRepoFullName('');
                      setGitRepository('');
                      setRepositoryProjectId(null);
                      const mode = value as 'public' | 'git_app' | 'deploy_key';
                      setGitSourceMode(mode);
                      if (mode === 'git_app') {
                        if (connectedGithubSources[0]) {
                          setGitAppProvider('github');
                          setGithubAppId(connectedGithubSources[0].id);
                        } else if (gitlabSources[0]) {
                          setGitAppProvider('gitlab');
                          setGitlabAppId(gitlabSources[0].id);
                        }
                      }
                    }}
                    placeholder="Select source type"
                    options={[
                      { value: 'git_app', label: 'Git App' },
                      { value: 'public', label: 'Public repository' },
                      { value: 'deploy_key', label: 'Deploy key' },
                    ]}
                  />
                </div>

                {gitSourceMode === 'git_app' ? (
                  <>
                    <div className="space-y-1.5">
                      <Label>Connection</Label>
                      <SearchableSelect
                        value={selectedGitAppConnection}
                        onValueChange={(value) => {
                          setSelectedRepoFullName('');
                          setGitRepository('');
                          setRepositoryProjectId(null);
                          if (value.startsWith('github:')) {
                            setGitAppProvider('github');
                            setGithubAppId(value.slice('github:'.length));
                          } else if (value.startsWith('gitlab:')) {
                            setGitAppProvider('gitlab');
                            setGitlabAppId(value.slice('gitlab:'.length));
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
                    </div>
                    {gitAppProvider === 'github' && selectedGithubAppId ? (
                      <>
                        {selectedGithubSource?.status && selectedGithubSource.status !== 'CONNECTED' ? (
                          <p className="text-muted-foreground text-[12px]">
                            This GitHub connection is {selectedGithubSource.status.toLowerCase()}. Reconnect
                            under Git Sources before creating a service.
                          </p>
                        ) : null}
                        <div className="space-y-1.5">
                          <Label>Repository</Label>
                          <SearchableSelect
                            value={selectedRepoFullName}
                            onValueChange={(fullName) => {
                              const repo = githubRepos?.find((r) => r.fullName === fullName);
                              setSelectedRepoFullName(fullName);
                              setGitRepository(repo?.cloneUrl ?? '');
                              setRepositoryProjectId(repo?.id ?? null);
                              setGitBranch(repo?.defaultBranch ?? 'main');
                              if (!name && repo) setName(repo.name);
                            }}
                            placeholder={reposLoading ? 'Loading repositories…' : 'Select repository'}
                            disabled={reposLoading || selectedGithubSource?.status === 'DISCONNECTED'}
                            options={(githubRepos ?? []).map((repo) => ({
                              value: repo.fullName,
                              label: `${repo.fullName}${repo.private ? ' · private' : ''}`,
                              keywords: repo.fullName,
                            }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Branch</Label>
                          <SearchableSelect
                            value={gitBranch}
                            onValueChange={setGitBranch}
                            placeholder="Select branch"
                            options={(githubBranches?.length ? githubBranches : [gitBranch]).map(
                              (branch) => ({
                                value: branch,
                                label: branch,
                              }),
                            )}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-1.5">
                          <Label htmlFor="svc-repo">Git repository</Label>
                          <Input
                            id="svc-repo"
                            placeholder="https://gitlab.com/group/project.git"
                            value={gitRepository}
                            onChange={(e) => setGitRepository(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="svc-branch">Branch</Label>
                          <Input
                            id="svc-branch"
                            value={gitBranch}
                            onChange={(e) => setGitBranch(e.target.value)}
                          />
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="svc-repo">Git repository</Label>
                      <Input
                        id="svc-repo"
                        placeholder="https://github.com/user/repo.git"
                        value={gitRepository}
                        onChange={(e) => setGitRepository(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="svc-branch">Branch</Label>
                      <Input
                        id="svc-branch"
                        value={gitBranch}
                        onChange={(e) => setGitBranch(e.target.value)}
                      />
                    </div>
                    {gitSourceMode === 'deploy_key' ? (
                      <div className="space-y-1.5">
                        <Label>Private key</Label>
                        <SearchableSelect
                          value={privateKeyId || 'none'}
                          onValueChange={(id) => setPrivateKeyId(id === 'none' ? '' : id)}
                          placeholder="Select private key"
                          options={[
                            { value: 'none', label: 'No private key' },
                            ...(privateKeys ?? []).map((key) => ({ value: key.id, label: key.name })),
                          ]}
                        />
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <SearchableSelect
                  value={kind}
                  onValueChange={(v) => setKind(v as ServiceKind)}
                  placeholder="Select type"
                  options={(Object.keys(KIND_LABELS) as ServiceKind[]).map((k) => ({
                    value: k,
                    label: KIND_LABELS[k],
                  }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="svc-name">Name</Label>
                <Input id="svc-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>Server</Label>
                <SearchableSelect
                  value={serverId}
                  onValueChange={setServerId}
                  placeholder="Select server"
                  options={(servers ?? []).map((s) => ({
                    value: s.id,
                    label: `${s.name} (${s.ip})`,
                    keywords: s.ip,
                  }))}
                />
                {!servers?.length && (
                  <p className="text-muted-foreground text-[11px]">
                    Add and validate a server before creating deployable services.
                  </p>
                )}
              </div>

              {kind === 'DOCKER_IMAGE' && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="svc-image">Image</Label>
                    <Input
                      id="svc-image"
                      placeholder="nginx"
                      value={dockerImage}
                      onChange={(e) => setDockerImage(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="svc-tag">Tag</Label>
                    <Input id="svc-tag" value={dockerTag} onChange={(e) => setDockerTag(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="svc-image-port">Port</Label>
                    <Input
                      id="svc-image-port"
                      placeholder="80"
                      value={ports}
                      onChange={(e) => setPorts(e.target.value)}
                    />
                  </div>
                </>
              )}

              {kind === 'COMPOSE' && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="svc-compose">docker-compose.yml</Label>
                  <Textarea
                    id="svc-compose"
                    className="font-mono min-h-32"
                    value={composeRaw}
                    onChange={(e) => setComposeRaw(e.target.value)}
                  />
                </div>
              )}

              {kind === 'DATABASE' && (
                <>
                  <div className="space-y-1.5">
                    <Label>Engine</Label>
                    <SearchableSelect
                      value={databaseEngine}
                      onValueChange={setDatabaseEngine}
                      placeholder="Select engine"
                      options={DATABASE_ENGINES}
                    />
                  </div>
                  {databaseEngine === 'POSTGRESQL' && (
                    <div className="space-y-1.5">
                      <Label>Image</Label>
                      <SearchableSelect
                        value={databaseImage}
                        onValueChange={setDatabaseImage}
                        placeholder="Select image"
                        options={POSTGRES_IMAGES}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => createMut.mutate()} disabled={!canSubmit || createMut.isPending}>
            Create
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
