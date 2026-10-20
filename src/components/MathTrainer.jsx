import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { playSound } from '../utils/audio';
import Card from './Card';
import './MathTrainer.css';

// Pot Odds Scenarios
const POT_ODDS_SCENARIOS = [
  { label: '1/4 Pot', fraction: 0.25, correctPct: 17, tip: 'Formula: 25 / (100 + 25 + 25) = 16.7%' },
  { label: '1/3 Pot', fraction: 0.333, correctPct: 20, tip: 'Formula: 33 / (100 + 33 + 33) = 20%' },
  { label: '1/2 Pot', fraction: 0.5, correctPct: 25, tip: 'Formula: 50 / (100 + 50 + 50) = 25%' },
  { label: '2/3 Pot', fraction: 0.666, correctPct: 29, tip: 'Formula: 66 / (100 + 66 + 66) = 28.6%' },
  { label: '3/4 Pot', fraction: 0.75, correctPct: 30, tip: 'Formula: 75 / (100 + 75 + 75) = 30%' },
  { label: 'Full Pot', fraction: 1.0, correctPct: 33, tip: 'Formula: 100 / (100 + 100 + 100) = 33.3%' },
  { label: '1.5x Overbet', fraction: 1.5, correctPct: 38, tip: 'Formula: 150 / (100 + 150 + 150) = 37.5%' },
  { label: '2x Overbet', fraction: 2.0, correctPct: 40, tip: 'Formula: 200 / (100 + 200 + 200) = 40%' }
];

// Outs & Rule of 2/4 Scenarios
const OUTS_SCENARIOS = [
  {
    name: 'Flush Draw (Flop ➔ River)',
    description: 'You hold 4 suited cards on the flop.',
    hero: [{ suit: 'hearts', rank: 'A' }, { suit: 'hearts', rank: '9' }],
    board: [{ suit: 'hearts', rank: 'K' }, { suit: 'hearts', rank: '4' }, { suit: 'spades', rank: '2' }],
    outs: 9,
    question: 'How many outs do you have to hit the flush?',
    correctAnswer: '9 Outs (~36%)',
    explanation: 'There are 13 hearts in total minus the 4 visible = 9 outs. Rule of 4: 9 * 4 = 36% equity to hit by river.'
  },
  {
    name: 'Open-Ended Straight Draw',
    description: 'You have 4 consecutive cards with open ends.',
    hero: [{ suit: 'spades', rank: 'J' }, { suit: 'diamonds', rank: '10' }],
    board: [{ suit: 'clubs', rank: '9' }, { suit: 'hearts', rank: '8' }, { suit: 'diamonds', rank: '2' }],
    outs: 8,
    question: 'How many outs to complete your straight?',
    correctAnswer: '8 Outs (~32%)',
    explanation: 'Any 7 (4 cards) or Queen (4 cards) gives you a straight: 4 + 4 = 8 outs. Rule of 4: 8 * 4 = 32% equity.'
  },
  {
    name: 'Gutshot Straight Draw (Inside)',
    description: 'You need one specific middle rank.',
    hero: [{ suit: 'clubs', rank: 'A' }, { suit: 'hearts', rank: 'K' }],
    board: [{ suit: 'diamonds', rank: 'Q' }, { suit: 'spades', rank: '10' }, { suit: 'hearts', rank: '4' }],
    outs: 4,
    question: 'How many outs do you have to hit the broadway straight?',
    correctAnswer: '4 Outs (~16%)',
    explanation: 'Only the four Jacks make your straight: 4 outs. Rule of 4: 4 * 4 = 16% equity on the flop.'
  },
  {
    name: 'Two Overcards',
    description: 'You hold two cards higher than any board card.',
    hero: [{ suit: 'spades', rank: 'A' }, { suit: 'diamonds', rank: 'K' }],
    board: [{ suit: 'clubs', rank: '9' }, { suit: 'hearts', rank: '5' }, { suit: 'clubs', rank: '2' }],
    outs: 6,
    question: 'How many outs to pair one of your overcards?',
    correctAnswer: '6 Outs (~24%)',
    explanation: '3 Aces + 3 Kings = 6 outs. Rule of 4: 6 * 4 = 24% equity by river.'
  },
  {
    name: 'Combo Draw (Flush + Open Straight)',
    description: 'Monster draw with both flush and straight draws.',
    hero: [{ suit: 'hearts', rank: 'J' }, { suit: 'hearts', rank: '10' }],
    board: [{ suit: 'hearts', rank: '9' }, { suit: 'hearts', rank: '8' }, { suit: 'clubs', rank: '2' }],
    outs: 15,
    question: 'How many total outs do you have?',
    correctAnswer: '15 Outs (~60%)',
    explanation: '9 flush outs + 6 straight non-flush outs (three 7s and three Queens) = 15 outs! Rule of 4: 15 * 4 = ~60% equity.'
  },
  {
    name: 'Set to Full House / Quads (On Turn)',
    description: 'You have three of a kind on the turn.',
    hero: [{ suit: 'spades', rank: '7' }, { suit: 'diamonds', rank: '7' }],
    board: [{ suit: 'clubs', rank: '7' }, { suit: 'hearts', rank: 'K' }, { suit: 'diamonds', rank: 'J' }, { suit: 'spades', rank: '2' }],
    outs: 10,
    question: 'How many outs on the river to improve to a Full House or Quads?',
    correctAnswer: '10 Outs (~20%)',
    explanation: '1 remaining 7 (Quads) + 3 Kings + 3 Jacks + 3 Deuces = 10 outs! On the turn (1 street to go), Rule of 2 applies: 10 * 2 = 20%.'
  }
];

