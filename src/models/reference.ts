import type { ReferenceCategory } from './status.js';

export type ReferenceFrontmatter = Record<string, unknown>;

export type ReferenceDescriptor = {
  category: ReferenceCategory;
  path: string;
  slug: string;
  last_modified: string;
  frontmatter: ReferenceFrontmatter;
};

export type ReferenceContent = {
  path: string;
  frontmatter: ReferenceFrontmatter;
  body: string;
  raw: string;
};
