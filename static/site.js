/*
  PressReady marketing page behaviour.

  Lead capture, two channels sent at the same time:

  1. LEADS_WEBHOOK: a Make scenario ("PressReady website leads") that saves
     every lead to the Make data store "PressReady leads" and answers
     {success: true}. This is the system of record.
  2. EMAIL_ENDPOINT: FormSubmit, which emails the lead to LEAD_INBOX. Its very
     first submission sends a one-time activation link to that inbox.

  The visitor sees success if either channel confirms. If neither does, they
  get a one-tap pre-filled email instead, so a lead is never silently lost.
*/
(function () {
  'use strict';

  const LEAD_INBOX = 'colby@corbinatech.com';
  const LEADS_WEBHOOK = 'https://hook.us2.make.com/4k15ful5ugrqb3n67620wrx04o3uotpm';
  const EMAIL_ENDPOINT = 'https://formsubmit.co/ajax/' + LEAD_INBOX;
  const TIMEOUT_MS = 8000;

  // POST JSON; resolves true only on an explicit {success: true}.
  async function send(url, payload) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      return res.ok && String(data.success) === 'true';
    } catch (e) {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  // True as soon as any channel confirms; false once all have failed.
  function anyDelivered(promises) {
    return new Promise(resolve => {
      let left = promises.length;
      promises.forEach(p => p.then(ok => {
        if (ok) resolve(true); else if (--left === 0) resolve(false);
      }));
    });
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const yr = $('#yr'); if (yr) yr.textContent = new Date().getFullYear();

  // -- Attribution, kept for the whole visit --------------------------------
  const attrib = (function () {
    const out = {};
    try {
      const saved = JSON.parse(sessionStorage.getItem('pr_attrib') || '{}');
      Object.assign(out, saved);
    } catch (e) {}
    const q = new URLSearchParams(location.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'ref']
      .forEach(k => { if (q.get(k)) out[k] = q.get(k); });
    if (!out.landing_referrer && document.referrer && !document.referrer.includes(location.host)) {
      out.landing_referrer = document.referrer;
    }
    try { sessionStorage.setItem('pr_attrib', JSON.stringify(out)); } catch (e) {}
    return out;
  })();

  // -- Forms: one source, three placements ----------------------------------
  const heroShell = $('#get-demo');
  let cloneN = 0;
  function cloneForm(slot, variant) {
    const node = heroShell.cloneNode(true);
    node.removeAttribute('id');
    cloneN++;
    $$('[id]', node).forEach(el => {
      const old = el.id, nu = old + '-' + variant + cloneN;
      el.id = nu;
      const lab = $('label[for="' + old + '"]', node);
      if (lab) lab.setAttribute('for', nu);
    });
    if (variant === 'modal') {
      const t = $('.form-title', node); if (t) t.id = 'modal-title';
    }
    node.dataset.variant = variant;
    slot.appendChild(node);
    return node;
  }
  $$('[data-form-slot]').forEach(slot => cloneForm(slot, slot.dataset.formSlot));
  $$('.form-shell').forEach((shell, i) => {
    if (!shell.dataset.variant) shell.dataset.variant = 'hero';
    wireForm(shell);
  });

  function wireForm(shell) {
    const form = $('.lead-form', shell);
    const done = $('.form-done', shell);
    const err = $('.form-error', form);

    // Clear error styling as soon as someone fixes a field.
    form.addEventListener('input', e => {
      const f = e.target.closest('.fld'); if (f) f.classList.remove('bad');
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      err.hidden = true;

      const fd = new FormData(form);
      if (fd.get('_honey')) return;   // bot

      const name = (fd.get('name') || '').trim();
      const email = (fd.get('email') || '').trim();
      const company = (fd.get('company') || '').trim();

      let firstBad = null;
      const mark = (n, ok) => {
        const el = form.elements.namedItem(n), fld = el.closest('.fld');
        fld.classList.toggle('bad', !ok);
        if (!ok && !firstBad) firstBad = el;
      };
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
      mark('name', !!name);
      mark('email', emailOk);
      if (firstBad) {
        const missing = [!name && 'your name', !emailOk && (email ? 'a valid email' : 'your email')].filter(Boolean);
        err.textContent = 'Almost there: please add ' + missing.join(' and ') + ' so we can reach you.';
        err.hidden = false;
        // Bring the problem into view rather than jumping away from the message.
        firstBad.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
        firstBad.focus({ preventScroll: true });
        const b = $('button[type=submit]', form);
        b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
        return;
      }

      const equipment = fd.getAll('equipment').join(', ');
      const payload = {
        name, email, company,
        phone: (fd.get('phone') || '').trim(),
        equipment: equipment || '(not specified)',
        message: (fd.get('message') || '').trim(),
        interested_plan: shell.dataset.plan || '',
        form_location: shell.dataset.variant,
        page: location.href.split('#')[0],
        submitted_at: new Date().toString(),
        _subject: 'New PressReady demo request: ' + (company || name),
        _template: 'table',
        _replyto: email,
        _captcha: 'false',
      };
      Object.keys(attrib).forEach(k => { payload[k] = attrib[k]; });
      Object.keys(payload).forEach(k => { if (payload[k] === '') delete payload[k]; });

      form.classList.add('sending');
      $('.btn-label', form).textContent = 'Sending…';

      const ok = await anyDelivered([send(LEADS_WEBHOOK, payload), send(EMAIL_ENDPOINT, payload)]);

      form.classList.remove('sending');
      $('.btn-label', form).textContent = 'Book my free demo';

      if (ok) {
        showDone(shell, name, email);
        track('generate_lead', { form_location: shell.dataset.variant });
      } else {
        const body = [
          'Hi PressReady,', '', "I'd like a demo.", '',
          'Name: ' + name, company ? 'Shop: ' + company : '', 'Email: ' + email,
          payload.phone ? 'Phone: ' + payload.phone : '',
          'Equipment: ' + payload.equipment,
          payload.message ? '\n' + payload.message : '',
        ].filter(Boolean).join('\n');
        const href = 'mailto:' + LEAD_INBOX + '?subject=' + encodeURIComponent('PressReady demo request: ' + (company || name)) +
                     '&body=' + encodeURIComponent(body);
        err.innerHTML = '<strong>Our form service didn\'t respond.</strong> Your details are ready to go by email instead, one tap:' +
          '<a class="btn btn-primary btn-block fallback-btn" href="' + href + '">Send my details by email</a>' +
          '<span class="fallback-alt">or write to <a href="mailto:' + LEAD_INBOX + '">' + LEAD_INBOX + '</a></span>';
        err.hidden = false;
        track('lead_form_fallback', { form_location: shell.dataset.variant });
      }
    });
  }

  function showDone(shell, name, email) {
    const form = $('.lead-form', shell), done = $('.form-done', shell), head = $('.form-head', shell);
    const first = (name || '').split(/\s+/)[0];
    $('.done-name', done).textContent = first ? ', ' + first : '';
    $('.done-email', done).textContent = email || 'you';
    form.hidden = true; if (head) head.hidden = true;
    done.hidden = false; done.focus({ preventScroll: true });
    // Mirror success to every copy so nobody is asked twice.
    $$('.form-shell').forEach(s => {
      if (s === shell) return;
      const f = $('.lead-form', s), d = $('.form-done', s), h = $('.form-head', s);
      $('.done-name', d).textContent = first ? ', ' + first : '';
      $('.done-email', d).textContent = email || 'you';
      f.hidden = true; if (h) h.hidden = true; d.hidden = false;
    });
    try { sessionStorage.setItem('pr_lead', JSON.stringify({ name, email })); } catch (e) {}
  }

  // Returning from the no-JS fallback, or already submitted this visit.
  (function () {
    let prior = null;
    try { prior = JSON.parse(sessionStorage.getItem('pr_lead') || 'null'); } catch (e) {}
    if (new URLSearchParams(location.search).get('thanks') === '1') prior = prior || { name: '', email: '' };
    if (prior) showDone(heroShell, prior.name, prior.email);
  })();

  function track(evt, params) {
    try { if (window.gtag) window.gtag('event', evt, params); } catch (e) {}
    try { if (window.fbq) window.fbq('track', 'Lead'); } catch (e) {}
    try { if (window.plausible) window.plausible('Lead'); } catch (e) {}
  }

  // -- Open-form buttons -----------------------------------------------------
  const modal = $('#form-modal');
  const heroInView = () => {
    const r = heroShell.getBoundingClientRect();
    return r.top < innerHeight * .8 && r.bottom > 120;
  };
  $$('[data-open-form]').forEach(btn => btn.addEventListener('click', e => {
    const plan = btn.dataset.plan || '';
    // Near the top, the hero form is right there: just focus it.
    if (heroInView() && !plan) {
      e.preventDefault();
      heroShell.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
      const card = $('.form-card', heroShell);
      card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
      const f = $('input[name=name]', heroShell);
      if (f && !$('.lead-form', heroShell).hidden) f.focus({ preventScroll: true });
      return;
    }
    if (modal && typeof modal.showModal === 'function') {
      e.preventDefault();
      const shell = $('.form-shell', modal);
      if (shell) {
        shell.dataset.plan = plan;
        const sub = $('.form-sub', shell);
        if (sub) {
          sub.textContent = plan
            ? 'Interested in ' + plan + '. Tell us where to reach you and we\'ll set up a demo on your own proofs first.'
            : 'Tell us where to reach you. We\'ll set up a short call and run a proof that\'s given your art team trouble.';
        }
      }
      modal.showModal();
      const f = $('input[name=name]', modal);
      if (f && !$('.lead-form', modal).hidden) setTimeout(() => f.focus(), 60);
    }
  }));
  if (modal) {
    $('[data-close]', modal).addEventListener('click', () => modal.close());
    modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });
  }

  // -- Nav + mobile bar ------------------------------------------------------
  const nav = $('#nav'), mbar = $('#mbar'), closing = $('#start');
  function onScroll() {
    const y = scrollY;
    nav.classList.toggle('scrolled', y > 20);
    if (mbar) {
      const heroBottom = heroShell.getBoundingClientRect().bottom;
      const closeTop = closing ? closing.getBoundingClientRect().top : Infinity;
      mbar.classList.toggle('show', heroBottom < 0 && closeTop > innerHeight * .85);
    }
    stepsFill();
  }
  addEventListener('scroll', onScroll, { passive: true });

  // -- Steps progress line ---------------------------------------------------
  const steps = $('#steps'), line = steps && $('.steps-line', steps);
  function stepsFill() {
    if (!steps) return;
    const r = steps.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (innerHeight * .6 - r.top) / r.height));
    line.style.setProperty('--fill', (p * 100).toFixed(1) + '%');
  }
  onScroll();

  // -- Reveal on scroll ------------------------------------------------------
  const revs = $$('.reveal');
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    // Stagger siblings that enter together.
    revs.forEach(el => {
      const sibs = Array.from(el.parentElement.children).filter(c => c.classList.contains('reveal'));
      const i = sibs.indexOf(el);
      if (i > 0) el.style.transitionDelay = Math.min(i * 90, 360) + 'ms';
      io.observe(el);
    });
  } else {
    revs.forEach(el => el.classList.add('in'));
  }

  // -- Count-up stats --------------------------------------------------------
  const counters = $$('[data-count]');
  if ('IntersectionObserver' in window && !reduced) {
    counters.forEach(el => { el.textContent = '0'; });
    const co = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      co.unobserve(e.target);
      const el = e.target, to = +el.dataset.count, t0 = performance.now(), dur = 1400;
      (function tick(now) {
        const p = Math.min(1, (now - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - p, 3)));
        el.textContent = v.toLocaleString();
        if (p < 1) requestAnimationFrame(tick);
      })(t0);
    }), { threshold: .6 });
    counters.forEach(el => co.observe(el));
  }

  // -- Card spotlight --------------------------------------------------------
  $$('.spot').forEach(card => card.addEventListener('pointermove', e => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    card.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }));

  // -- Output tabs -----------------------------------------------------------
  const tablist = $('.tabs');
  if (tablist) {
    const tabs = $$('[role=tab]', tablist), ink = $('.tab-ink', tablist);
    const place = t => {
      ink.style.width = t.offsetWidth + 'px';
      ink.style.transform = 'translateX(' + t.offsetLeft + 'px)';
    };
    const select = (t, focus) => {
      tabs.forEach(o => {
        const on = o === t;
        o.setAttribute('aria-selected', on); o.tabIndex = on ? 0 : -1;
        const p = document.getElementById(o.getAttribute('aria-controls'));
        p.hidden = !on; p.classList.toggle('is-on', on);
      });
      place(t); if (focus) t.focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', e => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { e.preventDefault(); select(tabs[(i + d + tabs.length) % tabs.length], true); }
      });
    });
    const sync = () => place($('[aria-selected=true]', tablist));
    addEventListener('resize', sync);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(sync);
    sync();
  }

  // -- Hero halftone field ---------------------------------------------------
  /*
    A field of halftone dots, the way a press breaks an image into ink.
    Slow ink waves roll through it, and the cursor acts like a loupe that
    swells the dots under it. Cyan dominant, an amber plate on the right.
  */
  (function () {
    const cv = $('#hero-dots'); if (!cv) return;
    const ctx = cv.getContext('2d');
    let W, H, DPR, dots = [], mx = -9999, my = -9999, tmx = -9999, tmy = -9999, running = false, visible = true;
    const STEP = () => (W < 720 ? 20 : 24);

    function build() {
      DPR = Math.min(devicePixelRatio || 1, 2);
      const r = cv.getBoundingClientRect(); W = r.width; H = r.height;
      cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      dots = [];
      const s = STEP();
      for (let y = s / 2; y < H + s; y += s) {
        const odd = Math.round(y / s) % 2;
        for (let x = (odd ? s / 2 : 0); x < W + s; x += s) dots.push(x, y);
      }
    }

    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      mx += (tmx - mx) * .08; my += (tmy - my) * .08;
      const s = STEP(), maxR = s * .36;
      for (let i = 0; i < dots.length; i += 2) {
        const x = dots[i], y = dots[i + 1];
        const nx = x / W, ny = y / H;
        // Ink waves
        let v = Math.sin(nx * 6.2 + t * .45) * Math.cos(ny * 4.4 - t * .32) * .5 + .5;
        v = v * v;
        // Weight toward the right, away from the headline
        const bias = Math.min(1, Math.max(0, (nx - .18) * 1.25));
        // Loupe
        const dx = x - mx, dy = y - my, d2 = dx * dx + dy * dy;
        const lens = Math.exp(-d2 / 26000);
        let r = maxR * (v * .55 * bias + lens * .9);
        if (r < .5) continue;
        const amber = nx > .55 && ny > .45 && ((i / 2) % 7 === 0);
        const a = Math.min(.85, .16 + v * .3 * bias + lens * .55);
        ctx.fillStyle = amber ? 'rgba(245,165,36,' + (a * .8).toFixed(3) + ')' : 'rgba(34,211,238,' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
      }
    }

    let t0 = null;
    function loop(ts) {
      if (t0 === null) t0 = ts;
      draw((ts - t0) / 1000);
      if (visible) requestAnimationFrame(loop); else running = false;
    }
    function kick() { if (!running && visible && !reduced) { running = true; requestAnimationFrame(loop); } }

    build();
    addEventListener('resize', () => { build(); if (reduced) draw(2); });
    const hero = cv.parentElement;
    hero.addEventListener('pointermove', e => {
      const r = cv.getBoundingClientRect(); tmx = e.clientX - r.left; tmy = e.clientY - r.top;
      if (mx < -1000) { mx = tmx; my = tmy; }   // appear under the cursor, don't sweep in
    });
    hero.addEventListener('pointerleave', () => { tmx = tmy = -9999; });
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; kick(); }).observe(cv);
    if (reduced) draw(2); else kick();
  })();
})();
