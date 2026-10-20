import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import Card from './Card';
import ChipStack from './ChipStack';
import { Hand } from 'pokersolver';
import { toSolverFormat } from '../utils/pokerLogic';
import { playSound, toggleAudioMute, isAudioMuted } from '../utils/audio';
import './HandReplayer.css';

/**
 * Robust Card Parser from textual representations like "8 of spades" or "10 of hearts"
 */
const parseCardFromText = (str) => {
  if (!str) return null;
  const match = str.trim().match(/([2-9]|10|[AKQJ])\s+of\s+(spades|hearts|diamonds|clubs)/i);
  if (match) {
    return { rank: match[1].toUpperCase(), suit: match[2].toLowerCase() };
  }
  return null;
};

/**
 * Fallback parser to extract all cards from the raw history string if JSON fields are empty
 */
const extractCardsFromHistory = (rawStr) => {
  if (!rawStr) return { board: [], heroCards: [], villainCards: [] };
  
  const board = [];
  const heroCards = [];
  const villainCards = [];

  // Match FLOP: [8 of spades, 5 of diamonds, 3 of hearts]
  const flopMatch = rawStr.match(/---\s*FLOP:\s*\[([^\]]+)\]/i);
  if (flopMatch) {
    flopMatch[1].split(',').forEach(c => {
      const card = parseCardFromText(c);
      if (card) board.push(card);
    });
  }

  // Match TURN: [2 of clubs]
  const turnMatch = rawStr.match(/---\s*TURN:\s*\[([^\]]+)\]/i);
  if (turnMatch) {
    turnMatch[1].split(',').forEach(c => {
      const card = parseCardFromText(c);
      if (card) board.push(card);
    });
  }

  // Match RIVER: [2 of diamonds]
  const riverMatch = rawStr.match(/---\s*RIVER:\s*\[([^\]]+)\]/i);
  if (riverMatch) {
    riverMatch[1].split(',').forEach(c => {
      const card = parseCardFromText(c);
      if (card) board.push(card);
    });
  }

  // Match Hero Hole Cards
  const heroMatch = rawStr.match(/Hero\s*(?:\(Player\))?\s*Hole\s*Cards:\s*([^\n]+)/i);
  if (heroMatch) {
    heroMatch[1].split(',').forEach(c => {
      const card = parseCardFromText(c);
      if (card) heroCards.push(card);
    });
  }

  // Match Villain Hole Cards
  const villainMatch = rawStr.match(/Villain\s*(?:\(Computer\))?\s*Hole\s*Cards:\s*([^\n]+)/i);
  if (villainMatch) {
    villainMatch[1].split(',').forEach(c => {
      const card = parseCardFromText(c);
      if (card) villainCards.push(card);
    });
  }

  return { board, heroCards, villainCards };
};

/**
 * Precomputes the state of every single action step
 */
