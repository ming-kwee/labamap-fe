/**
 * Plain-language, slow explanations for the Reverse Playground — shown in the "what's this?" modal.
 * Covers each pipeline OP-TYPE and each OUTPUT SECTION (stages + buckets). FE-authored educational copy
 * (chrome); op params/examples come from the reverse op catalog (data). See docs/reversesync/11.
 */

export interface Explainer {
  title: string;
  /** One-line "what it is". */
  summary: string;
  /** Slow, plain-language paragraphs — the actual explanation. */
  detail: string[];
  /** "How to read it / what to look for" here. */
  how?: string;
}

/** Pipeline op-types (keyed by opCode). Paired with the catalog's params/example in the modal. */
export const OP_HELP: Record<string, Explainer> = {
  REBASE_ITEM: {
    title: "Rebase item",
    summary: "Finds the actual product object inside the channel's response wrapper.",
    detail: [
      "Channels rarely return the product at the top level — they wrap it (e.g. Shopee returns it under response.item_list[0], TikTok under data).",
      "Rebase 'unwraps' that: it lifts the product object up so every later step sees fields at clean, predictable paths (title, price…) instead of buried ones (response.item_list[0].title).",
    ],
    how: "If nothing downstream finds any fields, the itemPath is probably wrong — check that it points at the real product object.",
  },
  DERIVE_SCALAR: {
    title: "Derive scalar",
    summary: "Pulls one simple value out of a nested/derived structure into a flat field.",
    detail: [
      "Some values you want live deep inside a structure. Example: the category id is the leaf of a category chain array, not a plain field.",
      "Derive-scalar walks to that spot (optionally matching an element in an array) and copies the single value out to a flat name the mapping can use (e.g. category_id).",
    ],
    how: "Look at targetPath — that flat field is what the classify step will try to map to a master attribute.",
  },
  AGGREGATE: {
    title: "Aggregate",
    summary: "Collapses a list of numbers into one value (min / max / first).",
    detail: [
      "Sometimes the master wants a single number the channel only exposes across many rows — e.g. a product-level price when the channel only has per-variant prices.",
      "Aggregate reads a list and reduces it to one scalar using a strategy (MIN, MAX, FIRST), writing it to a flat field.",
    ],
    how: "Check strategy + targetPath: e.g. MIN price across variants → product price.",
  },
  VARIANT_INVERSE: {
    title: "Variant inverse",
    summary: "Un-builds the channel's variant matrix back into master variants (SKUs + axes).",
    detail: [
      "Forward publish 'scatters' master variants into the channel's own shape (Shopee tier_variation + model, TikTok sales_attributes). This is the exact inverse.",
      "It reads the per-SKU records and the axis definitions, figures out which option each SKU has on each axis, and rebuilds clean master variants (sku, price, inventory, …) via the fieldMap.",
    ],
    how: "fieldMap shows channelPath → masterVariantField. axisRefStyle tells you how a SKU points at its axes (index array vs inline name/value).",
  },
  ATTRIBUTE_LIST: {
    title: "Attribute list inverse",
    summary: "Turns a channel attribute list [{id, value}] back into flat attributes.",
    detail: [
      "Channels carry category attributes as a list of {attribute_id, value} objects. On its own that list means nothing to the master.",
      "This op reads each entry and lays it out as a flat field keyed by the attribute id, so the classify step can map it to the matching master attribute.",
    ],
    how: "idField + valueField tell you which fields hold the id and the value in each list entry.",
  },
  METAFIELD_INVERSE: {
    title: "Metafield inverse",
    summary: "Extracts channel metafields / reference-objects into flat attributes.",
    detail: [
      "Richer channels (e.g. Shopify) store extra data as metafields (namespace + key + value) or reference-objects.",
      "This op picks the relevant metafields (optionally filtered by namespace) and flattens them so they can map to master attributes.",
    ],
    how: "namespace narrows which metafields count; keyField/valueField say where the key and value live.",
  },
  IMAGE_INVERSE: {
    title: "Image inverse",
    summary: "Reads the channel's image structure into a plain URL list.",
    detail: [
      "Images are master-authoritative: reverse never overwrites master images from a channel. Instead it reads the channel's images so you can SEE the difference (drift).",
      "This op un-builds whatever image shape the channel uses (URL list, id list, per-variant refs) into a simple ordered list of URLs.",
    ],
    how: "In the output, images show up as drift (channel vs master) — informational, not written back.",
  },
};

/** Output sections (stages + buckets), keyed by a stable id used by the panels. */
export const SECTION_HELP: Record<string, Explainer> = {
  // ── stages ──
  rebase: {
    title: "Stage 1 · Rebase",
    summary: "The product object, unwrapped from the channel's response.",
    detail: [
      "This snapshot is what the pipeline works on after pulling the product out of any wrapper.",
      "It should look like a single product object with recognizable fields — not the raw API envelope.",
    ],
    how: "Open it only if later stages look empty — then verify the item was unwrapped correctly.",
  },
  deDerive: {
    title: "Stage 2 · De-derive",
    summary: "Channel structures un-built into flat, master-aligned fields (+ notes).",
    detail: [
      "Here the channel's derived shapes (variant matrices, attribute lists, images) are 'un-built' into flat dotted fields the master can understand.",
      "'Notes' list structures that could NOT be safely un-built yet — they're informative, not errors.",
    ],
    how: "Compare these flat fields to the raw payload to see what was decoded. Notes = things reverse skipped.",
  },
  enrich: {
    title: "Stage 3 · Enrich",
    summary: "Extra values computed on top of de-derivation (e.g. aggregates).",
    detail: [
      "Some master fields are derived, not copied — like a product-level price aggregated from variant prices.",
      "This stage adds those. The '+N keys' chip shows how many fields it added.",
    ],
    how: "Look at the added keys — those exist only because of enrich ops.",
  },
  classify: {
    title: "Stage 4 · Classify (the result)",
    summary: "Every field sorted into 3 buckets — this is the answer.",
    detail: [
      "The final stage decides, for each flat field, WHERE it belongs: the master, the per-store channel data, or nowhere.",
      "That decision uses the channel's attribute mappings — the same mappings the forward publish uses.",
    ],
    how: "Read the three buckets below: Master-mapped, Channel-only, Discarded.",
  },
  // ── buckets ──
  masterMapped: {
    title: "Master-mapped",
    summary: "Fields that map to a master attribute — candidates to update the master.",
    detail: [
      "These channel fields are linked (via attribute mappings) to a master attribute, so they COULD flow into the master product.",
      "Each row shows the master field, the incoming channel value, and (if a master is linked) the current master value.",
    ],
    how: "The badge tells you the diff: SAME (identical), CHANGED (would update the master), or NEW (master had no value).",
  },
  channelOnly: {
    title: "Channel-only",
    summary: "Known channel fields with no master link — go to Step-2 channelData.",
    detail: [
      "These are recognized channel fields that don't map to any master attribute.",
      "They aren't master data, so they'd be stored per-store as Step-2 channelData (channel-specific), not on the master product.",
    ],
    how: "Expect channel-specific settings here (things only that marketplace cares about).",
  },
  discarded: {
    title: "Discarded",
    summary: "Operational / unknown fields — dropped, no platform meaning.",
    detail: [
      "These fields have no mapping and no channelData home — they're channel plumbing (timestamps, internal ids, flags).",
      "Reverse drops them: they carry no meaning for your master or Step-2.",
    ],
    how: "Usually safe to ignore. If something important is here, its mapping may be missing.",
  },
};
