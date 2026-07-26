import type { ChannelFormField, CategoryTreeNode } from "../types/channelStore";

// TikTok is stored as "tiktok" in ChannelType but some stores carry "tiktokshop".
// Normalise both to "tiktok" for matching / fetching ProductType channelCategoryDefaults.
export function normaliseChannelType(ct: string): string {
  return ct === "tiktokshop" ? "tiktok" : ct;
}

// Reconstruct breadcrumb path nodes from the denormalised categoryFullPath string.
// "Apparel & Accessories › Clothing › Tops" → [{id, name: "Apparel …", hasChildren: true}, ...]
// Only the leaf node carries the real categoryId. Ancestor nodes use placeholder IDs
// because we don't store them — but CategoryTreePicker only uses ancestor entries for
// display (the breadcrumb), not for API calls; actual navigation uses loadLevel(parentId).
export function buildPathNodes(
  categoryId: string,
  categoryFullPath: string,
  isLeaf: boolean,
): CategoryTreeNode[] {
  const path = categoryFullPath ?? "";
  const sep = path.includes("›") ? "›" : ">";
  const parts = path.split(sep).map((p) => p.trim()).filter(Boolean);

  if (parts.length <= 1 || !isLeaf) {
    // Single segment or mid-node: use the LAST segment — that is the node categoryId refers to.
    // parts[0] would be the root ancestor, not the node itself for multi-segment paths.
    const name = parts[parts.length - 1] ?? categoryId;
    return [{ id: categoryId, name, hasChildren: !isLeaf }];
  }

  // Multi-segment leaf: reconstruct ancestor chain.
  // Ancestors get a synthetic id (path-based) sufficient for breadcrumb display.
  return parts.map((name, i) => ({
    id: i === parts.length - 1 ? categoryId : `__ancestor_${i}_${name}`,
    name,
    hasChildren: i < parts.length - 1,
  }));
}

/** Minimal shape of a ProductType channel-category default needed for pre-fill. */
export interface ChannelCategoryDefaultLike {
  categoryId: string;
  categoryFullPath: string;
  isLeaf: boolean;
}

/**
 * Apply a ProductType channel-category default to a CATEGORY_TREE field, honoring the
 * leaf/non-leaf rule (single source of truth for both the wizard-level and tab-level pre-fill):
 *
 *   - leaf     → set config.selectedPath (committed breadcrumb) and RETURN the categoryId
 *                so the caller can write it into channelData as the field value.
 *   - non-leaf → set config.preFillPath only (a browse hint); RETURN undefined — nothing is
 *                committed, the merchant still has to pick a leaf.
 *
 * Mutates field.categoryTreeConfig in place. Returns the value to write into channelData,
 * or undefined when there is nothing to commit.
 */
export function applyChannelCategoryDefault(
  field: ChannelFormField,
  def: ChannelCategoryDefaultLike,
): string | undefined {
  const config = field.categoryTreeConfig;
  if (!config || !def.categoryId) return undefined;

  const pathNodes = buildPathNodes(def.categoryId, def.categoryFullPath, def.isLeaf);
  if (def.isLeaf) {
    config.selectedPath = pathNodes;
    return def.categoryId;
  }
  config.preFillPath = pathNodes;
  return undefined;
}
