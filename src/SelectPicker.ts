import type {
  ResolvedOptions,
  SelectPickerOptions,
  Snapshot,
  OptionSnap,
  ChangedDetail,
} from "./types.js";
import { readSnapshot, selectedValues, snapshotEquals } from "./snapshot.js";
import { dispatch, dispatchChanged, dispatchNativeChange } from "./events.js";
import { makeMatcher, stripDiacritics } from "./normalize.js";
import {
  CLS,
  buildRoot,
  buildItem,
  applyItemState,
  setItemContent,
  renderTriggerLabel,
  type BuiltRoot,
  type BuildConfig,
} from "./view.js";
import { register, unregister, ownerId as makeOwnerId } from "./globals.js";

const REGISTRY = new WeakMap<HTMLSelectElement, SelectPicker>();
const FORM_REFS = new WeakMap<HTMLFormElement, { count: number; handler: () => void; instances: Set<SelectPicker> }>();

const DEFAULTS: ResolvedOptions = {
  liveSearchNormalize: true,
  virtualizeThreshold: 200,
  portal: false,
  noResultsText: "Nenhum resultado",
  countSuffix: "selecionados",
  placeholder: "Selecione…",
  searchPlaceholder: "Pesquisar",
};

const SEARCH_DEBOUNCE_MS = 80;

interface DataConfig {
  liveSearch: boolean;
  actionsBox: boolean;
  selectedTextFormat: string | null;
  size: number | null;
  width: string | null;
  searchPlaceholder: string | null;
  portal: boolean;
}

function readDataConfig(select: HTMLSelectElement): DataConfig {
  const ds = select.dataset;
  return {
    liveSearch: ds["liveSearch"] === "true",
    actionsBox: ds["actionsBox"] === "true",
    selectedTextFormat: ds["selectedTextFormat"] || null,
    size: ds["size"] ? Number(ds["size"]) : null,
    width: ds["width"] || null,
    searchPlaceholder: ds["liveSearchPlaceholder"] || null,
    portal: ds["portal"] === "true",
  };
}

export class SelectPicker {
  static init(
    target: string | Element | NodeListOf<Element> | Element[],
    options?: SelectPickerOptions,
  ): SelectPicker[] {
    let els: Element[];
    if (typeof target === "string") {
      els = Array.from(document.querySelectorAll(target));
    } else if (target instanceof Element) {
      els = [target];
    } else {
      els = Array.from(target as ArrayLike<Element>);
    }
    const out: SelectPicker[] = [];
    for (const el of els) {
      if (!(el instanceof HTMLSelectElement)) continue;
      const existing = REGISTRY.get(el);
      if (existing) {
        existing.refresh();
        out.push(existing);
      } else {
        out.push(new SelectPicker(el, options));
      }
    }
    return out;
  }

  static get(el: HTMLSelectElement): SelectPicker | undefined {
    return REGISTRY.get(el);
  }

  private select: HTMLSelectElement;
  private opts: ResolvedOptions;
  private data: DataConfig;
  private snap: Snapshot;
  private built: BuiltRoot;
  private ownerId: string;
  private listMounted = false;
  private open = false;
  private activeIdx = -1;
  private query = "";
  private filteredIdx: number[] = [];
  private itemByOptIdx = new Map<number, HTMLDivElement>();
  private form: HTMLFormElement | null = null;
  private searchTimer: number | null = null;
  private typeAheadBuf = "";
  private typeAheadTimer: number | null = null;
  private itemHeight = 0;
  private destroyed = false;
  private listClickHandler: ((e: MouseEvent) => void) | null = null;
  private listKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private triggerKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private triggerClickHandler: ((e: MouseEvent) => void) | null = null;
  private searchInputHandler: ((e: Event) => void) | null = null;
  private searchKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private actionsClickHandler: ((e: MouseEvent) => void) | null = null;
  private scrollHandler: (() => void) | null = null;

