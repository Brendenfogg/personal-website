/* Poker: the second hidden game. 100 hands of No-Limit Hold'em against three bots.
   Game logic lives in poker-engine.js (window.PokerEngine); this file is only the table. Loaded on demand by site.js. */
(function () {
  'use strict';
  var E = window.PokerEngine;
  var SCRIPT = document.currentScript && document.currentScript.src; // only set while the script first runs
  var HANDS = 100, KEY = 'bf-poker-best', BB = 2;
  var NAMES = ['You', 'Bot A', 'Bot B', 'Bot C'];
  var SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
  var SUIT_NAME = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
  var RANK_NAME = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack', T: 'Ten', 9: 'Nine', 8: 'Eight', 7: 'Seven', 6: 'Six', 5: 'Five', 4: 'Four', 3: 'Three', 2: 'Two' };
  var RM = window.matchMedia('(prefers-reduced-motion: reduce)');

  var dlg, screen, hudHand, hudNet, opener, opening = false;
  var cssState = 0, cssWaiting = []; // 0 not started, 1 loading, 2 ready
  var sess = null, ui = null;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function btn(cls, text) {
    var b = el('button', cls, text);
    b.type = 'button';
    return b;
  }

  /* ---------- formatting ---------- */
  function bbText(chips, signed) {
    var v = chips / BB, n = Math.abs(v), t = n % 1 ? n.toFixed(1) : String(n);
    if (!signed) return (v < 0 ? '−' : '') + t;
    return (v > 0 ? '+' : v < 0 ? '−' : '') + t;
  }
  function cardText(c) { return (c[0] === 'T' ? '10' : c[0]) + SYM[c[1]]; }
  function cardLabel(c) { return RANK_NAME[c[0]] + ' of ' + SUIT_NAME[c[1]]; }
  function later(fn, ms) {
    var s = sess;
    clearTimeout(s.timer);
    s.timer = setTimeout(function () { if (sess === s) fn(); }, RM.matches ? 0 : ms);
  }

  /* ---------- stylesheet ---------- */
  function ensureCss(cb) {
    if (cssState === 2) return cb();
    cssWaiting.push(cb);
    if (cssState === 1) return;
    cssState = 1;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = SCRIPT ? new URL('../css/poker.css', SCRIPT).href : 'css/poker.css';
    var done = function () {
      if (cssState === 2) return;
      cssState = 2;
      cssWaiting.splice(0).forEach(function (f) { f(); });
    };
    link.addEventListener('load', done);
    link.addEventListener('error', done);
    setTimeout(done, 2000);
    document.head.appendChild(link);
  }

  /* ---------- dialog shell ---------- */
  function build() {
    dlg = el('dialog', 'pk');
    dlg.setAttribute('aria-label', 'Poker, a hidden game');
    var inner = el('div', 'pk__in');
    var top = el('div', 'pk__top');
    top.appendChild(el('p', 'pk__title', 'Poker'));
    var hud = el('div', 'pk__hud nums');
    hudHand = el('span', null, '');
    hudHand.setAttribute('aria-label', 'Hand number');
    hudNet = el('span', null, '');
    hudNet.setAttribute('aria-label', 'Your net result in big blinds');
    hud.appendChild(hudHand); hud.appendChild(hudNet);
    top.appendChild(hud);
    var close = btn('pk__close', 'Close');
    close.addEventListener('click', function () { dlg.close(); });
    top.appendChild(close);
    screen = el('div', 'pk__screen');
    inner.appendChild(top); inner.appendChild(screen);
    dlg.appendChild(inner);
    document.body.appendChild(dlg);
    dlg.tabIndex = -1;
    dlg.addEventListener('close', function () {
      if (sess) clearTimeout(sess.timer);
      sess = null; ui = null;
      document.documentElement.style.overflow = '';
      if (opener && opener.focus) opener.focus();
    });
    document.addEventListener('keydown', function (e) { if (dlg.open && sess) onKey(e); });
  }

  function setHud() {
    var s = sess;
    hudHand.textContent = s && s.hand ? 'Hand ' + s.hand + ' of ' + HANDS : '';
    hudNet.textContent = s && s.hand ? bbText(s.net, true) + ' bb' : '';
  }

  function bestSaved() {
    try { var v = localStorage.getItem(KEY); return v == null ? null : parseFloat(v); } catch (e) { return null; }
  }

  /* ---------- intro ---------- */
  function intro() {
    sess = { phase: 'intro', hand: 0, net: 0, timer: 0 };
    ui = null;
    setHud();
    screen.className = 'pk__screen';
    screen.textContent = '';
    screen.appendChild(el('h2', 'pk__big', 'Pull up a chair'));
    screen.appendChild(el('p', null, 'You found the poker table. Play 100 hands of No-Limit Hold’em against three bots.'));
    screen.appendChild(el('p', 'pk__small', 'GTO-style bots: they mix value bets and bluffs at roughly balanced frequencies. Not a solver.'));
    screen.appendChild(el('p', 'pk__small', 'Blinds 1/2. Everyone starts every hand with 200 chips, 100 big blinds, so stacks reset each hand and your result is tracked in big blinds.'));
    screen.appendChild(el('p', 'pk__small pk__keys', 'On a keyboard: F folds, C checks or calls, R bets or raises the amount on the slider, Enter deals the next hand, Esc closes.'));
    var best = bestSaved();
    if (best != null) screen.appendChild(el('p', 'pk__small', 'Your best 100-hand session so far: ' + bbText(best * BB, true) + ' bb.'));
    var go = btn('button button--inverse', 'Deal me in');
    go.addEventListener('click', start);
    var act = el('div', 'pk__actions');
    act.appendChild(go);
    screen.appendChild(act);
    go.focus();
  }

  /* ---------- session ---------- */
  function start() {
    var seed = Date.now() & 0x7fffffff;
    var rng = E.mulberry32(seed);
    sess = {
      phase: 'play', rng: rng, hand: 0, net: 0, won: 0, biggest: 0, timer: 0,
      button0: Math.floor(rng() * 4), st: null, lastAct: [], revealed: false, log: [], sliderKey: ''
    };
    buildTable();
    dealHand();
  }

  function dealHand() {
    var s = sess;
    s.hand++;
    var b = (s.button0 + s.hand - 1) % 4;
    s.st = E.newHand({ button: b, rng: s.rng, handNo: s.hand, samples: 250 });
    s.revealed = false;
    s.phase = 'play';
    s.lastAct = ['', '', '', ''];
    s.lastAct[s.st.sbSeat] = 'Small blind';
    s.lastAct[s.st.bbSeat] = 'Big blind';
    s.sliderKey = '';
    ui.res.hidden = true;
    ui.ctrl.hidden = false;
    logLine('Hand ' + s.hand + '. ' + (b === 0 ? 'You are' : NAMES[b] + ' is') + ' on the button.', true);
    setHud();
    dlg.focus({ preventScroll: true });
    step();
  }

  function step() {
    var s = sess, st = s.st;
    if (E.isHandOver(st)) {
      render();
      later(finishHand, st.street === 'showdown' ? 700 : 450);
      return;
    }
    if (st.toAct === -1) {
      render();
      var runout = E.isBettingRoundOver(st) && st.stacks.some(function (x, i) { return !st.folded[i] && st.allIn[i]; });
      later(advanceStreet, runout ? 1000 : 550);
      return;
    }
    render();
    if (st.toAct === 0) return; // wait for the visitor
    later(botMove, st.folded[0] ? 200 : 550);
  }

  function botMove() {
    var st = sess.st, seat = st.toAct;
    perform(seat, E.botDecide(st, seat, sess.rng));
  }

  function perform(seat, action) {
    var s = sess, st = s.st, before = st.bets[seat];
    var e;
    try { e = E.applyAction(st, seat, action); } catch (err) { if (window.console) console.error(err); return; }
    var paid = e.amount - before, label, text;
    switch (e.type) {
      case 'fold': label = 'Folded'; text = verb(seat, 'fold'); break;
      case 'check': label = 'Checks'; text = verb(seat, 'check'); break;
      case 'call': label = 'Calls ' + paid; text = verb(seat, 'call') + ' ' + paid; break;
      case 'bet': label = 'Bets ' + e.amount; text = verb(seat, 'bet') + ' ' + e.amount; break;
      default: label = 'Raises to ' + e.amount; text = verb(seat, 'raise') + ' to ' + e.amount;
    }
    if (e.allIn && e.type !== 'fold') { label = 'All-in ' + e.amount; text += ', all-in'; }
    s.lastAct[seat] = label;
    logLine(text);
    step();
  }
  function verb(seat, v) { return seat === 0 ? 'You ' + v : NAMES[seat] + ' ' + v + 's'; }

  function advanceStreet() {
    var s = sess, st = s.st;
    E.nextStreet(st);
    if (st.street !== 'showdown') {
      for (var i = 0; i < 4; i++) if (!st.folded[i]) s.lastAct[i] = '';
      var fresh = st.street === 'flop' ? st.board : st.board.slice(-1);
      logLine({ flop: 'Flop', turn: 'Turn', river: 'River' }[st.street] + ': ' + fresh.map(cardText).join(' '));
    }
    step();
  }

  function finishHand() {
    var s = sess, st = s.st;
    var res = E.settle(st);
    s.revealed = res.showdown;
    s.net += res.net[0];
    if (res.net[0] > 0) { s.won++; s.biggest = Math.max(s.biggest, res.payouts[0]); }
    var names = res.winners.map(function (w) { return NAMES[w]; });
    var how = res.showdown ? ' with ' + res.hands[res.winners[0]].name : ', everyone else folded';
    var headline;
    if (names.length > 1) headline = names.join(' and ') + ' split ' + res.potTotal + how;
    else headline = names[0] + (res.winners[0] === 0 ? ' win ' : ' wins ') + res.payouts[res.winners[0]] + how;
    logLine(headline);
    s.phase = 'result';
    setHud();
    render();
    var d = res.net[0];
    ui.verdict.textContent = headline;
    ui.delta.textContent = d === 0 ? 'You broke even this hand.' : (d > 0 ? 'You won ' : 'You lost ') + Math.abs(d) + ' chips (' + bbText(Math.abs(d)) + ' bb).';
    ui.next.textContent = s.hand >= HANDS ? 'See results' : 'Next hand';
    ui.ctrl.hidden = true;
    ui.res.hidden = false;
    ui.next.focus({ preventScroll: true });
  }

  function nextHand() {
    var s = sess;
    if (!s || s.phase !== 'result') return;
    if (s.hand >= HANDS) end(); else dealHand();
  }

  /* ---------- table ---------- */
  function cardEl(c) {
    var d = el('span', 'pk-card' + (c && 'hd'.indexOf(c[1]) >= 0 ? ' is-red' : ''));
    if (!c) { d.classList.add('is-back'); d.setAttribute('aria-label', 'Face-down card'); }
    else {
      d.appendChild(el('span', 'pk-card__r', c[0] === 'T' ? '10' : c[0]));
      d.appendChild(el('span', 'pk-card__s', SYM[c[1]]));
      d.setAttribute('aria-label', cardLabel(c));
    }
    d.setAttribute('role', 'img');
    return d;
  }
  // cards: array of card strings, or null for face-down, or undefined for an empty slot
  function setCards(host, cards) {
    var sig = cards.map(function (c) { return c === undefined ? '_' : c || 'x'; }).join(',');
    if (host.dataset.sig === sig) return;
    var old = host.dataset.sig ? host.dataset.sig.split(',') : [];
    host.dataset.sig = sig;
    host.textContent = '';
    cards.forEach(function (c, i) {
      var d;
      if (c === undefined) { d = el('span', 'pk-card is-empty'); d.setAttribute('aria-hidden', 'true'); }
      else { d = cardEl(c); if (old[i] !== (c || 'x')) d.classList.add('is-new'); }
      host.appendChild(d);
    });
  }

  function buildTable() {
    screen.className = 'pk__screen pk__screen--play';
    screen.textContent = '';
    ui = { seats: [], board: null };
    var play = el('div', 'pk__play');
    var table = el('div', 'pk__table');
    var bots = el('div', 'pk__bots');
    var mid = el('div', 'pk__mid');
    function seat(i) {
      var root = el('div', 'pk-seat' + (i === 0 ? ' pk-seat--you' : ''));
      root.setAttribute('role', 'group');
      var head = el('div', 'pk-seat__head');
      var name = el('span', 'pk-seat__name', NAMES[i]);
      var dealer = el('span', 'pk-dealer nums', 'D');
      dealer.title = 'Dealer button';
      dealer.setAttribute('aria-label', 'Dealer button');
      head.appendChild(name); head.appendChild(dealer);
      var cards = el('div', 'pk-seat__cards');
      var info = el('div', 'pk-seat__info');
      var stack = el('span', 'pk-seat__stack nums');
      var bet = el('span', 'pk-seat__bet nums');
      var act = el('span', 'pk-seat__act');
      info.appendChild(stack); info.appendChild(bet); info.appendChild(act);
      root.appendChild(head); root.appendChild(cards); root.appendChild(info);
      ui.seats[i] = { root: root, dealer: dealer, cards: cards, stack: stack, bet: bet, act: act };
      return root;
    }
    for (var i = 1; i <= 3; i++) bots.appendChild(seat(i));
    ui.board = el('div', 'pk-board');
    ui.board.setAttribute('aria-label', 'Community cards');
    ui.pot = el('p', 'pk-pot nums');
    mid.appendChild(ui.board); mid.appendChild(ui.pot);
    table.appendChild(bots); table.appendChild(mid); table.appendChild(seat(0));

    var side = el('div', 'pk__side');
    ui.logEl = el('ul', 'pk-log');
    ui.logEl.setAttribute('aria-live', 'polite');
    ui.logEl.setAttribute('aria-relevant', 'additions');
    ui.logEl.setAttribute('aria-label', 'Hand history');
    side.appendChild(ui.logEl);

    var area = el('div', 'pk__controls');
    var ctrl = el('div', 'pk-ctrl');
    var acts = el('div', 'pk-ctrl__acts');
    ui.fold = btn('button pk-btn pk-btn--line');
    ui.call = btn('button pk-btn button--inverse');
    ui.raise = btn('button pk-btn button--inverse');
    [[ui.fold, 'Fold', 'F'], [ui.call, 'Check', 'C'], [ui.raise, 'Raise', 'R']].forEach(function (r) {
      r[0].appendChild(el('span', 'pk-btn__t', r[1]));
      r[0].appendChild(el('kbd', null, r[2]));
      acts.appendChild(r[0]);
    });
    ui.fold.addEventListener('click', function () { human({ type: 'fold' }); });
    ui.call.addEventListener('click', function () { human(null, 'call'); });
    ui.raise.addEventListener('click', function () { human(null, 'raise'); });
    var size = el('div', 'pk-ctrl__size');
    ui.slider = el('input', 'pk-slider');
    ui.slider.type = 'range';
    ui.slider.setAttribute('aria-label', 'Bet size');
    ui.amount = el('output', 'pk-amount nums', '0');
    ui.slider.addEventListener('input', function () { syncRaise(); });
    size.appendChild(ui.slider); size.appendChild(ui.amount);
    var quick = el('div', 'pk-ctrl__quick');
    ui.quick = [['½ pot', 0.5], ['Pot', 1], ['All-in', -1]].map(function (q) {
      var b = btn('button pk-btn pk-btn--line', q[0]);
      b.addEventListener('click', function () { setSize(q[1]); });
      quick.appendChild(b);
      return b;
    });
    ctrl.appendChild(acts); ctrl.appendChild(size); ctrl.appendChild(quick);

    var res = el('div', 'pk__result');
    res.hidden = true;
    ui.verdict = el('p', 'pk__verdict');
    ui.delta = el('p', 'pk__delta nums');
    ui.next = btn('button', 'Next hand');
    ui.next.addEventListener('click', nextHand);
    res.appendChild(ui.verdict); res.appendChild(ui.delta); res.appendChild(ui.next);
    area.appendChild(ctrl); area.appendChild(res);
    ui.ctrl = ctrl; ui.res = res;

    play.appendChild(table); play.appendChild(area); play.appendChild(side);
    screen.appendChild(play);
  }

  function logLine(text, mark) {
    var li = el('li', mark ? 'is-mark' : null, text);
    ui.logEl.insertBefore(li, ui.logEl.firstChild);
    while (ui.logEl.children.length > 30) ui.logEl.removeChild(ui.logEl.lastChild);
  }

  function render() {
    var s = sess, st = s.st, done = st.street === 'done';
    var i;
    for (i = 0; i < 4; i++) {
      var u = ui.seats[i], visible = i === 0 || (s.revealed && !st.folded[i]);
      u.root.classList.toggle('is-turn', !done && !E.isHandOver(st) && st.toAct === i);
      u.root.classList.toggle('is-folded', st.folded[i]);
      u.dealer.hidden = st.button !== i;
      u.stack.textContent = String(st.stacks[i]);
      u.bet.textContent = !done && st.bets[i] > 0 ? 'Bet ' + st.bets[i] : '';
      u.act.textContent = s.lastAct[i] || '';
      setCards(u.cards, visible ? st.hole[i] : [null, null]);
      u.root.setAttribute('aria-label', NAMES[i] + ', ' + st.stacks[i] + ' chips' + (st.folded[i] ? ', folded' : ''));
    }
    var board = [];
    for (i = 0; i < 5; i++) board.push(st.board[i]);
    setCards(ui.board, board);
    ui.pot.textContent = done ? '' : 'Pot ' + st.pot;
    updateControls();
  }

  /* ---------- the visitor's controls ---------- */
  function myTurn() {
    var s = sess;
    return !!s && s.phase === 'play' && s.st && !E.isHandOver(s.st) && s.st.toAct === 0;
  }

  function updateControls() {
    var s = sess, st = s.st, mine = myTurn();
    var all = [ui.fold, ui.call, ui.raise, ui.slider].concat(ui.quick);
    if (!mine) {
      all.forEach(function (c) { c.disabled = true; });
      setLabel(ui.call, 'Check'); setLabel(ui.raise, 'Raise');
      return;
    }
    var L = E.legalActions(st, 0);
    ui.fold.disabled = !L.canFold;
    ui.call.disabled = false;
    setLabel(ui.call, L.canCall ? 'Call ' + L.callAmount : 'Check');
    ui.slider.disabled = !L.canRaise || L.minTotal >= L.maxTotal;
    ui.raise.disabled = !L.canRaise;
    ui.quick.forEach(function (b) { b.disabled = !L.canRaise; });
    var key = st.street + ':' + st.history.length;
    if (s.sliderKey !== key) { // new decision: reset the slider, otherwise leave the visitor's choice alone
      s.sliderKey = key;
      ui.slider.min = L.minTotal; ui.slider.max = L.maxTotal; ui.slider.step = 1;
      ui.slider.value = L.isBet ? clamp(Math.round(st.pot / 2), L) : L.minTotal;
    }
    syncRaise();
  }
  function setLabel(b, t) { b.firstChild.textContent = t; }
  function clamp(v, L) { return Math.max(L.minTotal, Math.min(L.maxTotal, v)); }

  function setSize(frac) {
    if (!myTurn()) return;
    var st = sess.st, L = E.legalActions(st, 0);
    if (!L.canRaise) return;
    var total = frac < 0 ? L.maxTotal : st.bets[0] + L.toCall + Math.round(frac * (st.pot + L.toCall));
    ui.slider.value = clamp(total, L);
    syncRaise();
  }
  function syncRaise() {
    if (!sess || !sess.st) return;
    var L = E.legalActions(sess.st, 0), v = +ui.slider.value;
    ui.amount.textContent = String(v);
    if (!myTurn() || !L.canRaise) { setLabel(ui.raise, L.isBet ? 'Bet' : 'Raise'); ui.amount.textContent = ''; return; }
    setLabel(ui.raise, v >= L.maxTotal ? 'All-in ' + v : (L.isBet ? 'Bet ' : 'Raise to ') + v);
  }

  function human(action, kind) {
    if (!myTurn()) return;
    var L = E.legalActions(sess.st, 0);
    if (kind === 'call') action = { type: L.canCall ? 'call' : 'check' };
    else if (kind === 'raise') {
      if (!L.canRaise) return;
      action = { type: L.isBet ? 'bet' : 'raise', amount: +ui.slider.value };
    }
    perform(0, action);
  }

  /* ---------- end screen ---------- */
  function end() {
    var s = sess;
    s.phase = 'end';
    ui = null;
    var bb = s.net / BB, best = bestSaved(), isBest = best == null || bb > best;
    try { if (isBest) localStorage.setItem(KEY, String(bb)); } catch (e) {}
    screen.className = 'pk__screen';
    screen.textContent = '';
    screen.appendChild(el('h2', 'pk__big', 'Session over'));
    var verdict;
    if (bb > 0) verdict = 'You finished ' + bbText(s.net, true) + ' big blinds over ' + HANDS + ' hands. The bots mix their bets, but they are not a solver, so a win here is not proof you out-played solid poker.';
    else if (bb < 0) verdict = 'You finished ' + bbText(s.net, true) + ' big blinds over ' + HANDS + ' hands. A hundred hands is a small sample, and the cards decide most of it.';
    else verdict = 'You finished exactly even over ' + HANDS + ' hands.';
    screen.appendChild(el('p', null, verdict));
    var rc = el('div', 'pk__receipt');
    rc.appendChild(el('h3', null, 'Your receipt'));
    [['Net result', bbText(s.net, true) + ' bb'], ['bb/100', bbText(s.net / HANDS * 100, true)], ['Hands won', String(s.won)], ['Biggest pot won', s.biggest ? bbText(s.biggest) + ' bb' : 'none']].forEach(function (row) {
      var d = el('div', 'nums');
      d.appendChild(el('span', null, row[0])); d.appendChild(el('span', null, row[1]));
      rc.appendChild(d);
    });
    var tot = el('div', 'pk__total nums');
    tot.appendChild(el('span', null, isBest && best != null ? 'New best session' : 'Best session'));
    tot.appendChild(el('span', null, bbText(Math.max(bb, best == null ? bb : best) * BB, true) + ' bb'));
    rc.appendChild(tot);
    screen.appendChild(rc);
    var act = el('div', 'pk__actions');
    var again = btn('button button--inverse', 'Play another 100');
    again.addEventListener('click', start);
    var close = btn('button pk-btn--line', 'Close');
    close.addEventListener('click', function () { dlg.close(); });
    act.appendChild(again); act.appendChild(close);
    screen.appendChild(act);
    again.focus();
  }

  /* ---------- keyboard ---------- */
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (sess.phase === 'play' && myTurn()) {
      if (k === 'f' && !ui.fold.disabled) { e.preventDefault(); human({ type: 'fold' }); }
      else if (k === 'c') { e.preventDefault(); human(null, 'call'); }
      else if (k === 'r' && !ui.raise.disabled) { e.preventDefault(); human(null, 'raise'); }
    } else if (sess.phase === 'result' && (k === 'Enter' || k === ' ') && !(e.target && e.target.closest && e.target.closest('button, a'))) {
      e.preventDefault(); nextHand();
    }
  }

  window.Poker = {
    open: function () {
      if (!E) { if (window.console) console.error('Poker: poker-engine.js must load first'); return; }
      if ((dlg && dlg.open) || opening) return;
      opening = true;
      opener = document.activeElement;
      ensureCss(function () {
        opening = false;
        if (!dlg) build();
        intro();
        document.documentElement.style.overflow = 'hidden';
        if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
        var go = dlg.querySelector('.pk__actions .button');
        if (go) go.focus();
      });
    }
  };
})();
