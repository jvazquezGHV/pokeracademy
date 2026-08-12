import { Hand } from 'pokersolver';

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export const createDeck = () => {
  const deck = [];
  for (let suit of SUITS) {
    for (let rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
};

export const toSolverFormat = (card) => {
  const r = card.rank === '10' ? 'T' : card.rank;
  const s = card.suit.charAt(0);
  return `${r}${s}`;
};

export const calculateOdds = async (heroHole, villainHole, boardCards) => {
  // Offload to a small delay so we don't block the UI thread completely during Monte Carlo
  return new Promise((resolve) => {
    setTimeout(() => {
      const heroSolver = heroHole.map(toSolverFormat);
      const villainSolver = villainHole.map(toSolverFormat);
      const boardSolver = boardCards.map(toSolverFormat);
      
      const knownCards = [...heroSolver, ...villainSolver, ...boardSolver];
      const FULL_DECK = [];
      for (let s of ['s', 'h', 'd', 'c']) {
        for (let r of ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']) {
          FULL_DECK.push(`${r}${s}`);
        }
      }
      
      const remainingDeck = FULL_DECK.filter(c => !knownCards.includes(c));
      
      let heroWins = 0;
      let ties = 0;
      const ITERATIONS = 400; // Fast enough for UI, accurate enough for a rough gauge
      
      for (let i = 0; i < ITERATIONS; i++) {
        // Shuffle remaining deck (Fisher-Yates)
        const deck = [...remainingDeck];
        for (let j = deck.length - 1; j > 0; j--) {
          const k = Math.floor(Math.random() * (j + 1));
          [deck[j], deck[k]] = [deck[k], deck[j]];
        }
        
        const needed = 5 - boardSolver.length;
        const runout = deck.slice(0, needed);
        
        const finalBoard = [...boardSolver, ...runout];
        const heroHand = Hand.solve([...heroSolver, ...finalBoard]);
        const villainHand = Hand.solve([...villainSolver, ...finalBoard]);
        
        const winners = Hand.winners([heroHand, villainHand]);
        if (winners.length === 2) ties++;
        else if (winners[0] === heroHand) heroWins++;
      }
      
      const totalDecisive = ITERATIONS - ties;
      const winPct = totalDecisive === 0 ? 50 : (heroWins / totalDecisive) * 100;
      resolve(Math.round(winPct));
    }, 10);
  });
};