const simulateSteps = (lines, heroHole, villainHole, fullBoard) => {
  if (!lines || lines.length === 0) return [];

  let currentStreet = 'Preflop';
  let currentPot = 30; // standard starting pot from SB + BB
  let currentBoard = [];
  let heroFolded = false;
  let villainFolded = false;
  let showVillain = false;
  let winner = null;
  let winnerMsg = null;
  let heroRoundBet = 0;
  let villainRoundBet = 0;

  // Infer dealer from blinds line if present
  const blindsLine = lines.find(l => l.includes('Blinds posted'));
  let dealer = 'hero';
  if (blindsLine) {
    if (blindsLine.includes('Villain SB') || blindsLine.includes('Computer SB')) {
      dealer = 'villain';
    }
  }

  return lines.map((line, idx) => {
    let activePlayer = null;
    let heroAction = null;
    let villainAction = null;
    let sound = 'click';

    // 1. Street Transitions
    if (line.includes('--- FLOP')) {
      currentStreet = 'Flop';
      currentBoard = fullBoard.slice(0, 3);
      heroRoundBet = 0;
      villainRoundBet = 0;
      sound = 'deal';
    } else if (line.includes('--- TURN')) {
      currentStreet = 'Turn';
      currentBoard = fullBoard.slice(0, 4);
      heroRoundBet = 0;
      villainRoundBet = 0;
      sound = 'deal';
    } else if (line.includes('--- RIVER')) {
      currentStreet = 'River';
      currentBoard = fullBoard.slice(0, 5);
      heroRoundBet = 0;
      villainRoundBet = 0;
      sound = 'deal';
    } else if (line.includes('--- SHOWDOWN') || line.includes('Went to showdown')) {
      currentStreet = 'Showdown';
      showVillain = true;
      sound = 'win';
    }

    // 2. Blinds Line
    const blindsMatch = line.match(/Blinds posted\s*\((?:Hero|.*)?\s*SB:\s*\$?(\d+),\s*(?:Villain|.*)?\s*BB:\s*\$?(\d+)\)/i);
    if (blindsMatch) {
      const sb = parseInt(blindsMatch[1], 10) || 10;
      const bb = parseInt(blindsMatch[2], 10) || 20;
      currentPot = sb + bb;
      if (dealer === 'hero') {
        heroRoundBet = sb;
        villainRoundBet = bb;
      } else {
        villainRoundBet = sb;
        heroRoundBet = bb;
      }
    }

    // 3. Hero Actions
    const heroBetMatch = line.match(/(?:You|Hero)\s+Bet[s]?\s+\$?(\d+)/i);
    const heroRaiseMatch = line.match(/(?:You|Hero)\s+Raise[s]?\s+to\s+\$?(\d+)/i);
    const heroCallMatch = line.match(/(?:You|Hero)\s+Call[s]?\s+\$?(\d+)/i);
    const heroCheckMatch = line.match(/(?:You|Hero)\s+Check[s]?/i);
    const heroFoldMatch = line.match(/(?:You|Hero)\s+Fold[s]?/i);

    if (heroBetMatch) {
      const amt = parseInt(heroBetMatch[1], 10);
      currentPot += amt;
      heroRoundBet += amt;
      activePlayer = 'hero';
      heroAction = { type: 'bet', text: `Bet $${amt}`, amount: amt, badgeClass: 'action-bet' };
      sound = 'bet';
    } else if (heroRaiseMatch) {
      const amt = parseInt(heroRaiseMatch[1], 10);
      const added = amt - heroRoundBet > 0 ? amt - heroRoundBet : amt;
      currentPot += added;
      heroRoundBet = amt;
      activePlayer = 'hero';
      heroAction = { type: 'raise', text: `Raise to $${amt}`, amount: amt, badgeClass: 'action-raise' };
      sound = 'bet';
    } else if (heroCallMatch) {
      const amt = parseInt(heroCallMatch[1], 10);
      currentPot += amt;
      heroRoundBet += amt;
      activePlayer = 'hero';
      heroAction = { type: 'call', text: `Call $${amt}`, amount: amt, badgeClass: 'action-call' };
      sound = 'bet';
    } else if (heroCheckMatch) {
      activePlayer = 'hero';
      heroAction = { type: 'check', text: 'Check', badgeClass: 'action-check' };
      sound = 'check';
    } else if (heroFoldMatch) {
      activePlayer = 'hero';
      heroFolded = true;
      heroAction = { type: 'fold', text: 'Fold', badgeClass: 'action-fold' };
      sound = 'fold';
    }

    // 4. Villain Actions
    const villainBetMatch = line.match(/(?:Computer|Villain)\s+Bet[s]?\s+\$?(\d+)/i);
    const villainRaiseMatch = line.match(/(?:Computer|Villain)\s+Raise[s]?\s+to\s+\$?(\d+)/i);
    const villainCallMatch = line.match(/(?:Computer|Villain)\s+Call[s]?\s+\$?(\d+)/i);
    const villainCheckMatch = line.match(/(?:Computer|Villain)\s+Check[s]?/i);
    const villainFoldMatch = line.match(/(?:Computer|Villain)\s+Fold[s]?/i);

    if (villainBetMatch) {
      const amt = parseInt(villainBetMatch[1], 10);
      currentPot += amt;
      villainRoundBet += amt;
      activePlayer = 'villain';
      villainAction = { type: 'bet', text: `Bet $${amt}`, amount: amt, badgeClass: 'action-bet' };
      sound = 'bet';
    } else if (villainRaiseMatch) {
      const amt = parseInt(villainRaiseMatch[1], 10);
      const added = amt - villainRoundBet > 0 ? amt - villainRoundBet : amt;
      currentPot += added;
      villainRoundBet = amt;
      activePlayer = 'villain';
      villainAction = { type: 'raise', text: `Raise to $${amt}`, amount: amt, badgeClass: 'action-raise' };
      sound = 'bet';
    } else if (villainCallMatch) {
      const amt = parseInt(villainCallMatch[1], 10);
      currentPot += amt;
      villainRoundBet += amt;
      activePlayer = 'villain';
      villainAction = { type: 'call', text: `Call $${amt}`, amount: amt, badgeClass: 'action-call' };
      sound = 'bet';
    } else if (villainCheckMatch) {
      activePlayer = 'villain';
      villainAction = { type: 'check', text: 'Check', badgeClass: 'action-check' };
      sound = 'check';
    } else if (villainFoldMatch) {
      activePlayer = 'villain';
      villainFolded = true;
      villainAction = { type: 'fold', text: 'Fold', badgeClass: 'action-fold' };
      sound = 'fold';
    }

    // 5. Outcome & Winner
    const villainWinMatch = line.match(/(?:Computer|Villain)\s+(?:wins|scoops)\s+\$?(\d+)(?:\s+with\s+(.*))?/i);
    const heroWinMatch = line.match(/(?:You|Hero)\s+(?:win[s]?|scoop[s]?)\s+\$?(\d+)(?:\s+with\s+(.*))?/i);

    if (villainWinMatch) {
      currentPot = parseInt(villainWinMatch[1], 10) || currentPot;
      winner = 'villain';
      winnerMsg = line;
      showVillain = true;
      sound = 'win';
    } else if (heroWinMatch) {
      currentPot = parseInt(heroWinMatch[1], 10) || currentPot;
      winner = 'hero';
      winnerMsg = line;
      showVillain = true;
      sound = 'win';
    }

    // On final step, reveal villain cards
    if (idx === lines.length - 1) {
      showVillain = true;
    }

    return {
      index: idx,
      line,
      street: currentStreet,
      pot: currentPot,
      board: [...currentBoard],
      heroCards: heroHole,
      villainCards: villainHole,
      showVillain,
      activePlayer,
      heroAction,
      villainAction,
      heroRoundBet,
      villainRoundBet,
      heroFolded,
      villainFolded,
      winner,
      winnerMsg,
      dealer,
      sound
    };
  });
};

