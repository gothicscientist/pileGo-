// Files dropped somewhere else in the app (the pile, the closet) waiting for
// the scan screen to pick them up. In memory only: a reload starts fresh.

let pending: File[] = [];

export function handOffFiles(files: File[]) {
  pending = files.filter(f => f.type.startsWith('image/'));
}

export function takeHandedOffFiles(): File[] {
  const out = pending;
  pending = [];
  return out;
}

export function imageFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
}
