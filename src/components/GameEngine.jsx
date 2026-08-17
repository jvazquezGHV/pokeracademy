import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from './Card';
import { createDeck, calculateOdds, toSolverFormat } from '../utils/pokerLogic';
import { getAIFeedback } from '../api/getAIFeedback';
import { supabase } from '../lib/supabaseClient';
import { Hand } from 'pokersolver';

const GameEngine = () => {
  const navigate = useNavigate();
  
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
  const [aiFeedback, setAiFeedback] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // UI Locks & States
  const [isProcessing, setIsProcessing] = useState(false);
  const [showRaiseOptions, setShowRaiseOptions] = useState(false);
  const [customBet, setCustomBet] = useState(20);
  const [isLogOpen, setIsLogOpen] = useState(false);
  
  const logEndRef = useRef(null);

  // Synchronization Ref: Allows timeouts to access the freshest state without stale closures
  const stateRef = useRef({ deck, heroCards, villainCards, board, phase, pot, heroStack, villainStack, heroBet, villainBet, turn });
  useEffect(() => {
    stateRef.current = { deck, heroCards, villainCards, board, phase, pot, heroStack, villainStack, heroBet, villainBet, turn };
  }, [deck, heroCards, villainCards, board, phase, pot, heroStack, villainStack, heroBet, villainBet, turn]);

  // Auto-scroll action log
  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // Initialize Hand
  const startHand = () => {
    setShowRaiseOptions(false);
    setIsProcessing(true); // lock while dealing
    const newDeck = createDeck();
    setHeroCards([newDeck.pop(), newDeck.pop()]);
    setVillainCards([newDeck.pop(), newDeck.pop()]);
    setDeck(newDeck);
    setBoard([]);
    setPhase('preflop');
    
    // Post blinds (Hero SB=10, Villain BB=20)
    setHeroStack(1000 - 10);
    setVillainStack(1000 - 20);
    setHeroBet(10);
    setVillainBet(20);
    setPot(30);
    setTurn('hero');
    setAiFeedback(null);
    setHistory("--- NEW HAND ---\nBlinds posted (SB: 10, BB: 20).\n");
    setIsProcessing(false); // unlock for Hero
  };

  useEffect(() => {
    startHand();
    // eslint-disable-next-line
  }, []);

  // Calculate Odds Live (Against random opponent hand)
  useEffect(() => {
    if (heroCards.length === 2 && phase !== 'showdown') {
      calculateOdds(heroCards, [], board).then(pct => setWinPct(pct));
    }
  }, [heroCards, board, phase]);

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
         analyzeHand(resultMsg);
         return 0; // Clear the pot
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
         if (Math.random() < 0.50) { // Fold much more often to play realistically
            action = 'fold';
         } else if (Math.random() < 0.25 && vs > toCall + (currentPot * 0.5)) {
            action = 'raise';
            amount = toCall + Math.floor(currentPot * 0.5); // Raise 1/2 pot
         } else {
            action = 'call';
         }
      } else {
         if (Math.random() < 0.20) { // Bet less often when checked to
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
         // Round closed!
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
    }, 1500); // 1.5s artificial delay so user can read what's happening
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
    setIsProcessing(true); // Lock until next hand is requested manually
    analyzeHand();
  };

  const analyzeHand = async (finalResultMsg = "") => {
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
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const won = finalResultMsg.includes("You win");
        await supabase.from('hand_histories').insert([{
          user_id: session.user.id,
          game_mode: 'AI Sandbox',
          history_json: { historyStr: finalHistory, heroCards, villainCards, board },
          won: won,
          profit_loss: 0
        }]);
      }
    } catch (error) {
      console.error("Error saving hand history:", error);
    }
    
    const feedback = await getAIFeedback(finalHistory);
    setAiFeedback(feedback);
    setIsAnalyzing(false);
  };

  // Derived variables for UI
  const toCallUI = villainBet - heroBet;
  const isHeroTurn = turn === 'hero' && !isProcessing && phase !== 'showdown';

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
          ← Exit Sandbox
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflowY: 'auto' }}>
        
        {/* TOP ROW: Game Table */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
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
                  <div style={{ position: 'absolute', bottom: '-25px', left: '50%', transform: 'translateX(-50%) scale(0.8)', backgroundColor: 'rgba(0,0,0,0.8)', padding: '0.2rem 1rem', borderRadius: '1rem', border: '1px solid #eab308', whiteSpace: 'nowrap' }}>
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
               </div>
            </div>

            {/* Bottom / Hero Area */}
            <div className="seat-container seat-bottom">
               
               {/* Win Pct (Absolute above hero cards) */}
               {phase !== 'showdown' && (
                 <div style={{ position: 'absolute', top: '-10px', right: '-60px', backgroundColor: 'rgba(0,0,0,0.9)', padding: '0.4rem 0.8rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', transform: 'scale(0.8)' }}>
                   <p style={{ margin: 0, color: '#aaa', fontSize: '0.7rem', textTransform: 'uppercase' }}>Win</p>
                   <h2 style={{ margin: '0', color: winPct > 50 ? '#4ade80' : 'white', fontSize: '1rem' }}>{winPct}%</h2>
                 </div>
               )}

               {heroBet > 0 && (
                  <div style={{ position: 'absolute', top: '-25px', left: '50%', transform: 'translateX(-50%) scale(0.8)', backgroundColor: 'rgba(0,0,0,0.8)', padding: '0.2rem 1rem', borderRadius: '1rem', border: '1px solid #eab308', whiteSpace: 'nowrap' }}>
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
                      <div style={{ display: 'flex', flexDirection: 'row', gap: '10px', width: '100%', maxWidth: '400px', margin: '0 auto' }}>
                        <button className="btn-primary" onClick={() => handleHeroAction('fold')} disabled={!isHeroTurn} style={{ flex: 1, padding: '0.8rem 0.5rem', backgroundColor: 'var(--danger-color)', opacity: !isHeroTurn ? 0.3 : 1, transition: 'opacity 0.2s' }}>Fold</button>
                        <button className="btn-primary" onClick={() => handleHeroAction('call')} disabled={!isHeroTurn} style={{ flex: 1, padding: '0.8rem 0.5rem', opacity: !isHeroTurn ? 0.3 : 1, transition: 'opacity 0.2s' }}>
                          {toCallUI > 0 ? `Call ${toCallUI}` : 'Check'}
                        </button>
                        <button className="btn-primary" onClick={() => setShowRaiseOptions(true)} disabled={!isHeroTurn} style={{ flex: 1, padding: '0.8rem 0.5rem', backgroundColor: 'var(--accent-color)', opacity: !isHeroTurn ? 0.3 : 1, transition: 'opacity 0.2s' }}>
                          {toCallUI > 0 ? 'Raise' : 'Bet'}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <button className="btn-primary sandbox-next-hand-btn" onClick={startHand} style={{ padding: '1rem 2rem', fontSize: '1.2rem', boxShadow: '0 0 20px var(--accent-color)', whiteSpace: 'nowrap' }}>Play Next Hand</button>
                )}
             </div>

        {/* BOTTOM ROW: AI Coach */}
        <div style={{ backgroundColor: 'var(--surface-color)', padding: '1rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', margin: '1rem', minHeight: '250px', flex: 'none' }}>
        <h3 style={{ margin: '0 0 1rem 0', color: 'var(--accent-color)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          🤖 AI Coach
        </h3>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {isAnalyzing ? (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '2rem' }}>
               <div style={{ fontSize: '2rem', marginBottom: '1rem', animation: 'spin 2s linear infinite' }}>⏳</div>
               Gemini is analyzing your strategy...
            </div>
          ) : aiFeedback ? (
            <div style={{ fontSize: '1.05rem', lineHeight: '1.6', color: 'var(--text-primary)' }}>{aiFeedback}</div>
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', marginTop: '4rem', opacity: 0.5 }}>
               Play a hand to Showdown to receive personalized feedback from the Gemini API on your strategy!
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default GameEngine;
