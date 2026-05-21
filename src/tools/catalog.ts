import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { z } from 'zod';
import { FocusError } from '../models/status.js';
import { fileExists } from '../utils/files.js';

export const recommendMcpsSchema = z
  .object({ user_tools: z.array(z.string()).optional() })
  .strict();
export type RecommendMcpsInput = z.infer<typeof recommendMcpsSchema>;

export type McpRecommendation = {
  tool: string;
  name: string;
  package: string;
  install_url: string;
  alternatives: Array<{ name: string; url: string }>;
  required_for: Array<'bootstrap' | 'todo_generation' | 'execution'>;
};

type CatalogShape = Record<
  string,
  {
    name: string;
    package: string;
    install_url: string;
    alternatives?: Array<{ name: string; url: string }>;
    required_for?: Array<'bootstrap' | 'todo_generation' | 'execution'>;
  }
>;

let cached: CatalogShape | null = null;

function loadCatalog(): CatalogShape {
  if (cached) return cached;
  const here = fileURLToPath(new URL('.', import.meta.url));
  const candidates = [
    resolve(here, '..', 'catalog', 'mcps.yaml'),
    resolve(here, '..', '..', 'src', 'catalog', 'mcps.yaml'),
  ];
  for (const path of candidates) {
    if (fileExists(path)) {
      const raw = readFileSync(path, 'utf8');
      cached = yaml.load(raw) as CatalogShape;
      return cached;
    }
  }
  throw new FocusError('IO_ERROR', 'Could not locate catalog/mcps.yaml');
}

export function recommendMcpsTool(input: RecommendMcpsInput): {
  recommendations: McpRecommendation[];
} {
  const parsed = recommendMcpsSchema.parse(input);
  const catalog = loadCatalog();
  const filter = parsed.user_tools;
  const recommendations: McpRecommendation[] = [];
  for (const [tool, entry] of Object.entries(catalog)) {
    if (filter && !filter.includes(tool)) continue;
    recommendations.push({
      tool,
      name: entry.name,
      package: entry.package,
      install_url: entry.install_url,
      alternatives: entry.alternatives ?? [],
      required_for: entry.required_for ?? [],
    });
  }
  return { recommendations };
}

export function clearCatalogCacheForTests(): void {
  cached = null;
}
