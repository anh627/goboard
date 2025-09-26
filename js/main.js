import { GoGame } from './game.js';
import { GoBoard } from './board.js';
import { GoAI } from './ai.js';
import { GoUI } from './ui.js';
import * as utils from './utils.js';

class GameController {
  constructor(canvasId, boardSize = 19) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) throw new Error('Canvas not found');
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
    this.guideVisible = false;
    this.initUIElements();
    this.initEventListeners();
    this.ui.draw();
    this.addStyles();
  }

  addStyles() {
    let style = document.createElement('style');
    style.textContent = `
      .game-button {
        padding: 10px 20px;
        margin: 5px;
        font-size: 16px;
        cursor: pointer;
        background-color: #4CAF50;
        color: white;
        border: none;
        border-radius: 5px;
      }
      .game-button:disabled {
        background-color: #cccccc;
        cursor: not-allowed;
      }
      .game-select, .game-input {
        padding: 10px;
        margin: 5px;
        font-size: 16px;
        border-radius: 5px;
      }
      #guide-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 1000;
      }
      #guide-content {
        background: white;
        padding: 20px;
        border-radius: 10px;
        max-width: 600px;
        max-height: 80%;
        overflow-y: auto;
      }
      #guide-close {
        padding: 10px;
        font-size: 16px;
        cursor: pointer;
        background-color: #ff4444;
        color: white;
        border: none;
        border-radius: 5px;
      }
    `;
    document.head.appendChild(style);
  }

  initUIElements() {
    this.startButton = document.createElement('button');
    this.startButton.textContent = 'Start Game';
    this.startButton.className = 'game-button';
    document.body.appendChild(this.startButton);

    this.guideButton = document.createElement('button');
    this.guideButton.textContent = 'Guide';
    this.guideButton.className = 'game-button';
    document.body.appendChild(this.guideButton);

    this.undoButton = document.createElement('button');
    this.undoButton.textContent = 'Undo';
    this.undoButton.className = 'game-button';
    this.undoButton.disabled = true;
    document.body.appendChild(this.undoButton);

    this.redoButton = document.createElement('button');
    this.redoButton.textContent = 'Redo';
    this.redoButton.className = 'game-button';
    this.redoButton.disabled = true;
    document.body.appendChild(this.redoButton);

    this.passButton = document.createElement('button');
    this.passButton.textContent = 'Pass';
    this.passButton.className = 'game-button';
    this.passButton.disabled = true;
    document.body.appendChild(this.passButton);

    this.modeSelect = document.createElement('select');
    this.modeSelect.className = 'game-select';
    ['human-vs-human', 'human-vs-ai', 'ai-vs-ai'].forEach(mode => {
      let option = document.createElement('option');
      option.value = mode;
      option.textContent = mode.replace(/-/g, ' ').toUpperCase();
      this.modeSelect.appendChild(option);
    });
    document.body.appendChild(this.modeSelect);

    this.difficultySelect = document.createElement('select');
    this.difficultySelect.className = 'game-select';
    ['easy', 'medium', 'hard'].forEach(level => {
      let option = document.createElement('option');
      option.value = level;
      option.textContent = level.toUpperCase();
      this.difficultySelect.appendChild(option);
    });
    this.difficultySelect.value = this.settings.aiDifficulty;
    document.body.appendChild(this.difficultySelect);

    this.sizeInput = document.createElement('input');
    this.sizeInput.className = 'game-input';
    this.sizeInput.type = 'number';
    this.sizeInput.value = this.settings.boardSize;
    this.sizeInput.min = 5;
    this.sizeInput.max = 19;
    document.body.appendChild(this.sizeInput);

    this.guideOverlay = document.createElement('div');
    this.guideOverlay.id = 'guide-overlay';
    this.guideContent = document.createElement('div');
    this.guideContent.id = 'guide-content';
    this.guideContent.innerHTML = `
      <h2>Go Game Guide</h2>
      <p>Go is a strategic board game for two players. The goal is to surround more territory than your opponent.</p>
      <h3>Rules:</h3>
      <ul>
        <li>Players take turns placing black or white stones on intersections.</li>
        <li>A stone or group with no liberties (adjacent empty points) is captured.</li>
        <li>The game ends when both players pass consecutively.</li>
        <li>Score is calculated by territory (empty points surrounded) plus captured stones.</li>
        <li>Komi (e.g., 6.5) is added to White's score to balance Black's first move.</li>
      </ul>
      <h3>Controls:</h3>
      <ul>
        <li>Click or tap to place a stone.</li>
        <li>Drag to preview stone placement.</li>
        <li>Use Undo (Ctrl+Z) or Redo (Ctrl+Y) to navigate moves.</li>
        <li>Press Pass to skip your turn.</li>
      </ul>
      <button id="guide-close">Close</button>
    `;
    this.guideOverlay.appendChild(this.guideContent);
    document.body.appendChild(this.guideOverlay);
  }

  initEventListeners() {
    this.startButton.addEventListener('click', this.startGame.bind(this));
    this.guideButton.addEventListener('click', this.toggleGuide.bind(this));
    this.undoButton.addEventListener('click', this.undoMove.bind(this));
    this.redoButton.addEventListener('click', this.redoMove.bind(this));
    this.passButton.addEventListener('click', this.passTurn.bind(this));
    this.modeSelect.addEventListener('change', this.changeMode.bind(this));
    this.difficultySelect.addEventListener('change', this.changeDifficulty.bind(this));
    this.sizeInput.addEventListener('change', this.changeBoardSize.bind(this));
    document.getElementById('guide-close')?.addEventListener('click', this.toggleGuide.bind(this));
  }

  toggleGuide() {
    this.guideVisible = !this.guideVisible;
    this.guideOverlay.style.display = this.guideVisible ? 'flex' : 'none';
    if (this.guideVisible) {
      this.startButton.disabled = true;
      this.undoButton.disabled = true;
      this.redoButton.disabled = true;
      this.passButton.disabled = true;
    } else {
      this.updateButtonStates();
    }
  }

  updateButtonStates() {
    this.startButton.disabled = this.gameState === 'playing';
    this.undoButton.disabled = this.gameState !== 'playing' || !this.game.canUndo();
    this.redoButton.disabled = this.gameState !== 'playing' || !this.game.canRedo();
    this.passButton.disabled = this.gameState !== 'playing';
  }

  startGame() {
    this.gameState = 'playing';
    this.game = new GoGame(this.settings.boardSize);
    this.board = new GoBoard(this.settings.boardSize);
    this.ai = new GoAI(this.board, this.aiPlayer || 1, this.getSimCount(), 0.7);
    this.ui = new GoUI(this.canvas, this.game, this.ui.options);
    this.ui.draw();
    this.updateButtonStates();
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
    this.updateButtonStates();
  }

  redoMove() {
    if (this.gameState !== 'playing') return;
    this.game.redoMove();
    this.ui.draw();
    this.updateButtonStates();
  }

  passTurn() {
    if (this.gameState !== 'playing') return;
    this.game.pass();
    this.ui.draw();
    this.checkGameEnd();
    this.updateButtonStates();
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
        this.updateButtonStates();
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
      this.updateButtonStates();
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
    this.updateButtonStates();
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
      this.updateButtonStates();
    };
    reader.readAsText(file);
  }
}

export function startGame() {
  if (!document.getElementById('go-board')) {
    let canvas = document.createElement('canvas');
    canvas.id = 'go-board';
    canvas.width = 600;
    canvas.height = 600;
    document.body.appendChild(canvas);
  }
  let controller = new GameController('go-board', 19);
  controller.startGame();
}
document.getElementById('start-button').addEventListener('click', function() {
    showStartDescription();
});

document.getElementById('instructions-button').addEventListener('click', function() {
    toggleInstructions();
});

document.getElementById('toggle-theme-button').addEventListener('click', function() {
    toggleTheme();
});

function showStartDescription() {
    const descriptionElement = document.getElementById('description');
    descriptionElement.innerText = "Bắt đầu game";
}

function toggleInstructions() {
    const instructionsElement = document.getElementById('instructions');
    if (instructionsElement.style.display === "none") {
        instructionsElement.style.display = "block";
    } else {
        instructionsElement.style.display = "none";
    }
}

function toggleTheme() {
    document.body.classList.toggle('dark-theme');
}
