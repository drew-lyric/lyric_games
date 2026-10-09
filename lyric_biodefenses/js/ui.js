(function (root) {
  'use strict';
  const LD = root.LyricDefense;
  const C = LD.Config;
  const $ = function (id) { return document.getElementById(id); };
  const tierNames = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];
  const app = LD.app = {
    game: null, transport: null, bot: null, mode: 'bot', state: null,
    playerId: 'p1', opponentId: 'p2', session: null, pending: new Map(), rematchPending: false, lanBusy: false,
    selectedTab: 'LASER', selectedItem: 'ethanol-1', clueId: null,
    renderer: new LD.Renderer($('reactor-canvas')),
    opponentRenderer: new LD.Renderer($('opponent-canvas'), { opponent: true }),
    accumulator: 0, lastFrame: null, hintUntil: 0, toastTimer: null,
    pausedWhileAway: false, revealedClue: null,
    exiting: false, exitPromise: null, lanGeneration: 0, lanRequest: null, animationFrame: null
  };
  const nodes = new Map();
  LD.Assets.load();

  function text(id, value) {
    const node = $(id);
    value = String(value);
    if (node.textContent !== value) node.textContent = value;
  }
  function player(state, id) {
    if (!state || !state.players) return null;
    return Array.isArray(state.players) ? state.players.find(function (entry) { return entry.id === id; }) : state.players[id];
  }
  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds || 0));
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }
  function currencyName(key) { return key === 'ivig' ? 'IVIG' : 'IgG' + key.slice(-1); }
  function currencyClass(key) { return 'tier-' + (key === 'ivig' ? 5 : key.slice(-1)); }
  function costElements(container, cost) {
    container.replaceChildren();
    Object.keys(cost).forEach(function (key) {
      const span = document.createElement('span');
      span.className = currencyClass(key);
      span.textContent = cost[key] + ' ' + currencyName(key);
      container.appendChild(span);
    });
  }
  function toast(message, kind) {
    clearTimeout(app.toastTimer);
    const region = $('toast-region');
    const entry = document.createElement('div');
    entry.className = 'toast ' + (kind || '');
    entry.textContent = message;
    region.replaceChildren(entry);
    app.toastTimer = setTimeout(function () { region.replaceChildren(); }, 3500);
  }
  function clueHint(message, kind) {
    text('answer-hint', message);
    $('answer-hint').className = kind || '';
    app.hintUntil = performance.now() + 3500;
  }
  function send(type, payload) {
    if (app.exiting) return { ok: false, reason: 'Returning to the game collection.' };
    if (!app.transport) return { ok: false, reason: 'Start a match first.' };
    if (app.mode === 'lan' && isPending(type)) return { ok: false, reason: 'Waiting for the host to confirm this action.' };
    const result = app.transport.send(app.playerId, { type: type, payload: payload || {} });
    if (app.mode === 'lan' && result.pending) {
      app.pending.set(result.commandId, type);
      if (app.state) updateState(app.state);
    } else if (app.mode === 'lan' && !result.ok) toast(result.reason, 'error');
    return result;
  }
  function isPending(type) { return Array.from(app.pending.values()).includes(type); }
  function isConnected() { return app.mode !== 'lan' || app.session && app.session.connectionState === 'connected'; }
  function isTrivia(clue) { return !clue || clue.kind === 'trivia' || !clue.length; }

  function buildLetters(length) {
    $('answer-letters').replaceChildren();
    for (let i = 0; i < length; i++) {
      const span = document.createElement('span');
      span.className = 'answer-letter';
      $('answer-letters').appendChild(span);
    }
    updateLetters();
  }
  function updateLetters() {
    if ($('answer-entry').classList.contains('trivia')) return;
    const value = LD.normalizeAnswer($('answer-input').value);
    const letters = $('answer-letters').children;
    const focus = document.activeElement === $('answer-input');
    for (let i = 0; i < letters.length; i++) {
      letters[i].textContent = value[i] || '';
      letters[i].classList.toggle('filled', !!value[i]);
      letters[i].classList.toggle('active', focus && i === Math.min(value.length, letters.length - 1));
    }
    if (focus && letters.length) {
      const active = letters[Math.min(value.length, letters.length - 1)];
      const entry = $('answer-entry');
      const left = active.offsetLeft;
      const right = left + active.offsetWidth;
      if (left < entry.scrollLeft) entry.scrollLeft = left;
      else if (right > entry.scrollLeft + entry.clientWidth) entry.scrollLeft = right - entry.clientWidth;
    }
  }

  function buildShop() {
    nodes.clear();
    const tree = $('shop-tree');
    tree.replaceChildren();
    tree.setAttribute('aria-label', app.selectedTab.toLowerCase() + ' items');
    const groups = new Map();
    LD.Items.filter(function (item) { return item.tab === app.selectedTab; }).forEach(function (item) {
      if (!groups.has(item.tree)) groups.set(item.tree, []);
      groups.get(item.tree).push(item);
    });
    groups.forEach(function (items, name) {
      const group = document.createElement('div');
      group.className = 'tree-group';
      const heading = document.createElement('div');
      heading.className = 'tree-heading';
      heading.textContent = name;
      group.appendChild(heading);
      const itemsWrap = document.createElement('div');
      itemsWrap.className = 'tree-nodes';
      items.forEach(function (item) {
        const button = document.createElement('button');
        button.className = 'shop-node' + (item.prerequisites.length ? ' connected' : '');
        button.dataset.itemId = item.id;
        button.setAttribute('aria-pressed', String(app.selectedItem === item.id));
        const icon = document.createElement('canvas');
        icon.width = 32; icon.height = 32; icon.setAttribute('aria-hidden', 'true');
        LD.Assets.draw(icon.getContext('2d'), item.sprite, 0, 0, 32, 1);
        const description = document.createElement('span');
        description.className = 'node-text';
        const title = document.createElement('span');
        title.className = 'node-name'; title.textContent = item.name;
        const cost = document.createElement('span');
        cost.className = 'node-cost'; costElements(cost, item.cost);
        description.append(title, cost);
        const status = document.createElement('span');
        status.className = 'node-status'; status.setAttribute('aria-hidden', 'true');
        button.append(icon, description, status);
        button.addEventListener('click', function () { app.selectedItem = item.id; updateShop(); });
        itemsWrap.appendChild(button);
        nodes.set(item.id, { button: button, status: status, icon: icon });
      });
      group.appendChild(itemsWrap); tree.appendChild(group);
    });
    document.querySelectorAll('[data-tab]').forEach(function (button) {
      const active = button.dataset.tab === app.selectedTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.setAttribute('tabindex', active ? '0' : '-1');
      button.setAttribute('aria-controls', 'shop-tree');
    });
    updateShop();
  }

  function updateShop() {
    const own = player(app.state, app.playerId);
    nodes.forEach(function (entry, id) {
      const item = LD.ItemById[id];
      const owned = !!(own && own.owned[id] && !item.repeatable);
      const locked = !!(own && !LD.hasPrerequisites(own, item));
      entry.button.classList.toggle('selected', id === app.selectedItem);
      entry.button.classList.toggle('owned', owned);
      entry.button.classList.toggle('locked', locked);
      entry.button.setAttribute('aria-pressed', String(id === app.selectedItem));
      entry.status.textContent = owned ? '✓' : locked ? '⌑' : '↗';
      entry.button.title = item.name + (owned ? ' — purchased' : locked ? ' — requires ' + item.prerequisites.map(function (key) { return LD.ItemById[key].name; }).join(', ') : ' — inspect item');
    });
    const item = LD.ItemById[app.selectedItem];
    if (!item) return;
    text('detail-tree', item.tree.toUpperCase());
    text('detail-name', item.name);
    text('detail-description', item.description);
    $('detail-image').hidden = item.id !== 'image-grid';
    const icon = $('detail-icon');
    icon.getContext('2d').clearRect(0, 0, 48, 48);
    LD.Assets.draw(icon.getContext('2d'), item.sprite, 0, 0, 48, 1);
    costElements($('detail-cost'), item.cost);
    const purchased = !!(own && own.owned[item.id] && !item.repeatable);
    const prereqMissing = !!(own && !LD.hasPrerequisites(own, item));
    const reason = own ? LD.purchaseReason(own, item) : 'Start a match to purchase.';
    const playing = app.state && app.state.phase === 'playing' && isConnected();
    text('detail-state', purchased ? 'PURCHASED' : prereqMissing ? 'LOCKED' : 'AVAILABLE');
    $('detail-state').style.color = purchased ? C.colors[0] : '';
    $('detail-prerequisites').hidden = item.prerequisites.length === 0;
    if (item.prerequisites.length) text('detail-prerequisites', 'Requires: ' + item.prerequisites.map(function (key) { return LD.ItemById[key].name + (own && own.owned[key] ? ' ✓' : ''); }).join(', '));
    $('buy-button').disabled = !playing || !!reason || isPending('buy');
    $('buy-button').firstChild.textContent = purchased ? 'Purchased ' : item.effect === 'sendEnemy' ? 'Dispatch ' : 'Purchase ';
    let hint = reason || (item.repeatable ? 'Repeatable purchase. Takes effect immediately.' : 'One-time upgrade. Takes effect immediately.');
    if (!reason && !playing) hint = app.state && app.state.phase === 'paused' ? 'Resume the match to purchase.' : 'Purchases open when the match begins.';
    if (reason === 'Not enough IgG.') hint = 'Need ' + Object.keys(item.cost).filter(function (key) { return own.wallet[key] < item.cost[key]; }).map(function (key) { return (item.cost[key] - own.wallet[key]) + ' more ' + currencyName(key); }).join(' + ') + '.';
    text('purchase-hint', hint);
  }

  function updateState(state) {
    const previousPhase = app.state && app.state.phase;
    if (app.mode === 'lan' && app.state && state.matchId !== app.state.matchId) {
      clearRenderers(); app.clueId = null; app.pending.clear(); app.rematchPending = false;
    }
    app.state = state;
    const own = player(state, app.playerId);
    const opponent = player(state, app.opponentId);
    if (!own || !opponent) return;
    const playing = state.phase === 'playing' && isConnected();
    C.currencies.forEach(function (currency) {
      text('wallet-' + currency, own.wallet[currency]);
      if (currency !== 'ivig') text('producer-' + currency, own.producers[currency] ? '+' + own.producers[currency] + ' / 18s' : '');
    });
    $('craft-button').disabled = !playing || !LD.affordable(own.wallet, C.ivigRecipe) || isPending('craft');
    $('craft-button').title = 'Consume 6 IgG1, 3 IgG2, 2 IgG3, and 1 IgG4 to craft one IVIG.';
    text('match-time', formatTime(state.time));
    text('mode-label', app.mode === 'lan' ? 'LAN 1v1 MATCH' : state.sandbox ? 'DEVELOPER SANDBOX' : 'LOCAL BOT MATCH');
    text('reactor-code', 'CULTURE BCL–0' + (app.playerId === 'p1' ? '1' : '2'));
    text('opponent-feed', 'LIVE FEED / BCL–0' + (app.opponentId === 'p1' ? '1' : '2'));
    $('answer-input').disabled = !playing;
    $('answer-button').disabled = !playing || isPending('answer');
    if (playing && previousPhase === 'countdown') $('answer-input').focus({ preventScroll: true });
    $('skip-button').disabled = !playing || own.skipCharges < 1 || isPending('skip');
    $('pause-button').hidden = app.mode === 'lan';
    $('pause-help').hidden = app.mode === 'lan';
    $('pause-button').disabled = app.mode === 'lan' || state.phase === 'ended';
    $('restart-button').disabled = app.mode === 'lan' && (state.phase !== 'ended' || hasRequestedRematch() || app.rematchPending);
    $('restart-button').firstChild.textContent = app.mode === 'lan' ? 'Rematch ' : 'Restart ';
    $('leave-button').hidden = app.mode !== 'lan';
    $('pause-button').firstChild.textContent = state.phase === 'paused' ? 'Resume ' : 'Pause ';
    if (own.clue && app.clueId !== own.clue.id) {
      app.clueId = own.clue.id;
      $('answer-input').value = '';
      const trivia = isTrivia(own.clue);
      $('answer-entry').classList.toggle('trivia', trivia);
      $('answer-input').maxLength = trivia ? 512 : Math.max(64, own.clue.length * 4);
      $('answer-input').placeholder = trivia ? 'Type your answer…' : '';
      $('answer-input').setAttribute('autocapitalize', trivia ? 'off' : 'characters');
      text('question-terminal-label', trivia ? 'TRIVIA TERMINAL' : 'CLUE TERMINAL');
      text('answer-label', trivia ? 'Trivia answer' : 'Crossword answer');
      if (trivia) $('answer-letters').replaceChildren();
      else buildLetters(own.clue.length);
      text('clue-text', own.clue.text);
      $('clue-text').classList.toggle('long-clue', own.clue.text.length > 90);
      text('difficulty-badge', tierNames[own.clue.tier - 1] + ' · +1 IgG' + own.clue.tier);
      $('difficulty-badge').className = 'difficulty-badge tier-' + own.clue.tier;
      app.revealedClue = null;
      $('debug-answer').hidden = true;
    }
    if (performance.now() > app.hintUntil) {
      text('answer-hint', isTrivia(own.clue) ? 'Type your answer, then press Enter. Numbers and multiple words are welcome.' : own.clue.length + ' letters · Type your answer, then press Enter.');
      $('answer-hint').className = '';
    }
    text('skip-count', own.skipCharges + ' / ' + C.skipCapacity);
    $('skip-progress').style.width = (own.skipCharges >= C.skipCapacity ? 100 : Math.min(100, own.skipProgress / own.skipRecharge * 100)) + '%';
    $('skip-button').title = own.skipCharges > C.skipCapacity ? 'Use one of your ' + own.skipCharges + ' skips. Purchased skips can be banked above ' + C.skipCapacity + '; automatic recharge resumes below ' + C.skipCapacity + '.' : own.skipCharges === C.skipCapacity ? 'Skip this question. Automatic skips are full; shop purchases can bank extra charges.' : 'Skip this question. Next automatic charge in ' + Math.ceil(own.skipRecharge - own.skipProgress) + 's.';
    text('contamination-value', Math.round(own.contamination) + '%');
    $('contamination-fill').style.width = own.contamination + '%';
    const dangerColor = own.contamination >= 70 ? '#de8d8b' : own.contamination >= 40 ? '#edbc73' : C.colors[0];
    $('contamination-fill').style.background = dangerColor;
    text('reactor-status', own.contamination >= 70 ? 'CRITICAL' : own.contamination >= 40 ? 'AT RISK' : 'STABLE');
    $('reactor-status').style.color = dangerColor;
    const laserReady = own.laserCooldown <= .001;
    text('laser-status', laserReady ? 'READY' : own.laserCooldown.toFixed(1) + 's');
    $('laser-status').style.color = laserReady ? C.colors[0] : '#8b9981';
    $('laser-progress').style.width = Math.max(0, (1 - own.laserCooldown / own.laserCooldownMax) * 100) + '%';
    const imageLabel = own.polymerImage === 'grid3x3' ? '3×3 ARRAY' : 'SINGLE RING';
    text('coating-status', imageLabel + ' · ' + (own.coatingDps > 0 ? 'ETHANOL ' + own.coatingDps + ' DMG/S' : 'BLOCKS ONLY'));
    $('coating-status').style.color = own.coatingDps > 0 ? '#ed9c7b' : '';
    const contamNode = $('opponent-contamination');
    if (contamNode.firstChild.nodeValue !== String(Math.round(opponent.contamination))) contamNode.firstChild.nodeValue = String(Math.round(opponent.contamination));
    text('opponent-enemies', opponent.enemies.length);
    text('opponent-producers', Object.values(opponent.producers).reduce(function (a, b) { return a + b; }, 0));
    $('opponent-fill').style.width = opponent.contamination + '%';
    $('opponent-fill').style.background = opponent.contamination >= 70 ? '#de8d8b' : C.colors[0];
    text('opponent-mode', app.mode === 'lan' ? app.session && app.session.names[app.opponentId] || 'LAN PLAYER' : state.botEnabled ? 'LOCAL BOT' : 'TEST REACTOR');
    $('sandbox-panel').hidden = !state.sandbox;
    $('debug-natural').checked = state.naturalEnabled;
    $('debug-bot').checked = state.botEnabled;
    updateOverlay(state, own);
    updateShop();
  }

  function updateOverlay(state, own) {
    const overlay = $('reactor-overlay');
    overlay.hidden = state.phase === 'playing' && isConnected();
    $('overlay-action').hidden = state.phase === 'countdown';
    $('overlay-action').disabled = false;
    if (app.mode === 'lan' && (!isConnected() || app.session && app.session.status === 'waiting' || state.phase === 'paused')) {
      overlay.hidden = false;
      const waiting = app.session && app.session.status === 'waiting';
      text('overlay-eyebrow', waiting ? 'SHARE YOUR ROOM CODE' : 'CONNECTION ON HOLD');
      text('overlay-title', waiting ? 'Waiting for a friend.' : 'Reconnecting…');
      text('overlay-description', waiting ? 'Room ' + app.session.roomCode + ' · Your friend joins from the same host address.' : 'The host resumes the match when both players reconnect.');
      $('overlay-action').hidden = true;
      return;
    }
    if (state.phase === 'countdown') {
      text('overlay-eyebrow', 'PREPARING CULTURE');
      text('overlay-title', Math.max(1, Math.ceil(state.countdown)));
      text('overlay-description', 'Answer trivia above. Click to trap contaminants below.');
    } else if (state.phase === 'paused') {
      text('overlay-eyebrow', 'CULTURE ON HOLD');
      text('overlay-title', 'Match paused');
      text('overlay-description', app.pausedWhileAway ? 'The match paused while this tab was hidden.' : 'Take a moment. Your reactors are safe.');
      text('overlay-action', 'Resume match →');
    } else if (state.phase === 'ended') {
      const draw = state.winner === 'draw';
      const win = state.winner === app.playerId;
      text('overlay-eyebrow', draw ? 'BOTH CULTURES LOST' : win ? 'CULTURE PRESERVED' : 'CULTURE COMPROMISED');
      text('overlay-title', draw ? 'A draw.' : win ? 'Culture secured.' : 'Culture lost.');
      text('overlay-description', own.stats.solved + ' questions answered · ' + own.stats.neutralized + ' enemies neutralized · ' + own.stats.sent + ' sent');
      text('overlay-action', app.mode === 'lan' ? hasRequestedRematch() || app.rematchPending ? 'Waiting for opponent…' : 'Request rematch →' : state.sandbox ? 'Restart sandbox →' : 'New bot match →');
      $('overlay-action').disabled = app.mode === 'lan' && (hasRequestedRematch() || app.rematchPending);
    }
  }

  function onEvent(event) {
    if (event.type === 'ack' && event.playerId === app.playerId) {
      app.pending.delete(event.commandId);
      if (app.state) updateState(app.state);
      return;
    }
    app.renderer.handleEvent(event);
    app.opponentRenderer.handleEvent(event);
    if (event.playerId !== app.playerId) return;
    if (event.type === 'answer') {
      clueHint(event.correct ? 'Correct. +1 IgG' + event.tier + ' added to your reserves.' : 'That answer is not correct. Try again.', event.correct ? 'success' : 'error');
    } else if (event.type === 'skip') {
      clueHint('Question skipped. No currency awarded.');
    } else if (event.type === 'craft') {
      toast('One IVIG crafted. Emergency power is ready.', 'success');
    } else if (event.type === 'purchase') {
      const item = LD.ItemById[event.itemId];
      toast(item.effect === 'sendEnemy' ? item.name + ' dispatched to the opponent.' : item.name + ' purchased.', 'success');
    } else if (event.type === 'rejected' && event.reason !== 'Try another answer.' && event.reason !== 'Laser recharging.') {
      toast(event.reason, 'error');
    }
  }

  function start(mode) {
    if (app.exiting) return;
    app.lanGeneration++;
    if (app.transport) app.transport.dispose();
    app.mode = mode;
    app.playerId = 'p1'; app.opponentId = 'p2'; app.session = null;
    app.pending.clear(); app.rematchPending = false;
    app.renderer.playerId = app.playerId; app.opponentRenderer.playerId = app.opponentId;
    $('network-strip').hidden = true; $('leave-button').hidden = true;
    $('pause-button').hidden = false;
    $('pause-help').hidden = false;
    clearSavedSession();
    app.clueId = null;
    app.hintUntil = 0;
    app.revealedClue = null;
    app.pausedWhileAway = false;
    app.accumulator = 0;
    const seed = Date.now() >>> 0;
    const Provider = LD.TriviaProvider || LD.ClueProvider;
    const provider = new Provider({ seed: seed });
    const opponentProvider = new Provider({ seed: (seed + 1) >>> 0, storage: null });
    app.game = new LD.Game({ clueProvider: provider, opponentClueProvider: opponentProvider, seed: seed, mode: mode });
    app.transport = new LD.LocalTransport(app.game, { latencyMs: 0 });
    app.bot = new LD.Bot(app.game, app.transport, { seed: seed ^ 731 });
    clearRenderers();
    app.transport.subscribeEvents(onEvent);
    app.transport.subscribeState(updateState);
    $('welcome-screen').hidden = true;
    document.querySelector('.app-shell').inert = false;
    $('toast-region').replaceChildren();
    $('answer-input').focus({ preventScroll: true });
  }
  function clearRenderers() {
    [app.renderer, app.opponentRenderer].forEach(function (renderer) {
      renderer.lastEnemies.clear(); renderer.lastWalls.clear(); renderer.effects.length = 0;
      renderer.createdWallIds.clear(); renderer.removedWallIds.clear(); renderer.removedEnemyIds.clear();
      renderer.setPointer(null);
    });
  }
  const SESSION_KEY = 'lyric-defense.lan-session.v1';
  function clearSavedSession() { try { sessionStorage.removeItem(SESSION_KEY); } catch (_) { /* Storage is optional. */ } }
  function saveSession(credentials) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(Object.assign({ origin: location.origin }, credentials))); } catch (_) { /* Storage is optional. */ } }
  function hasRequestedRematch() { return !!(app.session && (app.session.rematchRequested || []).includes(app.playerId)); }
  function updateSession(session) {
    app.session = session;
    text('network-room', session.roomCode);
    const status = session.connectionState === 'connecting' ? 'Connecting to host…' : session.connectionState === 'reconnecting' ? 'Connection lost · reconnecting automatically' : session.status === 'waiting' ? 'Waiting for player two' : session.status === 'paused' ? 'Opponent reconnecting · match held' : session.status === 'rematch' ? 'Rematch requested · waiting for both players' : session.status === 'ended' ? 'Match finished' : 'Both players connected';
    text('network-status', status);
    text('network-players', (session.names[app.playerId] || 'You') + ' vs ' + (session.names[app.opponentId] || 'Waiting…'));
    if (hasRequestedRematch()) app.rematchPending = false;
    if (session.connectionState === 'closed') { returnToLobby(session.reason || 'The room has closed.'); return; }
    if (app.state) updateState(app.state);
  }
  function beginLan(credentials) {
    if (app.exiting) return { ok: false, reason: 'Returning to the game collection.' };
    if (!credentials || !credentials.roomCode || !credentials.token || !['p1', 'p2'].includes(credentials.playerId)) throw new Error('The host did not return a valid player session.');
    if (app.transport) app.transport.dispose();
    app.mode = 'lan'; app.game = null; app.bot = null; app.state = null;
    app.playerId = credentials.playerId; app.opponentId = app.playerId === 'p1' ? 'p2' : 'p1';
    app.session = null; app.clueId = null; app.pending.clear(); app.rematchPending = false;
    app.accumulator = 0; app.hintUntil = 0;
    app.renderer.playerId = app.playerId; app.opponentRenderer.playerId = app.opponentId;
    clearRenderers(); saveSession(credentials);
    $('welcome-screen').hidden = true; document.querySelector('.app-shell').inert = false;
    $('network-strip').hidden = false; $('leave-button').hidden = false; $('leave-button').disabled = false;
    $('pause-button').hidden = true; $('restart-button').disabled = true;
    $('pause-help').hidden = true;
    $('answer-input').disabled = true; $('answer-button').disabled = true; $('answer-input').value = '';
    $('skip-button').disabled = true; $('craft-button').disabled = true; $('buy-button').disabled = true;
    $('sandbox-panel').hidden = true;
    text('clue-text', 'Connecting to the host…'); text('mode-label', 'LAN 1v1 MATCH');
    text('match-time', '00:00'); buildLetters(8);
    $('reactor-overlay').hidden = false; $('overlay-action').hidden = true;
    text('overlay-eyebrow', 'CONNECTING TO HOST'); text('overlay-title', 'Room ' + credentials.roomCode);
    text('overlay-description', 'Your player session is opening.');
    app.transport = new LD.LanTransport(credentials);
    app.transport.subscribeEvents(onEvent);
    app.transport.subscribeState(updateState);
    app.transport.subscribeSession(updateSession);
    return credentials;
  }
  function returnToLobby(message) {
    if (app.exiting) return;
    app.lanGeneration++;
    if (app.transport) app.transport.dispose();
    app.transport = null; app.game = null; app.bot = null; app.state = null; app.session = null;
    app.mode = 'bot'; app.playerId = 'p1'; app.opponentId = 'p2'; app.pending.clear();
    app.renderer.playerId = 'p1'; app.opponentRenderer.playerId = 'p2'; clearRenderers(); clearSavedSession();
    $('welcome-screen').hidden = false; document.querySelector('.app-shell').inert = true;
    $('network-strip').hidden = true; $('leave-button').hidden = true;
    $('lan-lobby').open = true; text('lan-status', message || 'Create a room or join a friend.');
    $('lan-create').focus({ preventScroll: true });
  }
  async function openLan(kind, code, name) {
    if (app.exiting) return { ok: false };
    if (location.protocol === 'file:') { text('lan-status', 'Open the host address to create or join a LAN room.'); return { ok: false }; }
    if (app.lanBusy) return { ok: false };
    app.lanBusy = true; $('lan-create').disabled = true; $('lan-join').disabled = true;
    text('lan-status', kind === 'create' ? 'Creating a room…' : 'Joining room…');
    const generation = ++app.lanGeneration;
    const operation = (async function () {
      try {
        const credentials = kind === 'create' ? await LD.LanTransport.create(name || $('lan-name').value.trim()) : await LD.LanTransport.join(String(code || $('lan-room-code').value).trim().toUpperCase(), name || $('lan-name').value.trim());
        if (app.exiting || generation !== app.lanGeneration) {
          try { await LD.LanTransport.leave(credentials); } catch (_) { /* The host may already have closed this room. */ }
          return { ok: false };
        }
        return beginLan(credentials);
      } catch (error) {
        if (!app.exiting && generation === app.lanGeneration) text('lan-status', error.name === 'AbortError' ? 'The host timed out. Check the LAN connection.' : error.message);
        return { ok: false, reason: error.message };
      } finally {
        app.lanBusy = false;
        if (!app.exiting) { $('lan-create').disabled = false; $('lan-join').disabled = false; }
      }
    })();
    app.lanRequest = operation;
    try { return await operation; }
    finally { if (app.lanRequest === operation) app.lanRequest = null; }
  }
  async function requestRematch() {
    if (app.mode !== 'lan' || app.rematchPending || hasRequestedRematch()) return;
    app.rematchPending = true; if (app.state) updateState(app.state);
    try {
      const result = await app.transport.requestRematch();
      if (!result.ok) toast(result.reason || 'Rematch unavailable.', 'error');
    } catch (error) { toast(error.message, 'error'); }
    finally { app.rematchPending = false; if (app.state) updateState(app.state); }
  }
  async function leaveLan() {
    if (app.mode !== 'lan') return;
    const previous = app.transport;
    $('leave-button').disabled = true;
    try { await previous.leave(); }
    catch (_) { /* Returning locally is still possible if the host is offline. */ }
    finally { if (app.transport === previous) returnToLobby('You left the room. Create or join another.'); }
  }
  app.start = start;
  app.send = send;
  app.player = function (id) { return player(app.state, id); };
  app.createLan = function (name) { return openLan('create', null, name); };
  app.joinLan = function (code, name) { return openLan('join', code, name); };
  app.resumeLan = beginLan;
  app.leaveLan = leaveLan;
  app.requestRematch = requestRematch;
  function exitForLauncher() {
    if (app.exitPromise) return app.exitPromise;
    app.exiting = true;
    app.lanGeneration++;
    clearSavedSession();
    cancelAnimationFrame(app.animationFrame);
    clearTimeout(app.toastTimer);
    if (app.game) app.game.pause();
    const cleanups = [];
    if (app.transport) {
      const previous = app.transport;
      previous.dispose();
      if (app.mode === 'lan') cleanups.push(LD.LanTransport.leave({ roomCode: previous.roomCode, token: previous.token }));
      app.transport = null;
    }
    if (app.lanRequest) cleanups.push(app.lanRequest);
    document.querySelector('.app-shell').inert = true;
    $('welcome-screen').inert = true;
    app.exitPromise = Promise.allSettled(cleanups).then(function () { clearSavedSession(); });
    return app.exitPromise;
  }
  app.exitForLauncher = exitForLauncher;
  root.addEventListener('message', function (event) {
    if (root.parent === root || event.source !== root.parent || (location.protocol !== 'file:' && event.origin !== location.origin)) return;
    if (!event.data || event.data.type !== 'lyric-games:prepare-exit' || typeof event.data.requestId !== 'string') return;
    const requestId = event.data.requestId;
    exitForLauncher().then(function () {
      root.parent.postMessage({ type: 'lyric-games:exit-ready', requestId: requestId }, location.protocol === 'file:' ? '*' : location.origin);
    });
  });
  LD.Assets.subscribe(function (key) {
    nodes.forEach(function (entry, id) {
      const item = LD.ItemById[id];
      if (item.sprite !== key) return;
      const ctx = entry.icon.getContext('2d');
      ctx.clearRect(0, 0, 32, 32);
      LD.Assets.draw(ctx, key, 0, 0, 32, 1);
    });
    updateShop();
  });

  $('start-bot').addEventListener('click', function () { start('bot'); });
  $('start-sandbox').addEventListener('click', function () { start('sandbox'); });
  $('lan-create').addEventListener('click', function () { app.createLan(); });
  $('lan-join').addEventListener('click', function () { app.joinLan(); });
  $('lan-room-code').addEventListener('keydown', function (event) { if (event.key === 'Enter') { event.preventDefault(); app.joinLan(); } });
  $('leave-button').addEventListener('click', leaveLan);
  $('pause-button').addEventListener('click', function () { app.pausedWhileAway = false; send(app.state.phase === 'paused' ? 'resume' : 'pause'); });
  $('restart-button').addEventListener('click', function () { if (app.mode === 'lan') requestRematch(); else start(app.mode); });
  $('overlay-action').addEventListener('click', function () {
    if (app.mode === 'lan') { requestRematch(); return; }
    if (app.state.phase === 'paused') { app.pausedWhileAway = false; send('resume'); }
    else start(app.mode);
  });
  $('answer-form').addEventListener('submit', function (event) {
    event.preventDefault();
    const own = player(app.state, app.playerId);
    if (!own || app.state.phase !== 'playing' || !isConnected() || isPending('answer')) return;
    if (isTrivia(own.clue) && !$('answer-input').value.trim()) {
      clueHint('Type an answer before submitting.', 'error');
      return;
    }
    if (!isTrivia(own.clue) && LD.normalizeAnswer($('answer-input').value).length !== own.clue.length) {
      clueHint('This answer needs ' + own.clue.length + ' letters.', 'error');
      return;
    }
    send('answer', { clueId: own.clue.id, answer: $('answer-input').value });
    $('answer-input').focus({ preventScroll: true });
  });
  $('answer-input').addEventListener('input', function () {
    const own = player(app.state, app.playerId);
    if (own && !isTrivia(own.clue)) $('answer-input').value = LD.normalizeAnswer($('answer-input').value).slice(0, own.clue.length);
    updateLetters();
  });
  $('answer-input').addEventListener('focus', updateLetters);
  $('answer-input').addEventListener('blur', updateLetters);
  $('skip-button').addEventListener('click', function () { send('skip'); $('answer-input').focus({ preventScroll: true }); });
  $('craft-button').addEventListener('click', function () { send('craft'); });
  $('buy-button').addEventListener('click', function () { send('buy', { itemId: app.selectedItem }); });
  document.querySelectorAll('[data-tab]').forEach(function (button) {
    button.addEventListener('click', function () {
      app.selectedTab = button.dataset.tab;
      app.selectedItem = LD.Items.find(function (item) { return item.tab === app.selectedTab; }).id;
      buildShop();
    });
    button.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const tabs = Array.from(document.querySelectorAll('[data-tab]'));
      const next = tabs[(tabs.indexOf(button) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.click(); next.focus();
    });
  });

  function canvasPoint(event) {
    const bounds = $('reactor-canvas').getBoundingClientRect();
    return { x: (event.clientX - bounds.left) / bounds.width * C.width, y: (event.clientY - bounds.top) / bounds.height * C.height };
  }
  $('reactor-canvas').addEventListener('pointermove', function (event) { app.renderer.setPointer(canvasPoint(event)); });
  $('reactor-canvas').addEventListener('pointerleave', function () { app.renderer.setPointer(null); });
  $('reactor-canvas').addEventListener('pointerdown', function (event) {
    if (event.button !== 0 || !app.state || app.state.phase !== 'playing') return;
    event.preventDefault();
    const point = canvasPoint(event);
    app.renderer.setPointer(point);
    send('cast', point);
    $('answer-input').focus({ preventScroll: true });
  });
  document.addEventListener('keydown', function (event) {
    if (event.key.toLowerCase() !== 'p' || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    if (app.mode !== 'lan' && app.state && app.state.phase !== 'ended') { event.preventDefault(); app.pausedWhileAway = false; send(app.state.phase === 'paused' ? 'resume' : 'pause'); }
  });
  document.addEventListener('visibilitychange', function () {
    app.lastFrame = null;
    app.accumulator = 0;
    if (app.mode !== 'lan' && document.hidden && app.state && (app.state.phase === 'playing' || app.state.phase === 'countdown')) {
      app.pausedWhileAway = true; send('pause');
    }
  });

  $('debug-grant').addEventListener('click', function () { send('debug', { action: 'grant', target: 'p1', amount: 10 }); toast('Added 10 of each currency to your reserves.'); });
  $('debug-reveal').addEventListener('click', function () {
    const own = player(app.state, 'p1');
    if (!own || !app.state.sandbox) return;
    app.revealedClue = own.clue.id;
    $('debug-answer').hidden = false;
    text('debug-answer', 'CURRENT ANSWER: ' + own.clue.answer);
  });
  $('debug-solve').addEventListener('click', function () { send('debug', { action: 'solve', target: 'p1' }); });
  $('debug-natural').addEventListener('change', function () { send('debug', { action: 'natural', enabled: $('debug-natural').checked }); });
  $('debug-bot').addEventListener('change', function () { send('debug', { action: 'bot', enabled: $('debug-bot').checked }); });
  $('debug-spawn').addEventListener('click', function () { send('debug', { action: 'spawn', target: $('debug-target').value, enemyType: $('debug-enemy').value }); });
  $('debug-set-contamination').addEventListener('click', function () { send('debug', { action: 'contamination', target: $('debug-target').value, value: Number($('debug-contamination').value) }); });

  function frame(now) {
    if (app.exiting) return;
    const elapsed = app.lastFrame == null ? 0 : Math.min(.25, (now - app.lastFrame) / 1000);
    app.lastFrame = now;
    if (app.transport && app.mode !== 'lan' && !document.hidden) {
      app.accumulator += elapsed;
      while (app.accumulator >= C.step) {
        app.bot.step(C.step);
        app.transport.step(C.step);
        app.accumulator -= C.step;
      }
    }
    const visualDt = app.state && (app.state.phase === 'paused' || app.state.phase === 'ended') ? 0 : elapsed;
    app.renderer.render(player(app.state, app.playerId), app.state, visualDt);
    app.opponentRenderer.render(player(app.state, app.opponentId), app.state, visualDt);
    if (!$('welcome-screen').hidden) LD.drawWelcomeArt($('welcome-art'), now / 1000);
    app.animationFrame = requestAnimationFrame(frame);
  }
  buildLetters(8);
  Object.values(LD.Enemies).forEach(function (enemy) {
    const option = document.createElement('option');
    option.value = enemy.id;
    option.textContent = enemy.name;
    $('debug-enemy').appendChild(option);
  });
  buildShop();
  if (location.protocol === 'file:') {
    $('lan-create').disabled = true; $('lan-join').disabled = true;
    $('lan-file-help').hidden = false;
    $('lan-lobby').open = true;
    text('lan-status', 'LAN play opens through the host address.');
  } else {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      if (new URLSearchParams(location.search).get('fresh') === '1') {
        clearSavedSession();
        if (saved && saved.origin === location.origin && saved.roomCode && saved.token) LD.LanTransport.leave(saved).catch(function () { /* Fresh solo selection is still available if the host is offline. */ });
      } else if (saved && saved.origin === location.origin) beginLan(saved);
    } catch (_) { clearSavedSession(); }
  }
  $('start-bot').focus({ preventScroll: true });
  app.animationFrame = requestAnimationFrame(frame);
})(typeof globalThis !== 'undefined' ? globalThis : window);
