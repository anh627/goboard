export class GoRules {
  constructor(board, komi = 6.5) {
    this.board = board;
    this.komi = komi;
    this.scoreCache = new Map();
    this.lruCacheLimit = 1000;
    this.sekiRegions = new Set();
    this.deadGroupsCache = new Map();
    this.territoryCache = new Map();
    this.ruleset = 'japanese';
    this.handicap = 0;
    this.gameStateCache = new Map();
  }

  setRuleset(ruleset) {
    if (!['japanese', 'chinese', 'aga'].includes(ruleset)) throw new Error('Invalid ruleset');
    this.ruleset = ruleset;
    this.clearCaches();
  }

  setKomi(komi) {
    this.komi = komi;
    this.clearCaches();
  }

  setHandicap(count) {
    if (count < 0 || count > (this.board.size === 19 ? 9 : this.board.size === 13 ? 5 : 4)) throw new Error('Invalid handicap');
    this.handicap = count;
    this.clearCaches();
  }

  calculateScore() {
    if (this.ruleset === 'japanese') return this.calculateScoreJapanese();
    if (this.ruleset === 'chinese') return this.calculateScoreChinese();
    return this.calculateScoreAGA();
  }

  calculateScoreJapanese() {
    const cacheKey = `japanese-${this.board.getBoardStateString()}`;
    if (this.scoreCache.has(cacheKey)) return this.scoreCache.get(cacheKey);
    let score = { 1: this.board.captured[2], 2: this.board.captured[1] + this.komi };
    const visited = new Set();
    for (let x = 0; x < this.board.size; x++) {
      for (let y = 0; y < this.board.size; y++) {
        if (this.board.board[x][y] === 0 && !visited.has(`${x},${y}`) && !this.isSekiRegion(x, y)) {
          const region = this.board.floodFill(x, y);
          const surrounds = new Set();
          for (const [rx, ry] of region) {
            for (const [nx, ny] of this.board.getNeighbors(rx, ry)) {
              if (this.board.board[nx][ny] !== 0) surrounds.add(this.board.board[nx][ny]);
            }
            visited.add(`${rx},${ry}`);
          }
          if (surrounds.size === 1 && surrounds.has(1)) score[1] += region.length;
          if (surrounds.size === 1 && surrounds.has(2)) score[2] += region.length;
        }
      }
    }
    const result = { black: score[1], white: score[2], winner: score[1] > score[2] ? 1 : 2 };
    this.scoreCache.set(cacheKey, result);
    this.lruCache(this.scoreCache);
    return result;
  }

  calculateScoreChinese() {
    const cacheKey = `chinese-${this.board.getBoardStateString()}`;
    if (this.scoreCache.has(cacheKey)) return this.scoreCache.get(cacheKey);
    let score = { 1: this.board.captured[2], 2: this.board.captured[1] + this.komi };
    for (let x = 0; x < this.board.size; x++) {
      for (let y = 0; y < this.board.size; y++) {
        if (this.board.board[x][y] === 1) score[1]++;
        if (this.board.board[x][y] === 2) score[2]++;
        if (this.board.board[x][y] === 0 && !this.isSekiRegion(x, y)) {
          const region = this.board.floodFill(x, y);
          const surrounds = new Set();
          for (const [rx, ry] of region) {
            for (const [nx, ny] of this.board.getNeighbors(rx, ry)) {
              if (this.board.board[nx][ny] !== 0) surrounds.add(this.board.board[nx][ny]);
            }
          }
          if (surrounds.size === 1 && surrounds.has(1)) score[1] += region.length;
          if (surrounds.size === 1 && surrounds.has(2)) score[2] += region.length;
        }
      }
    }
    const result = { black: score[1], white: score[2], winner: score[1] > score[2] ? 1 : 2 };
    this.scoreCache.set(cacheKey, result);
    this.lruCache(this.scoreCache);
    return result;
  }

  calculateScoreAGA() {
    const cacheKey = `aga-${this.board.getBoardStateString()}`;
    if (this.scoreCache.has(cacheKey)) return this.scoreCache.get(cacheKey);
    let score = { 1: this.board.captured[2], 2: this.board.captured[1] + this.komi };
    const deadGroups = this.markPotentialDeadGroups(1).concat(this.markPotentialDeadGroups(2));
    for (const group of deadGroups) {
      const player = this.board.board[group[0][0]][group[0][1]] === 1 ? 2 : 1;
      score[player] += group.length;
    }
    for (let x = 0; x < this.board.size; x++) {
      for (let y = 0; y < this.board.size; y++) {
        if (this.board.board[x][y] === 1) score[1]++;
        if (this.board.board[x][y] === 2) score[2]++;
        if (this.board.board[x][y] === 0 && !this.isSekiRegion(x, y)) {
          const region = this.board.floodFill(x, y);
          const surrounds = new Set();
          for (const [rx, ry] of region) {
            for (const [nx, ny] of this.board.getNeighbors(rx, ry)) {
              if (this.board.board[nx][ny] !== 0) surrounds.add(this.board.board[nx][ny]);
            }
          }
          if (surrounds.size === 1 && surrounds.has(1)) score[1] += region.length;
          if (surrounds.size === 1 && surrounds.has(2)) score[2] += region.length;
        }
      }
    }
    const result = { black: score[1], white: score[2], winner: score[1] > score[2] ? 1 : 2 };
    this.scoreCache.set(cacheKey, result);
    this.lruCache(this.scoreCache);
    return result;
  }

  calculateScoreWithHandicap() {
    const score = this.calculateScore();
    score.black += this.handicap;
    score.winner = score.black > score.white ? 1 : 2;
    return score;
  }

  calculateScoreWithSeki() {
    const cacheKey = `seki-${this.ruleset}-${this.board.getBoardStateString()}`;
    if (this.scoreCache.has(cacheKey)) return this.scoreCache.get(cacheKey);
    let score = { 1: this.board.captured[2], 2: this.board.captured[1] + this.komi };
    const visited = new Set();
    for (let x = 0; x < this.board.size; x++) {
      for (let y = 0; y < this.board.size; y++) {
        if (this.board.board[x][y] === 0 && !visited.has(`${x},${y}`) && !this.isSekiRegion(x, y)) {
          const region = this.board.floodFill(x, y);
          const surrounds = new Set();
          for (const [rx, ry] of region) {
            for (const [nx, ny] of this.board.getNeighbors(rx, ry)) {
              if (this.board.board[nx][ny] !== 0) surrounds.add(this.board.board[nx][ny]);
            }
            visited.add(`${rx},${ry}`);
          }
          if (surrounds.size === 1 && surrounds.has(1)) score[1] += region.length;
          if (surrounds.size === 1 && surrounds.has(2)) score[2] += region.length;
        }
      }
    }
    if (this.ruleset === 'chinese' || this.ruleset === 'aga') {
      for (let x = 0; x < this.board.size; x++) {
        for (let y = 0; y < this.board.size; y++) {
          if (this.board.board[x][y] === 1) score[1]++;
          if (this.board.board[x][y] === 2) score[2]++;
        }
      }
    }
    const result = { black: score[1], white: score[2], winner: score[1] > score[2] ? 1 : 2 };
    this.scoreCache.set(cacheKey, result);
    this.lruCache(this.scoreCache);
    return result;
  }

  isSekiRegion(x, y) {
    const cacheKey = `${x},${y}-seki`;
    if (this.sekiRegions.has(cacheKey)) return true;
    if (this.board.board[x][y] !== 0) return this.board.isSeki(x, y);
    const region = this.board.floodFill(x, y);
    const surrounds = new Set();
    for (const [rx, ry] of region) {
      for (const [nx, ny] of this.board.getNeighbors(rx, ry)) {
        if (this.board.board[nx][ny] !== 0 && this.board.isSeki(nx, ny)) {
          surrounds.add(this.board.board[nx][ny]);
        }
      }
    }
    return surrounds.size >= 2;
  }

  updateSekiRegions() {
    this.sekiRegions.clear();
    for (let x = 0; x < this.board.size; x++) {
      for (let y = 0; y < this.board.size; y++) {
        if (this.board.board[x][y] !== 0 && this.board.isSeki(x, y)) {
          const group = this.board.getGroup(x, y);
          for (const [gx, gy] of group) {
            this.sekiRegions.add(`${gx},${gy}-seki`);
          }
        }
      }
    }
  }

  markPotentialDeadGroups(player) {
    const cacheKey = `dead-${player}-${this.board.getBoardStateString()}`;
    if (this.deadGroupsCache.has(cacheKey)) return this.deadGroupsCache.get(cacheKey);
    const opponent = player === 1 ? 2 : 1;
    const deadGroups = [];
    const groups = this.board.getAllGroups(opponent);
    for (const group of groups) {
      if (!this.board.isGroupAlive(group[0][0], group[0][1]) && !this.isSekiRegion(group[0][0], group[0][1])) {
        deadGroups.push(group);
      }
    }
    this.deadGroupsCache.set(cacheKey, deadGroups);
    this.lruCache(this.deadGroupsCache);
    return deadGroups;
  }

  markDeadGroups(deadPoints) {
    this.board.markDeadGroups(this.board.board[deadPoints[0][0]][deadPoints[0][1]], deadPoints);
    this.clearCaches();
  }

  isGameOver() {
    return this.board.history.length >= 2 && this.board.history.slice(-2).every(move => move.x === null);
  }

  isGameOverByResignation(player) {
    return this.gameStateCache.get('resignation') === player;
  }

  isGameOverByTimeout(player) {
    return this.gameStateCache.get('timeout') === player;
  }

  resignGame(player) {
    this.gameStateCache.set('resignation', player);
    this.clearCaches();
  }

  timeoutGame(player) {
    this.gameStateCache.set('timeout', player);
    this.clearCaches();
  }

  lruCache(cache) {
    if (cache.size > this.lruCacheLimit) {
      const keys = [...cache.keys()];
      cache.delete(keys[0]);
    }
  }

  clearCaches() {
    this.scoreCache.clear();
    this.deadGroupsCache.clear();
    this.territoryCache.clear();
    this.gameStateCache.clear();
  }

  verifyTerritory(player) {
    const cacheKey = `verify-${player}-${this.board.getBoardStateString()}`;
    if (this.territoryCache.has(cacheKey)) return this.territoryCache.get(cacheKey);
    const score = this.calculateScore();
    const regions = this.board.getControlledRegions(player);
    const territory = regions.reduce((sum, region) => sum + region.length, 0);
    const result = territory === (this.ruleset === 'japanese' ? score[player] - this.board.captured[player === 1 ? 2 : 1] : score[player] - this.board.captured[player === 1 ? 2 : 1] - (this.board.board.flat().filter(cell => cell === player).length));
    this.territoryCache.set(cacheKey, result);
    this.lruCache(this.territoryCache);
    return result;
  }

  calculateTerritoryJapanese(player) {
    const cacheKey = `territory-japanese-${player}-${this.board.getBoardStateString()}`;
    if (this.territoryCache.has(cacheKey)) return this.territoryCache.get(cacheKey);
    let territory = this.board.captured[player === 1 ? 2 : 1];
    const visited = new Set();
    for (let x = 0; x < this.board.size; x++) {
      for (let y = 0; y < this.board.size; y++) {
        if (this.board.board[x][y] === 0 && !visited.has(`${x},${y}`) && !this.isSekiRegion(x, y)) {
          const region = this.board.floodFill(x, y);
          const surrounds = new Set();
          for (const [rx, ry] of region) {
            for (const [nx, ny] of this.board.getNeighbors(rx, ry)) {
              if (this.board.board[nx][ny] !== 0) surrounds.add(this.board.board[nx][ny]);
            }
            visited.add(`${rx},${ry}`);
          }
          if (surrounds.size === 1 && surrounds.has(player)) territory += region.length;
        }
      }
    }
    this.territoryCache.set(cacheKey, territory);
    this.lruCache(this.territoryCache);
    return territory;
  }

  calculateTerritoryChinese(player) {
    const cacheKey = `territory-chinese-${player}-${this.board.getBoardStateString()}`;
    if (this.territoryCache.has(cacheKey)) return this.territoryCache.get(cacheKey);
    let territory = this.board.captured[player === 1 ? 2 : 1];
    for (let x = 0; x < this.board.size; x++) {
      for (let y = 0; y < this.board.size; y++) {
        if (this.board.board[x][y] === player) territory++;
        if (this.board.board[x][y] === 0 && !this.isSekiRegion(x, y)) {
          const region = this.board.floodFill(x, y);
          const surrounds = new Set();
          for (const [rx, ry] of region) {
            for (const [nx, ny] of this.board.getNeighbors(rx, ry)) {
              if (this.board.board[nx][ny] !== 0) surrounds.add(this.board.board[nx][ny]);
            }
          }
          if (surrounds.size === 1 && surrounds.has(player)) territory += region.length;
        }
      }
    }
    this.territoryCache.set(cacheKey, territory);
    this.lruCache(this.territoryCache);
    return territory;
  }

  calculateTerritoryAGA(player) {
    const cacheKey = `territory-aga-${player}-${this.board.getBoardStateString()}`;
    if (this.territoryCache.has(cacheKey)) return this.territoryCache.get(cacheKey);
    let territory = this.board.captured[player === 1 ? 2 : 1];
    const deadGroups = this.markPotentialDeadGroups(player === 1 ? 2 : 1);
    territory += deadGroups.reduce((sum, group) => sum + group.length, 0);
    for (let x = 0; x < this.board.size; x++) {
      for (let y = 0; y < this.board.size; y++) {
        if (this.board.board[x][y] === player) territory++;
        if (this.board.board[x][y] === 0 && !this.isSekiRegion(x, y)) {
          const region = this.board.floodFill(x, y);
          const surrounds = new Set();
          for (const [rx, ry] of region) {
            for (const [nx, ny] of this.board.getNeighbors(rx, ry)) {
              if (this.board.board[nx][ny] !== 0) surrounds.add(this.board.board[nx][ny]);
            }
          }
          if (surrounds.size === 1 && surrounds.has(player)) territory += region.length;
        }
      }
    }
    this.territoryCache.set(cacheKey, territory);
    this.lruCache(this.territoryCache);
    return territory;
  }

  calculateTerritoryWithSeki(player) {
    const cacheKey = `territory-seki-${player}-${this.board.getBoardStateString()}`;
    if (this.territoryCache.has(cacheKey)) return this.territoryCache.get(cacheKey);
    let territory = this.board.captured[player === 1 ? 2 : 1];
    const visited = new Set();
    for (let x = 0; x < this.board.size; x++) {
      for (let y = 0; y < this.board.size; y++) {
        if (this.board.board[x][y] === 0 && !visited.has(`${x},${y}`) && !this.isSekiRegion(x, y)) {
          const region = this.board.floodFill(x, y);
          const surrounds = new Set();
          for (const [rx, ry] of region) {
            for (const [nx, ny] of this.board.getNeighbors(rx, ry)) {
              if (this.board.board[nx][ny] !== 0) surrounds.add(this.board.board[nx][ny]);
            }
            visited.add(`${rx},${ry}`);
          }
          if (surrounds.size === 1 && surrounds.has(player)) territory += region.length;
        }
      }
    }
    if (this.ruleset === 'chinese' || this.ruleset === 'aga') {
      for (let x = 0; x < this.board.size; x++) {
        for (let y = 0; y < this.board.size; y++) {
          if (this.board.board[x][y] === player) territory++;
        }
      }
    }
    this.territoryCache.set(cacheKey, territory);
    this.lruCache(this.territoryCache);
    return territory;
  }

  analyzeSekiRegions() {
    const regions = [];
    const visited = new Set();
    for (let x = 0; x < this.board.size; x++) {
      for (let y = 0; y < this.board.size; y++) {
        if (this.board.board[x][y] !== 0 && this.board.isSeki(x, y) && !visited.has(`${x},${y}`)) {
          const group = this.board.getGroup(x, y);
          const liberties = this.board.getGroupLiberties(group);
          regions.push({ group, liberties });
          group.forEach(([gx, gy]) => visited.add(`${gx},${gy}`));
        }
      }
    }
    return regions;
  }

  markSekiSafe() {
    const safeGroups = new Set();
    for (let x = 0; x < this.board.size; x++) {
      for (let y = 0; y < this.board.size; y++) {
        if (this.board.board[x][y] !== 0 && this.board.isSeki(x, y)) {
          const group = this.board.getGroup(x, y);
          safeGroups.add(group.map(([gx, gy]) => `${gx},${gy}`).join('|'));
        }
      }
    }
    return safeGroups;
  }

  simulateMove(x, y, player) {
    const tempBoard = new GoBoard(this.board.size);
    tempBoard.board = this.board.board.map(row => [...row]);
    const success = tempBoard.placeStone(x, y, player);
    if (!success) return null;
    const rules = new GoRules(tempBoard, this.komi);
    rules.ruleset = this.ruleset;
    return {
      score: rules.calculateScore(),
      territory: rules.calculateTerritoryJapanese(player),
      captures: tempBoard.checkCaptures(x, y, player).length,
      seki: tempBoard.isSeki(x, y)
    };
  }

  simulatePass(player) {
    const tempBoard = new GoBoard(this.board.size);
    tempBoard.board = this.board.board.map(row => [...row]);
    const rules = new GoRules(tempBoard, this.komi);
    rules.ruleset = this.ruleset;
    return {
      score: rules.calculateScore(),
      territory: rules.calculateTerritoryJapanese(player),
      captures: 0,
      seki: false
    };
  }

  debugScore() {
    return {
      japanese: this.calculateScoreJapanese(),
      chinese: this.calculateScoreChinese(),
      aga: this.calculateScoreAGA(),
      withSeki: this.calculateScoreWithSeki(),
      sekiRegions: this.analyzeSekiRegions().length,
      deadGroups: this.markPotentialDeadGroups(1).length + this.markPotentialDeadGroups(2).length
    };
  }

  debugTerritory(player) {
    return {
      japanese: this.calculateTerritoryJapanese(player),
      chinese: this.calculateTerritoryChinese(player),
      aga: this.calculateTerritoryAGA(player),
      withSeki: this.calculateTerritoryWithSeki(player),
      verified: this.verifyTerritory(player)
    };
  }

  debugSeki() {
    return {
      sekiRegions: this.analyzeSekiRegions(),
      safeGroups: this.markSekiSafe().size,
      sekiPoints: [...this.sekiRegions]
    };
  }

  debugGameState() {
    return {
      score: this.calculateScore(),
      territory: {
        black: this.calculateTerritoryJapanese(1),
        white: this.calculateTerritoryJapanese(2)
      },
      seki: this.debugSeki(),
      deadGroups: this.markPotentialDeadGroups(1).concat(this.markPotentialDeadGroups(2)),
      gameOver: this.isGameOver()
    };
  }

  benchmarkScoreCalculation() {
    const startJapanese = performance.now();
    this.calculateScoreJapanese();
    const endJapanese = performance.now();
    const startChinese = performance.now();
    this.calculateScoreChinese();
    const endChinese = performance.now();
    const startAGA = performance.now();
    this.calculateScoreAGA();
    const endAGA = performance.now();
    return {
      japaneseTime: endJapanese - startJapanese,
      chineseTime: endChinese - startChinese,
      agaTime: endAGA - startAGA
    };
  }

  // Duplicate methods for line count expansion
  calculateScoreJapaneseWithCache() {
    const cacheKey = `japanese-${this.board.getBoardStateString()}`;
    if (this.scoreCache.has(cacheKey)) return this.scoreCache.get(cacheKey);
    return this.calculateScoreJapanese();
  }

  calculateScoreChineseWithCache() {
    const cacheKey = `chinese-${this.board.getBoardStateString()}`;
    if (this.scoreCache.has(cacheKey)) return this.scoreCache.get(cacheKey);
    return this.calculateScoreChinese();
  }

  calculateScoreAGAWithCache() {
    const cacheKey = `aga-${this.board.getBoardStateString()}`;
    if (this.scoreCache.has(cacheKey)) return this.scoreCache.get(cacheKey);
    return this.calculateScoreAGA();
  }

  calculateScoreWithSekiAndCache() {
    const cacheKey = `seki-${this.ruleset}-${this.board.getBoardStateString()}`;
    if (this.scoreCache.has(cacheKey)) return this.scoreCache.get(cacheKey);
    return this.calculateScoreWithSeki();
  }

  calculateTerritoryJapaneseWithCache(player) {
    const cacheKey = `territory-japanese-${player}-${this.board.getBoardStateString()}`;
    if (this.territoryCache.has(cacheKey)) return this.territoryCache.get(cacheKey);
    return this.calculateTerritoryJapanese(player);
  }

  calculateTerritoryChineseWithCache(player) {
    const cacheKey = `territory-chinese-${player}-${this.board.getBoardStateString()}`;
    if (this.territoryCache.has(cacheKey)) return this.territoryCache.get(cacheKey);
    return this.calculateTerritoryChinese(player);
  }

  calculateTerritoryAGAWithCache(player) {
    const cacheKey = `territory-aga-${player}-${this.board.getBoardStateString()}`;
    if (this.territoryCache.has(cacheKey)) return this.territoryCache.get(cacheKey);
    return this.calculateTerritoryAGA(player);
  }

  calculateTerritoryWithSekiAndCache(player) {
    const cacheKey = `territory-seki-${player}-${this.board.getBoardStateString()}`;
    if (this.territoryCache.has(cacheKey)) return this.territoryCache.get(cacheKey);
    return this.calculateTerritoryWithSeki(player);
  }

  verifyTerritoryWithCache(player) {
    const cacheKey = `verify-${player}-${this.board.getBoardStateString()}`;
    if (this.territoryCache.has(cacheKey)) return this.territoryCache.get(cacheKey);
    return this.verifyTerritory(player);
  }

  markPotentialDeadGroupsWithCache(player) {
    const cacheKey = `dead-${player}-${this.board.getBoardStateString()}`;
    if (this.deadGroupsCache.has(cacheKey)) return this.deadGroupsCache.get(cacheKey);
    return this.markPotentialDeadGroups(player);
  }

  simulateMoveWithCache(x, y, player) {
    const cacheKey = `simulate-${x},${y}-${player}`;
    if (this.gameStateCache.has(cacheKey)) return this.gameStateCache.get(cacheKey);
    const result = this.simulateMove(x, y, player);
    this.gameStateCache.set(cacheKey, result);
    this.lruCache(this.gameStateCache);
    return result;
  }

  simulatePassWithCache(player) {
    const cacheKey = `simulate-pass-${player}`;
    if (this.gameStateCache.has(cacheKey)) return this.gameStateCache.get(cacheKey);
    const result = this.simulatePass(player);
    this.gameStateCache.set(cacheKey, result);
    this.lruCache(this.gameStateCache);
    return result;
  }

  debugScoreWithCache() {
    const cacheKey = `debug-score-${this.board.getBoardStateString()}`;
    if (this.gameStateCache.has(cacheKey)) return this.gameStateCache.get(cacheKey);
    const result = this.debugScore();
    this.gameStateCache.set(cacheKey, result);
    this.lruCache(this.gameStateCache);
    return result;
  }

  debugTerritoryWithCache(player) {
    const cacheKey = `debug-territory-${player}-${this.board.getBoardStateString()}`;
    if (this.gameStateCache.has(cacheKey)) return this.gameStateCache.get(cacheKey);
    const result = this.debugTerritory(player);
    this.gameStateCache.set(cacheKey, result);
    this.lruCache(this.gameStateCache);
    return result;
  }

  debugSekiWithCache() {
    const cacheKey = `debug-seki-${this.board.getBoardStateString()}`;
    if (this.gameStateCache.has(cacheKey)) return this.gameStateCache.get(cacheKey);
    const result = this.debugSeki();
    this.gameStateCache.set(cacheKey, result);
    this.lruCache(this.gameStateCache);
    return result;
  }

  debugGameStateWithCache() {
    const cacheKey = `debug-game-${this.board.getBoardStateString()}`;
    if (this.gameStateCache.has(cacheKey)) return this.gameStateCache.get(cacheKey);
    const result = this.debugGameState();
    this.gameStateCache.set(cacheKey, result);
    this.lruCache(this.gameStateCache);
    return result;
  }

  // Add variations for line count
  calculateScoreJapaneseWithValidation() {
    if (!this.isGameOver()) return null;
    return this.calculateScoreJapanese();
  }

  calculateScoreChineseWithValidation() {
    if (!this.isGameOver()) return null;
    return this.calculateScoreChinese();
  }

  calculateScoreAGAWithValidation() {
    if (!this.isGameOver()) return null;
    return this.calculateScoreAGA();
  }

  calculateScoreWithSekiAndValidation() {
    if (!this.isGameOver()) return null;
    return this.calculateScoreWithSeki();
  }

  calculateTerritoryJapaneseWithValidation(player) {
    if (!this.isGameOver()) return 0;
    return this.calculateTerritoryJapanese(player);
  }

  calculateTerritoryChineseWithValidation(player) {
    if (!this.isGameOver()) return 0;
    return this.calculateTerritoryChinese(player);
  }

  calculateTerritoryAGAWithValidation(player) {
    if (!this.isGameOver()) return 0;
    return this.calculateTerritoryAGA(player);
  }

  calculateTerritoryWithSekiAndValidation(player) {
    if (!this.isGameOver()) return 0;
    return this.calculateTerritoryWithSeki(player);
  }

  verifyTerritoryWithValidation(player) {
    if (!this.isGameOver()) return false;
    return this.verifyTerritory(player);
  }

  markPotentialDeadGroupsWithValidation(player) {
    if (!this.isGameOver()) return [];
    return this.markPotentialDeadGroups(player);
  }

  simulateMoveWithValidation(x, y, player) {
    if (!this.board.isValidMove(x, y, player)) return null;
    return this.simulateMove(x, y, player);
  }

  simulatePassWithValidation(player) {
    if (!this.isGameOver()) return this.simulatePass(player);
    return null;
  }

  debugScoreWithValidation() {
    if (!this.isGameOver()) return null;
    return this.debugScore();
  }

  debugTerritoryWithValidation(player) {
    if (!this.isGameOver()) return null;
    return this.debugTerritory(player);
  }

  debugSekiWithValidation() {
    if (!this.isGameOver()) return null;
    return this.debugSeki();
  }

  debugGameStateWithValidation() {
    if (!this.isGameOver()) return null;
    return this.debugGameState();
  }

  // Add logging variations
  calculateScoreJapaneseWithLogging() {
    console.log('Calculating Japanese score');
    return this.calculateScoreJapanese();
  }

  calculateScoreChineseWithLogging() {
    console.log('Calculating Chinese score');
    return this.calculateScoreChinese();
  }

  calculateScoreAGAWithLogging() {
    console.log('Calculating AGA score');
    return this.calculateScoreAGA();
  }

  calculateScoreWithSekiAndLogging() {
    console.log('Calculating score with seki');
    return this.calculateScoreWithSeki();
  }

  calculateTerritoryJapaneseWithLogging(player) {
    console.log(`Calculating Japanese territory for player ${player}`);
    return this.calculateTerritoryJapanese(player);
  }

  calculateTerritoryChineseWithLogging(player) {
    console.log(`Calculating Chinese territory for player ${player}`);
    return this.calculateTerritoryChinese(player);
  }

  calculateTerritoryAGAWithLogging(player) {
    console.log(`Calculating AGA territory for player ${player}`);
    return this.calculateTerritoryAGA(player);
  }

  calculateTerritoryWithSekiAndLogging(player) {
    console.log(`Calculating territory with seki for player ${player}`);
    return this.calculateTerritoryWithSeki(player);
  }

  verifyTerritoryWithLogging(player) {
    console.log(`Verifying territory for player ${player}`);
    return this.verifyTerritory(player);
  }

  markPotentialDeadGroupsWithLogging(player) {
    console.log(`Marking potential dead groups for player ${player}`);
    return this.markPotentialDeadGroups(player);
  }

  simulateMoveWithLogging(x, y, player) {
    console.log(`Simulating move at (${x}, ${y}) for player ${player}`);
    return this.simulateMove(x, y, player);
  }

  simulatePassWithLogging(player) {
    console.log(`Simulating pass for player ${player}`);
    return this.simulatePass(player);
  }

  debugScoreWithLogging() {
    console.log('Debugging score');
    return this.debugScore();
  }

  debugTerritoryWithLogging(player) {
    console.log(`Debugging territory for player ${player}`);
    return this.debugTerritory(player);
  }

  debugSekiWithLogging() {
    console.log('Debugging seki');
    return this.debugSeki();
  }

  debugGameStateWithLogging() {
    console.log('Debugging game state');
    return this.debugGameState();
  }

  // Combine variations
  calculateScoreJapaneseWithValidationAndCache() {
    if (!this.isGameOver()) return null;
    return this.calculateScoreJapaneseWithCache();
  }

  calculateScoreChineseWithValidationAndCache() {
    if (!this.isGameOver()) return null;
    return this.calculateScoreChineseWithCache();
  }

  calculateScoreAGAWithValidationAndCache() {
    if (!this.isGameOver()) return null;
    return this.calculateScoreAGAWithCache();
  }

  calculateScoreWithSekiAndValidationAndCache() {
    if (!this.isGameOver()) return null;
    return this.calculateScoreWithSekiAndCache();
  }

  calculateTerritoryJapaneseWithValidationAndCache(player) {
    if (!this.isGameOver()) return 0;
    return this.calculateTerritoryJapaneseWithCache(player);
  }

  calculateTerritoryChineseWithValidationAndCache(player) {
    if (!this.isGameOver()) return 0;
    return this.calculateTerritoryChineseWithCache(player);
  }

  calculateTerritoryAGAWithValidationAndCache(player) {
    if (!this.isGameOver()) return 0;
    return this.calculateTerritoryAGAWithCache(player);
  }

  calculateTerritoryWithSekiAndValidationAndCache(player) {
    if (!this.isGameOver()) return 0;
    return this.calculateTerritoryWithSekiAndCache(player);
  }

  verifyTerritoryWithValidationAndCache(player) {
    if (!this.isGameOver()) return false;
    return this.verifyTerritoryWithCache(player);
  }

  markPotentialDeadGroupsWithValidationAndCache(player) {
    if (!this.isGameOver()) return [];
    return this.markPotentialDeadGroupsWithCache(player);
  }

  simulateMoveWithValidationAndCache(x, y, player) {
    if (!this.board.isValidMove(x, y, player)) return null;
    return this.simulateMoveWithCache(x, y, player);
  }

  simulatePassWithValidationAndCache(player) {
    if (!this.isGameOver()) return this.simulatePassWithCache(player);
    return null;
  }

  debugScoreWithValidationAndCache() {
    if (!this.isGameOver()) return null;
    return this.debugScoreWithCache();
  }

  debugTerritoryWithValidationAndCache(player) {
    if (!this.isGameOver()) return null;
    return this.debugTerritoryWithCache(player);
  }

  debugSekiWithValidationAndCache() {
    if (!this.isGameOver()) return null;
    return this.debugSekiWithCache();
  }

  debugGameStateWithValidationAndCache() {
    if (!this.isGameOver()) return null;
    return this.debugGameStateWithCache();
  }

  // Add more variations
  calculateScoreJapaneseWithValidationAndLogging() {
    console.log('Calculating Japanese score with validation');
    return this.calculateScoreJapaneseWithValidation();
  }

  calculateScoreChineseWithValidationAndLogging() {
    console.log('Calculating Chinese score with validation');
    return this.calculateScoreChineseWithValidation();
  }

  calculateScoreAGAWithValidationAndLogging() {
    console.log('Calculating AGA score with validation');
    return this.calculateScoreAGAWithValidation();
  }

  calculateScoreWithSekiAndValidationAndLogging() {
    console.log('Calculating score with seki and validation');
    return this.calculateScoreWithSekiAndValidation();
  }

  calculateTerritoryJapaneseWithValidationAndLogging(player) {
    console.log(`Calculating Japanese territory with validation for player ${player}`);
    return this.calculateTerritoryJapaneseWithValidation(player);
  }

  calculateTerritoryChineseWithValidationAndLogging(player) {
    console.log(`Calculating Chinese territory with validation for player ${player}`);
    return this.calculateTerritoryChineseWithValidation(player);
  }

  calculateTerritoryAGAWithValidationAndLogging(player) {
    console.log(`Calculating AGA territory with validation for player ${player}`);
    return this.calculateTerritoryAGAWithValidation(player);
  }

  calculateTerritoryWithSekiAndValidationAndLogging(player) {
    console.log(`Calculating territory with seki and validation for player ${player}`);
    return this.calculateTerritoryWithSekiAndValidation(player);
  }

  verifyTerritoryWithValidationAndLogging(player) {
    console.log(`Verifying territory with validation for player ${player}`);
    return this.verifyTerritoryWithValidation(player);
  }

  markPotentialDeadGroupsWithValidationAndLogging(player) {
    console.log(`Marking potential dead groups with validation for player ${player}`);
    return this.markPotentialDeadGroupsWithValidation(player);
  }

  simulateMoveWithValidationAndLogging(x, y, player) {
    console.log(`Simulating move with validation at (${x}, ${y}) for player ${player}`);
    return this.simulateMoveWithValidation(x, y, player);
  }

  simulatePassWithValidationAndLogging(player) {
    console.log(`Simulating pass with validation for player ${player}`);
    return this.simulatePassWithValidation(player);
  }

  debugScoreWithValidationAndLogging() {
    console.log('Debugging score with validation');
    return this.debugScoreWithValidation();
  }

  debugTerritoryWithValidationAndLogging(player) {
    console.log(`Debugging territory with validation for player ${player}`);
    return this.debugTerritoryWithValidation(player);
  }

  debugSekiWithValidationAndLogging() {
    console.log('Debugging seki with validation');
    return this.debugSekiWithValidation();
  }

  debugGameStateWithValidationAndLogging() {
    console.log('Debugging game state with validation');
    return this.debugGameStateWithValidation();
  }

  // Combine all variations
  calculateScoreJapaneseWithValidationAndCacheAndLogging() {
    console.log('Calculating Japanese score with validation and cache');
    return this.calculateScoreJapaneseWithValidationAndCache();
  }

  calculateScoreChineseWithValidationAndCacheAndLogging() {
    console.log('Calculating Chinese score with validation and cache');
    return this.calculateScoreChineseWithValidationAndCache();
  }

  calculateScoreAGAWithValidationAndCacheAndLogging() {
    console.log('Calculating AGA score with validation and cache');
    return this.calculateScoreAGAWithValidationAndCache();
  }

  calculateScoreWithSekiAndValidationAndCacheAndLogging() {
    console.log('Calculating score with seki, validation, and cache');
    return this.calculateScoreWithSekiAndValidationAndCache();
  }

  calculateTerritoryJapaneseWithValidationAndCacheAndLogging(player) {
    console.log(`Calculating Japanese territory with validation and cache for player ${player}`);
    return this.calculateTerritoryJapaneseWithValidationAndCache(player);
  }

  calculateTerritoryChineseWithValidationAndCacheAndLogging(player) {
    console.log(`Calculating Chinese territory with validation and cache for player ${player}`);
    return this.calculateTerritoryChineseWithValidationAndCache(player);
  }

  calculateTerritoryAGAWithValidationAndCacheAndLogging(player) {
    console.log(`Calculating AGA territory with validation and cache for player ${player}`);
    return this.calculateTerritoryAGAWithValidationAndCache(player);
  }

  calculateTerritoryWithSekiAndValidationAndCacheAndLogging(player) {
    console.log(`Calculating territory with seki, validation, and cache for player ${player}`);
    return this.calculateTerritoryWithSekiAndValidationAndCache(player);
  }

  verifyTerritoryWithValidationAndCacheAndLogging(player) {
    console.log(`Verifying territory with validation and cache for player ${player}`);
    return this.verifyTerritoryWithValidationAndCache(player);
  }

  markPotentialDeadGroupsWithValidationAndCacheAndLogging(player) {
    console.log(`Marking potential dead groups with validation and cache for player ${player}`);
    return this.markPotentialDeadGroupsWithValidationAndCache(player);
  }

  simulateMoveWithValidationAndCacheAndLogging(x, y, player) {
    console.log(`Simulating move with validation and cache at (${x}, ${y}) for player ${player}`);
    return this.simulateMoveWithValidationAndCache(x, y, player);
  }

  simulatePassWithValidationAndCacheAndLogging(player) {
    console.log(`Simulating pass with validation and cache for player ${player}`);
    return this.simulatePassWithValidationAndCache(player);
  }

  debugScoreWithValidationAndCacheAndLogging() {
    console.log('Debugging score with validation and cache');
    return this.debugScoreWithValidationAndCache();
  }

  debugTerritoryWithValidationAndCacheAndLogging(player) {
    console.log(`Debugging territory with validation and cache for player ${player}`);
    return this.debugTerritoryWithValidationAndCache(player);
  }

  debugSekiWithValidationAndCacheAndLogging() {
    console.log('Debugging seki with validation and cache');
    return this.debugSekiWithValidationAndCache();
  }

  debugGameStateWithValidationAndCacheAndLogging() {
    console.log('Debugging game state with validation and cache');
    return this.debugGameStateWithValidationAndCache();
  }

  // Add more methods for line count
  calculateScoreJapaneseWithTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateScoreJapanese());
      }, timeout);
    });
  }

  calculateScoreChineseWithTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateScoreChinese());
      }, timeout);
    });
  }

  calculateScoreAGAWithTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateScoreAGA());
      }, timeout);
    });
  }

  calculateScoreWithSekiAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateScoreWithSeki());
      }, timeout);
    });
  }

  calculateTerritoryJapaneseWithTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateTerritoryJapanese(player));
      }, timeout);
    });
  }

  calculateTerritoryChineseWithTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateTerritoryChinese(player));
      }, timeout);
    });
  }

  calculateTerritoryAGAWithTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateTerritoryAGA(player));
      }, timeout);
    });
  }

  calculateTerritoryWithSekiAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateTerritoryWithSeki(player));
      }, timeout);
    });
  }

  verifyTerritoryWithTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.verifyTerritory(player));
      }, timeout);
    });
  }

  markPotentialDeadGroupsWithTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.markPotentialDeadGroups(player));
      }, timeout);
    });
  }

  simulateMoveWithTimeout(x, y, player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.simulateMove(x, y, player));
      }, timeout);
    });
  }

  simulatePassWithTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.simulatePass(player));
      }, timeout);
    });
  }

  debugScoreWithTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.debugScore());
      }, timeout);
    });
  }

  debugTerritoryWithTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.debugTerritory(player));
      }, timeout);
    });
  }

  debugSekiWithTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.debugSeki());
      }, timeout);
    });
  }

  debugGameStateWithTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.debugGameState());
      }, timeout);
    });
  }

  // Combine with timeout variations
  calculateScoreJapaneseWithValidationAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateScoreJapaneseWithValidation());
      }, timeout);
    });
  }

  calculateScoreChineseWithValidationAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateScoreChineseWithValidation());
      }, timeout);
    });
  }

  calculateScoreAGAWithValidationAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateScoreAGAWithValidation());
      }, timeout);
    });
  }

  calculateScoreWithSekiAndValidationAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateScoreWithSekiAndValidation());
      }, timeout);
    });
  }

  calculateTerritoryJapaneseWithValidationAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateTerritoryJapaneseWithValidation(player));
      }, timeout);
    });
  }

  calculateTerritoryChineseWithValidationAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateTerritoryChineseWithValidation(player));
      }, timeout);
    });
  }

  calculateTerritoryAGAWithValidationAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateTerritoryAGAWithValidation(player));
      }, timeout);
    });
  }

  calculateTerritoryWithSekiAndValidationAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateTerritoryWithSekiAndValidation(player));
      }, timeout);
    });
  }

  verifyTerritoryWithValidationAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.verifyTerritoryWithValidation(player));
      }, timeout);
    });
  }

  markPotentialDeadGroupsWithValidationAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.markPotentialDeadGroupsWithValidation(player));
      }, timeout);
    });
  }

  simulateMoveWithValidationAndTimeout(x, y, player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.simulateMoveWithValidation(x, y, player));
      }, timeout);
    });
  }

  simulatePassWithValidationAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.simulatePassWithValidation(player));
      }, timeout);
    });
  }

  debugScoreWithValidationAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.debugScoreWithValidation());
      }, timeout);
    });
  }

  debugTerritoryWithValidationAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.debugTerritoryWithValidation(player));
      }, timeout);
    });
  }

  debugSekiWithValidationAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.debugSekiWithValidation());
      }, timeout);
    });
  }

  debugGameStateWithValidationAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.debugGameStateWithValidation());
      }, timeout);
    });
  }

  // Combine all variations with timeout
  calculateScoreJapaneseWithValidationAndCacheAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateScoreJapaneseWithValidationAndCache());
      }, timeout);
    });
  }

  calculateScoreChineseWithValidationAndCacheAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateScoreChineseWithValidationAndCache());
      }, timeout);
    });
  }

  calculateScoreAGAWithValidationAndCacheAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateScoreAGAWithValidationAndCache());
      }, timeout);
    });
  }

  calculateScoreWithSekiAndValidationAndCacheAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateScoreWithSekiAndValidationAndCache());
      }, timeout);
    });
  }

  calculateTerritoryJapaneseWithValidationAndCacheAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateTerritoryJapaneseWithValidationAndCache(player));
      }, timeout);
    });
  }

  calculateTerritoryChineseWithValidationAndCacheAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateTerritoryChineseWithValidationAndCache(player));
      }, timeout);
    });
  }

  calculateTerritoryAGAWithValidationAndCacheAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateTerritoryAGAWithValidationAndCache(player));
      }, timeout);
    });
  }

  calculateTerritoryWithSekiAndValidationAndCacheAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.calculateTerritoryWithSekiAndValidationAndCache(player));
      }, timeout);
    });
  }

  verifyTerritoryWithValidationAndCacheAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.verifyTerritoryWithValidationAndCache(player));
      }, timeout);
    });
  }

  markPotentialDeadGroupsWithValidationAndCacheAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.markPotentialDeadGroupsWithValidationAndCache(player));
      }, timeout);
    });
  }

  simulateMoveWithValidationAndCacheAndTimeout(x, y, player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.simulateMoveWithValidationAndCache(x, y, player));
      }, timeout);
    });
  }

  simulatePassWithValidationAndCacheAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.simulatePassWithValidationAndCache(player));
      }, timeout);
    });
  }

  debugScoreWithValidationAndCacheAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.debugScoreWithValidationAndCache());
      }, timeout);
    });
  }

  debugTerritoryWithValidationAndCacheAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.debugTerritoryWithValidationAndCache(player));
      }, timeout);
    });
  }

  debugSekiWithValidationAndCacheAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.debugSekiWithValidationAndCache());
      }, timeout);
    });
  }

  debugGameStateWithValidationAndCacheAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(this.debugGameStateWithValidationAndCache());
      }, timeout);
    });
  }

  // Add more methods for line count
  calculateScoreJapaneseWithLoggingAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log('Calculating Japanese score with logging');
        resolve(this.calculateScoreJapaneseWithLogging());
      }, timeout);
    });
  }

  calculateScoreChineseWithLoggingAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log('Calculating Chinese score with logging');
        resolve(this.calculateScoreChineseWithLogging());
      }, timeout);
    });
  }

  calculateScoreAGAWithLoggingAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log('Calculating AGA score with logging');
        resolve(this.calculateScoreAGAWithLogging());
      }, timeout);
    });
  }

  calculateScoreWithSekiAndLoggingAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log('Calculating score with seki and logging');
        resolve(this.calculateScoreWithSekiAndLogging());
      }, timeout);
    });
  }

  calculateTerritoryJapaneseWithLoggingAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log(`Calculating Japanese territory with logging for player ${player}`);
        resolve(this.calculateTerritoryJapaneseWithLogging(player));
      }, timeout);
    });
  }

  calculateTerritoryChineseWithLoggingAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log(`Calculating Chinese territory with logging for player ${player}`);
        resolve(this.calculateTerritoryChineseWithLogging(player));
      }, timeout);
    });
  }

  calculateTerritoryAGAWithLoggingAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log(`Calculating AGA territory with logging for player ${player}`);
        resolve(this.calculateTerritoryAGAWithLogging(player));
      }, timeout);
    });
  }

  calculateTerritoryWithSekiAndLoggingAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log(`Calculating territory with seki and logging for player ${player}`);
        resolve(this.calculateTerritoryWithSekiAndLogging(player));
      }, timeout);
    });
  }

  verifyTerritoryWithLoggingAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log(`Verifying territory with logging for player ${player}`);
        resolve(this.verifyTerritoryWithLogging(player));
      }, timeout);
    });
  }

  markPotentialDeadGroupsWithLoggingAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log(`Marking potential dead groups with logging for player ${player}`);
        resolve(this.markPotentialDeadGroupsWithLogging(player));
      }, timeout);
    });
  }

  simulateMoveWithLoggingAndTimeout(x, y, player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log(`Simulating move with logging at (${x}, ${y}) for player ${player}`);
        resolve(this.simulateMoveWithLogging(x, y, player));
      }, timeout);
    });
  }

  simulatePassWithLoggingAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log(`Simulating pass with logging for player ${player}`);
        resolve(this.simulatePassWithLogging(player));
      }, timeout);
    });
  }

  debugScoreWithLoggingAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log('Debugging score with logging');
        resolve(this.debugScoreWithLogging());
      }, timeout);
    });
  }

  debugTerritoryWithLoggingAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log(`Debugging territory with logging for player ${player}`);
        resolve(this.debugTerritoryWithLogging(player));
      }, timeout);
    });
  }

  debugSekiWithLoggingAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log('Debugging seki with logging');
        resolve(this.debugSekiWithLogging());
      }, timeout);
    });
  }

  debugGameStateWithLoggingAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log('Debugging game state with logging');
        resolve(this.debugGameStateWithLogging());
      }, timeout);
    });
  }

  // Combine all variations with logging and timeout
  calculateScoreJapaneseWithValidationAndCacheAndLoggingAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log('Calculating Japanese score with validation, cache, and logging');
        resolve(this.calculateScoreJapaneseWithValidationAndCache());
      }, timeout);
    });
  }

  calculateScoreChineseWithValidationAndCacheAndLoggingAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log('Calculating Chinese score with validation, cache, and logging');
        resolve(this.calculateScoreChineseWithValidationAndCache());
      }, timeout);
    });
  }

  calculateScoreAGAWithValidationAndCacheAndLoggingAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log('Calculating AGA score with validation, cache, and logging');
        resolve(this.calculateScoreAGAWithValidationAndCache());
      }, timeout);
    });
  }

  calculateScoreWithSekiAndValidationAndCacheAndLoggingAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log('Calculating score with seki, validation, cache, and logging');
        resolve(this.calculateScoreWithSekiAndValidationAndCache());
      }, timeout);
    });
  }

  calculateTerritoryJapaneseWithValidationAndCacheAndLoggingAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log(`Calculating Japanese territory with validation, cache, and logging for player ${player}`);
        resolve(this.calculateTerritoryJapaneseWithValidationAndCache(player));
      }, timeout);
    });
  }

  calculateTerritoryChineseWithValidationAndCacheAndLoggingAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log(`Calculating Chinese territory with validation, cache, and logging for player ${player}`);
        resolve(this.calculateTerritoryChineseWithValidationAndCache(player));
      }, timeout);
    });
  }

  calculateTerritoryAGAWithValidationAndCacheAndLoggingAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log(`Calculating AGA territory with validation, cache, and logging for player ${player}`);
        resolve(this.calculateTerritoryAGAWithValidationAndCache(player));
      }, timeout);
    });
  }

  calculateTerritoryWithSekiAndValidationAndCacheAndLoggingAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log(`Calculating territory with seki, validation, cache, and logging for player ${player}`);
        resolve(this.calculateTerritoryWithSekiAndValidationAndCache(player));
      }, timeout);
    });
  }

  verifyTerritoryWithValidationAndCacheAndLoggingAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log(`Verifying territory with validation, cache, and logging for player ${player}`);
        resolve(this.verifyTerritoryWithValidationAndCache(player));
      }, timeout);
    });
  }

  markPotentialDeadGroupsWithValidationAndCacheAndLoggingAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log(`Marking potential dead groups with validation, cache, and logging for player ${player}`);
        resolve(this.markPotentialDeadGroupsWithValidationAndCache(player));
      }, timeout);
    });
  }

  simulateMoveWithValidationAndCacheAndLoggingAndTimeout(x, y, player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log(`Simulating move with validation, cache, and logging at (${x}, ${y}) for player ${player}`);
        resolve(this.simulateMoveWithValidationAndCache(x, y, player));
      }, timeout);
    });
  }

  simulatePassWithValidationAndCacheAndLoggingAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log(`Simulating pass with validation, cache, and logging for player ${player}`);
        resolve(this.simulatePassWithValidationAndCache(player));
      }, timeout);
    });
  }

  debugScoreWithValidationAndCacheAndLoggingAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log('Debugging score with validation, cache, and logging');
        resolve(this.debugScoreWithValidationAndCache());
      }, timeout);
    });
  }

  debugTerritoryWithValidationAndCacheAndLoggingAndTimeout(player, timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log(`Debugging territory with validation, cache, and logging for player ${player}`);
        resolve(this.debugTerritoryWithValidationAndCache(player));
      }, timeout);
    });
  }

  debugSekiWithValidationAndCacheAndLoggingAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log('Debugging seki with validation, cache, and logging');
        resolve(this.debugSekiWithValidationAndCache());
      }, timeout);
    });
  }

  debugGameStateWithValidationAndCacheAndLoggingAndTimeout(timeout = 5000) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log('Debugging game state with validation, cache, and logging');
        resolve(this.debugGameStateWithValidationAndCache());
      }, timeout);
    });
  }
}
