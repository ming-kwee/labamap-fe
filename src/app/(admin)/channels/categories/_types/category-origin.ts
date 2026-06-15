export type CategorySourceOrigin = "import" | "template";

export interface CategoryOriginInfo {
  categorySourceOrigin: CategorySourceOrigin | null;
  categoryOnboardedAt: string | null;
  categoryGracePeriodActive: boolean;
  categoryGracePeriodEndsAt: string | null;
}

export function isOriginChosen(info: CategoryOriginInfo | null): boolean {
  return info?.categorySourceOrigin != null;
}

export function isImportLocked(info: CategoryOriginInfo | null): boolean {
  if (!info) return false;
  if (info.categorySourceOrigin === "template") return true;
  if (info.categorySourceOrigin === "import" && !info.categoryGracePeriodActive) return true;
  return false;
}

export function formatOriginLabel(origin: CategorySourceOrigin | null): string {
  if (origin === "import") return "Import dari Channel";
  if (origin === "template") return "Platform Template";
  return "Belum dipilih";
}
