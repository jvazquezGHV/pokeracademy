import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

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
          display_name: session.user.email.split('@')[0], // Simple fallback
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
            display_name: session.user.email.split('@')[0],
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
    <div className="container" style={{ maxWidth: '600px', marginTop: '4rem', textAlign: 'center' }}>
      {isAdmin && (
        <button onClick={() => navigate('/')} style={{ alignSelf: 'flex-start', background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', marginBottom: '2rem', display: 'flex' }}>
            ← Back to Dashboard
        </button>
      )}

      <h1 style={{ fontSize: '3rem', color: 'var(--accent-color)' }}>Multiplayer Lobby</h1>
      <p style={{ fontSize: '1.2rem', marginBottom: '3rem' }}>Play Texas Hold'em with your friends in real-time.</p>

      {error && (
        <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: 'var(--danger-color)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '2rem' }}>
          {error}
        </div>
      )}

      <div style={{ backgroundColor: 'var(--surface-color)', padding: '3rem', borderRadius: '1.5rem', display: 'flex', flexDirection: 'column', gap: '3rem', border: '1px solid rgba(255,255,255,0.05)' }}>
        
        {/* Create Room */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left' }}>
          <h2 style={{ margin: 0, textAlign: 'center' }}>Host a Private Game</h2>
          
          <div>
            <label style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'block' }}>Game Mode</label>
            <select 
              value={gameMode} 
              onChange={(e) => setGameMode(e.target.value)}
              style={{ width: '100%', padding: '0.8rem', borderRadius: '0.5rem', backgroundColor: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <option value="cash">Cash Game (Static Blinds, Rebuys Allowed)</option>
              <option value="tournament">Tournament (Increasing Blinds, Elimination)</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'block' }}>Starting Chips</label>
              <select 
                value={startingChips} 
                onChange={(e) => setStartingChips(e.target.value)}
                style={{ width: '100%', padding: '0.8rem', borderRadius: '0.5rem', backgroundColor: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}
              >
                <option value="1000">1,000</option>
                <option value="2000">2,000</option>
                <option value="5000">5,000</option>
                <option value="10000">10,000</option>
              </select>
            </div>

            {gameMode === 'tournament' && (
              <div style={{ flex: 1 }}>
                <label style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'block' }}>Blind Interval</label>
                <select 
                  value={blindInterval} 
                  onChange={(e) => setBlindInterval(e.target.value)}
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '0.5rem', backgroundColor: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}
                >
                  <option value="3">3 Minutes</option>
                  <option value="5">5 Minutes</option>
                  <option value="10">10 Minutes</option>
                </select>
              </div>
            )}
          </div>

          <button 
            className="btn-primary" 
            style={{ width: '100%', fontSize: '1.2rem', padding: '1rem', marginTop: '1rem' }}
            onClick={handleCreateRoom}
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create New Room'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }}></div>
          <span style={{ padding: '0 1rem' }}>OR</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }}></div>
        </div>

        {/* Join Room */}
        <form onSubmit={handleJoinRoom} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ margin: 0 }}>Join a Friend</h2>
          <input 
            type="text" 
            placeholder="Enter 4-digit code (e.g. A7F2)" 
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            style={{ 
              padding: '1rem', fontSize: '1.5rem', textAlign: 'center', textTransform: 'uppercase', 
              borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.2)', 
              backgroundColor: 'rgba(0,0,0,0.3)', color: 'white', letterSpacing: '2px'
            }}
            maxLength={4}
            disabled={loading}
          />
          <button 
            type="submit" 
            className="btn-primary" 
            style={{ width: '100%', fontSize: '1.2rem', padding: '1rem', backgroundColor: 'var(--surface-color-hover)' }}
            disabled={loading || joinCode.length !== 4}
          >
            {loading ? 'Joining...' : 'Join Game'}
          </button>
        </form>

      </div>
    </div>
  );
};

export default MultiplayerLobby;
