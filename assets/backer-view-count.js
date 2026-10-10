/* Shared Backer badge. Requires backer-view-count-core.js. No tracking or storage. */
(function (window, document) {
  'use strict';
  if (!window || !document || window.BackerViewCount) return;
  var Core = window.BackerViewCountCore;
  if (!Core) return;
  var config = window.BACKER_VIEW_COUNT_CONFIG || {};
  var script = document.currentScript;
  if (script && script.getAttribute('data-brand-selector')) config.selector = script.getAttribute('data-brand-selector');
  var DEFAULT_SELECTOR = '[data-backer-view-brand], header a.brand, header a.mdp-brand, header a.logo, header a.paper-brand, header a.mb-brand, header a.sim-brand, header a.rn-world-brand, .auth-brand a.brand, .rn-brand, .waitlist-brand';
  var BADGE_SELECTOR = '[data-backer-view-count], .backer-view-count';
  var timer = null;
  var mutationTimer = null;
  var observer = null;
  var running = false;

  function render(element, now) {
    if (!element) return null;
    var value = Core.countAt(now);
    var label = Core.formatCount(value);
    if (element.textContent !== label) element.textContent = label;
    element.classList.add('backer-view-count', 'is-scheduled');
    element.classList.remove('is-unavailable');
    element.hidden = false;
    element.setAttribute('data-backer-view-count', '');
    element.setAttribute('data-source', 'scheduled_display');
    element.setAttribute('aria-live', 'polite');
    element.setAttribute('aria-atomic', 'true');
    element.setAttribute('aria-label', label + '. Scheduled display, not measured traffic.');
    element.title = Core.DISCLOSURE;
    return value;
  }

  function mount(options) {
    options = options || config;
    if (options.autoMount === false) return;
    document.querySelectorAll(options.selector || DEFAULT_SELECTOR).forEach(function (brand) {
      if (!brand.parentNode || brand.closest('[data-backer-view-count-ignore]')) return;
      var wrapper = brand.closest('.backer-brand-lockup');
      if (wrapper && wrapper.querySelector(BADGE_SELECTOR)) return;
      // Explicit React-owned wrappers should provide their own badge span.
      // Auto-wrapping is intended for static HTML brands only.
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'backer-brand-lockup';
        brand.parentNode.insertBefore(wrapper, brand);
        wrapper.appendChild(brand);
      }
      var badge = document.createElement('span');
      badge.className = 'backer-view-count is-scheduled';
      badge.setAttribute('data-backer-view-count', '');
      wrapper.appendChild(badge);
    });
  }

  function refresh(now) {
    mount(config);
    document.querySelectorAll(BADGE_SELECTOR).forEach(function (element) { render(element, now); });
    return Core.countAt(now);
  }

  function schedule() {
    if (timer != null) window.clearTimeout(timer);
    // A minute-level check also recovers from wall-clock changes while open.
    timer = window.setTimeout(function () {
      refresh();
      schedule();
    }, Math.min(60000, Core.millisecondsUntilNextDay()));
  }

  function wake() {
    if (document.visibilityState === 'hidden') return;
    refresh();
    schedule();
  }

  function start(options) {
    if (options) config = options;
    refresh();
    if (running) return;
    running = true;
    schedule();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('pageshow', wake);
    if (window.MutationObserver && document.body) {
      observer = new window.MutationObserver(function () {
        if (mutationTimer != null) return;
        mutationTimer = window.setTimeout(function () {
          mutationTimer = null;
          refresh();
        }, 50);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  function stop() {
    running = false;
    if (timer != null) window.clearTimeout(timer);
    if (mutationTimer != null) window.clearTimeout(mutationTimer);
    timer = mutationTimer = null;
    if (observer) observer.disconnect();
    observer = null;
    document.removeEventListener('visibilitychange', wake);
    window.removeEventListener('focus', wake);
    window.removeEventListener('pageshow', wake);
  }

  window.BackerViewCount = { core: Core, render: render, mount: mount, refresh: refresh, start: start, stop: stop };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { start(); }, { once: true });
  else start();
})(typeof window !== 'undefined' ? window : null, typeof document !== 'undefined' ? document : null);
