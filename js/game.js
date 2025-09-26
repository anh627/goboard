// js/game.js - Complete Go game implementation (Load SGF removed, with debug for buttons)
class GoGame {
    constructor(size = 19, komi = 6.5, handicap = 0, ruleSet = 'chinese') {
        this.size = size;
        this.komi = komi;
        this.handicap = handicap;
        this.ruleSet = ruleSet;
        this.board = Array(size).fill().map(() => Array(size).fill(0));
        this.currentPlayer = handicap > 0 ? 2 : 1; // 1 = black, 2 = white
        this.captures = { 1: 0, 2: 0 };
        this.history = [];
        this.koPoint = null;
        this.consecutivePasses = 0;
        this.gameOver = false;
        this.territory = { 1: 0, 2: 0 };
        this.deadStones = new Set();
        
        // Place handicap stones
        if (handicap > 0) {
            this.placeHandicapStones(handicap);
        }
    }
    
    placeHandicapStones(count) {
        const positions = this.getHandicapPositions(count);
        positions.forEach(([x, y]) => {
            this.board[y][x] = 1; // Black stones
        });
    }
    
    getHandicapPositions(count) {
        const d = this.size === 19 ? 3 : (this.size === 13 ? 3 : 2);
        const mid = Math.floor(this.size / 2);
        
        const starPoints = [];
        // Corner points
        starPoints.push([d, d], [this.size - 1 - d, d], 
                        [d, this.size - 1 - d], [this.size - 1 - d, this.size - 1 - d]);
        
        // Side points
        if (this.size >= 13) {
            starPoints.push([mid, d], [mid, this.size - 1 - d],
                           [d, mid], [this.size - 1 - d, mid]);
        }
        
        // Center point
        if (this.size >= 13) {
            starPoints.push([mid, mid]);
        }
        
        return starPoints.slice(0, count);
    }
    
    isValidMove(x, y) {
        // Check bounds
        if (x < 0 || x >= this.size || y < 0 || y >= this.size) return false;
        
        // Check if position is empty
        if (this.board[y][x] !== 0) return false;
        
        // Check Ko rule
        if (this.koPoint && this.koPoint.x === x && this.koPoint.y === y) return false;
        
        // Check suicide rule
        return !this.isSuicideMove(x, y, this.currentPlayer);
    }
    
    isSuicideMove(x, y, player) {
        // Temporarily place stone
        this.board[y][x] = player;
        
        // Check if this group would have liberties
        const hasLiberties = this.getGroupLiberties(x, y).size > 0;
        
        // Check if this move captures enemy stones
        const wouldCapture = this.getNeighbors(x, y).some(([nx, ny]) => {
            if (this.board[ny][nx] === 3 - player) {
                return this.getGroupLiberties(nx, ny).size === 0;
            }
            return false;
        });
        
        // Remove temporary stone
        this.board[y][x] = 0;
        
        // Suicide is only allowed if it captures enemy stones
        return !hasLiberties && !wouldCapture;
    }
    
    placeStone(x, y) {
        if (!this.isValidMove(x, y)) return false;
        
        // Save state for history
        this.saveState();
        
        // Place stone
        this.board[y][x] = this.currentPlayer;
        
        // Reset consecutive passes
        this.consecutivePasses = 0;
        
        // Clear Ko point
        this.koPoint = null;
        
        // Capture enemy stones
        const capturedStones = this.captureStones(x, y);
        
        // Check for Ko
        if (capturedStones.length === 1) {
            const [capX, capY] = capturedStones[0];
            if (this.isKoSituation(capX, capY, x, y)) {
                this.koPoint = { x: capX, y: capY };
            }
        }
        
        // Switch player
        this.currentPlayer = 3 - this.currentPlayer;
        
        return true;
    }
    
    isKoSituation(capX, capY, lastX, lastY) {
        const capturingGroup = this.getGroup(lastX, lastY);
        return capturingGroup.size === 1;
    }
    
