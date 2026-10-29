/* ==========================================================================
   main.js
   Global behavior on every page: header clock, header scroll state,
   Cities dropdown, mobile menu, and "Check Your Address" jump.
   Everything here is enhancement. Without JS the nav still works as links.
   ========================================================================== */
(function () {
  'use strict';

  var MOBILE_BREAKPOINT = 960; // keep in sync with components.css (section 10)


  /* ----------------------------------------------------------------------
     Header clock: shows Miami time and date in the header.
     Edit TIMEZONE to show another zone. Updates every 15 seconds.
     ---------------------------------------------------------------------- */
  var TIMEZONE = 'America/New_York';

  function updateClock() {
    var timeEl = document.querySelector('[data-clock-time]');
    if (!timeEl) return;
    var now = new Date();
    var opts = { timeZone: TIMEZONE };
    var parts = {};
    new Intl.DateTimeFormat('en-US', Object.assign({ hour: '2-digit', minute: '2-digit', hour12: true, day: 'numeric', month: 'short', year: 'numeric' }, opts))
      .formatToParts(now).forEach(function (p) { parts[p.type] = p.value; });

    timeEl.textContent = parts.hour + ':' + parts.minute;
    setText('[data-clock-ampm]', (parts.dayPeriod || '').toUpperCase());
    setText('[data-clock-date]', parts.day + ' ' + parts.month);
    setText('[data-clock-year]', parts.year);
  }
  function setText(sel, val) { var el = document.querySelector(sel); if (el) el.textContent = val; }


  /* ----------------------------------------------------------------------
     Header scroll state: transparent over the hero, solid navy once the
     page scrolls. Change SCROLL_OFFSET to switch sooner or later.
     ---------------------------------------------------------------------- */
  var SCROLL_OFFSET = 24;

  function initHeaderScroll() {
    var header = document.querySelector('[data-header]');
    if (!header) return;
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > SCROLL_OFFSET); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }


  /* ----------------------------------------------------------------------
     Cities dropdown. Click or Enter toggles. Arrow Down opens and moves to
     the first city. Escape closes and returns focus to the button.
     Closes when focus or a click leaves it.
     ---------------------------------------------------------------------- */
  function initDropdowns() {
    document.querySelectorAll('[data-dropdown]').forEach(function (item) {
      var btn = item.querySelector('[data-dropdown-toggle]');
      if (!btn) return;
      var links = function () { return item.querySelectorAll('.dropdown a'); };

      function setOpen(open) {
        item.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', String(open));
      }

      btn.addEventListener('click', function () { setOpen(btn.getAttribute('aria-expanded') !== 'true'); });

      item.addEventListener('keydown', function (e) {
        var list = Array.prototype.slice.call(links());
        var i = list.indexOf(document.activeElement);
        if (e.key === 'Escape') { setOpen(false); btn.focus(); }
        else if (e.key === 'ArrowDown') {
          e.preventDefault(); setOpen(true);
          (list[i + 1] || list[0]).focus();
        } else if (e.key === 'ArrowUp' && i > -1) {
          e.preventDefault();
          (list[i - 1] || btn).focus();
        }
      });

      item.addEventListener('focusout', function (e) {
        if (!item.contains(e.relatedTarget)) setOpen(false);
      });
      document.addEventListener('click', function (e) {
        if (!item.contains(e.target)) setOpen(false);
      });
    });
  }


  /* ----------------------------------------------------------------------
     Mobile menu: hamburger opens a full-screen nav. Escape or any link
     closes it. Focus stays inside while it's open.
     ---------------------------------------------------------------------- */
  function initMobileMenu() {
    var toggle = document.querySelector('[data-menu-toggle]');
    var nav = document.querySelector('[data-nav]');
    if (!toggle || !nav) return;

    function setOpen(open) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      nav.classList.toggle('is-open', open);
      document.body.classList.toggle('menu-open', open);
      if (open) {
        var first = nav.querySelector('a, button');
        if (first) first.focus();
      }
    }

    toggle.addEventListener('click', function () { setOpen(toggle.getAttribute('aria-expanded') !== 'true'); });

    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (toggle.getAttribute('aria-expanded') !== 'true') return;
      if (e.key === 'Escape') { setOpen(false); toggle.focus(); return; }
      /* Simple focus trap: Tab cycles between the menu and the close button */
      if (e.key === 'Tab') {
        var items = Array.prototype.filter.call(nav.querySelectorAll('a, button'), function (el) { return el.offsetParent !== null; });
        items.push(toggle);
        var first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    /* Close if the window grows to desktop width while open */
    window.addEventListener('resize', function () {
      if (window.innerWidth >= MOBILE_BREAKPOINT && nav.classList.contains('is-open')) setOpen(false);
    });
  }


  /* ----------------------------------------------------------------------
     "Check Your Address" links: after the smooth scroll, put the cursor
     in the address field so people can start typing right away.
     ---------------------------------------------------------------------- */
  function initAddressJump() {
    var input = document.querySelector('[data-risk-input]');
    if (!input) return;
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href$="#check-your-address"]');
      if (!a) return;
      setTimeout(function () { input.focus({ preventScroll: true }); }, 600);
    });
  }


  /* Footer "Email" link: turns the reversed address in data-mail into a
     mailto: link, so the real address never sits in the HTML for bots.
     To change the address, edit data-mail in each page's footer. */
  function initMailLinks() {
    document.querySelectorAll('[data-mail]').forEach(function (a) {
      var addr = a.getAttribute('data-mail').split('').reverse().join('');
      a.href = 'mailto:' + addr + '?subject=' + encodeURIComponent('Sinking South Florida website');
    });
  }

  function init() {
    initMailLinks();
    updateClock();
    setInterval(updateClock, 15000);
    initHeaderScroll();
    initDropdowns();
    initMobileMenu();
    initAddressJump();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
