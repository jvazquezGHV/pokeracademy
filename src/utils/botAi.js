import { Hand } from 'pokersolver';
import { toSolverFormat } from './pokerLogic';

export const BOT_TEMPLATES = [
  { id: 'bot_doyle', name: 'Bot Doyle', avatar: '🤠', defaultLevel: 'shark' },
  { id: 'bot_phil', name: 'Bot Phil', avatar: '🦁', defaultLevel: 'pro' },
  { id: 'bot_daniel', name: 'Bot Daniel', avatar: '🦊', defaultLevel: 'regular' },
  { id: 'bot_maverick', name: 'Bot Maverick', avatar: '😎', defaultLevel: 'rookie' },
  { id: 'bot_vanessa', name: 'Bot Vanessa', avatar: '🦄', defaultLevel: 'shark' },
  { id: 'bot_chip', name: 'Bot Chip', avatar: '🤖', defaultLevel: 'regular' }
];

export const BOT_LEVELS = [
  { key: 'rookie', label: 'Level 1: Rookie (Casual)', desc: 'Loose & passive. Calls often, bluffs rarely, easy to beat.' },
  { key: 'regular', label: 'Level 2: Regular (Standard)', desc: 'Balanced solid ABC poker. Folds junk, bets value pairs.' },
  { key: 'shark', label: 'Level 3: Shark (Aggressive)', desc: 'High aggression. Steals blinds, 3-bets, and fires multi-street bluffs.' },
  { key: 'pro', label: 'Level 4: GTO Master (Expert)', desc: 'Math-based solver play. Calculates pot odds and polarized sizing.' }
];

const RANK_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

// Evaluate preflop card combo
const getPreflopStrength = (c1, c2) => {
  if (!c1 || !c2) return 50;
  const v1 = RANK_VALUES[c1.rank] || 2;
  const v2 = RANK_VALUES[c2.rank] || 2;
  const isPair = v1 === v2;
  const isSuited = c1.suit === c2.suit;
  const high = Math.max(v1, v2);
  const low = Math.min(v1, v2);

  // Premium pairs
  if (isPair && high >= 10) return 95; // TT, JJ, QQ, KK, AA
  if (isPair && high >= 7) return 80;  // 77, 88, 99
  if (isPair) return 65;               // 22 - 66

  // AK, AQ
  if (high === 14 && low >= 12) return isSuited ? 92 : 88;
  if (high === 14 && low >= 10) return isSuited ? 82 : 75; // AJ, AT
  if (high === 14 && isSuited) return 70; // Ax suited

  // High Broadways (KQ, QJ, KJ)
  if (high >= 12 && low >= 11) return isSuited ? 78 : 70;

  // Suited connectors (T9s, 98s, 87s, 76s)
  if (isSuited && high - low === 1 && high >= 7) return 68;

  // Weak cards
  if (high <= 9 && !isPair) return 25;
  return isSuited ? 45 : 35;
};

// Evaluate postflop made hand & draw potential
const getPostflopStrength = (holeCards, boardCards) => {
  if (!holeCards || holeCards.length < 2 || !boardCards || boardCards.length < 3) {
    return { score: 50, desc: 'Unknown' };
  }

  try {
    const holeSolver = holeCards.map(toSolverFormat);
    const boardSolver = boardCards.map(toSolverFormat);
    const solved = Hand.solve([...holeSolver, ...boardSolver]);

    const name = solved.name; // e.g. 'High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'
    let score = 30;

    switch (name) {
      case 'Straight Flush':
      case 'Four of a Kind':
      case 'Full House':
        score = 98;
        break;
      case 'Flush':
        score = 92;
        break;
      case 'Straight':
        score = 88;
        break;
      case 'Three of a Kind':
        score = 82;
        break;
      case 'Two Pair':
        score = 75;
        break;
      case 'Pair': {
        // Check if top pair or middle pair
        const boardRanks = boardCards.map(c => RANK_VALUES[c.rank] || 2);
        const maxBoardRank = Math.max(...boardRanks);
        const heroRanks = holeCards.map(c => RANK_VALUES[c.rank] || 2);
        if (heroRanks.includes(maxBoardRank)) score = 68; // Top Pair
        else if (heroRanks.some(r => r > maxBoardRank)) score = 72; // Overpair
        else score = 52; // Middle / Low Pair
        break;
      }
      default: {
        // Check flush draw (4 cards of same suit)
        const suitsCount = {};
        [...holeCards, ...boardCards].forEach(c => {
          suitsCount[c.suit] = (suitsCount[c.suit] || 0) + 1;
        });
        const hasFlushDraw = Object.values(suitsCount).some(c => c === 4);
        score = hasFlushDraw ? 55 : 28;
        break;
      }
    }

    return { score, desc: solved.descr };
  } catch (err) {
    return { score: 40, desc: 'Hand' };
  }
};

