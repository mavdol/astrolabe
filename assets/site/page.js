// Everything on the page is already rendered: every filter state, in every mode and width.
// This script only chooses what to show, moves marks between states, and brings a candidate forward.
// Without it, the page shows the default state of every filter.

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const MOVE = { duration: 280, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" };
const FADE = { duration: 200, easing: "ease-out" };

const filterInputs = [...document.querySelectorAll("input[data-filter]")];
const filterIds = [...new Set(filterInputs.map((input) => input.dataset.filter))];
const defaults = Object.fromEntries(
  filterIds.map((filterId) => [filterId, filterInputs.find((input) => input.dataset.filter === filterId && input.defaultChecked)?.value]),
);
const optionsOf = (filterId) => new Set(filterInputs.filter((input) => input.dataset.filter === filterId).map((input) => input.value));
const requested = new URLSearchParams(window.location.search);
const state = Object.fromEntries(
  filterIds.map((filterId) => [filterId, optionsOf(filterId).has(requested.get(filterId)) ? requested.get(filterId) : defaults[filterId]]),
);

/** Where each keyed row and its mark sit in a view, in the units of its drawing. */
function positionsIn(view) {
  return [...view.querySelectorAll("svg")].map(
    (svg) =>
      new Map(
        [...svg.querySelectorAll("[data-key]")].map((row) => [
          row.dataset.key,
          { y: Number(row.dataset.y), x: Number(row.querySelector(".mark")?.dataset.x ?? 0) },
        ]),
      ),
  );
}

/** Moves each row from where it was to where it is: a dot slides along its axis, a row slides to its new rank. */
function moveFrom(before, view) {
  const drawings = [...view.querySelectorAll("svg")];
  const hasKeyedRows = drawings.some((svg) => svg.querySelector("[data-key]"));

  if (!hasKeyedRows) {
    view.animate([{ opacity: 0 }, { opacity: 1 }], FADE);

    return;
  }

  drawings.forEach((svg, index) => {
    const previous = before[index] ?? new Map();

    for (const row of svg.querySelectorAll("[data-key]")) {
      const was = previous.get(row.dataset.key);

      if (!was) {
        row.animate([{ opacity: 0 }, { opacity: 1 }], FADE);
        continue;
      }

      const mark = row.querySelector(".mark");
      const rise = was.y - Number(row.dataset.y);
      const slide = mark ? was.x - Number(mark.dataset.x) : 0;

      if (rise) row.animate([{ transform: `translate(0px, ${rise}px)` }, { transform: "translate(0px, 0px)" }], MOVE);

      if (mark && slide) mark.animate([{ transform: `translate(${slide}px, 0px)` }, { transform: "translate(0px, 0px)" }], MOVE);
    }
  });
}

function show(animate) {
  for (const group of document.querySelectorAll("[data-filters]")) {
    const key = group.dataset.filters
      .split(" ")
      .map((filterId) => `${filterId}=${state[filterId]}`)
      .join("&");
    const views = [...group.querySelectorAll(":scope > [data-state]")];
    const shown = views.find((view) => !view.hidden);
    const next = views.find((view) => view.dataset.state === key);

    if (!next || next === shown) continue;

    const before = shown ? positionsIn(shown) : [];

    for (const view of views) view.hidden = view !== next;

    if (animate && !reducedMotion.matches) moveFrom(before, next);
  }

  for (const input of filterInputs) input.checked = input.value === state[input.dataset.filter];

  const changed = new URLSearchParams(Object.entries(state).filter(([filterId, option]) => defaults[filterId] !== option));
  const search = changed.toString();

  try {
    window.history.replaceState(null, "", `${search ? `?${search}` : window.location.pathname}${window.location.hash}`);
  } catch {
    // A page opened from disk may not change its own address; the view still changes.
  }
}

if (filterInputs.length > 0) {
  for (const control of document.querySelectorAll(".segmented[data-filter]")) control.hidden = false;

  for (const description of document.querySelectorAll("[data-static-state]")) description.hidden = true;

  document.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-filter]");

    if (!input) return;

    state[input.dataset.filter] = input.value;
    show(true);
  });

  show(false);
}

// Pointing at a candidate brings it forward on every chart and table, and steps the others back.
if (window.matchMedia("(hover: hover)").matches) {
  const tagged = () => document.querySelectorAll("[data-candidate]");
  let highlighted = null;

  document.addEventListener("pointerover", (event) => {
    const candidate = event.target.closest?.("[data-candidate]")?.dataset.candidate ?? null;

    if (candidate === highlighted) return;

    highlighted = candidate;

    for (const element of tagged()) element.classList.toggle("is-dimmed", candidate !== null && element.dataset.candidate !== candidate);
  });
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-copy-link]");

  if (!link || !navigator.clipboard) return;

  event.preventDefault();

  const address = new URL(link.getAttribute("href"), window.location.href);

  navigator.clipboard.writeText(address.href).then(() => {
    const text = link.textContent;

    link.textContent = "Copied";
    window.setTimeout(() => (link.textContent = text), 1500);
  });
});
