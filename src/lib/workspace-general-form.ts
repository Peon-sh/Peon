import type { WorkspaceListItem } from '@/services/api/workspace';

/** Initial controlled-field values for workspace general settings. */
export function seedWorkspaceGeneralForm(workspace: WorkspaceListItem): {
  name: string;
  description: string;
} {
  return {
    name: workspace.name,
    description: workspace.description ?? '',
  };
}

/**
 * The previous settings page did:
 *   const [name, setName] = useState('')
 *   const [snapshot, setSnapshot] = useState(current)
 *   if (current && snapshot !== current) { setName(current.name); ... }
 *
 * On remount with a warm React Query cache, `useState(current)` makes
 * snapshot === current on the first render, so the sync never runs and
 * Name stays "". This helper encodes that failure mode for a regression test.
 */
export function wouldSkipWorkspaceFormSync(
  snapshot: WorkspaceListItem | undefined,
  current: WorkspaceListItem | undefined,
): boolean {
  return !(current && snapshot !== current);
}