  constructor(el: HTMLSelectElement, options?: SelectPickerOptions) {
    if (REGISTRY.has(el)) {
      throw new Error("SelectPicker: element already initialized");
    }
    this.select = el;
    this.opts = { ...DEFAULTS, ...(options || {}) };
    this.data = readDataConfig(el);
    this.snap = readSnapshot(el);

    const cfg: BuildConfig = {
      multiple: this.snap.multiple,
      disabled: this.snap.disabled,
      liveSearch: this.data.liveSearch,
      actionsBox: this.data.actionsBox,
      searchPlaceholder: this.data.searchPlaceholder || this.opts.searchPlaceholder,
      noResultsText: this.opts.noResultsText,
      width: this.data.width,
      size: this.data.size,
      ownerId: "",
    };
    cfg.ownerId = makeOwnerId(this.instanceShim());
    this.ownerId = cfg.ownerId;
    this.built = buildRoot(cfg);

    this.hideNativeSelect();
    el.insertAdjacentElement("afterend", this.built.root);

    this.bindTrigger();
    this.bindSearch();
    this.bindActions();
    this.bindList();
    this.attachToForm();

    this.renderTrigger();

    REGISTRY.set(el, this);
    register(this.instanceShim());

    dispatch(el, "loaded.sl.select");
  }

  // Shim object passed to globals.ts (avoids exposing `this` directly).
  private _shim?: { rootEl: HTMLElement; isOpen: () => boolean; hide: () => void; reposition?: () => void };
  private instanceShim() {
    if (!this._shim) {
      this._shim = {
        rootEl: this.built ? this.built.root : (undefined as unknown as HTMLElement),
        isOpen: () => this.open,
        hide: () => this.hide(),
        reposition: () => this.reposition(),
      };
    }
    // rootEl may have been undefined when first created (before built existed). Refresh.
    if (this.built) this._shim.rootEl = this.built.root;
    return this._shim;
  }

  // ---------- Native select handling ----------

  private hideNativeSelect(): void {
    const s = this.select;
    s.setAttribute("aria-hidden", "true");
    s.tabIndex = -1;
    s.dataset["slHidden"] = "1";
    // Visually hide without using display:none (keeps labels/submit working).
    s.style.position = "absolute";
    s.style.width = "1px";
    s.style.height = "1px";
    s.style.padding = "0";
    s.style.margin = "-1px";
    s.style.overflow = "hidden";
    s.style.clip = "rect(0,0,0,0)";
    s.style.whiteSpace = "nowrap";
    s.style.border = "0";
  }

  private restoreNativeSelect(): void {
    const s = this.select;
    s.removeAttribute("aria-hidden");
    s.tabIndex = 0;
    delete s.dataset["slHidden"];
    s.style.position = "";
    s.style.width = "";
    s.style.height = "";
    s.style.padding = "";
    s.style.margin = "";
    s.style.overflow = "";
    s.style.clip = "";
    s.style.whiteSpace = "";
    s.style.border = "";
  }

  // ---------- Event binding ----------

  private bindTrigger(): void {
    const t = this.built.trigger;
    this.triggerClickHandler = (e) => {
      e.preventDefault();
      if (this.snap.disabled) return;
      this.toggle();
    };
    this.triggerKeyHandler = (e) => this.onTriggerKey(e);
    t.addEventListener("click", this.triggerClickHandler);
    t.addEventListener("keydown", this.triggerKeyHandler);
  }

