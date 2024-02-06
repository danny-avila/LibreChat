interface RemoveAccents {
  (part: string): string;
  remove(part: string): string;
  has(part: string): boolean;
}

declare var dm: RemoveAccents;
export = dm;
