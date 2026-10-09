(function (root) {
  'use strict';
  const LD = root.LyricDefense = root.LyricDefense || {};
  LD.Bot = class Bot {
    constructor(game, transport, options) {
      this.game = game;
      this.transport = transport;
      this.random = LD.makeRandom((options || {}).seed || 731);
      this.clueId = null;
      this.solveAt = 0;
      this.shopAt = 0;
      this.attackAt = 35;
      this.defenseAttempts = new Set();
    }
    send(type, payload) { return this.transport.send('p2', { type: type, payload: payload || {} }); }
    canBuy(player, id) {
      const item = LD.ItemById[id];
      return item && (item.repeatable || !player.owned[id]) && item.prerequisites.every((key) => player.owned[key]) && Object.entries(item.cost).every(([key, amount]) => player.wallet[key] >= amount);
    }
    step() {
      const state = this.game.state;
      if (state.phase !== 'playing' || !state.botEnabled) return;
      const player = state.players[1];
      if (player.clue && player.clue.id !== this.clueId) {
        this.clueId = player.clue.id;
        this.solveAt = state.time + LD.Config.botSolveDelays[player.clue.tier - 1] * (0.9 + this.random() * 0.2);
      }
      if (player.clue && state.time >= this.solveAt) {
        this.send('answer', { clueId: player.clue.id, answer: player.clue.answer });
        this.clueId = null;
      }
      if (state.time >= this.shopAt) {
        this.shopAt = state.time + 1;
        const priority = ['ethanol-1'];
        if (player.owned['ethanol-1']) {
          if (!player.producers.igg1) priority.push('culture-1');
          priority.push('ethanol-2', 'laser-recharge', 'image-grid');
          for (let tier = 2; tier <= 4; tier++) if (!player.producers['igg' + tier]) priority.push('culture-' + tier);
          if (player.skipCharges < 2) priority.push('skip-recharge');
        }
        const purchase = priority.find((id) => this.canBuy(player, id));
        if (purchase) this.send('buy', { itemId: purchase });
        if (player.contamination >= 60 && player.enemies.length >= 3) {
          if (Object.entries(LD.Config.ivigRecipe).every(([key, amount]) => player.wallet[key] >= amount)) this.send('craft');
          if (this.canBuy(player, 'sterilize')) this.send('buy', { itemId: 'sterilize' });
        } else if (state.time >= 180 && player.wallet.ivig === 0 && Object.entries(LD.Config.ivigRecipe).every(([key, amount]) => player.wallet[key] >= amount)) {
          this.send('craft');
        }
      }
      if (state.time >= this.attackAt && player.owned['ethanol-1']) {
        this.attackAt = state.time + LD.Config.botAttackInterval;
        const id = state.time >= 180 && player.wallet.ivig > 0 ? 'send-elite' : player.wallet.igg4 >= 2 ? 'send-ecoli' : player.wallet.igg3 >= 3 ? 'send-slow' : player.wallet.igg2 >= 3 ? 'send-fast' : 'send-basic';
        if (this.canBuy(player, id) && (id !== 'send-basic' || player.wallet.igg1 > 2)) this.send('buy', { itemId: id });
      }
      if (player.laserCooldown <= 0) {
        const enemy = player.enemies.find((entry) => entry.x > LD.Config.width * 0.3 && !this.defenseAttempts.has(entry.id));
        if (enemy) {
          this.defenseAttempts.add(enemy.id);
          if (this.random() < LD.Config.botDefenseChance) this.send('cast', { x: enemy.x, y: enemy.y });
        }
      }
      if (this.defenseAttempts.size > 200) {
        const living = new Set(player.enemies.map((entry) => entry.id));
        this.defenseAttempts.forEach((id) => { if (!living.has(id)) this.defenseAttempts.delete(id); });
      }
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
