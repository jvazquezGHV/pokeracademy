import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { BOT_TEMPLATES, BOT_LEVELS } from '../utils/botAi';
import './Multiplayer.css';

const MultiplayerLobby = ({ session }) => {
  const [activeTab, setActiveTab] = useState('vs_computer'); // 'vs_computer' | 'host_private' | 'join_code'
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Game Settings
  const [gameMode, setGameMode] = useState('cash');
  const [startingChips, setStartingChips] = useState(1000);
  const [blindInterval, setBlindInterval] = useState(5);
  
  // Bot Settings
  const [botCount, setBotCount] = useState(1);
  const [botLevel, setBotLevel] = useState('regular');
  const [fillBots, setFillBots] = useState(0);

  const navigate = useNavigate();
  const isAdmin = session?.user?.email === 'jvazquez.sd@outlook.com';

  const generateCode = () => {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
  };

  // 1-Click Play vs Computer Table
  const handleCreateVsComputer = async () => {
    setLoading(true);
    setError(null);
    const code = generateCode();

    try {
      const numBots = parseInt(botCount);
      const selectedBots = BOT_TEMPLATES.slice(0, numBots).map(t => ({
        user_id: t.id,
        name: t.name,
        display_name: t.name,
        avatar: t.avatar,
        chips: parseInt(startingChips),
        is_bot: true,
        bot_level: botLevel
      }));

      const initialState = {
        mode: gameMode,
        startingChips: parseInt(startingChips),
        blindInterval: parseInt(blindInterval),
        botLevel: botLevel,
        bots: selectedBots
      };

      const { data: room, error: roomError } = await supabase
        .from('poker_rooms')
        .insert([{ code, status: 'waiting', game_state: initialState }])
        .select()
        .single();

      if (roomError) throw roomError;

      const { error: playerError } = await supabase
        .from('poker_players')
        .insert([{
          room_id: room.id,
          user_id: session.user.id,
          display_name: session.user.email ? session.user.email.split('@')[0] : 'Hero',
          seat_index: 0,
          chips: parseInt(startingChips),
          is_host: true
        }]);

      if (playerError) throw playerError;

      navigate(`/multiplayer/${code}`);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Host Private Room (Optionally with bots)
  const handleCreateRoom = async () => {
    setLoading(true);
    setError(null);
    const code = generateCode();
    
    try {
      const numBots = parseInt(fillBots || 0);
      const selectedBots = BOT_TEMPLATES.slice(0, numBots).map(t => ({
        user_id: t.id,
        name: t.name,
        display_name: t.name,
        avatar: t.avatar,
        chips: parseInt(startingChips),
        is_bot: true,
        bot_level: botLevel
      }));

      const initialState = {
        mode: gameMode,
        startingChips: parseInt(startingChips),
        blindInterval: parseInt(blindInterval),
        botLevel: botLevel,
        bots: selectedBots
      };

      const { data: room, error: roomError } = await supabase
        .from('poker_rooms')
        .insert([{ code, status: 'waiting', game_state: initialState }])
        .select()
        .single();
        
      if (roomError) throw roomError;

      const { error: playerError } = await supabase
        .from('poker_players')
        .insert([{
          room_id: room.id,
          user_id: session.user.id,
          display_name: session.user.email ? session.user.email.split('@')[0] : 'Guest',
          seat_index: 0,
          chips: parseInt(startingChips),
          is_host: true
        }]);

      if (playerError) throw playerError;

      navigate(`/multiplayer/${code}`);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Join existing room
  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!joinCode) return;
    setLoading(true);
    setError(null);

    try {
      const code = joinCode.toUpperCase();
      
      const { data: room, error: roomError } = await supabase
        .from('poker_rooms')
        .select('*')
        .eq('code', code)
        .single();

      if (roomError || !room) {
        throw new Error('Room not found or invalid code.');
      }

      const { data: existingPlayers, error: countError } = await supabase
        .from('poker_players')
        .select('id, user_id')
        .eq('room_id', room.id);
        
      if (countError) throw countError;

      const totalOccupied = existingPlayers.length + (room.game_state?.bots?.length || 0);
      if (totalOccupied >= 6) {
        throw new Error('Room is full (max 6 players).');
      }

      const isAlreadyInRoom = existingPlayers.some(p => p.user_id === session.user.id);

      if (!isAlreadyInRoom) {
        const { error: joinError } = await supabase
          .from('poker_players')
          .insert([{
            room_id: room.id,
            user_id: session.user.id,
            display_name: session.user.email ? session.user.email.split('@')[0] : `Guest_${Math.floor(Math.random() * 1000)}`,
            seat_index: existingPlayers.length,
            chips: room.game_state?.startingChips || 1000,
            is_host: false
          }]);
          
        if (joinError) throw joinError;
      }

      navigate(`/multiplayer/${code}`);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mp-lobby-wrapper">
      <div className="mp-lobby-container">
        {isAdmin && (
          <button onClick={() => navigate('/')} className="mp-lobby-back-btn" title="Return to Dashboard">
            <span>←</span> Back to Dashboard
          </button>
        )}

        <div className="mp-lobby-header">
          <h1>Multiplayer Poker Lounge</h1>
          <p>Compete in real-time Texas Hold'em against friends or practice against AI computer opponents.</p>
        </div>

        {error && (
          <div className="mp-lobby-error">
            {error}
          </div>
        )}

        <div className="mp-lobby-card">
          {/* Mode Navigation Tabs */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.4)', borderRadius: '10px', padding: '4px', gap: '4px', width: '100%', marginBottom: '1.5rem', boxSizing: 'border-box' }}>
            <button 
              className={`math-mode-tab ${activeTab === 'vs_computer' ? 'active' : ''}`}
              style={{ flex: 1, textAlign: 'center', padding: '0.6rem 0.5rem', fontSize: '0.85rem' }}
              onClick={() => setActiveTab('vs_computer')}
            >
              🤖 Play vs Computer
            </button>
            <button 
              className={`math-mode-tab ${activeTab === 'host_private' ? 'active' : ''}`}
              style={{ flex: 1, textAlign: 'center', padding: '0.6rem 0.5rem', fontSize: '0.85rem' }}
              onClick={() => setActiveTab('host_private')}
            >
              👑 Host with Friends
            </button>
            <button 
              className={`math-mode-tab ${activeTab === 'join_code' ? 'active' : ''}`}
              style={{ flex: 1, textAlign: 'center', padding: '0.6rem 0.5rem', fontSize: '0.85rem' }}
              onClick={() => setActiveTab('join_code')}
            >
              🎟️ Join Table
            </button>
          </div>

          {/* TAB 1: PLAY VS COMPUTER */}
          {activeTab === 'vs_computer' && (
            <div className="mp-lobby-section" style={{ width: '100%', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <h2 style={{ margin: 0 }}>🤖 Play vs Computer (Instant Solo)</h2>
              </div>
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: 0, marginBottom: '1.25rem' }}>
                Practice real-time poker hands with zero waiting time. Select your bot opponents and difficulty level.
              </p>

              <div className="mp-lobby-field">
                <label className="mp-lobby-label">AI COMPUTER DIFFICULTY LEVEL</label>
                <select 
                  value={botLevel} 
                  onChange={(e) => setBotLevel(e.target.value)}
                  className="mp-lobby-select"
                >
                  <option value="rookie">🟢 Level 1: Rookie (Casual / Passive - Calls often, easy to beat)</option>
                  <option value="regular">🔵 Level 2: Regular (Standard / ABC - Solid tight-aggressive)</option>
                  <option value="shark">🟣 Level 3: Shark (Aggressive - 3-Bets, steals blinds, and bluffs)</option>
                  <option value="pro">🟡 Level 4: GTO Master (Expert - Solver-based pot odds and balanced play)</option>
                </select>
              </div>

              <div className="mp-lobby-row">
                <div className="mp-lobby-field" style={{ flex: 1 }}>
                  <label className="mp-lobby-label">NUMBER OF AI OPPONENTS</label>
                  <select 
                    value={botCount} 
                    onChange={(e) => setBotCount(e.target.value)}
                    className="mp-lobby-select"
                  >
                    <option value="1">1 Bot (Heads-Up Match)</option>
                    <option value="2">2 Bots (3-Handed)</option>
                    <option value="3">3 Bots (4-Handed)</option>
                    <option value="5">5 Bots (Full 6-Max Table)</option>
                  </select>
                </div>

                <div className="mp-lobby-field" style={{ flex: 1 }}>
                  <label className="mp-lobby-label">STARTING CHIPS</label>
                  <select 
                    value={startingChips} 
                    onChange={(e) => setStartingChips(e.target.value)}
                    className="mp-lobby-select"
                  >
                    <option value="1000">$1,000 (50 bb)</option>
                    <option value="2000">$2,000 (100 bb)</option>
                    <option value="5000">$5,000 (250 bb)</option>
                    <option value="10000">$10,000 (500 bb)</option>
                  </select>
                </div>
              </div>

              <div className="mp-lobby-field">
                <label className="mp-lobby-label">GAME FORMAT</label>
                <select 
                  value={gameMode} 
                  onChange={(e) => setGameMode(e.target.value)}
                  className="mp-lobby-select"
                >
                  <option value="cash">Cash Game (Static $10/$20 Blinds)</option>
                  <option value="tournament">Tournament (Elimination & Increasing Blinds)</option>
                </select>
              </div>

              <button 
                className="mp-btn-lobby-vs-bot" 
                onClick={handleCreateVsComputer}
                disabled={loading}
              >
                <span>{loading ? 'Setting Up Table...' : '🚀 Start Game vs Computer'}</span>
              </button>
            </div>
          )}

          {/* TAB 2: HOST PRIVATE GAME */}
          {activeTab === 'host_private' && (
            <div className="mp-lobby-section" style={{ width: '100%', boxSizing: 'border-box' }}>
              <h2>👑 Host a Private Table</h2>
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: 0, marginBottom: '1.25rem' }}>
                Create a table to play with friends using a 4-digit code. You can also populate empty seats with AI bots.
              </p>

              <div className="mp-lobby-field">
                <label className="mp-lobby-label">GAME MODE</label>
                <select 
                  value={gameMode} 
                  onChange={(e) => setGameMode(e.target.value)}
                  className="mp-lobby-select"
                >
                  <option value="cash">Cash Game (Static $10/$20 Blinds)</option>
                  <option value="tournament">Tournament (Increasing Blinds, Elimination)</option>
                </select>
              </div>

              <div className="mp-lobby-row">
                <div className="mp-lobby-field" style={{ flex: 1 }}>
                  <label className="mp-lobby-label">STARTING CHIPS</label>
                  <select 
                    value={startingChips} 
                    onChange={(e) => setStartingChips(e.target.value)}
                    className="mp-lobby-select"
                  >
                    <option value="1000">$1,000 (50 bb)</option>
                    <option value="2000">$2,000 (100 bb)</option>
                    <option value="5000">$5,000 (250 bb)</option>
                    <option value="10000">$10,000 (500 bb)</option>
                  </select>
                </div>

                <div className="mp-lobby-field" style={{ flex: 1 }}>
                  <label className="mp-lobby-label">FILL WITH AI BOTS</label>
                  <select 
                    value={fillBots} 
                    onChange={(e) => setFillBots(e.target.value)}
                    className="mp-lobby-select"
                  >
                    <option value="0">No Bots (Friends Only)</option>
                    <option value="1">1 AI Bot</option>
                    <option value="2">2 AI Bots</option>
                    <option value="3">3 AI Bots</option>
                    <option value="5">5 AI Bots</option>
                  </select>
                </div>
              </div>

              {fillBots > 0 && (
                <div className="mp-lobby-field">
                  <label className="mp-lobby-label">AI BOT LEVEL</label>
                  <select 
                    value={botLevel} 
                    onChange={(e) => setBotLevel(e.target.value)}
                    className="mp-lobby-select"
                  >
                    <option value="rookie">🟢 Level 1: Rookie</option>
                    <option value="regular">🔵 Level 2: Regular</option>
                    <option value="shark">🟣 Level 3: Shark</option>
                    <option value="pro">🟡 Level 4: GTO Master</option>
                  </select>
                </div>
              )}

              <button 
                className="mp-btn-lobby-host" 
                onClick={handleCreateRoom}
                disabled={loading}
              >
                {loading ? 'Creating Table...' : 'Create Private Table'}
              </button>
            </div>
          )}

          {/* TAB 3: JOIN TABLE */}
          {activeTab === 'join_code' && (
            <form onSubmit={handleJoinRoom} className="mp-lobby-section" style={{ width: '100%', boxSizing: 'border-box' }}>
              <h2>🎟️ Join a Table with Code</h2>
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: 0, marginBottom: '1.25rem' }}>
                Enter the 4-character table code provided by your host.
              </p>

              <div className="mp-lobby-field">
                <label className="mp-lobby-label">4-DIGIT ROOM CODE</label>
                <input 
                  type="text" 
                  placeholder="E.G. A7F2" 
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="mp-lobby-code-input"
                  maxLength={4}
                  disabled={loading}
                />
              </div>

              <button 
                type="submit" 
                className="mp-btn-lobby-join" 
                disabled={loading || joinCode.length !== 4}
              >
                {loading ? 'Joining Table...' : 'Join Game ➔'}
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};

export default MultiplayerLobby;
