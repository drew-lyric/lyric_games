(function (root) {
  'use strict';
  const LD = root.LyricDefense;
  LD.runTests = function () {
    const results = [];
    const assert = function (value, message) { if (!value) throw new Error(message || 'Assertion failed'); };
    const near = function (actual, expected, message) { assert(Math.abs(actual - expected) < 0.08, (message || 'Unexpected value') + ': ' + actual + ' vs ' + expected); };
    const test = function (name, fn) { try { fn(); results.push({ name: name, ok: true }); } catch (error) { results.push({ name: name, ok: false, error: error.message, stack: error.stack }); } };
    const advance = function (game, seconds, observe) { for (let left = seconds; left > 0.00001; left -= LD.Config.step) { game.step(Math.min(left, LD.Config.step)); if (observe) observe(); } };
    const make = function () {
      const game = new LD.Game({ clueProvider: new LD.ClueProvider({ seed: 11, storage: null }), seed: 29, mode: 'sandbox' });
      game.state.naturalEnabled = false; game.state.botEnabled = false;
      advance(game, 3.1); return game;
    };
    const command = function (game, type, payload, id) { return game.command(id || 'p1', { type: type, payload: payload || {} }); };
    const fund = function (game, amount) { const result = command(game, 'debug', { action: 'grant', target: 'p1', amount: amount || 20 }); assert(result.ok, result.reason); };
    const enemy = function (game, x, y, type, target) {
      const player = game.state.players[target === 'p2' ? 1 : 0];
      assert(command(game, 'debug', { action: 'spawn', target: target || 'p1', enemyType: type || 'basic' }).ok);
      const entry = player.enemies[player.enemies.length - 1]; entry.x = x; entry.y = y; return entry;
    };
    test('Countdown gates gameplay and starts with an empty wallet', function () {
      const game = new LD.Game({ clueProvider: new LD.ClueProvider({ seed: 1, storage: null }), seed: 1, mode: 'bot' });
      assert(game.state.phase === 'countdown'); assert(!command(game, 'skip').ok);
      assert(Object.values(game.state.players[0].wallet).every((amount) => amount === 0));
      advance(game, 3.1); assert(game.state.phase === 'playing');
    });
    test('Answers reward once; incorrect and stale answers do not pay', function () {
      const game = make(), player = game.state.players[0], clue = player.clue;
      assert(!command(game, 'answer', { clueId: clue.id, answer: 'ZZZZZZZZZZZZZZZZZZZZ' }).ok);
      assert(command(game, 'answer', { clueId: clue.id, answer: ' ' + clue.answer.toLowerCase() + ' ' }).ok);
      assert(player.wallet['igg' + clue.tier] === 1); assert(player.clue.id !== clue.id);
      assert(!command(game, 'answer', { clueId: clue.id, answer: clue.answer }).ok);
      assert(Object.values(player.wallet).reduce((a, b) => a + b, 0) === 1);
    });
    test('Trivia retains numeric answers and pays aliases once without accepting partial text', function () {
      let count = 0;
      const provider = { next: function (tier) { return { id: 'numeric-' + (++count), text: 'How many?', answer: '42', acceptedAnswers: ['forty-two'], tier: tier, kind: 'trivia' }; } };
      const game = new LD.Game({ clueProvider: provider, seed: 7, mode: 'sandbox' }); advance(game, 3.1);
      const player = game.state.players[0], clue = player.clue;
      assert(clue.kind === 'trivia' && clue.answer === '42');
      assert(!command(game, 'answer', { clueId: clue.id, answer: '2' }).ok);
      assert(!command(game, 'answer', { clueId: clue.id, answer: '' }).ok);
      assert(command(game, 'answer', { clueId: clue.id, answer: ' 42 ' }).ok);
      assert(!command(game, 'answer', { clueId: clue.id, answer: 'forty-two' }).ok);
      assert(player.wallet['igg' + clue.tier] === 1 && player.stats.solved === 1);
      const next = player.clue;
      assert(command(game, 'answer', { clueId: next.id, answer: ' FORTY TWO! ' }).ok);
      assert(player.stats.solved === 2);
    });
    test('Trivia preserves multiword display answers and exact accent-insensitive aliases', function () {
      let count = 0;
      const provider = { next: function (tier) { return { id: 'text-' + (++count), text: 'Name the country.', answer: 'United States', acceptedAnswers: ['USA', 'United States of America', 'États-Unis'], tier: tier, kind: 'trivia' }; } };
      const game = new LD.Game({ clueProvider: provider, seed: 7, mode: 'sandbox' }); advance(game, 3.1);
      const player = game.state.players[0]; assert(player.clue.answer === 'United States');
      assert(!command(game, 'answer', { clueId: player.clue.id, answer: 'United' }).ok);
      assert(command(game, 'answer', { clueId: player.clue.id, answer: 'u.s.a.' }).ok);
      assert(command(game, 'answer', { clueId: player.clue.id, answer: 'etats unis' }).ok);
      assert(command(game, 'answer', { clueId: player.clue.id, answer: 'united states' }).ok);
      assert(player.stats.solved === 3);
    });
    test('A loaded trivia provider is the default while explicit legacy providers still work', function () {
      if (typeof LD.TriviaProvider !== 'function') return;
      const trivia = new LD.Game({ seed: 12, mode: 'sandbox' });
      assert(trivia.state.players.every((player) => player.clue.kind === 'trivia'));
      const legacy = make(); assert(legacy.state.players[0].clue.kind !== 'trivia');
      const clue = legacy.state.players[0].clue;
      assert(command(legacy, 'answer', { clueId: clue.id, answer: clue.answer.toLowerCase() }).ok);
    });
    test('Skips consume charges, pay nothing, and recharge', function () {
      const game = make(), player = game.state.players[0], old = player.clue.id;
      assert(command(game, 'skip').ok); assert(player.skipCharges === 1 && player.clue.id !== old);
      assert(command(game, 'skip').ok); assert(!command(game, 'skip').ok);
      advance(game, 30.1); assert(player.skipCharges === 1);
      assert(Object.values(player.wallet).every((amount) => amount === 0));
    });
    test('Skip recharge upgrade works through the shop', function () {
      const game = make(), player = game.state.players[0]; fund(game);
      assert(command(game, 'buy', { itemId: 'skip-recharge' }).ok); command(game, 'skip');
      advance(game, 15.1); assert(player.skipCharges === 2);
    });
    test('Purchased skips have no holding cap, cost one IgG1 each, and do not auto-accrue above two', function () {
      const game = make(), player = game.state.players[0];
      assert(!command(game, 'buy', { itemId: 'buy-skip' }).ok);
      assert(player.skipCharges === 2 && player.wallet.igg1 === 0);
      fund(game, 30);
      for (let i = 0; i < 30; i++) assert(command(game, 'buy', { itemId: 'buy-skip' }).ok);
      assert(player.skipCharges === 32 && player.wallet.igg1 === 0);
      assert(!command(game, 'buy', { itemId: 'buy-skip' }).ok && player.skipCharges === 32);
      advance(game, 65); assert(player.skipCharges === 32 && player.skipProgress === 0);
      for (let i = 0; i < 30; i++) assert(command(game, 'skip').ok);
      assert(player.skipCharges === 2); advance(game, 31); assert(player.skipCharges === 2 && player.skipProgress === 0);
      assert(command(game, 'skip').ok); advance(game, 29.8); assert(player.skipCharges === 1);
      advance(game, .3); assert(player.skipCharges === 2 && player.skipProgress === 0);
      assert(player.stats.solved === 0);
    });
    test('Buying a skip below the automatic ceiling preserves progress; reaching two clears it', function () {
      const game = make(), player = game.state.players[0]; fund(game, 2);
      command(game, 'skip'); command(game, 'skip'); advance(game, 12);
      const progress = player.skipProgress;
      assert(command(game, 'buy', { itemId: 'buy-skip' }).ok && player.skipCharges === 1);
      near(player.skipProgress, progress);
      assert(command(game, 'buy', { itemId: 'buy-skip' }).ok && player.skipCharges === 2 && player.skipProgress === 0);
    });
    test('IVIG is manual and consumes exactly one recipe', function () {
      const game = make(), player = game.state.players[0];
      Object.entries(LD.Config.ivigRecipe).forEach(([key, value]) => { player.wallet[key] = value * 2; });
      advance(game, 1); assert(player.wallet.ivig === 0);
      assert(command(game, 'craft').ok);
      Object.entries(LD.Config.ivigRecipe).forEach(([key, value]) => assert(player.wallet[key] === value));
      assert(player.wallet.ivig === 1); assert(command(game, 'craft').ok); assert(!command(game, 'craft').ok);
    });
    test('Purchases are atomic, prerequisite-gated, and upgrades cannot repeat', function () {
      const game = make(), player = game.state.players[0];
      assert(!command(game, 'buy', { itemId: 'ethanol-1' }).ok); fund(game);
      const before = JSON.stringify(player.wallet);
      assert(!command(game, 'buy', { itemId: 'ethanol-2' }).ok); assert(JSON.stringify(player.wallet) === before);
      assert(command(game, 'buy', { itemId: 'ethanol-1' }).ok); assert(!command(game, 'buy', { itemId: 'ethanol-1' }).ok);
      assert(command(game, 'buy', { itemId: 'ethanol-2' }).ok);
      assert(!command(game, 'buy', { itemId: 'not-an-item' }).ok);
    });
    test('Independent B-cell components produce their matching currencies', function () {
      const game = make(), player = game.state.players[0]; fund(game);
      [1, 2, 3, 4, 1].forEach((tier) => assert(command(game, 'buy', { itemId: 'culture-' + tier }).ok));
      const before = Object.assign({}, player.wallet); advance(game, 18.1);
      assert(player.wallet.igg1 === before.igg1 + 2);
      [2, 3, 4].forEach((tier) => assert(player.wallet['igg' + tier] === before['igg' + tier] + 1));
      assert(player.wallet.ivig === before.ivig);
    });
    test('Offensive purchases send the correct enemy to the opponent', function () {
      const game = make(); fund(game);
      assert(command(game, 'buy', { itemId: 'send-fast' }).ok);
      assert(game.state.players[0].enemies.length === 0);
      const sent = game.state.players[1].enemies[0]; assert(sent.type === 'fast' && sent.x < 40);
    });
    test('Invalid wall placement does not consume cooldown', function () {
      const game = make(); enemy(game, 200, 180);
      assert(!command(game, 'cast', { x: 200 - LD.Config.radius, y: 180 }).ok);
      assert(game.state.players[0].laserCooldown === 0 && game.state.players[0].walls.length === 0);
      assert(!command(game, 'cast', { x: NaN, y: 180 }).ok);
    });
    test('Base polymer encloses without damage and enemies break out', function () {
      const game = make(), player = game.state.players[0], entry = enemy(game, 200, 180);
      assert(command(game, 'cast', { x: 200, y: 180 }).ok);
      advance(game, 8); assert(entry.health === 12 && player.walls.length === 1);
      assert(Math.hypot(entry.x - 200, entry.y - 180) < LD.Config.radius);
      advance(game, 7); assert(player.walls.length === 0 && entry.health === 12);
      assert(entry.x > 200);
    });
    test('Free enemies detour around physical circles', function () {
      const game = make(), entry = enemy(game, 100, 180);
      assert(command(game, 'cast', { x: 220, y: 180 }).ok);
      let excursion = 0;
      advance(game, 12, () => { excursion = Math.max(excursion, Math.abs(entry.y - 180)); });
      assert(excursion > LD.Config.radius, 'Enemy did not detour: ' + excursion); assert(entry.health === 12);
    });
    test('An unattacked wall expires at its lifetime', function () {
      const game = make(); assert(command(game, 'cast', { x: 200, y: 180 }).ok);
      advance(game, 14.2); assert(game.state.players[0].walls.length === 0);
    });
    test('Coating upgrades snapshot only into newly cast circles', function () {
      const game = make(), player = game.state.players[0]; fund(game);
      assert(command(game, 'cast', { x: 160, y: 100 }).ok);
      command(game, 'buy', { itemId: 'ethanol-1' }); advance(game, 1.3);
      assert(command(game, 'cast', { x: 340, y: 100 }).ok);
      assert(player.walls[0].dps === 0 && player.walls[1].dps === 2);
      command(game, 'buy', { itemId: 'ethanol-2' });
      assert(player.walls[1].dps === 2);
    });
    test('Coated interiors damage enemies without overlapping stacks', function () {
      const game = make(), player = game.state.players[0]; fund(game);
      command(game, 'buy', { itemId: 'ethanol-1' }); const entry = enemy(game, 200, 180);
      assert(command(game, 'cast', { x: 200, y: 180 }).ok); advance(game, 1.3);
      assert(command(game, 'cast', { x: 200 + LD.Config.radius / 2, y: 180 }).ok);
      const before = entry.health; advance(game, 1); near(entry.health, before - 2, 'Coatings stacked');
      advance(game, 5); assert(!player.enemies.some((value) => value.id === entry.id));
    });
    test('Removing one overlapping wall preserves the other barrier', function () {
      const game = make(), player = game.state.players[0];
      assert(command(game, 'cast', { x: 230, y: 180 }).ok); advance(game, 1.3);
      assert(command(game, 'cast', { x: 250, y: 180 }).ok);
      const entry = enemy(game, 240, 180); player.walls[0].health = 0;
      advance(game, 2); assert(player.walls.length === 1);
      assert(Math.hypot(entry.x - 250, entry.y - 180) < LD.Config.radius, 'Remaining wall leaked');
    });
    test('A breaking coated wall applies equal damage during its final tick', function () {
      const game = make(), player = game.state.players[0]; fund(game);
      command(game, 'buy', { itemId: 'ethanol-1' }); command(game, 'cast', { x: 200, y: 180 });
      const contactX = 200 + LD.Config.radius - LD.Config.wallThickness / 2 - LD.Enemies.basic.radius;
      const first = enemy(game, contactX, 180), second = enemy(game, contactX, 180);
      player.walls[0].health = 0.01; advance(game, LD.Config.step);
      near(first.health, second.health); assert(first.health < 12 && player.walls.length === 0);
    });
    test('Larger future enemies receive navigation with their body clearance', function () {
      LD.Enemies.largeTest = Object.assign({}, LD.Enemies.basic, { id: 'largeTest', radius: 20, speed: 22 });
      try {
        const game = make(), entry = enemy(game, 100, 180, 'largeTest');
        command(game, 'cast', { x: 240, y: 180 }); let excursion = 0;
        advance(game, 13, () => { excursion = Math.max(excursion, Math.abs(entry.y - 180)); });
        assert(excursion > LD.Config.radius + entry.radius && entry.health === 12 && entry.x > 240, 'Large body got stuck or cut through a wall');
      } finally { delete LD.Enemies.largeTest; }
    });
    test('IVIG sterilization removes enemies without reversing contamination', function () {
      const game = make(), player = game.state.players[0]; fund(game);
      enemy(game, 200, 100); enemy(game, 300, 200); player.contamination = 45;
      assert(command(game, 'buy', { itemId: 'sterilize' }).ok);
      assert(player.enemies.length === 0 && player.contamination === 45);
    });
    test('Breaches clamp contamination, end once, and reject later gameplay', function () {
      const game = make(), player = game.state.players[0]; player.contamination = 99;
      enemy(game, LD.Config.cultureX + 1, 180); advance(game, 0.1);
      assert(player.contamination === 100 && game.state.phase === 'ended' && game.state.winner === 'p2');
      assert(!command(game, 'skip').ok);
      const endEvents = game.drainEvents().filter((event) => event.type === 'end');
      assert(endEvents.length === 1); advance(game, 2); assert(!game.drainEvents().some((event) => event.type === 'end'));
    });
    test('Same-tick losses are a draw', function () {
      const game = make(); game.state.players.forEach((player) => { player.contamination = 99; });
      enemy(game, LD.Config.cultureX + 1, 180, 'basic', 'p1');
      enemy(game, LD.Config.cultureX + 1, 180, 'basic', 'p2'); advance(game, 0.1);
      assert(game.state.phase === 'ended' && (game.state.winner === 'draw' || game.state.winner === null));
    });
    test('Natural waves are equivalent and pressure increases', function () {
      const game = make(); game.state.naturalEnabled = true; advance(game, 12.1);
      const [a, b] = game.state.players.map((player) => player.enemies[0]);
      assert(a && b && a.type === b.type); near(a.x, b.x); near(a.y, b.y); near(a.speed, b.speed);
      assert(LD.Config.naturalInterval(300) < LD.Config.naturalInterval(0));
      assert(LD.Config.naturalSpeed(300) > LD.Config.naturalSpeed(0));
    });
    test('Sandbox commands cannot bypass rules in bot matches', function () {
      const game = new LD.Game({ clueProvider: new LD.ClueProvider({ storage: null }), seed: 1, mode: 'bot' });
      assert(!command(game, 'debug', { action: 'grant', amount: 100, target: 'p1' }).ok);
    });
    test('Opponent clues do not consume human provider history', function () {
      let humanCount = 0, opponentCount = 0;
      const human = { next: (tier) => ({ id: 'human-' + (++humanCount), text: 'Animal that says meow', answer: 'CAT', tier: tier }) };
      const opponent = { next: (tier) => ({ id: 'opponent-' + (++opponentCount), text: 'Frozen water', answer: 'ICE', tier: tier }) };
      const game = new LD.Game({ clueProvider: human, opponentClueProvider: opponent, mode: 'bot', seed: 1 });
      advance(game, 3.1);
      assert(command(game, 'answer', { clueId: game.state.players[1].clue.id, answer: 'ICE' }, 'p2').ok);
      assert(humanCount === 1 && opponentCount === 2);
    });
    test('Local transport pauses and isolates render snapshots', function () {
      const game = make(), transport = new LD.LocalTransport(game);
      const before = game.state.time; assert(transport.send('p1', { type: 'pause' }).ok); transport.step(1);
      near(game.state.time, before); assert(game.state.phase === 'paused');
      transport.getSnapshot().players[0].wallet.igg1 = 900;
      assert(game.state.players[0].wallet.igg1 === 0);
      assert(transport.send('p1', { type: 'resume' }).ok); transport.step(0.1); assert(game.state.time > before);
    });
    test('Disposed transports drop pending commands', function () {
      const game = make(), transport = new LD.LocalTransport(game, { latencyMs: 100 });
      const clue = game.state.players[0].clue;
      transport.send('p1', { type: 'answer', payload: { clueId: clue.id, answer: clue.answer } });
      transport.dispose(); transport.step(1);
      assert(game.state.players[0].wallet['igg' + clue.tier] === 0);
      assert(!transport.send('p1', { type: 'skip' }).ok);
    });
    test('Bot uses ordinary commands and affordable shop purchases', function () {
      const game = make(); game.state.botEnabled = true;
      const transport = new LD.LocalTransport(game), bot = new LD.Bot(game, transport, { seed: 88 }), issued = [];
      const original = transport.send.bind(transport);
      transport.send = function (id, cmd) { issued.push(cmd.type); return original(id, cmd); };
      for (let i = 0; i < 180 * 30; i++) { bot.step(LD.Config.step); transport.step(LD.Config.step); }
      assert(game.state.players[1].stats.solved >= 3); assert(!issued.includes('debug'));
      assert(Object.values(game.state.players[1].wallet).every((amount) => amount >= 0));
      assert(game.state.players[1].owned['ethanol-1']);
    });
    test('Bot submits the canonical trivia display answer through ordinary commands', function () {
      let count = 0;
      const provider = { next: function (tier) { return { id: 'bot-trivia-' + (++count), text: 'Which mission?', answer: 'Apollo 11', acceptedAnswers: ['Apollo XI'], kind: 'trivia', tier: tier }; } };
      const game = new LD.Game({ clueProvider: provider, seed: 2, mode: 'bot' }); game.state.naturalEnabled = false; advance(game, 3.1);
      const transport = new LD.LocalTransport(game), bot = new LD.Bot(game, transport, { seed: 2 }), answers = [];
      const original = transport.send.bind(transport);
      transport.send = function (id, cmd) { if (cmd.type === 'answer') answers.push(cmd.payload.answer); return original(id, cmd); };
      for (let i = 0; i < 25 * 30; i++) { bot.step(); transport.step(LD.Config.step); }
      assert(answers.length > 0 && answers.every((answer) => answer === 'Apollo 11'));
      assert(game.state.players[1].stats.solved > 0);
    });
    test('Bot can dispatch E. coli with IgG4 even when its IgG1 wallet is empty', function () {
      const game = make(), botPlayer = game.state.players[1]; game.state.botEnabled = true; game.state.time = 40;
      botPlayer.owned['ethanol-1'] = true; botPlayer.wallet.igg4 = 2;
      const transport = new LD.LocalTransport(game), bot = new LD.Bot(game, transport, { seed: 4 }); bot.shopAt = Infinity; bot.attackAt = 0;
      bot.step(); assert(game.state.players[0].enemies.some((entry) => entry.type === 'ecoli'));
      assert(botPlayer.wallet.igg4 === 1 && botPlayer.wallet.igg1 === 0);
    });
    test('Rebalanced microbes have distinct roles and contamination amounts', function () {
      const { basic, fast, slow, elite } = LD.Enemies;
      assert(basic.breach === 2 && fast.breach === 5 && slow.breach === 20 && elite.breach > slow.breach && elite.breach <= 100);
      assert(fast.speed >= basic.speed * 3 && fast.health < basic.health && fast.damage < basic.damage);
      assert(slow.speed < basic.speed && slow.health > basic.health && slow.damage > basic.damage);
      assert(elite.speed > basic.speed && elite.health > slow.health && elite.damage > slow.damage);
      assert(new Set([basic, fast, slow, elite].map((microbe) => microbe.sprite)).size === 4);
    });
    test('Slow and IVIG dispatches charge the proper currency and spawn the right microbe', function () {
      const game = make(), own = game.state.players[0], opponent = game.state.players[1];
      assert(!command(game, 'buy', { itemId: 'send-elite' }).ok); fund(game);
      const before = Object.assign({}, own.wallet);
      assert(command(game, 'buy', { itemId: 'send-slow' }).ok);
      assert(command(game, 'buy', { itemId: 'send-elite' }).ok);
      assert(own.wallet.igg3 === before.igg3 - 2 && own.wallet.ivig === before.ivig - 1);
      assert(opponent.enemies[0].type === 'slow' && opponent.enemies[1].type === 'elite');
      assert(opponent.enemies[0].name === 'Bacillus subtilis' && opponent.enemies[1].name === 'Mycoplasma hyorhinis');
    });
    test('E. coli costs one IgG4, destroys a starting wall in one second of contact, and breaches for one percent', function () {
      const game = make(), own = game.state.players[0], opponent = game.state.players[1]; own.wallet.igg4 = 1;
      assert(command(game, 'buy', { itemId: 'send-ecoli' }).ok);
      assert(own.wallet.igg4 === 0 && opponent.enemies[0].type === 'ecoli');
      assert(opponent.enemies[0].health === 22 && opponent.enemies[0].damage === 48 && opponent.enemies[0].breach === 1);
      assert(!command(game, 'buy', { itemId: 'send-ecoli' }).ok);
      assert(command(game, 'cast', { x: 200, y: 180 }).ok);
      const contactX = 200 + LD.Config.radius - LD.Config.wallThickness / 2 - LD.Enemies.ecoli.radius;
      const entry = enemy(game, contactX, 180, 'ecoli'); advance(game, .8);
      assert(own.walls.length === 1 && own.walls[0].health < LD.Config.wallHealth);
      advance(game, .3); assert(own.walls.length === 0 && entry.health === 22);
      entry.x = LD.Config.cultureX + 1; advance(game, LD.Config.step);
      assert(own.contamination === 1);
    });
    test('Each microbe adds its exact contamination on a breach', function () {
      Object.entries(LD.Enemies).forEach(([type, definition]) => {
        const game = make(); enemy(game, LD.Config.cultureX + 1, 180, type); advance(game, LD.Config.step);
        assert(game.state.players[0].contamination === definition.breach, type + ' breach amount differs');
      });
    });
    test('Image upgrade snapshots old circles and fires nine rings on one recharge', function () {
      const game = make(), player = game.state.players[0]; fund(game);
      assert(command(game, 'cast', { x: 160, y: 180 }).ok);
      assert(player.walls.length === 1 && player.walls[0].radius === 26);
      assert(command(game, 'buy', { itemId: 'image-grid' }).ok);
      assert(player.walls.length === 1 && player.polymerImage === 'grid3x3'); advance(game, 1.3);
      assert(command(game, 'cast', { x: 400, y: 180 }).ok);
      assert(player.walls.length === 10); near(player.laserCooldown, player.laserCooldownMax);
      const rings = player.walls.slice(1);
      assert(new Set(rings.map((ring) => ring.id)).size === 9);
      assert(new Set(rings.map((ring) => ring.x)).size === 3 && new Set(rings.map((ring) => ring.y)).size === 3);
      assert(rings.every((ring) => ring.radius === 26 && ring.health === LD.Config.wallHealth));
    });
    test('An invalid outer array ring rejects the entire cast without recharge or events', function () {
      const game = make(), player = game.state.players[0]; fund(game);
      command(game, 'buy', { itemId: 'image-grid' });
      enemy(game, 400 + LD.Config.imageSpacing + LD.Config.radius, 180);
      game.drainEvents(); assert(!command(game, 'cast', { x: 400, y: 180 }).ok);
      assert(player.walls.length === 0 && player.laserCooldown === 0 && game.drainEvents().length === 0);
    });
    test('Coated arrays contain and damage enemies in separate rings', function () {
      const game = make(), player = game.state.players[0]; fund(game);
      command(game, 'buy', { itemId: 'image-grid' }); command(game, 'buy', { itemId: 'ethanol-1' });
      const a = enemy(game, 350, 180), b = enemy(game, 350 + LD.Config.imageSpacing, 180 + LD.Config.imageSpacing, 'fast');
      assert(command(game, 'cast', { x: 350, y: 180 }).ok); advance(game, 1);
      near(a.health, LD.Enemies.basic.health - 2); near(b.health, LD.Enemies.fast.health - 2);
      assert(player.walls.length === 9); advance(game, 5.1);
      assert(player.enemies.length === 0 && player.stats.neutralized === 2);
    });
    test('Array circles break independently and support boundary clipping', function () {
      const game = make(), player = game.state.players[0]; fund(game); command(game, 'buy', { itemId: 'image-grid' });
      assert(command(game, 'cast', { x: 12, y: 12 }).ok);
      assert(player.walls.length === 9 && player.walls.some((ring) => ring.x < 0 || ring.y < 0));
      player.walls[0].health = 0; advance(game, LD.Config.step);
      assert(player.walls.length === 8 && player.walls.every((ring) => ring.health === LD.Config.wallHealth));
    });
    test('Clue provider handles denied storage and avoids repeated IDs', function () {
      const denied = { getItem: function () { throw new Error('denied'); }, setItem: function () { throw new Error('denied'); } };
      const provider = new LD.ClueProvider({ seed: 21, storage: denied });
      for (let tier = 1; tier <= 4; tier++) {
        const ids = new Set();
        for (let i = 0; i < 16; i++) { const clue = provider.next(tier); assert(clue && clue.tier === tier && clue.length === clue.answer.length); assert(!ids.has(clue.id)); ids.add(clue.id); }
      }
    });
    test('Bundled bank is unique, normalized, and covers all tiers', function () {
      if (!LD.ClueBank) return;
      assert(LD.ClueBank.length > 40000);
      const ids = new Set(), texts = new Set(), tiers = new Set();
      LD.ClueBank.forEach((clue) => {
        const text = clue.text.trim().toLowerCase().replace(/\s+/g, ' ');
        assert(!ids.has(clue.id) && !texts.has(text)); ids.add(clue.id); texts.add(text); tiers.add(clue.tier);
        assert(/^[A-Z]+$/.test(clue.answer) && clue.tier >= 1 && clue.tier <= 4);
      }); assert(tiers.size === 4);
    });
    return results;
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
