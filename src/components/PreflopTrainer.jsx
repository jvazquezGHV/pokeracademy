import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from './Card';
import rangeData from '../data/ranges.json';
import { createDeck } from '../utils/pokerLogic';
import { playSound } from '../utils/audio';
import './PreflopTrainer.css';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

const TABLE_POSITIONS = [
  { id: 'utg', label: 'UTG', className: 'seat-pos-utg' },
  { id: 'mp',  label: 'MP',  className: 'seat-pos-mp' },
  { id: 'co',  label: 'CO',  className: 'seat-pos-co' },
  { id: 'btn', label: 'BTN', className: 'seat-pos-btn', hasButton: true },
  { id: 'sb',  label: 'SB',  className: 'seat-pos-sb' },
  { id: 'bb',  label: 'BB',  className: 'seat-pos-bb' }
];

const getHandString = (c1, c2) => {
  const r1 = c1.rank === '10' ? 'T' : c1.rank;
  const r2 = c2.rank === '10' ? 'T' : c2.rank;
  const idx1 = RANKS.indexOf(r1);
  const idx2 = RANKS.indexOf(r2);
  
  const high = idx1 <= idx2 ? r1 : r2;
  const low = idx1 <= idx2 ? r2 : r1;
  
  if (high === low) return `${high}${low}`;
  if (c1.suit === c2.suit) return `${high}${low}s`;
  return `${high}${low}o`;
};

const PREMIUM_HANDS = ['AA','KK','QQ','JJ','TT','AKs','AQs','AKo','AQo'];
const TRASH_HANDS = ['72o','83o','94o','J3o','Q4o','T2o','62o','52o','92o','82o','73o','84o','93o'];
const BORDERLINE_HANDS = ['A5s','A4s','A3s','A2s','T9s','98s','87s','76s','65s','54s','K9s','Q9s','J9s','T8s','97s','22','33','44','55','AJo','ATo','KQo','KJo'];