  private bindSearch(): void {
    const input = this.built.searchInput;
    if (!input) return;
    this.searchInputHandler = () => {
      if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => {
        this.searchTimer = null;
        this.query = input.value;
        this.applyFilter();
      }, SEARCH_DEBOUNCE_MS);
    };
    this.searchKeyHandler = (e) => this.onSearchKey(e);
    input.addEventListener("input", this.searchInputHandler);
    input.addEventListener("keydown", this.searchKeyHandler);
  }

  private bindActions(): void {
    const wrap = this.built.actionsWrap;
    if (!wrap) return;
    this.actionsClickHandler = (e) => {
      const btn = (e.target as HTMLElement).closest(`.${CLS.actionsBtn}`) as HTMLButtonElement | null;
      if (!btn) return;
      e.preventDefault();
      if (btn.dataset["action"] === "select-all") this.selectAll();
      else if (btn.dataset["action"] === "deselect-all") this.deselectAll();
      const input = this.built.searchInput;
      if (input) input.focus();
    };
    wrap.addEventListener("click", this.actionsClickHandler);
  }

  private bindList(): void {
    const list = this.built.list;
    this.listClickHandler = (e) => {
      const itemEl = (e.target as HTMLElement).closest(`.${CLS.item}`) as HTMLDivElement | null;
      if (!itemEl) return;
      if (itemEl.classList.contains(CLS.itemDisabled)) return;
      const idx = Number(itemEl.dataset["index"]);
      if (Number.isNaN(idx)) return;
      this.toggleByIndex(idx);
      if (!this.snap.multiple) this.hide();
    };
    this.listKeyHandler = (e) => this.onListKey(e);
    list.addEventListener("click", this.listClickHandler);
    list.addEventListener("keydown", this.listKeyHandler);

    this.scrollHandler = () => {
      if (this.virtualizeOn()) this.renderVirtualWindow();
    };
    list.addEventListener("scroll", this.scrollHandler, { passive: true });
  }

  // ---------- Form reset ----------

  private attachToForm(): void {
    const form = this.select.form;
    if (!form) return;
    this.form = form;
    let ref = FORM_REFS.get(form);
    if (!ref) {
      const instances = new Set<SelectPicker>();
      const handler = () => {
        // After reset, native select state has been restored; re-render all instances.
        // Use microtask: at the time `reset` fires synchronously, .selected may not be fully reset yet
        // depending on the browser; queueing a microtask avoids that race.
        queueMicrotask(() => {
          for (const inst of instances) inst.refreshSilently();
        });
      };
      ref = { count: 0, handler, instances };
      FORM_REFS.set(form, ref);
      form.addEventListener("reset", handler);
    }
    ref.count++;
    ref.instances.add(this);
  }

  private detachFromForm(): void {
    if (!this.form) return;
    const ref = FORM_REFS.get(this.form);
    if (!ref) return;
    ref.instances.delete(this);
    ref.count--;
    if (ref.count <= 0) {
      this.form.removeEventListener("reset", ref.handler);
      FORM_REFS.delete(this.form);
    }
    this.form = null;
  }

  /** Re-derive state from <select> without firing changed.sl.select. */
  private refreshSilently(): void {
    this.snap = readSnapshot(this.select);
    if (this.listMounted) this.rebuildList();
    this.renderTrigger();
  }

  // ---------- Public API ----------

  val(): string | string[];
  val(value: string | string[]): void;
  val(value?: string | string[]): string | string[] | void {
    if (arguments.length === 0) {
      if (this.snap.multiple) return selectedValues(this.snap);
      return this.select.value;
    }
    const prev = this.snap.multiple ? selectedValues(this.snap) : this.select.value;
    const targets = Array.isArray(value) ? value : [value as string];
    const targetSet = new Set(targets.map((v) => v ?? ""));
    let mutated = false;
    let lastClicked = -1;
    let lastSelectedState = false;
    const opts = this.select.options;
    for (let i = 0; i < opts.length; i++) {
      const o = opts[i]!;
      const shouldSelect = this.snap.multiple
        ? targetSet.has(o.value)
        : targets[0] === o.value && lastClicked === -1; // first match for single
      if (o.selected !== shouldSelect) {
        o.selected = shouldSelect;
        mutated = true;
        lastClicked = i;
        lastSelectedState = shouldSelect;
      }
    }
    if (mutated) {
      this.snap = readSnapshot(this.select);
      if (this.listMounted) this.syncItemStates();
      this.renderTrigger();
      dispatchNativeChange(this.select);
      const detail: ChangedDetail = {
        clickedIndex: lastClicked,
        isSelected: lastSelectedState,
        previousValue: prev,
      };
      dispatchChanged(this.select, detail);
    }
  }

  refresh(): void {
    const next = readSnapshot(this.select);
    if (snapshotEquals(this.snap, next)) {
      dispatch(this.select, "refreshed.sl.select");
      return;
    }
    // Detect: was currently-selected option removed?
    const prevSelected = selectedValues(this.snap);
    const nextValues = new Set(next.options.map((o) => o.value));
    const lostSelection = prevSelected.some((v) => !nextValues.has(v));

    this.snap = next;
    // Update built config aspects that can change cheaply (disabled state).
    this.built.trigger.disabled = next.disabled;
    this.built.root.classList.toggle(CLS.disabled, next.disabled);
    if (this.listMounted) this.rebuildList();
    this.renderTrigger();

    if (lostSelection) {
      const detail: ChangedDetail = {
        clickedIndex: -1,
        isSelected: false,
        previousValue: this.snap.multiple ? prevSelected : (prevSelected[0] ?? ""),
      };
      dispatchNativeChange(this.select);
      dispatchChanged(this.select, detail);
    }
    dispatch(this.select, "refreshed.sl.select");
  }

  show(): void {
    if (this.open || this.snap.disabled) return;
    const allow = dispatch(this.select, "show.sl.select", undefined, true);
    if (!allow) return;
    if (!this.listMounted) {
      this.rebuildList();
      this.listMounted = true;
      dispatch(this.select, "rendered.sl.select");
    } else {
      this.applyFilter();
    }
    this.open = true;
    this.built.root.classList.add(CLS.open);
    this.built.dropdown.hidden = false;
    this.built.trigger.setAttribute("aria-expanded", "true");

    if (this.opts.portal || this.data.portal) {
      this.enterPortal();
    }
    this.reposition();

    // Focus management
    const input = this.built.searchInput;
    if (input) input.focus();
    else this.built.trigger.focus();

    // Active descendant: first selected, else first non-disabled
    this.activeIdx = this.initialActiveIndex();
    this.applyActiveDescendant();
    this.scrollActiveIntoView();

    dispatch(this.select, "shown.sl.select");
  }

  hide(): void {
    if (!this.open) return;
    const allow = dispatch(this.select, "hide.sl.select", undefined, true);
    if (!allow) return;
    this.open = false;
    this.built.root.classList.remove(CLS.open);
    this.built.dropdown.hidden = true;
    this.built.trigger.setAttribute("aria-expanded", "false");
    this.built.trigger.removeAttribute("aria-activedescendant");
    if (this.built.searchInput) {
      this.built.searchInput.value = "";
      this.built.searchInput.removeAttribute("aria-activedescendant");
    }
    this.query = "";
    if (this.searchTimer !== null) {
      window.clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.applyFilter(); // resets hidden state for next open

    if (this.builtIsPortaled()) this.exitPortal();

    this.built.trigger.focus();
    dispatch(this.select, "hidden.sl.select");
  }

  toggle(): void {
    if (this.open) this.hide();
    else this.show();
  }

  selectAll(): void {
    this.batchSelectAll(true);
  }

  deselectAll(): void {
    this.batchSelectAll(false);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.open) {
      this.open = false;
      if (this.builtIsPortaled()) this.exitPortal();
    }
    unregister(this.instanceShim());
    this.detachFromForm();

    if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
    if (this.typeAheadTimer !== null) window.clearTimeout(this.typeAheadTimer);

    // Listeners on owned nodes will be GC'd with the nodes, but explicit cleanup avoids leaks
    // if anything captures references.
    const t = this.built.trigger;
    if (this.triggerClickHandler) t.removeEventListener("click", this.triggerClickHandler);
    if (this.triggerKeyHandler) t.removeEventListener("keydown", this.triggerKeyHandler);
    const input = this.built.searchInput;
    if (input) {
      if (this.searchInputHandler) input.removeEventListener("input", this.searchInputHandler);
      if (this.searchKeyHandler) input.removeEventListener("keydown", this.searchKeyHandler);
    }
    const aw = this.built.actionsWrap;
    if (aw && this.actionsClickHandler) aw.removeEventListener("click", this.actionsClickHandler);
    const list = this.built.list;
    if (this.listClickHandler) list.removeEventListener("click", this.listClickHandler);
    if (this.listKeyHandler) list.removeEventListener("keydown", this.listKeyHandler);
    if (this.scrollHandler) list.removeEventListener("scroll", this.scrollHandler);

    this.built.root.remove();
    if (this.built.dropdown.parentNode && this.built.dropdown.parentNode !== this.built.root) {
      this.built.dropdown.remove();
    }
    this.restoreNativeSelect();
    REGISTRY.delete(this.select);
  }

  // ---------- Rendering ----------

  private renderTrigger(): void {
    renderTriggerLabel(
      this.built.triggerLabel,
      this.snap,
      this.data.selectedTextFormat,
      this.opts.countSuffix,
      this.opts.placeholder,
    );
  }

  /** Build/rebuild list from current snapshot, applying current filter. */
  private rebuildList(): void {
    const list = this.built.list;
    const matchFn = makeMatcher(this.query, this.opts.liveSearchNormalize);
    this.filteredIdx = [];
    // Determine which option indices are visible after filter.
    const groupVisible = new Set<number>();
    for (const o of this.snap.options) {
      if (o.disabled && !o.label) continue;
      const haystack = `${o.label} ${o.tokens} ${o.subtext}`;
      if (this.query === "" || matchFn(haystack)) {
        this.filteredIdx.push(o.index);
        if (o.groupId !== null) groupVisible.add(o.groupId);
      }
    }

    // Reuse existing nodes by option index; drop any unused.
    const newMap = new Map<number, HTMLDivElement>();
    list.textContent = "";

    if (this.virtualizeOn()) {
      this.itemHeight = this.measureItemHeight();
      this.renderVirtualWindow(newMap);
    } else {
      const frag = document.createDocumentFragment();
      let lastGroupId: number | null | undefined = undefined;
      let currentGroupEl: HTMLDivElement | null = null;
      let currentGroupListEl: HTMLDivElement | null = null;
      for (const idx of this.filteredIdx) {
        const opt = this.snap.options[idx]!;
        if (opt.groupId !== lastGroupId) {
          lastGroupId = opt.groupId;
          if (opt.groupId !== null) {
            const grp = this.snap.groups[opt.groupId]!;
            currentGroupEl = document.createElement("div");
            currentGroupEl.className = CLS.group;
            currentGroupEl.setAttribute("role", "group");
            const lbl = document.createElement("div");
            lbl.className = CLS.groupLabel;
            lbl.textContent = grp.label;
            currentGroupEl.appendChild(lbl);
            currentGroupListEl = document.createElement("div");
            currentGroupListEl.className = CLS.groupList;
            currentGroupEl.appendChild(currentGroupListEl);
            frag.appendChild(currentGroupEl);
          } else {
            currentGroupEl = null;
            currentGroupListEl = null;
          }
        }
        const node = this.upsertItemNode(opt, newMap);
        (currentGroupListEl || frag).appendChild(node);
      }
      list.appendChild(frag);
    }

    this.itemByOptIdx = newMap;
    this.built.empty.hidden = this.filteredIdx.length !== 0;
  }

  private upsertItemNode(opt: OptionSnap, newMap: Map<number, HTMLDivElement>): HTMLDivElement {
    const existing = this.itemByOptIdx.get(opt.index);
    if (existing) {
      setItemContent(existing, opt);
      applyItemState(existing, opt);
      newMap.set(opt.index, existing);
      return existing;
    }
    const { el } = buildItem(opt, this.ownerId);
    newMap.set(opt.index, el);
    return el;
  }

  private syncItemStates(): void {
    for (const [idx, el] of this.itemByOptIdx) {
      const o = this.snap.options[idx];
      if (!o) continue;
      applyItemState(el, o);
    }
  }

  // ---------- Filter ----------

  private applyFilter(): void {
    if (!this.listMounted) return;
    this.rebuildList();
    this.activeIdx = this.initialActiveIndex();
    this.applyActiveDescendant();
  }

  // ---------- Virtualization ----------

  private virtualizeOn(): boolean {
    return this.filteredIdx.length > this.opts.virtualizeThreshold;
  }

  private measureItemHeight(): number {
    if (this.itemHeight > 0) return this.itemHeight;
    // Probe with a temporary item.
    const list = this.built.list;
    const probe = document.createElement("div");
    probe.className = CLS.item;
    probe.textContent = "M";
    probe.style.visibility = "hidden";
    list.appendChild(probe);
    const h = probe.getBoundingClientRect().height || 32;
    probe.remove();
    this.itemHeight = h;
    return h;
  }

  private renderVirtualWindow(newMap?: Map<number, HTMLDivElement>): void {
    const list = this.built.list;
    const map = newMap || this.itemByOptIdx;
    const total = this.filteredIdx.length;
    const itemH = this.itemHeight || this.measureItemHeight();
    const viewportH = list.clientHeight || itemH * (this.data.size || 10);
    const scrollTop = list.scrollTop;
    const buffer = 5;
    const startIdx = Math.max(0, Math.floor(scrollTop / itemH) - buffer);
    const visibleCount = Math.ceil(viewportH / itemH) + buffer * 2;
    const endIdx = Math.min(total, startIdx + visibleCount);

    list.textContent = "";
    const topSpacer = document.createElement("div");
    topSpacer.className = CLS.spacerTop;
    topSpacer.style.height = `${startIdx * itemH}px`;
    list.appendChild(topSpacer);

    // In virtualized mode we skip optgroup wrappers (groups can still be visually represented
    // via item styling); this keeps positioning math simple. Groups remain in the snapshot
    // for the non-virtualized path and search inside groups still works because the filter
    // operates on option labels/tokens directly.
    const frag = document.createDocumentFragment();
    for (let i = startIdx; i < endIdx; i++) {
      const optIdx = this.filteredIdx[i]!;
      const opt = this.snap.options[optIdx]!;
      const node = this.upsertItemNode(opt, map);
      frag.appendChild(node);
    }
    list.appendChild(frag);

    const bottomSpacer = document.createElement("div");
    bottomSpacer.className = CLS.spacerBottom;
    bottomSpacer.style.height = `${Math.max(0, (total - endIdx) * itemH)}px`;
    list.appendChild(bottomSpacer);

    if (newMap) {
      // Drop any nodes that didn't make it into the new window.
      this.itemByOptIdx = newMap;
    }
  }

  // ---------- Selection ----------

  private toggleByIndex(optIdx: number): void {
    const opt = this.snap.options[optIdx];
    if (!opt) return;
    if (opt.disabled) return;
    const nativeOpt = this.select.options[optIdx];
    if (!nativeOpt) return;

    const prev = this.snap.multiple ? selectedValues(this.snap) : this.select.value;
    let willBeSelected: boolean;
    if (this.snap.multiple) {
      willBeSelected = !nativeOpt.selected;
      nativeOpt.selected = willBeSelected;
    } else {
      willBeSelected = true;
      // Clear others (browsers usually do this on .selected=true for single, but be explicit).
      const opts = this.select.options;
      for (let i = 0; i < opts.length; i++) {
        if (i !== optIdx && opts[i]!.selected) opts[i]!.selected = false;
      }
      nativeOpt.selected = true;
    }
    this.snap = readSnapshot(this.select);
    this.syncItemStates();
    this.renderTrigger();
    dispatchNativeChange(this.select);
    const detail: ChangedDetail = {
      clickedIndex: optIdx,
      isSelected: willBeSelected,
      previousValue: prev,
    };
    dispatchChanged(this.select, detail);
  }

  private batchSelectAll(state: boolean): void {
    if (!this.snap.multiple) return;
    const prev = selectedValues(this.snap);
    const opts = this.select.options;
    let mutated = false;
    let lastChanged = -1;
    for (let i = 0; i < opts.length; i++) {
      const o = opts[i]!;
      if (o.disabled) continue;
      if (o.selected !== state) {
        o.selected = state;
        mutated = true;
        lastChanged = i;
      }
    }
    if (!mutated) return;
    this.snap = readSnapshot(this.select);
    this.syncItemStates();
    this.renderTrigger();
    dispatchNativeChange(this.select);
    const detail: ChangedDetail = {
      clickedIndex: lastChanged,
      isSelected: state,
      previousValue: prev,
    };
    dispatchChanged(this.select, detail);
  }

  // ---------- Keyboard ----------

  private onTriggerKey(e: KeyboardEvent): void {
    if (this.snap.disabled) return;
    switch (e.key) {
      case "Enter":
      case " ":
      case "ArrowDown":
        e.preventDefault();
        this.show();
        return;
      case "ArrowUp":
        e.preventDefault();
        this.show();
        return;
      default:
        // Type-ahead when closed (no live search active).
        if (!this.open && !this.data.liveSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          this.typeAhead(e.key);
        }
    }
  }

  private onListKey(e: KeyboardEvent): void {
    this.handleNavKey(e);
  }

  private onSearchKey(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      this.hide();
      return;
    }
    this.handleNavKey(e);
  }

  private handleNavKey(e: KeyboardEvent): void {
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        this.hide();
        return;
      case "ArrowDown":
        e.preventDefault();
        this.moveActive(1);
        return;
      case "ArrowUp":
        e.preventDefault();
        this.moveActive(-1);
        return;
      case "Home":
        e.preventDefault();
        this.setActiveByFilteredPos(0);
        return;
      case "End":
        e.preventDefault();
        this.setActiveByFilteredPos(this.filteredIdx.length - 1);
        return;
      case "Enter":
        e.preventDefault();
        if (this.activeIdx >= 0) {
          this.toggleByIndex(this.activeIdx);
          if (!this.snap.multiple) this.hide();
        }
        return;
      case " ":
        // In multiple, space toggles without closing. In single with search active, space goes to input.
        if (this.snap.multiple) {
          // If focus is in the search input, allow normal typing; only intercept when not.
          if (document.activeElement !== this.built.searchInput) {
            e.preventDefault();
            if (this.activeIdx >= 0) this.toggleByIndex(this.activeIdx);
          }
        }
        return;
    }
  }

  private moveActive(dir: number): void {
    if (this.filteredIdx.length === 0) return;
    let pos = this.filteredIdx.indexOf(this.activeIdx);
    let next = pos < 0 ? 0 : pos + dir;
    while (next >= 0 && next < this.filteredIdx.length) {
      const optIdx = this.filteredIdx[next]!;
      const o = this.snap.options[optIdx]!;
      if (!o.disabled) {
        this.setActiveByFilteredPos(next);
        return;
      }
      next += dir;
    }
  }

  private setActiveByFilteredPos(pos: number): void {
    if (pos < 0 || pos >= this.filteredIdx.length) return;
    this.activeIdx = this.filteredIdx[pos]!;
    this.applyActiveDescendant();
    this.scrollActiveIntoView();
  }

  private applyActiveDescendant(): void {
    // Clear previous
    for (const el of this.itemByOptIdx.values()) el.classList.remove(CLS.itemActive);
    const id =
      this.activeIdx >= 0 ? `${this.ownerId}-opt-${this.activeIdx}` : "";
    const node = this.activeIdx >= 0 ? this.itemByOptIdx.get(this.activeIdx) : null;
    if (node) node.classList.add(CLS.itemActive);
    const target = this.built.searchInput || this.built.trigger;
    if (id) target.setAttribute("aria-activedescendant", id);
    else target.removeAttribute("aria-activedescendant");
  }

  private scrollActiveIntoView(): void {
    if (this.activeIdx < 0) return;
    if (this.virtualizeOn()) {
      const itemH = this.itemHeight || this.measureItemHeight();
      const pos = this.filteredIdx.indexOf(this.activeIdx);
      if (pos < 0) return;
      const list = this.built.list;
      const top = pos * itemH;
      const bottom = top + itemH;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight)
        list.scrollTop = bottom - list.clientHeight;
      this.renderVirtualWindow();
      this.applyActiveDescendant();
    } else {
      const node = this.itemByOptIdx.get(this.activeIdx);
      if (node && typeof node.scrollIntoView === "function") {
        node.scrollIntoView({ block: "nearest" });
      }
    }
  }

  private initialActiveIndex(): number {
    // First selected that's in filteredIdx, else first non-disabled.
    for (const idx of this.filteredIdx) {
      const o = this.snap.options[idx]!;
      if (o.selected && !o.disabled) return idx;
    }
    for (const idx of this.filteredIdx) {
      const o = this.snap.options[idx]!;
      if (!o.disabled) return idx;
    }
    return -1;
  }

  private typeAhead(ch: string): void {
    this.typeAheadBuf += ch;
    if (this.typeAheadTimer !== null) window.clearTimeout(this.typeAheadTimer);
    this.typeAheadTimer = window.setTimeout(() => {
      this.typeAheadBuf = "";
      this.typeAheadTimer = null;
    }, 600);
    const norm = (s: string) => stripDiacritics(s).toLowerCase();
    const needle = norm(this.typeAheadBuf);
    const opts = this.snap.options;
    for (let i = 0; i < opts.length; i++) {
      const o = opts[i]!;
      if (o.disabled) continue;
      if (norm(o.label).startsWith(needle)) {
        const nativeOpt = this.select.options[i];
        if (!nativeOpt) return;
        const prev = this.select.value;
        if (this.select.value === nativeOpt.value) return;
        // Clear others
        for (let j = 0; j < this.select.options.length; j++) {
          this.select.options[j]!.selected = j === i;
        }
        this.snap = readSnapshot(this.select);
        this.renderTrigger();
        dispatchNativeChange(this.select);
        dispatchChanged(this.select, { clickedIndex: i, isSelected: true, previousValue: prev });
        return;
      }
    }
  }

  // ---------- Portal & positioning ----------

  private portaled = false;
  private builtIsPortaled(): boolean {
    return this.portaled;
  }

  private enterPortal(): void {
    if (this.portaled) return;
    document.body.appendChild(this.built.dropdown);
    this.built.dropdown.classList.add(CLS.portal);
    this.portaled = true;
  }

  private exitPortal(): void {
    if (!this.portaled) return;
    this.built.root.appendChild(this.built.dropdown);
    this.built.dropdown.classList.remove(CLS.portal);
    this.built.dropdown.style.left = "";
    this.built.dropdown.style.top = "";
    this.built.dropdown.style.width = "";
    this.portaled = false;
  }

  private reposition(): void {
    if (!this.portaled) return;
    const r = this.built.trigger.getBoundingClientRect();
    const dd = this.built.dropdown;
    dd.style.position = "absolute";
    dd.style.left = `${window.scrollX + r.left}px`;
    dd.style.top = `${window.scrollY + r.bottom}px`;
    dd.style.width = `${r.width}px`;
  }
}
