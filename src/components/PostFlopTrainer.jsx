import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { playSound } from '../utils/audio';

const SCENARIOS = [
  {
    id: 1,
    title: "The Danger Board",
    context: "You are on the Turn. The Pot is $100. Villain bets $75 (3/4 Pot).",
    heroCards: [{ suit: 'hearts', rank: 'A' }, { suit: 'hearts', rank: 'K' }],
    board: [
      { suit: 'hearts', rank: 'Q' },
      { suit: 'diamonds', rank: 'J' },
      { suit: 'clubs', rank: '10' },
      { suit: 'hearts', rank: '9' }
    ],
    correctAction: 'Call',
    explanation: "You have a Broadway straight (10-J-Q-K-A), but there are 4 cards to a straight on the board (9-10-J-Q). Anyone with a King has the same straight, and anyone with an 8 makes a straight. Furthermore, you have a flush draw. A raise here will only get called by a better hand (or a chop), and you fold out all worse hands. The best play is to Call and realize your equity on the river."
  },
  {
    id: 2,
    title: "The Dry Flop C-Bet",
    context: "You raised preflop, Villain called. You are on the Flop. The Pot is $40. Villain Checks to you.",
    heroCards: [{ suit: 'spades', rank: 'A' }, { suit: 'diamonds', rank: 'K' }],
    board: [
      { suit: 'clubs', rank: '2' },
      { suit: 'clubs', rank: '7' },
      { suit: 'hearts', rank: 'J' }
    ],
    correctAction: 'Bet',
    explanation: "This is a prime spot for a Continuation Bet (C-Bet). Even though you completely missed the flop (Ace-high), this 'dry' board favors your preflop raising range much more than the Villain's calling range. Betting $15-$20 here will fold out a massive amount of Villain's missed cards (like Q-10, K-Q, etc) and easily win you the pot."
  },
  {
    id: 3,
    title: "Facing the Overbet on the River",
    context: "You are on the River. The Pot is $150. Villain goes all-in for $400.",
    heroCards: [{ suit: 'clubs', rank: 'J' }, { suit: 'diamonds', rank: 'J' }],
    board: [
      { suit: 'spades', rank: 'A' },
      { suit: 'hearts', rank: 'K' },
      { suit: 'diamonds', rank: '2' },
      { suit: 'clubs', rank: '7' },
      { suit: 'hearts', rank: '9' }
    ],
    correctAction: 'Fold',
    explanation: "You have a pair of Jacks, but the board is absolutely terrifying. An Ace and a King are on the board, meaning almost any part of a competent Villain's range beats you. A massive $400 overbet into a $150 pot is highly polarized. Even if they are bluffing sometimes, you do not have the required pot odds to make this hero call with third pair. Fold."
  },
  {
    id: 4,
    title: "The Flush Draw Value Trap",
    context: "You are on the Flop. The Pot is $80. Villain bets $20 (1/4 Pot).",
    heroCards: [{ suit: 'spades', rank: '9' }, { suit: 'spades', rank: '8' }],
    board: [
      { suit: 'spades', rank: '2' },
      { suit: 'spades', rank: 'K' },
      { suit: 'hearts', rank: '5' }
    ],
    correctAction: 'Call',
    explanation: "You have a flush draw (9 outs). Using the Rule of 4, you have about a 36% chance of hitting it by the river. The Villain bet very small ($20 into $80), giving you incredible pot odds of 5-to-1 (you need 16% equity). This is an easy, highly profitable Call. You do not need to raise because you don't have a made hand yet, and a raise might force you to fold if Villain shoves."
  },
  {
    id: 5,
    title: "The Nut Advantage",
    context: "You are on the River. The Pot is $200. Villain checks.",
    heroCards: [{ suit: 'diamonds', rank: 'A' }, { suit: 'diamonds', rank: '2' }],
    board: [
      { suit: 'diamonds', rank: 'K' },
      { suit: 'diamonds', rank: '9' },
      { suit: 'diamonds', rank: '5' },
      { suit: 'spades', rank: '2' },
      { suit: 'hearts', rank: '4' }
    ],
    correctAction: 'Bet',
    explanation: "You flopped the 'Nut Flush' (the highest possible flush with the Ace). Villain checked the river. Checking behind here is a massive blunder! You have the best possible hand. You must Bet for value to extract money from worse flushes, sets, or top pairs that might stubbornly call you."
  }
];

const getSuitSymbol = (suit) => {
  switch (suit) {
    case 'hearts': return '♥';
    case 'diamonds': return '♦';
    case 'clubs': return '♣';
    case 'spades': return '♠';
    default: return '';
  }
};

const getSuitColor = (suit) => {
  return suit === 'hearts' || suit === 'diamonds' ? '#ef4444' : 'var(--text-primary)';
};

const CardDisplay = ({ card }) => {
  if (!card) return null;
  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '0.5rem',
      padding: '0.5rem 1rem',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: '3rem',
      minHeight: '4.5rem',
      fontSize: '1.5rem',
      fontWeight: 'bold',
      color: getSuitColor(card.suit),
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      border: '1px solid #e2e8f0'
    }}>
      {card.rank}{getSuitSymbol(card.suit)}
    </div>
  );
};

