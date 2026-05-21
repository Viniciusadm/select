import type { ChangedDetail } from "./types.js";

export type EventName =
  | "loaded.sl.select"
  | "rendered.sl.select"
  | "refreshed.sl.select"
  | "show.sl.select"
  | "shown.sl.select"
  | "hide.sl.select"
  | "hidden.sl.select"
  | "changed.sl.select";

export function dispatch(
  target: HTMLElement,
  name: EventName,
  detail?: unknown,
  cancelable = false,
): boolean {
  const ev = new CustomEvent(name, { detail, cancelable, bubbles: true });
  return target.dispatchEvent(ev);
}

export function dispatchChanged(target: HTMLElement, detail: ChangedDetail): void {
  dispatch(target, "changed.sl.select", detail, false);
}

export function dispatchNativeChange(select: HTMLSelectElement): void {
  select.dispatchEvent(new Event("change", { bubbles: true }));
}
