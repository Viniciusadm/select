type Instance = {
  rootEl: HTMLElement;
  isOpen: () => boolean;
  hide: () => void;
  reposition?: () => void;
};

const instances = new Set<Instance>();
let installed = false;

function onDocClick(e: MouseEvent) {
  const target = e.target as Node | null;
  if (!target) return;
  for (const inst of instances) {
    if (!inst.isOpen()) continue;
    if (!inst.rootEl.contains(target) && !isInsidePortal(inst, target)) {
      inst.hide();
    }
  }
}

function isInsidePortal(inst: Instance, target: Node): boolean {
  // The dropdown may live outside rootEl in portal mode; we tag it with data-sl-owner.
  let el: Node | null = target;
  while (el) {
    if (el instanceof HTMLElement && el.dataset["slOwner"] === ownerId(inst)) return true;
    el = el.parentNode;
  }
  return false;
}

const ownerIds = new WeakMap<Instance, string>();
let nextOwner = 0;
export function ownerId(inst: Instance): string {
  let id = ownerIds.get(inst);
  if (!id) {
    id = `sl-${++nextOwner}`;
    ownerIds.set(inst, id);
  }
  return id;
}

function onDocKey(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  for (const inst of instances) {
    if (inst.isOpen()) {
      inst.hide();
    }
  }
}

function onWinResize() {
  for (const inst of instances) {
    if (inst.isOpen() && inst.reposition) inst.reposition();
  }
}

function install() {
  if (installed) return;
  installed = true;
  document.addEventListener("click", onDocClick, true);
  document.addEventListener("keydown", onDocKey, true);
  window.addEventListener("resize", onWinResize, { passive: true });
  window.addEventListener("scroll", onWinResize, { passive: true, capture: true });
}

export function register(inst: Instance): void {
  install();
  instances.add(inst);
}

export function unregister(inst: Instance): void {
  instances.delete(inst);
}
