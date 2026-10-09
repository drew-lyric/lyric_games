(function (root) {
  'use strict';
  const LD = root.LyricDefense;

  async function post(path, body, signal, keepalive) {
    const response = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', body: JSON.stringify(body), signal: signal, keepalive: !!keepalive
    });
    let result;
    try { result = await response.json(); }
    catch (_) { throw new Error('The host returned an unreadable response.'); }
    if (!response.ok) throw new Error(result.reason || result.error || 'The host could not complete this request.');
    return result;
  }

  async function boundedPost(path, body, timeout, keepalive) {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, timeout);
    try { return await post(path, body, controller.signal, keepalive); }
    finally { clearTimeout(timer); }
  }

  class LanTransport {
    constructor(options) {
      this.roomCode = options.roomCode;
      this.playerId = options.playerId;
      this.token = options.token;
      this.snapshot = null;
      this.session = { roomCode: this.roomCode, playerId: this.playerId, status: 'waiting', connectionState: 'connecting', names: {}, connections: {}, rematchRequested: [] };
      this.stateListeners = new Set();
      this.eventListeners = new Set();
      this.sessionListeners = new Set();
      this.controllers = new Set();
      this.sequence = 0;
      this.chain = Promise.resolve();
      this.disposed = false;
      this.hasReceivedSession = false;
      this.source = new EventSource('/api/rooms/' + encodeURIComponent(this.roomCode) + '/events?token=' + encodeURIComponent(this.token));
      this.source.onopen = () => this.updateSession({ connectionState: 'connected' });
      this.source.onerror = () => { if (!this.disposed) this.updateSession({ connectionState: 'reconnecting' }); };
      this.source.addEventListener('state', (event) => {
        const state = this.parse(event);
        if (!state || this.disposed) return;
        this.snapshot = state;
        this.stateListeners.forEach(function (listener) { listener(state); });
      });
      this.source.addEventListener('event', (event) => { const data = this.parse(event); if (data && !this.disposed) this.emit(data); });
      this.source.addEventListener('session', (event) => {
        const session = this.parse(event);
        if (!session || this.disposed) return;
        this.hasReceivedSession = true;
        clearTimeout(this.startupTimer);
        this.updateSession(Object.assign({}, session, { connectionState: 'connected' }));
      });
      this.source.addEventListener('closed', (event) => {
        const data = this.parse(event) || {};
        if (this.disposed) return;
        this.updateSession({ connectionState: 'closed', status: 'closed', reason: data.reason || 'The room has closed.' });
        this.dispose();
      });
      this.startupTimer = setTimeout(() => {
        if (this.disposed || this.hasReceivedSession) return;
        this.updateSession({ connectionState: 'closed', status: 'closed', reason: 'Could not reconnect to this room. Check that the host is running.' });
        this.dispose();
      }, 12000);
    }

    static create(name) { return boundedPost('/api/rooms', { name: name || undefined }, 10000); }
    static join(roomCode, name) { return boundedPost('/api/rooms/' + encodeURIComponent(roomCode) + '/join', { name: name || undefined }, 10000); }
    // Exit cleanup must not open a new EventSource just to release a room.
    static leave(credentials) { return boundedPost('/api/rooms/' + encodeURIComponent(credentials.roomCode) + '/leave', { token: credentials.token }, 1500, true); }
    parse(event) { try { return JSON.parse(event.data); } catch (_) { return null; } }
    getSnapshot() { return this.snapshot; }
    subscribeState(listener) { this.stateListeners.add(listener); if (this.snapshot) listener(this.snapshot); return () => this.stateListeners.delete(listener); }
    subscribeEvents(listener) { this.eventListeners.add(listener); return () => this.eventListeners.delete(listener); }
    subscribeSession(listener) { this.sessionListeners.add(listener); listener(this.session); return () => this.sessionListeners.delete(listener); }
    updateSession(values) {
      if (this.disposed) return;
      this.session = Object.assign({}, this.session, values);
      this.sessionListeners.forEach((listener) => listener(this.session));
    }
    emit(event) { if (!this.disposed) this.eventListeners.forEach(function (listener) { listener(event); }); }
    async request(action, body) {
      const controller = new AbortController();
      this.controllers.add(controller);
      const timer = setTimeout(() => controller.abort(), 10000);
      try { return await post('/api/rooms/' + encodeURIComponent(this.roomCode) + '/' + action, Object.assign({ token: this.token }, body || {}), controller.signal); }
      finally { clearTimeout(timer); this.controllers.delete(controller); }
    }
    send(playerId, command) {
      if (this.disposed) return { ok: false, reason: 'This room has closed.' };
      if (playerId !== this.playerId) return { ok: false, reason: 'This session belongs to another player.' };
      if (this.session.connectionState !== 'connected') return { ok: false, reason: 'Reconnecting to the host. Please wait.' };
      const commandId = ++this.sequence;
      const matchId = this.snapshot && this.snapshot.matchId || this.session.matchId;
      // Capture the match identity before queuing. Old requests cannot act on a rematch.
      const envelope = { matchId: matchId, command: JSON.parse(JSON.stringify(command)) };
      this.chain = this.chain.then(async () => {
        if (this.disposed) return;
        let result;
        try { result = await this.request('commands', envelope); }
        catch (error) { result = { ok: false, reason: error.name === 'AbortError' ? 'The command timed out. Check the host connection.' : error.message }; }
        if (this.disposed) return;
        if (!result.ok) this.emit({ type: 'rejected', playerId: this.playerId, reason: result.reason || 'Action unavailable.' });
        this.emit({ type: 'ack', playerId: this.playerId, commandId: commandId, commandType: command.type, ok: !!result.ok, reason: result.reason });
      });
      return { ok: true, pending: true, commandId: commandId };
    }
    step() { /* The LAN host owns simulation time. */ }
    requestRematch() { return this.request('rematch'); }
    async leave() { try { return await this.request('leave'); } finally { this.dispose(); } }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      clearTimeout(this.startupTimer);
      this.source.close();
      this.controllers.forEach(function (controller) { controller.abort(); });
      this.controllers.clear();
      this.stateListeners.clear(); this.eventListeners.clear(); this.sessionListeners.clear();
    }
  }
  LD.LanTransport = LanTransport;
})(typeof globalThis !== 'undefined' ? globalThis : window);
