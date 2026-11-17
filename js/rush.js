/* Rush — the hidden game. Forty-five seconds on the register: catch the ticket that doesn't match what the guest said.
   It is the Order Check problem, played by hand. Loaded on demand by site.js. */
(function () {
  'use strict';
  var SHIFT = 45; // seconds
  var KEY = 'bf-rush-best';

  var MENU = {
    main: [
      { say: 'a spicy chicken sandwich', ring: 'Spicy chicken sandwich', wrong: ['Chicken sandwich', 'Spicy deluxe sandwich'] },
      { say: 'a chicken sandwich', ring: 'Chicken sandwich', wrong: ['Spicy chicken sandwich', 'Deluxe chicken sandwich'] },
      { say: 'a bacon cheeseburger', ring: 'Bacon cheeseburger', wrong: ['Cheeseburger'] },
      { say: 'a cheeseburger', ring: 'Cheeseburger', wrong: ['Bacon cheeseburger', 'Double cheeseburger'] },
      { say: 'eight nuggets', ring: 'Nuggets, 8 ct', wrong: ['Nuggets, 12 ct'] },
      { say: 'twelve nuggets', ring: 'Nuggets, 12 ct', wrong: ['Nuggets, 8 ct'] },
      { say: 'a grilled chicken wrap', ring: 'Grilled chicken wrap', wrong: ['Crispy chicken wrap'] }
    ],
    side: [
      { say: 'a large fry', ring: 'Fries, large', wrong: ['Fries, medium'] },
      { say: 'a medium fry', ring: 'Fries, medium', wrong: ['Fries, large', 'Fries, small'] },
      { say: 'a side salad', ring: 'Side salad', wrong: ['Side of slaw'] },
      { say: 'mac and cheese', ring: 'Mac and cheese', wrong: ['Mac and cheese, large'] }
    ],
    drink: [
      { say: 'a lemonade', ring: 'Lemonade', wrong: ['Diet lemonade'] },
      { say: 'a diet lemonade', ring: 'Diet lemonade', wrong: ['Lemonade'] },
      { say: 'a sweet tea', ring: 'Sweet tea', wrong: ['Unsweet tea'] },
      { say: 'an unsweet tea', ring: 'Unsweet tea', wrong: ['Sweet tea'] },
      { say: 'a large cola', ring: 'Cola, large', wrong: ['Cola, medium', 'Diet cola, large'] }
    ],
    sauce: [
      { say: 'three ranch', ring: 'Ranch × 3', wrong: ['Ranch × 1'] },
      { say: 'two barbecue sauces', ring: 'Barbecue × 2', wrong: ['Barbecue × 1', 'Honey mustard × 2'] },
      { say: 'one honey mustard', ring: 'Honey mustard × 1', wrong: ['Honey roasted BBQ × 1'] }
    ]
  };
  var OPENERS = [['Can I get', '?'], ['I\u2019ll take', '.'], ['Could I have', '?'], ['Let me get', '.'], ['We\u2019ll do', '.']];

  var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  var RM = window.matchMedia('(prefers-reduced-motion: reduce)');

  function makeOrder() {
    var cats = ['main', 'side', 'drink'];
    if (Math.random() < 0.6) cats.push('sauce');
    var items = cats.map(function (c) { return pick(MENU[c]); });
    var said = items.map(function (i) { return i.say; });
    var last = said.pop();
    var op = pick(OPENERS);
    var sentence = op[0] + ' ' + said.join(', ') + ' and ' + last + op[1];
    var bad = Math.random() < 0.68 ? Math.floor(Math.random() * items.length) : -1;
    var lines = items.map(function (it, i) { return i === bad ? pick(it.wrong) : it.ring; });
    return { sentence: sentence, lines: lines, bad: bad, said: bad >= 0 ? items[bad].ring : null };
  }

  var dlg, screen, hudTime, hudScore, opener;
  var state = null;
  var raf = 0;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function build() {
    dlg = el('dialog', 'rush');
    dlg.setAttribute('aria-label', 'Rush, a hidden game');
    var inner = el('div', 'rush__in');
    var top = el('div', 'rush__top');
    top.appendChild(el('p', 'rush__title', 'Rush'));
    var hud = el('div', 'rush__hud');
    hudTime = el('span', 'nums', '0:45');
    hudTime.setAttribute('aria-label', 'Time left');
    hudScore = el('span', 'nums', '0 pts');
    hudScore.setAttribute('aria-label', 'Score');
    hud.appendChild(hudTime); hud.appendChild(hudScore);
    top.appendChild(hud);
    var close = el('button', 'rush__close', 'Close');
    close.type = 'button';
    close.addEventListener('click', function () { dlg.close(); });
    top.appendChild(close);
    screen = el('div', 'rush__screen');
    inner.appendChild(top); inner.appendChild(screen);
    dlg.appendChild(inner);
    document.body.appendChild(dlg);
    dlg.addEventListener('close', function () {
      cancelAnimationFrame(raf);
      state = null;
      document.documentElement.style.overflow = '';
      if (opener && opener.focus) opener.focus();
    });
    dlg.tabIndex = -1;
    // Listen on the document so the keys work wherever focus lands while the game is open.
    document.addEventListener('keydown', function (e) { if (dlg.open) onKey(e); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && dlg.open && state) dlg.close(); });
  }

  function intro() {
    screen.textContent = '';
    hudTime.textContent = '0:' + SHIFT; hudScore.textContent = '0 pts';
    screen.appendChild(el('h2', 'rush__big', 'Order up'));
    screen.appendChild(el('p', null, 'You found the hidden game. You have 45 seconds to check orders during a rush.'));
    screen.appendChild(el('p', 'rush__small', 'Each order shows what the customer said and the ticket that was entered. If a line is wrong, tap it. If the ticket is right, send it to the kitchen.'));
    screen.appendChild(el('p', 'rush__small rush__keys', 'On a keyboard: 1 to 4 flag a line, Enter sends, Esc closes.'));
    var best = 0;
    try { best = +localStorage.getItem(KEY) || 0; } catch (e) {}
    if (best) screen.appendChild(el('p', 'rush__small', 'Your best shift so far: ' + best + ' points.'));
    var go = el('button', 'button button--inverse', 'Start the shift');
    go.type = 'button';
    go.addEventListener('click', start);
    var act = el('div', 'rush__actions');
    act.appendChild(go);
    screen.appendChild(act);
    go.focus();
  }

  function start() {
    state = { t0: performance.now(), score: 0, caught: 0, clean: 0, missed: 0, alarms: 0, streak: 0, n: 0, order: null, o0: 0, limit: 8, locked: false };
    screen.textContent = '';
    var play = el('div', 'rush__play');
    var left = el('div');
    var said = el('p', 'rush__said');
    said.id = 'rush-said';
    said.setAttribute('aria-live', 'polite');
    left.appendChild(said);
    var flash = el('p', 'rush__flash');
    flash.setAttribute('role', 'status');
    flash.setAttribute('aria-live', 'polite');
    left.appendChild(flash);
    var ticket = el('div', 'rush__ticket');
    play.appendChild(left); play.appendChild(ticket);
    screen.appendChild(play);
    state.saidEl = said; state.ticketEl = ticket; state.flashEl = flash;
    next();
    tick();
  }

  function next() {
    var s = state;
    s.n++;
    s.order = makeOrder();
    s.limit = Math.max(3.6, 8 - s.n * 0.32);
    s.o0 = performance.now();
    s.locked = false;
    s.saidEl.textContent = '';
    s.saidEl.appendChild(el('span', 'rush__said-label', 'The customer said: '));
    s.saidEl.appendChild(document.createTextNode('“' + s.order.sentence + '”'));
    var t = s.ticketEl;
    t.textContent = '';
    t.className = 'rush__ticket';
    var timer = el('div', 'rush__timer');
    s.timerBar = el('i');
    timer.appendChild(s.timerBar);
    t.appendChild(timer);
    s.order.lines.forEach(function (line, i) {
      var b = el('button', 'rush__line');
      b.type = 'button';
      b.appendChild(el('span', null, line));
      b.appendChild(el('kbd', null, String(i + 1)));
      b.addEventListener('click', function () { flag(i); });
      t.appendChild(b);
    });
    // always four slots, so the Send button never moves between orders
    for (var k = s.order.lines.length; k < 4; k++) {
      var gap = el('div', 'rush__line is-empty');
      gap.setAttribute('aria-hidden', 'true');
      t.appendChild(gap);
    }
    var send = el('button', 'button rush__send', 'Send to kitchen');
    send.type = 'button';
    send.addEventListener('click', sendIt);
    t.appendChild(send);
    // The old buttons are gone; park focus on the dialog so 1-4 and Enter keep working.
    dlg.focus({ preventScroll: true });
  }

  function settle(good, msg, pts) {
    var s = state;
    if (!s || s.locked) return;
    s.locked = true;
    s.streak = good ? s.streak + 1 : 0;
    var bonus = good && s.streak >= 3 ? 25 : 0;
    s.score = Math.max(0, s.score + pts + bonus);
    hudScore.textContent = s.score + ' pts';
    s.flashEl.textContent = msg + (bonus ? ' Streak of ' + s.streak + ', +25.' : '');
    s.ticketEl.classList.add(good ? 'is-right' : 'is-wrong');
    // on a miss, point at the line that was actually wrong and hold a little longer
    if (!good && s.order.bad >= 0) {
      var culprit = s.ticketEl.querySelectorAll('.rush__line')[s.order.bad];
      if (culprit) culprit.classList.add('is-culprit');
    }
    setTimeout(function () { if (state === s) next(); }, good ? 650 : 950);
  }

  function flag(i) {
    var s = state; if (!s || s.locked) return;
    var o = s.order;
    var picked = s.ticketEl.querySelectorAll('.rush__line')[i];
    if (picked) picked.classList.add('is-picked');
    if (i === o.bad) { s.caught++; settle(true, 'Caught. The customer said ' + o.said.toLowerCase() + '.', 100); }
    else { s.alarms++; settle(false, o.bad < 0 ? 'False alarm. That ticket was right.' : 'Wrong line. The mistake was ' + o.lines[o.bad].toLowerCase() + '.', -50); }
  }
  function sendIt() {
    var s = state; if (!s || s.locked) return;
    var o = s.order;
    if (o.bad < 0) { s.clean++; settle(true, 'Right ticket, sent.', 50); }
    else { s.missed++; settle(false, 'Missed it. Rang ' + o.lines[o.bad].toLowerCase() + ', customer said ' + o.said.toLowerCase() + '.', -75); }
  }
  function timeout() {
    var s = state; if (!s || s.locked) return;
    var o = s.order;
    if (o.bad >= 0) s.missed++;
    settle(false, o.bad >= 0 ? 'Too slow. The kitchen made ' + o.lines[o.bad].toLowerCase() + '.' : 'Too slow. The line is backing up.', -25);
  }

  function tick() {
    var s = state; if (!s) return;
    var now = performance.now();
    var left = SHIFT - (now - s.t0) / 1000;
    if (left <= 0) { finish(); return; }
    var sec = Math.ceil(left);
    hudTime.textContent = '0:' + (sec < 10 ? '0' : '') + sec;
    if (!s.locked) {
      var f = 1 - (now - s.o0) / 1000 / s.limit;
      if (f <= 0) timeout();
      else if (s.timerBar) s.timerBar.style.transform = 'scaleX(' + f.toFixed(3) + ')';
    }
    raf = requestAnimationFrame(tick);
  }

  function finish() {
    var s = state; state = null;
    cancelAnimationFrame(raf);
    hudTime.textContent = '0:00';
    var mistakes = s.caught + s.missed;
    var rate = mistakes ? Math.round(s.caught / mistakes * 100) : 0;
    var best = 0;
    try { best = +localStorage.getItem(KEY) || 0; if (s.score > best) localStorage.setItem(KEY, s.score); } catch (e) {}
    screen.textContent = '';
    screen.appendChild(el('h2', 'rush__big', 'Shift over'));
    var verdict;
    if (!mistakes) verdict = 'No mistakes came through on your shift. Lucky register.';
    else if (rate > 81 && s.alarms <= 1) verdict = 'You caught ' + rate + '% of the mistakes. That beats the 81% my Order Check scored on orders it had never seen.';
    else if (rate > 81) verdict = 'You caught ' + rate + '% of the mistakes, but with ' + s.alarms + ' false alarms. Too many of those and people stop trusting the alert.';
    else verdict = 'You caught ' + rate + '% of the mistakes. Order Check scored 81% on orders it had never seen, in about half a second each.';
    screen.appendChild(el('p', null, verdict));
    var rc = el('div', 'rush__receipt');
    rc.appendChild(el('h3', null, 'Your receipt'));
    [['Mistakes caught', s.caught], ['Mistakes missed', s.missed], ['False alarms', s.alarms], ['Clean tickets sent', s.clean]].forEach(function (row) {
      var d = el('div', 'nums');
      d.appendChild(el('span', null, row[0])); d.appendChild(el('span', null, String(row[1])));
      rc.appendChild(d);
    });
    var tot = el('div', 'rush__total nums');
    tot.appendChild(el('span', null, s.score > best && best ? 'New best' : 'Total')); tot.appendChild(el('span', null, s.score + ' pts'));
    rc.appendChild(tot);
    screen.appendChild(rc);
    var act = el('div', 'rush__actions');
    var again = el('button', 'button button--inverse', 'Work another shift');
    again.type = 'button';
    again.addEventListener('click', start);
    var cs = el('a', 'link', 'Read how Order Check does it');
    cs.href = 'projects/order-check/';
    act.appendChild(again); act.appendChild(cs);
    screen.appendChild(act);
    again.focus();
  }

  function onKey(e) {
    if (!state || state.locked || e.repeat) return;
    if (e.key >= '1' && e.key <= '4') {
      var i = +e.key - 1;
      if (i < state.order.lines.length) { e.preventDefault(); flag(i); }
    } else if (e.key === 'Enter' && !(e.target && e.target.closest && e.target.closest('button, a'))) {
      e.preventDefault(); sendIt();
    }
  }

  window.Rush = {
    open: function () {
      if (!dlg) build();
      if (dlg.open) return;
      opener = document.activeElement;
      intro();
      document.documentElement.style.overflow = 'hidden';
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      var go = dlg.querySelector('.rush__actions .button');
      if (go) go.focus();
    }
  };
})();
