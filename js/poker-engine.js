/* Poker engine: pure No-Limit Hold'em logic with no DOM. Four seats, blinds 1/2, cash-game stacks.
   Browser: window.PokerEngine. Node: module.exports.

   Cards are two-char strings: rank in "23456789TJQKA", suit in "shdc" ("As", "Td").
   All randomness comes from an `rng` argument, a function returning [0, 1). Use mulberry32(seed).

   Evaluation
     newDeck() -> string[]                         shuffle(deck, rng) -> string[] (new array)
     evaluate7(cards) -> { rank, category, name }  best 5 of 5 to 7 cards; higher rank wins, equal rank ties
     compareHands(a, b) -> -1 | 0 | 1              a, b are evaluate7 results or card arrays
     equity(hole, board, opponents, samples, rng) -> 0..1   Monte Carlo vs random hands (ties count as shares)

   Game state (a plain object, mutated in place by the step functions)
     newHand({ button, stacks?, stack?, sb?, bb?, rng, deck?, handNo?, samples? }) -> state
         Deals, posts blinds, sets state.toAct. Fields: n, button, stacks, bets (this street), committed
         (whole hand), pot, board, hole, street ('preflop'|'flop'|'turn'|'river'|'showdown'|'done'),
         folded, allIn, currentBet, lastRaise, toAct (-1 when no one can act), history, preflopRaises.
     legalActions(state, seat) -> { canFold, canCheck, canCall, callAmount, toCall, canRaise, isBet,
                                    minTotal, maxTotal }       (totals are "bet to" amounts for this street)
     applyAction(state, seat, { type, amount? }) -> history entry { seat, type, amount, street, allIn }
         type: fold | check | call | bet | raise. amount = total bet this street. Throws if illegal.
         A raise below the minimum is legal only if it is all-in. A short all-in does not reopen raising.
     isBettingRoundOver(state) / isHandOver(state)     isHandOver: one player left, or street is showdown
     nextStreet(state)       deals the next street and sets toAct. When toAct is -1 and the hand is not over
                             (everyone is all-in), call nextStreet again until street === 'showdown'.
     settle(state) -> { showdown, payouts, net, pots, winners, hands, potTotal }
         Pays out (side pots handled, odd chips go to the first winner left of the button), pot becomes 0.
         Chips are conserved: sum(stacks) + pot is constant.
     playHand(state, rng) -> settle result           plays every seat with botDecide until the hand is over

   Bots
     botDecide(state, seat, rng) -> { type, amount? }   amount = total bet on this street. Always legal.
     handClass(hole) -> "AKs"; handPercent(hole) -> share of the 1326 combos at least as strong, 0..1
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PokerEngine = api;
})(this, function () {
  'use strict';

  var RANKS = '23456789TJQKA';
  var SUITS = 'shdc';
  var B5 = 371293; // 13^5, so rank = category * B5 + five base-13 kicker digits

  /* ---------- cards, deck, rng ---------- */
  function newDeck() {
    var d = [];
    for (var r = 0; r < 13; r++) for (var s = 0; s < 4; s++) d.push(RANKS[r] + SUITS[s]);
    return d;
  }
  function shuffle(deck, rng) {
    var a = deck.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function mulberry32(seed) {
    var a = seed | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function toInt(c) { return RANKS.indexOf(c[0]) * 4 + SUITS.indexOf(c[1]); }

  /* ---------- hand evaluation (integer cards: rank * 4 + suit) ---------- */
  var rc = new Int8Array(13), sc = new Int8Array(4), sm = new Int32Array(4);

  function straightHigh(mask) {
    var m = (mask << 1) | ((mask >> 12) & 1); // bit 0 is the low ace
    for (var h = 13; h >= 4; h--) {
      var need = 31 << (h - 4);
      if ((m & need) === need) return h - 1;
    }
    return -1;
  }
  function pack(cat, a, b, c, d, e) {
    return cat * B5 + a * 28561 + b * 2197 + c * 169 + d * 13 + e;
  }
  // highest ranks present, skipping x and y; fills out[0..k-1] (zero when fewer exist)
  function kickers(x, y, k, out) {
    var n = 0;
    for (var r = 12; r >= 0 && n < k; r--) if (rc[r] > 0 && r !== x && r !== y) out[n++] = r;
    while (n < k) out[n++] = 0;
  }
  var K = [0, 0, 0, 0, 0];

  function evalInt(cs, n) {
    var i, r, s;
    rc.fill(0); sc.fill(0); sm.fill(0);
    for (i = 0; i < n; i++) { r = cs[i] >> 2; s = cs[i] & 3; rc[r]++; sc[s]++; sm[s] |= 1 << r; }
    var fs = -1;
    for (s = 0; s < 4; s++) if (sc[s] >= 5) fs = s;
    if (fs >= 0) {
      var sf = straightHigh(sm[fs]);
      if (sf >= 0) return pack(8, sf, 0, 0, 0, 0);
    }
    var quad = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1;
    for (r = 12; r >= 0; r--) {
      var c = rc[r];
      if (c === 4) quad = r;
      else if (c === 3) { if (t1 < 0) t1 = r; else if (t2 < 0) t2 = r; }
      else if (c === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; }
    }
    if (quad >= 0) { kickers(quad, -1, 1, K); return pack(7, quad, K[0], 0, 0, 0); }
    if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) return pack(6, t1, Math.max(t2, p1), 0, 0, 0);
    if (fs >= 0) {
      var m = sm[fs], f = [0, 0, 0, 0, 0], fn = 0;
      for (r = 12; r >= 0 && fn < 5; r--) if (m & (1 << r)) f[fn++] = r;
      return pack(5, f[0], f[1], f[2], f[3], f[4]);
    }
    var st = straightHigh(sm[0] | sm[1] | sm[2] | sm[3]);
    if (st >= 0) return pack(4, st, 0, 0, 0, 0);
    if (t1 >= 0) { kickers(t1, -1, 2, K); return pack(3, t1, K[0], K[1], 0, 0); }
    if (p2 >= 0) { kickers(p1, p2, 1, K); return pack(2, p1, p2, K[0], 0, 0); }
    if (p1 >= 0) { kickers(p1, -1, 3, K); return pack(1, p1, K[0], K[1], K[2], 0); }
    kickers(-1, -1, 5, K);
    return pack(0, K[0], K[1], K[2], K[3], K[4]);
  }

  var NAME = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king', 'ace'];
  var PLURAL = ['twos', 'threes', 'fours', 'fives', 'sixes', 'sevens', 'eights', 'nines', 'tens', 'jacks', 'queens', 'kings', 'aces'];

  function describe(rank) {
    var cat = Math.floor(rank / B5), rem = rank - cat * B5;
    var d1 = Math.floor(rem / 28561); rem -= d1 * 28561;
    var d2 = Math.floor(rem / 2197);
    switch (cat) {
      case 0: return NAME[d1] + '-high';
      case 1: return 'a pair of ' + PLURAL[d1];
      case 2: return 'two pair, ' + PLURAL[d1] + ' and ' + PLURAL[d2];
      case 3: return 'three of a kind, ' + PLURAL[d1];
      case 4: return 'a straight, ' + NAME[d1] + '-high';
      case 5: return 'a flush, ' + NAME[d1] + '-high';
      case 6: return 'a full house, ' + PLURAL[d1] + ' full of ' + PLURAL[d2];
      case 7: return 'four of a kind, ' + PLURAL[d1];
      default: return d1 === 12 ? 'a royal flush' : 'a straight flush, ' + NAME[d1] + '-high';
    }
  }

  function evaluate7(cards) {
    var cs = [];
    for (var i = 0; i < cards.length; i++) cs.push(toInt(cards[i]));
    var rank = evalInt(cs, cs.length);
    return { rank: rank, category: Math.floor(rank / B5), name: describe(rank) };
  }
  function compareHands(a, b) {
    var ra = Array.isArray(a) ? evaluate7(a).rank : a.rank;
    var rb = Array.isArray(b) ? evaluate7(b).rank : b.rank;
    return ra > rb ? 1 : ra < rb ? -1 : 0;
  }

  // Monte Carlo equity against `opponents` random hands; ties count as an equal share.
  function equity(hole, board, opponents, samples, rng) {
    var used = {}, i;
    hole.concat(board).forEach(function (c) { used[toInt(c)] = true; });
    var rest = [];
    for (i = 0; i < 52; i++) if (!used[i]) rest.push(i); // integer cards are rank * 4 + suit
    var bd = board.map(toInt), h0 = toInt(hole[0]), h1 = toInt(hole[1]);
    var need = opponents * 2 + (5 - bd.length), total = 0, m = rest.length;
    var mine = [h0, h1, 0, 0, 0, 0, 0], theirs = [0, 0, 0, 0, 0, 0, 0];
    for (var s = 0; s < samples; s++) {
      for (i = 0; i < need; i++) { // partial Fisher-Yates: the first `need` slots are a uniform draw
        var j = i + Math.floor(rng() * (m - i));
        var t = rest[i]; rest[i] = rest[j]; rest[j] = t;
      }
      for (i = 0; i < 5; i++) {
        mine[2 + i] = i < bd.length ? bd[i] : rest[opponents * 2 + i - bd.length];
        theirs[2 + i] = mine[2 + i];
      }
      var me = evalInt(mine, 7), ties = 0, lost = false;
      for (var o = 0; o < opponents; o++) {
        theirs[0] = rest[o * 2]; theirs[1] = rest[o * 2 + 1];
        var op = evalInt(theirs, 7);
        if (op > me) { lost = true; break; }
        if (op === me) ties++;
      }
      if (!lost) total += 1 / (1 + ties);
    }
    return total / samples;
  }

  /* ---------- preflop hand classes, strongest first by heads-up all-in equity ---------- */
  var PREFLOP_ORDER = (
    'AA KK QQ JJ TT 99 88 AKs AQs 77 AKo AJs ATs AQo AJo 66 KQs A9s ATo KJs KTs A8s KQo A9o A7s KJo QJs A5s 55 ' +
    'A6s KTo A8o K9s QTs A7o A4s QJo K8s A3s A6o K9o K7s A5o A2s Q9s JTs A4o K6s QTo 44 Q8s K5s K8o J9s JTo A3o ' +
    'Q9o K4s K7o Q7s A2o K6o 33 T9s K3s Q8o J8s Q6s J9o Q5s K2s K5o J7s T8s K4o Q4s Q7o J8o Q6o K3o T9o 98s Q3s ' +
    'T7s K2o 22 J5s Q2s J6s Q5o J7o T8o Q4o J4s 97s T6s Q3o J3s 98o J6o T7o 96s Q2o J2s J5o 87s T5s 97o T4s 86s ' +
    'T6o J4o T3s 95s J3o 76s 87o T2s 85s 96o T5o J2o 94s 93s 86o T4o 75s 84s 65s T3o 95o 76o 92s 74s T2o 64s 83s ' +
    '85o 54s 94o 75o 82s 93o 65o 73s 53s 63s 84o 92o 43s 74o 54o 72s 64o 83o 52s 62s 82o 42s 73o 53o 63o 32s 43o ' +
    '62o 72o 52o 42o 32o'
  ).split(' ');
  var CLASS_PCT = {};
  (function () {
    var cum = 0;
    PREFLOP_ORDER.forEach(function (h) {
      cum += h.length === 2 ? 6 : h[2] === 's' ? 4 : 12;
      CLASS_PCT[h] = cum / 1326;
    });
  })();

  function handClass(hole) {
    var a = RANKS.indexOf(hole[0][0]), b = RANKS.indexOf(hole[1][0]);
    var hi = Math.max(a, b), lo = Math.min(a, b);
    if (hi === lo) return RANKS[hi] + RANKS[lo];
    return RANKS[hi] + RANKS[lo] + (hole[0][1] === hole[1][1] ? 's' : 'o');
  }
  function handPercent(hole) { return CLASS_PCT[handClass(hole)]; }

  /* ---------- game state ---------- */
  function fill(n, v) { var a = []; for (var i = 0; i < n; i++) a.push(v); return a; }
  function put(s, seat, amt) {
    var pay = Math.min(amt, s.stacks[seat]);
    s.stacks[seat] -= pay; s.bets[seat] += pay; s.committed[seat] += pay; s.pot += pay;
    if (s.stacks[seat] === 0) s.allIn[seat] = true;
    return pay;
  }
  function liveCount(s) { var c = 0; for (var i = 0; i < s.n; i++) if (!s.folded[i]) c++; return c; }
  function ableCount(s) { var c = 0; for (var i = 0; i < s.n; i++) if (!s.folded[i] && !s.allIn[i]) c++; return c; }
  function needsAction(s, i, able) {
    if (s.folded[i] || s.allIn[i]) return false;
    if (able <= 1) return s.bets[i] < s.currentBet; // nobody left to bet against
    return s.bets[i] < s.currentBet || !s.acted[i];
  }
  function nextToAct(s, from) {
    var able = ableCount(s);
    for (var k = 1; k <= s.n; k++) {
      var i = (from + k) % s.n;
      if (needsAction(s, i, able)) return i;
    }
    return -1;
  }

  function newHand(opts) {
    opts = opts || {};
    var n = opts.seats || 4, sb = opts.sb || 1, bb = opts.bb || 2;
    var rng = opts.rng || Math.random;
    var stacks = opts.stacks ? opts.stacks.slice() : fill(n, opts.stack || 200);
    var s = {
      n: n, button: opts.button || 0, sb: sb, bb: bb, handNo: opts.handNo || 0, samples: opts.samples,
      startStacks: stacks.slice(), stacks: stacks,
      deck: opts.deck ? opts.deck.slice() : shuffle(newDeck(), rng), deckPos: 0,
      hole: [], board: [], street: 'preflop',
      bets: fill(n, 0), committed: fill(n, 0), folded: fill(n, false), allIn: fill(n, false),
      acted: fill(n, false), reopen: fill(n, true),
      pot: 0, currentBet: 0, lastRaise: bb, toAct: -1, preflopRaises: 0, history: [], settled: false, result: null
    };
    var i;
    for (i = 0; i < n; i++) s.hole.push([]);
    for (var r = 0; r < 2; r++) for (i = 1; i <= n; i++) s.hole[(s.button + i) % n].push(s.deck[s.deckPos++]);
    var sbSeat = n === 2 ? s.button : (s.button + 1) % n, bbSeat = (sbSeat + 1) % n;
    put(s, sbSeat, sb); put(s, bbSeat, bb);
    s.currentBet = Math.max(s.bets[sbSeat], s.bets[bbSeat]);
    s.sbSeat = sbSeat; s.bbSeat = bbSeat;
    s.toAct = nextToAct(s, bbSeat);
    return s;
  }

  function legalActions(s, seat) {
    var toCall = Math.max(0, s.currentBet - s.bets[seat]);
    var maxTotal = s.bets[seat] + s.stacks[seat];
    var others = 0;
    for (var i = 0; i < s.n; i++) if (i !== seat && !s.folded[i] && !s.allIn[i]) others++;
    var minTotal = s.currentBet === 0 ? s.bb : s.currentBet + s.lastRaise;
    var canRaise = s.toAct === seat && s.reopen[seat] && others > 0 && maxTotal > s.currentBet;
    if (minTotal > maxTotal) minTotal = maxTotal; // only an all-in is possible
    return {
      canFold: toCall > 0, canCheck: toCall === 0,
      canCall: toCall > 0, callAmount: Math.min(toCall, s.stacks[seat]), toCall: toCall,
      canRaise: canRaise, isBet: s.currentBet === 0, minTotal: minTotal, maxTotal: maxTotal
    };
  }

  function applyAction(s, seat, a) {
    if (s.toAct !== seat) throw new Error('Seat ' + seat + ' is not to act');
    var L = legalActions(s, seat), type = a.type, i, entry;
    if (type === 'fold') {
      if (!L.canFold) throw new Error('Cannot fold when checking is free');
      s.folded[seat] = true;
    } else if (type === 'check') {
      if (!L.canCheck) throw new Error('Cannot check facing a bet');
    } else if (type === 'call') {
      if (!L.canCall) throw new Error('Nothing to call');
      put(s, seat, L.callAmount);
    } else if (type === 'bet' || type === 'raise') {
      var amt = a.amount;
      if (!L.canRaise) throw new Error('Cannot raise here');
      if (!isFinite(amt) || amt !== Math.floor(amt)) throw new Error('Bet amount must be a whole number');
      if (amt > L.maxTotal || amt <= s.currentBet) throw new Error('Bet amount out of range');
      if (amt < L.minTotal) throw new Error('Below the minimum raise');
      var inc = amt - s.currentBet;
      put(s, seat, amt - s.bets[seat]);
      type = s.currentBet === 0 ? 'bet' : 'raise';
      if (inc >= s.lastRaise) { // a full raise reopens the betting
        s.lastRaise = inc;
        for (i = 0; i < s.n; i++) if (i !== seat) { s.reopen[i] = true; s.acted[i] = false; }
      }
      s.currentBet = amt;
      if (s.street === 'preflop') s.preflopRaises++;
    } else {
      throw new Error('Unknown action ' + type);
    }
    s.acted[seat] = true;
    s.reopen[seat] = false;
    entry = { seat: seat, type: type, amount: s.bets[seat], street: s.street, allIn: s.allIn[seat] };
    s.history.push(entry);
    s.toAct = liveCount(s) <= 1 ? -1 : nextToAct(s, seat);
    return entry;
  }

  function isHandOver(s) { return liveCount(s) <= 1 || s.street === 'showdown' || s.street === 'done'; }
  function isBettingRoundOver(s) {
    if (isHandOver(s)) return false;
    var able = ableCount(s);
    for (var i = 0; i < s.n; i++) if (needsAction(s, i, able)) return false;
    return true;
  }

  function nextStreet(s) {
    if (isHandOver(s)) return s;
    if (!isBettingRoundOver(s)) throw new Error('Betting round is not over');
    var i, order = { preflop: ['flop', 3], flop: ['turn', 1], turn: ['river', 1] };
    if (s.street === 'river') { s.street = 'showdown'; s.toAct = -1; return s; }
    var nx = order[s.street];
    for (i = 0; i < nx[1]; i++) s.board.push(s.deck[s.deckPos++]);
    s.street = nx[0];
    for (i = 0; i < s.n; i++) { s.bets[i] = 0; s.acted[i] = false; s.reopen[i] = true; }
    s.currentBet = 0; s.lastRaise = s.bb;
    s.toAct = nextToAct(s, s.button);
    return s;
  }

  function settle(s) {
    var n = s.n, i, k, payouts = fill(n, 0), pots = [], hands = {}, potTotal = s.pot;
    var live = [];
    for (i = 0; i < n; i++) if (!s.folded[i]) live.push(i);
    var showdown = live.length > 1;
    if (!showdown) {
      payouts[live[0]] = s.pot;
      pots.push({ amount: s.pot, winners: [live[0]], eligible: live.slice() });
    } else {
      if (s.board.length < 5) throw new Error('Board is not complete');
      live.forEach(function (seat) { hands[seat] = evaluate7(s.hole[seat].concat(s.board)); });
      var levels = [];
      live.forEach(function (seat) { if (levels.indexOf(s.committed[seat]) < 0) levels.push(s.committed[seat]); });
      levels.sort(function (a, b) { return a - b; });
      var prev = 0;
      levels.forEach(function (lv) {
        var amount = 0;
        for (i = 0; i < n; i++) amount += Math.max(0, Math.min(s.committed[i], lv) - prev);
        prev = lv;
        if (amount > 0) pots.push({ amount: amount, eligible: live.filter(function (x) { return s.committed[x] >= lv; }) });
      });
      var extra = 0;
      for (i = 0; i < n; i++) extra += Math.max(0, s.committed[i] - prev);
      if (extra > 0) pots[pots.length - 1].amount += extra;
      pots.forEach(function (p) {
        var best = -1;
        p.eligible.forEach(function (x) { if (hands[x].rank > best) best = hands[x].rank; });
        var tied = p.eligible.filter(function (x) { return hands[x].rank === best; });
        var ordered = [];
        for (k = 1; k <= n; k++) { var seat = (s.button + k) % n; if (tied.indexOf(seat) >= 0) ordered.push(seat); }
        var share = Math.floor(p.amount / ordered.length), odd = p.amount - share * ordered.length;
        ordered.forEach(function (seat, idx) { payouts[seat] += share + (idx < odd ? 1 : 0); });
        p.winners = ordered;
      });
    }
    var net = [];
    for (i = 0; i < n; i++) { s.stacks[i] += payouts[i]; net.push(payouts[i] - s.committed[i]); }
    s.pot = 0; s.street = 'done'; s.settled = true;
    s.result = { showdown: showdown, payouts: payouts, net: net, pots: pots, winners: pots[0].winners.slice(), hands: hands, potTotal: potTotal };
    return s.result;
  }

  /* ---------- bots: GTO-style mixing, not a solver ---------- */
  function sanitize(d, L, s, seat) {
    var t = d.type;
    if (t === 'bet' || t === 'raise') {
      if (!L.canRaise) t = L.canCheck ? 'check' : 'call';
      else {
        var amt = Math.round(d.amount);
        if (!(amt >= L.minTotal)) amt = L.minTotal;
        if (amt > L.maxTotal) amt = L.maxTotal;
        return { type: s.currentBet === 0 ? 'bet' : 'raise', amount: amt };
      }
    }
    if (t === 'fold' && !L.canFold) t = 'check';
    if (t === 'call' && !L.canCall) t = 'check';
    if (t === 'check' && !L.canCheck) t = L.canCall ? 'call' : 'fold';
    return { type: t };
  }

  function preflopDecide(s, seat, L, rng) {
    var pct = handPercent(s.hole[seat]), bb = s.bb;
    var pos = (seat - s.button + s.n) % s.n; // 0 button, 1 small blind, 2 big blind, 3 under the gun
    var raises = s.preflopRaises, stack = s.stacks[seat] + s.bets[seat];
    var calls = 0;
    s.history.forEach(function (h) { if (h.street === 'preflop' && h.type === 'call') calls++; });
    var mix = function (limit) { return pct <= limit - 0.03 ? 1 : pct <= limit ? 0.75 : pct <= limit + 0.03 ? 0.25 : 0; };
    var chance = function (limit) { return rng() < mix(limit); };
    var raiseTo = function (amt) { return { type: 'raise', amount: amt >= stack * 0.45 ? L.maxTotal : amt }; };

    if (raises === 0) {
      var openPct = pos === 0 ? 0.45 : pos === 1 ? 0.40 : 0.28;
      if (calls > 0) { // limpers: isolate with the stronger hands, otherwise take a cheap flop or let it go
        if (chance(pos === 2 ? 0.15 : openPct * 0.6)) return raiseTo(bb * (3 + calls));
        if (L.canCheck) return { type: 'check' };
        return chance(0.35) ? { type: 'call' } : { type: 'fold' };
      }
      if (pos === 2) return { type: 'check' };
      return chance(openPct) ? raiseTo(Math.round(2.5 * bb)) : { type: 'fold' };
    }
    if (raises === 1) {
      var defend = pos === 2 ? 0.45 : pos === 1 ? 0.14 : 0.2;
      var three = pos === 2 ? 0.10 : 0.07;
      if (calls > 0) defend *= 0.7; // squeezed or multiway: tighter
      if (chance(three)) return raiseTo(3 * s.currentBet);
      return chance(defend) ? { type: 'call' } : { type: 'fold' };
    }
    if (raises === 2) {
      if (chance(0.04)) return raiseTo(Math.round(2.3 * s.currentBet));
      return chance(0.12) ? { type: 'call' } : { type: 'fold' };
    }
    if (chance(0.02)) return { type: 'raise', amount: L.maxTotal };
    return chance(0.04) ? { type: 'call' } : { type: 'fold' };
  }

  function postflopDecide(s, seat, L, rng) {
    var opp = 0, i;
    for (i = 0; i < s.n; i++) if (i !== seat && !s.folded[i]) opp++;
    var pot = s.pot, eq = equity(s.hole[seat], s.board, opp, s.samples || 250, rng);
    var fair = 1 / (opp + 1);
    var valueMin = 0.5 + 0.2 / opp;
    var sizeBet = function (frac) {
      var total = s.bets[seat] + Math.max(s.bb, Math.round(frac * pot));
      if (total >= L.maxTotal * 0.7) total = L.maxTotal; // short stack behind: just shove
      return { type: 'bet', amount: total };
    };
    var r = rng();
    if (L.toCall === 0) {
      if (!L.canRaise) return { type: 'check' };
      if (eq >= valueMin) {
        if (r >= 0.85) return { type: 'check' }; // slow-play now and then
        var strong = eq >= valueMin + 0.2;
        return sizeBet(strong ? (rng() < 0.5 ? 1 : 0.66) : (rng() < 0.5 ? 0.66 : 0.33));
      }
      if (eq >= fair * 0.8) return r < 0.15 ? sizeBet(0.33) : { type: 'check' };
      // Bluff share of the betting range ~ b / (p + 2b). With value bets at ~30% of hands and
      // weak hands at ~40%, that gives the bluff frequency among weak hands for the chosen size.
      var frac = [0.33, 0.66, 1][Math.floor(rng() * 3)];
      var share = frac / (1 + 2 * frac);
      var prob = (0.30 * share / (1 - share) / 0.40) * (opp === 1 ? 1 : opp === 2 ? 0.5 : 0.3);
      return r < prob ? sizeBet(frac) : { type: 'check' };
    }
    var odds = L.callAmount / (pot + L.callAmount);
    var ratio = L.callAmount / Math.max(1, pot - L.callAmount);
    var adj = eq * (1 - 0.1 * Math.min(1, ratio)); // a bettor's range is stronger than a random hand
    var raiseTo = function () {
      var total = s.currentBet + Math.round(0.75 * (pot + L.callAmount));
      if (total >= L.maxTotal * 0.7) total = L.maxTotal;
      return { type: 'raise', amount: total };
    };
    if (L.canRaise) {
      if (adj >= valueMin + 0.12 && r < 0.4) return raiseTo();
      if (adj < odds && adj > odds - 0.12 && r > 0.93) return raiseTo(); // the odd bluff-raise
    }
    if (adj > odds + 0.04) return { type: 'call' };
    if (adj > odds - 0.04) return rng() < 0.5 ? { type: 'call' } : { type: 'fold' };
    return { type: 'fold' };
  }

  function botDecide(s, seat, rng) {
    var L = legalActions(s, seat);
    var d = s.street === 'preflop' ? preflopDecide(s, seat, L, rng) : postflopDecide(s, seat, L, rng);
    return sanitize(d, L, s, seat);
  }

  function playHand(s, rng) {
    for (var guard = 0; guard < 200 && !isHandOver(s); guard++) {
      if (s.toAct >= 0) applyAction(s, s.toAct, botDecide(s, s.toAct, rng));
      else nextStreet(s);
    }
    if (!isHandOver(s)) throw new Error('Hand did not finish');
    return settle(s);
  }

  return {
    newDeck: newDeck, shuffle: shuffle, mulberry32: mulberry32,
    evaluate7: evaluate7, compareHands: compareHands, equity: equity,
    handClass: handClass, handPercent: handPercent, PREFLOP_ORDER: PREFLOP_ORDER,
    newHand: newHand, legalActions: legalActions, applyAction: applyAction,
    isBettingRoundOver: isBettingRoundOver, isHandOver: isHandOver, nextStreet: nextStreet, settle: settle,
    botDecide: botDecide, playHand: playHand
  };
});
