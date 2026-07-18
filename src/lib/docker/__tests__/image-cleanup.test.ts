import { describe, expect, it } from 'vitest';
import {
  parseDockerImageList,
  selectImagesToDelete,
  type DockerImageRef,
} from '../image-cleanup';
import { buildCompose } from '../compose';

describe('parseDockerImageList', () => {
  it('parses repository:tag#created lines', () => {
    expect(
      parseDockerImageList(
        'peon/web-abc12345:deadbeef#2024-01-02 10:00:00 +0000 UTC\npeon/web-abc12345:<none>#2024-01-01\n',
      ),
    ).toEqual([
      {
        repository: 'peon/web-abc12345',
        tag: 'deadbeef',
        createdAt: '2024-01-02 10:00:00 +0000 UTC',
        imageRef: 'peon/web-abc12345:deadbeef',
      },
    ]);
  });
});

describe('selectImagesToDelete', () => {
  const images: DockerImageRef[] = [
    {
      repository: 'peon/app',
      tag: 'commit1',
      createdAt: '2024-01-01 10:00:00',
      imageRef: 'peon/app:commit1',
    },
    {
      repository: 'peon/app',
      tag: 'commit2',
      createdAt: '2024-01-02 10:00:00',
      imageRef: 'peon/app:commit2',
    },
    {
      repository: 'peon/app',
      tag: 'commit3',
      createdAt: '2024-01-03 10:00:00',
      imageRef: 'peon/app:commit3',
    },
    {
      repository: 'peon/app',
      tag: 'commit4',
      createdAt: '2024-01-04 10:00:00',
      imageRef: 'peon/app:commit4',
    },
    {
      repository: 'peon/app',
      tag: 'commit5',
      createdAt: '2024-01-05 10:00:00',
      imageRef: 'peon/app:commit5',
    },
    {
      repository: 'peon/app',
      tag: 'pr-12',
      createdAt: '2024-01-06 10:00:00',
      imageRef: 'peon/app:pr-12',
    },
    {
      repository: 'peon/app',
      tag: 'commit1-build',
      createdAt: '2024-01-01 09:00:00',
      imageRef: 'peon/app:commit1-build',
    },
    {
      repository: 'peon/app',
      tag: 'commit5-build',
      createdAt: '2024-01-05 09:00:00',
      imageRef: 'peon/app:commit5-build',
    },
  ];

  it('keeps N previous plus current, deletes older and PR tags', () => {
    const deleted = selectImagesToDelete(images, 'commit5', 2).map((i) => i.tag);
    expect(deleted).toContain('pr-12');
    expect(deleted).toContain('commit1');
    expect(deleted).toContain('commit2');
    expect(deleted).toContain('commit1-build');
    expect(deleted).not.toContain('commit5');
    expect(deleted).not.toContain('commit4');
    expect(deleted).not.toContain('commit3');
    expect(deleted).not.toContain('commit5-build');
  });

  it('with keep=0 deletes all except current', () => {
    const deleted = selectImagesToDelete(images, 'commit5', 0).map((i) => i.tag);
    expect(deleted).toContain('commit1');
    expect(deleted).toContain('commit4');
    expect(deleted).not.toContain('commit5');
  });
});

describe('buildCompose custom docker options', () => {
  it('emits merged compose fields from customDockerRunOptions', () => {
    const yaml = buildCompose({
      services: {
        app: {
          containerName: 'app-abc',
          image: 'peon/app:latest',
          customDockerRunOptions: '--cap-add SYS_ADMIN --hostname myhost',
        },
      },
    });
    expect(yaml).toContain('cap_add:');
    expect(yaml).toContain('SYS_ADMIN');
    expect(yaml).toContain('hostname: myhost');
  });
});
