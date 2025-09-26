// js/ai.js
let aiWorker = new Worker('js/ai-worker.js');

function aiMove(game) {
  aiThinking.style.display = 'block';
  aiWorker.postMessage({board: game.board, depth: getDepthByLevel(), player: 2});
  aiWorker.onmessage = (e) => {
    const {x, y} = e.data;
    game.placeStone(x, y);
    aiThinking.style.display = 'none';
  };
}

function getDepthByLevel() {
  const level = document.getElementById('level').value;
  return level === 'newbie' ? 2 : level === 'casual' ? 4 : 6;
}

// (giữ other AI functions)
