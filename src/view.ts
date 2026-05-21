import type { OptionSnap, Snapshot } from "./types.js";

export const CLS = {
  root: "sl-select",
  open: "sl-open",
  disabled: "sl-disabled",
  multiple: "sl-multiple",
  trigger: "sl-trigger",
  label: "sl-label",
  placeholder: "sl-placeholder",
  arrow: "sl-arrow",
  dropdown: "sl-dropdown",
  portal: "sl-portal",
  search: "sl-search",
  searchInput: "sl-search-input",
  actions: "sl-actions",
  actionsBtn: "sl-actions-btn",
  selectAllBtn: "sl-select-all-btn",
  deselectAllBtn: "sl-deselect-all-btn",
  applyBtn: "sl-apply-btn",
  list: "sl-list",
  group: "sl-group",
  groupLabel: "sl-group-label",
  groupList: "sl-group-list",
  item: "sl-item",
  itemLabel: "sl-item-label",
  itemActive: "sl-item-active",
  itemSelected: "sl-item-selected",
  itemDisabled: "sl-item-disabled",
  itemHidden: "sl-item-hidden",
  subtext: "sl-subtext",
  empty: "sl-empty",
  spacerTop: "sl-spacer-top",
  spacerBottom: "sl-spacer-bottom",
} as const;

let uid = 0;
export function nextId(): string {
  return `sl-${++uid}`;
}

export interface BuiltRoot {
  root: HTMLDivElement;
  trigger: HTMLButtonElement;
  triggerLabel: HTMLSpanElement;
  dropdown: HTMLDivElement;
  searchInput: HTMLInputElement | null;
  searchWrap: HTMLDivElement | null;
  actionsWrap: HTMLDivElement | null;
  selectAllBtn: HTMLButtonElement | null;
  deselectAllBtn: HTMLButtonElement | null;
  applyBtn: HTMLButtonElement | null;
  list: HTMLDivElement;
  empty: HTMLDivElement;
  triggerId: string;
  listId: string;
}

export interface BuildConfig {
  multiple: boolean;
  disabled: boolean;
  liveSearch: boolean;
  actionsBox: boolean;
  searchPlaceholder: string;
  noResultsText: string;
  width: string | null;
  size: number | null;
  ownerId: string;
}

