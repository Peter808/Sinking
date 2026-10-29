/* ==========================================================================
   news.js (news/index.html only)
   Progressive enhancement for the news feed. Without JS every story shows.
   With JS:
     - City chips filter the list (data-filter on each chip, data-cities on
       each story). The choice is kept in the URL, e.g. news/#miami, so a
       filtered view can be shared.
     - Only PAGE_SIZE stories show at first; "Load more" adds PAGE_SIZE more.
   To change how many stories show per page, edit PAGE_SIZE.
   ========================================================================== */
(() => {
  const PAGE_SIZE = 12;

  const list = document.querySelector('[data-news-list]');
  const chips = Array.from(document.querySelectorAll('[data-news-filter] [data-filter]'));
  const more = document.querySelector('[data-news-more]');
  const count = document.querySelector('[data-news-count]');
  if (!list || !chips.length) return;
  const items = Array.from(list.children);

  let filter = 'all';
  let shown = PAGE_SIZE;

  /* Shows the stories that match the current filter, up to `shown`.
     Updates the "Showing X of Y" line and hides "Load more" at the end. */
  function render() {
    const matches = items.filter((li) => filter === 'all' || (li.dataset.cities || '').split(' ').includes(filter));
    items.forEach((li) => li.classList.add('is-hidden'));
    matches.slice(0, shown).forEach((li) => li.classList.remove('is-hidden'));
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.filter === filter)));
    if (count) count.textContent = `Showing ${Math.min(shown, matches.length)} of ${matches.length} stories`;
    if (more) more.hidden = shown >= matches.length;
  }

  /* Switches the city filter. Input: a chip's data-filter value. */
  function setFilter(value, updateUrl) {
    filter = chips.some((c) => c.dataset.filter === value) ? value : 'all';
    shown = PAGE_SIZE;
    if (updateUrl) history.replaceState(null, '', filter === 'all' ? location.pathname : `#${filter}`);
    render();
  }

  chips.forEach((c) => c.addEventListener('click', () => setFilter(c.dataset.filter, true)));

  if (more) more.addEventListener('click', () => {
    const firstNew = items.filter((li) => li.classList.contains('is-hidden') && (filter === 'all' || (li.dataset.cities || '').split(' ').includes(filter)))[0];
    shown += PAGE_SIZE;
    render();
    /* Move focus to the first new story so keyboard users keep their place */
    const link = firstNew && firstNew.querySelector('a');
    if (link) link.focus();
  });

  setFilter(location.hash.slice(1) || 'all', false);
})();
