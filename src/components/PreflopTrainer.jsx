import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from './Card';
import rangeData from '../data/ranges.json';
import { createDeck } from '../utils/pokerLogic';
import { playSound } from '../utils/audio';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

const getHandString = (c1, c2) => {
  const r1 = c1.rank === '10' ? 'T' : c1.rank;
  const r2 = c2.rank === '10' ? 'T' : c2.rank;
  const idx1 = RANKS.indexOf(r1);
  const idx2 = RANKS.indexOf(r2);
  
  // Lower index means higher card (A=0, K=1, etc)
  const high = idx1 <= idx2 ? r1 : r2;
  const low = idx1 <= idx2 ? r2 : r1;
  
  if (high === low) return `${high}${low}`;
  if (c1.suit === c2.suit) return `${high}${low}s`;
  return `${high}${low}o`;
};

const PreflopTrainer = () => {
  const navigate = useNavigate();
  
  const [timerConfig, setTimerConfig] = useState(0); // 0 = off
  const [timeLeft, setTimeLeft] = useState(null);
  
  const [currentCards, setCurrentCards] = useState([]);
  const [currentPosition, setCurrentPosition] = useState(null);
  
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [feedback, setFeedback] = useState(null); // 'correct', 'incorrect', 'timeout'
  const [feedbackMessage, setFeedbackMessage] = useState('');
  
  const [isPlaying, setIsPlaying] = useState(false);

  const dealNextHand = useCallback(() => {
    setFeedback(null);
    setFeedbackMessage('');
    const deck = createDeck();
    setCurrentCards([deck.pop(), deck.pop()]);
    
    // Pick random position from rangeData
    const randomPosIndex = Math.floor(Math.random() * rangeData.positions.length);
    setCurrentPosition(rangeData.positions[randomPosIndex]);
    
    if (timerConfig > 0) {
      setTimeLeft(timerConfig);
    }
  }, [timerConfig]);

  useEffect(() => {
    if (isPlaying) {
      dealNextHand();
    }
  }, [isPlaying, dealNextHand]);

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
    playSound('error');
    setFeedback('timeout');
    setFeedbackMessage('Too Slow!');
    setScore(prev => ({ ...prev, total: prev.total + 1 }));
    setTimeout(() => {
      dealNextHand();
    }, 1500);
  };

  const handleAction = (action) => { // action = 'raise' | 'fold'
    if (feedback !== null) return; // Prevent double clicks
    
    const handStr = getHandString(currentCards[0], currentCards[1]);
    const shouldRaise = currentPosition.raise.includes(handStr);
    
    const isCorrect = (action === 'raise' && shouldRaise) || (action === 'fold' && !shouldRaise);
    
    if (isCorrect) {
      playSound('deal'); // Using deal sound for success
      setFeedback('correct');
      setFeedbackMessage('Correct!');
      setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }));
    } else {
      playSound('fold'); // Using fold sound for error
      setFeedback('incorrect');
      setFeedbackMessage(`Incorrect. ${handStr} is a ${shouldRaise ? 'RAISE' : 'FOLD'} from ${currentPosition.name}.`);
      setScore(prev => ({ ...prev, total: prev.total + 1 }));
    }
    
    setTimeout(() => {
      dealNextHand();
    }, 2000);
  };

  const getAccuracy = () => {
    if (score.total === 0) return 0;
    return Math.round((score.correct / score.total) * 100);
  };

  return (
    <div className="container" style={{ maxWidth: '800px', marginTop: '2rem', textAlign: 'center' }}>
      <button 
        onClick={() => navigate('/')} 
        style={{ alignSelf: 'flex-start', background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', marginBottom: '1rem', display: 'flex' }}
      >
        ← Back to Dashboard
      </button>

      <h1 className="text-accent" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Preflop Range Trainer</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Build instant muscle memory for preflop GTO ranges.</p>

      {!isPlaying ? (
        <div style={{ backgroundColor: 'var(--surface-color)', padding: '3rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
          <h2 style={{ marginBottom: '1rem' }}>Trainer Settings</h2>
          
          <div style={{ marginBottom: '2rem', textAlign: 'left', maxWidth: '300px', margin: '0 auto 2rem auto' }}>
            <label style={{ color: 'var(--text-secondary)', fontSize: '1rem', marginBottom: '0.5rem', display: 'block' }}>Timer (Simulate Pressure)</label>
            <select 
              value={timerConfig}
              onChange={(e) => setTimerConfig(Number(e.target.value))}
              style={{ width: '100%', padding: '0.8rem', borderRadius: '0.5rem', backgroundColor: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <option value={0}>Off (No Pressure)</option>
              <option value={3}>3 Seconds (Hardcore)</option>
              <option value={5}>5 Seconds (Standard)</option>
              <option value={10}>10 Seconds (Beginner)</option>
            </select>
          </div>

          <button className="btn-primary" style={{ padding: '1rem 3rem', fontSize: '1.2rem' }} onClick={() => setIsPlaying(true)}>
            Start Training
          </button>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--surface-color)', padding: '2rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)', position: 'relative' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', color: 'var(--text-secondary)' }}>
             <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
               Score: <span style={{ color: 'var(--accent-color)' }}>{score.correct} / {score.total}</span> ({getAccuracy()}%)
             </div>
             {timerConfig > 0 && (
               <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: timeLeft <= 2 ? 'var(--danger-color)' : 'white' }}>
                 ⏱ {timeLeft}s
               </div>
             )}
          </div>

          <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
            You are <span style={{ color: 'var(--accent-color)' }}>{currentPosition?.name}</span>
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.9rem' }}>
            {currentPosition?.description}
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', minHeight: '160px', marginBottom: '2rem' }}>
             {currentCards.map((c, i) => (
                <div key={i} style={{ transform: 'scale(1.2)' }}>
                  <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
                </div>
             ))}
          </div>

          {feedback ? (
            <div style={{ 
               backgroundColor: feedback === 'correct' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
               border: `2px solid ${feedback === 'correct' ? '#10b981' : '#ef4444'}`,
               padding: '1rem',
               borderRadius: '0.5rem',
               color: feedback === 'correct' ? '#10b981' : '#ef4444',
               fontWeight: 'bold',
               fontSize: '1.2rem',
               animation: 'floatUp 0.3s ease-out'
            }}>
              {feedbackMessage}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button className="btn-primary" style={{ backgroundColor: 'var(--danger-color)', padding: '1rem 3rem', fontSize: '1.2rem' }} onClick={() => handleAction('fold')}>
                FOLD
              </button>
              <button className="btn-primary" style={{ backgroundColor: 'var(--accent-color)', padding: '1rem 3rem', fontSize: '1.2rem' }} onClick={() => handleAction('raise')}>
                RAISE
              </button>
            </div>
          )}

        </div>
      )}
    </div>
  );
};

export default PreflopTrainer;
