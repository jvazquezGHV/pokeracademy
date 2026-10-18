import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import Card from './Card';
import ChipStack from './ChipStack';
import { createDeck, getNextActivePlayer, checkRoundComplete } from '../utils/multiplayerLogic';
import { Hand } from 'pokersolver';
import { preloadAudio, playSound } from '../utils/audio';
import './Multiplayer.css';

const AVATARS = ['😎', '🤠', '👽', '🤖', '🦊', '🐷', '🦄', '🦁', '🐻', '🐼'];
const getAvatar = (userId) => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return AVATARS[Math.abs(hash) % AVATARS.length];
};

const getSeatClass = (playerCount, offset) => {
  // Always seat the hero (offset 0) at the bottom
  if (offset === 0) return 'mp-seat-bottom';
  
  if (playerCount === 2) {
    if (offset === 1) return 'mp-seat-top';
  } else if (playerCount === 3) {
    if (offset === 1) return 'mp-seat-top-left';
    if (offset === 2) return 'mp-seat-top-right';
  } else if (playerCount === 4) {
    if (offset === 1) return 'mp-seat-bottom-left';
    if (offset === 2) return 'mp-seat-top';
    if (offset === 3) return 'mp-seat-bottom-right';
  } else if (playerCount === 5) {
    if (offset === 1) return 'mp-seat-bottom-left';
    if (offset === 2) return 'mp-seat-top-left';
    if (offset === 3) return 'mp-seat-top-right';
    if (offset === 4) return 'mp-seat-bottom-right';
  } else {
    // 6 players
    const seats = [
      'mp-seat-bottom', 
      'mp-seat-bottom-left', 
      'mp-seat-top-left', 
      'mp-seat-top', 
      'mp-seat-top-right', 
      'mp-seat-bottom-right'
    ];
    return seats[offset] || 'mp-seat-bottom';
  }
  return 'mp-seat-top';
};

