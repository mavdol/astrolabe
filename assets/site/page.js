// Shows the view of each block that matches the chosen filters, and keeps the choice in the address.
// Every view is already in the page: without this script, the page shows the default state.

const bar = document.querySelector("[data-filter-bar]");

if (bar) {
  const inputs = [...bar.querySelectorAll('input[type="radio"]')];
  const defaults = Object.fromEntries(inputs.filter((input) => input.defaultChecked).map((input) => [input.name, input.value]));
  const requested = new URLSearchParams(window.location.search);

  for (const input of inputs) if (requested.get(input.name) === input.value) input.checked = true;

  const chosen = () => Object.fromEntries(inputs.filter((input) => input.checked).map((input) => [input.name, input.value]));

  const show = () => {
    const state = chosen();

    for (const group of document.querySelectorAll("[data-filters]")) {
      const key = group.dataset.filters
        .split(" ")
        .map((filterId) => `${filterId}=${state[filterId]}`)
        .join("&");

      for (const view of group.querySelectorAll(":scope > [data-state]")) view.hidden = view.dataset.state !== key;
    }

    const changed = new URLSearchParams(Object.entries(state).filter(([filterId, option]) => defaults[filterId] !== option));
    const search = changed.toString();

    try {
      window.history.replaceState(null, "", `${search ? `?${search}` : window.location.pathname}${window.location.hash}`);
    } catch {
      // A page opened from disk may not change its own address; the view still changes.
    }
  };

  bar.addEventListener("change", show);
  bar.hidden = false;
  show();
}
