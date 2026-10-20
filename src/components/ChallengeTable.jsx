import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import Card from './Card';
import { createDeck, calculateOdds, toSolverFormat } from '../utils/pokerLogic';
import { gradeChallengeHand } from '../api/gradeChallengeHand';
import challenges from '../data/challenges.json';
import { Hand } from 'pokersolver';
import { playSound } from '../utils/audio';
import './ChallengeTable.css';

const ChallengeTable = ({ session }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const challenge = challenges.find(c => c.id === id);
  
  // Game State
  const [deck, setDeck] = useState([]);
  const [heroCards, setHeroCards] = useState([]);
  const [villainCards, setVillainCards] = useState([]);
  const [board, setBoard] = useState([]);
  
  const [phase, setPhase] = useState('preflop'); 
  const [pot, setPot] = useState(0);
  const [heroStack, setHeroStack] = useState(1000);
  const [villainStack, setVillainStack] = useState(1000);
  
  const [heroBet, setHeroBet] = useState(0);
  const [villainBet, setVillainBet] = useState(0);
  const [turn, setTurn] = useState('hero');
  
  const [winPct, setWinPct] = useState(0);
  const [history, setHistory] = useState("");
  
  // Challenge State
  const [stars, setStars] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastFeedback, setLastFeedback] = useState(null);
  const [challengeWon, setChallengeWon] = useState(false);
  const [challengeFailed, setChallengeFailed] = useState(false);
  
  // UI Locks & States
  const [isProcessing, setIsProcessing] = useState(false);
  const [showRaiseOptions, setShowRaiseOptions] = useState(false);
  const [customBet, setCustomBet] = useState(20);
  
  const logEndRef = useRef(null);

  // Synchronization Ref
  const stateRef = useRef({ deck, heroCards, villainCards, board, phase, pot, heroStack, villainStack, heroBet, villainBet, turn });
  useEffect(() => {
    stateRef.current = { deck, heroCards, villainCards, board, phase, pot, heroStack, villainStack, heroBet, villainBet, turn };
  }, [deck, heroCards, villainCards, board, phase, pot, heroStack, villainStack, heroBet, villainBet, turn]);

  // Auto-scroll action log
  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  useEffect(() => {
    if (!challenge) {
      navigate('/');
      return;
    }
    startHand();
    // eslint-disable-next-line
  }, [challenge]);

  const startHand = () => {
    if (heroStack <= 0) {
      setChallengeFailed(true);
      return;
    }
    setShowRaiseOptions(false);
    setIsProcessing(true);
    const newDeck = createDeck();
    const h1 = newDeck.pop();
    const h2 = newDeck.pop();
    const v1 = newDeck.pop();
    const v2 = newDeck.pop();
    
    setHeroCards([h1, h2]);
    setVillainCards([v1, v2]);
    setDeck(newDeck);
    setBoard([]);
    setPhase('preflop');
    
    // Post blinds (Hero SB=10, Villain BB=20)
    let postedHero = Math.min(heroStack, 10);
    let postedVillain = Math.min(villainStack, 20);
    
    setHeroStack(prev => prev - postedHero);
    setVillainStack(prev => prev - postedVillain);
    setHeroBet(postedHero);
    setVillainBet(postedVillain);
    setPot(postedHero + postedVillain);
    setTurn('hero');
    setLastFeedback(null);
    setHistory("--- NEW HAND ---\nBlinds posted (SB $10, BB $20).\n");
    playSound('deal');
    setIsProcessing(false);
  };

  useEffect(() => {
    if (heroCards.length === 2 && phase !== 'showdown') {
      calculateOdds(heroCards, villainCards, board).then(pct => setWinPct(pct));
    }
  }, [heroCards, villainCards, board, phase]);

  const addToHistory = (msg) => setHistory(prev => prev + msg);

  // --- STATE MACHINE LOGIC --- //
  
  const nextPhase = (currentDeck) => {
    const { phase: currentPhase } = stateRef.current;
    setHeroBet(0);
    setVillainBet(0);
    setTurn('villain'); 
    
    if (currentPhase === 'preflop') {
      const b1 = currentDeck.pop();
      const b2 = currentDeck.pop();
      const b3 = currentDeck.pop();
      setDeck([...currentDeck]);
      setBoard([b1, b2, b3]);
      setPhase('flop');
      addToHistory("\n--- FLOP ---\n");
      playSound('deal');
      villainAction();
    } else if (currentPhase === 'flop') {
      const b1 = currentDeck.pop();
      setDeck([...currentDeck]);
      setBoard(prev => [...prev, b1]);
      setPhase('turn');
      addToHistory("\n--- TURN ---\n");
      playSound('deal');
      villainAction();
    } else if (currentPhase === 'turn') {
      const b1 = currentDeck.pop();
      setDeck([...currentDeck]);
      setBoard(prev => [...prev, b1]);
      setPhase('river');
      addToHistory("\n--- RIVER ---\n");
      playSound('deal');
      villainAction();
    } else if (currentPhase === 'river') {
      setPhase('showdown');
      
      const { heroCards: hc, villainCards: vc, board: currentBoard } = stateRef.current;
      const heroSolver = hc.map(toSolverFormat);
      const villainSolver = vc.map(toSolverFormat);
      const boardSolver = currentBoard.map(toSolverFormat);
      
      const heroHandObj = Hand.solve([...heroSolver, ...boardSolver]);
      const villainHandObj = Hand.solve([...villainSolver, ...boardSolver]);
      const winners = Hand.winners([heroHandObj, villainHandObj]);
      
      let resultMsg = "";
      setPot(finalPot => {
         if (winners.length === 2) {
            resultMsg = `Split Pot! Both have ${heroHandObj.name}.`;
            setHeroStack(s => s + (finalPot / 2));
            setVillainStack(s => s + (finalPot / 2));
            playSound('win');
         } else if (winners[0] === heroHandObj) {
            resultMsg = `You win $${finalPot} with ${heroHandObj.name}!`;
            setHeroStack(s => s + finalPot);
            playSound('win');
         } else {
            resultMsg = `Computer wins $${finalPot} with ${villainHandObj.name}.`;
            setVillainStack(s => s + finalPot);
            playSound('fold');
         }
         addToHistory(`\n--- SHOWDOWN ---\n${resultMsg}\n`);
         analyzeChallengeHand(resultMsg);
         return 0;
      });
    }
  };

  const villainAction = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const { pot: currentPot, heroBet: hb, villainBet: vb, phase: currentPhase, villainStack: vs, deck: currentDeck } = stateRef.current;
      const toCall = hb - vb;
      
      let action = 'fold';
      let amount = 0;
      
      if (toCall > 0) {
         if (Math.random() < 0.15) { 
            action = 'fold';
         } else if (Math.random() < 0.35 && vs > toCall + (currentPot * 0.5)) {
            action = 'raise';
            amount = toCall + Math.floor(currentPot * 0.5);
         } else {
            action = 'call';
         }
      } else {
         if (Math.random() < 0.35) {
            action = 'bet';
            amount = Math.floor(currentPot * 0.5);
         } else {
            action = 'check';
         }
      }
      
      if (action === 'fold') {
         playSound('fold');
         addToHistory("Computer Folds.\n");
         endHand("You win!");
      } else if (action === 'raise' || action === 'bet') {
         playSound('bet');
         addToHistory(`Computer ${action === 'raise' ? 'Raises to' : 'Bets'} ${vb + amount}.\n`);
         setVillainStack(prev => prev - amount);
         setVillainBet(prev => prev + amount);
         setPot(prev => prev + amount);
         setTurn('hero');
         setIsProcessing(false);
      } else if (action === 'call') {
         playSound('bet');
         addToHistory(`Computer Calls ${toCall}.\n`);
         setVillainStack(prev => prev - toCall);
         setVillainBet(prev => prev + toCall);
         setPot(prev => prev + toCall);
         nextPhase(currentDeck);
      } else if (action === 'check') {
         playSound('check');
         addToHistory("Computer Checks.\n");
         if (currentPhase === 'preflop') {
            nextPhase(currentDeck);
         } else {
            setTurn('hero');
            setIsProcessing(false);
         }
      }
    }, 1200);
  };

  const handleHeroAction = (action, raiseAmount = 0) => {
    if (turn !== 'hero' || isProcessing) return;
    setIsProcessing(true);
    setShowRaiseOptions(false);
    
    const { heroBet: hb, villainBet: vb, deck: currentDeck, phase: currentPhase } = stateRef.current;
    const toCall = vb - hb;
    
    if (action === 'fold') {
      playSound('fold');
      addToHistory("You Fold.\n");
      endHand("Computer wins.");
    } else if (action === 'call') {
      if (toCall === 0) {
        playSound('check');
        addToHistory("You Check.\n");
        nextPhase(currentDeck); 
      } else {
        playSound('bet');
        addToHistory(`You Call ${toCall}.\n`);
        setHeroStack(prev => prev - toCall);
        setHeroBet(prev => prev + toCall);
        setPot(prev => prev + toCall);
        
        if (currentPhase === 'preflop' && hb === 10 && vb === 20) {
           setTurn('villain');
           villainAction();
        } else {
           nextPhase(currentDeck);
        }
      }
    } else if (action === 'raise') {
      playSound('bet');
      const totalCostToHero = toCall + raiseAmount;
      addToHistory(`You Raise to ${vb + raiseAmount}.\n`);
      setHeroStack(prev => prev - totalCostToHero);
      setHeroBet(prev => prev + totalCostToHero);
      setPot(prev => prev + totalCostToHero);
      setTurn('villain');
      villainAction();
    }
  };

  const endHand = (resultMsg) => {
    setPhase('showdown');
    addToHistory(resultMsg + "\n");
    setIsProcessing(true);
    analyzeChallengeHand();
  };

  const analyzeChallengeHand = async (finalResultMsg = "") => {
    setIsAnalyzing(true);
    let finalHistory = history + finalResultMsg + "\n";
    if (phase === 'river') finalHistory += "Went to showdown.\n";
    
    const heroHandStr = heroCards.map(c => `${c.rank} of ${c.suit}`).join(", ");
    const villainHandStr = villainCards.map(c => `${c.rank} of ${c.suit}`).join(", ");
    const boardStr = board.map(c => `${c.rank} of ${c.suit}`).join(", ");
    
    finalHistory += `\n\n--- CARDS AT END OF HAND ---
    Hero (Player) Hole Cards: ${heroHandStr}
    Villain (Computer) Hole Cards: ${villainHandStr}
    Community Board Cards: ${boardStr || "None"}`;
    
    const result = await gradeChallengeHand(finalHistory, challenge.rubric);
    setLastFeedback(result);
    
    if (result.passed) {
      playSound('win');
      setStars(prev => {
        const newStars = prev + 1;
        if (newStars >= 3) {
          handleChallengeWin();
        }
        return newStars;
      });
    } else {
      playSound('fold');
    }
    
    setIsAnalyzing(false);
  };

  const handleChallengeWin = async () => {
    setChallengeWon(true);
    playSound('win');
    if (session?.user) {
      const { data: currentData } = await supabase
        .from('user_progress')
        .select('completed_lessons')
        .eq('user_id', session.user.id)
        .single();
      
      const currentLessons = currentData?.completed_lessons || [];
      if (!currentLessons.includes(challenge.id)) {
        await supabase
          .from('user_progress')
          .update({ completed_lessons: [...currentLessons, challenge.id] })
          .eq('user_id', session.user.id);
      }
    }
  };

  const toCallUI = villainBet - heroBet;
  const isHeroTurn = turn === 'hero' && !isProcessing && phase !== 'showdown';

  if (!challenge) return null;

  return (
    <div className="challenge-page-container">
      {/* Top Navigation & Status Bar */}
      <div className="challenge-top-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button className="challenge-back-btn" onClick={() => navigate('/')}>
            ← Exit Challenge
          </button>
          <span className="challenge-badge">Boss Challenge</span>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>{challenge.title}</span>
        </div>

        <div className="challenge-stars-row">
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, marginRight: '0.25rem' }}>Mastery:</span>
          {[1, 2, 3].map(s => (
            <span 
              key={s} 
              className={`challenge-star-icon ${stars >= s ? 'active' : 'inactive'}`}
            >
              ⭐
            </span>
          ))}
        </div>
      </div>

      {/* Main Grid: Left = Felt Table & Actions, Right = AI Grader & History */}
      <div className="challenge-body-grid">
        
        {/* Left: Felt Oval Table */}
        <div className="challenge-table-column">
          <div className="challenge-felt-oval">
            
            {/* Top Seat: Computer */}
            <div className="challenge-seat">
              <div className={`challenge-player-badge ${turn === 'villain' && phase !== 'showdown' ? 'active-turn' : ''}`}>
                <span>🤖 AI Computer</span>
                <span className="challenge-chips-val">${villainStack}</span>
                {turn === 'villain' && phase !== 'showdown' && (
                  <span style={{ color: '#f59e0b', fontSize: '0.7rem' }}>Thinking...</span>
                )}
              </div>

              {villainBet > 0 && (
                <div className="challenge-bet-chip">
                  Bet: ${villainBet}
                </div>
              )}

              <div className="challenge-cards-row" style={{ marginTop: '0.4rem' }}>
                {villainCards.map((c, i) => (
                  <div key={i} style={{ transform: 'scale(0.8)', transformOrigin: 'top center' }}>
                    <Card suit={c.suit} rank={c.rank} isFaceUp={phase === 'showdown'} disableFlip={true} />
                  </div>
                ))}
              </div>
            </div>

            {/* Center Area: Pot & Community Board */}
            <div className="challenge-board-center">
              <div className="challenge-pot-pill">
                <span className="challenge-pot-label">Pot</span>
                <span className="challenge-pot-amount">${pot}</span>
              </div>

              <div className="challenge-cards-row">
                {board.length === 0 ? (
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', fontStyle: 'italic' }}>Waiting for flop...</span>
                ) : (
                  board.map((c, i) => (
                    <div key={i} style={{ transform: 'scale(0.85)', transformOrigin: 'center' }}>
                      <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Bottom Seat: Hero */}
            <div className="challenge-seat">
              <div className="challenge-cards-row" style={{ marginBottom: '0.35rem', position: 'relative' }}>
                {phase !== 'showdown' && (
                  <div className="challenge-win-tag">
                    <span style={{ color: '#94a3b8', fontSize: '0.65rem', display: 'block' }}>EQUITY</span>
                    <strong style={{ color: winPct > 50 ? '#34d399' : '#fff' }}>{winPct}%</strong>
                  </div>
                )}
                {heroCards.map((c, i) => (
                  <div key={i} style={{ transform: 'scale(0.85)', transformOrigin: 'bottom center' }}>
                    <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
                  </div>
                ))}
              </div>

              {heroBet > 0 && (
                <div className="challenge-bet-chip" style={{ marginBottom: '0.25rem' }}>
                  Bet: ${heroBet}
                </div>
              )}

              <div className={`challenge-player-badge ${turn === 'hero' && phase !== 'showdown' ? 'active-turn' : ''}`}>
                <span>👤 You</span>
                <span className="challenge-chips-val">${heroStack}</span>
              </div>
            </div>

          </div>

          {/* Action Toolbar */}
          <div className="challenge-action-toolbar">
            {phase !== 'showdown' ? (
              <>
                {showRaiseOptions && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
                    <div className="challenge-quick-bets">
                      <button onClick={() => handleHeroAction('raise', 20)} disabled={!isHeroTurn}>Min ($20)</button>
                      <button onClick={() => handleHeroAction('raise', Math.max(20, Math.floor(pot * 0.5)))} disabled={!isHeroTurn}>1/2 Pot (${Math.max(20, Math.floor(pot * 0.5))})</button>
                      <button onClick={() => handleHeroAction('raise', Math.max(20, pot))} disabled={!isHeroTurn}>Pot (${Math.max(20, pot)})</button>
                      <button onClick={() => handleHeroAction('raise', heroStack)} disabled={!isHeroTurn} style={{ color: '#f87171' }}>All-In (${heroStack})</button>
                    </div>

                    <div className="challenge-slider-row">
                      <input 
                        type="range" 
                        min={20} 
                        max={heroStack} 
                        value={customBet} 
                        onChange={(e) => setCustomBet(Number(e.target.value))}
                      />
                      <span style={{ color: '#fbbf24', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '0.85rem' }}>
                        ${customBet}
                      </span>
                      <button 
                        className="challenge-btn raise" 
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                        onClick={() => handleHeroAction('raise', customBet)} 
                        disabled={!isHeroTurn}
                      >
                        Confirm Bet
                      </button>
                    </div>
                  </div>
                )}

                <div className="challenge-buttons-row">
                  <button 
                    className="challenge-btn fold" 
                    onClick={() => handleHeroAction('fold')} 
                    disabled={!isHeroTurn}
                  >
                    Fold
                  </button>
                  <button 
                    className="challenge-btn check-call" 
                    onClick={() => handleHeroAction('call')} 
                    disabled={!isHeroTurn}
                  >
                    {toCallUI > 0 ? `Call $${toCallUI}` : 'Check'}
                  </button>
                  <button 
                    className="challenge-btn raise" 
                    onClick={() => setShowRaiseOptions(prev => !prev)} 
                    disabled={!isHeroTurn}
                  >
                    {showRaiseOptions ? 'Cancel' : (toCallUI > 0 ? 'Raise...' : 'Bet...')}
                  </button>
                </div>
              </>
            ) : (
              !challengeWon && !challengeFailed && (
                <button 
                  className="challenge-next-btn" 
                  onClick={startHand} 
                  disabled={isAnalyzing}
                >
                  {isAnalyzing ? "⏳ Grading Play..." : "Deal Next Hand ➔"}
                </button>
              )
            )}
          </div>

        </div>

        {/* Right: AI Coach & Action History */}
        <div className="challenge-coach-column">
          <div className="coach-header">
            <span className="coach-title">🧠 AI Coach Analysis</span>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Real-time GTO</span>
          </div>

          <div className="challenge-desc-card">
            <strong style={{ color: '#f1f5f9', display: 'block', marginBottom: '0.2rem' }}>Challenge Objective:</strong>
            {challenge.description}
          </div>

          <div className="feedback-area">
            {isAnalyzing ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
                <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>⏳</div>
                Evaluating your betting line against solver rubric...
              </div>
            ) : lastFeedback ? (
              <div className={`feedback-card ${lastFeedback.passed ? 'pass' : 'fail'}`}>
                <div className="feedback-badge">
                  <span>{lastFeedback.passed ? '✅ Passed Hand' : '❌ Needs Improvement'}</span>
                </div>
                <div>{lastFeedback.feedback}</div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b', fontSize: '0.8rem', fontStyle: 'italic' }}>
                Make your plays at the table. At the end of each hand, the AI coach will analyze whether your decision satisfies the challenge rubric.
              </div>
            )}
          </div>

          {/* Action Log Box */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Hand Action Log</span>
          </div>
          <div className="challenge-history-box">
            {history.split('\n').map((line, i) => (
              line && (
                <div 
                  key={i} 
                  className={line.startsWith('---') ? 'header-line' : ''}
                >
                  {line}
                </div>
              )
            ))}
            <div ref={logEndRef} />
          </div>
        </div>

      </div>

      {/* Victory Modal */}
      {challengeWon && (
        <div className="challenge-modal-backdrop">
          <div className="challenge-modal-card win">
            <div className="challenge-modal-icon">🏆</div>
            <h2 style={{ color: '#10b981' }}>Challenge Conquered!</h2>
            <p>You earned all 3 stars and proved complete mastery of <strong>{challenge.title}</strong>.</p>
            <button className="challenge-next-btn" onClick={() => navigate('/')}>
              Return to Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Failure Modal */}
      {challengeFailed && (
        <div className="challenge-modal-backdrop">
          <div className="challenge-modal-card fail">
            <div className="challenge-modal-icon">💔</div>
            <h2 style={{ color: '#ef4444' }}>Challenge Failed</h2>
            <p>You lost your stack before reaching 3 stars. Review the strategy guidelines and try again!</p>
            <button 
              className="challenge-next-btn" 
              style={{ background: '#3b82f6', marginBottom: '0.5rem' }}
              onClick={() => {
                setChallengeFailed(false);
                setStars(0);
                setHeroStack(1000);
                setVillainStack(1000);
                startHand();
              }}
            >
              Retry Challenge
            </button>
            <br />
            <button className="challenge-back-btn" onClick={() => navigate('/')}>
              Return to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChallengeTable;
