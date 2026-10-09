(function (root) {
  'use strict';
  const LD = root.LyricDefense = root.LyricDefense || {};
  const copy = function (value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); };

  // This is the local authority boundary. The LAN adapter shares this interface
  // and sends the same gameplay commands to the authoritative host.
  LD.LocalTransport = class LocalTransport {
    constructor(game, options) {
      this.game = game;
      this.latency = Math.max(0, Number((options || {}).latencyMs) || 0) / 1000;
      this.elapsed = 0;
      this.queue = [];
      this.stateListeners = new Set();
      this.eventListeners = new Set();
      this.disposed = false;
      this.snapshot = copy(game.state);
    }
    getSnapshot() { return this.snapshot; }
    subscribeState(listener) {
      this.stateListeners.add(listener);
      listener(this.snapshot);
      return () => this.stateListeners.delete(listener);
    }
    subscribeEvents(listener) {
      this.eventListeners.add(listener);
      return () => this.eventListeners.delete(listener);
    }
    emit(event) { this.eventListeners.forEach(function (listener) { listener(event); }); }
    publish() {
      if (this.disposed) return;
      if (typeof this.game.drainEvents === 'function') this.game.drainEvents().forEach((event) => this.emit(event));
      this.snapshot = copy(this.game.state);
      this.stateListeners.forEach((listener) => listener(this.snapshot));
    }
    execute(playerId, command) {
      let result;
      if (command.type === 'pause') {
        result = this.game.pause();
      } else if (command.type === 'resume') {
        result = this.game.resume();
      } else {
        result = this.game.command(playerId, command);
      }
      if (typeof result === 'boolean') result = { ok: result, reason: result ? undefined : 'Action unavailable.' };
      result = result || { ok: true };
      if (!result.ok) this.emit({ type: 'rejected', playerId: playerId, reason: result.reason || 'Action unavailable.' });
      this.publish();
      return result;
    }
    send(playerId, command) {
      if (this.disposed) return { ok: false, reason: 'This match has closed.' };
      if (!command || typeof command.type !== 'string') return { ok: false, reason: 'Invalid command.' };
      if (playerId !== 'p1' && playerId !== 'p2') return { ok: false, reason: 'Unknown player.' };
      const safeCommand = copy(command);
      if (!this.latency || command.type === 'pause' || command.type === 'resume') return this.execute(playerId, safeCommand);
      this.queue.push({ due: this.elapsed + this.latency, playerId: playerId, command: safeCommand });
      return { ok: true, pending: true };
    }
    step(dt) {
      if (this.disposed || !Number.isFinite(dt) || dt <= 0) return;
      if (this.game.state.phase === 'paused') return;
      this.elapsed += dt;
      const ready = [];
      while (this.queue.length && this.queue[0].due <= this.elapsed) ready.push(this.queue.shift());
      ready.forEach((entry) => this.execute(entry.playerId, entry.command));
      this.game.step(dt);
      this.publish();
    }
    dispose() {
      this.disposed = true;
      this.queue.length = 0;
      this.stateListeners.clear();
      this.eventListeners.clear();
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
