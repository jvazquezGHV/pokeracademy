import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import './Multiplayer.css';

const MultiplayerLobby = ({ session }) => {
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Settings
  const [gameMode, setGameMode] = useState('cash');
  const [startingChips, setStartingChips] = useState(1000);
  const [blindInterval, setBlindInterval] = useState(5);
  
  const navigate = useNavigate();

  const isAdmin = session?.user?.email === 'jvazquez.sd@outlook.com';

  const generateCode = () => {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
  };

  const handleCreateRoom = async () => {
    setLoading(true);
    setError(null);
    const code = generateCode();
    
    try {
      // 1. Create Room
      const initialState = {
         mode: gameMode,
         startingChips: parseInt(startingChips),
         blindInterval: parseInt(blindInterval)
      };

      const { data: room, error: roomError } = await supabase
        .from('poker_rooms')
        .insert([{ code, status: 'waiting', game_state: initialState }])
        .select()
        .single();
        
      if (roomError) throw roomError;

      // 2. Join as Host
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

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!joinCode) return;
    setLoading(true);
    setError(null);

    try {
      const code = joinCode.toUpperCase();
      
      // 1. Find Room
      const { data: room, error: roomError } = await supabase
        .from('poker_rooms')
        .select('*')
        .eq('code', code)
        .single();

      if (roomError || !room) {
        throw new Error('Room not found or invalid code.');
      }

      // 2. Get current players to find next seat
      const { data: existingPlayers, error: countError } = await supabase
        .from('poker_players')
        .select('id, user_id')
        .eq('room_id', room.id);
        
      if (countError) throw countError;

      if (existingPlayers.length >= 6) {
         throw new Error('Room is full (max 6 players).');
      }

      // Check if user is already in the room
      const isAlreadyInRoom = existingPlayers.some(p => p.user_id === session.user.id);

      if (!isAlreadyInRoom) {
        // Join
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
          <p>Compete in real-time Texas Hold'em with your friends & crew.</p>
        </div>

        {error && (
          <div className="mp-lobby-error">
            {error}
          </div>
        )}

        <div className="mp-lobby-card">
          {/* Host Private Game */}
          <div className="mp-lobby-section">
            <h2>👑 Host a Private Table</h2>
            
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

              {gameMode === 'tournament' && (
                <div className="mp-lobby-field" style={{ flex: 1 }}>
                  <label className="mp-lobby-label">BLIND INTERVAL</label>
                  <select 
                    value={blindInterval} 
                    onChange={(e) => setBlindInterval(e.target.value)}
                    className="mp-lobby-select"
                  >
                    <option value="3">3 Minutes</option>
                    <option value="5">5 Minutes</option>
                    <option value="10">10 Minutes</option>
                  </select>
                </div>
              )}
            </div>

            <button 
              className="mp-btn-lobby-host" 
              onClick={handleCreateRoom}
              disabled={loading}
            >
              {loading ? 'Creating Table...' : 'Create Private Table'}
            </button>
          </div>

          {/* Divider */}
          <div className="mp-lobby-divider">
            <div className="mp-divider-line"></div>
            <span>OR</span>
            <div className="mp-divider-line"></div>
          </div>

          {/* Join Game */}
          <form onSubmit={handleJoinRoom} className="mp-lobby-section">
            <h2>🎟️ Join a Table</h2>
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
              {loading ? 'Joining Table...' : 'Join Game'}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
};

export default MultiplayerLobby;