/**
 * Main AI Bot Decision Engine
 * @param {Object} bot - Bot player object { cards, chips, bet }
 * @param {Object} gameState - Current poker game state { pot, board, phase, players }
 * @param {string} level - 'rookie' | 'regular' | 'shark' | 'pro'
 * @returns {Object} { action: 'fold' | 'call' | 'raise', amount: number }
 */
export const calculateBotAction = (bot, gameState, level = 'regular') => {
  const maxBet = Math.max(...gameState.players.map(p => p.bet));
  const toCall = maxBet - bot.bet;
  const pot = gameState.pot || 0;
  const potOdds = toCall > 0 ? toCall / (pot + toCall + toCall) : 0;
  const isPreflop = gameState.phase === 'preflop';

  let handStrength = 50;
  if (isPreflop) {
    handStrength = getPreflopStrength(bot.cards?.[0], bot.cards?.[1]);
  } else {
    const analysis = getPostflopStrength(bot.cards, gameState.board || []);
    handStrength = analysis.score;
  }

  // -------------------------------------------------------------------------
  // LEVEL 1: ROOKIE (Casual / Calling Station)
  // -------------------------------------------------------------------------
  if (level === 'rookie') {
    if (toCall === 0) {
      // 85% check, 15% min bet
      if (Math.random() < 0.15 && handStrength > 65) {
        return { action: 'raise', amount: 20 };
      }
      return { action: 'call', amount: 0 };
    }

    // Facing a bet: calls almost anything if bet is small, folds only on high bets with garbage
    if (toCall <= 40 || handStrength > 40) {
      return { action: 'call', amount: 0 };
    }
    return Math.random() < 0.5 ? { action: 'call', amount: 0 } : { action: 'fold', amount: 0 };
  }

  // -------------------------------------------------------------------------
  // LEVEL 2: REGULAR (Standard / Tight-Aggressive ABC)
  // -------------------------------------------------------------------------
  if (level === 'regular') {
    if (toCall === 0) {
      if (handStrength >= 65) {
        // Value bet 1/2 pot
        const betAmt = Math.max(20, Math.floor(pot * 0.5));
        return { action: 'raise', amount: betAmt };
      }
      return { action: 'call', amount: 0 };
    }

    // Facing a bet:
    if (handStrength >= 80) {
      // Raise strong hands
      const raiseAmt = Math.max(20, Math.floor(pot * 0.6));
      return { action: 'raise', amount: raiseAmt };
    }
    if (handStrength >= 55 || (isPreflop && handStrength >= 50 && toCall <= 40)) {
      return { action: 'call', amount: 0 };
    }
    return { action: 'fold', amount: 0 };
  }

  // -------------------------------------------------------------------------
  // LEVEL 3: SHARK (Aggressive / 3-Bet / Semi-Bluffs)
  // -------------------------------------------------------------------------
  if (level === 'shark') {
    if (toCall === 0) {
      // Frequent C-Betting (65% even on missed flops)
      if (handStrength >= 50 || Math.random() < 0.35) {
        const betAmt = Math.max(20, Math.floor(pot * 0.6));
        return { action: 'raise', amount: betAmt };
      }
      return { action: 'call', amount: 0 };
    }

    // Facing a bet:
    if (handStrength >= 75) {
      // Re-raise with strong hands
      return { action: 'raise', amount: Math.max(40, Math.floor(pot * 0.75)) };
    }
    // Occasional bluff raise with draws
    if (handStrength >= 50 && Math.random() < 0.25) {
      return { action: 'raise', amount: Math.max(30, Math.floor(pot * 0.5)) };
    }
    if (handStrength >= 48) {
      return { action: 'call', amount: 0 };
    }
    return { action: 'fold', amount: 0 };
  }

  // -------------------------------------------------------------------------
  // LEVEL 4: GTO MASTER (Expert / Polarized & Pot Odds Defense)
  // -------------------------------------------------------------------------
  if (level === 'pro') {
    if (toCall === 0) {
      // Polarized check/bet strategy
      if (handStrength >= 75 || (handStrength < 45 && Math.random() < 0.28)) {
        // Bet 2/3 pot
        const betAmt = Math.max(20, Math.floor(pot * 0.67));
        return { action: 'raise', amount: betAmt };
      }
      return { action: 'call', amount: 0 };
    }

    // Mathematical defense against bets:
    const requiredEquity = potOdds; // e.g. 0.25
    const estimatedEquity = handStrength / 100; // e.g. 0.70

    if (estimatedEquity >= 0.85) {
      // Strong value 3-bet / raise
      return { action: 'raise', amount: Math.max(40, Math.floor(pot * 0.8)) };
    }
    if (estimatedEquity >= requiredEquity) {
      return { action: 'call', amount: 0 };
    }
    // GTO Minimum Defense Frequency float bluff
    if (estimatedEquity >= requiredEquity * 0.75 && Math.random() < 0.2) {
      return { action: 'call', amount: 0 };
    }
    return { action: 'fold', amount: 0 };
  }

  return { action: 'call', amount: 0 };
};
