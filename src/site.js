/* Phoenix Industrial Labs — page behaviour (reveal chips, facility walk, contact form). */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var F = window.PILForm;

  /* Reveal chips: one description (and, when present, one slide) at a time */
  Array.prototype.forEach.call(document.querySelectorAll('[data-reveal]'), function (r, j) {
    var tabs = Array.prototype.slice.call(r.querySelectorAll('[role="tab"]')), panel = r.querySelector('.panel'), t;
    var gallery = r.getAttribute('data-images') ? document.getElementById(r.getAttribute('data-images')) : null;
    var slides = gallery ? Array.prototype.slice.call(gallery.querySelectorAll('.slide')) : [];
    if (!panel.id) panel.id = 'panel-' + j;
    tabs.forEach(function (b, k) { if (!b.id) b.id = panel.id + '-tab-' + k; b.setAttribute('aria-controls', panel.id); });
    function select(i, focus) {
      tabs.forEach(function (b, k) { b.setAttribute('aria-selected', k === i ? 'true' : 'false'); b.tabIndex = k === i ? 0 : -1; });
      panel.setAttribute('aria-labelledby', tabs[i].id);
      slides.forEach(function (el, k) { el.classList.toggle('is-on', k === i); });
      var html = tabs[i].getAttribute('data-text');
      if (reduce) { panel.innerHTML = html; if (focus) tabs[i].focus(); return; }
      panel.classList.add('fade'); clearTimeout(t);
      t = setTimeout(function () { panel.innerHTML = html; panel.classList.remove('fade'); }, 160);
      if (focus) tabs[i].focus();
    }
    tabs.forEach(function (b, i) {
      b.addEventListener('click', function () { select(i); });
      b.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); select((i + 1) % tabs.length, true); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); select((i - 1 + tabs.length) % tabs.length, true); }
        if (e.key === 'Home') { e.preventDefault(); select(0, true); }
        if (e.key === 'End') { e.preventDefault(); select(tabs.length - 1, true); }
      });
    });
    panel.innerHTML = tabs[0].getAttribute('data-text');
    panel.setAttribute('aria-labelledby', tabs[0].id);
    tabs.forEach(function (b, k) { b.tabIndex = k === 0 ? 0 : -1; });
  });

  /* Hero: the still image paints first; the 3D scripts load after the first frame and crossfade in */
  var hero = document.getElementById('hero3d');
  if (hero && hero.getAttribute('data-three') && !/[?&]no3d\b/.test(location.search)) {
    var loadScript = function (src, cb) { var sc = document.createElement('script'); sc.src = src; sc.async = true; if (cb) sc.onload = cb; sc.onerror = function () { hero.setAttribute('data-3d', 'failed'); }; document.head.appendChild(sc); };
    var startHero = function () { if (window.performance && performance.mark) performance.mark('hero-3d-start'); hero.setAttribute('data-3d', 'loading'); loadScript(hero.getAttribute('data-three'), function () { loadScript(hero.getAttribute('data-facility')); }); };
    // wait for the load event (the still image is the largest paint) and then for an idle moment
    var kick = function () { if ('requestIdleCallback' in window) requestIdleCallback(startHero, { timeout: 1500 }); else setTimeout(startHero, 200); };
    if (document.readyState === 'complete') kick(); else window.addEventListener('load', kick);
  }

  /* Walk the facility: sticky stage, discrete steps */
  var steps = Array.prototype.slice.call(document.querySelectorAll('#steps .step'));
  var track = document.getElementById('track'), mark = document.getElementById('mark');
  var label = document.getElementById('label'), lh = document.getElementById('label-h'), lp = document.getElementById('label-p');
  var viewport = track ? track.parentNode : null;
  var current = -1, fadeTimer = null;
  function place(i) {
    var s = steps[i]; if (!s) return;
    var x = +s.getAttribute('data-x'), y = +s.getAttribute('data-y');
    mark.style.left = x + '%'; mark.style.top = y + '%';
    var tw = track.offsetWidth, vw = viewport.offsetWidth;
    if (tw > vw + 2) {
      var target = x / 100 * tw - vw / 2;
      target = Math.max(0, Math.min(tw - vw, target));
      track.style.transform = 'translateX(' + (-target) + 'px)';
    } else { track.style.transform = 'none'; }
  }
  function show(i) {
    if (i === current) return; current = i;
    var s = steps[i];
    label.setAttribute('data-step', String(i));
    if (reduce) { lh.textContent = s.getAttribute('data-h'); lp.textContent = s.getAttribute('data-p'); place(i); return; }
    label.classList.add('fade');
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(function () { lh.textContent = s.getAttribute('data-h'); lp.textContent = s.getAttribute('data-p'); label.classList.remove('fade'); }, 220);
    place(i);
  }
  if (steps.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) show(steps.indexOf(e.target)); });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    steps.forEach(function (s) { io.observe(s); });
    show(0);
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (current >= 0) place(current); }, 120); });
  }

  /* Contact: posts to the configured endpoint (Google Form), otherwise opens a prefilled email */
  var form = document.getElementById('lead'), note = document.getElementById('note'), sec = document.querySelector('.contact');
  var nameEl = document.getElementById('name'), emailEl = document.getElementById('email'), send = document.getElementById('send');
  function config() {
    return {
      action: form.getAttribute('data-action') || '',
      nameField: form.getAttribute('data-name-field') || '',
      emailField: form.getAttribute('data-email-field') || '',
      sourceField: form.getAttribute('data-source-field') || '',
      source: form.getAttribute('data-source') || location.hostname,
      to: form.getAttribute('data-to') || ''
    };
  }
  function markInvalid(res) {
    nameEl.setAttribute('aria-invalid', res.errors.name ? 'true' : 'false');
    emailEl.setAttribute('aria-invalid', res.errors.email ? 'true' : 'false');
  }
  function done(n, e) {
    document.getElementById('thanks-h').textContent = 'Thank you, ' + F.firstName(n) + '.';
    sec.classList.add('sent'); sec.setAttribute('data-state', 'sent');
    note.textContent = ''; note.className = 'note';
    try {
      var log = JSON.parse(localStorage.getItem('pil-leads') || '[]');
      log.push({ n: n, e: e, t: new Date().toISOString() });
      localStorage.setItem('pil-leads', JSON.stringify(log));
    } catch (err) { /* storage unavailable: ignore */ }
  }
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var fields = { name: nameEl.value, email: emailEl.value };
    var res = F.validate(fields);
    markInvalid(res);
    if (!res.ok) {
      note.textContent = res.errors.name && res.errors.email ? 'Add a name and a working email address.' : (res.errors.name || res.errors.email);
      note.className = 'note err'; sec.setAttribute('data-state', 'invalid');
      (res.errors.name ? nameEl : emailEl).focus();
      return;
    }
    var n = F.clean(fields.name), e = F.clean(fields.email), CONFIG = config();
    if (CONFIG.action) {
      send.disabled = true; note.textContent = 'Sending'; note.className = 'note'; sec.setAttribute('data-state', 'sending');
      fetch(CONFIG.action, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: F.buildBody(CONFIG, fields) })
        .then(function () { send.disabled = false; done(n, e); })
        .catch(function () { send.disabled = false; note.textContent = 'That did not go through. Try again.'; note.className = 'note err'; sec.setAttribute('data-state', 'error'); });
    } else {
      window.location.href = F.buildMailto(CONFIG.to, fields, CONFIG.source);
      done(n, e);
    }
  });
  document.getElementById('another').addEventListener('click', function () {
    sec.classList.remove('sent'); sec.setAttribute('data-state', 'idle'); form.reset();
    nameEl.removeAttribute('aria-invalid'); emailEl.removeAttribute('aria-invalid'); nameEl.focus();
  });
})();
