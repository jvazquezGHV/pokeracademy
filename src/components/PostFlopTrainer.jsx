import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { playSound } from '../utils/audio';
import Card from './Card';
import './PostFlopTrainer.css';

const SCENARIOS = [
  {
    id: 1,
    title: "The Dry Flop C-Bet",
    street: "Flop",
    heroPosition: "BTN (In Position)",
    villainPosition: "BB (Out of Position)",
    pot: 65,
    context: "You raised from the Button preflop, and the Big Blind defended. On a dry rainbow flop, the Big Blind checks to you.",
    heroCards: [{ suit: 'spades', rank: 'A' }, { suit: 'diamonds', rank: 'K' }],
    board: [
      { suit: 'clubs', rank: '2' },
      { suit: 'diamonds', rank: '7' },
      { suit: 'hearts', rank: 'J' }
    ],
    correctAction: 'Bet',
    explanation: "This is a quintessential dry board C-Bet spot. Even with Ace-High, this static board completely favors your preflop raising range over the BB's wide calling range. A small bet (1/3 pot, ~$22) forces folds from all of villain's missed undercards and unsuited broadways while maintaining initiative."
  },
  {
    id: 2,
    title: "Danger Four-Straight on the Turn",
    street: "Turn",
    heroPosition: "CO",
    villainPosition: "BB",
    pot: 120,
    context: "You have Broadway with A♥ K♥. The turn puts 4 cards to a straight on board (9-10-J-Q). Villain leads out with a heavy $80 bet into the $120 pot.",
    heroCards: [{ suit: 'hearts', rank: 'A' }, { suit: 'hearts', rank: 'K' }],
    board: [
      { suit: 'hearts', rank: 'Q' },
      { suit: 'diamonds', rank: 'J' },
      { suit: 'clubs', rank: '10' },
      { suit: 'hearts', rank: '9' }
    ],
    correctAction: 'Call',
    explanation: "You have a straight and the Nut Flush draw, but raising is a serious mistake here. Any King chops with you, any Eight made an identical straight, and a raise folds out every hand you beat while only getting action from monsters or chops. Calling keeps villain's bluffing range in and lets you freely realize your flush redraw on the river."
  },
  {
    id: 3,
    title: "Facing the Polar Overbet on River",
    street: "River",
    heroPosition: "BTN",
    villainPosition: "UTG",
    pot: 160,
    context: "You called down with pocket Jacks. On the river, Villain shoves all-in for $420 into the $160 pot on an Ace-King high board.",
    heroCards: [{ suit: 'clubs', rank: 'J' }, { suit: 'diamonds', rank: 'J' }],
    board: [
      { suit: 'spades', rank: 'A' },
      { suit: 'hearts', rank: 'K' },
      { suit: 'diamonds', rank: '2' },
      { suit: 'clubs', rank: '7' },
      { suit: 'hearts', rank: '9' }
    ],
    correctAction: 'Fold',
    explanation: "Third pair is a pure fold against an overbet shove. A 2.6x pot overbet requires villain to have extreme polarization, but your pocket Jacks block very few bluffs and lose to all top pairs (A-x), second pairs (K-x), and sets. With the pot odds requiring 42% equity to call, this is an easy discipline fold."
  },
  {
    id: 4,
    title: "Flush Draw Sizing & Realization",
    street: "Flop",
    heroPosition: "CO",
    villainPosition: "SB",
    pot: 90,
    context: "You hold 9♠ 8♠ on a two-spade flop. Small Blind bets a small $20 blocker bet into $90.",
    heroCards: [{ suit: 'spades', rank: '9' }, { suit: 'spades', rank: '8' }],
    board: [
      { suit: 'spades', rank: '2' },
      { suit: 'spades', rank: 'K' },
      { suit: 'hearts', rank: '5' }
    ],
    correctAction: 'Call',
    explanation: "You have 9 outs to the flush (~36% equity to the river). Calling $20 to win $110 gives you direct pot odds of 5.5-to-1 (you only need ~15.4% equity). Raising here would isolate you against villain's strongest made hands and risk facing a 3-bet shove that would force you to fold away huge equity."
  },
  {
    id: 5,
    title: "Nut Advantage Extraction on Checked River",
    street: "River",
    heroPosition: "BTN",
    villainPosition: "BB",
    pot: 210,
    context: "You hold the Nut Flush with A♦ 2♦. The board completed with 4 diamonds, and Villain checks to you on the river.",
    heroCards: [{ suit: 'diamonds', rank: 'A' }, { suit: 'diamonds', rank: '2' }],
    board: [
      { suit: 'diamonds', rank: 'K' },
      { suit: 'diamonds', rank: '9' },
      { suit: 'diamonds', rank: '5' },
      { suit: 'spades', rank: '2' },
      { suit: 'diamonds', rank: '4' }
    ],
    correctAction: 'Bet',
    explanation: "Checking behind with the stone-cold nuts on the river is a massive blunder! When you hold the Ace of diamonds, no player can beat you. You must value bet (~60-75% pot) to target second-best flushes (King, Queen, Jack of diamonds) that cannot fold on a 4-flush runout."
  },
  {
    id: 6,
    title: "Defending Top Pair Against a Flop Check-Raise",
    street: "Flop",
    heroPosition: "BTN",
    villainPosition: "BB",
    pot: 80,
    context: "You c-bet $25 with Top Pair Top Kicker (A-Q on Q-8-3 rainbow). The Big Blind check-raises to $75.",
    heroCards: [{ suit: 'spades', rank: 'A' }, { suit: 'hearts', rank: 'Q' }],
    board: [
      { suit: 'diamonds', rank: 'Q' },
      { suit: 'clubs', rank: '8' },
      { suit: 'hearts', rank: '3' }
    ],
    correctAction: 'Call',
    explanation: "Folding top-top to a single check-raise is way too tight and allows villains to print money bluffing you. Re-raising (3-betting) is equally bad because it isolates you against sets (8-8, 3-3). The GTO play is to Call, maintain position, and re-evaluate on the turn."
  },
  {
    id: 7,
    title: "Turn Probe Bet Against Missed C-Bet",
    street: "Turn",
    heroPosition: "BB (Out of Position)",
    villainPosition: "BTN",
    pot: 70,
    context: "Button raised preflop and you called. On a flop of K♠ 7♦ 4♣, Button checked behind. Turn is a blank 2♥. What is your play?",
    heroCards: [{ suit: 'diamonds', rank: '8' }, { suit: 'clubs', rank: '7' }],
    board: [
      { suit: 'spades', rank: 'K' },
      { suit: 'diamonds', rank: '7' },
      { suit: 'clubs', rank: '4' },
      { suit: 'hearts', rank: '2' }
    ],
    correctAction: 'Bet',
    explanation: "When an in-position preflop aggressor checks behind on a dry King-high flop, their range is heavily capped to underpairs, A-highs, and missed hands. Firing a probe bet with second pair denies equity to overcards (like Q-J, A-x) and extracts thin value from lower pairs."
  },
  {
    id: 8,
    title: "Paired Board Float With Overcards",
    street: "Flop",
    heroPosition: "BTN",
    villainPosition: "UTG",
    pot: 60,
    context: "UTG opened, you called on Button with A♠ K♠. Flop comes 5♦ 5♣ 9♥. UTG makes a tiny 1/4 pot bet ($15).",
    heroCards: [{ suit: 'spades', rank: 'A' }, { suit: 'spades', rank: 'K' }],
    board: [
      { suit: 'diamonds', rank: '5' },
      { suit: 'clubs', rank: '5' },
      { suit: 'hearts', rank: '9' }
    ],
    correctAction: 'Call',
    explanation: "With 6 clean overcard outs (3 Aces, 3 Kings), backdoor flush potential, and absolute position, getting 5-to-1 pot odds is an automatic Float (Call). You can easily take the pot away on later streets if villain checks the turn."
  },
  {
    id: 9,
    title: "Thin Value River Sizing",
    street: "River",
    heroPosition: "CO",
    villainPosition: "BB",
    pot: 140,
    context: "You hold K♠ J♠ on K♦ 10♣ 4♥ 8♦ 2♠. Villain called flop and turn, then checked the river. Villain is a known loose-passive calling station.",
    heroCards: [{ suit: 'spades', rank: 'K' }, { suit: 'spades', rank: 'J' }],
    board: [
      { suit: 'diamonds', rank: 'K' },
      { suit: 'clubs', rank: '10' },
      { suit: 'hearts', rank: '4' },
      { suit: 'diamonds', rank: '8' },
      { suit: 'spades', rank: '2' }
    ],
    correctAction: 'Bet',
    explanation: "Against a passive calling station, you do not check back Top Pair decent kicker on a blank river! They will easily call with worse King-kickers (K-9, K-7), middle pair (10-x), and stubbornly clinging pocket pairs. Bet for thin value (~40-50% pot)."
  },
  {
    id: 10,
    title: "Delayed C-Bet on Scare Turn Card",
    street: "Turn",
    heroPosition: "BTN",
    villainPosition: "BB",
    pot: 55,
    context: "You checked back flop with Q♠ 10♠ on 9♦ 6♣ 2♥. Turn rolls an Ace (A♠), giving you gutshot equity and a massive range advantage. BB checks again.",
    heroCards: [{ suit: 'spades', rank: 'Q' }, { suit: 'spades', rank: '10' }],
    board: [
      { suit: 'diamonds', rank: '9' },
      { suit: 'clubs', rank: '6' },
      { suit: 'hearts', rank: '2' },
      { suit: 'spades', rank: 'A' }
    ],
    correctAction: 'Bet',
    explanation: "The Ace on the turn is the ultimate scare card for the Big Blind. As the preflop raiser, you hold all strong Ace combos (A-K, A-Q, A-J) that BB rarely has after checking twice. A delayed C-bet leverages this range advantage and cleanly scoops the pot."
  }
];

