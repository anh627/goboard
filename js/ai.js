import { GoBoard } from './board.js';

class NeuralNetwork {
  constructor(inputSize, hiddenSize, outputSize) {
    this.inputSize = inputSize;
    this.hiddenSize = hiddenSize;
    this.outputSize = outputSize;
    this.weights1 = Array(inputSize * hiddenSize).fill().map(() => Math.random() * 0.2 - 0.1);
    this.weights2 = Array(hiddenSize * outputSize).fill().map(() => Math.random() * 0.2 - 0.1);
    this.bias1 = Array(hiddenSize).fill(0);
    this.bias2 = Array(outputSize).fill(0);
  }

  sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  relu(x) {
    return Math.max(0, x);
  }

  forward(input) {
    let hidden = Array(this.hiddenSize).fill(0);
    for (let i = 0; i < this.hiddenSize; i++) {
      for (let j = 0; j < this.inputSize; j++) {
        hidden[i] += input[j] * this.weights1[j * this.hiddenSize + i];
      }
      hidden[i] = this.relu(hidden[i] + this.bias1[i]);
    }
    let output = Array(this.outputSize).fill(0);
    for (let i = 0; i < this.outputSize; i++) {
      for (let j = 0; j < this.hiddenSize; j++) {
        output[i] += hidden[j] * this.weights2[j * this.outputSize + i];
      }
      output[i] = this.sigmoid(output[i] + this.bias2[i]);
    }
    return output;
  }

  boardToInput(board, player) {
    let input = [];
    for (let x = 0; x < board.size; x++) {
      for (let y = 0; y < board.size; y++) {
        let stone = board.board[x][y];
        input.push(stone === player ? 1 : 0);
        input.push(stone === -player ? 1 : 0);
        input.push(stone === 0 ? 1 : 0);
      }
    }
    return input;
  }

  predict(board, player) {
    let input = this.boardToInput(board, player);
    return this.forward(input);
  }
}

class Node {
  constructor(board, move = null, parent = null, player) {
    this.board = board;
    this.move = move;
    this.parent = parent;
    this.player = player;
    this.children = [];
    this.visits = 0;
    this.wins = 0;
    this.untriedMoves = this.getLegalMoves();
    this.value = 0;
  }

  getLegalMoves() {
    let moves = [];
    for (let x = 0; x < this.board.size; x++) {
      for (let y = 0; y < this.board.size; y++) {
        if (this.board.isValidMove(x, y)) moves.push([x, y]);
      }
    }
    return moves;
  }

  isFullyExpanded() {
    return this.untriedMoves.length === 0;
  }

  selectChild(uctConstant) {
    let bestScore = -Infinity;
    let bestChild = null;
    for (let child of this.children) {
      let score = child.wins / (child.visits + 1e-6) +
        uctConstant * Math.sqrt(Math.log(this.visits + 1) / (child.visits + 1e-6));
      if (score > bestScore) {
        bestScore = score;
        bestChild = child;
      }
    }
    return bestChild;
  }

  addChild(move, player) {
    let newBoard = new GoBoard(this.board.size);
    newBoard.board = this.board.board.map(row => [...row]);
    newBoard.placeStone(move[0], move[1], player);
    let child = new Node(newBoard, move, this, player);
    this.untriedMoves = this.untriedMoves.filter(m => m[0] !== move[0] || m[1] !== move[1]);
    this.children.push(child);
    return child;
  }

  update(result) {
    this.visits++;
    this.wins += result;
  }
}

class TranspositionTable {
  constructor() {
    this.table = new Map();
  }

  hashBoard(board) {
    let hash = '';
    for (let row of board.board) {
      hash += row.join('');
    }
    return hash;
  }

  get(board) {
    return this.table.get(this.hashBoard(board));
  }

  set(board, node) {
    this.table.set(this.hashBoard(board), node);
  }
}

export class GoAI {
  constructor(board, player = 1, simCount = 1000, uctConstant = 0.7) {
    this.board = board;
    this.player = player;
    this.simCount = simCount;
    this.uctConstant = uctConstant;
    this.nn = new NeuralNetwork(board.size * board.size * 3, 128, board.size * board.size);
    this.transTable = new TranspositionTable();
  }

  getRandomMove() {
    let empty = [];
    for (let x = 0; x < this.board.size; x++) {
      for (let y = 0; y < this.board.size; y++) {
        if (this.board.isValidMove(x, y)) empty.push([x, y]);
      }
    }
    return empty.length ? empty[Math.floor(Math.random() * empty.length)] : null;
  }

  evaluateMove(x, y) {
    let tempBoard = new GoBoard(this.board.size);
    tempBoard.board = this.board.board.map(row => [...row]);
    tempBoard.placeStone(x, y, this.player);
    return tempBoard.checkCaptures(x, y, this.player).length;
  }

