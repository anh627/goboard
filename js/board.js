export class GoBoard {
  constructor(size = 19) {
    if (![9, 13, 19].includes(size)) throw new Error('Invalid board size');
    this.size = size;
    this.board = Array(size).fill().map(() => Array(size).fill(0));
    this.bitBoardBlack = new BigInt64Array(1).fill(0n);
    this.bitBoardWhite = new BigInt64Array(1).fill(0n);
    this.koPoint = null;
    this.superKoHistory = new Map();
    this.emptyCells = Array.from({ length: size * size }, (_, i) => [Math.floor(i / size), i % size]);
    this.groupCache = new Map();
    this.libertyCache = new Map();
    this.eyeCache = new Map();
    this.territoryCache = new Map();
    this.sekiCache = new Map();
    this.stateCache = new Map();
    this.captured = { 1: 0, 2: 0 };
    this.moveHistory = [];
    this.bitMasks = Array(size).fill().map(() => Array(size).fill(0n));
    this.sekiGroups = new Set();
    this.lruCacheLimit = 1000;
    this.groupAnalysisCache = new Map();
    this.eyeAnalysisCache = new Map();
    this.initBitMasks();
    if (size <= 13) this.optimizeForSmallBoard();
  }

  initBitMasks() {
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        this.bitMasks[x][y] = 1n << BigInt(x * this.size + y);
      }
    }
  }

  coordsToBitIndex(x, y) {
    return BigInt(x * this.size + y);
  }

  indexToCoords(bitIndex) {
    bitIndex = Number(bitIndex);
    return [Math.floor(bitIndex / this.size), bitIndex % this.size];
  }

  isValidMove(x, y, player) {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size || this.board[x][y] !== 0) return false;
    const bitIndex = this.coordsToBitIndex(x, y);
    if ((this.bitBoardBlack | this.bitBoardWhite) & (1n << bitIndex)) return false;
    return true;
  }

  placeStone(x, y, player) {
    if (!this.isValidMove(x, y, player)) return false;
    const boardState = this.getBoardStateString();
    this.board[x][y] = player;
    const bitIndex = this.coordsToBitIndex(x, y);
    if (player === 1) this.bitBoardBlack |= 1n << bitIndex;
    else this.bitBoardWhite |= 1n << bitIndex;
    this.emptyCells = this.emptyCells.filter(([ex, ey]) => ex !== x || ey !== y);

    const captured = this.checkCaptures(x, y, player);
    captured.forEach(([i, j]) => {
      this.board[i][j] = 0;
      const capBitIndex = this.coordsToBitIndex(i, j);
      if (player === 1) this.bitBoardWhite &= ~(1n << capBitIndex);
      else this.bitBoardBlack &= ~(1n << capBitIndex);
      this.emptyCells.push([i, j]);
      this.captured[player]++;
    });

    const liberties = this.getLiberties(x, y);
    if (captured.length === 0 && liberties.length === 0) {
      this.revertMove(x, y, player);
      return false;
    }

    if (captured.length === 1 && this.checkKo(x, y)) {
      this.revertMove(x, y, player);
      return false;
    }

    const newBoardState = this.getBoardStateString();
    if (this.checkSuperKo(newBoardState)) {
      this.revertMove(x, y, player);
      return false;
    }
    this.superKoHistory.set(newBoardState, (this.superKoHistory.get(newBoardState) || 0) + 1);
    this.koPoint = captured.length === 1 ? [x, y] : null;
    this.moveHistory.push({ x, y, player, captured, state: boardState });
    this.updateSekiStatus();
    this.updateGroupAnalysisCache(x, y);
    this.manageCache();
    return true;
  }

  revertMove(x, y, player) {
    this.board[x][y] = 0;
    const bitIndex = this.coordsToBitIndex(x, y);
    if (player === 1) this.bitBoardBlack &= ~(1n << bitIndex);
    else this.bitBoardWhite &= ~(1n << bitIndex);
    this.emptyCells.push([x, y]);
  }

  getNeighbors(x, y) {
    return [
      [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]
    ].filter(([nx, ny]) => nx >= 0 && nx < this.size && ny >= 0 && ny < this.size);
  }

  getGroup(x, y) {
    const cacheKey = `${x},${y}`;
    if (this.groupCache.has(cacheKey)) return this.groupCache.get(cacheKey);
    const color = this.board[x][y];
    const group = [[x, y]];
    const visited = new Set([cacheKey]);
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      for (const [nx, ny] of this.getNeighbors(cx, cy)) {
        const key = `${nx},${ny}`;
        if (this.board[nx][ny] === color && !visited.has(key)) {
          group.push([nx, ny]);
          stack.push([nx, ny]);
          visited.add(key);
        }
      }
    }
    this.groupCache.set(cacheKey, group);
    this.lruCache(this.groupCache);
    return group;
  }

  getGroupBFS(x, y) {
    const cacheKey = `${x},${y}-bfs`;
    if (this.groupCache.has(cacheKey)) return this.groupCache.get(cacheKey);
    const color = this.board[x][y];
    const group = [[x, y]];
    const visited = new Set([`${x},${y}`]);
    const queue = [[x, y]];
    while (queue.length) {
      const [cx, cy] = queue.shift();
      for (const [nx, ny] of this.getNeighbors(cx, cy)) {
        const key = `${nx},${ny}`;
        if (this.board[nx][ny] === color && !visited.has(key)) {
          group.push([nx, ny]);
          queue.push([nx, ny]);
          visited.add(key);
        }
      }
    }
    this.groupCache.set(cacheKey, group);
    this.lruCache(this.groupCache);
    return group;
  }

  getLiberties(x, y) {
    const cacheKey = `${x},${y}-liberties`;
    if (this.libertyCache.has(cacheKey)) return this.libertyCache.get(cacheKey);
    const group = this.getGroup(x, y);
    const liberties = new Set();
    for (const [gx, gy] of group) {
      for (const [nx, ny] of this.getNeighbors(gx, gy)) {
        if (this.board[nx][ny] === 0) liberties.add(`${nx},${ny}`);
      }
    }
    const result = Array.from(liberties).map(s => s.split(',').map(Number));
    this.libertyCache.set(cacheKey, result);
    this.lruCache(this.libertyCache);
    return result;
  }

  getLibertiesBit(x, y) {
    const cacheKey = `${x},${y}-liberties-bit`;
    if (this.libertyCache.has(cacheKey)) return this.libertyCache.get(cacheKey);
    const group = this.getGroup(x, y);
    let libertyBits = 0n;
    for (const [gx, gy] of group) {
      for (const bitIndex of this.getBitNeighbors(gx, gy)) {
        if (!(this.bitBoardBlack | this.bitBoardWhite & (1n << bitIndex))) {
          libertyBits |= 1n << bitIndex;
        }
      }
    }
    const result = [];
    for (let i = 0; i < this.size * this.size; i++) {
      if (libertyBits & (1n << BigInt(i))) result.push(this.indexToCoords(i));
    }
    this.libertyCache.set(cacheKey, result);
    this.lruCache(this.libertyCache);
    return result;
  }

  checkCaptures(x, y, player) {
    const opponent = player === 1 ? 2 : 1;
    let captured = [];
    for (const [nx, ny] of this.getNeighbors(x, y)) {
      if (this.board[nx][ny] === opponent) {
        const group = this.getGroup(nx, ny);
        if (this.getLiberties(nx, ny).length === 0) captured.push(...group);
      }
    }
    return captured;
  }

  checkCapturesBit(x, y, player) {
    const opponent = player === 1 ? 2 : 1;
    let captured = [];
    for (const bitIndex of this.getBitNeighbors(x, y)) {
      const [nx, ny] = this.indexToCoords(bitIndex);
      if (this.board[nx][ny] === opponent) {
        const group = this.getGroupBit(nx, ny);
        if (this.getLibertiesBit(nx, ny).length === 0) {
          for (let i = 0; i < this.size * this.size; i++) {
            if (group[0] & (1n << BigInt(i))) captured.push(this.indexToCoords(i));
          }
        }
      }
    }
    return captured;
  }

  checkKo(x, y) {
    return this.koPoint && x === this.koPoint[0] && y === this.koPoint[1];
  }

  checkSuperKo(state) {
    return this.superKoHistory.has(state) && this.superKoHistory.get(state) >= 1;
  }

  checkPositionalSuperKo(state) {
    return this.superKoHistory.has(state);
  }

  checkSituationalSuperKo(state, player) {
    const key = `${state}-${player}`;
    return this.stateCache.has(key) && this.stateCache.get(key) >= 1;
  }

  checkTripleKo() {
    for (const [, count] of this.superKoHistory) {
      if (count >= 3) return true;
    }
    return false;
  }

  getBoardStateString() {
    return this.board.flat().join('');
  }

  lruCache(cache) {
    if (cache.size > this.lruCacheLimit) {
      const keys = [...cache.keys()];
      cache.delete(keys[0]);
    }
  }

  manageCache() {
    this.lruCache(this.groupCache);
    this.lruCache(this.libertyCache);
    this.lruCache(this.eyeCache);
    this.lruCache(this.territoryCache);
    this.lruCache(this.sekiCache);
    this.lruCache(this.stateCache);
    this.lruCache(this.groupAnalysisCache);
    this.lruCache(this.eyeAnalysisCache);
  }

  clearCaches() {
    this.groupCache.clear();
    this.libertyCache.clear();
    this.eyeCache.clear();
    this.territoryCache.clear();
    this.sekiCache.clear();
    this.stateCache.clear();
    this.groupAnalysisCache.clear();
    this.eyeAnalysisCache.clear();
  }

  invalidateCacheRegion(x, y) {
    const neighbors = this.getNeighbors(x, y);
    neighbors.forEach(([nx, ny]) => {
      this.groupCache.delete(`${nx},${ny}`);
      this.libertyCache.delete(`${nx},${ny}-liberties`);
      this.eyeCache.delete(`${nx},${ny}-trueEye`);
      this.eyeCache.delete(`${nx},${ny}-falseEye`);
      this.sekiCache.delete(`${nx},${ny}-seki`);
    });
  }

  isSeki(x, y) {
    const cacheKey = `${x},${y}-seki`;
    if (this.sekiCache.has(cacheKey)) return this.sekiCache.get(cacheKey);
    const group = this.getGroup(x, y);
    const liberties = this.getLiberties(x, y);
    if (liberties.length === 2) {
      for (const [lx, ly] of liberties) {
        for (const [nx, ny] of this.getNeighbors(lx, ly)) {
          if (this.board[nx][ny] !== 0 && this.board[nx][ny] !== this.board[x][y]) {
            const opponentGroup = this.getGroup(nx, ny);
            if (this.getGroupLiberties(opponentGroup).length === 2) {
              const groupKey = group.map(([gx, gy]) => `${gx},${gy}`).join('|');
              this.sekiGroups.add(groupKey);
              this.sekiCache.set(cacheKey, true);
              return true;
            }
          }
        }
      }
    }
    this.sekiCache.set(cacheKey, false);
    return false;
  }

  updateSekiStatus() {
    this.sekiGroups.clear();
    this.sekiCache.clear();
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        if (this.board[x][y] !== 0) this.isSeki(x, y);
      }
    }
  }

  analyzeSekiRegions() {
    const regions = [];
    const visited = new Set();
    for (const groupKey of this.sekiGroups) {
      const group = groupKey.split('|').map(s => s.split(',').map(Number));
      const liberties = this.getGroupLiberties(group);
      if (liberties.length === 2) {
        regions.push({ group, liberties });
      }
      group.forEach(([x, y]) => visited.add(`${x},${y}`));
    }
    return regions;
  }

  markSekiSafe() {
    const safeGroups = new Set();
    for (const groupKey of this.sekiGroups) {
      safeGroups.add(groupKey);
    }
    return safeGroups;
  }

  isEye(x, y) {
    if (this.board[x][y] !== 0) return false;
    const neighbors = this.getNeighbors(x, y);
    const color = neighbors.length > 0 ? this.board[neighbors[0][0]][neighbors[0][1]] : null;
    if (!color || color === 0) return false;
    return neighbors.every(([nx, ny]) => this.board[nx][ny] === color);
  }

  isTrueEye(x, y) {
    const cacheKey = `${x},${y}-trueEye`;
    if (this.eyeCache.has(cacheKey)) return this.eyeCache.get(cacheKey);
    if (!this.isEye(x, y)) return false;
    const neighbors = this.getNeighbors(x, y);
    const color = this.board[neighbors[0][0]][neighbors[0][1]];
    const groupKeys = new Set();
    for (const [nx, ny] of neighbors) {
      const group = this.getGroup(nx, ny);
      if (this.getLiberties(nx, ny).length < 2) return false;
      groupKeys.add(group.map(([gx, gy]) => `${gx},${gy}`).join('|'));
    }
    const result = groupKeys.size === 1;
    this.eyeCache.set(cacheKey, result);
    this.lruCache(this.eyeCache);
    return result;
  }

  isFalseEye(x, y) {
    const cacheKey = `${x},${y}-falseEye`;
    if (this.eyeCache.has(cacheKey)) return this.eyeCache.get(cacheKey);
    if (!this.isEye(x, y)) return false;
    const neighbors = this.getNeighbors(x, y);
    const color = this.board[neighbors[0][0]][neighbors[0][1]];
    const groups = this.getAdjacentGroups(x, y);
    const result = groups.some(group => {
      const liberties = this.getGroupLiberties(group);
      return liberties.length < 2 && group.every(([gx, gy]) => this.board[gx][gy] === color);
    });
    this.eyeCache.set(cacheKey, result);
    this.lruCache(this.eyeCache);
    return result;
  }

  getEyes(player) {
    const cacheKey = `eyes-${player}`;
    if (this.eyeCache.has(cacheKey)) return this.eyeCache.get(cacheKey);
    const eyes = [];
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        if (this.isTrueEye(x, y) && this.getNeighbors(x, y).every(([nx, ny]) => this.board[nx][ny] === player)) {
          eyes.push([x, y]);
        }
      }
    }
    this.eyeCache.set(cacheKey, eyes);
    this.lruCache(this.eyeCache);
    return eyes;
  }

  getEyesBit(player) {
    const cacheKey = `eyes-bit-${player}`;
    if (this.eyeCache.has(cacheKey)) return this.eyeCache.get(cacheKey);
    const eyes = [];
    const bitBoard = player === 1 ? this.bitBoardBlack : this.bitBoardWhite;
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        const bitIndex = this.coordsToBitIndex(x, y);
        if (!(bitBoard & (1n << bitIndex)) && this.isTrueEye(x, y)) {
          if (this.getNeighbors(x, y).every(([nx, ny]) => this.board[nx][ny] === player)) {
            eyes.push([x, y]);
          }
        }
      }
    }
    this.eyeCache.set(cacheKey, eyes);
    this.lruCache(this.eyeCache);
    return eyes;
  }

  calculateTerritoryJapanese(player) {
    const cacheKey = `territory-japanese-${player}`;
    if (this.territoryCache.has(cacheKey)) return this.territoryCache.get(cacheKey);
    let territory = this.captured[player === 1 ? 2 : 1];
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        if (this.board[x][y] === 0 && this.isTrueEye(x, y)) {
          if (this.getNeighbors(x, y).every([nx, ny] => this.board[nx][ny] === player)) {
            territory++;
          }
        }
      }
    }
    this.territoryCache.set(cacheKey, territory);
    this.lruCache(this.territoryCache);
    return territory;
  }

  calculateTerritoryChinese(player) {
    const cacheKey = `territory-chinese-${player}`;
    if (this.territoryCache.has(cacheKey)) return this.territoryCache.get(cacheKey);
    let territory = this.captured[player === 1 ? 2 : 1];
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        if (this.board[x][y] === player) territory++;
        else if (this.board[x][y] === 0 && this.isTrueEye(x, y)) {
          if (this.getNeighbors(x, y).every(([nx, ny]) => this.board[nx][ny] === player)) {
            territory++;
          }
        }
      }
    }
    this.territoryCache.set(cacheKey, territory);
    this.lruCache(this.territoryCache);
    return territory;
  }

  calculateTerritoryAGA(player) {
    const cacheKey = `territory-aga-${player}`;
    if (this.territoryCache.has(cacheKey)) return this.territoryCache.get(cacheKey);
    let territory = this.calculateTerritoryChinese(player);
    const deadGroups = this.markPotentialDeadGroups(player === 1 ? 2 : 1);
    territory += deadGroups.reduce((sum, group) => sum + group.length, 0);
    this.territoryCache.set(cacheKey, territory);
    this.lruCache(this.territoryCache);
    return territory;
  }

  calculateTerritoryWithSeki(player) {
    const cacheKey = `territory-seki-${player}`;
    if (this.territoryCache.has(cacheKey)) return this.territoryCache.get(cacheKey);
    let territory = this.captured[player === 1 ? 2 : 1];
    const visited = new Set();
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        if (this.board[x][y] === 0 && !visited.has(`${x},${y}`) && !this.isSeki(x, y)) {
          const region = this.floodFill(x, y);
          const surrounds = new Set();
          for (const [rx, ry] of region) {
            for (const [nx, ny] of this.getNeighbors(rx, ry)) {
              if (this.board[nx][ny] !== 0) surrounds.add(this.board[nx][ny]);
            }
            visited.add(`${rx},${ry}`);
          }
          if (surrounds.size === 1 && surrounds.has(player)) {
            territory += region.length;
          }
        }
      }
    }
    this.territoryCache.set(cacheKey, territory);
    this.lruCache(this.territoryCache);
    return territory;
  }

  verifyTerritory(player) {
    const territory = this.calculateTerritoryJapanese(player);
    const regions = this.getControlledRegions(player);
    return regions.reduce((sum, region) => sum + region.length, 0) === territory;
  }

  markPotentialDeadGroups(opponent) {
    const deadGroups = [];
    const groups = this.getAllGroups(opponent);
    for (const group of groups) {
      if (!this.isGroupAlive(group[0][0], group[0][1]) && !this.isSeki(group[0][0], group[0][1])) {
        deadGroups.push(group);
      }
    }
    return deadGroups;
  }

  markDeadGroups(player, deadPoints) {
    deadPoints.forEach(([x, y]) => {
      if (this.board[x][y] === (player === 1 ? 2 : 1)) {
        this.board[x][y] = 0;
        const bitIndex = this.coordsToBitIndex(x, y);
        if (player === 1) this.bitBoardWhite &= ~(1n << bitIndex);
        else this.bitBoardBlack &= ~(1n << bitIndex);
        this.emptyCells.push([x, y]);
        this.captured[player]++;
      }
    });
    this.clearCaches();
  }

  getAdjacentGroups(x, y) {
    const groups = new Set();
    for (const [nx, ny] of this.getNeighbors(x, y)) {
      if (this.board[nx][ny] !== 0) {
        const group = this.getGroup(nx, ny);
        groups.add(group.map(([gx, gy]) => `${gx},${gy}`).join('|'));
      }
    }
    return Array.from(groups).map(key => key.split('|').map(s => s.split(',').map(Number)));
  }

  mergeGroups(group1, group2) {
    const merged = [...group1, ...group2];
    const cacheKey = merged.map(([x, y]) => `${x},${y}`).join('|');
    this.groupCache.set(cacheKey, merged);
    this.lruCache(this.groupCache);
    return merged;
  }

  getGroupLiberties(group) {
    const liberties = new Set();
    for (const [gx, gy] of group) {
      for (const [nx, ny] of this.getNeighbors(gx, gy)) {
        if (this.board[nx][ny] === 0) liberties.add(`${nx},${ny}`);
      }
    }
    return Array.from(liberties).map(s => s.split(',').map(Number));
  }

  isGroupAlive(x, y) {
    const group = this.getGroup(x, y);
    const liberties = this.getLiberties(x, y);
    if (liberties.length >= 2) return true;
    const eyes = this.getEyes(this.board[x][y]);
    return eyes.length >= 2;
  }

  getAllGroups(player) {
    const groups = new Set();
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        if (this.board[x][y] === player) {
          const group = this.getGroup(x, y);
          groups.add(group.map([gx, gy] => `${gx},${gy}`).join('|'));
        }
      }
    }
    return Array.from(groups).map(key => key.split('|').map(s => s.split(',').map(Number)));
  }

  getPotentialLiberties(x, y) {
    const group = this.getGroup(x, y);
    const potential = new Set();
    for (const [gx, gy] of group) {
      for (const [nx, ny] of this.getNeighbors(gx, gy)) {
        if (this.board[nx][ny] === 0 || this.isEye(nx, ny)) potential.add(`${nx},${ny}`);
      }
    }
    return Array.from(potential).map(s => s.split(',').map(Number));
  }

  floodFill(x, y) {
    const region = [];
    const visited = new Set();
    const stack = [[x, y]];
    visited.add(`${x},${y}`);
    while (stack.length) {
      const [cx, cy] = stack.pop();
      region.push([cx, cy]);
      for (const [nx, ny] of this.getNeighbors(cx, cy)) {
        if (this.board[nx][ny] === 0 && !visited.has(`${nx},${ny}`)) {
          stack.push([nx, ny]);
          visited.add(`${nx},${ny}`);
        }
      }
    }
    return region;
  }

  getBitNeighbors(x, y) {
    const neighbors = [];
    const bitIndex = this.coordsToBitIndex(x, y);
    if (x > 0) neighbors.push(bitIndex - BigInt(this.size));
    if (x < this.size - 1) neighbors.push(bitIndex + BigInt(this.size));
    if (y > 0) neighbors.push(bitIndex - 1n);
    if (y < this.size - 1) neighbors.push(bitIndex + 1n);
    return neighbors;
  }

  getGroupBit(x, y) {
    const color = this.board[x][y];
    const bitBoard = color === 1 ? this.bitBoardBlack : this.bitBoardWhite;
    const visited = new BigInt64Array(1).fill(0n);
    const groupBits = new BigInt64Array(1).fill(0n);
    const stack = [this.coordsToBitIndex(x, y)];
    groupBits[0] |= 1n << stack[0];
    visited[0] |= 1n << stack[0];
    while (stack.length) {
      const bitIndex = stack.pop();
      for (const neighborBit of this.getBitNeighbors(...this.indexToCoords(bitIndex))) {
        if ((bitBoard & (1n << neighborBit)) && !(visited[0] & (1n << neighborBit))) {
          groupBits[0] |= 1n << neighborBit;
          stack.push(neighborBit);
          visited[0] |= 1n << neighborBit;
        }
      }
    }
    return groupBits;
  }

  floodFillBit(x, y) {
    const regionBits = new BigInt64Array(1).fill(0n);
    const visited = new BigInt64Array(1).fill(0n);
    const stack = [this.coordsToBitIndex(x, y)];
    regionBits[0] |= 1n << stack[0];
    visited[0] |= 1n << stack[0];
    while (stack.length) {
      const bitIndex = stack.pop();
      for (const neighborBit of this.getBitNeighbors(...this.indexToCoords(bitIndex))) {
        if (!(this.bitBoardBlack | this.bitBoardWhite & (1n << neighborBit)) && !(visited[0] & (1n << neighborBit))) {
          regionBits[0] |= 1n << neighborBit;
          stack.push(neighborBit);
          visited[0] |= 1n << neighborBit;
        }
      }
    }
    const region = [];
    for (let i = 0; i < this.size * this.size; i++) {
      if (regionBits[0] & (1n << BigInt(i))) region.push(this.indexToCoords(i));
    }
    return region;
  }

  analyzeBoardState() {
    const analysis = { black: { groups: [], eyes: [], territory: 0 }, white: { groups: [], eyes: [], territory: 0 } };
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        if (this.board[x][y] === 1) {
          const group = this.getGroup(x, y);
          const key = group.map(([gx, gy]) => `${gx},${gy}`).join('|');
          if (!analysis.black.groups.includes(key)) analysis.black.groups.push(key);
        } else if (this.board[x][y] === 2) {
          const group = this.getGroup(x, y);
          const key = group.map([gx, gy] => `${gx},${gy}`).join('|');
          if (!analysis.white.groups.includes(key)) analysis.white.groups.push(key);
        }
      }
    }
    analysis.black.eyes = this.getEyes(1);
    analysis.white.eyes = this.getEyes(2);
    analysis.black.territory = this.calculateTerritoryJapanese(1);
    analysis.white.territory = this.calculateTerritoryJapanese(2);
    return analysis;
  }

  analyzeGroupStability(x, y) {
    const cacheKey = `${x},${y}-stability`;
    if (this.groupAnalysisCache.has(cacheKey)) return this.groupAnalysisCache.get(cacheKey);
    const group = this.getGroup(x, y);
    const liberties = this.getLiberties(x, y);
    const eyes = this.getEyes(this.board[x][y]);
    const result = {
      size: group.length,
      liberties: liberties.length,
      eyes: eyes.length,
      isSeki: this.isSeki(x, y),
      isAlive: this.isGroupAlive(x, y),
      stabilityScore: liberties.length + eyes.length * 2
    };
    this.groupAnalysisCache.set(cacheKey, result);
    this.lruCache(this.groupAnalysisCache);
    return result;
  }

  predictDeadGroups(player) {
    const opponent = player === 1 ? 2 : 1;
    const deadGroups = [];
    const groups = this.getAllGroups(opponent);
    for (const group of groups) {
      if (!this.isGroupAlive(group[0][0], group[0][1]) && !this.isSeki(group[0][0], group[0][1])) {
        deadGroups.push(group);
      }
    }
    return deadGroups;
  }

  undoMove() {
    if (!this.moveHistory.length) return;
    const { x, y, player, captured } = this.moveHistory.pop();
    this.revertMove(x, y, player);
    captured.forEach(([cx, cy]) => {
      this.board[cx][cy] = player === 1 ? 2 : 1;
      const bitIndex = this.coordsToBitIndex(cx, cy);
      if (player === 1) this.bitBoardWhite |= 1n << bitIndex;
      else this.bitBoardBlack |= 1n << bitIndex;
      this.emptyCells = this.emptyCells.filter(([ex, ey]) => ex !== cx || ey !== cy);
      this.captured[player]--;
    });
    this.clearCaches();
    this.updateSekiStatus();
  }

  resizeBoard(newSize) {
    if (![9, 13, 19].includes(newSize)) throw new Error('Invalid board size');
    this.size = newSize;
    this.board = Array(newSize).fill().map(() => Array(newSize).fill(0));
    this.bitBoardBlack = new BigInt64Array(1).fill(0n);
    this.bitBoardWhite = new BigInt64Array(1).fill(0n);
    this.emptyCells = Array.from({ length: newSize * newSize }, (_, i) => [Math.floor(i / newSize), i % newSize]);
    this.clearCaches();
    this.moveHistory = [];
    this.superKoHistory.clear();
    this.koPoint = null;
    this.sekiGroups.clear();
    this.initBitMasks();
    if (newSize <= 13) this.optimizeForSmallBoard();
  }

  optimizeForSmallBoard() {
    this.bitBoardBlack = new Int32Array(1).fill(0);
    this.bitBoardWhite = new Int32Array(1).fill(0);
    this.bitMasks = Array(this.size).fill().map(() => Array(this.size).fill(0));
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        this.bitMasks[x][y] = 1 << (x * this.size + y);
      }
    }
  }

  debugBoard() {
    let output = '';
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        output += this.board[x][y] === 0 ? '.' : this.board[x][y] === 1 ? 'B' : 'W';
      }
      output += '\n';
    }
    return output;
  }

  debugGroup(x, y) {
    const group = this.getGroup(x, y);
    return {
      size: group.length,
      liberties: this.getLiberties(x, y).length,
      eyes: this.getEyes(this.board[x][y]).length,
      isSeki: this.isSeki(x, y),
      isAlive: this.isGroupAlive(x, y),
      stability: this.analyzeGroupStability(x, y).stabilityScore
    };
  }

  debugAllGroups(player) {
    const groups = this.getAllGroups(player);
    return groups.map(group => ({
      stones: group.length,
      liberties: this.getGroupLiberties(group).length,
      eyes: this.getEyes(player).filter(([ex, ey]) => group.some(([gx, gy]) => this.getNeighbors(gx, gy).some(([nx, ny]) => nx === ex && ny === ey))).length,
      isSeki: this.isSeki(group[0][0], group[0][1]),
      isAlive: this.isGroupAlive(group[0][0], group[0][1]),
      stability: this.analyzeGroupStability(group[0][0], group[0][1]).stabilityScore
    }));
  }

  debugEyes(player) {
    const eyes = this.getEyes(player);
    return eyes.map(([x, y]) => ({
      position: [x, y],
      isTrue: this.isTrueEye(x, y),
      isFalse: this.isFalseEye(x, y),
      surroundingGroup: this.getAdjacentGroups(x, y)[0]?.length || 0
    }));
  }

  debugTerritory(player) {
    return {
      japanese: this.calculateTerritoryJapanese(player),
      chinese: this.calculateTerritoryChinese(player),
      aga: this.calculateTerritoryAGA(player),
      withSeki: this.calculateTerritoryWithSeki(player),
      captured: this.captured[player === 1 ? 2 : 1]
    };
  }

  debugBoardAnalysis() {
    const analysis = this.analyzeBoardState();
    return {
      black: {
        groups: analysis.black.groups.length,
        eyes: analysis.black.eyes.length,
        territoryJapanese: this.calculateTerritoryJapanese(1),
        territoryChinese: this.calculateTerritoryChinese(1),
        territoryAGA: this.calculateTerritoryAGA(1),
        captured: this.captured[2]
      },
      white: {
        groups: analysis.white.groups.length,
        eyes: analysis.white.eyes.length,
        territoryJapanese: this.calculateTerritoryJapanese(2),
        territoryChinese: this.calculateTerritoryChinese(2),
        territoryAGA: this.calculateTerritoryAGA(2),
        captured: this.captured[1]
      },
      sekiGroups: this.sekiGroups.size,
      tripleKo: this.checkTripleKo(),
      moveCount: this.moveHistory.length
    };
  }

  debugMoveHistory() {
    return this.moveHistory.map(move => ({
      position: [move.x, move.y],
      player: move.player,
      captured: move.captured.length,
      state: move.state
    }));
  }

  debugCacheState() {
    return {
      groupCacheSize: this.groupCache.size,
      libertyCacheSize: this.libertyCache.size,
      eyeCacheSize: this.eyeCache.size,
      territoryCacheSize: this.territoryCache.size,
      sekiCacheSize: this.sekiCache.size,
      stateCacheSize: this.stateCache.size,
      groupAnalysisCacheSize: this.groupAnalysisCache.size,
      eyeAnalysisCacheSize: this.eyeAnalysisCache.size
    };
  }

  benchmarkPerformance() {
    const startDFS = performance.now();
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        if (this.board[x][y] !== 0) this.getGroup(x, y);
      }
    }
    const endDFS = performance.now();
    const startBFS = performance.now();
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        if (this.board[x][y] !== 0) this.getGroupBFS(x, y);
      }
    }
    const endBFS = performance.now();
    const startBit = performance.now();
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        if (this.board[x][y] !== 0) this.getGroupBit(x, y);
      }
    }
    const endBit = performance.now();
    return {
      dfsTime: endDFS - startDFS,
      bfsTime: endBFS - startBFS,
      bitTime: endBit - startBit
    };
  }

  getControlledRegions(player) {
    const regions = [];
    const visited = new Set();
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        if (this.board[x][y] === 0 && !visited.has(`${x},${y}`)) {
          const region = this.floodFill(x, y);
          const surrounds = new Set();
          for (const [rx, ry] of region) {
            for (const [nx, ny] of this.getNeighbors(rx, ry)) {
              if (this.board[nx][ny] !== 0) surrounds.add(this.board[nx][ny]);
            }
            visited.add(`${rx},${ry}`);
          }
          if (surrounds.size === 1 && surrounds.has(player)) {
            regions.push(region);
          }
        }
      }
    }
    return regions;
  }

  handleEternalLife() {
    if (this.checkTripleKo()) {
      this.moveHistory = this.moveHistory.slice(0, -2);
      this.superKoHistory.clear();
      this.clearCaches();
      return true;
    }
    return false;
  }
}
