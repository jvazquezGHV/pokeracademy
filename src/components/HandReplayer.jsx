import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import Card from './Card';
import { playSound } from '../utils/audio';
import './HandReplayer.css';

const HandReplayer = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [handData, setHandData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Replayer state
  const [historyLines, setHistoryLines] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0); // 1.0x, 1.5x, 2.0x

  const activeLineRef = useRef(null);

  useEffect(() => {
    fetchHand();
    // eslint-disable-next-line
  }, [id]);

  const fetchHand = async () => {
    try {
      const { data, error } = await supabase
        .from('hand_histories')
        .select('*')
        .eq('id', id)
        .single();
        
      if (error) throw error;
      
      setHandData(data);
      const lines = data.history_json.historyStr
        .split('\n')
        .map(l => l.trim())
        .filter(l => l !== '' && !l.startsWith('--- CARDS AT END OF HAND ---') && !l.startsWith('Hero (Player)') && !l.startsWith('Villain') && !l.startsWith('Community'));
        
      setHistoryLines(lines);
      setCurrentStep(0);
    } catch (error) {
      console.error('Error fetching hand:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-play timer
  useEffect(() => {
    if (!isPlaying) return;

    if (currentStep >= historyLines.length - 1) {
      setIsPlaying(false);
      return;
    }

    const intervalMs = Math.round(1500 / playbackSpeed);
    const timer = setTimeout(() => {
      setCurrentStep(prev => prev + 1);
      playSound('click');
    }, intervalMs);

    return () => clearTimeout(timer);
  }, [isPlaying, currentStep, historyLines.length, playbackSpeed]);

  // Scroll active line into view
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentStep]);

  if (loading) {
    return (
      <div className="replayer-container" style={{ textAlign: 'center', paddingTop: '4rem', color: '#94a3b8' }}>
        <div>⏳ Loading Hand Replay...</div>
      </div>
    );
  }

  if (!handData) {
    return (
      <div className="replayer-container" style={{ textAlign: 'center', paddingTop: '4rem', color: '#94a3b8' }}>
        <div>Hand not found.</div>
        <button className="challenge-back-btn" style={{ marginTop: '1rem' }} onClick={() => navigate('/history')}>
          Return to History
        </button>
      </div>
    );
  }

  const { heroCards, villainCards, board } = handData.history_json;
  
  // Determine visible game state based on steps
  const visibleHistory = historyLines.slice(0, currentStep + 1);
  const visibleText = visibleHistory.join(' ');
  
  const showFlop = visibleText.includes('--- FLOP ---');
  const showTurn = visibleText.includes('--- TURN ---');
  const showRiver = visibleText.includes('--- RIVER ---');
  const showVillain = visibleText.includes('--- SHOWDOWN ---') || currentStep === historyLines.length - 1;

  let currentStreet = 'Preflop';
  if (showRiver) currentStreet = 'River';
  else if (showTurn) currentStreet = 'Turn';
  else if (showFlop) currentStreet = 'Flop';

  let visibleBoard = [];
  if (showRiver) visibleBoard = board.slice(0, 5);
  else if (showTurn) visibleBoard = board.slice(0, 4);
  else if (showFlop) visibleBoard = board.slice(0, 3);

  // Jump to specific street
  const jumpToStreet = (streetName) => {
    setIsPlaying(false);
    if (streetName === 'Preflop') {
      setCurrentStep(0);
      return;
    }
    const targetTag = `--- ${streetName.toUpperCase()} ---`;
    const targetIdx = historyLines.findIndex(l => l.includes(targetTag));
    if (targetIdx !== -1) {
      setCurrentStep(targetIdx);
    }
  };

  const handleNext = () => {
    if (currentStep < historyLines.length - 1) {
      setCurrentStep(s => s + 1);
      playSound('click');
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(s => s - 1);
      playSound('click');
    }
  };

  return (
    <div className="replayer-container">
      {/* Top Header */}
      <div className="replayer-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button className="challenge-back-btn" onClick={() => navigate('/history')}>
            ← Back to Logs
          </button>
          <span className="replayer-badge">Visual Hand Replayer</span>
          <span style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 600 }}>
            {new Date(handData.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
          Step <strong style={{ color: '#fff' }}>{currentStep + 1}</strong> of <strong style={{ color: '#fff' }}>{historyLines.length}</strong>
        </div>
      </div>

      {/* Main Grid: Left Table, Right Action Log */}
      <div className="replayer-body-grid">
        {/* Table Column */}
        <div className="replayer-table-column">
          {/* Street Jump Tabs */}
          <div className="replayer-street-tabs">
            {['Preflop', 'Flop', 'Turn', 'River'].map(st => (
              <button
                key={st}
                className={`replayer-street-tab ${currentStreet === st ? 'active' : ''}`}
                onClick={() => jumpToStreet(st)}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Oval Felt Table */}
          <div className="replayer-felt-oval">
            {/* Top Seat: Villain */}
            <div className="challenge-seat">
              <div className="challenge-player-badge">
                <span>🤖 Villain</span>
                <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{showVillain ? 'Showdown' : 'Cards Concealed'}</span>
              </div>
              <div className="challenge-cards-row" style={{ marginTop: '0.35rem' }}>
                {villainCards.map((c, i) => (
                  <div key={i} style={{ transform: 'scale(0.8)', transformOrigin: 'top center' }}>
                    <Card suit={c.suit} rank={c.rank} isFaceUp={showVillain} disableFlip={true} />
                  </div>
                ))}
              </div>
            </div>

            {/* Board Area */}
            <div className="challenge-board-center">
              <div className="challenge-pot-pill">
                <span className="challenge-pot-label">Street</span>
                <span className="challenge-pot-amount" style={{ color: '#38bdf8' }}>{currentStreet}</span>
              </div>

              <div className="challenge-cards-row">
                {visibleBoard.length === 0 ? (
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                    Preflop Action
                  </span>
                ) : (
                  visibleBoard.map((c, i) => (
                    <div key={i} style={{ transform: 'scale(0.85)', transformOrigin: 'center' }}>
                      <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Bottom Seat: Hero */}
            <div className="challenge-seat">
              <div className="challenge-cards-row" style={{ marginBottom: '0.35rem' }}>
                {heroCards.map((c, i) => (
                  <div key={i} style={{ transform: 'scale(0.85)', transformOrigin: 'bottom center' }}>
                    <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
                  </div>
                ))}
              </div>
              <div className="challenge-player-badge">
                <span>👤 Hero</span>
                <span style={{ color: handData.won ? '#10b981' : '#ef4444', fontWeight: 700, fontSize: '0.72rem' }}>
                  {handData.won ? '🏆 Won Hand' : 'Loss / Fold'}
                </span>
              </div>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="replayer-controls-bar">
            <div className="replayer-nav-btns">
              <button onClick={() => setCurrentStep(0)} disabled={currentStep === 0} title="Start of Hand">
                ⏮
              </button>
              <button onClick={handlePrev} disabled={currentStep === 0} title="Previous Action">
                ◀
              </button>
              <button 
                className="play-btn"
                onClick={() => setIsPlaying(p => !p)}
              >
                {isPlaying ? '⏸ Pause' : '▶ Auto-Play'}
              </button>
              <button onClick={handleNext} disabled={currentStep >= historyLines.length - 1} title="Next Action">
                ▶
              </button>
              <button onClick={() => setCurrentStep(historyLines.length - 1)} disabled={currentStep >= historyLines.length - 1} title="End of Hand">
                ⏭
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Speed:</span>
              <select 
                className="replayer-speed-select"
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
              >
                <option value={0.75}>0.75x</option>
                <option value={1.0}>1.0x (Normal)</option>
                <option value={1.5}>1.5x (Fast)</option>
                <option value={2.0}>2.0x (Speed)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Right: Step By Step Action Log */}
        <div className="replayer-log-column">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.4rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>Action Playbook</span>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Click any line</span>
          </div>

          <div className="replayer-log-list">
            {historyLines.map((line, idx) => {
              const isHeader = line.startsWith('---');
              const isActive = idx === currentStep;

              return (
                <div
                  key={idx}
                  ref={isActive ? activeLineRef : null}
                  className={`replayer-log-item ${isHeader ? 'street-header' : ''} ${isActive ? 'active' : ''}`}
                  onClick={() => { setIsPlaying(false); setCurrentStep(idx); }}
                  style={{ cursor: 'pointer' }}
                >
                  {line}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HandReplayer;
