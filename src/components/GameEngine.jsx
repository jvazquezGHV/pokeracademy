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

  // Calculate Odds Live
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
         if (Math.random() < 0.15) { // Fold less often to keep the game fun
            action = 'fold';
         } else if (Math.random() < 0.25 && vs > toCall + (currentPot * 0.5)) {
            action = 'raise';
            amount = toCall + Math.floor(currentPot * 0.5); // Raise 1/2 pot
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
    <div className="container sandbox-container" style={{ maxWidth: '1400px', marginTop: '1rem' }}>
      
      {/* LEFT COL: Action Log */}
      <div className="sandbox-col-left" style={{ flex: '0 0 300px', minHeight: 0, backgroundColor: 'var(--surface-color)', padding: '1.5rem', borderRadius: '1.5rem', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ margin: '0 0 1rem 0', color: 'var(--accent-color)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>📜 Action Log</h3>
        <div style={{ flex: 1, overflowY: 'auto', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontFamily: 'monospace' }}>
          {history.split('\n').map((line, i) => (
            line && <div key={i} style={{ padding: line.startsWith('---') ? '10px 0' : '0', color: line.startsWith('---') ? 'var(--accent-color)' : 'inherit', fontWeight: line.startsWith('---') ? 'bold' : 'normal' }}>{line}</div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* CENTER COL: Game Table */}
      <div className="sandbox-col-center" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <button onClick={() => navigate('/')} style={{ alignSelf: 'flex-start', background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          ← Exit Sandbox
        </button>

        <div className="sandbox-table" style={{ 
          width: '100%', maxWidth: '900px', flex: 1, minHeight: 0,
          background: 'radial-gradient(circle at center, #166534 0%, #064e3b 100%)', 
          borderRadius: '250px', 
          border: '15px solid #291a10', 
          boxShadow: 'inset 0 0 60px rgba(0,0,0,0.8), 0 20px 50px rgba(0,0,0,0.5)', 
          position: 'relative', 
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between', 
          padding: '1.5rem 2rem' 
        }}>
          
          {/* Top / Villain */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
             {/* Dealer Tray Graphic */}
             <div style={{ width: '100px', height: '20px', background: 'linear-gradient(to right, #666, #aaa, #666)', borderRadius: '10px', marginBottom: '1rem', boxShadow: '0 5px 15px rgba(0,0,0,0.5)', border: '1px solid #444' }}></div>
             
             <div style={{ display: 'flex', gap: '10px', height: '119px' }}>
               {villainCards.map((c, i) => (
                 <div key={i} style={{ transform: 'scale(0.85)', transformOrigin: 'top center' }}>
                   <Card suit={c.suit} rank={c.rank} isFaceUp={phase === 'showdown'} disableFlip={true} />
                 </div>
               ))}
             </div>
             
             <div style={{ backgroundColor: 'rgba(0,0,0,0.8)', padding: '0.5rem 1.5rem', borderRadius: '1.5rem', marginTop: '-1.5rem', zIndex: 2, border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1rem' }}>AI Computer</p>
                <div style={{ height: '20px', width: '1px', backgroundColor: 'rgba(255,255,255,0.2)' }}></div>
                <p style={{ margin: 0, color: '#eab308', fontWeight: 'bold' }}>${villainStack}</p>
                {villainBet > 0 && <span style={{ color: '#aaa', fontSize: '0.9rem' }}>Bet: ${villainBet}</span>}
             </div>
             {turn === 'villain' && phase !== 'showdown' && (
                <div style={{ position: 'absolute', top: '18%', color: 'var(--accent-color)', fontWeight: 'bold', animation: 'pulse 1.5s infinite', backgroundColor: 'rgba(0,0,0,0.5)', padding: '0.2rem 1rem', borderRadius: '1rem' }}>Thinking...</div>
             )}
          </div>

          {/* Center / Board Area */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
             <div style={{ backgroundColor: 'rgba(0,0,0,0.6)', padding: '0.5rem 2rem', borderRadius: '2rem', border: '2px solid #eab308', marginBottom: '1.5rem', boxShadow: '0 10px 20px rgba(0,0,0,0.3)' }}>
                <p style={{ margin: 0, color: '#aaa', fontSize: '0.8rem', textTransform: 'uppercase', textAlign: 'center', letterSpacing: '2px' }}>Main Pot</p>
                <h2 style={{ margin: 0, color: '#eab308', fontSize: '2rem', textShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>${pot}</h2>
             </div>
             <div style={{ display: 'flex', gap: '8px', height: '119px' }}>
                {board.map((c, i) => (
                  <div key={i} style={{ transform: 'scale(0.85)', transformOrigin: 'center center' }}>
                     <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
                  </div>
                ))}
                {[...Array(5 - board.length)].map((_, i) => (
                   <div key={`empty-${i}`} style={{ width: '85px', height: '119px', border: '2px dashed rgba(255,255,255,0.2)', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.1)' }}></div>
                ))}
             </div>
          </div>

          {/* Bottom / Hero Area */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
             
             {/* Left Absolute: Win Pct */}
             {phase !== 'showdown' && (
               <div className="sandbox-stats-left" style={{ backgroundColor: 'rgba(0,0,0,0.8)', padding: '1rem 1.5rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
                 <p style={{ margin: 0, color: '#aaa', fontSize: '0.8rem', textTransform: 'uppercase' }}>Win Prob</p>
                 <h2 style={{ margin: '5px 0 0 0', color: winPct > 50 ? '#4ade80' : 'white', fontSize: '1.8rem' }}>{winPct}%</h2>
               </div>
             )}

             <div style={{ backgroundColor: 'rgba(0,0,0,0.8)', padding: '0.5rem 1.5rem', borderRadius: '1.5rem', marginBottom: '-1.5rem', zIndex: 2, border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1rem' }}>You</p>
                <div style={{ height: '20px', width: '1px', backgroundColor: 'rgba(255,255,255,0.2)' }}></div>
                <p style={{ margin: 0, color: '#eab308', fontWeight: 'bold' }}>${heroStack}</p>
                {heroBet > 0 && <span style={{ color: '#aaa', fontSize: '0.9rem' }}>Bet: ${heroBet}</span>}
             </div>

             <div style={{ display: 'flex', gap: '10px', height: '119px' }}>
               {heroCards.map((c, i) => (
                 <div key={i} style={{ transform: 'scale(0.85)', transformOrigin: 'bottom center' }}>
                   <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
                 </div>
               ))}
             </div>
             
             {/* Right Absolute: Action Buttons */}
             <div className="sandbox-actions-right" style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '120px' }}>
                {phase !== 'showdown' ? (
                  <>
                    {showRaiseOptions ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: 'rgba(0,0,0,0.8)', padding: '1rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <button className="btn-primary" onClick={() => handleHeroAction('raise', 20)} disabled={!isHeroTurn}>Min</button>
                        <button className="btn-primary" onClick={() => handleHeroAction('raise', Math.floor(pot * 0.5))} disabled={!isHeroTurn}>1/2 Pot</button>
                        <button className="btn-primary" onClick={() => handleHeroAction('raise', pot)} disabled={!isHeroTurn}>Pot</button>
                        <button className="btn-primary" onClick={() => handleHeroAction('raise', heroStack)} disabled={!isHeroTurn} style={{ backgroundColor: 'var(--danger-color)' }}>All-In</button>
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
                  <button className="btn-primary sandbox-next-hand-btn" onClick={startHand} style={{ padding: '1rem 2rem', fontSize: '1.2rem', boxShadow: '0 0 20px var(--accent-color)', whiteSpace: 'nowrap' }}>Play Next Hand</button>
                )}
             </div>

          </div>
        </div>
      </div>

      {/* RIGHT COL: AI Coach */}
      <div className="sandbox-col-right" style={{ flex: '0 0 350px', minHeight: 0, backgroundColor: 'var(--surface-color)', padding: '1.5rem', borderRadius: '1.5rem', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column' }}>
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
  );
};

export default GameEngine;