const PostFlopTrainer = () => {
  const navigate = useNavigate();
  const [currentScenarioIndex, setCurrentScenarioIndex] = useState(0);
  const [feedback, setFeedback] = useState(null); // 'correct' or 'incorrect'
  const [score, setScore] = useState(0);

  const scenario = SCENARIOS[currentScenarioIndex];

  const handleAction = (action) => {
    if (feedback) return; // Prevent multiple clicks

    // Map the button actions to the expected correctAction
    let mappedAction = action;
    if (action === 'Bet' || action === 'Raise') {
       // Consolidate aggressive actions for simplicity if needed, but in our data we explicitly use 'Bet' or 'Raise' or 'Call' or 'Fold'
       // We'll provide buttons that match the context.
    }

    if (action === scenario.correctAction) {
      playSound('deal');
      setFeedback('correct');
      setScore(s => s + 1);
    } else {
      playSound('fold');
      setFeedback('incorrect');
    }
  };

  const nextScenario = () => {
    setFeedback(null);
    if (currentScenarioIndex < SCENARIOS.length - 1) {
      setCurrentScenarioIndex(i => i + 1);
    } else {
      // Completed all
      setCurrentScenarioIndex(-1);
    }
  };

  const resetTrainer = () => {
    setCurrentScenarioIndex(0);
    setScore(0);
    setFeedback(null);
  };

  if (currentScenarioIndex === -1) {
    return (
      <div className="container" style={{ maxWidth: '800px', marginTop: '4rem', textAlign: 'center' }}>
        <h1 className="text-accent" style={{ fontSize: '3rem', marginBottom: '1rem' }}>Drill Complete!</h1>
        <h2 style={{ color: 'white', marginBottom: '2rem' }}>You scored {score} out of {SCENARIOS.length}</h2>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button className="btn-primary" onClick={resetTrainer}>Restart Drill</button>
          <button className="btn-secondary" onClick={() => navigate('/')}>Back to Dashboard</button>
        </div>
      </div>
    );
  }

  // Determine which action buttons to show based on context
  const isFacingBet = scenario.context.toLowerCase().includes('bets') || scenario.context.toLowerCase().includes('all-in');
  const actionButtons = isFacingBet 
    ? ['Fold', 'Call', 'Raise']
    : ['Check', 'Bet'];

  return (
    <div className="container" style={{ maxWidth: '900px', marginTop: '2rem', display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 100px)' }}>
      <button 
        onClick={() => navigate('/')} 
        style={{ alignSelf: 'flex-start', background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', marginBottom: '1rem', display: 'flex' }}
      >
        ← Back to Dashboard
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 className="text-accent" style={{ fontSize: '2rem', margin: 0 }}>Post-Flop Simulator</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Puzzle {currentScenarioIndex + 1} of {SCENARIOS.length}</p>
        </div>
        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'white' }}>
          Score: <span style={{ color: 'var(--accent-color)' }}>{score}</span>
        </div>
      </div>

      <div style={{ backgroundColor: 'var(--surface-color)', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
        
        {/* Top: The Context & Board */}
        <div style={{ padding: '2rem', borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'rgba(0,0,0,0.2)' }}>
          <h2 style={{ color: 'white', margin: '0 0 1rem 0', fontSize: '1.5rem' }}>{scenario.title}</h2>
          <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '1rem', borderRadius: '0.5rem', marginBottom: '2rem', fontSize: '1.1rem', fontWeight: '500' }}>
            {scenario.context}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', flexWrap: 'wrap', gap: '2rem' }}>
            {/* Hero Cards */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Your Hole Cards</div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                {scenario.heroCards.map((c, i) => <CardDisplay key={i} card={c} />)}
              </div>
            </div>

            {/* Board */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Community Board</div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                {scenario.board.map((c, i) => <CardDisplay key={i} card={c} />)}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: Action / Feedback */}
        <div style={{ padding: '2rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          
          {!feedback ? (
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ color: 'white', marginBottom: '1.5rem' }}>What is your action?</h3>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                {actionButtons.map(btn => (
                  <button 
                    key={btn} 
                    className="action-button" 
                    style={{ padding: '1rem 3rem', fontSize: '1.2rem', fontWeight: 'bold' }}
                    onClick={() => handleAction(btn)}
                  >
                    {btn}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ animation: 'floatUp 0.3s ease-out' }}>
              <div style={{ 
                display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem',
                color: feedback === 'correct' ? '#10b981' : '#ef4444'
              }}>
                <span style={{ fontSize: '2rem' }}>{feedback === 'correct' ? '✅' : '❌'}</span>
                <h2 style={{ margin: 0 }}>{feedback === 'correct' ? 'Correct Play!' : 'Inaccurate Play!'}</h2>
              </div>
              
              <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '0.5rem', borderLeft: `4px solid ${feedback === 'correct' ? '#10b981' : '#ef4444'}`, color: 'var(--text-secondary)', fontSize: '1.1rem', lineHeight: '1.6' }}>
                <strong style={{ color: 'white' }}>The Optimal Move was to {scenario.correctAction}.</strong><br/><br/>
                {scenario.explanation}
              </div>

              <div style={{ marginTop: '2rem', textAlign: 'right' }}>
                <button className="btn-primary" onClick={nextScenario}>
                  {currentScenarioIndex < SCENARIOS.length - 1 ? 'Next Scenario ➔' : 'Finish Drill ➔'}
                </button>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};

export default PostFlopTrainer;
