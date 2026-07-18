import { describe, expect, it } from 'vitest';
import { asGithubId, githubIdPath, githubIdsEqual } from '../ids';

describe('github ids', () => {
  it('accepts check-run ids larger than Int32', () => {
    const id = asGithubId(5_007_040_321);
    expect(id).toBe(5_007_040_321n);
    expect(githubIdPath(id!)).toBe('5007040321');
  });

  it('compares number and bigint equally', () => {
    expect(githubIdsEqual(5_007_040_321, 5_007_040_321n)).toBe(true);
    expect(githubIdsEqual(1, 2n)).toBe(false);
  });
});