  nnEvaluate(board, player) {
    let probs = this.nn.predict(board, player);
    let moves = [];
    let idx = 0;
    for (let x = 0; x < board.size; x++) {
      for (let y = 0; y < board.size; y++) {
        if (board.isValidMove(x, y)) {
          moves.push({ move: [x, y], prob: probs[idx] });
        }
        idx++;
      }
    }
    moves.sort((a, b) => b.prob - a.prob);
    return moves.length ? moves[0].move : null;
  }

  simulate(node) {
    let tempBoard = new GoBoard(node.board.size);
    tempBoard.board = node.board.board.map(row => [...row]);
    let currentPlayer = node.player;
    let moves = 0;
    while (moves < 100) {
      let move = this.getRandomMove(tempBoard);
      if (!move) break;
      tempBoard.placeStone(move[0], move[1], currentPlayer);
      currentPlayer = -currentPlayer;
      moves++;
    }
    let score = this.evaluateBoard(tempBoard);
    return score > 0 ? 1 : score < 0 ? 0 : 0.5;
  }

  evaluateBoard(board) {
    let score = 0;
    for (let x = 0; x < board.size; x++) {
      for (let y = 0; y < board.size; y++) {
        if (board.board[x][y] === this.player) score++;
        else if (board.board[x][y] === -this.player) score--;
      }
    }
    return score;
  }

  mcts(root) {
    for (let i = 0; i < this.simCount; i++) {
      let node = root;
      let tempBoard = new GoBoard(this.board.size);
      tempBoard.board = root.board.board.map(row => [...row]);
      let currentPlayer = this.player;

      while (node.isFullyExpanded() && node.children.length > 0) {
        node = node.selectChild(this.uctConstant);
        tempBoard.placeStone(node.move[0], node.move[1], currentPlayer);
        currentPlayer = -currentPlayer;
      }

      if (node.untriedMoves.length > 0) {
        let move = node.untriedMoves[Math.floor(Math.random() * node.untriedMoves.length)];
        node = node.addChild(move, currentPlayer);
        tempBoard.placeStone(move[0], move[1], currentPlayer);
        currentPlayer = -currentPlayer;
      }

      let result = this.simulate(node);
      while (node) {
        node.update(result);
        node = node.parent;
        result = 1 - result;
      }
    }
  }

  getBestMove() {
    let root = new Node(this.board, null, null, this.player);
    let cached = this.transTable.get(this.board);
    if (cached) return cached.move;

    let nnMove = this.nnEvaluate(this.board, this.player);
    if (Math.random() < 0.3) return nnMove;

    this.mcts(root);
    let bestChild = root.children.reduce((best, child) =>
      child.visits > best.visits ? child : best, root.children[0]);
    this.transTable.set(this.board, bestChild);
    return bestChild ? bestChild.move : this.getRandomMove();
  }

  async parallelMcts(root, workerCount = 4) {
    let workers = [];
    let results = [];
    let chunkSize = Math.ceil(this.simCount / workerCount);

    for (let i = 0; i < workerCount; i++) {
      workers.push(new Promise(resolve => {
        let workerBoard = new GoBoard(root.board.size);
        workerBoard.board = root.board.board.map(row => [...row]);
        let node = new Node(workerBoard, null, null, this.player);
        for (let j = 0; j < chunkSize; j++) {
          let simNode = node;
          let tempBoard = new GoBoard(this.board.size);
          tempBoard.board = node.board.board.map(row => [...row]);
          let currentPlayer = this.player;

          while (simNode.isFullyExpanded() && simNode.children.length > 0) {
            simNode = simNode.selectChild(this.uctConstant);
            tempBoard.placeStone(simNode.move[0], simNode.move[1], currentPlayer);
            currentPlayer = -currentPlayer;
          }

          if (simNode.untriedMoves.length > 0) {
            let move = simNode.untriedMoves[Math.floor(Math.random() * simNode.untriedMoves.length)];
            simNode = simNode.addChild(move, currentPlayer);
            tempBoard.placeStone(move[0], move[1], currentPlayer);
          }

          let result = this.simulate(simNode);
          let updateNode = simNode;
          while (updateNode) {
            updateNode.update(result);
            updateNode = updateNode.parent;
            result = 1 - result;
          }
        }
        resolve(node);
      }));
    }

    let nodes = await Promise.all(workers);
    for (let node of nodes) {
      for (let child of node.children) {
        let existing = root.children.find(c => c.move[0] === child.move[0] && c.move[1] === child.move[1]);
        if (existing) {
          existing.visits += child.visits;
          existing.wins += child.wins;
        } else {
          root.children.push(child);
        }
      }
    }
  }

  getBestMoveParallel() {
    let root = new Node(this.board, null, null, this.player);
    let cached = this.transTable.get(this.board);
    if (cached) return cached.move;

    return this.parallelMcts(root).then(() => {
      let bestChild = root.children.reduce((best, child) =>
        child.visits > best.visits ? child : best, root.children[0]);
      this.transTable.set(this.board, bestChild);
      return bestChild ? bestChild.move : this.getRandomMove();
    });
  }
}
