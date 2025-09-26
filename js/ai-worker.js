// js/ai-worker.js (separate file for non-blocking AI)
self.addEventListener('message', (e) => {
  const {board, depth, player} = e.data;
  const move = findBestMove(board, depth, player); // Implement findBestMove with alpha-beta
  self.postMessage(move);
});

// Function findBestMove (copy logic from ai.js, run in worker)
function findBestMove(board, depth, player) {
  // (alpha-beta logic from ai.js, return best {x, y})
}