    captureStones(x, y) {
        const captured = [];
        const opponent = 3 - this.currentPlayer;
        
        this.getNeighbors(x, y).forEach(([nx, ny]) => {
            if (this.board[ny][nx] === opponent) {
                const liberties = this.getGroupLiberties(nx, ny);
                if (liberties.size === 0) {
                    const group = this.getGroup(nx, ny);
                    group.forEach(([gx, gy]) => {
                        this.board[gy][gx] = 0;
                        captured.push([gx, gy]);
                    });
                }
            }
        });
        
        this.captures[this.currentPlayer] += captured.length;
        
        return captured;
    }
    
    getNeighbors(x, y) {
        const neighbors = [];
        const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
        
        directions.forEach(([dx, dy]) => {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < this.size && ny >= 0 && ny < this.size) {
                neighbors.push([nx, ny]);
            }
        });
        
        return neighbors;
    }
    
    getGroup(x, y) {
        const color = this.board[y][x];
        if (color === 0) return new Set();
        
        const group = new Set();
        const stack = [[x, y]];
        const visited = new Set();
        
        while (stack.length > 0) {
            const [cx, cy] = stack.pop();
            const key = `${cx},${cy}`;
            
            if (visited.has(key)) continue;
            visited.add(key);
            
            if (this.board[cy][cx] === color) {
                group.add([cx, cy]);
                
                this.getNeighbors(cx, cy).forEach(([nx, ny]) => {
                    if (!visited.has(`${nx},${ny}`)) {
                        stack.push([nx, ny]);
                    }
                });
            }
        }
        
        return group;
    }
    
    getGroupLiberties(x, y) {
        const group = this.getGroup(x, y);
        const liberties = new Set();
        
        group.forEach(([gx, gy]) => {
            this.getNeighbors(gx, gy).forEach(([nx, ny]) => {
                if (this.board[ny][nx] === 0) {
                    liberties.add(`${nx},${ny}`);
                }
            });
        });
        
        return liberties;
    }
    
    pass() {
        this.saveState();
        this.consecutivePasses++;
        this.currentPlayer = 3 - this.currentPlayer;
        
        if (this.consecutivePasses >= 2) {
            this.gameOver = true;
            return true; // Game ends
        }
        return false;
    }
    
    resign() {
        this.gameOver = true;
        this.winner = 3 - this.currentPlayer;
        return this.winner;
    }
    
    saveState() {
        this.history.push({
            board: this.board.map(row => [...row]),
            currentPlayer: this.currentPlayer,
            captures: { ...this.captures },
            koPoint: this.koPoint ? { ...this.koPoint } : null,
            consecutivePasses: this.consecutivePasses
        });
    }
    
    undo() {
        if (this.history.length === 0) return false;
        
        const state = this.history.pop();
        this.board = state.board;
        this.currentPlayer = state.currentPlayer;
        this.captures = state.captures;
        this.koPoint = state.koPoint;
        this.consecutivePasses = state.consecutivePasses;
        
        return true;
    }
    
    markDeadStone(x, y) {
        const key = `${x},${y}`;
        if (this.deadStones.has(key)) {
            // Unmark entire group
            const group = this.getGroup(x, y);
            group.forEach(([gx, gy]) => {
                this.deadStones.delete(`${gx},${gy}`);
            });
        } else {
            // Mark entire group as dead
            const group = this.getGroup(x, y);
            group.forEach(([gx, gy]) => {
                this.deadStones.add(`${gx},${gy}`);
            });
        }
    }
    
    calculateScore() {
        // Remove dead stones
        this.deadStones.forEach(key => {
            const [x, y] = key.split(',').map(Number);
            const color = this.board[y][x];
            if (color !== 0) {
                this.captures[3 - color]++;
                this.board[y][x] = 0;
            }
        });
        
        // Calculate territory
        this.calculateTerritory();
        
        // Calculate final scores based on ruleset
        let blackScore, whiteScore;
        
        if (this.ruleSet === 'chinese') {
            blackScore = this.countStones(1) + this.territory[1];
            whiteScore = this.countStones(2) + this.territory[2] + this.komi;
        } else {
            blackScore = this.territory[1] + this.captures[1];
            whiteScore = this.territory[2] + this.captures[2] + this.komi;
        }
        
        return {
            black: blackScore,
            white: whiteScore,
            winner: blackScore > whiteScore ? 'black' : 'white',
            difference: Math.abs(blackScore - whiteScore)
        };
    }
    
    countStones(color) {
        let count = 0;
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                if (this.board[y][x] === color) count++;
            }
        }
        return count;
    }
    
    calculateTerritory() {
        const visited = new Set();
        this.territory = { 1: 0, 2: 0 };
        
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                if (this.board[y][x] === 0 && !visited.has(`${x},${y}`)) {
                    const territory = this.getTerritory(x, y, visited);
                    if (territory.owner !== 0) {
                        this.territory[territory.owner] += territory.size;
                    }
                }
            }
        }
    }
    
    getTerritory(startX, startY, visited) {
        const territory = new Set();
        const stack = [[startX, startY]];
        const borders = new Set();
        
        while (stack.length > 0) {
            const [x, y] = stack.pop();
            const key = `${x},${y}`;
            
            if (visited.has(key)) continue;
            visited.add(key);
            
            if (this.board[y][x] === 0) {
                territory.add(key);
                
                this.getNeighbors(x, y).forEach(([nx, ny]) => {
                    if (this.board[ny][nx] === 0) {
                        if (!visited.has(`${nx},${ny}`)) {
                            stack.push([nx, ny]);
                        }
                    } else {
                        borders.add(this.board[ny][nx]);
                    }
                });
            }
        }
        
        const owner = borders.size === 1 ? [...borders][0] : 0;
        
        return {
            size: territory.size,
            owner: owner,
            points: territory
        };
    }
    
    exportSGF() {
        let sgf = '(;FF[4]GM[1]SZ[' + this.size + ']KM[' + this.komi + ']';
        
        if (this.handicap > 0) {
            sgf += 'HA[' + this.handicap + ']';
        }
        
        this.history.forEach((state, index) => {
            if (index > 0) {
                const prevState = this.history[index - 1];
                for (let y = 0; y < this.size; y++) {
                    for (let x = 0; x < this.size; x++) {
                        if (state.board[y][x] !== prevState.board[y][x] && state.board[y][x] !== 0) {
                            const color = state.board[y][x] === 1 ? 'B' : 'W';
                            const coord = String.fromCharCode(97 + x) + String.fromCharCode(97 + y);
                            sgf += ';' + color + '[' + coord + ']';
                        }
                    }
                }
            }
        });
        
        sgf += ')';
        return sgf;
    }
}