const PreflopTrainer = () => {
  const navigate = useNavigate();
  
  const [timerConfig, setTimerConfig] = useState(0); // 0 = off
  const [trainingFocus, setTrainingFocus] = useState('intermediate');
  const [timeLeft, setTimeLeft] = useState(null);
  
  const [currentCards, setCurrentCards] = useState([]);
  const [currentPosition, setCurrentPosition] = useState(null);
  
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [feedback, setFeedback] = useState(null); // 'correct' | 'incorrect' | 'timeout'
  const [feedbackMessage, setFeedbackMessage] = useState('');
  
  const [isPlaying, setIsPlaying] = useState(false);

  const dealNextHand = useCallback(() => {
    setFeedback(null);
    setFeedbackMessage('');
    
    let c1, c2;
    
    if (trainingFocus === 'beginner' || trainingFocus === 'intermediate') {
      const isGoodHand = Math.random() > 0.5;
      const targetPool = trainingFocus === 'beginner' 
        ? (isGoodHand ? PREMIUM_HANDS : TRASH_HANDS)
        : (isGoodHand ? BORDERLINE_HANDS : TRASH_HANDS);
        
      while(true) {
        const deck = createDeck();
        c1 = deck.pop(); 
        c2 = deck.pop();
        if (targetPool.includes(getHandString(c1, c2))) break;
      }
    } else {
      const deck = createDeck();
      c1 = deck.pop(); 
      c2 = deck.pop();
    }
    
    setCurrentCards([c1, c2]);
    
    // Pick random position from rangeData positions
    const randomPosIndex = Math.floor(Math.random() * rangeData.positions.length);
    setCurrentPosition(rangeData.positions[randomPosIndex]);
    
    if (timerConfig > 0) {
      setTimeLeft(timerConfig);
    }
    playSound('deal');
  }, [timerConfig, trainingFocus]);

  useEffect(() => {
    if (isPlaying) {
      dealNextHand();
    }
  }, [isPlaying, dealNextHand]);

  // Timer countdown
  useEffect(() => {
    if (!isPlaying || timerConfig === 0 || feedback !== null) return;
    
    if (timeLeft === 0) {
      handleTimeout();
      return;
    }
    
    const timer = setInterval(() => {
      setTimeLeft(prev => prev > 0 ? prev - 1 : 0);
    }, 1000);
    
    return () => clearInterval(timer);
  }, [timeLeft, isPlaying, timerConfig, feedback]);

  const handleTimeout = () => {
    playSound('fold');
    setFeedback('timeout');
    setFeedbackMessage('⏱ Too Slow! Quick decisions are vital at the tables.');
    setScore(prev => ({ ...prev, total: prev.total + 1 }));
    setStreak(0);
    setTimeout(() => {
      dealNextHand();
    }, 1600);
  };

  const handleAction = (action) => {
    if (feedback !== null || currentCards.length < 2) return;
    
    const handStr = getHandString(currentCards[0], currentCards[1]);
    const shouldRaise = currentPosition.raise.includes(handStr);
    
    const isCorrect = (action === 'raise' && shouldRaise) || (action === 'fold' && !shouldRaise);
    
    if (isCorrect) {
      playSound('win');
      setFeedback('correct');
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      if (nextStreak > bestStreak) setBestStreak(nextStreak);
      setFeedbackMessage(`✅ Correct! ${handStr} is an optimal ${shouldRaise ? 'RAISE' : 'FOLD'} from ${currentPosition.name}.`);
      setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }));
    } else {
      playSound('fold');
      setFeedback('incorrect');
      setStreak(0);
      setFeedbackMessage(`❌ Mistake. ${handStr} is a ${shouldRaise ? 'RAISE' : 'FOLD'} from ${currentPosition.name}.`);
      setScore(prev => ({ ...prev, total: prev.total + 1 }));
    }
    
    setTimeout(() => {
      dealNextHand();
    }, 1600);
  };

  const getAccuracy = () => {
    if (score.total === 0) return 100;
    return Math.round((score.correct / score.total) * 100);
  };

  return (
    <div className="preflop-container">
      {/* Header */}
      <div className="preflop-header">
        <div>
          <h1>⚡ Preflop Range & Action Trainer</h1>
          <p>Build instant muscle memory for GTO opening ranges across all table positions.</p>
        </div>
        <button
          type="button"
          className="user-mgmt-btn user-mgmt-btn-secondary user-mgmt-btn-sm"
          onClick={() => navigate('/')}
        >
          ← Dashboard
        </button>
      </div>

      {!isPlaying ? (
        /* Setup / Configuration Screen */
        <div className="user-mgmt-card" style={{ maxWidth: '520px', margin: '2rem auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Configure Drill Session</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            Choose your training difficulty and time pressure constraints.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left', marginBottom: '1.5rem' }}>
            <div className="user-mgmt-input-group" style={{ margin: 0 }}>
              <label>Difficulty Focus</label>
              <select
                className="user-mgmt-filter-select"
                style={{ width: '100%', height: '36px' }}
                value={trainingFocus}
                onChange={(e) => setTrainingFocus(e.target.value)}
              >
                <option value="beginner">Beginner (Premiums vs Obvious Trash)</option>
                <option value="intermediate">Intermediate (Borderline Hands vs Trash)</option>
                <option value="advanced">Advanced (True Random, Any 2 Cards)</option>
              </select>
            </div>

            <div className="user-mgmt-input-group" style={{ margin: 0 }}>
              <label>Time Pressure Timer</label>
              <select
                className="user-mgmt-filter-select"
                style={{ width: '100%', height: '36px' }}
                value={timerConfig}
                onChange={(e) => setTimerConfig(Number(e.target.value))}
              >
                <option value={0}>Off (No Time Limit)</option>
                <option value={3}>3 Seconds (Speed Blitz)</option>
                <option value={5}>5 Seconds (Standard Online Pace)</option>
                <option value={10}>10 Seconds (Relaxed)</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            className="user-mgmt-btn user-mgmt-btn-primary"
            style={{ width: '100%', height: '38px', fontSize: '0.92rem', fontWeight: 600 }}
            onClick={() => setIsPlaying(true)}
          >
            Start Drill Session
          </button>
        </div>
      ) : (
        /* Active Drill Screen */
        <div>
          {/* Score & Streak Stats Banner */}
          <div className="preflop-score-banner">
            <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
              <div>
                Score: <strong style={{ color: '#34d399' }}>{score.correct} / {score.total}</strong> ({getAccuracy()}%)
              </div>
              <div>
                Streak: <strong style={{ color: '#fbbf24' }}>🔥 {streak}</strong> (Best: {bestStreak})
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              {timerConfig > 0 && (
                <div style={{ fontWeight: 700, color: timeLeft <= 2 ? '#f87171' : '#38bdf8' }}>
                  ⏱ {timeLeft}s
                </div>
              )}
              <button
                type="button"
                className="user-mgmt-btn user-mgmt-btn-secondary user-mgmt-btn-sm"
                onClick={() => setIsPlaying(false)}
              >
                End Session
              </button>
            </div>
          </div>

          {/* 6-Max Table Visualization */}
          <div className="preflop-table-wrapper">
            {TABLE_POSITIONS.map((pos) => {
              const isHeroSeat = currentPosition?.id === pos.id;
              return (
                <div
                  key={pos.id}
                  className={`preflop-seat ${pos.className} ${isHeroSeat ? 'active-seat' : ''}`}
                >
                  {pos.hasButton && <span className="dealer-button-badge">D</span>}
                  <span>{pos.label}</span>
                  {isHeroSeat && <span style={{ fontSize: '0.68rem', opacity: 0.8 }}>(You)</span>}
                </div>
              );
            })}

            {/* Hand In Center */}
            <div className="preflop-cards-center">
              {currentCards.map((c, i) => (
                <div key={i} style={{ transform: 'scale(1.05)' }}>
                  <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
                </div>
              ))}
            </div>
          </div>

          {/* Action Choice Buttons */}
          <div className="preflop-action-bar">
            <button
              type="button"
              className="preflop-act-btn btn-act-fold"
              onClick={() => handleAction('fold')}
              disabled={feedback !== null}
            >
              <span>✕</span> FOLD
            </button>

            <button
              type="button"
              className="preflop-act-btn btn-act-raise"
              onClick={() => handleAction('raise')}
              disabled={feedback !== null}
            >
              <span>▲</span> RAISE / OPEN
            </button>
          </div>

          {/* Real-time Feedback Banner */}
          {feedback && (
            <div
              style={{
                textAlign: 'center',
                padding: '0.75rem 1rem',
                borderRadius: '0.45rem',
                backgroundColor: feedback === 'correct' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${feedback === 'correct' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                color: feedback === 'correct' ? '#34d399' : '#f87171',
                fontSize: '0.9rem',
                fontWeight: 600,
                animation: 'fadeIn 0.2s ease-in'
              }}
            >
              {feedbackMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PreflopTrainer;
