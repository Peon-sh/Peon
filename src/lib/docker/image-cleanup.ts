import { shellSingleQuote } from '@/lib/shell/quote';

export type DockerImageRef = {
  repository: string;
  tag: string;
  createdAt: string;
  imageRef: string;
};

/** Parse `docker images --format '{{.Repository}}:{{.Tag}}#{{.CreatedAt}}'` lines. */
export function parseDockerImageList(output: string): DockerImageRef[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [imageRef = '', createdAt = ''] = line.split('#');
      const colon = imageRef.lastIndexOf(':');
      const repository = colon >= 0 ? imageRef.slice(0, colon) : imageRef;
      const tag = colon >= 0 ? imageRef.slice(colon + 1) : '';
      return { repository, tag, createdAt, imageRef };
    })
    .filter((img) => img.tag && img.tag !== '<none>');
}

/**
 * Image retention: always keep the currently running tag; keep up to
 * `imagesToKeep` additional newest regular tags; delete the rest.
 * PR tags (`pr-*`) and `*-build` intermediates are always deleted (except
 * build tags that still correspond to kept/current tags).
 */
export function selectImagesToDelete(
  images: DockerImageRef[],
  currentTag: string,
  imagesToKeep: number,
): DockerImageRef[] {
  const keep = Math.max(0, Math.floor(imagesToKeep));
  const prImages = images.filter((img) => img.tag.startsWith('pr-'));
  const buildImages = images.filter(
    (img) => !img.tag.startsWith('pr-') && img.tag.endsWith('-build'),
  );
  const regularImages = images.filter(
    (img) => !img.tag.startsWith('pr-') && !img.tag.endsWith('-build'),
  );

  const sortedRegular = regularImages
    .filter((img) => img.tag !== currentTag)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const toDelete = [...prImages, ...sortedRegular.slice(keep)];

  const keptTags = new Set(sortedRegular.slice(0, keep).map((img) => img.tag));
  if (currentTag) keptTags.add(currentTag);

  for (const img of buildImages) {
    const baseTag = img.tag.replace(/-build$/, '');
    if (!keptTags.has(baseTag)) toDelete.push(img);
  }

  return toDelete;
}

/** Shell that lists local images matching a repository filter. */
export function buildImageCleanupScript(imageRepository: string): string {
  return `docker images --format '{{.Repository}}:{{.Tag}}#{{.CreatedAt}}' --filter reference=${shellSingleQuote(`${imageRepository}*`)} 2>/dev/null || true`;
}

export function buildImageRmiScript(imageRefs: string[]): string {
  if (imageRefs.length === 0) return 'true';
  const quoted = imageRefs.map((ref) => shellSingleQuote(ref)).join(' ');
  return `docker rmi ${quoted} 2>/dev/null || true`;
}
