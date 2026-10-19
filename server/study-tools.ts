import { copyFile, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import type { Tool } from 'openai/resources/responses/responses';
import { STUDY_FILE_EXTENSIONS } from './config.ts';
import type { Settings } from './config.ts';

const MAX_LISTED_FILES = 500;
const SKIPPED_DIRS = ['node_modules', '.git'];

const pathProperty = { type: 'string', description: 'Path relative to the study folder, e.g. "aws/s3.md".' };

export const studyToolDefinitions: Tool[] = [
  {
    type: 'function',
    name: 'list_study_files',
    strict: true,
    description: 'List all .md and .txt study files in the study folder.',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    type: 'function',
    name: 'read_study_file',
    strict: true,
    description: 'Read the text of one study file.',
    parameters: {
      type: 'object',
      properties: { path: pathProperty },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'write_study_file',
    strict: true,
    description:
      'Create a study file or replace its whole content. The previous version is kept as <file>.bak.',
    parameters: {
      type: 'object',
      properties: { path: pathProperty, content: { type: 'string' } },
      required: ['path', 'content'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'edit_study_file',
    strict: true,
    description:
      'Replace one exact, unique occurrence of old_text with new_text in a study file. Use an empty old_text to append new_text to the end. The previous version is kept as <file>.bak.',
    parameters: {
      type: 'object',
      properties: { path: pathProperty, old_text: { type: 'string' }, new_text: { type: 'string' } },
      required: ['path', 'old_text', 'new_text'],
      additionalProperties: false,
    },
  },
  { type: 'web_search' },
];

const isInside = (root: string, target: string) => target === root || target.startsWith(root + sep);

async function nearestExistingRealPath(path: string): Promise<string> {
  let current = path;
  while (!existsSync(current)) current = dirname(current);
  return resolve(await realpath(current), relative(current, path));
}

export async function resolveStudyPath(studyDir: string, path: string): Promise<string> {
  if (typeof path !== 'string' || !path.trim()) throw new Error('A file path is required.');
  if (!STUDY_FILE_EXTENSIONS.includes(extname(path).toLowerCase()))
    throw new Error(`Only ${STUDY_FILE_EXTENSIONS.join(', ')} files are allowed.`);
  const target = await nearestExistingRealPath(resolve(studyDir, path));
  if (!isInside(studyDir, target)) throw new Error('Path is outside the study folder.');
  return target;
}

export async function listStudyFiles(studyDir: string): Promise<string[]> {
  const entries = await readdir(studyDir, { recursive: true });
  return entries
    .filter((entry) => STUDY_FILE_EXTENSIONS.includes(extname(entry).toLowerCase()))
    .filter((entry) => !entry.split(sep).some((part) => SKIPPED_DIRS.includes(part)))
    .sort()
    .slice(0, MAX_LISTED_FILES);
}

export async function readStudyFile(settings: Settings, path: string, maxChars: number): Promise<string> {
  const text = await readFile(await resolveStudyPath(settings.studyDir, path), 'utf8');
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[Truncated at ${maxChars} characters.]` : text;
}

async function writeWithBackup(target: string, content: string) {
  if (existsSync(target)) await copyFile(target, `${target}.bak`);
  else await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

export async function executeStudyTool(
  settings: Settings,
  name: string,
  raw: string,
): Promise<{ arguments: Record<string, unknown>; result: unknown }> {
  const args = JSON.parse(raw || '{}') as Record<string, string>;
  if (name === 'list_study_files')
    return { arguments: args, result: await listStudyFiles(settings.studyDir) };
  if (name === 'read_study_file')
    return { arguments: args, result: await readStudyFile(settings, args.path, settings.readMaxChars) };
  if (name === 'write_study_file') {
    await writeWithBackup(await resolveStudyPath(settings.studyDir, args.path), String(args.content));
    return { arguments: { path: args.path }, result: `Saved ${args.path}.` };
  }
  if (name === 'edit_study_file') {
    const target = await resolveStudyPath(settings.studyDir, args.path);
    const current = await readFile(target, 'utf8');
    const oldText = String(args.old_text);
    const newText = String(args.new_text);
    if (!oldText) {
      await writeWithBackup(target, `${current}${current.endsWith('\n') ? '' : '\n'}${newText}`);
      return { arguments: args, result: `Appended to ${args.path}.` };
    }
    const matches = current.split(oldText).length - 1;
    if (matches !== 1) throw new Error(`old_text must match exactly once; found ${matches} matches.`);
    await writeWithBackup(
      target,
      current.replace(oldText, () => newText),
    );
    return { arguments: args, result: `Edited ${args.path}.` };
  }
  throw new Error(`Unknown tool: ${name}`);
}
