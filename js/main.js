import { GoGame } from './game.js';
import { GoBoard } from './board.js';
import { GoAI } from './ai.js';
import { GoUI } from './ui.js';
import * as utils from './utils.js';

class GameController {
  constructor(canvasId, boardSize = 19) {
    this.canvas = document.getElementById(canvasId);
    this.board = new GoBoard(boardSize);
    this.game = new GoGame(boardSize);
    this.ai = new GoAI(this.board, 1, 1000, 0.7);
    this.ui = new GoUI(this.canvas, this.game, {
      boardColor: '#f0d9b5',
      gridColor: '#000000',
      blackStoneColor: '#000000',
      whiteStoneColor: '#ffffff',
      highlightColor: 'rgba(0, 255, 0, 0.3)',
      font: '20px Arial',
      animationDuration: 300
    });
    this.mode = 'human-vs-human';
    this.aiPlayer = null;
    this.gameState = 'idle';
    this.settings = {
      boardSize: boardSize,
      komi: 6.5,
      aiDifficulty: 'medium',
      soundEnabled: true,
      animationsEnabled: true
    };
    this.initUIElements();
    this.initEventListeners();
    this.ui.draw();
  }

  initUIElements() {
    this.startButton = document.createElement('button');
    this.startButton.textContent = 'Start Game';
    this.startButton.className = 'game-button';
    document.body.appendChild(this.startButton);

    this.undoButton = document.createElement('button');
    this.undoButton.textContent = 'Undo';
    this.undoButton.className = 'game-button';
    document.body.appendChild(this.undoButton);

    this.redoButton = document.createElement('button');
    this.redoButton.textContent = 'Redo';
    this.redoButton.className = 'game-button';
    document.body.appendChild(this.redoButton);

    this.passButton = document.createElement('button');
    this.passButton.textContent = 'Pass';
    this.passButton.className = 'game-button';
    document.body.appendChild(this.passButton);

    this.modeSelect = document.createElement('select');
    ['human-vs-human', 'human-vs-ai', 'ai-vs-ai'].forEach(mode => {
      let option = document.createElement('option');
      option.value = mode;
      option.textContent = mode.replace(/-/g, ' ').toUpperCase();
      this.modeSelect.appendChild(option);
    });
    document.body.appendChild(this.modeSelect);

    this.difficultySelect = document.createElement('select');
    ['easy', 'medium', 'hard'].forEach(level => {
      let option = document.createElement('option');
      option.value = level;
      option.textContent = level.toUpperCase();
      this.difficultySelect.appendChild(option);
    });
    this.difficultySelect.value = this.settings.aiDifficulty;
    document.body.appendChild(this.difficultySelect);

    this.sizeInput = document.createElement('input');
    this.sizeInput.type = 'number';
    this.sizeInput.value = this.settings.boardSize;
    this.sizeInput.min = 5;
    this.sizeInput.max = 19;
    document.body.appendChild(this.sizeInput);
  }

  initEventListeners() {
    this.startButton.addEventListener('click', this.startGame.bind(this));
    this.undoButton.addEventListener('click', this.undoMove.bind(this));
    this.redoButton.addEventListener('click', this.redoMove.bind(this));
    this.passButton.addEventListener('click', this.passTurn.bind(this));
    this.modeSelect.addEventListener('change', this.changeMode.bind(this));
    this.difficultySelect.addEventListener('change', this.changeDifficulty.bind(this));
    this.sizeInput.addEventListener('change', this.changeBoardSize.bind(this));
  }

  startGame() {
    this.gameState = 'playing';
    this.game = new GoGame(this.settings.boardSize);
    this.board = new GoBoard(this.settings.boardSize);
    this.ai = new GoAI(this.board, 1, this.getSimCount(), 0.7);
    this.ui = new GoUI(this.canvas, this.game, this.ui.options);
    this.gameState = 'playing';
    this.ui.draw();
    if (this.mode === 'ai-vs-ai' || (this.mode === 'human-vs-ai' && this.game.getCurrentPlayer() === this.aiPlayer)) {
      this.makeAIMove();
    }
  }

  getSimCount() {
    return this.settings.aiDifficulty === 'easy' ? 500 :
           this.settings.aiDifficulty === 'medium' ? 1000 : 2000;
  }

  changeMode(event) {
    this.mode = event.target.value;
    this.aiPlayer = this.mode === 'human-vs-ai' ? -1 : null;
    this.startGame();
  }

  changeDifficulty(event) {
    this.settings.aiDifficulty = event.target.value;
    this.ai = new GoAI(this.board, this.aiPlayer || 1, this.getSimCount(), 0.7);
  }

  changeBoardSize(event) {
    let size = parseInt(event.target.value);
    if (size >= 5 && size <= 19) {
      this.settings.boardSize = size;
      this.startGame();
    }
  }

  undoMove() {
    if (this.gameState !== 'playing') return;
    this.game.undoMove();
    this.ui.draw();
  }

  redoMove() {
    if (this.gameState !== 'playing') return;
    this.game.redoMove();
    this.ui.draw();
  }

  passTurn() {
    if (this.gameState !== 'playing') return;
    this.game.pass();
    this.ui.draw();
    this.checkGameEnd();
    if (this.mode !== 'human-vs-human' && this.gameState === 'playing') {
      this.makeAIMove();
    }
  }

  makeAIMove() {
    if (this.gameState !== 'playing') return;
    setTimeout(async () => {
      let move = await this.ai.getBestMoveParallel();
      if (move) {
        this.game.makeMove(move[0], move[1]);
        this.ui.draw();
        this.checkGameEnd();
      }
      if (this.mode === 'ai-vs-ai' && this.gameState === 'playing') {
        this.makeAIMove();
      }
    }, 100);
  }

  checkGameEnd() {
    let status = this.game.getGameStatus();
    if (status.ended) {
      this.gameState = 'ended';
      this.ui.draw();
    }
  }

  saveGame() {
    let state = {
      board: utils.deepCopy(this.board.board),
      moveHistory: this.game.getMoveHistory(),
      currentPlayer: this.game.getCurrentPlayer(),
      captures: this.game.getCaptures(),
      settings: this.settings
    };
    localStorage.setItem('goGameState', JSON.stringify(state));
  }

  loadGame() {
    let state = localStorage.getItem('goGameState');
    if (!state) return;
    state = JSON.parse(state);
    this.settings = state.settings;
    this.game = new GoGame(this.settings.boardSize);
    this.board = new GoBoard(this.settings.boardSize);
    this.board.board = state.board;
    this.game.setMoveHistory(state.moveHistory);
    this.game.setCurrentPlayer(state.currentPlayer);
    this.game.setCaptures(state.captures);
    this.ai = new GoAI(this.board, this.aiPlayer || 1, this.getSimCount(), 0.7);
    this.ui = new GoUI(this.canvas, this.game, this.ui.options);
    this.ui.draw();
  }

  exportGame() {
    let boardStr = utils.boardToString(this.board.board, this.settings.boardSize);
    let blob = new Blob([boardStr], { type: 'text/plain' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = 'go_game.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  importGame(event) {
    let file = event.target.files[0];
    let reader = new FileReader();
    reader.onload = () => {
      let board = utils.stringToBoard(reader.result, this.settings.boardSize);
      this.board.board = board;
      this.game = new GoGame(this.settings.boardSize);
      this.game.setBoard(board);
      this.ui.draw();
    };
    reader.readAsText(file);
  }
}

export function startGame() {
  let controller = new GameController('go-board', 19);
  controller.startGame();
}
