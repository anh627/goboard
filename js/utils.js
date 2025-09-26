export function deepCopy(array) {
  return JSON.parse(JSON.stringify(array));
}

export function coordsToIndex(x, y, size) {
  return x * size + y;
}

export function indexToCoords(index, size) {
  return [Math.floor(index / size), index % size];
}

export function createMatrix(size, value = 0) {
  return Array(size).fill().map(() => Array(size).fill(value));
}

export function transposeMatrix(matrix) {
  let size = matrix.length;
  let result = createMatrix(size);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      result[j][i] = matrix[i][j];
    }
  }
  return result;
}

export function rotateMatrix(matrix, times = 1) {
  let size = matrix.length;
  let result = deepCopy(matrix);
  for (let t = 0; t < times % 4; t++) {
    let temp = createMatrix(size);
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        temp[j][size - 1 - i] = result[i][j];
      }
    }
    result = temp;
  }
  return result;
}

export function flipMatrixHorizontal(matrix) {
  let size = matrix.length;
  let result = createMatrix(size);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      result[i][size - 1 - j] = matrix[i][j];
    }
  }
  return result;
}

export function flipMatrixVertical(matrix) {
  let size = matrix.length;
  let result = createMatrix(size);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      result[size - 1 - i][j] = matrix[i][j];
    }
  }
  return result;
}

export function getNeighbors(x, y, size) {
  let neighbors = [];
  if (x > 0) neighbors.push([x - 1, y]);
  if (x < size - 1) neighbors.push([x + 1, y]);
  if (y > 0) neighbors.push([x, y - 1]);
  if (y < size - 1) neighbors.push([x, y + 1]);
  return neighbors;
}

export function getDiagonalNeighbors(x, y, size) {
  let neighbors = [];
  if (x > 0 && y > 0) neighbors.push([x - 1, y - 1]);
  if (x > 0 && y < size - 1) neighbors.push([x - 1, y + 1]);
  if (x < size - 1 && y > 0) neighbors.push([x + 1, y - 1]);
  if (x < size - 1 && y < size - 1) neighbors.push([x + 1, y + 1]);
  return neighbors;
}

export function isValidCoord(x, y, size) {
  return x >= 0 && x < size && y >= 0 && y < size;
}

export function shuffleArray(array) {
  let result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function memoize(fn) {
  let cache = new Map();
  return function (...args) {
    let key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    let result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

export function boardToString(board, size) {
  let result = '';
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      result += board[i][j] === 0 ? '.' : board[i][j] === 1 ? 'X' : 'O';
    }
    result += '\n';
  }
  return result;
}

export function stringToBoard(str, size) {
  let board = createMatrix(size);
  let lines = str.trim().split('\n');
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      let char = lines[i][j];
      board[i][j] = char === '.' ? 0 : char === 'X' ? 1 : -1;
    }
  }
  return board;
}

export function getEmptyPositions(board, size) {
  let positions = [];
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      if (board[x][y] === 0) positions.push([x, y]);
    }
  }
  return positions;
}

export function countStones(board, size, player) {
  let count = 0;
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      if (board[x][y] === player) count++;
    }
  }
  return count;
}

export function getGroup(board, x, y, size) {
  let player = board[x][y];
  if (player === 0) return [];
  let group = [];
  let visited = createMatrix(size, false);
  let queue = [[x, y]];
  visited[x][y] = true;
  while (queue.length) {
    let [cx, cy] = queue.shift();
    group.push([cx, cy]);
    let neighbors = getNeighbors(cx, cy, size);
    for (let [nx, ny] of neighbors) {
      if (!visited[nx][ny] && board[nx][ny] === player) {
        queue.push([nx, ny]);
        visited[nx][ny] = true;
      }
    }
  }
  return group;
}

export function getLiberties(board, group, size) {
  let liberties = new Set();
  for (let [x, y] of group) {
    let neighbors = getNeighbors(x, y, size);
    for (let [nx, ny] of neighbors) {
      if (board[nx][ny] === 0) liberties.add(coordsToIndex(nx, ny, size));
    }
  }
  return Array.from(liberties).map(idx => indexToCoords(idx, size));
}

export function floodFill(board, x, y, size, target, replacement) {
  if (!isValidCoord(x, y, size) || board[x][y] !== target) return;
  board[x][y] = replacement;
  let neighbors = getNeighbors(x, y, size);
  for (let [nx, ny] of neighbors) {
    floodFill(board, nx, ny, size, target, replacement);
  }
}

export function calculateDistance(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export function getClosestPosition(positions, x, y) {
  let closest = null;
  let minDist = Infinity;
  for (let pos of positions) {
    let dist = calculateDistance(x, y, pos[0], pos[1]);
    if (dist < minDist) {
      minDist = dist;
      closest = pos;
    }
  }
  return closest;
}

export function generatePattern(size, density = 0.3) {
  let pattern = createMatrix(size);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (Math.random() < density) {
        pattern[i][j] = Math.random() < 0.5 ? 1 : -1;
      }
    }
  }
  return pattern;
}

export function compareBoards(board1, board2, size) {
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (board1[i][j] !== board2[i][j]) return false;
    }
  }
  return true;
}

export function throttle(fn, wait) {
  let lastCall = 0;
  return function (...args) {
    let now = Date.now();
    if (now - lastCall >= wait) {
      lastCall = now;
      return fn(...args);
    }
  };
}

export function debounce(fn, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

export function formatMove(x, y) {
  return `(${x}, ${y})`;
}

export function parseMove(str) {
  let match = str.match(/\((\d+),\s*(\d+)\)/);
  return match ? [parseInt(match[1]), parseInt(match[2])] : null;
}

export function generateUniqueId() {
  return Math.random().toString(36).substr(2, 9);
}

export function normalizeArray(array) {
  let max = Math.max(...array);
  let min = Math.min(...array);
  if (max === min) return array.map(() => 0);
  return array.map(x => (x - min) / (max - min));
}

export function sumArray(array) {
  return array.reduce((sum, x) => sum + x, 0);
}

export function averageArray(array) {
  return array.length ? sumArray(array) / array.length : 0;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(start, end, t) {
  return start + (end - start) * t;
}