export function buildRoot(cfg: BuildConfig): BuiltRoot {
  const triggerId = nextId();
  const listId = nextId();

  const root = document.createElement("div");
  root.className = CLS.root;
  if (cfg.multiple) root.classList.add(CLS.multiple);
  if (cfg.disabled) root.classList.add(CLS.disabled);
  if (cfg.width) root.style.width = cfg.width === "auto" ? "" : cfg.width;
  root.dataset["slOwner"] = cfg.ownerId;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = CLS.trigger;
  trigger.id = triggerId;
  trigger.setAttribute("role", "combobox");
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", listId);
  if (cfg.disabled) trigger.disabled = true;

  const triggerLabel = document.createElement("span");
  triggerLabel.className = CLS.label;
  trigger.appendChild(triggerLabel);

  const arrow = document.createElement("span");
  arrow.className = CLS.arrow;
  arrow.setAttribute("aria-hidden", "true");
  trigger.appendChild(arrow);

  const dropdown = document.createElement("div");
  dropdown.className = CLS.dropdown;
  dropdown.hidden = true;
  dropdown.dataset["slOwner"] = cfg.ownerId;
  dropdown.style.setProperty("contain", "content");

  let searchWrap: HTMLDivElement | null = null;
  let searchInput: HTMLInputElement | null = null;
  if (cfg.liveSearch) {
    searchWrap = document.createElement("div");
    searchWrap.className = CLS.search;
    searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = CLS.searchInput;
    searchInput.autocomplete = "off";
    searchInput.placeholder = cfg.searchPlaceholder;
    searchInput.setAttribute("aria-controls", listId);
    searchInput.setAttribute("aria-autocomplete", "list");
    searchWrap.appendChild(searchInput);
    dropdown.appendChild(searchWrap);
  }

  let actionsWrap: HTMLDivElement | null = null;
  let selectAllBtn: HTMLButtonElement | null = null;
  let deselectAllBtn: HTMLButtonElement | null = null;
  let applyBtn: HTMLButtonElement | null = null;
  if (cfg.actionsBox) {
    actionsWrap = document.createElement("div");
    actionsWrap.className = CLS.actions;
    if (cfg.multiple) {
      selectAllBtn = document.createElement("button");
      selectAllBtn.type = "button";
      selectAllBtn.className = CLS.actionsBtn;
      selectAllBtn.classList.add(CLS.selectAllBtn);
      selectAllBtn.dataset["action"] = "select-all";
      selectAllBtn.textContent = "Todos";
      deselectAllBtn = document.createElement("button");
      deselectAllBtn.type = "button";
      deselectAllBtn.className = CLS.actionsBtn;
      deselectAllBtn.classList.add(CLS.deselectAllBtn);
      deselectAllBtn.dataset["action"] = "deselect-all";
      deselectAllBtn.textContent = "Limpar";
      actionsWrap.appendChild(selectAllBtn);
      actionsWrap.appendChild(deselectAllBtn);
    }
    applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = CLS.actionsBtn;
    applyBtn.classList.add(CLS.applyBtn);
    applyBtn.dataset["action"] = "apply";
    applyBtn.textContent = "Aplicar";
    actionsWrap.appendChild(applyBtn);
    dropdown.appendChild(actionsWrap);
  }

  const list = document.createElement("div");
  list.className = CLS.list;
  list.id = listId;
  list.setAttribute("role", "listbox");
  list.setAttribute("tabindex", "-1");
  if (cfg.multiple) list.setAttribute("aria-multiselectable", "true");
  list.setAttribute("aria-labelledby", triggerId);
  if (cfg.size && cfg.size > 0) {
    list.style.setProperty("--sl-size", String(cfg.size));
  }
  dropdown.appendChild(list);

  const empty = document.createElement("div");
  empty.className = CLS.empty;
  empty.hidden = true;
  empty.textContent = cfg.noResultsText;
  dropdown.appendChild(empty);

  root.appendChild(trigger);
  root.appendChild(dropdown);

  return {
    root,
    trigger,
    triggerLabel,
    dropdown,
    searchInput,
    searchWrap,
    actionsWrap,
    selectAllBtn,
    deselectAllBtn,
    applyBtn,
    list,
    empty,
    triggerId,
    listId,
  };
}

export function renderTriggerLabel(
  triggerLabel: HTMLSpanElement,
  snap: Snapshot,
  selectedTextFormat: string | null,
  countSuffix: string,
  placeholder: string,
): void {
  const sel = snap.options.filter((o) => o.selected);
  if (sel.length === 0) {
    triggerLabel.textContent = placeholder;
    triggerLabel.classList.add(CLS.placeholder);
    return;
  }
  triggerLabel.classList.remove(CLS.placeholder);
  if (snap.multiple && selectedTextFormat === "count") {
    triggerLabel.textContent = `${sel.length} ${countSuffix}`;
    return;
  }
  triggerLabel.textContent = sel.map((o) => o.label).join(", ");
}

export interface ItemNode {
  el: HTMLDivElement;
  optionIndex: number;
}

export function buildItem(opt: OptionSnap, ownerId: string): ItemNode {
  const el = document.createElement("div");
  el.className = CLS.item;
  el.setAttribute("role", "option");
  el.id = `${ownerId}-opt-${opt.index}`;
  el.dataset["index"] = String(opt.index);
  applyItemState(el, opt);
  setItemContent(el, opt);
  return { el, optionIndex: opt.index };
}

export function applyItemState(el: HTMLDivElement, opt: OptionSnap): void {
  el.classList.toggle(CLS.itemSelected, opt.selected);
  el.classList.toggle(CLS.itemDisabled, opt.disabled);
  el.setAttribute("aria-selected", opt.selected ? "true" : "false");
  if (opt.disabled) el.setAttribute("aria-disabled", "true");
  else el.removeAttribute("aria-disabled");
}

export function setItemContent(el: HTMLDivElement, opt: OptionSnap): void {
  // Avoid innerHTML — keep DOM nodes for safety.
  el.textContent = "";
  const lbl = document.createElement("span");
  lbl.className = CLS.itemLabel;
  lbl.textContent = opt.label;
  el.appendChild(lbl);
  if (opt.subtext) {
    const sub = document.createElement("span");
    sub.className = CLS.subtext;
    sub.textContent = opt.subtext;
    el.appendChild(sub);
  }
}
