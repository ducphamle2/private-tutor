import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { listStudyFiles } from './study-tools.ts';

test('listStudyFiles skips unreadable subfolders instead of failing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'study-'));
  const locked = join(dir, 'locked');
  await writeFile(join(dir, 'a.md'), 'hi');
  await mkdir(locked);
  await chmod(locked, 0o000);
  try {
    assert.deepEqual(await listStudyFiles(dir), ['a.md']);
  } finally {
    await chmod(locked, 0o755);
    await rm(dir, { recursive: true });
  }
});