const FlyingChips = ({ seatClass, amount }) => {
  const [active, setActive] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setActive(true));
  }, []);
  
  return (
    <div className={`mp-seat-cluster ${seatClass}`} style={{ zIndex: 1000, pointerEvents: 'none' }}>
      <div style={{
         transition: 'all 1s cubic-bezier(0.2, 0.8, 0.2, 1)',
         transform: active ? 'translateY(0) scale(1)' : 'translateY(80px) scale(0)',
         opacity: active ? 1 : 0,
         display: 'flex',
         flexDirection: 'column',
         alignItems: 'center'
      }}>
         <ChipStack amount={amount} />
         <div style={{ color: '#fbbf24', fontWeight: '800', textShadow: '0 2px 8px rgba(0,0,0,0.8)', fontSize: '1.4rem' }}>
           +${amount}
         </div>
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
  const [customBet, setCustomBet] = useState(40);
  const [timerConfig, setTimerConfig] = useState(30);
  
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const logEndRef = useRef(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [winnerAnimation, setWinnerAnimation] = useState(null);
  const animationPlayed = useRef(false);

  const gs = room?.game_state || {};
  const amIHost = dbPlayers.find(p => p.user_id === session.user.id)?.is_host;
  const isPlaying = room?.status === 'playing';

  // Sound wrapper
  const triggerSound = (name) => {
    if (!isMuted) {
      playSound(name);
    }
  };

  useEffect(() => { preloadAudio(); }, []);

  // 1-Click Code Copy
  const handleCopyCode = () => {
    if (!room?.code) return;
    navigator.clipboard.writeText(room.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  useEffect(() => {
    if (gs.phase !== 'showdown') {
       animationPlayed.current = false;
       setWinnerAnimation(null);
    } else if (gs.phase === 'showdown' && gs.winners && !animationPlayed.current) {
       animationPlayed.current = true;
       setWinnerAnimation(gs.winners);
       const t = setTimeout(() => setWinnerAnimation(null), 2500);
       return () => clearTimeout(t);
    }
  }, [gs.phase, gs.winners]);

  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [gs.history]);

  const subscriptionsRef = useRef(false);

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

        let currentPlayers = playersData;
        const isAlreadyInRoom = currentPlayers.some(p => p.user_id === session.user.id);
        
        if (!isAlreadyInRoom && currentPlayers.length < 6) {
          const { error: joinError } = await supabase.from('poker_players').insert([{
            room_id: roomData.id,
            user_id: session.user.id,
            display_name: session.user.email ? session.user.email.split('@')[0] : `Guest_${Math.floor(Math.random() * 1000)}`,
            seat_index: currentPlayers.length,
            chips: roomData.game_state?.startingChips || 1000,
            is_host: false
          }]);
          
          if (!joinError) {
            const { data: newPlayers } = await supabase.from('poker_players').select('*').eq('room_id', roomData.id).order('seat_index', { ascending: true });
            if (newPlayers) currentPlayers = newPlayers;
          }
        }

        // Self-heal: If I am in currentPlayers but NOT in gs.players, add myself!
        const meInDb = currentPlayers.find(p => p.user_id === session.user.id);
        if (meInDb && roomData.status === 'playing' && roomData.game_state?.players) {
           const amIInGameState = roomData.game_state.players.find(p => p.user_id === session.user.id);
           if (!amIInGameState && roomData.game_state.mode !== 'tournament') {
              const newGs = { ...roomData.game_state, players: [...roomData.game_state.players] };
              newGs.players.push({
                 user_id: meInDb.user_id,
                 display_name: meInDb.display_name,
                 avatar: getAvatar(meInDb.user_id),
                 chips: meInDb.chips,
                 cards: [],
                 bet: 0,
                 status: 'sitting_out',
                 acted: false
              });
              newGs.history += `\n>>> ${meInDb.display_name} dropped into an open seat!`;
              setRoom(prev => ({ ...prev, game_state: newGs }));
              await supabase.from('poker_rooms').update({ game_state: newGs }).eq('id', roomData.id);
           }
        }

        setDbPlayers(currentPlayers);

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
  }, [code, navigate, session.user.email, session.user.id]);

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
  }, [dbPlayers, amIHost, isPlaying, gs, room?.id]);

  // Host Auto-Fold Timer
  useEffect(() => {
    if (!amIHost || !isPlaying || gs.phase === 'showdown' || gs.phase === 'waiting_for_players' || !gs.timerLength) return;
    const interval = setInterval(async () => {
      try {
        const elapsed = (Date.now() - gs.turnStartTime) / 1000;
        if (elapsed >= gs.timerLength) {
          const newState = JSON.parse(JSON.stringify(gs));
          const idx = gs.turnIndex;
          const target = newState.players[idx];
          if (!target) return;
          target.acted = true;
          target.status = 'fold';
          newState.history += `${target.display_name} Times Out & Auto-Folds.\n`;
          newState.turnIndex = getNextActivePlayer(newState.players, idx);
          newState.turnStartTime = Date.now();
          const { error } = await supabase.from('poker_rooms').update({ game_state: newState }).eq('id', room.id);
          if (error) console.error("Auto-fold update error:", error);
        }
      } catch (err) {
        console.error("Auto fold timer error:", err);
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
      if (gs.players?.[gs.turnIndex]?.user_id === session.user.id) triggerSound('turn');
      prevTurnIndex.current = gs.turnIndex;
    }
    if (isPlaying && gs.phase !== prevPhase.current && gs.phase !== 'waiting_for_players') {
      triggerSound('deal');
      prevPhase.current = gs.phase;
    }
  }, [gs.turnIndex, gs.phase, isPlaying, session.user.id]);

  // Host Round Completion (Streets advancement & Showdown evaluation)
  useEffect(() => {
    if (!amIHost || !isPlaying || !gs.phase) return;
    if (gs.phase === 'showdown' || gs.phase === 'waiting_for_players') return;

    if (checkRoundComplete(gs.players)) {
      try {
        const newState = JSON.parse(JSON.stringify(gs));
      
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
            newState.history += `\n${winner.display_name} scoops $${newState.pot} (Everyone else folded).`;
            newState.pot = 0;
            newState.phase = 'showdown';
          }
        } else {
          if (gs.phase === 'preflop') {
            newState.phase = 'flop';
            newState.board = [newState.deck.pop(), newState.deck.pop(), newState.deck.pop()];
            newState.history += `\n--- FLOP: [${newState.board.map(c => `${c.rank} of ${c.suit}`).join(", ")}] ---\n`;
          } else if (gs.phase === 'flop') {
            const turnCard = newState.deck.pop();
            newState.phase = 'turn';
            newState.board.push(turnCard);
            newState.history += `\n--- TURN: [${turnCard.rank} of ${turnCard.suit}] ---\n`;
          } else if (gs.phase === 'turn') {
            const riverCard = newState.deck.pop();
            newState.phase = 'river';
            newState.board.push(riverCard);
            newState.history += `\n--- RIVER: [${riverCard.rank} of ${riverCard.suit}] ---\n`;
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
              newState.history += `${p.display_name} wins $${splitAmt} with ${p.solvedHand.descr}!\n`;
            });
            newState.pot = 0;
          }
        }

        if (newState.phase !== 'showdown') {
          // Postflop: first active player to the left of the dealer button acts first!
          const dealerPos = newState.dealerIndex !== undefined ? newState.dealerIndex : -1;
          newState.turnIndex = getNextActivePlayer(newState.players, dealerPos);
          newState.turnStartTime = Date.now();
        }

        supabase.from('poker_rooms').update({ game_state: newState }).eq('id', room.id).then(({ error }) => {
            if (error) console.error("Round completion update error:", error);
        });
      
      } catch (err) {
        console.error("Round Completion Error:", err);
      }
    }
  }, [gs, amIHost, isPlaying, room?.id]);

  // Start / Deal Next Hand with ROTATING DEALER BUTTON & DYNAMIC BLINDS
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

      triggerSound('deal');
      activePlayers.forEach(p => {
        p.cards = [deck.pop(), deck.pop()];
      });

      // --- ROTATING DEALER BUTTON & BLINDS ORDER ---
      let nextDealerActiveIdx = 0;
      if (gs.dealerIndex !== undefined && gs.dealerIndex !== null && gs.players) {
        const prevDealerUserId = gs.players[gs.dealerIndex]?.user_id;
        const found = activePlayers.findIndex(p => p.user_id === prevDealerUserId);
        if (found !== -1) {
          nextDealerActiveIdx = (found + 1) % activePlayers.length;
        }
      }

      const dealerPlayer = activePlayers[nextDealerActiveIdx];
      const dealerIndexInGame = gamePlayers.indexOf(dealerPlayer);

      let sbPlayer, bbPlayer, firstToAct;
      if (activePlayers.length === 2) {
        // Heads-up: Dealer is SB and acts first preflop!
        sbPlayer = dealerPlayer;
        bbPlayer = activePlayers[(nextDealerActiveIdx + 1) % 2];
        firstToAct = dealerPlayer;
      } else {
        // 3+ players: SB is next after dealer, BB is next after SB, UTG acts first
        sbPlayer = activePlayers[(nextDealerActiveIdx + 1) % activePlayers.length];
        bbPlayer = activePlayers[(nextDealerActiveIdx + 2) % activePlayers.length];
        firstToAct = activePlayers[(nextDealerActiveIdx + 3) % activePlayers.length];
      }

      const actualSB = Math.min(sbPlayer.chips, sbAmt);
      sbPlayer.chips -= actualSB;
      sbPlayer.bet = actualSB;

      const actualBB = Math.min(bbPlayer.chips, bbAmt);
      bbPlayer.chips -= actualBB;
      bbPlayer.bet = actualBB;

      let historyStr = `--- NEW HAND ---\nBlinds posted (${sbPlayer.display_name} SB: $${actualSB}, ${bbPlayer.display_name} BB: $${actualBB}).\n`;
      if (gs.mode === 'tournament' && newBlindsLevel > (gs.blindsLevel || 1)) {
         historyStr = `\n⚠️ --- BLINDS INCREASED! ---\nLevel ${newBlindsLevel}: ${sbAmt}/${bbAmt}\n\n` + historyStr;
      }

      const initialState = {
        mode: gs.mode, 
        startingChips: gs.startingChips, 
        blindInterval: gs.blindInterval,
        tournamentStartTime: newTourneyStart, 
        blindsLevel: newBlindsLevel,
        phase: 'preflop',
        pot: 0,
        board: [],
        deck: deck,
        players: gamePlayers,
        dealerIndex: dealerIndexInGame,
        sbIndex: gamePlayers.indexOf(sbPlayer),
        bbIndex: gamePlayers.indexOf(bbPlayer),
        turnIndex: gamePlayers.indexOf(firstToAct),
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
    try {
      const newState = JSON.parse(JSON.stringify(gs));
      const myIndex = gs.turnIndex;
      const me = newState.players[myIndex];

      me.acted = true;

      if (actionType === 'fold') {
        me.status = 'fold';
        triggerSound('fold');
        newState.history += `${me.display_name} Folds.\n`;
      } 
      else if (actionType === 'call') {
        const maxBet = Math.max(...newState.players.map(p => p.bet));
        const toCall = maxBet - me.bet;
        const actualCall = Math.min(toCall, me.chips);
        me.chips -= actualCall;
        me.bet += actualCall;
        triggerSound('bet');
        newState.history += toCall === 0 ? `${me.display_name} Checks.\n` : `${me.display_name} Calls $${actualCall}.\n`;
      } 
      else if (actionType === 'raise') {
        const maxBet = Math.max(...newState.players.map(p => p.bet));
        const toCall = maxBet - me.bet;
        const totalAmount = toCall + amount;
        const actualRaise = Math.min(totalAmount, me.chips);
        me.chips -= actualRaise;
        me.bet += actualRaise;
        triggerSound('bet');
        
        newState.players.forEach((p, idx) => {
          if (idx !== myIndex && p.status === 'active') p.acted = false;
        });
        
        newState.history += `${me.display_name} Raises to $${me.bet}.\n`;
      }

      newState.turnIndex = getNextActivePlayer(newState.players, myIndex);
      newState.turnStartTime = Date.now();
      setShowRaiseOptions(false);

      const { error } = await supabase.from('poker_rooms').update({ game_state: newState }).eq('id', room.id);
      if (error) console.error("Action update error:", error);
    } catch (err) {
      console.error("Action handler error:", err);
    }
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

  // Derived telemetry
  const myPlayerState = gs.players?.find(p => p.user_id === session.user.id);
  const myIndexInArray = gs.players?.findIndex(p => p.user_id === session.user.id) || 0;
  const maxBet = gs.players ? Math.max(...gs.players.map(p => p.bet)) : 0;
  const toCallUI = myPlayerState ? Math.max(0, maxBet - myPlayerState.bet) : 0;
  const myTurn = isPlaying && gs.phase !== 'showdown' && gs.phase !== 'waiting_for_players' && gs.players?.[gs.turnIndex]?.user_id === session.user.id;

  let currentBB = 20;
  if (gs.mode === 'tournament' && gs.blindsLevel) {
    currentBB = 20 * Math.pow(2, gs.blindsLevel - 1);
  }

  const potAfterCall = (gs.pot || 0) + toCallUI;
  const potOddsPct = toCallUI > 0 && potAfterCall > 0 
    ? Math.round((toCallUI / potAfterCall) * 100) 
    : 0;

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (gs.phase === 'showdown' || gs.phase === 'waiting_for_players') {
        if ((e.code === 'Space' || e.key === 'Enter') && amIHost && !winnerAnimation) {
          e.preventDefault();
          startGame();
        }
        return;
      }
      if (myTurn) {
        if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          handleAction('fold');
        } else if (e.key === 'c' || e.key === 'C' || e.code === 'Space') {
          e.preventDefault();
          handleAction('call');
        } else if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          setShowRaiseOptions(prev => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [myTurn, gs.phase, amIHost, winnerAnimation]);

  // Bet presets
  const setBetPreset = (type) => {
    const currentPot = gs.pot || 0;
    const maxChips = myPlayerState?.chips || 1000;
    if (type === 'min') {
      setCustomBet(Math.min(maxChips, currentBB));
    } else if (type === 'half') {
      setCustomBet(Math.min(maxChips, Math.max(currentBB, Math.floor(currentPot * 0.5))));
    } else if (type === 'pot') {
      setCustomBet(Math.min(maxChips, Math.max(currentBB, currentPot)));
    } else if (type === 'allin') {
      setCustomBet(maxChips);
    }
  };

  if (loading) {
    return (
      <div className="mp-workstation" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#38bdf8', fontSize: '1.2rem', fontWeight: '700' }}>Loading Poker Arena...</div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="mp-workstation" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#f87171', fontSize: '1.2rem', fontWeight: '700' }}>Table not found.</div>
      </div>
    );
  }

  return (
    <div className="mp-workstation">
      
      {/* --------------------------------------------------
          TOP NAVIGATION & ROOM STATUS BAR
          -------------------------------------------------- */}
      <header className="mp-topbar">
        <div className="mp-topbar-left">
          <button onClick={handleLeaveTable} className="mp-btn-exit" title="Leave table and return to lobby">
            <span>←</span> Leave
          </button>
          
          <div className="mp-title-badge">
            <h1>Multiplayer Arena</h1>
            <span className="mp-mode-tag">
              {gs.mode === 'tournament' ? `Tourney Lvl ${gs.blindsLevel || 1}` : 'Cash $10/$20'}
            </span>
          </div>
        </div>

        {/* Center Room Code Pill with 1-Click Copy */}
        <div className="mp-topbar-center">
          <div className="mp-room-code-pill" onClick={handleCopyCode} title="Click to copy Room Code">
            <span className="mp-code-label">CODE:</span>
            <span className="mp-code-value">{room.code}</span>
            <span className="mp-copy-hint">{copiedCode ? '✓ Copied' : '📋 Copy'}</span>
          </div>
        </div>

        {/* Right Tools & Drawer Toggle */}
        <div className="mp-topbar-right">
          <div className="mp-players-count-badge">
            👥 {dbPlayers.length}/6 Players
          </div>

          <button 
            className="mp-btn-tool" 
            onClick={() => setIsMuted(!isMuted)} 
            title={isMuted ? "Unmute Sound" : "Mute Sound"}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>

          <button 
            className={`mp-btn-log-toggle ${isLogOpen ? 'active' : ''}`}
            onClick={() => setIsLogOpen(!isLogOpen)}
            title="Toggle Action Log Drawer"
          >
            <span>📜</span>
            <span>Action Log</span>
            <span>{isLogOpen ? '✕' : '▶'}</span>
          </button>
        </div>
      </header>

      {/* --------------------------------------------------
          WAITING LOUNGE (BEFORE GAME STARTS)
          -------------------------------------------------- */}
      {room.status === 'waiting' ? (
        <div className="mp-waiting-lounge">
          <div className="mp-lounge-card">
            <div className="mp-lounge-header">
              <h2>Private Table Lounge</h2>
              <p>Waiting for players to take their seats. Minimum 2 players required to deal.</p>
            </div>

            {/* Room Code Share Banner */}
            <div className="mp-code-share-banner">
              <div className="mp-code-share-text">
                <span>SHARE THIS CODE WITH FRIENDS</span>
                <strong>{room.code}</strong>
              </div>
              <button className="mp-btn-copy-code" onClick={handleCopyCode}>
                <span>{copiedCode ? '✓ Copied!' : '📋 Copy Code'}</span>
              </button>
            </div>

            {/* Players in Waiting Room */}
            <div className="mp-lounge-players-grid">
              {dbPlayers.map((p, i) => {
                const isMe = p.user_id === session.user.id;
                return (
                  <div key={i} className={`mp-lounge-player-card ${isMe ? 'is-me' : ''}`}>
                    <div className="mp-lounge-avatar">{getAvatar(p.user_id)}</div>
                    <div className="mp-lounge-name">{isMe ? 'You' : p.display_name}</div>
                    <div className={`mp-lounge-role ${p.is_host ? 'host' : ''}`}>
                      {p.is_host ? '👑 Host' : 'Player'}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Host Controls */}
            {amIHost ? (
              <div className="mp-lounge-host-controls">
                <div className="mp-timer-select-row">
                  <label>Turn Countdown Timer:</label>
                  <select 
                    value={timerConfig} 
                    onChange={(e) => setTimerConfig(Number(e.target.value))}
                    className="mp-timer-select"
                  >
                    <option value={15}>15 Seconds (Blitz)</option>
                    <option value={30}>30 Seconds (Standard)</option>
                    <option value={60}>60 Seconds (Deep)</option>
                    <option value={999999}>Unlimited</option>
                  </select>
                </div>

                <button 
                  className="mp-btn-start-table" 
                  onClick={startGame}
                  disabled={dbPlayers.length < 2}
                >
                  {dbPlayers.length < 2 ? 'Need 2+ Players to Deal' : 'Open Table & Deal Hand'}
                </button>
              </div>
            ) : (
              <p className="mp-waiting-host-hint">
                Waiting for the room host to open the table and deal cards...
              </p>
            )}
          </div>
        </div>
      ) : (
        /* --------------------------------------------------
           LIVE POKER TABLE ARENA
           -------------------------------------------------- */
        <div className="mp-main-split">
          <main className="mp-arena-workspace">
            
            {/* The Table Stage */}
            <div className="mp-table-stage">
              <div className="mp-poker-table">
                
                {/* Outer Leather Rail */}
                <div className="mp-table-rail">
                  
                  {/* Inner Emerald Felt */}
                  <div className="mp-table-felt">
                    
                    {/* Felt Watermark & Elliptical Betting Line */}
                    <div className="mp-felt-watermark">POKER ACADEMY • MULTIPLAYER ARENA</div>
                    <div className="mp-betting-line"></div>

                    {/* Chip Scoop Animations */}
                    {winnerAnimation && winnerAnimation.map((w, i) => {
                      const pIdx = gs.players?.findIndex(p => p.user_id === w.user_id);
                      if (pIdx === -1 || pIdx === undefined) return null;
                      const offset = (pIdx - myIndexInArray + gs.players.length) % gs.players.length;
                      const seatClass = getSeatClass(gs.players.length, offset);
                      return <FlyingChips key={`anim-${i}`} seatClass={seatClass} amount={w.amount} />;
                    })}

                    {/* ------------------------------------
                        SEATS (UP TO 6 PLAYERS)
                        ------------------------------------ */}
                    {gs.players?.map((p, idx) => {
                      const isMe = p.user_id === session.user.id;
                      const offset = (idx - myIndexInArray + gs.players.length) % gs.players.length;
                      const seatClass = getSeatClass(gs.players.length, offset);
                      const isTurn = gs.turnIndex === idx && gs.phase !== 'showdown' && gs.phase !== 'waiting_for_players';
                      const laneClass = seatClass.replace('mp-seat-', 'lane-');

                      let timerPct = 100;
                      let timerColor = '#10b981';
                      if (isTurn && timeLeft !== null && gs.timerLength) {
                        timerPct = Math.max(0, (timeLeft / gs.timerLength) * 100);
                        if (timerPct < 25) timerColor = '#ef4444';
                        else if (timerPct < 50) timerColor = '#f59e0b';
                      }

                      const isEliminated = p.status === 'eliminated';
                      const isSittingOut = p.status === 'sitting_out';
                      const isFolded = p.status === 'fold';

                      const isDealer = idx === gs.dealerIndex;
                      const isSB = idx === gs.sbIndex;
                      const isBB = idx === gs.bbIndex;

                      return (
                        <React.Fragment key={idx}>
                          {/* Player Seat Cluster */}
                          <div 
                            className={`mp-seat-cluster ${seatClass}`}
                            style={{ 
                              opacity: isFolded ? 0.35 : (isSittingOut ? 0.45 : (isEliminated ? 0.25 : 1)),
                              zIndex: isMe ? 28 : 22
                            }}
                          >
                            <div className="mp-seat-pod">
                              
                              {/* Status Tag */}
                              {isEliminated && <div className="mp-status-tag eliminated">Eliminated</div>}
                              {isSittingOut && !isEliminated && <div className="mp-status-tag sitting-out">Sitting Out</div>}
                              {isFolded && !isEliminated && <div className="mp-status-tag fold">Folded</div>}

                              {/* Hole Cards */}
                              <div className="mp-hole-cards-wrapper">
                                {p.cards?.map((c, cIdx) => (
                                  <div key={cIdx}>
                                    <Card 
                                      suit={c.suit} 
                                      rank={c.rank} 
                                      isFaceUp={gs.phase === 'showdown' || isMe} 
                                      disableFlip={true} 
                                    />
                                  </div>
                                ))}
                              </div>

                              {/* Showdown Solved Hand Desc */}
                              {gs.phase === 'showdown' && p.solvedHand && (
                                <div className="mp-made-hand-badge">
                                  {p.solvedHand.descr}
                                </div>
                              )}

                              {/* Player Plate */}
                              <div className={`mp-player-plate ${isTurn ? 'is-active-turn' : ''}`}>
                                
                                {/* Turn Countdown Line */}
                                {isTurn && gs.timerLength < 1000 && (
                                  <div 
                                    className="mp-turn-timer-progress" 
                                    style={{ width: `${timerPct}%`, backgroundColor: timerColor }}
                                  />
                                )}

                                {/* Avatar */}
                                <div className="mp-player-avatar">
                                  {p.avatar || getAvatar(p.user_id)}
                                  {dbPlayers.find(dp => dp.user_id === p.user_id)?.is_host && (
                                    <span className="mp-host-crown" title="Host">👑</span>
                                  )}
                                </div>

                                {/* Meta Info */}
                                <div className="mp-player-meta">
                                  <div className="mp-player-name-row">
                                    <span className="mp-player-name">
                                      {isMe ? 'Hero (You)' : p.display_name}
                                    </span>
                                    
                                    {/* Position Badges */}
                                    {isDealer && <span className="dealer-button-badge" title="Dealer Button">D</span>}
                                    {isSB && <span className="blind-badge sb">SB</span>}
                                    {isBB && <span className="blind-badge bb">BB</span>}
                                  </div>

                                  <div className="mp-player-chips-row">
                                    <span className="mp-player-chips-val">${p.chips}</span>
                                    <span className="mp-player-bb-val">
                                      ({Math.round(p.chips / currentBB)} bb)
                                    </span>
                                  </div>
                                </div>

                              </div>
                            </div>
                          </div>

                          {/* Committed Bet Felt Lane */}
                          {p.bet > 0 && (
                            <div className={`mp-bet-lane ${laneClass}`}>
                              <ChipStack amount={p.bet} />
                              <span className="mp-bet-amount">${p.bet}</span>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {/* Tournament Winner Announcement */}
                    {gs.phase === 'waiting_for_players' && gs.tournamentWinner && (
                      <div className="mp-tournament-winner-banner">
                        <h1>🏆 {gs.tournamentWinner} 🏆</h1>
                        <h2>Wins the Tournament!</h2>
                      </div>
                    )}

                    {/* ------------------------------------
                        CENTER ARENA: POT & COMMUNITY BOARD
                        ------------------------------------ */}
                    <div className="mp-center-hub">
                      {/* Illuminated Pot Hub */}
                      <div className="mp-pot-hub">
                        <span className="mp-pot-street">
                          {(gs.phase || 'PREFLOP').toUpperCase()}
                        </span>
                        <div style={{ transform: 'scale(0.55)', width: '22px', height: '18px' }}>
                          <ChipStack amount={gs.pot || 0} />
                        </div>
                        <span className="mp-pot-amount">${gs.pot || 0}</span>
                        <span className="mp-pot-bb">
                          ({((gs.pot || 0) / currentBB).toFixed(1)} bb)
                        </span>
                        {toCallUI > 0 && myTurn && gs.phase !== 'showdown' && (
                          <span className="mp-pot-odds">
                            Odds: <strong>{potOddsPct}%</strong>
                          </span>
                        )}
                      </div>

                      {/* Community Board with Placeholders */}
                      <div className="mp-board-row">
                        {gs.board && gs.board.length > 0 ? (
                          gs.board.map((c, i) => (
                            <div key={i}>
                              <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
                            </div>
                          ))
                        ) : null}

                        {/* Empty Placeholder Card Outlines */}
                        {Array.from({ length: 5 - (gs.board?.length || 0) }).map((_, i) => (
                          <div key={i} className="mp-card-slot">
                            <span>♠</span>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </div>

            {/* --------------------------------------------------
                BOTTOM ACTION COMMAND CENTER
                -------------------------------------------------- */}
            <div className="mp-action-center">
              {gs.phase === 'showdown' || gs.phase === 'waiting_for_players' ? (
                amIHost ? (
                  <button 
                    className="mp-btn-next-hand" 
                    onClick={startGame} 
                    disabled={dbPlayers.length < 2 || Boolean(winnerAnimation)}
                    title="Shortcut: Press [Space] or [Enter]"
                  >
                    <span>{gs.phase === 'waiting_for_players' ? 'Start Hand' : 'Deal Next Hand'}</span>
                    <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>[Space]</span>
                  </button>
                ) : (
                  <div className="mp-waiting-turn-pill">
                    <span className="mp-turn-pulse-dot"></span>
                    <span>Waiting for Host to deal next hand...</span>
                  </div>
                )
              ) : (
                myPlayerState?.status !== 'sitting_out' && (
                  <>
                    {/* Sizing Presets & Slider Drawer */}
                    {showRaiseOptions ? (
                      <div className="mp-smart-sizing">
                        {/* Presets Bar */}
                        <div className="mp-presets-row">
                          <button className="mp-btn-preset" onClick={() => setBetPreset('min')}>Min (2x)</button>
                          <button className="mp-btn-preset" onClick={() => setBetPreset('half')}>1/2 Pot</button>
                          <button className="mp-btn-preset" onClick={() => setBetPreset('pot')}>Pot</button>
                          <button className="mp-btn-preset allin" onClick={() => setBetPreset('allin')}>All-In</button>
                        </div>

                        {/* Slider Row */}
                        <div className="mp-slider-row">
                          <button 
                            className="mp-btn-stepper" 
                            onClick={() => setCustomBet(prev => Math.max(currentBB, prev - currentBB))}
                          >
                            -
                          </button>
                          <input 
                            type="range"
                            min={currentBB}
                            max={myPlayerState?.chips || 1000}
                            step={5}
                            value={customBet}
                            onChange={(e) => setCustomBet(Number(e.target.value))}
                            className="mp-slider-input"
                          />
                          <button 
                            className="mp-btn-stepper" 
                            onClick={() => setCustomBet(prev => Math.min(myPlayerState?.chips || 1000, prev + currentBB))}
                          >
                            +
                          </button>
                          <div className="mp-slider-readout">
                            <span className="mp-readout-chips">${customBet}</span>
                            <span className="mp-readout-bb">({(customBet / currentBB).toFixed(1)} bb)</span>
                          </div>
                        </div>

                        {/* Confirm / Cancel */}
                        <div className="mp-confirm-row">
                          <button 
                            className="mp-btn-confirm" 
                            onClick={() => handleAction('raise', customBet)}
                            disabled={!myTurn}
                          >
                            Confirm Bet ${customBet}
                          </button>
                          <button 
                            className="mp-btn-cancel" 
                            onClick={() => setShowRaiseOptions(false)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Standard 3-Action Buttons */
                      myTurn ? (
                        <div className="mp-actions-grid">
                          {/* FOLD */}
                          <button 
                            className="mp-action-btn mp-btn-fold" 
                            onClick={() => handleAction('fold')}
                            title="Shortcut: Press [F]"
                          >
                            <span className="mp-btn-hotkey">[F]</span>
                            <span className="mp-btn-title">FOLD</span>
                            <span className="mp-btn-hint">Surrender Hand</span>
                          </button>

                          {/* CHECK / CALL */}
                          <button 
                            className={`mp-action-btn ${toCallUI > 0 ? 'mp-btn-call' : 'mp-btn-check'}`}
                            onClick={() => handleAction('call')}
                            title="Shortcut: Press [C] or [Space]"
                          >
                            <span className="mp-btn-hotkey">[C]</span>
                            <span className="mp-btn-title">
                              {toCallUI > 0 ? `CALL $${toCallUI}` : 'CHECK'}
                            </span>
                            <span className="mp-btn-hint">
                              {toCallUI > 0 ? `Odds: ${potOddsPct}%` : 'Free Action'}
                            </span>
                          </button>

                          {/* BET / RAISE */}
                          <button 
                            className="mp-action-btn mp-btn-raise" 
                            onClick={() => setShowRaiseOptions(true)}
                            title="Shortcut: Press [R]"
                          >
                            <span className="mp-btn-hotkey">[R]</span>
                            <span className="mp-btn-title">
                              {toCallUI > 0 ? 'RAISE' : 'BET'}
                            </span>
                            <span className="mp-btn-hint">Open Sizing Bar</span>
                          </button>
                        </div>
                      ) : (
                        <div className="mp-waiting-turn-pill">
                          <span className="mp-turn-pulse-dot"></span>
                          <span>
                            Waiting for {gs.players?.[gs.turnIndex]?.display_name || 'opponent'} to act...
                          </span>
                        </div>
                      )
                    )}
                  </>
                )
              )}
            </div>

          </main>

          {/* --------------------------------------------------
              SLIDE-OVER ACTION LOG DRAWER
              -------------------------------------------------- */}
          <aside className={`mp-log-drawer ${isLogOpen ? 'open' : ''}`}>
            <div className="mp-drawer-header">
              <h3>📜 Hand Action History</h3>
              <button 
                className="mp-btn-drawer-close" 
                onClick={() => setIsLogOpen(false)} 
                title="Close Drawer"
              >
                ✕
              </button>
            </div>

            <div className="mp-drawer-body">
              {gs.history?.split('\n').map((line, i) => {
                if (!line) return null;
                const isStreet = line.startsWith('---');
                const isSystem = line.startsWith('>>>') || line.startsWith('<<<') || line.startsWith('⚠️');

                return (
                  <div 
                    key={i} 
                    className={`mp-log-line ${isStreet ? 'street' : ''} ${isSystem ? 'system' : ''}`}
                  >
                    {line}
                  </div>
                );
              })}
              <div ref={logEndRef} />
            </div>
          </aside>

        </div>
      )}

    </div>
  );
};

export default MultiplayerTable;