const PostFlopTrainer = () => {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState(null); // 'correct' | 'incorrect'
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);

  const scenario = SCENARIOS[currentIndex];

  const handleAction = (action) => {
    if (feedback) return;

    if (action === scenario.correctAction) {
      playSound('deal');
      setFeedback('correct');
      setScore(s => s + 1);
      setStreak(s => {
        const next = s + 1;
        if (next % 3 === 0) playSound('win');
        return next;
      });
    } else {
      playSound('fold');
      setFeedback('incorrect');
      setStreak(0);
    }
  };

  const handleNext = () => {
    setFeedback(null);
    if (currentIndex < SCENARIOS.length - 1) {
      setCurrentIndex(i => i + 1);
    } else {
      setCurrentIndex(-1); // Finished
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setScore(0);
    setStreak(0);
    setFeedback(null);
  };

  if (currentIndex === -1) {
    return (
      <div className="postflop-container" style={{ textAlign: 'center', paddingTop: '3rem' }}>
        <h1 style={{ color: '#fbbf24', fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎓 Postflop Master Drill Complete!</h1>
        <p style={{ color: '#94a3b8', fontSize: '1.1rem', marginBottom: '2rem' }}>
          You scored <strong style={{ color: '#fff' }}>{score}</strong> out of <strong style={{ color: '#fff' }}>{SCENARIOS.length}</strong> ({Math.round((score / SCENARIOS.length) * 100)}%).
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button className="postflop-action-btn check-call" onClick={handleRestart}>
            🔄 Restart Drill
          </button>
          <button className="challenge-back-btn" onClick={() => navigate('/')}>
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Derive buttons to show: If context has bets or all-in, show Fold / Call / Raise. Else Check / Bet.
  const isFacingBet = scenario.context.toLowerCase().includes('bets') || 
                      scenario.context.toLowerCase().includes('shoves') ||
                      scenario.context.toLowerCase().includes('check-raises') ||
                      scenario.context.toLowerCase().includes('leads');

  return (
    <div className="postflop-container">
      {/* Header */}
      <div className="postflop-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button className="challenge-back-btn" onClick={() => navigate('/')}>
            ← Back
          </button>
          <span className="postflop-badge">Postflop Mastery</span>
          <span style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 600 }}>
            Puzzle {currentIndex + 1} of {SCENARIOS.length}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.85rem' }}>
          <div>
            Score: <strong style={{ color: '#fbbf24', fontFamily: 'JetBrains Mono, monospace' }}>{score}/{SCENARIOS.length}</strong>
          </div>
          <div>
            Streak: <strong style={{ color: streak >= 3 ? '#f97316' : '#fff', fontFamily: 'JetBrains Mono, monospace' }}>🔥 {streak}</strong>
          </div>
        </div>
      </div>

      {/* Main Stage */}
      <div className="postflop-card-stage">
        {/* Felt Table Representation */}
        <div className="postflop-felt">
          
          {/* Top: Villain */}
          <div className="postflop-felt-player">
            <span>👤 Villain: <strong>{scenario.villainPosition}</strong></span>
          </div>

          {/* Center: Street & Community Cards */}
          <div className="postflop-felt-center">
            <span className="postflop-street-tag">{scenario.street} • Pot: ${scenario.pot}</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {scenario.board.map((c, i) => (
                <div key={i} style={{ transform: 'scale(0.85)', transformOrigin: 'center' }}>
                  <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
                </div>
              ))}
            </div>
          </div>

          {/* Bottom: Hero */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              {scenario.heroCards.map((c, i) => (
                <div key={i} style={{ transform: 'scale(0.85)', transformOrigin: 'bottom center' }}>
                  <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
                </div>
              ))}
            </div>
            <div className="postflop-felt-player">
              <span>🌟 Hero: <strong>{scenario.heroPosition}</strong></span>
            </div>
          </div>

        </div>

        {/* Tactical Scenario Context */}
        <div className="postflop-context-box">
          <div className="postflop-context-title">{scenario.title}</div>
          <div className="postflop-context-desc">{scenario.context}</div>
        </div>

        {/* Action Controls */}
        {!feedback ? (
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              Choose Your Optimal Move:
            </span>
            <div className="postflop-actions-row">
              {isFacingBet ? (
                <>
                  <button className="postflop-action-btn fold" onClick={() => handleAction('Fold')}>Fold</button>
                  <button className="postflop-action-btn check-call" onClick={() => handleAction('Call')}>Call</button>
                  <button className="postflop-action-btn bet-raise" onClick={() => handleAction('Raise')}>Raise</button>
                </>
              ) : (
                <>
                  <button className="postflop-action-btn check-call" onClick={() => handleAction('Check')}>Check</button>
                  <button className="postflop-action-btn bet-raise" onClick={() => handleAction('Bet')}>Bet</button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className={`postflop-feedback-panel ${feedback}`}>
            <div className="postflop-feedback-header">
              <span>{feedback === 'correct' ? '✅ Correct Decision!' : '❌ Inaccurate Line!'}</span>
              <span style={{ fontSize: '0.85rem', color: '#fff', marginLeft: 'auto', fontWeight: 500 }}>
                Optimal Move: <strong>{scenario.correctAction}</strong>
              </span>
            </div>
            <div className="postflop-explanation-text">
              {scenario.explanation}
            </div>

            <div style={{ marginTop: '1rem', textAlign: 'right' }}>
              <button 
                className="postflop-action-btn bet-raise" 
                style={{ padding: '0.5rem 1.5rem', fontSize: '0.85rem' }}
                onClick={handleNext}
              >
                {currentIndex < SCENARIOS.length - 1 ? 'Next Scenario ➔' : 'Finish Drill ➔'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default PostFlopTrainer;
