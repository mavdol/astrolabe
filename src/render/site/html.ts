export const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Escapes text and turns the web addresses in it into links, so declared evidence opens from the page. */
export function withLinks(text: string): string {
  return text
    .split(/(https?:\/\/[^\s<>"]+[^\s<>".,;:)])/)
    .map((part, index) => (index % 2 === 1 ? `<a href="${escapeHtml(part)}">${escapeHtml(part)}</a>` : escapeHtml(part)))
    .join("");
}

export const paragraphsOf = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${withLinks(paragraph)}</p>`)
    .join("\n");

export const listOf = (lines: string[]) => `<ul>\n${lines.map((line) => `<li>${withLinks(line)}</li>`).join("\n")}\n</ul>`;

/** A cell's first line is its value; the lines after it qualify the value, in smaller text. */
export type Cell = string | string[];

const cellContent = (cell: Cell) => {
  const [value, ...details] = typeof cell === "string" ? [cell] : cell;

  return details.length > 0
    ? `${withLinks(value)}<span class="cell-detail">${details.map(withLinks).join(" · ")}</span>`
    : withLinks(value);
};

const firstLineOf = (cell: Cell) => (typeof cell === "string" ? cell : cell[0]);
const isFigure = (text: string) => text === "—" || /^[−+-]?[\d.]/.test(text);

/**
 * Figures are right-aligned so their digits line up; words and names are left-aligned. With `groupsByFirstColumn`, rows
 * that repeat the first cell of the row above form a group: the name is written once, for the eye, and kept for screen
 * readers, and a stronger line opens each group.
 */
export function tableOf(
  header: string[],
  rows: Cell[][],
  caption?: string,
  columnCandidates: (string | undefined)[] = [],
  { groupsByFirstColumn = false }: { groupsByFirstColumn?: boolean } = {},
): string {
  const isFigureColumn = header.map(
    (_, column) => column > 0 && rows.length > 0 && rows.every((row) => isFigure(firstLineOf(row[column]))),
  );
  const alignment = (column: number) =>
    `${isFigureColumn[column] ? "" : ' class="text"'}${columnCandidates[column] ? ` data-candidate="${escapeHtml(columnCandidates[column]!)}"` : ""}`;
  const head = header.map((cell, column) => `<th scope="col"${alignment(column)}>${escapeHtml(cell)}</th>`).join("");
  const repeatsRowAbove = (index: number) =>
    groupsByFirstColumn && index > 0 && firstLineOf(rows[index][0]) === firstLineOf(rows[index - 1][0]);
  const opensGroup = (index: number) => groupsByFirstColumn && index > 0 && !repeatsRowAbove(index);
  const body = rows.map(
    (row, index) =>
      `<tr${opensGroup(index) ? ' class="group-start"' : ""}>${row
        .map((cell, column) =>
          column > 0
            ? `<td${alignment(column)}>${cellContent(cell)}</td>`
            : repeatsRowAbove(index)
              ? `<th scope="row"><span class="visually-hidden">${cellContent(cell)}</span></th>`
              : `<th scope="row">${cellContent(cell)}</th>`,
        )
        .join("")}</tr>`,
  );

  return [
    '<div class="table-scroll"><table>',
    caption ? `<caption class="label">${escapeHtml(caption)}</caption>` : "",
    `<thead><tr>${head}</tr></thead>`,
    `<tbody>\n${body.join("\n")}\n</tbody>`,
    "</table></div>",
  ].join("\n");
}
