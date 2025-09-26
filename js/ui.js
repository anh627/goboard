export class GoUI {
  constructor(canvas, game, options = {}) {
    this.canvas = canvas;
    this.game = game;
    this.cellSize = canvas.width / game.board.size;
    this.options = {
      boardColor: options.boardColor || '#f0d9b5',
      gridColor: options.gridColor || '#000000',
      blackStoneColor: options.blackStoneColor || '#000000',
      whiteStoneColor: options.whiteStoneColor || '#ffffff',
      highlightColor: options.highlightColor || 'rgba(0, 255, 0, 0.3)',
      font: options.font || '20px Arial',
      animationDuration: options.animationDuration || 300
    };
    this.ctx = canvas.getContext('2d');
    this.dragging = false;
    this.dragStart = null;
    this.dragStone = null;
    this.hoveredCell = null;
    this.selectedMove = null;
    this.animations = [];
    this.scoreDisplay = { black: 0, white: 0 };
    this.moveHistory = [];
    this.currentMoveIndex = -1;
    this.isMobile = this.detectMobile();
    this.guideStep = 0;
    this.initEventListeners();
    this.resizeCanvas();
    this.draw();
  }

  detectMobile() {
    return /Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent);
  }

  resizeCanvas() {
    let dpr = window.devicePixelRatio || 1;
    let rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.cellSize = rect.width / this.game.board.size;
    this.draw();
  }

  initEventListeners() {
    if (this.isMobile) {
      this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
      this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
      this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));
    } else {
      this.canvas.addEventListener('click', this.handleClick.bind(this));
      this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
      this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
      this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
      this.canvas.addEventListener('contextmenu', this.handleRightClick.bind(this));
    }
    window.addEventListener('resize', this.resizeCanvas.bind(this));
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  handleTouchStart(event) {
    event.preventDefault();
    let touch = event.touches[0];
    let rect = this.canvas.getBoundingClientRect();
    let x = Math.floor((touch.clientY - rect.top) / this.cellSize);
    let y = Math.floor((touch.clientX - rect.left) / this.cellSize);
    this.dragStart = { x, y };
    this.dragging = true;
    this.dragStone = { x, y, player: this.game.getCurrentPlayer() };
    this.draw();
  }

  handleTouchMove(event) {
    event.preventDefault();
    if (!this.dragging) return;
    let touch = event.touches[0];
    let rect = this.canvas.getBoundingClientRect();
    let x = Math.floor((touch.clientY - rect.top) / this.cellSize);
    let y = Math.floor((touch.clientX - rect.left) / this.cellSize);
    this.dragStone = { x, y, player: this.game.getCurrentPlayer() };
    this.hoveredCell = { x, y };
    this.draw();
  }

  handleTouchEnd(event) {
    event.preventDefault();
    if (!this.dragging) return;
    let x = this.dragStone.x;
    let y = this.dragStone.y;
    this.dragging = false;
    this.dragStone = null;
    if (this.game.board.isValidMove(x, y)) {
      this.animateStonePlacement(x, y, () => {
        if (this.game.makeMove(x, y)) {
          this.updateMoveHistory(x, y);
          this.draw();
        }
      });
    } else {
      this.draw();
    }
  }

  handleMouseDown(event) {
    let rect = this.canvas.getBoundingClientRect();
    let x = Math.floor((event.clientY - rect.top) / this.cellSize);
    let y = Math.floor((event.clientX - rect.left) / this.cellSize);
    this.dragStart = { x, y };
    this.dragging = true;
    this.dragStone = { x, y, player: this.game.getCurrentPlayer() };
    this.draw();
  }

  handleMouseMove(event) {
    let rect = this.canvas.getBoundingClientRect();
    let x = Math.floor((event.clientY - rect.top) / this.cellSize);
    let y = Math.floor((event.clientX - rect.left) / this.cellSize);
    this.hoveredCell = { x, y };
    if (this.dragging) {
      this.dragStone = { x, y, player: this.game.getCurrentPlayer() };
    }
    this.draw();
  }

  handleMouseUp(event) {
    if (!this.dragging) return;
    let x = this.dragStone.x;
    let y = this.dragStone.y;
    this.dragging = false;
    this.dragStone = null;
    if (this.game.board.isValidMove(x, y)) {
      this.animateStonePlacement(x, y, () => {
        if (this.game.makeMove(x, y)) {
          this.updateMoveHistory(x, y);
          this.draw();
        }
      });
    } else {
      this.draw();
    }
  }

  handleClick(event) {
    let rect = this.canvas.getBoundingClientRect();
    let x = Math.floor((event.clientY - rect.top) / this.cellSize);
    let y = Math.floor((event.clientX - rect.left) / this.cellSize);
    if (event.button === 0 && this.game.board.isValidMove(x, y)) {
      this.animateStonePlacement(x, y, () => {
        if (this.game.makeMove(x, y)) {
          this.updateMoveHistory(x, y);
          this.draw();
        }
      });
    }
  }

  handleRightClick(event) {
    event.preventDefault();
    let rect = this.canvas.getBoundingClientRect();
    let x = Math.floor((event.clientY - rect.top) / this.cellSize);
    let y = Math.floor((event.clientX - rect.left) / this.cellSize);
    this.selectedMove = { x, y };
    this.draw();
  }

  handleKeyDown(event) {
    if (event.key === 'z' && event.ctrlKey) {
      this.undoMove();
    } else if (event.key === 'y' && event.ctrlKey) {
      this.redoMove();
    } else if (event.key === 'ArrowLeft') {
      this.showPreviousMove();
    } else if (event.key === 'ArrowRight') {
      this.showNextMove();
    }
  }

  updateMoveHistory(x, y) {
    if (this.currentMoveIndex < this.moveHistory.length - 1) {
      this.moveHistory = this.moveHistory.slice(0, this.currentMoveIndex + 1);
    }
    this.moveHistory.push({ x, y, player: this.game.getCurrentPlayer() });
    this.currentMoveIndex++;
  }

  undoMove() {
    if (this.currentMoveIndex >= 0) {
      this.game.undoMove();
      this.currentMoveIndex--;
      this.draw();
    }
  }

  redoMove() {
    if (this.currentMoveIndex < this.moveHistory.length - 1) {
      this.game.redoMove();
      this.currentMoveIndex++;
      this.draw();
    }
  }

  showPreviousMove() {
    if (this.currentMoveIndex >= 0) {
      this.currentMoveIndex--;
      this.game.setBoardToMove(this.currentMoveIndex);
      this.draw();
    }
  }

  showNextMove() {
    if (this.currentMoveIndex < this.moveHistory.length - 1) {
      this.currentMoveIndex++;
      this.game.setBoardToMove(this.currentMoveIndex);
      this.draw();
    }
  }

  animateStonePlacement(x, y, callback) {
    let startTime = performance.now();
    let animation = {
      x, y,
      startTime,
      progress: 0,
      update: (time) => {
        animation.progress = Math.min((time - startTime) / this.options.animationDuration, 1);
        if (animation.progress >= 1) {
          this.animations = this.animations.filter(a => a !== animation);
          callback();
        }
        this.draw();
      }
    };
    this.animations.push(animation);
    this.animate();
  }

  animate() {
    let time = performance.now();
    for (let animation of this.animations) {
      animation.update(time);
    }
    if (this.animations.length > 0) {
      requestAnimationFrame(this.animate.bind(this));
    }
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawBoard();
    this.drawStones();
    this.drawHoveredCell();
    this.drawDragStone();
    this.drawSelectedMove();
    this.drawScore();
    this.drawTurnIndicator();
    this.drawMoveHistory();
    this.drawAnimations();
    this.drawCapturedStones();
    this.drawTerritory();
    this.drawInfluenceMap();
    this.drawGameStatus();
  }

  drawBoard() {
    this.ctx.fillStyle = this.options.boardColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.strokeStyle = this.options.gridColor;
    this.ctx.lineWidth = 1;
    for (let i = 0; i < this.game.board.size; i++) {
      this.ctx.beginPath();
      this.ctx.moveTo(this.cellSize / 2, this.cellSize * (i + 0.5));
      this.ctx.lineTo(this.canvas.width - this.cellSize / 2, this.cellSize * (i + 0.5));
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.moveTo(this.cellSize * (i + 0.5), this.cellSize / 2);
      this.ctx.lineTo(this.cellSize * (i + 0.5), this.canvas.height - this.cellSize / 2);
      this.ctx.stroke();
    }
    let starPoints = this.getStarPoints();
    this.ctx.fillStyle = this.options.gridColor;
    for (let [x, y] of starPoints) {
      this.ctx.beginPath();
      this.ctx.arc((y + 0.5) * this.cellSize, (x + 0.5) * this.cellSize, this.cellSize / 10, 0, 2 * Math.PI);
      this.ctx.fill();
    }
  }

  getStarPoints() {
    let size = this.game.board.size;
    let points = [];
    let offsets = size === 19 ? [3, 9, 15] : size === 13 ? [3, 6, 9] : [2, 4];
    for (let x of offsets) {
      for (let y of offsets) {
        points.push([x, y]);
      }
    }
    return points;
  }

  drawStones() {
    for (let x = 0; x < this.game.board.size; x++) {
      for (let y = 0; y < this.game.board.size; y++) {
        if (this.game.board.board[x][y]) {
          this.drawStone(x, y, this.game.board.board[x][y]);
        }
      }
    }
  }

  drawStone(x, y, player, scale = 1) {
    this.ctx.beginPath();
    this.ctx.arc((y + 0.5) * this.cellSize, (x + 0.5) * this.cellSize, this.cellSize / 2.5 * scale, 0, 2 * Math.PI);
    this.ctx.fillStyle = player === 1 ? this.options.blackStoneColor : this.options.whiteStoneColor;
    this.ctx.fill();
    this.ctx.strokeStyle = player === 1 ? this.options.whiteStoneColor : this.options.blackStoneColor;
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
  }

  drawHoveredCell() {
    if (this.hoveredCell && this.game.board.isValidMove(this.hoveredCell.x, this.hoveredCell.y)) {
      this.ctx.beginPath();
      this.ctx.arc((this.hoveredCell.y + 0.5) * this.cellSize, (this.hoveredCell.x + 0.5) * this.cellSize, this.cellSize / 2.5, 0, 2 * Math.PI);
      this.ctx.fillStyle = this.options.highlightColor;
      this.ctx.fill();
    }
  }

  drawDragStone() {
    if (this.dragStone && this.game.board.isValidMove(this.dragStone.x, this.dragStone.y)) {
      this.drawStone(this.dragStone.x, this.dragStone.y, this.dragStone.player, 0.8);
    }
  }

  drawSelectedMove() {
    if (this.selectedMove) {
      this.ctx.beginPath();
      this.ctx.arc((this.selectedMove.y + 0.5) * this.cellSize, (this.selectedMove.x + 0.5) * this.cellSize, this.cellSize / 5, 0, 2 * Math.PI);
      this.ctx.fillStyle = 'red';
      this.ctx.fill();
    }
  }

  drawScore() {
    let score = this.game.getScore();
    this.scoreDisplay.black = score.black;
    this.scoreDisplay.white = score.white;
    this.ctx.font = this.options.font;
    this.ctx.fillStyle = this.options.blackStoneColor;
    this.ctx.fillText(`Black: ${this.scoreDisplay.black}`, 10, this.canvas.height - 50);
    this.ctx.fillStyle = this.options.whiteStoneColor;
    this.ctx.fillText(`White: ${this.scoreDisplay.white}`, 10, this.canvas.height - 30);
  }

  drawTurnIndicator() {
    let player = this.game.getCurrentPlayer();
    this.ctx.font = this.options.font;
    this.ctx.fillStyle = player === 1 ? this.options.blackStoneColor : this.options.whiteStoneColor;
    this.ctx.fillText(`Turn: ${player === 1 ? 'Black' : 'White'}`, 10, this.canvas.height - 10);
  }

  drawMoveHistory() {
    this.ctx.font = this.options.font;
    this.ctx.fillStyle = this.options.gridColor;
    let y = 20;
    let start = Math.max(0, this.currentMoveIndex - 5);
    let end = Math.min(this.moveHistory.length, start + 5);
    for (let i = start; i < end; i++) {
      let move = this.moveHistory[i];
      let text = `Move ${i + 1}: ${move.player === 1 ? 'Black' : 'White'} at (${move.x}, ${move.y})`;
      this.ctx.fillText(text, this.canvas.width - 200, y);
      y += 20;
    }
    if (this.currentMoveIndex >= 0) {
      this.ctx.fillStyle = 'red';
      this.ctx.fillText('>', this.canvas.width - 220, 20 + (this.currentMoveIndex - start) * 20);
    }
  }

  drawAnimations() {
    for (let animation of this.animations) {
      this.drawStone(animation.x, animation.y, this.game.getCurrentPlayer(), animation.progress);
    }
  }

  drawCapturedStones() {
    let captures = this.game.getCaptures();
    this.ctx.font = this.options.font;
    this.ctx.fillStyle = this.options.blackStoneColor;
    this.ctx.fillText(`Black Captures: ${captures.black}`, this.canvas.width - 200, this.canvas.height - 50);
    this.ctx.fillStyle = this.options.whiteStoneColor;
    this.ctx.fillText(`White Captures: ${captures.white}`, this.canvas.width - 200, this.canvas.height - 30);
  }

  drawTerritory() {
    let territory = this.game.getTerritory();
    for (let x = 0; x < this.game.board.size; x++) {
      for (let y = 0; y < this.game.board.size; y++) {
        if (territory[x][y] !== 0) {
          this.ctx.fillStyle = territory[x][y] === 1 ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)';
          this.ctx.fillRect(y * this.cellSize, x * this.cellSize, this.cellSize, this.cellSize);
        }
      }
    }
  }

  drawInfluenceMap() {
    let influence = this.game.getInfluenceMap();
    for (let x = 0; x < this.game.board.size; x++) {
      for (let y = 0; y < this.game.board.size; y++) {
        let value = influence[x][y];
        if (value !== 0) {
          this.ctx.fillStyle = value > 0 ? `rgba(0, 0, 0, ${Math.abs(value)})` : `rgba(255, 255, 255, ${Math.abs(value)})`;
          this.ctx.fillRect(y * this.cellSize, x * this.cellSize, this.cellSize, this.cellSize);
        }
      }
    }
  }

  drawGameStatus() {
    let status = this.game.getGameStatus();
    if (status.ended) {
      this.ctx.font = '30px Arial';
      this.ctx.fillStyle = 'red';
      this.ctx.fillText(`Game Over: ${status.winner} Wins!`, this.canvas.width / 2 - 100, this.canvas.height / 2);
    }
  }
}
