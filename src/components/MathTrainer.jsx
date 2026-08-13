import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { playSound } from '../utils/audio';

// Common bet sizes and their mathematically required equity
const SCENARIOS = [
  { label: '1/4 Pot', fraction: 0.25, correctPct: 17 },
  { label: '1/3 Pot', fraction: 0.333, correctPct: 20 },
  { label: '1/2 Pot', fraction: 0.5, correctPct: 25 },
  { label: '2/3 Pot', fraction: 0.666, correctPct: 29 },
  { label: '3/4 Pot', fraction: 0.75, correctPct: 30 },
  { label: 'Full Pot', fraction: 1.0, correctPct: 33 },
  { label: '2x Pot (Overbet)', fraction: 2.0, correctPct: 40 }
];

const MathTrainer = () => {
  const navigate = useNavigate();
  
  const [timerConfig, setTimerConfig] = useState(0);
  const [timeLeft, setTimeLeft] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [options, setOptions] = useState([]);
  
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [feedback, setFeedback] = useState(null);
  const [feedbackMessage, setFeedbackMessage] = useState('');

  const generateQuestion = useCallback(() => {
    setFeedback(null);
    setFeedbackMessage('');
    
    // Pick random scenario
    const scenario = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
    
    // Generate random pot size that makes nice numbers (multiples of 12 work well for 1/3, 1/4, 1/2)
    const basePots = [12, 24, 30, 60, 120, 240, 300, 600];
    const pot = basePots[Math.floor(Math.random() * basePots.length)];
    const bet = Math.round(pot * scenario.fraction);
    
    setCurrentQuestion({
      pot,
      bet,
      correctPct: scenario.correctPct,
      label: scenario.label
    });
    
    // Generate 4 unique options including the correct one
    let opts = new Set([scenario.correctPct]);
    while(opts.size < 4) {
      const randomOpt = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)].correctPct;
      opts.add(randomOpt);
    }
    
    // Convert to array and shuffle
    const shuffledOpts = Array.from(opts).sort(() => Math.random() - 0.5);
    setOptions(shuffledOpts);
    
    if (timerConfig > 0) {
      setTimeLeft(timerConfig);
    }
  }, [timerConfig]);

  useEffect(() => {
    if (isPlaying) {
      generateQuestion();
    }
  }, [isPlaying, generateQuestion]);

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
    setFeedbackMessage(`Too Slow! Correct answer was ${currentQuestion.correctPct}%`);
    setScore(prev => ({ ...prev, total: prev.total + 1 }));
    setTimeout(() => {
      generateQuestion();
    }, 2000);
  };

  const handleAnswer = (selectedPct) => {
    if (feedback !== null) return;
    
    const isCorrect = selectedPct === currentQuestion.correctPct;
    
    if (isCorrect) {
      playSound('deal');
      setFeedback('correct');
      setFeedbackMessage('Correct!');
      setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }));
    } else {
      playSound('fold');
      setFeedback('incorrect');
      setFeedbackMessage(`Incorrect! Villain bet ${currentQuestion.label}, so you need ${currentQuestion.correctPct}% equity to call.`);
      setScore(prev => ({ ...prev, total: prev.total + 1 }));
    }
    
    setTimeout(() => {
      generateQuestion();
    }, 2500);
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

      <h1 className="text-accent" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Math & Pot Odds Drill</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Train your brain to instantly recognize required equity.</p>

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
              <option value={5}>5 Seconds (Hardcore)</option>
              <option value={10}>10 Seconds (Standard)</option>
              <option value={15}>15 Seconds (Beginner)</option>
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
               <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: timeLeft <= 3 ? 'var(--danger-color)' : 'white' }}>
                 ⏱ {timeLeft}s
               </div>
             )}
          </div>

          {currentQuestion && (
            <div style={{ marginBottom: '3rem' }}>
              <div style={{ fontSize: '1.5rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                The Pot is <strong style={{ color: 'white' }}>${currentQuestion.pot}</strong>.
              </div>
              <div style={{ fontSize: '2rem', color: 'var(--danger-color)', fontWeight: 'bold', marginBottom: '1rem' }}>
                Villain Bets ${currentQuestion.bet}
              </div>
              <div style={{ fontSize: '1.2rem', color: 'white' }}>
                What is your required equity (Pot Odds) to call?
              </div>
            </div>
          )}

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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', maxWidth: '500px', margin: '0 auto' }}>
              {options.map((opt, idx) => (
                <button 
                  key={idx}
                  className="action-button"
                  onClick={() => handleAnswer(opt)}
                  style={{ padding: '1.5rem', fontSize: '1.5rem', fontWeight: 'bold' }}
                >
                  {opt}%
                </button>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
};

export default MathTrainer;
