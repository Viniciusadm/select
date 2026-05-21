export interface OptionSnap {
  value: string;
  label: string;
  disabled: boolean;
  selected: boolean;
  tokens: string;
  subtext: string;
  groupId: number | null;
  /** Original index into <select>.options. Authoritative for mutation. */
  index: number;
}

export interface GroupSnap {
  id: number;
  label: string;
  disabled: boolean;
}

export interface Snapshot {
  options: OptionSnap[];
  groups: GroupSnap[];
  multiple: boolean;
  disabled: boolean;
}

export interface SelectPickerOptions {
  liveSearchNormalize?: boolean;
  virtualizeThreshold?: number;
  portal?: boolean;
  noResultsText?: string;
  countSuffix?: string;
  placeholder?: string;
  searchPlaceholder?: string;
}

export interface ResolvedOptions {
  liveSearchNormalize: boolean;
  virtualizeThreshold: number;
  portal: boolean;
  noResultsText: string;
  countSuffix: string;
  placeholder: string;
  searchPlaceholder: string;
}

export interface ChangedDetail {
  clickedIndex: number;
  isSelected: boolean;
  previousValue: string | string[];
}
