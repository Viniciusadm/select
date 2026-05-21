import type { OptionSnap, GroupSnap, Snapshot } from "./types.js";

export function readSnapshot(select: HTMLSelectElement): Snapshot {
  const groups: GroupSnap[] = [];
  const options: OptionSnap[] = [];
  const groupIdByEl = new WeakMap<HTMLOptGroupElement, number>();

  const optEls = select.options;
  for (let i = 0; i < optEls.length; i++) {
    const o = optEls[i]!;
    let groupId: number | null = null;
    const parent = o.parentElement;
    if (parent && parent.tagName === "OPTGROUP") {
      const og = parent as HTMLOptGroupElement;
      let id = groupIdByEl.get(og);
      if (id === undefined) {
        id = groups.length;
        groups.push({
          id,
          label: og.label || "",
          disabled: og.disabled,
        });
        groupIdByEl.set(og, id);
      }
      groupId = id;
    }

    options.push({
      value: o.value,
      label: o.label || o.textContent || "",
      disabled: o.disabled,
      selected: o.selected,
      tokens: o.dataset["tokens"] || "",
      subtext: o.dataset["subtext"] || "",
      groupId,
      index: i,
    });
  }

  return {
    options,
    groups,
    multiple: select.multiple,
    disabled: select.disabled,
  };
}

export function selectedValues(snap: Snapshot): string[] {
  const out: string[] = [];
  for (const o of snap.options) if (o.selected) out.push(o.value);
  return out;
}

export function snapshotEquals(a: Snapshot, b: Snapshot): boolean {
  if (a.multiple !== b.multiple || a.disabled !== b.disabled) return false;
  if (a.options.length !== b.options.length) return false;
  if (a.groups.length !== b.groups.length) return false;
  for (let i = 0; i < a.options.length; i++) {
    const x = a.options[i]!;
    const y = b.options[i]!;
    if (
      x.value !== y.value ||
      x.label !== y.label ||
      x.disabled !== y.disabled ||
      x.selected !== y.selected ||
      x.tokens !== y.tokens ||
      x.subtext !== y.subtext ||
      x.groupId !== y.groupId
    ) {
      return false;
    }
  }
  for (let i = 0; i < a.groups.length; i++) {
    const x = a.groups[i]!;
    const y = b.groups[i]!;
    if (x.label !== y.label || x.disabled !== y.disabled) return false;
  }
  return true;
}
