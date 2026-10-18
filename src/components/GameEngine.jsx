import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from './Card';
import ChipStack from './ChipStack';
import { createDeck, calculateOdds, toSolverFormat } from '../utils/pokerLogic';
import { getAIFeedback } from '../api/getAIFeedback';
import { supabase } from '../lib/supabaseClient';
import { Hand } from 'pokersolver';
import { preloadAudio, playSound } from '../utils/audio';
import './GameEngine.css';

const FlyingChips = ({ seatClass, amount }) => {
  const [active, setActive] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setActive(true));
  }, []);
  
  return (
    <div className={`seat-container ${seatClass}`} style={{ zIndex: 1000, pointerEvents: 'none' }}>
      <div style={{
         transition: 'all 1s cubic-bezier(0.2, 0.8, 0.2, 1)',
         transform: active ? 'translateY(0) scale(1)' : 'translateY(100px) scale(0)',
         opacity: active ? 1 : 0,
         display: 'flex',
         flexDirection: 'column',
         alignItems: 'center'
      }}>
         <ChipStack amount={amount} />
         <div style={{ color: '#fbbf24', fontWeight: 'bold', textShadow: '0 2px 4px rgba(0,0,0,0.8)', fontSize: '1.5rem', animation: 'floatUp 1s ease-out forwards' }}>+${amount}</div>
      </div>
    </div>
  );
};

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
  
  const [winPct, setWinPct] = useState(50);
  const [history, setHistory] = useState("");
  const [aiFeedback, setAiFeedback] = useState(null);
  const [coachGrade, setCoachGrade] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // UI States & Customizations
  const [isProcessing, setIsProcessing] = useState(false);
  const [showRaiseOptions, setShowRaiseOptions] = useState(false);
  const [customBet, setCustomBet] = useState(40);
  const [activeDockTab, setActiveDockTab] = useState('coach'); // 'coach' | 'math' | 'history'
  const [isDockCollapsed, setIsDockCollapsed] = useState(true);
  const [feltTheme, setFeltTheme] = useState('emerald'); // 'emerald' | 'sapphire' | 'obsidian'
  const [isMuted, setIsMuted] = useState(false);
  
  // Session Stats
  const [sessionStats, setSessionStats] = useState({
    handsPlayed: 0,
    handsWon: 0,
    netProfit: 0
  });

  const [winnerAnimation, setWinnerAnimation] = useState(null);
  const animationPlayed = useRef(false);
  const logEndRef = useRef(null);

  // Sound wrapper with mute support
  const triggerSound = (name) => {
    if (!isMuted) {
      playSound(name);
    }
  };

  useEffect(() => { preloadAudio(); }, []);

  useEffect(() => {
    if (phase !== 'showdown') {
       animationPlayed.current = false;
       setWinnerAnimation(null);
    }
  }, [phase]);

  // Fresh state reference for timeouts
  const stateRef = useRef({ deck, heroCards, villainCards, board, phase, pot, heroStack, villainStack, heroBet, villainBet, turn, isMuted });
  useEffect(() => {
    stateRef.current = { deck, heroCards, villainCards, board, phase, pot, heroStack, villainStack, heroBet, villainBet, turn, isMuted };
  }, [deck, heroCards, villainCards, board, phase, pot, heroStack, villainStack, heroBet, villainBet, turn, isMuted]);

  // Auto-scroll action log
  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // Calculate Real-Time Made Hands using PokerSolver
  const heroMadeHand = useMemo(() => {
    if (!heroCards || heroCards.length < 2) return null;
    try {
      const heroSolver = heroCards.map(toSolverFormat);
      const boardSolver = (board || []).map(toSolverFormat);
      const solved = Hand.solve([...heroSolver, ...boardSolver]);
      return solved ? { name: solved.name, descr: solved.descr } : null;
    } catch (e) {
      return null;
    }
  }, [heroCards, board]);

  const villainMadeHand = useMemo(() => {
    if (phase !== 'showdown' || !villainCards || villainCards.length < 2) return null;
    try {
      const villainSolver = villainCards.map(toSolverFormat);
      const boardSolver = (board || []).map(toSolverFormat);
      const solved = Hand.solve([...villainSolver, ...boardSolver]);
      return solved ? { name: solved.name, descr: solved.descr } : null;
    } catch (e) {
      return null;
    }
  }, [phase, villainCards, board]);

  // Derived Poker Math Telemetry
  const toCallUI = Math.max(0, villainBet - heroBet);
  const potAfterCall = pot + toCallUI;
  const potOddsPct = toCallUI > 0 && potAfterCall > 0 
    ? Math.round((toCallUI / potAfterCall) * 100) 
    : 0;

  const effectiveStack = Math.min(heroStack, villainStack);
  const spr = pot > 0 ? (effectiveStack / pot).toFixed(1) : '∞';

  // Initialize Hand
  const startHand = () => {
    setShowRaiseOptions(false);
    setIsProcessing(true);
    const newDeck = createDeck();
    setHeroCards([newDeck.pop(), newDeck.pop()]);
    setVillainCards([newDeck.pop(), newDeck.pop()]);
    setDeck(newDeck);
    setBoard([]);
    setPhase('preflop');
    
    // Post blinds with stack continuity or reload if below 40
    setHeroStack(prev => {
      const base = prev > 40 ? prev : 1000;
      return base - 10;
    });
    setVillainStack(prev => {
      const base = prev > 40 ? prev : 1000;
      return base - 20;
    });
    
    setHeroBet(10);
    setVillainBet(20);
    setPot(30);
    setTurn('hero');
    setAiFeedback(null);
    setCoachGrade(null);
    setCustomBet(40);
    setHistory("--- NEW HAND ---\nBlinds posted (Hero SB: $10, Villain BB: $20).\n");
    setIsProcessing(false);
    triggerSound('deal');
  };

  useEffect(() => {
    startHand();
    // eslint-disable-next-line
  }, []);

  // Calculate Odds Live
  useEffect(() => {
    if (heroCards.length === 2 && phase !== 'showdown') {
      calculateOdds(heroCards, [], board).then(pct => setWinPct(pct));
    }
  }, [heroCards, board, phase]);

  const addToHistory = (msg) => setHistory(prev => prev + msg);

  // Keyboard Hotkeys
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (phase === 'showdown') {
        if (e.code === 'Space' || e.key === 'Enter') {
          e.preventDefault();
          startHand();
        }
        return;
      }
      if (turn === 'hero' && !isProcessing) {
        if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          handleHeroAction('fold');
        } else if (e.key === 'c' || e.key === 'C' || e.code === 'Space') {
          e.preventDefault();
          handleHeroAction('call');
        } else if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          setShowRaiseOptions(prev => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [turn, isProcessing, phase, heroBet, villainBet]);

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
      addToHistory(`\n--- FLOP: [${b1.rank} of ${b1.suit}, ${b2.rank} of ${b2.suit}, ${b3.rank} of ${b3.suit}] ---\n`);
      triggerSound('deal');
      villainAction();
    } else if (currentPhase === 'flop') {
      const b1 = currentDeck.pop();
      setDeck([...currentDeck]);
      setBoard(prev => [...prev, b1]);
      setPhase('turn');
      addToHistory(`\n--- TURN: [${b1.rank} of ${b1.suit}] ---\n`);
      triggerSound('deal');
      villainAction();
    } else if (currentPhase === 'turn') {
      const b1 = currentDeck.pop();
      setDeck([...currentDeck]);
      setBoard(prev => [...prev, b1]);
      setPhase('river');
      addToHistory(`\n--- RIVER: [${b1.rank} of ${b1.suit}] ---\n`);
      triggerSound('deal');
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
         const hWin = winners.length === 1 && winners[0] === heroHandObj;
         const vWin = winners.length === 1 && winners[0] === villainHandObj;
         const isSplit = winners.length === 2;

         if (isSplit) {
            const split = Math.floor(finalPot / 2);
            resultMsg = `Split Pot! Both players hold ${heroHandObj.name}.`;
            setHeroStack(s => s + split);
            setVillainStack(s => s + split);
            setSessionStats(prev => ({
              ...prev,
              handsPlayed: prev.handsPlayed + 1
            }));
            setCoachGrade({ type: 'marginal', label: 'SPLIT POT' });
            if (!animationPlayed.current) {
               setWinnerAnimation([
                  { seatClass: 'seat-bottom', amount: split },
                  { seatClass: 'seat-top', amount: split }
               ]);
               animationPlayed.current = true;
            }
         } else if (hWin) {
            resultMsg = `You win $${finalPot} with ${heroHandObj.descr}!`;
            setHeroStack(s => s + finalPot);
            setSessionStats(prev => ({
              ...prev,
              handsPlayed: prev.handsPlayed + 1,
              handsWon: prev.handsWon + 1,
              netProfit: prev.netProfit + Math.floor(finalPot / 2)
            }));
            setCoachGrade({ type: 'optimal', label: 'OPTIMAL SHOWDOWN' });
            if (!animationPlayed.current) {
               setWinnerAnimation([{ seatClass: 'seat-bottom', amount: finalPot }]);
               animationPlayed.current = true;
            }
         } else {
            resultMsg = `Computer wins $${finalPot} with ${villainHandObj.descr}.`;
            setVillainStack(s => s + finalPot);
            setSessionStats(prev => ({
              ...prev,
              handsPlayed: prev.handsPlayed + 1,
              netProfit: prev.netProfit - Math.floor(finalPot / 2)
            }));
            setCoachGrade({ type: 'leak', label: 'LOST SHOWDOWN' });
            if (!animationPlayed.current) {
               setWinnerAnimation([{ seatClass: 'seat-top', amount: finalPot }]);
               animationPlayed.current = true;
            }
         }
         addToHistory(`\n--- SHOWDOWN ---\n${resultMsg}\n`);
         analyzeHand(resultMsg);
         return 0; // Clear pot
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
         if (Math.random() < 0.45) { // Fold realistic frequency
            action = 'fold';
         } else if (Math.random() < 0.25 && vs > toCall + (currentPot * 0.5)) {
            action = 'raise';
            amount = toCall + Math.floor(currentPot * 0.5); // Raise 1/2 pot
         } else {
            action = 'call';
         }
      } else {
         if (Math.random() < 0.25) { // Bet frequency
            action = 'bet';
            amount = Math.floor(currentPot * 0.5);
         } else {
            action = 'check';
         }
      }
      
      if (action === 'fold') {
         addToHistory("Computer Folds.\n");
         triggerSound('fold');
         const finalPot = currentPot;
         setHeroStack(prev => prev + finalPot);
         setPot(0);
         setSessionStats(prev => ({
           ...prev,
           handsPlayed: prev.handsPlayed + 1,
           handsWon: prev.handsWon + 1,
           netProfit: prev.netProfit + vb
         }));
         setCoachGrade({ type: 'optimal', label: 'OPPONENT FOLDED' });
         endHand(`Computer Folds. You scoop $${finalPot}!`);
         if (!animationPlayed.current) {
            setWinnerAnimation([{ seatClass: 'seat-bottom', amount: finalPot }]);
            animationPlayed.current = true;
         }
      } else if (action === 'raise' || action === 'bet') {
         addToHistory(`Computer ${action === 'raise' ? 'Raises to' : 'Bets'} $${vb + amount}.\n`);
         triggerSound('bet');
         setVillainStack(prev => prev - amount);
         setVillainBet(prev => prev + amount);
         setPot(prev => prev + amount);
         setTurn('hero');
         setIsProcessing(false);
      } else if (action === 'call') {
         addToHistory(`Computer Calls $${toCall}.\n`);
         triggerSound('bet');
         setVillainStack(prev => prev - toCall);
         setVillainBet(prev => prev + toCall);
         setPot(prev => prev + toCall);
         nextPhase(currentDeck);
      } else if (action === 'check') {
         addToHistory("Computer Checks.\n");
         triggerSound('bet');
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
      addToHistory("You Fold.\n");
      triggerSound('fold');
      const finalPot = pot;
      setVillainStack(prev => prev + finalPot);
      setPot(0);
      setSessionStats(prev => ({
        ...prev,
        handsPlayed: prev.handsPlayed + 1,
        netProfit: prev.netProfit - hb
      }));
      setCoachGrade({ type: 'marginal', label: 'HERO FOLDED' });
      endHand(`Computer wins $${finalPot}.`);
      if (!animationPlayed.current) {
        setWinnerAnimation([{ seatClass: 'seat-top', amount: finalPot }]);
        animationPlayed.current = true;
      }
    } else if (action === 'call') {
      if (toCall === 0) {
        addToHistory("You Check.\n");
        triggerSound('bet');
        nextPhase(currentDeck); 
      } else {
        addToHistory(`You Call $${toCall}.\n`);
        triggerSound('bet');
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
      addToHistory(`You Raise to $${vb + raiseAmount}.\n`);
      triggerSound('bet');
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
    analyzeHand(resultMsg);
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
        const won = finalResultMsg.includes("You win") || finalResultMsg.includes("You scoop");
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

  // Quick Bet Presets
  const setBetPreset = (type) => {
    if (phase === 'preflop') {
      if (type === 'min') setCustomBet(20);
      else if (type === '2.5x') setCustomBet(50);
      else if (type === '3x') setCustomBet(60);
      else if (type === 'allin') setCustomBet(heroStack);
    } else {
      if (type === '33%') setCustomBet(Math.max(20, Math.floor(pot * 0.33)));
      else if (type === '50%') setCustomBet(Math.max(20, Math.floor(pot * 0.50)));
      else if (type === '75%') setCustomBet(Math.max(20, Math.floor(pot * 0.75)));
      else if (type === 'pot') setCustomBet(Math.max(20, pot));
      else if (type === 'allin') setCustomBet(heroStack);
    }
  };

  const isHeroTurn = turn === 'hero' && !isProcessing && phase !== 'showdown';
  const heroWinRate = sessionStats.handsPlayed > 0 
    ? Math.round((sessionStats.handsWon / sessionStats.handsPlayed) * 100) 
    : 0;

  return (
    <div className="sandbox-workstation">
      
      {/* --------------------------------------------------
          TOP TELEMETRY & WORKSPACE HEADER
          -------------------------------------------------- */}
      <header className="sandbox-topbar">
        <div className="sandbox-topbar-left">
          <button onClick={() => navigate('/')} className="btn-exit-sandbox" title="Return to Dashboard">
            <span>←</span> Exit
          </button>
          
          <div className="sandbox-title-badge">
            <h1>AI Sandbox Trainer</h1>
            <span className="pill-pro-tag">GTO v2.5</span>
          </div>
        </div>

        {/* Live Session Telemetry Bar */}
        <div className="sandbox-metrics-cluster">
          <div className="metric-item">
            <span className="metric-label">Hand</span>
            <span className="metric-value">#{sessionStats.handsPlayed + 1}</span>
          </div>
          <div className="metric-item">
            <span className="metric-label">Win Rate</span>
            <span className="metric-value">{heroWinRate}%</span>
          </div>
          <div className="metric-item">
            <span className="metric-label">Session P/L</span>
            <span className={`metric-value ${sessionStats.netProfit > 0 ? 'profit-pos' : sessionStats.netProfit < 0 ? 'profit-neg' : 'profit-even'}`}>
              {sessionStats.netProfit >= 0 ? `+$${sessionStats.netProfit}` : `-$${Math.abs(sessionStats.netProfit)}`}
            </span>
          </div>
          <div className="metric-item">
            <span className="metric-label">Stakes</span>
            <span className="metric-value" style={{ color: '#38bdf8' }}>10 / 20 NL</span>
          </div>
        </div>

        {/* Felt Themes & Tools */}
        <div className="sandbox-topbar-right">
          <div className="theme-pill-selector" title="Switch Table Felt Color">
            <button 
              className={`theme-pill-btn ${feltTheme === 'emerald' ? 'active' : ''}`}
              onClick={() => setFeltTheme('emerald')}
            >
              Emerald
            </button>
            <button 
              className={`theme-pill-btn ${feltTheme === 'sapphire' ? 'active' : ''}`}
              onClick={() => setFeltTheme('sapphire')}
            >
              Sapphire
            </button>
            <button 
              className={`theme-pill-btn ${feltTheme === 'obsidian' ? 'active' : ''}`}
              onClick={() => setFeltTheme('obsidian')}
            >
              Obsidian
            </button>
          </div>

          <button 
            className="btn-tool-icon" 
            onClick={() => setIsMuted(!isMuted)} 
            title={isMuted ? "Unmute Audio" : "Mute Audio"}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>

          <button 
            className="btn-tool-icon" 
            onClick={() => {
              if (window.confirm("Reset stacks to $1,000 each?")) {
                setHeroStack(1000);
                setVillainStack(1000);
                startHand();
              }
            }} 
            title="Reset Chip Stacks to $1,000"
          >
            🔄
          </button>

          <button 
            className={`btn-coach-drawer-toggle ${!isDockCollapsed ? 'active' : ''}`}
            onClick={() => setIsDockCollapsed(!isDockCollapsed)} 
            title="Toggle AI Strategy Coach & Telemetry Drawer"
          >
            <span>🧠</span>
            <span className="coach-toggle-label">AI Coach</span>
            <span className="coach-toggle-state">{!isDockCollapsed ? '✕' : '▶'}</span>
          </button>
        </div>
      </header>

      {/* --------------------------------------------------
          MAIN WORKSPACE SPLIT (TABLE + TRAINING DOCK)
          -------------------------------------------------- */}
      <div className="sandbox-main-split">
        
        {/* LEFT / CENTER ARENA: POKER TABLE & CONTROLS */}
        <main className="sandbox-table-arena">
          
          <div className="table-stage-wrapper">
            <div className={`pro-poker-table theme-${feltTheme}`}>
              <div className="table-inner-felt">
                
                {/* Felt Overlay Accents */}
                <div className="table-betting-line"></div>
                <div className="table-center-watermark">POKER ACADEMY • HEADS UP GTO</div>

                {/* ------------------------------------
                    TOP SEAT: VILLAIN (AI Computer)
                    ------------------------------------ */}
                <div className="table-seat-villain">
                  {/* Status / Thinking Bubble */}
                  {turn === 'villain' && phase !== 'showdown' && (
                    <div className="player-action-bubble">Thinking GTO...</div>
                  )}

                  <div className="villain-pod-cluster">
                    {/* Player Badge */}
                    <div className={`player-plate ${turn === 'villain' && phase !== 'showdown' ? 'is-active-turn' : ''}`}>
                      <div className="player-avatar-circle ai-bot">AI</div>
                      <div className="player-info-meta">
                        <div className="player-name-row">
                          <span className="player-name-text">GTO Bot</span>
                          <span className="blind-badge bb">BB</span>
                        </div>
                        <div className="player-chips-row">
                          <span className="player-chips-val">${villainStack}</span>
                          <span className="player-bb-val">{Math.round(villainStack / 20)} BB</span>
                        </div>
                      </div>
                    </div>

                    {/* Hole Cards Beside Plate */}
                    <div className="villain-cards-wrapper">
                      {villainCards.map((c, i) => (
                        <div key={i}>
                          <Card suit={c.suit} rank={c.rank} isFaceUp={phase === 'showdown'} disableFlip={true} />
                        </div>
                      ))}
                    </div>

                    {/* Showdown Hand Name */}
                    {villainMadeHand && (
                      <div className="villain-made-hand-badge">
                        {villainMadeHand.descr}
                      </div>
                    )}
                  </div>
                </div>

                {/* ------------------------------------
                    VILLAIN COMMITTED BET (Side Felt Lane)
                    ------------------------------------ */}
                {villainBet > 0 && (
                  <div className="table-bet-lane villain-bet-lane">
                    <div className="chip-icon-wrapper">
                      <ChipStack amount={villainBet} />
                    </div>
                    <span className="bet-amount-tag">${villainBet}</span>
                  </div>
                )}

                {/* ------------------------------------
                    CENTER ARENA: POT & COMMUNITY BOARD
                    ------------------------------------ */}
                <div className="table-center-hub">
                  {/* Main Illuminated Pot with Phase Tag & Odds */}
                  <div className="pot-display-hub">
                    <span className="pot-street-badge">{phase.toUpperCase()}</span>
                    <div className="chip-icon-wrapper" style={{ transform: 'scale(0.55)', width: '24px', height: '18px' }}>
                      <ChipStack amount={pot} />
                    </div>
                    <span className="pot-amount-text">${pot}</span>
                    <span className="pot-bb-text">({(pot / 20).toFixed(1)} BB)</span>
                    {toCallUI > 0 && phase !== 'showdown' && (
                      <span className="pot-odds-inline-tag">
                        Odds: <strong>{potOddsPct}%</strong>
                      </span>
                    )}
                  </div>

                  {/* Community Board with Placeholders */}
                  <div className="community-board-row">
                    {board.length > 0 ? (
                      board.map((c, i) => (
                        <div key={i}>
                          <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
                        </div>
                      ))
                    ) : null}

                    {/* Empty Card Outline Placeholders */}
                    {Array.from({ length: 5 - board.length }).map((_, i) => (
                      <div key={i} className="card-placeholder-slot">
                        <span>♠</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ------------------------------------
                    HERO COMMITTED BET (Side Felt Lane)
                    ------------------------------------ */}
                {heroBet > 0 && (
                  <div className="table-bet-lane hero-bet-lane">
                    <div className="chip-icon-wrapper">
                      <ChipStack amount={heroBet} />
                    </div>
                    <span className="bet-amount-tag">${heroBet}</span>
                  </div>
                )}

                {/* ------------------------------------
                    LANE 5: BOTTOM SEAT: HERO (Player)
                    ------------------------------------ */}
                <div className="table-seat-hero">
                  
                  {/* Hero Hand Cluster (Cards + Flanking Badges) */}
                  <div className="hero-hand-cluster">
                    {/* Live Hand Rank Readout on Left */}
                    {heroMadeHand && (
                      <div className="hero-made-hand-badge">
                        {heroMadeHand.descr}
                      </div>
                    )}

                    {/* Hole Cards */}
                    <div className="hero-cards-wrapper">
                      {heroCards.map((c, i) => (
                        <div key={i}>
                          <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
                        </div>
                      ))}
                    </div>
                    
                    {/* Live Win Equity Badge on Right */}
                    {phase !== 'showdown' && (
                      <div className="hero-equity-badge">
                        <span className="hero-equity-label">Equity</span>
                        <span className={`hero-equity-num ${winPct >= 55 ? 'high' : winPct >= 40 ? 'mid' : 'low'}`}>
                          {winPct}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Player Badge */}
                  <div className={`player-plate ${isHeroTurn ? 'is-active-turn' : ''}`}>
                    <div className="player-avatar-circle">YOU</div>
                    <div className="player-info-meta">
                      <div className="player-name-row">
                        <span className="player-name-text">Hero (You)</span>
                        <span className="blind-badge sb">SB</span>
                        <span className="dealer-button-badge" title="Dealer Button">D</span>
                      </div>
                      <div className="player-chips-row">
                        <span className="player-chips-val">${heroStack}</span>
                        <span className="player-bb-val">{Math.round(heroStack / 20)} BB</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Winning Chips Scoop Animation */}
                {winnerAnimation && winnerAnimation.map((w, idx) => (
                  <FlyingChips key={idx} seatClass={w.seatClass} amount={w.amount} />
                ))}

              </div>
            </div>
          </div>

          {/* --------------------------------------------------
              BOTTOM ACTION COMMAND CENTER
              -------------------------------------------------- */}
          <div className="action-command-center">
            
            {phase !== 'showdown' ? (
              <>
                {/* Sizing Slider / Presets Drawer */}
                {showRaiseOptions ? (
                  <div className="smart-bet-sizing-panel">
                    
                    {/* Sizing Presets Bar */}
                    <div className="sizing-preset-row">
                      {phase === 'preflop' ? (
                        <>
                          <button className="btn-preset-size" onClick={() => setBetPreset('min')}>Min (2x)</button>
                          <button className="btn-preset-size" onClick={() => setBetPreset('2.5x')}>2.5x ($50)</button>
                          <button className="btn-preset-size" onClick={() => setBetPreset('3x')}>3x ($60)</button>
                          <button className="btn-preset-size allin" onClick={() => setBetPreset('allin')}>All-In</button>
                        </>
                      ) : (
                        <>
                          <button className="btn-preset-size" onClick={() => setBetPreset('33%')}>33% Pot</button>
                          <button className="btn-preset-size" onClick={() => setBetPreset('50%')}>50% Pot</button>
                          <button className="btn-preset-size" onClick={() => setBetPreset('75%')}>75% Pot</button>
                          <button className="btn-preset-size" onClick={() => setBetPreset('pot')}>Pot (100%)</button>
                          <button className="btn-preset-size allin" onClick={() => setBetPreset('allin')}>All-In</button>
                        </>
                      )}
                    </div>

                    {/* Precision Slider with Steppers */}
                    <div className="slider-stepper-row">
                      <button 
                        className="btn-stepper"
                        onClick={() => setCustomBet(prev => Math.max(20, prev - 10))}
                      >
                        -
                      </button>
                      <input 
                        type="range"
                        className="pro-bet-slider"
                        min={20}
                        max={heroStack}
                        step={5}
                        value={customBet}
                        onChange={(e) => setCustomBet(Number(e.target.value))}
                      />
                      <button 
                        className="btn-stepper"
                        onClick={() => setCustomBet(prev => Math.min(heroStack, prev + 10))}
                      >
                        +
                      </button>
                      <div style={{ minWidth: '70px', textAlign: 'right' }}>
                        <span style={{ color: '#fbbf24', fontWeight: '800', fontSize: '1rem', fontFamily: 'monospace' }}>
                          ${customBet}
                        </span>
                        <span style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block' }}>
                          ({(customBet / 20).toFixed(1)} BB)
                        </span>
                      </div>
                    </div>

                    {/* Sizing Actions Confirmation */}
                    <div className="sizing-confirm-row">
                      <button 
                        className="btn-confirm-raise" 
                        onClick={() => handleHeroAction('raise', customBet)}
                        disabled={!isHeroTurn}
                      >
                        Confirm Bet ${customBet}
                      </button>
                      <button 
                        className="btn-cancel-raise" 
                        onClick={() => setShowRaiseOptions(false)}
                      >
                        Cancel
                      </button>
                    </div>

                  </div>
                ) : (
                  /* Standard 3-Action Buttons */
                  <div className="primary-actions-grid">
                    
                    {/* FOLD BUTTON */}
                    <button 
                      className="action-btn-card action-btn-fold" 
                      onClick={() => handleHeroAction('fold')}
                      disabled={!isHeroTurn}
                      title="Shortcut: Press [F]"
                    >
                      <span className="action-hotkey-tag">[F]</span>
                      <span className="action-main-title">FOLD</span>
                      <span className="action-sub-hint">Surrender Hand</span>
                    </button>

                    {/* CHECK / CALL BUTTON */}
                    <button 
                      className={`action-btn-card ${toCallUI > 0 ? 'action-btn-call' : 'action-btn-check'}`}
                      onClick={() => handleHeroAction('call')}
                      disabled={!isHeroTurn}
                      title="Shortcut: Press [C] or [Space]"
                    >
                      <span className="action-hotkey-tag">[C]</span>
                      <span className="action-main-title">
                        {toCallUI > 0 ? `CALL $${toCallUI}` : 'CHECK'}
                      </span>
                      <span className="action-sub-hint">
                        {toCallUI > 0 ? `Odds: ${potOddsPct}%` : 'Free Action'}
                      </span>
                    </button>

                    {/* BET / RAISE BUTTON */}
                    <button 
                      className="action-btn-card action-btn-raise" 
                      onClick={() => setShowRaiseOptions(true)}
                      disabled={!isHeroTurn}
                      title="Shortcut: Press [R]"
                    >
                      <span className="action-hotkey-tag">[R]</span>
                      <span className="action-main-title">
                        {toCallUI > 0 ? 'RAISE' : 'BET'}
                      </span>
                      <span className="action-sub-hint">Open Sizing Bar</span>
                    </button>

                  </div>
                )}
              </>
            ) : (
              /* NEXT HAND BUTTON */
              <button 
                className="btn-next-hand-glowing" 
                onClick={startHand}
                title="Shortcut: Press [Space]"
              >
                <span>Deal Next Hand</span>
                <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>[Space]</span>
              </button>
            )}

          </div>

        </main>

        {/* --------------------------------------------------
            RIGHT SIDEBAR: PRO TRAINING DOCK
            -------------------------------------------------- */}
        {!isDockCollapsed && (
          <aside className="sandbox-training-dock open">
            
            {/* Drawer Top Header with Close Button */}
            <div className="dock-drawer-top">
              <span className="dock-drawer-title">AI Strategy Coach & HUD</span>
              <button 
                className="btn-dock-close"
                onClick={() => setIsDockCollapsed(true)}
                title="Close AI Coach Drawer"
              >
                ✕
              </button>
            </div>

            {/* Dock Tabs Header */}
            <div className="dock-nav-header">
              <button 
                className={`dock-tab-btn ${activeDockTab === 'coach' ? 'active' : ''}`}
                onClick={() => setActiveDockTab('coach')}
              >
                <span>🧠</span> AI Coach
              </button>
              <button 
                className={`dock-tab-btn ${activeDockTab === 'math' ? 'active' : ''}`}
                onClick={() => setActiveDockTab('math')}
              >
                <span>📊</span> Telemetry
              </button>
              <button 
                className={`dock-tab-btn ${activeDockTab === 'history' ? 'active' : ''}`}
                onClick={() => setActiveDockTab('history')}
              >
                <span>📜</span> Hand Log
              </button>
            </div>

            {/* Dock Body Content */}
            <div className="dock-content-body">
              
              {/* TAB 1: AI COACH (GEMINI PRO STRATEGY) */}
              {activeDockTab === 'coach' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div className="coach-header-card">
                    <div className="coach-status-tag">
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                      <span>Gemini Coach 2.5</span>
                    </div>

                    {coachGrade && (
                      <span className={`coach-decision-badge ${coachGrade.type}`}>
                        {coachGrade.label}
                      </span>
                    )}
                  </div>

                  {isAnalyzing ? (
                    <div className="coach-empty-state">
                      <div style={{ fontSize: '2rem', animation: 'spin 2s linear infinite' }}>⏳</div>
                      <p style={{ margin: 0, fontWeight: '600', color: '#f8fafc' }}>Analyzing Hand Dynamics...</p>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                        Evaluating bet sizing, range advantage, and pot equity.
                      </p>
                    </div>
                  ) : aiFeedback ? (
                    <div className="coach-speech-text">
                      {aiFeedback.split('\n\n').map((paragraph, idx) => (
                        <p key={idx} style={{ margin: '0 0 0.85rem 0', color: idx === 0 ? '#f8fafc' : '#cbd5e1' }}>
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <div className="coach-empty-state">
                      <div className="coach-empty-icon">🎯</div>
                      <p style={{ margin: 0, fontWeight: '700', color: '#e2e8f0' }}>Hand In Progress</p>
                      <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: '1.5' }}>
                        Play this hand through to showdown or fold. Your AI Coach will generate tactical strategic advice based on your exact line.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: MATH & EQUITY TELEMETRY */}
              {activeDockTab === 'math' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  
                  {/* Win Equity Bar Card */}
                  <div className="telemetry-stat-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <span className="telemetry-stat-label">Hero Win Equity</span>
                      <span style={{ fontWeight: '800', color: winPct >= 50 ? '#34d399' : '#f87171' }}>{winPct}%</span>
                    </div>
                    <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '9999px', overflow: 'hidden' }}>
                      <div 
                        style={{ 
                          width: `${winPct}%`, 
                          height: '100%', 
                          background: winPct >= 50 ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #f87171, #ef4444)',
                          borderRadius: '9999px',
                          transition: 'width 0.4s ease'
                        }} 
                      />
                    </div>
                  </div>

                  {/* 2x2 Telemetry Grid */}
                  <div className="telemetry-card-grid">
                    <div className="telemetry-stat-box">
                      <span className="telemetry-stat-label">Pot Odds</span>
                      <span className="telemetry-stat-value" style={{ color: '#38bdf8' }}>{potOddsPct}%</span>
                      <span className="telemetry-stat-sub">Required equity to break even</span>
                    </div>

                    <div className="telemetry-stat-box">
                      <span className="telemetry-stat-label">SPR</span>
                      <span className="telemetry-stat-value" style={{ color: Number(spr) > 10 ? '#34d399' : '#fbbf24' }}>
                        {spr}
                      </span>
                      <span className="telemetry-stat-sub">
                        {Number(spr) > 13 ? 'Deep Stacked' : Number(spr) > 5 ? 'Medium Stack' : 'Low / Committed'}
                      </span>
                    </div>

                    <div className="telemetry-stat-box">
                      <span className="telemetry-stat-label">Current Pot</span>
                      <span className="telemetry-stat-value" style={{ color: '#fbbf24' }}>${pot}</span>
                      <span className="telemetry-stat-sub">{(pot / 20).toFixed(1)} Big Blinds</span>
                    </div>

                    <div className="telemetry-stat-box">
                      <span className="telemetry-stat-label">Effective Stack</span>
                      <span className="telemetry-stat-value">${effectiveStack}</span>
                      <span className="telemetry-stat-sub">{Math.round(effectiveStack / 20)} Big Blinds</span>
                    </div>
                  </div>

                  {/* Hand Strength Telemetry Card */}
                  <div className="telemetry-stat-box">
                    <span className="telemetry-stat-label">Current Hand Rank</span>
                    <span style={{ fontSize: '1rem', fontWeight: '700', color: '#f8fafc', marginTop: '0.25rem' }}>
                      {heroMadeHand ? heroMadeHand.descr : '2 Unpaired Cards'}
                    </span>
                    <span className="telemetry-stat-sub" style={{ marginTop: '0.2rem' }}>
                      {heroMadeHand ? `Class: ${heroMadeHand.name}` : 'Preflop Holding'}
                    </span>
                  </div>

                  {/* Solver Hotkey Cheat Sheet */}
                  <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '0.75rem', padding: '0.75rem' }}>
                    <span className="telemetry-stat-label">Pro Hotkeys</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginTop: '0.4rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                      <div><strong style={{ color: '#f8fafc' }}>[F]</strong> Fold</div>
                      <div><strong style={{ color: '#f8fafc' }}>[C]</strong> Check / Call</div>
                      <div><strong style={{ color: '#f8fafc' }}>[R]</strong> Raise / Bet</div>
                      <div><strong style={{ color: '#f8fafc' }}>[Space]</strong> Next Hand</div>
                    </div>
                  </div>

                </div>
              )}

              {/* TAB 3: HAND LOG (TIMELINE) */}
              {activeDockTab === 'history' && (
                <div className="history-timeline-list">
                  {history.split('\n').filter(Boolean).map((line, idx) => {
                    const isHeader = line.startsWith('---');
                    const isWin = line.includes('win') || line.includes('wins') || line.includes('scoop');
                    return (
                      <div 
                        key={idx} 
                        className={`history-timeline-entry ${isHeader ? 'street-header' : isWin ? 'win-entry' : ''}`}
                      >
                        {line.replace(/---/g, '').trim()}
                      </div>
                    );
                  })}
                  <div ref={logEndRef} />
                </div>
              )}

            </div>
          </aside>
        )}

      </div>
    </div>
  );
};

export default GameEngine;
