import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import Card from './Card';
import ChipStack from './ChipStack';
import { createDeck, getNextActivePlayer, checkRoundComplete } from '../utils/multiplayerLogic';
import { Hand } from 'pokersolver';
import { preloadAudio, playSound } from '../utils/audio';
import { getAIFeedback } from '../api/getAIFeedback';

const AVATARS = ['😎', '🤠', '👽', '🤖', '🦊', '🐷', '🦄', '🦁', '🐻', '🐼'];
const getAvatar = (userId) => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return AVATARS[Math.abs(hash) % AVATARS.length];
};

const getSeatClass = (playerCount, offset) => {
  // Always seat the hero (offset 0) at the bottom
  if (offset === 0) return 'seat-bottom';
  
  if (playerCount === 2) {
    if (offset === 1) return 'seat-top';
  } else if (playerCount === 3) {
    if (offset === 1) return 'seat-top-left';
    if (offset === 2) return 'seat-top-right';
  } else if (playerCount === 4) {
    if (offset === 1) return 'seat-bottom-left';
    if (offset === 2) return 'seat-top';
    if (offset === 3) return 'seat-bottom-right';
  } else if (playerCount === 5) {
    if (offset === 1) return 'seat-bottom-left';
    if (offset === 2) return 'seat-top-left';
    if (offset === 3) return 'seat-top-right';
    if (offset === 4) return 'seat-bottom-right';
  } else {
    // 6 players
    const seats = ['seat-bottom', 'seat-bottom-left', 'seat-top-left', 'seat-top', 'seat-top-right', 'seat-bottom-right'];
    return seats[offset] || 'seat-bottom';
  }
};

const FlyingChips = ({ seatClass, amount }) => {
  const [active, setActive] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setActive(true));
  }, []);
  
  return (
    <div className={`seat-pos ${seatClass}`} style={{ zIndex: 1000, pointerEvents: 'none' }}>
      <div style={{
         transition: 'all 1s cubic-bezier(0.2, 0.8, 0.2, 1)',
         transform: active ? 'translateY(0) scale(1)' : 'translateY(100px) scale(0)',
         opacity: active ? 1 : 0,
         display: 'flex',
         flexDirection: 'column',
         alignItems: 'center'
      }}>
         <ChipStack amount={amount} />
         <div style={{ color: '#eab308', fontWeight: 'bold', textShadow: '0 2px 4px rgba(0,0,0,0.8)', fontSize: '1.5rem', animation: 'floatUp 1s ease-out forwards' }}>+${amount}</div>
      </div>
    </div>
  );
};

