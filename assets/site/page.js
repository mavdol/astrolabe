// Everything on the page is already rendered: every filter state, in every mode and width, in its final place.
// This script chooses what to show, brings each part in as the reader reaches it, moves marks between
// states, brings a candidate forward, and switches the theme. Without it, the page shows the default
// state of every filter, all at once.

const root = document.documentElement;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const moves = () => root.classList.contains("motion") && !reducedMotion.matches;
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const MOVE = { duration: 280, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" };
const FADE = { duration: 200, easing: "ease-out" };

/** A damped spring sampled into a CSS easing: it overshoots a little and settles, as Framer Motion's do. */
const SPRING = (() => {
  const [stiffness, damping, duration] = [260, 18, 0.9];
  const omega = Math.sqrt(stiffness);
  const zeta = damping / (2 * omega);
  const omegaDamped = omega * Math.sqrt(1 - zeta * zeta);
  const at = (t) =>
    1 - Math.exp(-zeta * omega * t) * (Math.cos(omegaDamped * t) + ((zeta * omega) / omegaDamped) * Math.sin(omegaDamped * t));
  const samples = Array.from({ length: 41 }, (_, index) => Math.round(at((index / 40) * duration) * 1000) / 1000);

  return { easing: `linear(${samples.join(", ")})`, duration: duration * 1000 };
})();

// ---- Theme ----

const themeSwitch = document.querySelector("[data-theme-switch]");

if (themeSwitch) {
  themeSwitch.addEventListener("click", () => {
    const systemIsDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = root.dataset.theme ? root.dataset.theme === "dark" : systemIsDark;
    const next = isDark ? "light" : "dark";

    root.dataset.theme = next;

    try {
      window.localStorage.setItem("astrolabe-theme", next);
    } catch {
      // A page opened from disk may not keep anything; the theme still changes for this visit.
    }
  });
}

// ---- Arrival ----

/** Grows the marks of a drawing into place: lines from zero or from their estimate, markers on a spring, lines drawn. */
function playMarks(scope, delay) {
  for (const [index, group] of [...scope.querySelectorAll("[data-grow-from]")].entries()) {
    if (group.closest("[hidden]")) continue;

    group.style.transformBox = "view-box";
    group.style.transformOrigin = `${group.dataset.growFrom}px 0px`;
    group.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
      duration: 1100,
      delay: delay + index * 90,
      easing: EASE_OUT,
      fill: "backwards",
    });
  }

  for (const [index, marker] of [...scope.querySelectorAll("[data-pop]")].entries()) {
    if (marker.closest("[hidden]")) continue;

    marker.style.transformBox = "fill-box";
    marker.style.transformOrigin = "center";
    marker.animate([{ transform: "scale(0)" }, { transform: "scale(1)" }], { ...SPRING, delay: delay + 450 + index * 90, fill: "backwards" });
  }

  for (const line of scope.querySelectorAll("[data-draw]")) {
    const length = line.getTotalLength?.() ?? 0;

    if (length > 0)
      line.animate([{ strokeDasharray: `${length}`, strokeDashoffset: length }, { strokeDasharray: `${length}`, strokeDashoffset: 0 }], {
        duration: 1400,
        delay,
        easing: EASE_OUT,
        fill: "backwards",
      });
  }
}

/** Counts a figure up to its value, in the format it is written in; the last frame is the text as written. */
function countUp(element, delay) {
  const written = element.textContent;
  const target = Number(element.dataset.count);
  const decimals = Number(element.dataset.decimals);
  const signed = /^[+−-]/.test(written.trim());
  const format = (value) =>
    `${signed ? (target < 0 ? "−" : "+") : ""}${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  const start = performance.now() + delay;
  const step = (now) => {
    const progress = Math.min(1, Math.max(0, (now - start) / 1300));

    element.textContent = progress < 1 ? format(target * (1 - 2 ** (-10 * progress))) : written;

    if (progress < 1) requestAnimationFrame(step);
  };

  element.textContent = format(0);
  requestAnimationFrame(step);
}

const ARRIVING = ".hero > *, .stat, .chapter-head > *, .chapter-body, .trust-body > .block";

function arrive(section) {
  const parts = section.matches(ARRIVING) ? [section] : [...section.querySelectorAll(ARRIVING)];

  parts.forEach((part, index) => {
    part.style.setProperty("--delay", `${index * 90}ms`);
    part.classList.add("is-in");
  });
  playMarks(section, 200);

  for (const [index, figure] of [...section.querySelectorAll("[data-count]")].entries()) countUp(figure, 250 + index * 120);
}

if (moves() && "IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        observer.unobserve(entry.target);
        arrive(entry.target);
      }
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
  );

  for (const section of document.querySelectorAll("main > section")) observer.observe(section);
} else {
  for (const part of document.querySelectorAll(ARRIVING)) part.classList.add("is-in");
}

// ---- Navigation ----

const nav = document.querySelector(".nav");
const markScrolled = () => nav?.classList.toggle("is-scrolled", window.scrollY > 8);

window.addEventListener("scroll", markScrolled, { passive: true });
markScrolled();

// ---- Filters ----

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
    playMarks(view, 0);

    return;
  }

  drawings.forEach((svg, index) => {
    const previous = before[index] ?? new Map();

    for (const row of svg.querySelectorAll("[data-key]")) {
      const was = previous.get(row.dataset.key);

      if (!was) {
        row.animate([{ opacity: 0 }, { opacity: 1 }], FADE);
        playMarks(row, 0);
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

// ---- Highlight ----

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

// ---- Links ----

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-copy-link]");

  if (!link || !navigator.clipboard) return;

  event.preventDefault();

  const address = new URL(link.getAttribute("href"), window.location.href);

  navigator.clipboard.writeText(address.href).then(() => {
    const status = link.querySelector("[data-copy-status]");
    const text = status.textContent;

    link.classList.add("is-done");
    status.textContent = "Link copied";
    window.setTimeout(() => {
      link.classList.remove("is-done");
      status.textContent = text;
    }, 1500);
  });
});
