# min-select

min-select is a custom UI layer for the native `<select>`, written in TypeScript with no runtime dependencies. It hides the original element, draws a trigger and a dropdown in its place and keeps both in sync: the `<select>` stays the source of truth, so forms, `change` listeners and form resets keep working. This repository is the source of the [`min-select`](https://www.npmjs.com/package/min-select) npm package.

It supports single and multiple selection, `<optgroup>` and disabled options, live search (accent-insensitive by default, also matching `data-tokens`), a secondary line per option (`data-subtext`), an actions box (select all and clear in multiple mode, plus an apply button), keyboard navigation with type-ahead, rendering the dropdown in a portal, and list virtualization above 200 visible options.

| Part | What it is |
| --- | --- |
| [`src`](src) | The library. `MinSelect.ts` holds the component; `view.ts` builds the DOM, `snapshot.ts` reads the `<select>` state and `events.ts` dispatches the events. |
| [`src/styles`](src/styles) | The stylesheet, as SCSS and plain CSS, themed through `--sl-*` custom properties. |
| [`examples`](examples) | A static showcase page that loads the compiled build. |

## Requirements

- Node.js and npm to build
- TypeScript 6 (installed as a dev dependency)

The output is an ES module targeting modern browsers.

## Usage

Install the package:

```bash
npm install min-select
```

Mark up a normal `<select>`; options for each element go in `data-*` attributes:

```html
<select id="fruits" multiple data-live-search="true" data-actions-box="true" data-selected-text-format="count">
  <optgroup label="Citrus">
    <option value="orange" data-subtext="Valencia">Orange</option>
    <option value="lemon" data-tokens="lime acid">Lemon</option>
  </optgroup>
</select>
```

Initialize it and import the styles (`min-select/styles` points to the SCSS file; the plain CSS is at `src/styles/select.css` in the package):

```ts
import { MinSelect } from "min-select";

const [fruits] = MinSelect.init("#fruits", { placeholder: "Pick a fruit" });

fruits?.val(["orange", "lemon"]);
```

The `data-*` attributes read from the `<select>` are `data-live-search`, `data-live-search-placeholder`, `data-actions-box`, `data-selected-text-format="count"`, `data-size` (visible rows), `data-width` and `data-portal`.

The options passed to `init` or to the constructor are `liveSearchNormalize`, `virtualizeThreshold`, `portal`, `noResultsText`, `countSuffix`, `placeholder` and `searchPlaceholder`. The default texts are in Portuguese.

An instance exposes `val()`, `refresh()` (call it after changing the options of the `<select>`), `show()`, `hide()`, `toggle()`, `selectAll()`, `deselectAll()` and `destroy()`. `MinSelect.get(element)` returns the instance of an element.

The `<select>` emits bubbling `CustomEvent`s: `loaded.sl.select`, `rendered.sl.select`, `refreshed.sl.select`, `show.sl.select`, `shown.sl.select`, `hide.sl.select`, `hidden.sl.select`, `changed.sl.select` (with `clickedIndex`, `isSelected` and `previousValue`) and `applied.sl.select` (with the `value` when the apply button is pressed), besides the native `change`.

## Build

Install the dependencies and compile `src` into `dist`:

```bash
npm install
npm run build
```

`npm run dev` recompiles on every change. After a build, open [`examples/index.html`](examples/index.html) in a browser to see the showcase.
