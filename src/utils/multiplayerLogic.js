export const createDeck = () => {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck = [];
  suits.forEach(suit => {
    ranks.forEach(rank => {
      deck.push({ suit, rank });
    });
  });
  return deck.sort(() => Math.random() - 0.5);
};

export const getNextActivePlayer = (players, currentIndex) => {
  let nextIndex = (currentIndex + 1) % players.length;
  // Prevent infinite loop if everyone is folded (shouldn't happen in a valid game state)
  let loopCount = 0;
  while (players[nextIndex].status === 'fold' && loopCount < players.length) {
    nextIndex = (nextIndex + 1) % players.length;
    loopCount++;
  }
  return nextIndex;
};

export const checkRoundComplete = (players) => {
  const activePlayers = players.filter(p => p.status === 'active');
  if (activePlayers.length <= 1) return true; // Everyone folded except 1

  // Find the highest bet
  let maxBet = 0;
  activePlayers.forEach(p => {
    if (p.bet > maxBet) maxBet = p.bet;
  });

  // Check if everyone has either matched the max bet or is all in (chips = 0)
  // For MVP, we just check if everyone's bet matches the max bet.
  // Note: we also need to ensure everyone has acted at least once, but for a simple MVP,
  // we can use a "lastAggressor" pattern or just track "acted" state.
  
  // Simple MVP Logic: If all active players have the same bet, round is over.
  // Exception: pre-flop big blind hasn't acted yet. 
  // To keep it simple, we check if all bets match maxBet AND everyone has acted.
  return activePlayers.every(p => p.bet === maxBet && p.acted);
};