const HandReplayer = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [handData, setHandData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Replayer state
  const [historyLines, setHistoryLines] = useState([]);
  const [simulatedSteps, setSimulatedSteps] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [muted, setMuted] = useState(isAudioMuted());

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
      const rawHistory = data.history_json?.historyStr || '';
      
      const lines = rawHistory
        .split('\n')
        .map(l => l.trim())
        .filter(l => l !== '' && 
          !l.startsWith('--- CARDS AT END OF HAND ---') && 
          !l.startsWith('Hero (Player)') && 
          !l.startsWith('Villain') && 
          !l.startsWith('Community')
        );
        
      setHistoryLines(lines);

      // Extract cards safely with fallbacks
      const fallback = extractCardsFromHistory(rawHistory);
      const jsonHero = data.history_json?.heroCards;
      const jsonVillain = data.history_json?.villainCards;
      const jsonBoard = data.history_json?.board;

      const finalHero = (Array.isArray(jsonHero) && jsonHero.length >= 2) ? jsonHero : fallback.heroCards;
      const finalVillain = (Array.isArray(jsonVillain) && jsonVillain.length >= 2) ? jsonVillain : fallback.villainCards;
      const finalBoard = (Array.isArray(jsonBoard) && jsonBoard.length > 0) ? jsonBoard : fallback.board;

      const steps = simulateSteps(lines, finalHero, finalVillain, finalBoard);
      setSimulatedSteps(steps);
      setCurrentStep(0);
    } catch (error) {
      console.error('Error fetching hand replay:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-play timer
  useEffect(() => {
    if (!isPlaying) return;

    if (currentStep >= simulatedSteps.length - 1) {
      setIsPlaying(false);
      return;
    }

    const intervalMs = Math.round(1400 / playbackSpeed);
    const timer = setTimeout(() => {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      const stepData = simulatedSteps[nextStep];
      if (stepData) playSound(stepData.sound);
    }, intervalMs);

    return () => clearTimeout(timer);
  }, [isPlaying, currentStep, simulatedSteps, playbackSpeed]);

  // Scroll active line in Action Playbook
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentStep]);

  // Sound handler for manual step changes
  const changeStep = (newStep) => {
    if (newStep >= 0 && newStep < simulatedSteps.length) {
      setCurrentStep(newStep);
      const stepData = simulatedSteps[newStep];
      if (stepData) playSound(stepData.sound);
    }
  };

  const currentSnapshot = simulatedSteps[currentStep] || {
    street: 'Preflop',
    pot: 30,
    board: [],
    heroCards: handData?.history_json?.heroCards || [],
    villainCards: handData?.history_json?.villainCards || [],
    showVillain: false,
    activePlayer: null,
    heroAction: null,
    villainAction: null,
    heroFolded: false,
    villainFolded: false,
    winner: null,
    winnerMsg: null,
    dealer: 'hero'
  };

  // Made hand evaluations using pokersolver
  const heroMadeHand = useMemo(() => {
    if (!currentSnapshot.heroCards || currentSnapshot.heroCards.length < 2 || currentSnapshot.board.length < 3) return null;
    try {
      const heroSolver = currentSnapshot.heroCards.map(toSolverFormat);
      const boardSolver = currentSnapshot.board.map(toSolverFormat);
      const solved = Hand.solve([...heroSolver, ...boardSolver]);
      return solved ? { name: solved.name, descr: solved.descr } : null;
    } catch (e) {
      return null;
    }
  }, [currentSnapshot.heroCards, currentSnapshot.board]);

  const villainMadeHand = useMemo(() => {
    if (!currentSnapshot.showVillain || !currentSnapshot.villainCards || currentSnapshot.villainCards.length < 2 || currentSnapshot.board.length < 3) return null;
    try {
      const villainSolver = currentSnapshot.villainCards.map(toSolverFormat);
      const boardSolver = currentSnapshot.board.map(toSolverFormat);
      const solved = Hand.solve([...villainSolver, ...boardSolver]);
      return solved ? { name: solved.name, descr: solved.descr } : null;
    } catch (e) {
      return null;
    }
  }, [currentSnapshot.showVillain, currentSnapshot.villainCards, currentSnapshot.board]);

  // Street jump navigation
  const jumpToStreet = (streetName) => {
    setIsPlaying(false);
    if (streetName === 'Preflop') {
      changeStep(0);
      return;
    }
    const targetIdx = simulatedSteps.findIndex(s => s.street.toLowerCase() === streetName.toLowerCase());
    if (targetIdx !== -1) {
      changeStep(targetIdx);
    }
  };

  const handleToggleMute = () => {
    const isMutedNow = toggleAudioMute();
    setMuted(isMutedNow);
  };

  if (loading) {
    return (
      <div className="replayer-container" style={{ textAlign: 'center', paddingTop: '4rem', color: '#94a3b8' }}>
        <div>⏳ Loading Visual Hand Replay...</div>
      </div>
    );
  }

  if (!handData || simulatedSteps.length === 0) {
    return (
      <div className="replayer-container" style={{ textAlign: 'center', paddingTop: '4rem', color: '#94a3b8' }}>
        <div>Hand not found or history log is empty.</div>
        <button className="challenge-back-btn" style={{ marginTop: '1rem' }} onClick={() => navigate('/history')}>
          Return to History
        </button>
      </div>
    );
  }

  const {
    street,
    pot,
    board,
    heroCards,
    villainCards,
    showVillain,
    activePlayer,
    heroAction,
    villainAction,
    heroFolded,
    villainFolded,
    winner,
    dealer
  } = currentSnapshot;

  return (
    <div className="replayer-container">
      {/* Top Header Row */}
      <div className="replayer-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button className="challenge-back-btn" onClick={() => navigate('/history')}>
            ← Back to Logs
          </button>
          <span className="replayer-badge">Visual Hand Replayer</span>
          <span style={{ fontSize: '0.85rem', color: '#e2e8f0', fontWeight: 600 }}>
            {new Date(handData.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="replayer-mode-tag">{handData.game_mode || 'AI Sandbox'}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button 
            className="replayer-mute-btn" 
            onClick={handleToggleMute}
            title={muted ? 'Unmute sounds' : 'Mute sounds'}
          >
            {muted ? '🔇 Muted' : '🔊 Sound On'}
          </button>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Action <strong style={{ color: '#fff' }}>{currentStep + 1}</strong> of <strong style={{ color: '#fff' }}>{simulatedSteps.length}</strong>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Felt Table, Right Action Playbook */}
      <div className="replayer-body-grid">
        {/* Left Column: Oval Felt Table & Interactive Controls */}
        <div className="replayer-table-column">
          
          {/* Street Jump Tabs */}
          <div className="replayer-street-tabs">
            {['Preflop', 'Flop', 'Turn', 'River', 'Showdown'].map(st => {
              const reachedStreet = simulatedSteps.some(s => s.street.toLowerCase() === st.toLowerCase());
              return (
                <button
                  key={st}
                  className={`replayer-street-tab ${street.toLowerCase() === st.toLowerCase() ? 'active' : ''}`}
                  onClick={() => jumpToStreet(st)}
                  disabled={!reachedStreet}
                  title={!reachedStreet ? `${st} was not reached in this hand` : `Jump to ${st}`}
                >
                  {st}
                </button>
              );
            })}
          </div>

          {/* Oval Felt Table */}
          <div className="replayer-felt-oval">
            
            {/* Top Seat: Villain (Computer / Opponent) */}
            <div className={`replayer-seat seat-villain ${activePlayer === 'villain' ? 'seat-active-turn' : ''} ${winner === 'villain' ? 'seat-winner' : ''}`}>
              <div className="replayer-player-header">
                <div className="replayer-avatar-badge">
                  <span>🤖 Villain (Computer)</span>
                  {dealer === 'villain' && <span className="replayer-dealer-chip" title="Dealer (Button)">D</span>}
                </div>
                <span className="replayer-status-tag">
                  {showVillain ? 'Showdown' : 'Cards Concealed'}
                </span>
              </div>

              {/* Action Bubble Floating On Villain */}
              {villainAction && (
                <div className={`replayer-action-bubble ${villainAction.badgeClass}`}>
                  <span className="bubble-text">{villainAction.text}</span>
                  {villainAction.amount && <span className="bubble-chips">🪙</span>}
                </div>
              )}

              {/* Villain Cards */}
              <div className={`replayer-cards-row ${villainFolded ? 'cards-folded' : ''}`}>
                {villainCards && villainCards.length > 0 ? (
                  villainCards.map((c, i) => (
                    <div key={i} className="card-wrapper">
                      <Card suit={c.suit} rank={c.rank} isFaceUp={showVillain} disableFlip={true} />
                    </div>
                  ))
                ) : (
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>[Cards Concealed]</div>
                )}
              </div>

              {/* Villain Evaluated Hand at Showdown */}
              {showVillain && villainMadeHand && (
                <div className="replayer-hand-desc">
                  {villainMadeHand.descr}
                </div>
              )}

              {winner === 'villain' && (
                <div className="replayer-winner-pill">
                  🏆 Winner ({pot > 0 ? `$${pot}` : ''})
                </div>
              )}
            </div>

            {/* Board & Pot Center Area */}
            <div className="replayer-board-center">
              {/* Animated Pot & Street Display */}
              <div className="replayer-pot-display">
                <div className="replayer-street-pill">
                  <span className="street-dot"></span>
                  <span>{street.toUpperCase()}</span>
                </div>
                <div className="replayer-pot-badge">
                  <span className="pot-label">POT</span>
                  <span className="pot-val">${pot}</span>
                </div>
              </div>

              {/* Pot Chips Stack */}
              <div className="replayer-chip-tower">
                <ChipStack amount={pot} />
              </div>

              {/* 5 Community Board Cards */}
              <div className="replayer-community-cards">
                {[0, 1, 2, 3, 4].map(idx => {
                  const card = board[idx];
                  if (card) {
                    return (
                      <div key={idx} className="board-card-slot dealt">
                        <Card suit={card.suit} rank={card.rank} isFaceUp={true} disableFlip={true} />
                      </div>
                    );
                  }
                  return (
                    <div key={idx} className="board-card-slot empty" title="Card slot">
                      <span className="empty-slot-dash"></span>
                    </div>
                  );
                })}
              </div>

              {board.length === 0 && (
                <span className="replayer-preflop-hint">Preflop Action in Progress</span>
              )}
            </div>

            {/* Bottom Seat: Hero (User) */}
            <div className={`replayer-seat seat-hero ${activePlayer === 'hero' ? 'seat-active-turn' : ''} ${winner === 'hero' ? 'seat-winner' : ''}`}>
              {winner === 'hero' && (
                <div className="replayer-winner-pill">
                  🏆 Winner ({pot > 0 ? `$${pot}` : ''})
                </div>
              )}

              {/* Action Bubble Floating On Hero */}
              {heroAction && (
                <div className={`replayer-action-bubble ${heroAction.badgeClass}`}>
                  <span className="bubble-text">{heroAction.text}</span>
                  {heroAction.amount && <span className="bubble-chips">🪙</span>}
                </div>
              )}

              {/* Hero Cards */}
              <div className={`replayer-cards-row ${heroFolded ? 'cards-folded' : ''}`}>
                {heroCards && heroCards.map((c, i) => (
                  <div key={i} className="card-wrapper">
                    <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
                  </div>
                ))}
              </div>

              {/* Hero Evaluated Hand */}
              {heroMadeHand && (
                <div className="replayer-hand-desc">
                  {heroMadeHand.descr}
                </div>
              )}

              <div className="replayer-player-header" style={{ marginTop: '0.25rem' }}>
                <div className="replayer-avatar-badge hero-avatar">
                  <span>👤 Hero (You)</span>
                  {dealer === 'hero' && <span className="replayer-dealer-chip" title="Dealer (Button)">D</span>}
                </div>
                <span className={`replayer-status-tag ${handData.won ? 'won' : 'loss'}`}>
                  {handData.won ? '🏆 Hand Won' : 'Hand Loss / Fold'}
                </span>
              </div>
            </div>

          </div>

          {/* Controls Bar */}
          <div className="replayer-controls-bar">
            {/* Playback Buttons */}
            <div className="replayer-nav-btns">
              <button onClick={() => changeStep(0)} disabled={currentStep === 0} title="Start of Hand (⏮)">
                ⏮
              </button>
              <button onClick={() => changeStep(currentStep - 1)} disabled={currentStep === 0} title="Previous Action (◀)">
                ◀
              </button>
              <button 
                className={`play-btn ${isPlaying ? 'playing' : ''}`}
                onClick={() => setIsPlaying(p => !p)}
                title={isPlaying ? 'Pause Auto-Play' : 'Start Auto-Play'}
              >
                {isPlaying ? '⏸ Pause' : '▶ Auto-Play'}
              </button>
              <button onClick={() => changeStep(currentStep + 1)} disabled={currentStep >= simulatedSteps.length - 1} title="Next Action (▶)">
                ▶
              </button>
              <button onClick={() => changeStep(simulatedSteps.length - 1)} disabled={currentStep >= simulatedSteps.length - 1} title="End of Hand (⏭)">
                ⏭
              </button>
            </div>

            {/* Scrub Slider */}
            <div className="replayer-scrubber-box">
              <input
                type="range"
                min="0"
                max={Math.max(0, simulatedSteps.length - 1)}
                value={currentStep}
                onChange={(e) => changeStep(Number(e.target.value))}
                className="replayer-step-scrubber"
              />
              <span className="replayer-step-counter">
                {currentStep + 1}/{simulatedSteps.length}
              </span>
            </div>

            {/* Speed Selector */}
            <div className="replayer-speed-box">
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Speed:</span>
              <select 
                className="replayer-speed-select"
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
              >
                <option value={0.6}>0.6x (Slow)</option>
                <option value={1.0}>1.0x (Normal)</option>
                <option value={1.5}>1.5x (Fast)</option>
                <option value={2.0}>2.0x (Hyper)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Right Column: Step By Step Action Playbook */}
        <div className="replayer-log-column">
          <div className="replayer-playbook-header">
            <div>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>Action Playbook</span>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Interactive replay timeline</div>
            </div>
            <span className="replayer-playbook-hint">Click any line to scrub</span>
          </div>

          <div className="replayer-log-list">
            {simulatedSteps.map((stepItem, idx) => {
              const { line } = stepItem;
              const isHeader = line.startsWith('---');
              const isActive = idx === currentStep;

              let lineIcon = '•';
              if (line.includes('--- FLOP')) lineIcon = '🃏';
              else if (line.includes('--- TURN')) lineIcon = '🔄';
              else if (line.includes('--- RIVER')) lineIcon = '🌊';
              else if (line.includes('--- SHOWDOWN') || line.includes('showdown')) lineIcon = '⚔️';
              else if (line.includes('Bet')) lineIcon = '🔴';
              else if (line.includes('Raise')) lineIcon = '🟡';
              else if (line.includes('Call')) lineIcon = '🔵';
              else if (line.includes('Check')) lineIcon = '⚪';
              else if (line.includes('Fold')) lineIcon = '❌';
              else if (line.includes('win') || line.includes('scoop')) lineIcon = '🏆';

              return (
                <div
                  key={idx}
                  ref={isActive ? activeLineRef : null}
                  className={`replayer-log-item ${isHeader ? 'street-header' : ''} ${isActive ? 'active' : ''}`}
                  onClick={() => { setIsPlaying(false); changeStep(idx); }}
                >
                  <span className="log-item-icon">{lineIcon}</span>
                  <span className="log-item-text">{line}</span>
                  {isActive && <span className="active-cursor">◀ ACTIVE</span>}
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