const MultiplayerTable = ({ session }) => {
  const { code } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [dbPlayers, setDbPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRaiseOptions, setShowRaiseOptions] = useState(false);
  const [customBet, setCustomBet] = useState(20);
  const [timerConfig, setTimerConfig] = useState(30);
  
  const [isLogOpen, setIsLogOpen] = useState(false);
  const logEndRef = useRef(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [winnerAnimation, setWinnerAnimation] = useState(null);
  const [animationPlayed, setAnimationPlayed] = useState(false);

  const gs = room?.game_state || {};
  const amIHost = dbPlayers.find(p => p.user_id === session.user.id)?.is_host;
  const isPlaying = room?.status === 'playing';
  const meName = dbPlayers.find(p => p.user_id === session.user.id)?.display_name || 'Player';

  useEffect(() => { preloadAudio(); }, []);

  useEffect(() => {
    if (gs.phase !== 'showdown') {
       setAnimationPlayed(false);
       setWinnerAnimation(null);
    }
    if (gs.phase === 'showdown' && gs.winners && !animationPlayed) {
       setAnimationPlayed(true);
       setWinnerAnimation(gs.winners);
       const t = setTimeout(() => setWinnerAnimation(null), 2000);
       return () => clearTimeout(t);
    }
  }, [gs.phase, gs.winners, animationPlayed]);

  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [gs.history]);

  const subscriptionsRef = useRef(false);
  const lastDealerTriggerRef = useRef(null);

  useEffect(() => {
    let roomSub = null;
    let playersSub = null;
    let chatSub = null;

    const fetchRoom = async () => {
      try {
        const { data: roomData, error: roomError } = await supabase.from('poker_rooms').select('*').eq('code', code).single();
        if (roomError) throw roomError;
        setRoom(roomData);

        const { data: playersData, error: playersError } = await supabase.from('poker_players').select('*').eq('room_id', roomData.id).order('seat_index', { ascending: true });
        if (playersError) throw playersError;
        setDbPlayers(playersData);

        if (!subscriptionsRef.current) {
          subscriptionsRef.current = true;

          roomSub = supabase.channel(`room_${roomData.id}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'poker_rooms', filter: `id=eq.${roomData.id}` }, (payload) => {
              setRoom(prev => ({ ...prev, ...payload.new }));
            })
            .subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                fetchRoom();
              }
            });

          playersSub = supabase.channel(`players_${roomData.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_players', filter: `room_id=eq.${roomData.id}` }, () => {
              fetchRoom();
            })
            .subscribe();

          chatSub = supabase.channel(`chat_${code}`)
            .on('broadcast', { event: 'game_sync' }, () => {
              fetchRoom();
            })
            .subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                supabase.channel(`chat_${code}`).send({ type: 'broadcast', event: 'game_sync', payload: {} });
              }
            });
        }
      } catch (err) {
        console.error(err);
        navigate('/multiplayer');
      } finally {
        setLoading(false);
      }
    };
    fetchRoom();

    return () => {
      if (roomSub) supabase.removeChannel(roomSub);
      if (playersSub) supabase.removeChannel(playersSub);
      subscriptionsRef.current = false;
    };
  }, [code, navigate]);

  const triggerAIDealer = async (history) => {
    try {
        setIsAiThinking(true);
        const customPrompt = `You are a professional but witty high-stakes casino dealer. Summarize this poker hand in 1 sentence and add a clever, slightly roasting remark about the losing play. Do not use terms of endearment like "darling" or "sweetie". Keep it brief and sound like a real casino. Action history:\n${history}`;
        const response = await getAIFeedback(history, customPrompt);
        const state = { ...gs };
        state.history += `\n🤖 Dealer: ${response}`;
        await supabase.from('poker_rooms').update({ game_state: state }).eq('id', room.id);
    } catch (err) {
        console.error(err);
    } finally {
        setIsAiThinking(false);
    }
  };

  // Host Drop-In Injection
  useEffect(() => {
    if (!amIHost || !isPlaying || !gs.players) return;
    
    let stateChanged = false;
    const newState = { ...gs, players: [...gs.players] };

    dbPlayers.forEach(p => {
      const exists = newState.players.find(ep => ep.user_id === p.user_id);
      if (!exists) {
        if (gs.mode === 'tournament') return; // No late registration for tournaments
        
        newState.players.push({
          user_id: p.user_id,
          display_name: p.display_name,
          avatar: getAvatar(p.user_id),
          chips: p.chips,
          cards: [],
          bet: 0,
          status: 'sitting_out',
          acted: false
        });
        newState.history += `\n>>> ${p.display_name} dropped into an open seat!`;
        stateChanged = true;
      }
    });

    // Remove players who left
    for (let i = newState.players.length - 1; i >= 0; i--) {
       const p = newState.players[i];
       if (dbPlayers.length > 0 && !dbPlayers.find(dp => dp.user_id === p.user_id)) {
           newState.players.splice(i, 1);
           newState.history += `\n<<< ${p.display_name} left the table.`;
           stateChanged = true;
       }
    }

    if (stateChanged) {
       supabase.from('poker_rooms').update({ game_state: newState }).eq('id', room.id);
    }
  }, [dbPlayers, amIHost, isPlaying]);

  // Host Auto-Fold Timer
  useEffect(() => {
    if (!amIHost || !isPlaying || gs.phase === 'showdown' || gs.phase === 'waiting_for_players' || !gs.timerLength) return;
    const interval = setInterval(async () => {
      const elapsed = (Date.now() - gs.turnStartTime) / 1000;
      if (elapsed >= gs.timerLength) {
        const newState = { ...gs };
        const idx = gs.turnIndex;
        const target = newState.players[idx];
        target.acted = true;
        target.status = 'fold';
        newState.history += `${target.display_name} Times Out & Auto-Folds.\n`;
        newState.turnIndex = getNextActivePlayer(newState.players, idx);
        newState.turnStartTime = Date.now();
        await supabase.from('poker_rooms').update({ game_state: newState }).eq('id', room.id);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [gs, amIHost, isPlaying, room?.id]);

  // Client UI Timer
  useEffect(() => {
    if (!isPlaying || gs.phase === 'showdown' || gs.phase === 'waiting_for_players' || !gs.timerLength) {
      setTimeLeft(null);
      return;
    }
    const updateTimer = () => {
      const remaining = gs.timerLength - ((Date.now() - gs.turnStartTime) / 1000);
      setTimeLeft(Math.max(0, remaining));
    };
    updateTimer();
    const uiInterval = setInterval(updateTimer, 100);
    return () => clearInterval(uiInterval);
  }, [gs.turnStartTime, gs.timerLength, isPlaying, gs.phase]);

  // Audio Hooks
  const prevTurnIndex = useRef(gs.turnIndex);
  const prevPhase = useRef(gs.phase);
  useEffect(() => {
    if (isPlaying && gs.phase !== 'showdown' && gs.phase !== 'waiting_for_players' && gs.turnIndex !== prevTurnIndex.current) {
      if (gs.players?.[gs.turnIndex]?.user_id === session.user.id) playSound('turn');
      prevTurnIndex.current = gs.turnIndex;
    }
    if (isPlaying && gs.phase !== prevPhase.current && gs.phase !== 'waiting_for_players') {
      playSound('deal');
      prevPhase.current = gs.phase;
    }
  }, [gs.turnIndex, gs.phase, isPlaying, session.user.id]);

  // Host Round Completion
  useEffect(() => {
    if (!amIHost || !isPlaying || !gs.phase) return;
    if (gs.phase === 'showdown' || gs.phase === 'waiting_for_players') return;

    if (checkRoundComplete(gs.players)) {
      const newState = { ...gs };
      
      newState.players.forEach(p => {
        newState.pot += p.bet;
        p.bet = 0;
        p.acted = false;
      });

      const activeCount = newState.players.filter(p => p.status === 'active').length;
      if (activeCount <= 1) {
        const winner = newState.players.find(p => p.status === 'active');
        if (winner) {
          winner.chips += newState.pot;
          newState.history += `\n${winner.display_name} wins $${newState.pot} (Everyone else folded).`;
          newState.pot = 0;
          newState.phase = 'showdown';
        }
      } else {
        if (gs.phase === 'preflop') {
          newState.phase = 'flop';
          newState.board = [newState.deck.pop(), newState.deck.pop(), newState.deck.pop()];
          newState.history += `\n--- FLOP ---\n`;
        } else if (gs.phase === 'flop') {
          newState.phase = 'turn';
          newState.board.push(newState.deck.pop());
          newState.history += `\n--- TURN ---\n`;
        } else if (gs.phase === 'turn') {
          newState.phase = 'river';
          newState.board.push(newState.deck.pop());
          newState.history += `\n--- RIVER ---\n`;
        } else if (gs.phase === 'river') {
          newState.phase = 'showdown';
          newState.history += `\n--- SHOWDOWN ---\n`;
          
          const activePlayers = newState.players.filter(p => p.status === 'active');
          const solverFormat = (c) => (c.rank === '10' ? 'T' : c.rank) + c.suit[0];
          
          let bestHand = null;
          let winners = [];

          activePlayers.forEach(p => {
            const handStrs = [...p.cards, ...newState.board].map(solverFormat);
            const solvedHand = Hand.solve(handStrs);
            p.solvedHand = solvedHand;
            if (!bestHand || solvedHand.rank > bestHand.rank) {
              bestHand = solvedHand;
              winners = [p];
            } else if (solvedHand.rank === bestHand.rank) {
              const res = Hand.winners([bestHand, solvedHand]);
              if (res.length > 1) {
                winners.push(p);
              } else if (res[0] === solvedHand) {
                bestHand = solvedHand;
                winners = [p];
              }
            }
          });

          const splitAmt = Math.floor(newState.pot / winners.length);
          newState.winners = winners.map(w => ({
             user_id: w.user_id,
             amount: splitAmt
          }));
          winners.forEach(w => {
            const p = newState.players.find(pl => pl.user_id === w.user_id);
            p.chips += splitAmt;
            newState.history += `\n${p.display_name} wins $${splitAmt} with ${p.solvedHand.name}!`;
          });
          newState.pot = 0;
        }
      }

      if (newState.phase !== 'showdown') {
        newState.turnIndex = getNextActivePlayer(newState.players, -1);
        newState.turnStartTime = Date.now();
      }

      supabase.from('poker_rooms').update({ game_state: newState }).eq('id', room.id);
      
      if (newState.phase === 'showdown') {
        if (lastDealerTriggerRef.current !== newState.history) {
           lastDealerTriggerRef.current = newState.history;
           triggerAIDealer(newState.history);
        }
      }
    }
  }, [gs, amIHost, isPlaying, room?.id]);

  const startGame = async () => {
    try {
      if (!amIHost) return;

      const deck = createDeck();
      
      const gamePlayers = dbPlayers.map(p => {
        const existing = gs.players?.find(ep => ep.user_id === p.user_id);
        const chips = existing?.chips !== undefined ? existing.chips : p.chips;
        const isEliminated = gs.mode === 'tournament' && existing && chips <= 0;
        
        return {
          user_id: p.user_id,
          display_name: p.display_name,
          avatar: existing?.avatar || getAvatar(p.user_id),
          chips: chips,
          cards: [],
          bet: 0,
          status: isEliminated ? 'eliminated' : 'active',
          acted: false
        };
      });

      const activePlayers = gamePlayers.filter(p => p.status === 'active');

      if (activePlayers.length < 2) {
        if (gs.mode === 'tournament' && activePlayers.length === 1 && gs.players) {
            const winner = activePlayers[0];
            const endState = {
                ...gs,
                phase: 'waiting_for_players',
                history: `\n\n🏆 🏆 🏆 🏆 🏆\n${winner.display_name} HAS WON THE TOURNAMENT!\n🏆 🏆 🏆 🏆 🏆\n`,
                tournamentWinner: winner.display_name
            };
            await supabase.from('poker_rooms').update({ status: 'waiting', game_state: endState }).eq('id', room.id);
            return;
        }

        const initialState = {
          mode: gs.mode, startingChips: gs.startingChips, blindInterval: gs.blindInterval,
          phase: 'waiting_for_players',
          pot: 0, board: [], deck: [], players: gamePlayers, turnIndex: 0, 
          timerLength: gs.timerLength || timerConfig, turnStartTime: Date.now(),
          history: "--- TABLE OPEN ---\nWaiting for challengers to drop in...\n"
        };
        await supabase.from('poker_rooms').update({ status: 'playing', game_state: initialState }).eq('id', room.id);
        return;
      }

      let newBlindsLevel = gs.blindsLevel || 1;
      let newTourneyStart = gs.tournamentStartTime || Date.now();
      
      if (gs.mode === 'tournament' && gs.blindInterval) {
         const elapsedMs = Date.now() - newTourneyStart;
         const intervalMs = gs.blindInterval * 60 * 1000;
         if (elapsedMs > intervalMs * newBlindsLevel) {
            newBlindsLevel = Math.floor(elapsedMs / intervalMs) + 1;
         }
      }

      let sbAmt = 10;
      let bbAmt = 20;
      if (gs.mode === 'tournament') {
         sbAmt = 10 * Math.pow(2, newBlindsLevel - 1);
         bbAmt = 20 * Math.pow(2, newBlindsLevel - 1);
      }

      playSound('deal');
      activePlayers.forEach(p => p.cards = [deck.pop(), deck.pop()]);

      const actualSB = Math.min(activePlayers[0].chips, sbAmt);
      activePlayers[0].chips -= actualSB;
      activePlayers[0].bet = actualSB;

      const actualBB = Math.min(activePlayers[1].chips, bbAmt);
      activePlayers[1].chips -= actualBB;
      activePlayers[1].bet = actualBB;

      let historyStr = `--- NEW HAND ---\nBlinds posted (SB: ${sbAmt}, BB: ${bbAmt}).\n`;
      if (gs.mode === 'tournament' && newBlindsLevel > (gs.blindsLevel || 1)) {
         historyStr = `\n⚠️ --- BLINDS INCREASED! ---\nLevel ${newBlindsLevel}: ${sbAmt}/${bbAmt}\n\n` + historyStr;
      }

      const firstToAct = activePlayers.length > 2 ? 2 : 0;
      
      const initialState = {
        mode: gs.mode, startingChips: gs.startingChips, blindInterval: gs.blindInterval,
        tournamentStartTime: newTourneyStart, blindsLevel: newBlindsLevel,
        phase: 'preflop',
        pot: 0,
        board: [],
        deck: deck,
        players: gamePlayers,
        turnIndex: gamePlayers.indexOf(activePlayers[firstToAct]),
        timerLength: gs.timerLength || timerConfig,
        turnStartTime: Date.now(),
        history: historyStr
      };

      await supabase.from('poker_rooms').update({ status: 'playing', game_state: initialState }).eq('id', room.id);
    } catch (err) {
      console.error('Start Game Error:', err);
      alert('Failed to start game: ' + err.message);
    }
  };

  const handleAction = async (actionType, amount = 0) => {
    const newState = { ...gs };
    const myIndex = gs.turnIndex;
    const me = newState.players[myIndex];

    me.acted = true;

    if (actionType === 'fold') {
      me.status = 'fold';
      playSound('fold');
      newState.history += `${me.display_name} Folds.\n`;
    } 
    else if (actionType === 'call') {
      const maxBet = Math.max(...newState.players.map(p => p.bet));
      const toCall = maxBet - me.bet;
      const actualCall = Math.min(toCall, me.chips);
      me.chips -= actualCall;
      me.bet += actualCall;
      playSound('bet');
      newState.history += toCall === 0 ? `${me.display_name} Checks.\n` : `${me.display_name} Calls ${actualCall}.\n`;
    } 
    else if (actionType === 'raise') {
      const maxBet = Math.max(...newState.players.map(p => p.bet));
      const toCall = maxBet - me.bet;
      const totalAmount = toCall + amount;
      const actualRaise = Math.min(totalAmount, me.chips);
      me.chips -= actualRaise;
      me.bet += actualRaise;
      playSound('bet');
      
      newState.players.forEach((p, idx) => {
        if (idx !== myIndex && p.status === 'active') p.acted = false;
      });
      
      newState.history += `${me.display_name} Raises to ${me.bet}.\n`;
    }

    newState.turnIndex = getNextActivePlayer(newState.players, myIndex);
    newState.turnStartTime = Date.now();
    setShowRaiseOptions(false);

    await supabase.from('poker_rooms').update({ game_state: newState }).eq('id', room.id);
  };

  const handleLeaveTable = async () => {
    if (window.confirm("Are you sure you want to leave the table?")) {
      await supabase.from('poker_players').delete().eq('user_id', session.user.id).eq('room_id', room?.id);
      navigate('/multiplayer');
    }
  };

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (room?.id) supabase.from('poker_players').delete().eq('user_id', session.user.id).eq('room_id', room.id).then();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [room?.id, session.user.id]);

  if (loading) return <div style={{ color: 'white', padding: '2rem', textAlign: 'center' }}>Loading room...</div>;
  if (!room) return <div style={{ color: 'white', padding: '2rem', textAlign: 'center' }}>Room not found.</div>;

  const myTurn = isPlaying && gs.phase !== 'showdown' && gs.phase !== 'waiting_for_players' && gs.players?.[gs.turnIndex]?.user_id === session.user.id;
  const myPlayerState = gs.players?.find(p => p.user_id === session.user.id);
  const myIndexInArray = gs.players?.findIndex(p => p.user_id === session.user.id) || 0;
  const maxBet = gs.players ? Math.max(...gs.players.map(p => p.bet)) : 0;
  const toCallUI = myPlayerState ? maxBet - myPlayerState.bet : 0;

  return (
    <div className="multiplayer-container">
      
      <div className="landscape-prompt">
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🔄</div>
          <h2>Please Rotate Your Device</h2>
          <p>Poker Academy is best played in landscape mode.</p>
        </div>
      </div>

      <div className="multiplayer-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <button onClick={handleLeaveTable} style={{ background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>
          ← Leave Table
        </button>
        <div style={{ backgroundColor: 'rgba(0,0,0,0.5)', padding: '0.5rem 1.5rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Room Code: </span>
          <strong style={{ color: 'white', letterSpacing: '2px', fontSize: '1.2rem' }}>{room.code}</strong>
        </div>
      </div>

      {room.status === 'waiting' ? (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ textAlign: 'center', backgroundColor: 'var(--surface-color)', padding: '4rem', borderRadius: '2rem', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Waiting for players...</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '3rem', fontSize: '1.2rem' }}>Share code <strong>{room.code}</strong> with your friends to drop in!</p>
            
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '3rem' }}>
              {dbPlayers.map((p, i) => (
                <div key={i} style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '1rem', minWidth: '150px', border: p.user_id === session.user.id ? '2px solid var(--accent-color)' : '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{getAvatar(p.user_id)}</div>
                  <div style={{ fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '0.5rem' }}>{p.display_name}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{p.is_host ? '👑 Host' : 'Player'}</div>
                </div>
              ))}
            </div>

            {amIHost && (
               <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <label style={{ color: 'var(--text-secondary)' }}>Turn Timer:</label>
                    <select 
                      value={timerConfig} 
                      onChange={(e) => setTimerConfig(Number(e.target.value))} 
                      style={{ padding: '0.5rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-color)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}
                    >
                      <option value={15}>15 Seconds</option>
                      <option value={30}>30 Seconds</option>
                      <option value={60}>60 Seconds</option>
                      <option value={999999}>Unlimited</option>
                    </select>
                 </div>
                 <button className="btn-primary" onClick={startGame} style={{ padding: '1rem 3rem', fontSize: '1.2rem' }}>
                   Open Table
                 </button>
               </div>
            )}
            {!amIHost && (
               <p style={{ color: 'var(--accent-color)', fontStyle: 'italic' }}>Waiting for host to open the table...</p>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', overflow: 'hidden' }}>
          
          <div className="mobile-log-toggle" onClick={() => setIsLogOpen(true)}>📜</div>

          <div className={`mobile-log-panel ${isLogOpen ? 'open' : ''}`}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                <h3 style={{ margin: 0, color: 'var(--accent-color)' }}>📜 Action Log</h3>
                <button onClick={() => setIsLogOpen(false)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
             </div>
             <div style={{ flex: 1, overflowY: 'auto', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontFamily: 'monospace' }}>
              {gs.history?.split('\n').map((line, i) => {
                if (!line) return null;
                const escapedNames = dbPlayers.map(p => p.display_name ? p.display_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '').filter(Boolean);
                let parts = [line];
                if (escapedNames.length > 0) {
                   try {
                     const regex = new RegExp(`(${escapedNames.join('|')})`, 'g');
                     parts = line.split(regex);
                   } catch(e) {
                     console.error("Regex error:", e);
                   }
                }
                return (
                  <div key={i} style={{ padding: line.startsWith('---') ? '10px 0' : '0', color: line.startsWith('---') ? 'var(--accent-color)' : 'inherit', fontWeight: line.startsWith('---') ? 'bold' : 'normal' }}>
                    {parts.map((part, pIdx) => dbPlayers.some(p => p.display_name === part) ? <span key={pIdx} style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>{part}</span> : part)}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflowY: 'auto' }}>
             
             {/* Center Table */}
             <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                <div className="poker-table-oval">
                  {winnerAnimation && winnerAnimation.map((w, i) => {
                      const pIdx = gs.players.findIndex(p => p.user_id === w.user_id);
                      if (pIdx === -1) return null;
                      const offset = (pIdx - myIndexInArray + gs.players.length) % gs.players.length;
                      const seatClass = getSeatClass(gs.players.length, offset);
                      return <FlyingChips key={`anim-${i}`} seatClass={seatClass} amount={w.amount} />;
                  })}
                  
                  {gs.players?.map((p, idx) => {
                    const isMe = p.user_id === session.user.id;
                    const offset = (idx - myIndexInArray + gs.players.length) % gs.players.length;
                    const seatClass = getSeatClass(gs.players.length, offset);
                    const isTurn = gs.turnIndex === idx && gs.phase !== 'showdown' && gs.phase !== 'waiting_for_players';
                    
                    let timerPct = 100;
                    let timerColor = 'var(--accent-color)';
                    if (isTurn && timeLeft !== null && gs.timerLength) {
                      timerPct = (timeLeft / gs.timerLength) * 100;
                      if (timerPct < 25) timerColor = '#dc2626';
                      else if (timerPct < 50) timerColor = '#eab308';
                    }

                    const isBottomSeat = seatClass.includes('bottom');
                    const isEliminated = p.status === 'eliminated';

                    return (
                      <div key={idx} className={`seat-container ${seatClass} ${isBottomSeat ? 'bottom-seat' : ''}`} style={{ opacity: (p.status === 'fold' || p.status === 'sitting_out') ? 0.4 : (isEliminated ? 0.2 : 1), zIndex: isMe ? 10 : 5 }}>
                         
                         <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', zIndex: 2, position: 'relative' }}>
                           {isEliminated && (
                             <div style={{ position: 'absolute', top: '-25px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#000', color: 'red', border: '1px solid red', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', whiteSpace: 'nowrap', zIndex: 5, fontWeight: 'bold' }}>Eliminated</div>
                           )}
                           {p.status === 'sitting_out' && !isEliminated && (
                             <div style={{ position: 'absolute', top: '-25px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#dc2626', color: 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', whiteSpace: 'nowrap', zIndex: 5, fontWeight: 'bold' }}>Waiting for next hand</div>
                           )}
                           {idx === gs.dealerIndex && (
                              <div style={{ position: 'absolute', left: '-15px', top: '-15px', backgroundColor: 'white', color: 'black', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', fontSize: '12px', border: '2px solid #ccc', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>D</div>
                           )}

                           <div className={isTurn ? 'active-turn' : ''} style={{ backgroundColor: 'rgba(0,0,0,0.8)', padding: '0.5rem', borderRadius: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid rgba(255,255,255,0.2)', position: 'relative', overflow: 'hidden' }}>
                              {isTurn && gs.timerLength < 1000 && (
                                <div style={{ position: 'absolute', bottom: 0, left: 0, height: '4px', backgroundColor: timerColor, width: `${timerPct}%`, transition: 'width 0.1s linear, background-color 0.3s' }} />
                              )}
                              <div style={{ fontSize: '1.2rem', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '50%', width: '30px', height: '30px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                {p.avatar}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <p style={{ margin: 0, fontWeight: 'bold', color: 'white', fontSize: '0.9rem', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isMe ? 'You' : p.display_name}</p>
                                <p style={{ margin: 0, color: '#eab308', fontWeight: 'bold', fontSize: '0.8rem' }}>${p.chips}</p>
                              </div>
                           </div>
                           {p.bet > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                 <ChipStack amount={p.bet} />
                                 <span style={{ color: '#ccc', fontWeight: 'bold', fontSize: '0.9rem' }}>${p.bet}</span>
                              </div>
                           )}
                         </div>

                         <div className="sandbox-villain-wrapper" style={{ display: 'flex', gap: '5px', marginTop: isBottomSeat ? '5px' : '-10px', transform: 'scale(0.8)', transformOrigin: isBottomSeat ? 'top center' : 'bottom center' }}>
                           {p.cards?.map((c, i) => (
                             <div key={i}>
                               <Card suit={c.suit} rank={c.rank} isFaceUp={gs.phase === 'showdown' || isMe} disableFlip={true} />
                             </div>
                           ))}
                         </div>
                      </div>
                    );
                  })}

                  {gs.phase === 'waiting_for_players' && (
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: 'rgba(0,0,0,0.8)', padding: '2rem', borderRadius: '1rem', border: '2px dashed var(--accent-color)', zIndex: 10, textAlign: 'center' }}>
                      {gs.tournamentWinner ? (
                         <>
                           <h1 style={{ color: '#eab308', margin: '0 0 1rem 0', fontSize: '3rem', textShadow: '0 0 20px #eab308' }}>🏆 {gs.tournamentWinner} 🏆</h1>
                           <h2 style={{ color: 'white', margin: 0 }}>Wins the Tournament!</h2>
                         </>
                      ) : (
                         <h2 style={{ color: 'white', margin: 0 }}>Waiting for challengers...</h2>
                      )}
                    </div>
                  )}

                  <div style={{ position: 'absolute', top: '20px', left: '20px', backgroundColor: 'rgba(0,0,0,0.6)', padding: '1rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)', color: 'white', zIndex: 1 }}>
                     <h3 style={{ margin: '0 0 5px 0', color: 'var(--accent-color)' }}>Room: {code}</h3>
                     {gs.mode === 'tournament' && (
                        <div style={{ fontSize: '0.9rem' }}>
                          <div style={{ color: '#eab308', fontWeight: 'bold' }}>Tournament Mode</div>
                          <div>Blinds Level: {gs.blindsLevel || 1}</div>
                          <div>Interval: {gs.blindInterval}m</div>
                        </div>
                     )}
                  </div>

                  <div className="table-center-area">
                     <div style={{ backgroundColor: 'rgba(0,0,0,0.6)', padding: '0.5rem 2rem', borderRadius: '2rem', border: '2px solid #eab308', marginBottom: '1rem', boxShadow: '0 10px 20px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <ChipStack amount={gs.pot} />
                        <div>
                          <p style={{ margin: 0, color: '#aaa', fontSize: '0.8rem', textTransform: 'uppercase', textAlign: 'center', letterSpacing: '2px' }}>Main Pot</p>
                          <h2 style={{ margin: 0, color: '#eab308', fontSize: '1.5rem', textShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>${gs.pot}</h2>
                        </div>
                     </div>
                     <div className="sandbox-board-wrapper" style={{ display: 'flex', gap: '8px' }}>
                        {gs.board?.map((c, i) => (
                          <div key={i}>
                             <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
                          </div>
                        ))}
                     </div>
                  </div>
                </div>
             </div>
             
             {/* Action Buttons */}
             <div className="action-bar-bottom">
                 {gs.phase === 'showdown' || gs.phase === 'waiting_for_players' ? (
                   amIHost && <button className="btn-primary" onClick={startGame} disabled={dbPlayers.length < 2 || isAiThinking || winnerAnimation} style={{ padding: '1rem 2rem', fontSize: '1.2rem', boxShadow: '0 0 20px var(--accent-color)', whiteSpace: 'nowrap', opacity: (isAiThinking || winnerAnimation) ? 0.5 : 1 }}>{gs.phase === 'waiting_for_players' ? 'Start Hand' : (isAiThinking ? 'AI Dealer Typing...' : 'Play Next Hand')}</button>
                 ) : (
                   myPlayerState?.status !== 'sitting_out' && (
                     <>
                       {showRaiseOptions ? (
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: 'rgba(0,0,0,0.8)', padding: '1rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                           <div style={{ display: 'flex', gap: '5px' }}>
                             <button className="btn-primary" style={{ flex: 1, padding: '0.5rem' }} onClick={() => handleAction('raise', 20)}>Min</button>
                             <button className="btn-primary" style={{ flex: 1, padding: '0.5rem' }} onClick={() => handleAction('raise', Math.floor(gs.pot * 0.5))}>1/2 Pot</button>
                             <button className="btn-primary" style={{ flex: 1, padding: '0.5rem' }} onClick={() => handleAction('raise', gs.pot)}>Pot</button>
                             <button className="btn-primary" style={{ flex: 1, padding: '0.5rem', backgroundColor: 'var(--danger-color)' }} onClick={() => handleAction('raise', myPlayerState?.chips || 0)}>All-In</button>
                           </div>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
                             <input 
                               type="range" 
                               min={20} 
                               max={myPlayerState?.chips || 1000} 
                               value={customBet} 
                               onChange={(e) => setCustomBet(Number(e.target.value))}
                               style={{ flex: 1, cursor: 'pointer' }}
                             />
                             <span style={{ color: 'white', minWidth: '40px', fontWeight: 'bold' }}>${customBet}</span>
                           </div>
                           <button className="btn-primary" onClick={() => handleAction('raise', customBet)} style={{ backgroundColor: 'var(--accent-color)', marginTop: '5px' }}>Bet ${customBet}</button>
                           <button className="btn-secondary" onClick={() => setShowRaiseOptions(false)} style={{ marginTop: '5px' }}>Cancel</button>
                         </div>
                       ) : (
                         <div style={{ display: 'flex', gap: '10px', opacity: myTurn ? 1 : 0, pointerEvents: myTurn ? 'auto' : 'none', transition: 'opacity 0.2s', transform: myTurn ? 'translateY(0)' : 'translateY(20px)' }}>
                           <button className="btn-primary" onClick={() => handleAction('fold')} style={{ flex: 1, padding: '0.8rem 0.5rem', backgroundColor: 'var(--danger-color)' }}>Fold</button>
                           <button className="btn-primary" onClick={() => handleAction('call')} style={{ flex: 1, padding: '0.8rem 0.5rem' }}>
                             {toCallUI > 0 ? `Call ${toCallUI}` : 'Check'}
                           </button>
                           <button className="btn-primary" onClick={() => setShowRaiseOptions(true)} style={{ flex: 1, padding: '0.8rem 0.5rem', backgroundColor: 'var(--accent-color)' }}>
                             {toCallUI > 0 ? 'Raise' : 'Bet'}
                           </button>
                         </div>
                       )}
                     </>
                   )
                 )}
              </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
};

export default MultiplayerTable;
