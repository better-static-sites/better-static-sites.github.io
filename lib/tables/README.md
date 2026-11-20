# astro-better-tables

RST-style list-table and grid-table components for Astro. No build integration needed -- just import and use.

Two components:

- **`<Table>`** -- for most tables. Content is a nested markdown list (outer items = rows, inner items = cells). Clean to write, full markdown in cells, no spanning.
- **`<TableGrid>`** -- for tables that need `colspan`/`rowspan`. Uses `<Row>` and `<Cell>` child components. Content is still markdown inside cells.

## Table

### Setup

No integration to register. Import directly:

```mdx
import Table from 'astro-better-tables/Table.astro';
```

### Syntax

The slot content is a nested markdown list. Outer list items are rows; each inner list item is a cell. Cell content is full markdown.

```mdx
<Table widths="2 1 1" headerRows={1} colAlign="left right right" caption="Quarterly Results">
- - Product
  - Q1
  - Q2
- - Widget A
  - **120** units
  - [See notes](ref:q2-notes)
- - Widget B
  - 89
  - 102
</Table>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `widths` | `string` | — | Space-separated relative column widths, or `"auto"`. Example: `"2 1 1"` makes the first column twice as wide as the others. |
| `colAlign` | `string` | — | Space-separated per-column text alignment. Example: `"left right right"`. |
| `headerRows` | `number` | `0` | First N rows become `<thead>` with `<th scope="col">` cells. |
| `stubCols` | `number` | `0` | First N cells per row become `<th scope="row">` (row header cells). |
| `align` | `'left' \| 'center' \| 'right'` | — | Alignment of the table within the page. |
| `width` | `string` | — | Table width, any CSS value. Example: `"100%"`. |
| `caption` | `string` | — | Table caption rendered as `<caption>`. |
| `class` | `string` | — | Extra CSS class on the `<table>` element. |

### Notes

- Tight lists (no blank lines between rows) are recommended. Loose lists work but cell content gets wrapped in `<p>` tags; a global style in the component removes the extra margin.
- Spanning (`colspan`/`rowspan`) is not supported. Use `<TableGrid>` for that.
- The list is parsed from slot HTML at render time. The markdown inside cells is processed normally by your Astro/MDX pipeline before the component receives it.

---

## TableGrid

### Setup

No integration to register. Import the four components you need:

```mdx
import TableGrid from 'astro-better-tables/TableGrid.astro';
import Row       from 'astro-better-tables/Row.astro';
import Cell      from 'astro-better-tables/Cell.astro';
```

### Syntax

```mdx
<TableGrid widths="2 1 1" caption="Sales Data">
  <Row slot="head">
    <Cell header>Product</Cell>
    <Cell header colspan={2}>Sales by Quarter</Cell>
  </Row>
  <Row>
    <Cell>Widget A</Cell>
    <Cell>120</Cell>
    <Cell>145</Cell>
  </Row>
  <Row>
    <Cell rowspan={2}>Widget C/D</Cell>
    <Cell>45</Cell>
    <Cell>52</Cell>
  </Row>
  <Row>
    <Cell>48</Cell>
    <Cell>55</Cell>
  </Row>
</TableGrid>
```

### Header rows

Rows with `slot="head"` go into `<thead>`. All other rows go into `<tbody>`. Mark cells in header rows with the `header` prop to render them as `<th>`.

```mdx
<Row slot="head">
  <Cell header>Column A</Cell>
  <Cell header>Column B</Cell>
</Row>
```

### Row headers (stub columns)

Mark a `<Cell>` in a body row with `header` and `scope="row"` to make it a row header:

```mdx
<Row>
  <Cell header scope="row">Row label</Cell>
  <Cell>Data</Cell>
</Row>
```

### TableGrid props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `widths` | `string` | — | Space-separated relative column widths, or `"auto"`. |
| `caption` | `string` | — | Table caption. |
| `align` | `'left' \| 'center' \| 'right'` | — | Table alignment within the page. |
| `width` | `string` | — | Table width, any CSS value. |
| `class` | `string` | — | Extra CSS class on the `<table>` element. |

`colAlign` is not supported on `TableGrid` because cells don't know their column index. Use `align` on individual `<Cell>` components instead.

### Cell props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `colspan` | `number` | — | Spans N columns. |
| `rowspan` | `number` | — | Spans N rows. |
| `header` | `boolean` | `false` | Render as `<th>` instead of `<td>`. |
| `scope` | `string` | `"col"` when `header` | Overrides the `scope` attribute. |
| `align` | `string` | — | `text-align` value for this cell. |
| `valign` | `string` | — | `vertical-align` value for this cell. |
| `class` | `string` | — | Extra CSS class on the cell element. |

### Row props

| Prop | Type | Description |
|------|------|-------------|
| `class` | `string` | Extra CSS class on the `<tr>` element. |

---

## Styling

Both components ship global styles with the following defaults:

* A caption sits above the table, aligned left, in semibold text. Set the caption with the **`caption`** prop.
* A cell with a single paragraph has no paragraph margin.
* A cell with several blocks, such as paragraphs, lists, or code blocks, has no space above the first block or below the last block.

Available in `0.2.0` and later. To change a default, override the `.abt-table` or `.abt-grid-table` selectors in your own stylesheet:

```css
.abt-table caption,
.abt-grid-table caption {
  font-weight: 400;
  font-style: italic;
}
```

---

## Works with astro-better-refs

Links inside table cells support the `ref:` URL scheme from `astro-better-refs`:

```mdx
- - [See the Widget A section](ref:widget-a-section)
  - 120
```

```mdx
<Cell>[See the Widget A section](ref:widget-a-section)</Cell>
```

---

## Choosing between Table and TableGrid

Use `<Table>` when:
- No `colspan` or `rowspan` needed
- You want to write the content as a clean list, not nested JSX
- The table is medium complexity (most documentation tables)

Use `<TableGrid>` when:
- You need `colspan` or `rowspan`
- You're comfortable with the JSX-style authoring for that one table
