'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../js/poker-engine.js');

const ev = (s) => E.evaluate7(s.split(' '));
const sum = (a) => a.reduce((x, y) => x + y, 0);

test('evaluator: royal flush beats four of a kind', () => {
  const royal = ev('As Ks Qs Js Ts 2d 3c');
  const quads = ev('9s 9h 9d 9c Ad 2d 3c');
  assert.equal(royal.category, 8);
  assert.equal(royal.name, 'a royal flush');
  assert.equal(quads.category, 7);
  assert.equal(E.compareHands(royal, quads), 1);
});

test('evaluator: the wheel is a straight and loses to 2-6', () => {
  const wheel = ev('As 2d 3c 4h 5s 9d Kc');
  const six = ev('2s 3d 4c 5h 6s 9d Kc');
  assert.equal(wheel.category, 4);
  assert.equal(wheel.name, 'a straight, five-high');
  assert.equal(E.compareHands(wheel, six), -1);
});

test('evaluator: a flush beats a straight', () => {
  assert.equal(E.compareHands(ev('2h 7h 9h Jh Kh 3c 4d'), ev('5s 6d 7c 8h 9s 2c 2d')), 1);
});

test('evaluator: kickers decide the same pair', () => {
  const a = ev('Ks Kd Ah 7c 4d 3s 2h');
  const b = ev('Kh Kc Qh 7d 4c 3h 2s');
  assert.equal(a.category, 1);
  assert.equal(E.compareHands(a, b), 1);
});

test('evaluator: a board that plays is a tie', () => {
  const board = ['As', 'Kd', 'Qh', 'Jc', 'Td'];
  const a = E.evaluate7(board.concat(['2c', '3d']));
  const b = E.evaluate7(board.concat(['4c', '5d']));
  assert.equal(E.compareHands(a, b), 0);
});

test('evaluator: best five of seven picks the flush over a straight', () => {
  const r = ev('4h 5h 6h 7s 8h Kh 9d'); // 4-8 hearts+..: hearts 4 5 6 8 K flush, straight 4-9
  assert.equal(r.category, 5);
  assert.equal(r.name, 'a flush, king-high');
});

test('evaluator: full house 3-over-2 beats 2-over-3', () => {
  const a = ev('Ks Kd Kh 2c 2d 7s 9h');
  const b = ev('Qs Qd 3h 3c 3d 7s 9h');
  assert.equal(a.name, 'a full house, kings full of twos');
  assert.equal(E.compareHands(a, b), 1);
  assert.equal(E.compareHands(ev('3s 3d 3h 2c 2d 7s 9h'), ev('2s 2d 2h 3c 3d 7s 9h')), 1);
});

test('evaluator: names', () => {
  assert.equal(ev('Ks Kd 7h 7c 4d 3s 2h').name, 'two pair, kings and sevens');
  assert.equal(ev('As Jd 8h 5c 4d 3s 9h').name, 'ace-high');
});

test('equity: aces beat a random hand most of the time', () => {
  const e = E.equity(['As', 'Ah'], [], 1, 2000, E.mulberry32(1));
  assert.ok(e > 0.8 && e < 0.9, String(e));
});

function noBlindsHand(opts) { return E.newHand(Object.assign({ button: 0, rng: E.mulberry32(5) }, opts)); }

test('betting: min-raise rule is enforced', () => {
  const s = noBlindsHand({}); // button 0: SB 1, BB 2, UTG (seat 3) acts first
  assert.equal(s.toAct, 3);
  E.applyAction(s, 3, { type: 'raise', amount: 6 }); // raise of 4
  const L = E.legalActions(s, 0);
  assert.equal(L.minTotal, 10);
  assert.throws(() => E.applyAction(s, 0, { type: 'raise', amount: 8 }));
  E.applyAction(s, 0, { type: 'raise', amount: 10 });
  assert.equal(E.legalActions(s, 1).minTotal, 14);
});

test('betting: an all-in below the min raise is legal and does not reopen raising', () => {
  // seat 1 (SB) has only 15 behind: make a custom short stack
  const s3 = noBlindsHand({ stacks: [200, 15, 200, 200] });
  E.applyAction(s3, 3, { type: 'raise', amount: 10 }); // increment 8, min next = 18
  E.applyAction(s3, 0, { type: 'call' });
  const L = E.legalActions(s3, 1);
  assert.equal(L.maxTotal, 15);
  assert.ok(L.canRaise);
  E.applyAction(s3, 1, { type: 'raise', amount: 15 }); // all-in for 15 total, below the min of 18
  assert.equal(s3.allIn[1], true);
  assert.equal(s3.currentBet, 15);
  assert.equal(s3.lastRaise, 8);
  // BB (seat 2) has not acted yet and may still re-raise; seat 3 already acted: call or fold only
  E.applyAction(s3, 2, { type: 'call' });
  assert.equal(s3.toAct, 3);
  assert.equal(E.legalActions(s3, 3).canRaise, false);
  assert.throws(() => E.applyAction(s3, 3, { type: 'raise', amount: 40 }));
  E.applyAction(s3, 3, { type: 'call' });
  E.applyAction(s3, 0, { type: 'call' });
  assert.equal(E.isBettingRoundOver(s3), true);
});