const MathTrainer = () => {
  const navigate = useNavigate();
  
  // Trainer Mode: 'pot_odds' | 'outs'
  const [drillMode, setDrillMode] = useState('pot_odds');
  const [timerConfig, setTimerConfig] = useState(10);
  const [timeLeft, setTimeLeft] = useState(10);
  const [showFormula, setShowFormula] = useState(false);
  
  // Stats
  const [score, setScore] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  
  // Current Question State
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [options, setOptions] = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);
  const [feedback, setFeedback] = useState(null); // 'correct' | 'wrong' | 'timeout'

  // Generate a question based on active mode
  const generateQuestion = useCallback(() => {
    setSelectedOption(null);
    setFeedback(null);

    if (drillMode === 'pot_odds') {
      const scenario = POT_ODDS_SCENARIOS[Math.floor(Math.random() * POT_ODDS_SCENARIOS.length)];
      const basePots = [20, 40, 60, 100, 150, 200, 300, 500];
      const pot = basePots[Math.floor(Math.random() * basePots.length)];
      const bet = Math.round(pot * scenario.fraction);
      const totalPotIfCall = pot + bet + bet;
      
      // 4 choices
      let opts = new Set([scenario.correctPct]);
      while (opts.size < 4) {
        const r = POT_ODDS_SCENARIOS[Math.floor(Math.random() * POT_ODDS_SCENARIOS.length)].correctPct;
        opts.add(r);
      }
      const shuffled = Array.from(opts).sort(() => Math.random() - 0.5);
      
      setCurrentQuestion({
        pot,
        bet,
        totalPotIfCall,
        label: scenario.label,
        correctPct: scenario.correctPct,
        tip: scenario.tip
      });
      setOptions(shuffled);
    } else {
      // Outs Mode
      const scenario = OUTS_SCENARIOS[Math.floor(Math.random() * OUTS_SCENARIOS.length)];
      const allAnswers = OUTS_SCENARIOS.map(s => s.correctAnswer);
      let opts = new Set([scenario.correctAnswer]);
      while (opts.size < 4) {
        const r = allAnswers[Math.floor(Math.random() * allAnswers.length)];
        opts.add(r);
      }
      const shuffled = Array.from(opts).sort(() => Math.random() - 0.5);

      setCurrentQuestion(scenario);
      setOptions(shuffled);
    }

    if (timerConfig > 0) {
      setTimeLeft(timerConfig);
    }
  }, [drillMode, timerConfig]);

  // Initial load
  useEffect(() => {
    generateQuestion();
  }, [generateQuestion]);

  // Timer countdown
  useEffect(() => {
    if (timerConfig === 0 || feedback !== null) return;

    if (timeLeft <= 0) {
      handleTimeout();
      return;
    }

    const t = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(t);
  }, [timeLeft, timerConfig, feedback]);

  const handleTimeout = () => {
    playSound('fold');
    setFeedback('timeout');
    setTotalAttempts(prev => prev + 1);
    setStreak(0);
    setTimeout(generateQuestion, 2200);
  };

  const handleSelectAnswer = (option) => {
    if (feedback !== null) return;
    setSelectedOption(option);
    setTotalAttempts(prev => prev + 1);

    const isCorrect = drillMode === 'pot_odds' 
      ? option === currentQuestion.correctPct 
      : option === currentQuestion.correctAnswer;

    if (isCorrect) {
      playSound('deal');
      setFeedback('correct');
      setScore(prev => prev + 1);
      setStreak(prev => {
        const next = prev + 1;
        if (next > bestStreak) setBestStreak(next);
        if (next % 5 === 0) playSound('win');
        return next;
      });
    } else {
      playSound('fold');
      setFeedback('wrong');
      setStreak(0);
    }

    setTimeout(generateQuestion, 2200);
  };

  const accuracy = totalAttempts > 0 ? Math.round((score / totalAttempts) * 100) : 100;

  return (
    <div className="math-trainer-container">
      {/* Top Header & Navigation */}
      <div className="math-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button 
            className="challenge-back-btn"
            onClick={() => navigate('/')}
          >
            ← Back
          </button>
          <div className="math-mode-tabs">
            <button 
              className={`math-mode-tab ${drillMode === 'pot_odds' ? 'active' : ''}`}
              onClick={() => { setDrillMode('pot_odds'); setStreak(0); }}
            >
              📊 Pot Odds Required Equity
            </button>
            <button 
              className={`math-mode-tab ${drillMode === 'outs' ? 'active' : ''}`}
              onClick={() => { setDrillMode('outs'); setStreak(0); }}
            >
              🃏 Outs & Rule of 2/4 Drill
            </button>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="math-stats-bar">
          <div className="math-stat-item">
            <span>Score:</span>
            <span className="math-stat-value">{score}/{totalAttempts} ({accuracy}%)</span>
          </div>
          <div className="math-stat-item">
            <span>Streak:</span>
            <span className="math-stat-value" style={{ color: streak >= 3 ? '#f97316' : '#fbbf24' }}>
              🔥 {streak}
            </span>
          </div>
          {timerConfig > 0 && (
            <div className="math-stat-item">
              <span>Timer:</span>
              <span className="math-stat-value" style={{ color: timeLeft <= 3 ? '#ef4444' : '#fff' }}>
                ⏱ {timeLeft}s
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div className="math-felt-card">
        {/* Felt Visual Table Display */}
        {drillMode === 'pot_odds' && currentQuestion && (
          <div className="math-visual-table">
            <div className="math-pot-stage">
              <div className="math-pot-bubble">
                <div className="math-bubble-label">Initial Pot</div>
                <div className="math-bubble-val">${currentQuestion.pot}</div>
              </div>

              <div className="math-pot-bubble highlight">
                <div className="math-bubble-label">Villain Bet ({currentQuestion.label})</div>
                <div className="math-bubble-val" style={{ color: '#ef4444' }}>${currentQuestion.bet}</div>
              </div>

              <div className="math-pot-bubble">
                <div className="math-bubble-label">Total to Win</div>
                <div className="math-bubble-val" style={{ color: '#10b981' }}>${currentQuestion.totalPotIfCall}</div>
              </div>
            </div>

            <div style={{ color: '#94a3b8', fontSize: '0.78rem', textAlign: 'center' }}>
              You must call <strong style={{ color: '#fbbf24' }}>${currentQuestion.bet}</strong> to win <strong style={{ color: '#fff' }}>${currentQuestion.pot + currentQuestion.bet}</strong>.
            </div>
          </div>
        )}

        {drillMode === 'outs' && currentQuestion && (
          <div className="math-visual-table" style={{ padding: '1rem 1.5rem' }}>
            <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Hole Cards</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {currentQuestion.hero.map((c, i) => (
                    <div key={i} style={{ transform: 'scale(0.8)', transformOrigin: 'top center' }}>
                      <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Board</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {currentQuestion.board.map((c, i) => (
                    <div key={i} style={{ transform: 'scale(0.8)', transformOrigin: 'top center' }}>
                      <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Question Prompt */}
        <div className="math-question-banner">
          <div className="math-question-title">
            {drillMode === 'pot_odds' 
              ? "What is your required equity (Pot Odds) to profitably call?" 
              : currentQuestion?.question}
          </div>
          <div className="math-question-sub">
            {drillMode === 'pot_odds'
              ? "Calculate Call / (Pot + Bet + Call) and select the closest equity."
              : currentQuestion?.description}
          </div>
        </div>

        {/* Options Grid */}
        <div className="math-options-grid">
          {options.map((opt, i) => {
            let statusClass = '';
            if (feedback !== null) {
              const isThisCorrect = drillMode === 'pot_odds' 
                ? opt === currentQuestion.correctPct 
                : opt === currentQuestion.correctAnswer;
              if (isThisCorrect) statusClass = 'correct';
              else if (selectedOption === opt) statusClass = 'wrong';
            }

            return (
              <button
                key={i}
                className={`math-option-btn ${statusClass}`}
                onClick={() => handleSelectAnswer(opt)}
                disabled={feedback !== null}
              >
                <span>{opt}{drillMode === 'pot_odds' ? '%' : ''}</span>
              </button>
            );
          })}
        </div>

        {/* Feedback Bar */}
        {feedback && (
          <div className={`math-feedback-bar ${feedback}`}>
            {feedback === 'correct' && (
              <div>
                <strong>🎯 Correct!</strong> {drillMode === 'pot_odds' ? currentQuestion.tip : currentQuestion.explanation}
              </div>
            )}
            {feedback === 'wrong' && (
              <div>
                <strong>❌ Inaccurate.</strong> Correct answer was <strong>{drillMode === 'pot_odds' ? `${currentQuestion.correctPct}%` : currentQuestion.correctAnswer}</strong>. {drillMode === 'pot_odds' ? currentQuestion.tip : currentQuestion.explanation}
              </div>
            )}
            {feedback === 'timeout' && (
              <div>
                <strong>⏱️ Too Slow!</strong> You must make quick mental calculations in live games. Answer was <strong>{drillMode === 'pot_odds' ? `${currentQuestion.correctPct}%` : currentQuestion.correctAnswer}</strong>.
              </div>
            )}
          </div>
        )}

        {/* Mathematical Formulas Cheat Sheet Accordion */}
        <div className="math-cheat-accordion">
          <button 
            className="math-cheat-trigger"
            onClick={() => setShowFormula(prev => !prev)}
          >
            <span>📐 Speed Math Formula & Cheat Sheet</span>
            <span>{showFormula ? '▲' : '▼'}</span>
          </button>
          {showFormula && (
            <div className="math-cheat-content">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <h4 style={{ color: '#fbbf24', margin: '0 0 0.4rem 0', fontSize: '0.85rem' }}>Pot Odds Formula:</h4>
                  <code>Required Equity = Bet / (Current Pot + Bet + Bet)</code>
                  <ul style={{ margin: '0.5rem 0', paddingLeft: '1.25rem', lineHeight: '1.4' }}>
                    <li><strong>1/3 Pot:</strong> 20% equity needed</li>
                    <li><strong>1/2 Pot:</strong> 25% equity needed</li>
                    <li><strong>3/4 Pot:</strong> 30% equity needed</li>
                    <li><strong>Full Pot:</strong> 33.3% equity needed</li>
                    <li><strong>2x Pot:</strong> 40% equity needed</li>
                  </ul>
                </div>
                <div>
                  <h4 style={{ color: '#34d399', margin: '0 0 0.4rem 0', fontSize: '0.85rem' }}>The Rule of 2 & 4:</h4>
                  <ul style={{ margin: '0.5rem 0', paddingLeft: '1.25rem', lineHeight: '1.4' }}>
                    <li><strong>On Flop (2 cards to come):</strong> Outs × 4 = Approximate % equity to river.</li>
                    <li><strong>On Turn (1 card to come):</strong> Outs × 2 = Approximate % equity on river.</li>
                    <li><strong>Flush Draw:</strong> 9 outs × 4 = 36% (or 9 × 2 = 18%)</li>
                    <li><strong>Open-Ended Straight:</strong> 8 outs × 4 = 32% (or 8 × 2 = 16%)</li>
                    <li><strong>Gutshot:</strong> 4 outs × 4 = 16% (or 4 × 2 = 8%)</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MathTrainer;
