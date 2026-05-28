export interface PlatformCategoryTemplate {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  path: string;
  level: number;
  description?: string;
  imageUrl?: string | null;
  sortOrder: number;
  active: boolean;
  templateVersion: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PlatformCategoryTemplateTree extends PlatformCategoryTemplate {
  children: PlatformCategoryTemplateTree[];
}

export interface OrgProvisionStatus {
  orgId: string;
  orgName: string;
  provisioned: boolean;
  templateVersion: number | null;
  categoryCount: number;
  provisionedAt: string | null;
}

export interface ProvisionResult {
  orgId: string;
  inserted: number;
  skipped: number;
  errors: string[];
}

export interface ForceProvisionResult extends ProvisionResult {
  deletedCategories: number;
  deletedMappings: number;
}

// ─── Backend doc shape ────────────────────────────────────────────────────────

export interface PlatformCategoryTemplateDoc {
  id?: string;
  _id?: string;
  slug: string;
  name: string;
  parentId?: string | null;
  path?: string;
  level?: number;
  description?: string;
  imageUrl?: string | null;
  sortOrder?: number;
  active?: boolean;
  templateVersion?: number;
  children?: PlatformCategoryTemplateDoc[];
  createdAt?: string;
  updatedAt?: string;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function docToTemplate(doc: PlatformCategoryTemplateDoc): PlatformCategoryTemplate {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = doc as any;
  return {
    id:              r.id ?? r._id ?? "",
    slug:            r.slug ?? "",
    name:            r.name ?? "",
    parentId:        r.parentId ?? null,
    path:            r.path ?? "",
    level:           r.level ?? 0,
    description:     r.description ?? undefined,
    imageUrl:        r.imageUrl ?? null,
    sortOrder:       r.sortOrder ?? 0,
    active:          r.active ?? true,
    templateVersion: r.templateVersion ?? 1,
    createdAt:       r.createdAt ?? undefined,
    updatedAt:       r.updatedAt ?? undefined,
  };
}

export function docToTemplateTree(doc: PlatformCategoryTemplateDoc): PlatformCategoryTemplateTree {
  return {
    ...docToTemplate(doc),
    children: Array.isArray(doc.children) ? doc.children.map(docToTemplateTree) : [],
  };
}

export function templateToPayload(
  t: Pick<PlatformCategoryTemplate, 'name' | 'slug' | 'parentId' | 'description' | 'sortOrder'>
): Record<string, unknown> {
  return {
    name:        t.name,
    slug:        t.slug,
    parentId:    t.parentId ?? null,
    description: t.description ?? null,
    sortOrder:   t.sortOrder ?? 0,
  };
}

export function flattenTemplateTree(
  nodes: PlatformCategoryTemplateTree[],
  result: PlatformCategoryTemplateTree[] = []
): PlatformCategoryTemplateTree[] {
  for (const node of nodes) {
    result.push(node);
    if (node.children.length > 0) flattenTemplateTree(node.children, result);
  }
  return result;
}

export function countTemplateDescendants(node: PlatformCategoryTemplateTree): number {
  return node.children.reduce((sum, c) => sum + 1 + countTemplateDescendants(c), 0);
}