test('betting: a round is not over until everyone has matched or folded', () => {
  const s = noBlindsHand({});
  E.applyAction(s, 3, { type: 'call' });
  E.applyAction(s, 0, { type: 'call' });
  E.applyAction(s, 1, { type: 'call' });
  assert.equal(E.isBettingRoundOver(s), false); // BB still has the option
  assert.equal(s.toAct, 2);
  E.applyAction(s, 2, { type: 'raise', amount: 8 });
  assert.equal(E.isBettingRoundOver(s), false);
  E.applyAction(s, 3, { type: 'call' });
  E.applyAction(s, 0, { type: 'call' });
  assert.equal(E.isBettingRoundOver(s), false);
  E.applyAction(s, 1, { type: 'fold' });
  assert.equal(E.isBettingRoundOver(s), true);
  E.nextStreet(s);
  assert.equal(s.street, 'flop');
  assert.equal(s.board.length, 3);
  assert.equal(s.toAct, 2); // first live seat left of the button... seat 1 folded
});

test('betting: when three players fold the fourth wins without showdown', () => {
  const s = noBlindsHand({});
  E.applyAction(s, 3, { type: 'fold' });
  E.applyAction(s, 0, { type: 'fold' });
  E.applyAction(s, 1, { type: 'fold' });
  assert.equal(E.isHandOver(s), true);
  const r = E.settle(s);
  assert.equal(r.showdown, false);
  assert.deepEqual(r.winners, [2]);
  assert.equal(s.stacks[2], 201);
  assert.equal(s.stacks[1], 199);
});

test('settlement: a two-way split of an odd pot gives the odd chip left of the button', () => {
  const s = noBlindsHand({ button: 0 });
  s.hole = [['2c', '3d'], ['As', 'Kd'], ['Ah', 'Kc'], ['7c', '8d']];
  s.board = ['Qs', 'Jd', '9c', '4h', '2d'];
  s.street = 'showdown';
  s.folded[0] = true; s.folded[3] = true;
  // seat 0 folded after putting in 1; seats 1 and 2 put in 2 each: an odd pot of 5 split two ways
  s.committed = [1, 2, 2, 0]; s.stacks = [199, 198, 198, 200]; s.pot = 5;
  const r = E.settle(s);
  assert.deepEqual(r.winners, [1, 2]);
  assert.equal(r.payouts[1], 3); // seat 1 is first left of the button
  assert.equal(r.payouts[2], 2);
  assert.equal(sum(s.stacks), 800);
});

test('settlement: uncalled excess returns and side pots are paid', () => {
  const s = noBlindsHand({ stacks: [200, 200, 30, 200], button: 0 });
  s.hole = [['2c', '3d'], ['Ah', 'Ad'], ['Ks', 'Kd'], ['7c', '8d']];
  s.board = ['Qs', 'Jd', '9c', '4h', '2s'];
  s.street = 'showdown';
  s.folded[0] = true; s.folded[3] = true;
  s.committed = [0, 100, 30, 0]; s.stacks = [200, 100, 0, 200]; s.pot = 130; s.allIn[2] = true;
  const r = E.settle(s);
  assert.equal(r.payouts[1], 130); // main pot 60 plus 70 uncalled
  assert.equal(sum(s.stacks), 630);
});

test('settlement: chips are conserved across a full simulated hand', () => {
  const rng = E.mulberry32(99);
  for (let h = 0; h < 40; h++) {
    const s = E.newHand({ button: h % 4, rng, samples: 40 });
    const total = sum(s.stacks) + s.pot;
    for (let g = 0; g < 100 && !E.isHandOver(s); g++) {
      if (s.toAct >= 0) E.applyAction(s, s.toAct, E.botDecide(s, s.toAct, rng));
      else E.nextStreet(s);
      assert.equal(sum(s.stacks) + s.pot, total);
    }
    E.settle(s);
    assert.equal(sum(s.stacks) + s.pot, total);
  }
});

test('bots: never return an illegal action over 300 seeded decisions', () => {
  const rng = E.mulberry32(2024);
  let decisions = 0;
  while (decisions < 300) {
    const s = E.newHand({ button: Math.floor(rng() * 4), rng, samples: 30 });
    while (!E.isHandOver(s) && decisions < 300) {
      if (s.toAct < 0) { E.nextStreet(s); continue; }
      const seat = s.toAct;
      const d = E.botDecide(s, seat, rng);
      decisions++;
      assert.doesNotThrow(() => E.applyAction(s, seat, d), JSON.stringify(d));
    }
  }
});

test('bots: the button always opens AA and always folds 72o', () => {
  const rng = E.mulberry32(7);
  for (let i = 0; i < 100; i++) {
    for (const [hole, expect] of [[['As', 'Ah'], 'raise'], [['7s', '2h'], 'fold']]) {
      const s = E.newHand({ button: 0, rng });
      E.applyAction(s, 3, { type: 'fold' }); // under the gun folds, the button is next
      assert.equal(s.toAct, 0);
      s.hole[0] = hole;
      const d = E.botDecide(s, 0, rng);
      assert.equal(d.type, expect);
      if (expect === 'raise') assert.equal(d.amount, 5);
    }
  }
});

test('bots: a 100-hand four-bot simulation conserves chips and is fast', () => {
  const rng = E.mulberry32(31337);
  const t0 = Date.now();
  for (let h = 0; h < 100; h++) {
    const s = E.newHand({ button: h % 4, rng });
    E.playHand(s, rng);
    assert.equal(sum(s.stacks), 800, 'hand ' + h);
    assert.equal(s.pot, 0);
  }
  assert.ok(Date.now() - t0 < 10000, 'took ' + (Date.now() - t0) + ' ms');
});
