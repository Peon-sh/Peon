import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalServerExecutor } from '../local';

const executor = new LocalServerExecutor();
let dir: string;

describe('LocalServerExecutor', () => {
  const e2e = process.env.PEON_E2E;

  beforeEach(async () => {
    // These tests exercise the real implementation, not the E2E stub.
    delete process.env.PEON_E2E;
    dir = await mkdtemp(join(tmpdir(), 'peon-local-exec-'));
  });

  afterEach(async () => {
    if (e2e === undefined) delete process.env.PEON_E2E;
    else process.env.PEON_E2E = e2e;
    await rm(dir, { recursive: true, force: true });
  });

  describe('exec', () => {
    it('captures stdout and a zero exit code', async () => {
      const res = await executor.exec('echo hello');
      expect(res.code).toBe(0);
      expect(res.stdout.trim()).toBe('hello');
    });

    it('captures stderr and a non-zero exit code without throwing', async () => {
      // Matches node-ssh: a failing command resolves, it does not reject.
      const res = await executor.exec('echo oops >&2; exit 3');
      expect(res.code).toBe(3);
      expect(res.stderr.trim()).toBe('oops');
    });

    it('honours cwd', async () => {
      const res = await executor.exec('pwd', { cwd: dir });
      // macOS reports /private/var for /var; compare the resolved suffix.
      expect(res.stdout.trim().endsWith(dir.replace(/^\/private/, ''))).toBe(true);
    });

    it('runs through a shell so pipes and redirects work like the SSH path', async () => {
      const res = await executor.exec('printf "a\\nb\\nc\\n" | wc -l');
      expect(res.code).toBe(0);
      expect(res.stdout.trim()).toBe('3');
    });

    it('never returns a null exit code', async () => {
      const res = await executor.exec('exit 0');
      expect(res.code).toBe(0);
      expect(res.code).not.toBeNull();
    });
  });

  describe('execStream', () => {
    it('streams stdout chunks to the sink', async () => {
      const chunks: Array<[string, string]> = [];
      const res = await executor.execStream('echo streamed', (c, s) => chunks.push([c, s]));

      expect(res.code).toBe(0);
      expect(chunks.some(([c, s]) => c.includes('streamed') && s === 'stdout')).toBe(true);
    });

    it('tags stderr chunks separately', async () => {
      const chunks: Array<[string, string]> = [];
      await executor.execStream('echo bad >&2', (c, s) => chunks.push([c, s]));

      expect(chunks.some(([c, s]) => c.includes('bad') && s === 'stderr')).toBe(true);
    });

    it('returns the accumulated output as well as streaming it', async () => {
      const res = await executor.execStream('echo both', () => {});
      expect(res.stdout.trim()).toBe('both');
    });
  });

  describe('file transfer', () => {
    it('writes content, creating parent directories', async () => {
      const target = join(dir, 'nested/deep/compose.yml');
      await executor.putContent(target, 'services: {}\n');
      expect(await readFile(target, 'utf8')).toBe('services: {}\n');
    });

    it('overwrites existing content', async () => {
      const target = join(dir, 'f.txt');
      await executor.putContent(target, 'first');
      await executor.putContent(target, 'second');
      expect(await readFile(target, 'utf8')).toBe('second');
    });

    it('copies a file in', async () => {
      const src = join(dir, 'src.txt');
      await writeFile(src, 'payload');
      const dest = join(dir, 'out/dest.txt');
      await executor.putFile(src, dest);
      expect(await readFile(dest, 'utf8')).toBe('payload');
    });

    it('copies a file out', async () => {
      const src = join(dir, 'remote.txt');
      await writeFile(src, 'dump');
      const dest = join(dir, 'local/copy.txt');
      await executor.getFile(src, dest);
      expect(await readFile(dest, 'utf8')).toBe('dump');
    });
  });

  describe('e2e stub parity with the SSH pool', () => {
    it('short-circuits exec', async () => {
      process.env.PEON_E2E = '1';
      await expect(executor.exec('anything')).resolves.toEqual({
        code: 0,
        stdout: 'ok',
        stderr: '',
      });
    });

    it('short-circuits file writes', async () => {
      process.env.PEON_E2E = '1';
      const target = join(dir, 'should-not-exist.txt');
      await executor.putContent(target, 'x');
      await expect(readFile(target, 'utf8')).rejects.toThrow();
    });
  });

  it('reports mode as local', () => {
    expect(executor.mode).toBe('local');
  });

  it('disconnect is a no-op', () => {
    expect(() => executor.disconnect()).not.toThrow();
  });
});
