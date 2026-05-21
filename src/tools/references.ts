import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { readMeta } from '../db/meta.js';
import type { ReferenceContent, ReferenceDescriptor } from '../models/reference.js';
import { FocusError, REFERENCE_CATEGORIES, type ReferenceCategory } from '../models/status.js';
import { referenceDir, relativeReferencePath, resolveReferencePath } from '../paths.js';
import { fileExists, getMtime, readMarkdownFile, writeMarkdownAtomic } from '../utils/files.js';
import { withFileLock } from '../utils/locks.js';
import { slugFromFilename } from '../utils/slug.js';

export const listReferencesSchema = z
  .object({
    category: z.enum(REFERENCE_CATEGORIES).optional(),
  })
  .strict();
export type ListReferencesInput = z.infer<typeof listReferencesSchema>;

export const readReferenceSchema = z.object({ path: z.string().min(1) }).strict();
export type ReadReferenceInput = z.infer<typeof readReferenceSchema>;

export const suggestReferenceUpdateSchema = z
  .object({
    path: z.string().min(1),
    content: z.string(),
    reason: z.string().min(1),
    create_if_missing: z.boolean().optional().default(true),
  })
  .strict();
export type SuggestReferenceUpdateInput = z.infer<typeof suggestReferenceUpdateSchema>;

type RefListing = { absolute: string; category: ReferenceCategory; slug: string };

function listRefs(): RefListing[] {
  const base = referenceDir();
  if (!fileExists(base)) return [];
  const results: RefListing[] = [];

  const rootEntries: Array<{ file: string; category: ReferenceCategory }> = [
    { file: 'objectives.md', category: 'objectives' },
    { file: 'orgchart.md', category: 'orgchart' },
    { file: 'style_guide.md', category: 'style_guide' },
  ];
  for (const { file, category } of rootEntries) {
    const absolute = resolve(base, file);
    if (fileExists(absolute)) {
      results.push({ absolute, category, slug: category });
    }
  }

  for (const [folder, category] of [
    ['stakeholders', 'stakeholders'] as const,
    ['projects', 'projects'] as const,
  ]) {
    const folderPath = resolve(base, folder);
    if (!fileExists(folderPath)) continue;
    let names: string[];
    try {
      names = readdirSync(folderPath);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith('.md')) continue;
      if (name.endsWith('.pending.md')) continue;
      const absolute = resolve(folderPath, name);
      results.push({ absolute, category, slug: slugFromFilename(name) });
    }
  }
  return results;
}

export function listReferencesTool(input: ListReferencesInput): {
  references: ReferenceDescriptor[];
} {
  const parsed = listReferencesSchema.parse(input);
  const filter = parsed.category;
  const items = listRefs().filter((r) => !filter || r.category === filter);
  const references = items.map<ReferenceDescriptor>((r) => {
    const md = readMarkdownFile(r.absolute);
    return {
      category: r.category,
      path: relativeReferencePath(r.absolute),
      slug: r.slug,
      last_modified: getMtime(r.absolute),
      frontmatter: md.frontmatter,
    };
  });
  return { references };
}

export function readReferenceTool(input: ReadReferenceInput): ReferenceContent {
  const parsed = readReferenceSchema.parse(input);
  const absolute = resolveReferencePath(parsed.path);
  if (!fileExists(absolute)) {
    throw new FocusError('NOT_FOUND', `Reference not found: ${parsed.path}`);
  }
  const md = readMarkdownFile(absolute);
  return { ...md, path: parsed.path };
}

function summarizeDiff(oldContent: string | null, newContent: string): string {
  if (oldContent === null) {
    const lines = newContent.split('\n').length;
    return `New file (${lines} lines).`;
  }
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  let added = 0;
  let removed = 0;
  for (const line of newLines) if (!oldSet.has(line)) added += 1;
  for (const line of oldLines) if (!newSet.has(line)) removed += 1;
  return `+${added} / -${removed} lines (out of ${newLines.length}).`;
}

export async function suggestReferenceUpdateTool(
  input: SuggestReferenceUpdateInput,
): Promise<{ status: 'applied' | 'pending'; pending_path?: string; diff_summary: string }> {
  const parsed = suggestReferenceUpdateSchema.parse(input);
  if (parsed.path.endsWith('.pending.md')) {
    throw new FocusError('INVALID_INPUT', 'Target path must not end with .pending.md');
  }
  const absolute = resolveReferencePath(parsed.path);
  const exists = fileExists(absolute);
  if (!exists && !parsed.create_if_missing) {
    throw new FocusError('NOT_FOUND', `Reference does not exist: ${parsed.path}`);
  }

  const db = getDb();
  const bootstrapStatus = readMeta(db, 'bootstrap_status');
  const inBootstrap = bootstrapStatus === 'in_progress';

  const previous = exists ? readMarkdownFile(absolute).raw : null;
  const diff = summarizeDiff(previous, parsed.content);

  if (inBootstrap) {
    await withFileLock(absolute, () => {
      writeMarkdownAtomic(absolute, parsed.content);
    });
    return { status: 'applied', diff_summary: diff };
  }

  const pendingAbsolute = `${absolute}.pending.md`;
  await withFileLock(pendingAbsolute, () => {
    writeMarkdownAtomic(pendingAbsolute, parsed.content);
  });
  const pendingPath = `${parsed.path}.pending.md`;
  return { status: 'pending', pending_path: pendingPath, diff_summary: diff };
}