// Game Controller
class GameController {
    constructor() {
        this.game = null;
        this.canvas = document.getElementById('board');
        this.ctx = this.canvas.getContext('2d');
        this.cellSize = 40;
        this.boardPadding = 30;
        this.mode = 'ai';
        this.level = 'casual';
        this.aiWorker = null;
        this.isAIThinking = false;
        this.showHints = false;
        this.cursorPos = { x: -1, y: -1 };
        this.isDeadMarkingMode = false;
        this.hintPosition = null;
        
        this.setupEventListeners();
        this.loadGuides();
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    resizeCanvas() {
        const maxSize = Math.min(window.innerWidth - 40, window.innerHeight - 200, 800);
        this.cellSize = Math.floor(maxSize / (this.game ? this.game.size : 19));
        const canvasSize = (this.game ? this.game.size - 1 : 18) * this.cellSize + 2 * this.boardPadding;
        this.canvas.width = canvasSize;
        this.canvas.height = canvasSize;
        if (this.game) this.drawBoard();
    }
    
    loadGuides() {
        this.guides = {
            newbie: '<p><strong>Newbie Guide:</strong> Welcome! Place stones on intersections. Surround opponent\'s stones to capture. No suicide moves. Pass to end turn. Double pass ends game. Use undo if needed.</p><img src="assets/images/go-9x9.jpg" alt="Newbie board" onerror="this.src=\'assets/images/board-fallback.png\'" width="200">',
            casual: '<p><strong>Casual Tip:</strong> Focus on corners first. Watch for Ko fights. Hint available. Score = territory + captures.</p><img src="assets/images/go-quick-match.jpg" alt="Casual game" onerror="this.src=\'assets/images/board-fallback.png\'" width="200">',
            pro: '<p><strong>Pro Tip:</strong> Build moyo, invade weak groups. Calculate semeai. Optimize yose in endgame.</p><img src="assets/images/go-pro-analysis.jpg" alt="Pro analysis" onerror="this.src=\'assets/images/board-fallback.png\'" width="200">'
        };
    }
    
    showGuide() {
        const guideContent = document.getElementById('guideContent');
        guideContent.innerHTML = this.guides[this.level];
        showElement('guideModal');
    }
    
    closeGuide() {
        hideElement('guideModal');
        if (document.getElementById('dontShowAgain').checked) {
            localStorage.setItem('dontShowGuide', 'true');
        }
    }
    
    setupEventListeners() {
        // Start game
        document.getElementById('startGame').addEventListener('click', () => {
            console.log('Start Game button clicked'); // Debug
            this.startNewGame();
        });
        
        // Open guide
        document.getElementById('openGuide').addEventListener('click', () => {
            console.log('Open Guide button clicked'); // Debug
            this.showGuide();
        });
        
        // Canvas events
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleCanvasHover(e));
        this.canvas.addEventListener('mouseleave', () => this.clearHover());
        
        // Keyboard navigation
        this.canvas.addEventListener('keydown', (e) => this.handleKeyboard(e));
        
        // Game controls
        document.getElementById('pass').addEventListener('click', () => this.handlePass());
        document.getElementById('resign').addEventListener('click', () => this.handleResign());
        document.getElementById('undo').addEventListener('click', () => this.handleUndo());
        document.getElementById('hint').addEventListener('click', () => this.showHint());
        document.getElementById('saveGame').addEventListener('click', () => this.saveGame());
        
        // Chat
        document.getElementById('sendChat').addEventListener('click', () => this.sendChat());
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChat();
        });
        
        // End game
        document.getElementById('confirmScore').addEventListener('click', () => this.confirmScore());
        document.getElementById('resumeGame').addEventListener('click', () => this.resumeGame());
        
        // Guide modal close
        document.querySelector('.close').addEventListener('click', () => this.closeGuide());
        document.getElementById('guideModal').addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeGuide();
        });
        
        // Level change
        document.getElementById('level').addEventListener('change', (e) => {
            this.level = e.target.value;
            this.updateHintVisibility();
        });
    }
    
    startNewGame() {
        console.log('Starting new game...'); // Debug
        const size = parseInt(document.getElementById('boardSize').value);
        const komi = parseFloat(document.getElementById('komi').value);
        const handicap = parseInt(document.getElementById('handicap').value);
        const ruleSet = document.getElementById('ruleSet').value;
        this.mode = document.getElementById('mode').value;
        this.level = document.getElementById('level').value;
        
        this.game = new GoGame(size, komi, handicap, ruleSet);
        
        this.resizeCanvas();
        
        hideElement('settings');
        showElement('gameArea');
        
        if (this.mode === 'hotseat') {
            showElement('chat');
        }
        
        this.updateHintVisibility();
        
        if (this.mode === 'ai' && !this.aiWorker) {
            this.aiWorker = new Worker('js/ai-worker.js');
            this.aiWorker.onmessage = (e) => this.handleAIMove(e.data);
            this.aiWorker.onerror = () => alert('AI error! Please try again.');
        }
        
        this.drawBoard();
        this.updateStatus();
        
        if (this.level === 'newbie' && localStorage.getItem('dontShowGuide') !== 'true') {
            this.showGuide();
        }
        
        gameInProgress = true;
        
        if (this.mode === 'ai' && this.game.currentPlayer === 2) {
            this.triggerAIMove();
        }
    }
    
    updateHintVisibility() {
        const hintButton = document.getElementById('hint');
        hintButton.style.display = (this.level !== 'pro') ? 'block' : 'none';
    }
    
    handleCanvasClick(e) {
        if (this.game.gameOver || this.isAIThinking) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left - this.boardPadding) / this.cellSize);
        const y = Math.floor((e.clientY - rect.top - this.boardPadding) / this.cellSize);
        
        if (this.isDeadMarkingMode) {
            this.game.markDeadStone(x, y);
            this.drawBoard();
            return;
        }
        
        if (this.game.placeStone(x, y)) {
            this.drawBoard();
            this.updateStatus();
            this.updateCaptures();
            
            if (this.mode === 'ai' && this.game.currentPlayer === 2) {
                this.triggerAIMove();
            }
        }
    }
    
    handleCanvasHover(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left - this.boardPadding) / this.cellSize);
        const y = Math.floor((e.clientY - rect.top - this.boardPadding) / this.cellSize);
        
        if (x >= 0 && x < this.game.size && y >= 0 && y < this.game.size) {
            this.cursorPos = { x, y };
            this.drawBoard();
        }
    }
    
    clearHover() {
        this.cursorPos = { x: -1, y: -1 };
        this.drawBoard();
    }
    
    handleKeyboard(e) {
        let { x, y } = this.cursorPos;
        if (x < 0) {
            x = Math.floor(this.game.size / 2);
            y = x;
        }
        
        switch (e.key) {
            case 'ArrowUp': y = Math.max(0, y - 1); break;
            case 'ArrowDown': y = Math.min(this.game.size - 1, y + 1); break;
            case 'ArrowLeft': x = Math.max(0, x - 1); break;
            case 'ArrowRight': x = Math.min(this.game.size - 1, x + 1); break;
            case 'Enter':
                this.handleCanvasClick({ clientX: this.boardPadding + x * this.cellSize, clientY: this.boardPadding + y * this.cellSize, target: this.canvas });
                return;
        }
        this.cursorPos = { x, y };
        this.drawBoard();
    }
    
    drawBoard() {
        const ctx = this.ctx;
        const size = this.game.size;
        
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--board-color');
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        
        for (let i = 0; i < size; i++) {
            const pos = this.boardPadding + i * this.cellSize;
            ctx.beginPath();
            ctx.moveTo(pos, this.boardPadding);
            ctx.lineTo(pos, this.boardPadding + (size - 1) * this.cellSize);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(this.boardPadding, pos);
            ctx.lineTo(this.boardPadding + (size - 1) * this.cellSize, pos);
            ctx.stroke();
        }
        
        this.drawStarPoints();
        
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (this.game.board[y][x] !== 0) {
                    const isDead = this.deadStones.has(`${x},${y}`);
                    this.drawStone(x, y, this.game.board[y][x], isDead);
                }
            }
        }
        
        if (this.game.history.length > 0) {
            this.drawLastMoveIndicator();
        }
        
        if (this.cursorPos.x >= 0 && this.cursorPos.y >= 0 && !this.isDeadMarkingMode) {
            this.drawHoverStone(this.cursorPos.x, this.cursorPos.y);
        }
        
        if (this.hintPosition) {
            this.drawHint(this.hintPosition.x, this.hintPosition.y);
        }
        
        if (this.isDeadMarkingMode) {
            this.drawDeadStones();
            this.drawTerritory();
        }
    }
    
    drawStarPoints() {
        const size = this.game.size;
        const positions = this.game.getHandicapPositions(9);
        
        positions.forEach(([x, y]) => {
            if (x < size && y < size) {
                const px = this.boardPadding + x * this.cellSize;
                const py = this.boardPadding + y * this.cellSize;
                
                this.ctx.fillStyle = '#000';
                this.ctx.beginPath();
                this.ctx.arc(px, py, 3, 0, 2 * Math.PI);
                this.ctx.fill();
            }
        });
    }
    
    drawStone(x, y, color, isDead = false) {
        const px = this.boardPadding + x * this.cellSize;
        const py = this.boardPadding + y * this.cellSize;
        const radius = this.cellSize * 0.45;
        
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        this.ctx.shadowBlur = 5;
        this.ctx.shadowOffsetX = 2;
        this.ctx.shadowOffsetY = 2;
        
        this.ctx.fillStyle = color === 1 ? '#000' : '#fff';
        this.ctx.beginPath();
        this.ctx.arc(px, py, radius, 0, 2 * Math.PI);
        this.ctx.fill();
        
        if (color === 2) {
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
        }
        
        this.ctx.shadowColor = 'transparent';
        this.ctx.shadowBlur = 0;
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 0;
        
        // Animation for placement (fade in)
        let opacity = 0;
        const animation = () => {
            opacity += 0.1;
            if (opacity < 1) requestAnimationFrame(animation);
            // Redraw stone with opacity (simplified for completeness)
        };
        animation();
        
        if (isDead) {
            this.ctx.fillStyle = 'red';
            this.ctx.font = 'bold 20px Arial';
            this.ctx.fillText('✕', px - 10, py + 10);
        }
    }
    
    drawHoverStone(x, y) {
        if (this.game.board[y][x] !== 0 || !this.game.isValidMove(x, y)) return;
        
        const px = this.boardPadding + x * this.cellSize;
        const py = this.boardPadding + y * this.cellSize;
        const radius = this.cellSize * 0.45;
        
        this.ctx.fillStyle = this.game.currentPlayer === 1 ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)';
        this.ctx.beginPath();
        this.ctx.arc(px, py, radius, 0, 2 * Math.PI);
        this.ctx.fill();
    }
    
    drawHint(x, y) {
        const px = this.boardPadding + x * this.cellSize;
        const py = this.boardPadding + y * this.cellSize;
        const radius = this.cellSize * 0.45 + 5;
        
        this.ctx.strokeStyle = '#3498db';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(px, py, radius, 0, 2 * Math.PI);
        this.ctx.stroke();
    }
    
    drawLastMoveIndicator() {
        if (this.game.history.length === 0) return;
        
        const currentState = this.game.history[this.game.history.length - 1];
        const prevState = this.game.history.length > 1 ? this.game.history[this.game.history.length - 2] : { board: Array(this.game.size).fill().map(() => Array(this.game.size).fill(0)) };
        
        for (let y = 0; y < this.game.size; y++) {
            for (let x = 0; x < this.game.size; x++) {
                if (currentState.board[y][x] !== prevState.board[y][x] && currentState.board[y][x] !== 0) {
                    const px = this.boardPadding + x * this.cellSize;
                    const py = this.boardPadding + y * this.cellSize;
                    
                    this.ctx.fillStyle = 'red';
                    this.ctx.beginPath();
                    this.ctx.arc(px, py - this.cellSize / 2 - 5, 5, 0, 2 * Math.PI);
                    this.ctx.fill();
                    return; // Only one last move
                }
            }
        }
    }
    
    drawDeadStones() {
        this.deadStones.forEach(key => {
            const [x, y] = key.split(',').map(Number);
            if (this.game.board[y][x] !== 0) {
                this.drawStone(x, y, this.game.board[y][x], true);
            }
        });
    }
    
    drawTerritory() {
        // Simplified territory visualization for scoring mode
        const visited = new Set();
        for (let y = 0; y < this.game.size; y++) {
            for (let x = 0; x < this.game.size; x++) {
                if (this.game.board[y][x] === 0 && !visited.has(`${x},${y}`)) {
                    const territory = this.game.getTerritory(x, y, visited);
                    if (territory.owner !== 0) {
                        territory.points.forEach(pointKey => {
                            const [tx, ty] = pointKey.split(',').map(Number);
                            const px = this.boardPadding + tx * this.cellSize - this.cellSize / 2;
                            const py = this.boardPadding + ty * this.cellSize - this.cellSize / 2;
                            this.ctx.fillStyle = territory.owner === 1 ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)';
                            this.ctx.fillRect(px, py, this.cellSize, this.cellSize);
                        });
                    }
                }
            }
        }
    }
    
    updateStatus() {
        updateStatus(`Lượt của ${this.game.currentPlayer === 1 ? 'Đen' : 'Trắng'}`);
    }
    
    updateCaptures() {
        document.getElementById('blackCaptures').textContent = this.game.captures[1];
        document.getElementById('whiteCaptures').textContent = this.game.captures[2];
    }
    
    handlePass() {
        if (this.game.pass()) {
            this.endGame();
        } else {
            this.updateStatus();
            if (this.mode === 'ai' && this.game.currentPlayer === 2) this.triggerAIMove();
        }
    }
    
    handleResign() {
        this.game.resign();
        alert(`Người chơi ${this.game.winner === 1 ? 'Đen' : 'Trắng'} thắng do đối thủ đầu hàng!`);
        this.endGame();
    }
    
    handleUndo() {
        if (this.game.undo()) {
            this.drawBoard();
            this.updateStatus();
            this.updateCaptures();
        }
    }
    
    showHint() {
        // Call AI for hint (low depth)
        if (this.level === 'pro') return;
        showElement('aiThinking');
        this.aiWorker.postMessage({board: this.game.board, depth: 2, player: this.game.currentPlayer});
        this.aiWorker.onmessage = (e) => {
            this.hintPosition = e.data;
            this.drawBoard();
            hideElement('aiThinking');
        };
    }
    
    triggerAIMove() {
        showElement('aiThinking');
        this.isAIThinking = true;
        const depth = this.level === 'newbie' ? 2 : this.level === 'casual' ? 4 : 6;
        this.aiWorker.postMessage({board: this.game.board, depth, player: 2});
    }
    
    handleAIMove(move) {
        this.isAIThinking = false;
        hideElement('aiThinking');
        this.game.placeStone(move.x, move.y);
        this.drawBoard();
        this.updateStatus();
        this.updateCaptures();
    }
    
    sendChat() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        if (message) {
            const msgDiv = document.createElement('p');
            msgDiv.textContent = `${this.game.currentPlayer === 1 ? 'Player 1' : 'Player 2'}: ${message}`;
            document.getElementById('chatMessages').appendChild(msgDiv);
            input.value = '';
            document.getElementById('chatMessages').scrollTop = document.getElementById('chatMessages').scrollHeight;
        }
    }
    
    endGame() {
        this.isDeadMarkingMode = true;
        showElement('endGame');
        this.drawBoard(); // Show marking mode
    }
    
    confirmScore() {
        const score = this.game.calculateScore();
        document.getElementById('scoreInfo').innerHTML = `
            <p>Đen: ${score.black}</p>
            <p>Trắng: ${score.white} (bao gồm komi ${this.game.komi})</p>
            <p>Người thắng: ${score.winner === 'black' ? 'Đen' : 'Trắng'} (+${score.difference} điểm)</p>
        `;
        this.isDeadMarkingMode = false;
        hideElement('gameArea');
    }
    
    resumeGame() {
        this.isDeadMarkingMode = false;
        this.game.gameOver = false;
        this.game.consecutivePasses = 0;
        hideElement('endGame');
        this.drawBoard();
    }
    
    saveGame() {
        const sgf = this.game.exportSGF();
        const blob = new Blob([sgf], {type: 'text/plain'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'game.sgf';
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Initialize controller
const controller = new GameController();
