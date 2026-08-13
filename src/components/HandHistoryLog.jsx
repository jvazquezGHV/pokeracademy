import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const HandHistoryLog = () => {
  const navigate = useNavigate();
  const [histories, setHistories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistories();
  }, []);

  const fetchHistories = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
        return;
      }

      const { data, error } = await supabase
        .from('hand_histories')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHistories(data || []);
    } catch (error) {
      console.error('Error fetching hand histories:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '1000px', marginTop: '2rem' }}>
      <button 
        onClick={() => navigate('/')} 
        style={{ background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', marginBottom: '2rem' }}
      >
        ← Back to Dashboard
      </button>

      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 className="text-accent">Hand History</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Review your past hands to find leaks in your strategy.</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading hand histories...</div>
      ) : histories.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: 'var(--surface-color)', borderRadius: '1rem' }}>
          <span style={{ fontSize: '3rem' }}>🃏</span>
          <h3 style={{ color: 'var(--text-primary)', marginTop: '1rem' }}>No hands played yet!</h3>
          <p style={{ color: 'var(--text-secondary)' }}>Play a few hands in the AI Sandbox to see them here.</p>
          <button className="btn-primary" onClick={() => navigate('/sandbox')} style={{ marginTop: '1.5rem' }}>Go to Sandbox</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowX: 'auto' }}>
          {histories.map((hand) => {
            const date = new Date(hand.created_at).toLocaleString();
            return (
              <div 
                key={hand.id} 
                style={{ 
                  backgroundColor: 'var(--surface-color)', 
                  border: '1px solid rgba(255,255,255,0.05)', 
                  padding: '1.5rem', 
                  borderRadius: '1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                    <span style={{ 
                      backgroundColor: hand.won ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', 
                      color: hand.won ? '#10b981' : '#ef4444',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '0.25rem',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      textTransform: 'uppercase'
                    }}>
                      {hand.won ? 'Won' : 'Lost'}
                    </span>
                    <span style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>{hand.game_mode}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Played on {date}
                  </div>
                </div>
                
                <button 
                  className="btn-secondary" 
                  onClick={() => navigate(`/replayer/${hand.id}`)}
                >
                  ▶ Replay Hand
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default HandHistoryLog;
