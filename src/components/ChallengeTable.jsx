import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import Card from './Card';
import { createDeck, calculateOdds, toSolverFormat } from '../utils/pokerLogic';
import { gradeChallengeHand } from '../api/gradeChallengeHand';
import challenges from '../data/challenges.json';
import { Hand } from 'pokersolver';

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
  const [isLogOpen, setIsLogOpen] = useState(false);
  
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
    setHeroCards([newDeck.pop(), newDeck.pop()]);
    setVillainCards([newDeck.pop(), newDeck.pop()]);
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
    setHistory("--- NEW HAND ---\nBlinds posted.\n");
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
      villainAction();
    } else if (currentPhase === 'flop') {
      const b1 = currentDeck.pop();
      setDeck([...currentDeck]);
      setBoard(prev => [...prev, b1]);
      setPhase('turn');
      addToHistory("\n--- TURN ---\n");
      villainAction();
    } else if (currentPhase === 'turn') {
      const b1 = currentDeck.pop();
      setDeck([...currentDeck]);
      setBoard(prev => [...prev, b1]);
      setPhase('river');
      addToHistory("\n--- RIVER ---\n");
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
         } else if (winners[0] === heroHandObj) {
            resultMsg = `You win $${finalPot} with ${heroHandObj.name}!`;
            setHeroStack(s => s + finalPot);
         } else {
            resultMsg = `Computer wins $${finalPot} with ${villainHandObj.name}.`;
            setVillainStack(s => s + finalPot);
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
         addToHistory("Computer Folds.\n");
         endHand("You win!");
      } else if (action === 'raise' || action === 'bet') {
         addToHistory(`Computer ${action === 'raise' ? 'Raises to' : 'Bets'} ${vb + amount}.\n`);
         setVillainStack(prev => prev - amount);
         setVillainBet(prev => prev + amount);
         setPot(prev => prev + amount);
         setTurn('hero');
         setIsProcessing(false);
      } else if (action === 'call') {
         addToHistory(`Computer Calls ${toCall}.\n`);
         setVillainStack(prev => prev - toCall);
         setVillainBet(prev => prev + toCall);
         setPot(prev => prev + toCall);
         nextPhase(currentDeck);
      } else if (action === 'check') {
         addToHistory("Computer Checks.\n");
         if (currentPhase === 'preflop') {
            nextPhase(currentDeck);
         } else {
            setTurn('hero');
            setIsProcessing(false);
         }
      }
    }, 1500);
  };

  const handleHeroAction = (action, raiseAmount = 0) => {
    if (turn !== 'hero' || isProcessing) return;
    setIsProcessing(true);
    setShowRaiseOptions(false);
    
    const { heroBet: hb, villainBet: vb, deck: currentDeck, phase: currentPhase } = stateRef.current;
    const toCall = vb - hb;
    
    if (action === 'fold') {
      addToHistory("You Fold.\n");
      endHand("Computer wins.");
    } else if (action === 'call') {
      if (toCall === 0) {
        addToHistory("You Check.\n");
        nextPhase(currentDeck); 
      } else {
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
      setStars(prev => {
        const newStars = prev + 1;
        if (newStars >= 3) {
          handleChallengeWin();
        }
        return newStars;
      });
    }
    
    setIsAnalyzing(false);
  };

  const handleChallengeWin = async () => {
    setChallengeWon(true);
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
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', overflow: 'hidden' }}>
      
      <div className="mobile-log-toggle" onClick={() => setIsLogOpen(true)}>📜</div>

      <div className={`mobile-log-panel ${isLogOpen ? 'open' : ''}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
          <h3 style={{ margin: 0, color: 'var(--accent-color)' }}>📜 Action Log</h3>
          <button onClick={() => setIsLogOpen(false)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontFamily: 'monospace' }}>
          {history.split('\n').map((line, i) => (
            line && <div key={i} style={{ padding: line.startsWith('---') ? '10px 0' : '0', color: line.startsWith('---') ? 'var(--accent-color)' : 'inherit', fontWeight: line.startsWith('---') ? 'bold' : 'normal' }}>{line}</div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>

      <div style={{ padding: '1rem' }}>
        <button onClick={() => navigate('/')} style={{ background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>
          ← Exit Challenge
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
        
        {/* CENTER COL: Game Table */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="poker-table-oval">
            
            {/* Top / Villain */}
            <div className="seat-container seat-top">
               <div style={{ backgroundColor: 'rgba(0,0,0,0.8)', padding: '0.2rem 1rem', borderRadius: '1rem', marginBottom: '10px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <p style={{ margin: 0, fontWeight: 'bold', fontSize: '0.9rem' }}>AI Computer</p>
                  <p style={{ margin: 0, color: '#eab308', fontWeight: 'bold' }}>${villainStack}</p>
               </div>
               
               <div className="sandbox-villain-wrapper" style={{ display: 'flex', gap: '5px' }}>
                 {villainCards.map((c, i) => (
                   <div key={i}>
                     <Card suit={c.suit} rank={c.rank} isFaceUp={phase === 'showdown'} disableFlip={true} />
                   </div>
                 ))}
               </div>
               
               {turn === 'villain' && phase !== 'showdown' && (
                  <div style={{ position: 'absolute', top: '-30px', color: 'var(--accent-color)', fontWeight: 'bold', animation: 'pulse 1.5s infinite', backgroundColor: 'rgba(0,0,0,0.5)', padding: '0.2rem 1rem', borderRadius: '1rem', whiteSpace: 'nowrap' }}>Thinking...</div>
               )}
               {villainBet > 0 && (
                  <div style={{ marginTop: '10px', backgroundColor: 'rgba(0,0,0,0.6)', padding: '0.2rem 1rem', borderRadius: '1rem', border: '1px solid #eab308' }}>
                     <span style={{ color: '#aaa', fontSize: '0.8rem' }}>Bet: </span><span style={{ color: '#eab308', fontWeight: 'bold' }}>${villainBet}</span>
                  </div>
               )}
            </div>

            {/* Center / Board Area */}
            <div className="table-center-area">
               <div style={{ backgroundColor: 'rgba(0,0,0,0.6)', padding: '0.5rem 2rem', borderRadius: '2rem', border: '2px solid #eab308', marginBottom: '1rem', boxShadow: '0 10px 20px rgba(0,0,0,0.3)' }}>
                  <p style={{ margin: 0, color: '#aaa', fontSize: '0.8rem', textTransform: 'uppercase', textAlign: 'center', letterSpacing: '2px' }}>Main Pot</p>
                  <h2 style={{ margin: 0, color: '#eab308', fontSize: '1.5rem', textShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>${pot}</h2>
               </div>
               <div className="sandbox-board-wrapper" style={{ display: 'flex', gap: '8px' }}>
                  {board.map((c, i) => (
                    <div key={i}>
                       <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
                    </div>
                  ))}
                  {[...Array(5 - board.length)].map((_, i) => (
                     <div key={`empty-${i}`} style={{ width: '140px', height: '200px', margin: '10px', border: '4px dashed rgba(255,255,255,0.2)', borderRadius: '12px', backgroundColor: 'rgba(0,0,0,0.1)' }}></div>
                  ))}
               </div>
            </div>

            {/* Bottom / Hero Area */}
            <div className="seat-container seat-bottom">
               
               {/* Win Pct (Absolute above hero cards) */}
               {phase !== 'showdown' && (
                 <div style={{ position: 'absolute', top: '-40px', left: '-80px', backgroundColor: 'rgba(0,0,0,0.8)', padding: '0.5rem 1rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
                   <p style={{ margin: 0, color: '#aaa', fontSize: '0.7rem', textTransform: 'uppercase' }}>Win Prob</p>
                   <h2 style={{ margin: '0', color: winPct > 50 ? '#4ade80' : 'white', fontSize: '1.2rem' }}>{winPct}%</h2>
                 </div>
               )}

               {heroBet > 0 && (
                  <div style={{ marginBottom: '10px', backgroundColor: 'rgba(0,0,0,0.6)', padding: '0.2rem 1rem', borderRadius: '1rem', border: '1px solid #eab308' }}>
                     <span style={{ color: '#aaa', fontSize: '0.8rem' }}>Bet: </span><span style={{ color: '#eab308', fontWeight: 'bold' }}>${heroBet}</span>
                  </div>
               )}

               <div className="sandbox-hero-wrapper" style={{ display: 'flex', gap: '5px' }}>
                 {heroCards.map((c, i) => (
                   <div key={i}>
                     <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
                   </div>
                 ))}
               </div>
               
               <div style={{ backgroundColor: 'rgba(0,0,0,0.8)', padding: '0.2rem 1rem', borderRadius: '1.5rem', marginTop: '10px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <p style={{ margin: 0, fontWeight: 'bold', fontSize: '0.9rem' }}>You</p>
                  <p style={{ margin: 0, color: '#eab308', fontWeight: 'bold' }}>${heroStack}</p>
               </div>
            </div>
          </div>
        </div>

        {/* Action Buttons (Fixed Bottom Right) */}
        <div className="action-bar-bottom">
                {phase !== 'showdown' ? (
                  <>
                    {showRaiseOptions ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: 'rgba(0,0,0,0.8)', padding: '1rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <button className="btn-primary" style={{ flex: 1, padding: '0.5rem' }} onClick={() => handleHeroAction('raise', 20)} disabled={!isHeroTurn}>Min</button>
                          <button className="btn-primary" style={{ flex: 1, padding: '0.5rem' }} onClick={() => handleHeroAction('raise', Math.floor(pot * 0.5))} disabled={!isHeroTurn}>1/2 Pot</button>
                          <button className="btn-primary" style={{ flex: 1, padding: '0.5rem' }} onClick={() => handleHeroAction('raise', pot)} disabled={!isHeroTurn}>Pot</button>
                          <button className="btn-primary" style={{ flex: 1, padding: '0.5rem', backgroundColor: 'var(--danger-color)' }} onClick={() => handleHeroAction('raise', heroStack)} disabled={!isHeroTurn}>All-In</button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
                          <input 
                            type="range" 
                            min={20} 
                            max={heroStack} 
                            value={customBet} 
                            onChange={(e) => setCustomBet(Number(e.target.value))}
                            style={{ flex: 1, cursor: 'pointer' }}
                          />
                          <span style={{ color: 'white', minWidth: '40px', fontWeight: 'bold' }}>${customBet}</span>
                        </div>
                        <button className="btn-primary" onClick={() => handleHeroAction('raise', customBet)} disabled={!isHeroTurn} style={{ backgroundColor: 'var(--accent-color)', marginTop: '5px' }}>Bet ${customBet}</button>
                        <button className="btn-secondary" onClick={() => setShowRaiseOptions(false)} style={{ marginTop: '5px' }}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <button className="btn-primary" onClick={() => handleHeroAction('fold')} disabled={!isHeroTurn} style={{ backgroundColor: 'var(--danger-color)', opacity: !isHeroTurn ? 0.3 : 1, transition: 'opacity 0.2s' }}>Fold</button>
                        <button className="btn-primary" onClick={() => handleHeroAction('call')} disabled={!isHeroTurn} style={{ opacity: !isHeroTurn ? 0.3 : 1, transition: 'opacity 0.2s' }}>
                          {toCallUI > 0 ? `Call ${toCallUI}` : 'Check'}
                        </button>
                        <button className="btn-primary" onClick={() => setShowRaiseOptions(true)} disabled={!isHeroTurn} style={{ backgroundColor: 'var(--accent-color)', opacity: !isHeroTurn ? 0.3 : 1, transition: 'opacity 0.2s' }}>
                          {toCallUI > 0 ? 'Raise' : 'Bet'}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  !challengeWon && !challengeFailed && (
                    <button className="btn-primary sandbox-next-hand-btn" onClick={startHand} disabled={isAnalyzing} style={{ padding: '1rem 2rem', fontSize: '1.2rem', boxShadow: '0 0 20px var(--accent-color)', whiteSpace: 'nowrap' }}>
                      {isAnalyzing ? "Grading..." : "Play Next Hand"}
                    </button>
                  )
                )}
        </div>

        {/* RIGHT COL: AI Grader */}
        <div style={{ flex: '0 0 350px', backgroundColor: 'var(--surface-color)', padding: '1rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', margin: '0 1rem 1rem 0' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent-color)' }}>{challenge.title}</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>{challenge.description}</p>
          
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '2rem' }}>
            {[1, 2, 3].map(s => (
               <div key={s} style={{ fontSize: '2.5rem', filter: stars >= s ? 'none' : 'grayscale(100%) opacity(0.3)' }}>⭐</div>
            ))}
          </div>

          <h4 style={{ margin: '0 0 1rem 0', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>Feedback</h4>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {isAnalyzing ? (
              <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '2rem' }}>
                 <div style={{ fontSize: '2rem', marginBottom: '1rem', animation: 'spin 2s linear infinite' }}>⏳</div>
                 Grading your play...
              </div>
            ) : lastFeedback ? (
              <div style={{ 
                 padding: '1rem', 
                 borderRadius: '0.5rem', 
                 backgroundColor: lastFeedback.passed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                 border: lastFeedback.passed ? '1px solid #10b981' : '1px solid #ef4444'
              }}>
                 <h3 style={{ margin: '0 0 0.5rem 0', color: lastFeedback.passed ? '#10b981' : '#ef4444' }}>
                   {lastFeedback.passed ? "Pass!" : "Fail"}
                 </h3>
                 <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: '1.5' }}>{lastFeedback.feedback}</p>
              </div>
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', marginTop: '2rem', opacity: 0.5 }}>
                 Play a hand to receive a grade from the AI Coach.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Victory / Failure Modals */}
      {challengeWon && (
         <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ backgroundColor: 'var(--surface-color)', padding: '3rem', borderRadius: '2rem', textAlign: 'center', border: '2px solid #10b981', maxWidth: '500px' }}>
               <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🏆</div>
               <h2 style={{ color: '#10b981', fontSize: '2rem', marginBottom: '1rem' }}>Challenge Complete!</h2>
               <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '1.1rem' }}>You earned 3 stars and proved your mastery of {challenge.title}.</p>
               <button className="btn-primary" onClick={() => navigate('/')} style={{ padding: '1rem 2rem', fontSize: '1.2rem' }}>Return to Dashboard</button>
            </div>
         </div>
      )}

      {challengeFailed && (
         <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ backgroundColor: 'var(--surface-color)', padding: '3rem', borderRadius: '2rem', textAlign: 'center', border: '2px solid #ef4444', maxWidth: '500px' }}>
               <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>💔</div>
               <h2 style={{ color: '#ef4444', fontSize: '2rem', marginBottom: '1rem' }}>Challenge Failed</h2>
               <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '1.1rem' }}>You lost all your chips before earning 3 stars. Review the lesson and try again!</p>
               <button className="btn-primary" onClick={() => { setChallengeFailed(false); setStars(0); setHeroStack(1000); setVillainStack(1000); startHand(); }} style={{ padding: '1rem 2rem', fontSize: '1.2rem', marginBottom: '1rem' }}>Retry Challenge</button>
               <br />
               <button className="btn-secondary" onClick={() => navigate('/')}>Return to Dashboard</button>
            </div>
         </div>
      )}
    </div>
  );
};

export default ChallengeTable;
