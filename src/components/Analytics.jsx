import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const Analytics = ({ session }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalHands: 0,
    vpip: 0,
    pfr: 0,
    threeBet: 0,
    winRate: 0,
    classification: 'Unknown',
    advice: ''
  });

  useEffect(() => {
    fetchAndParseData();
  }, []);

  const fetchAndParseData = async () => {
    try {
      const { data, error } = await supabase
        .from('hand_histories')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        setLoading(false);
        return;
      }

      let vpipCount = 0;
      let pfrCount = 0;
      let threeBetCount = 0;
      let handsWon = 0;

      data.forEach(hand => {
        if (hand.won) handsWon++;

        const history = hand.history_json.historyStr || "";
        const phases = history.split('--- FLOP ---');
        const preflop = phases[0] || "";
        
        const lines = preflop.split('\n').map(l => l.trim()).filter(l => l);
        
        let userVPIP = false;
        let userPFR = false;
        let user3Bet = false;
        let raiseCount = 0;
        
        lines.forEach(line => {
          if (line.includes('Raises') || line.includes('Raise')) {
            raiseCount++;
          }
          
          if (line.startsWith('You ')) {
            const action = line.replace('You ', '');
            if (action.startsWith('Call') || action.startsWith('Raise') || action.startsWith('Bet')) {
              userVPIP = true;
            }
            if (action.startsWith('Raise')) {
              userPFR = true;
              if (raiseCount > 1) { // If it's the 2nd or later raise in the hand, it's a 3-Bet+
                user3Bet = true;
              }
            }
          }
        });

        if (userVPIP) vpipCount++;
        if (userPFR) pfrCount++;
        if (user3Bet) threeBetCount++;
      });

      const total = data.length;
      const vpipPct = Math.round((vpipCount / total) * 100);
      const pfrPct = Math.round((pfrCount / total) * 100);
      const threeBetPct = Math.round((threeBetCount / total) * 100);
      const winRatePct = Math.round((handsWon / total) * 100);

      // Classification Logic
      let classification = "Average Player";
      let advice = "";

      if (vpipPct > 35) {
        if (pfrPct < vpipPct - 15) {
          classification = "Loose Passive (Calling Station)";
          advice = "You are playing way too many hands and just calling instead of raising. Try folding marginal hands preflop and raising when you do enter a pot.";
        } else {
          classification = "Loose Aggressive (LAG)";
          advice = "You play a lot of hands and play them aggressively. This puts pressure on opponents but can lead to high variance and big losses if not careful.";
        }
      } else if (vpipPct < 15) {
        if (pfrPct < 10) {
          classification = "Tight Passive (Nit)";
          advice = "You only play premium hands, but you don't bet them aggressively enough! When you pick up AA/KK, make sure you are raising to build the pot.";
        } else {
          classification = "Tight Aggressive (TAG / Rock)";
          advice = "A very solid style. You fold your trash and raise your good hands. Consider widening your range slightly on the Button to steal more blinds.";
        }
      } else {
        if (pfrPct >= vpipPct - 8) {
          classification = "Tight Aggressive (TAG)";
          advice = "Excellent baseline stats. You are entering pots with a raise, taking initiative. Focus on your post-flop play to push your edge.";
        } else {
          classification = "Slightly Loose / Passive";
          advice = "You are limping or calling a bit too often preflop. Try turning some of those calls into raises to take control of the hand.";
        }
      }

      setStats({
        totalHands: total,
        vpip: vpipPct,
        pfr: pfrPct,
        threeBet: threeBetPct,
        winRate: winRatePct,
        classification,
        advice
      });

    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ title, value, subtitle, target, color }) => (
    <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '1rem', border: `1px solid ${color || 'rgba(255,255,255,0.1)'}`, textAlign: 'center', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <h3 style={{ color: 'var(--text-secondary)', fontSize: '1rem', margin: '0 0 0.5rem 0' }}>{title}</h3>
      <div style={{ fontSize: '3rem', fontWeight: 'bold', color: color || 'white', margin: '0.5rem 0' }}>{value}</div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>{subtitle}</p>
      {target && <div style={{ marginTop: 'auto', paddingTop: '1rem', fontSize: '0.8rem', color: '#10b981' }}>Target: {target}</div>}
    </div>
  );

  if (loading) return <div style={{ textAlign: 'center', marginTop: '4rem', color: 'white' }}>Loading analytics...</div>;

  return (
    <div className="container" style={{ maxWidth: '1000px', marginTop: '2rem' }}>
      <button 
        onClick={() => navigate('/')} 
        style={{ alignSelf: 'flex-start', background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', marginBottom: '1rem', display: 'flex' }}
      >
        ← Back to Dashboard
      </button>

      <h1 className="text-accent" style={{ fontSize: '2.5rem', marginBottom: '0.5rem', textAlign: 'center' }}>Personal Leak Tracker</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '3rem', textAlign: 'center' }}>We've analyzed your AI Sandbox hand history to find mathematical leaks in your game.</p>

      {stats.totalHands === 0 ? (
        <div style={{ backgroundColor: 'var(--surface-color)', padding: '3rem', borderRadius: '1rem', textAlign: 'center' }}>
          <h2 style={{ color: 'white' }}>Not Enough Data</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Play some hands in the AI Sandbox to generate your analytics profile!</p>
          <button className="btn-primary" onClick={() => navigate('/sandbox')} style={{ marginTop: '1rem' }}>Go to Sandbox</button>
        </div>
      ) : (
        <>
          {/* Classification Banner */}
          <div style={{ backgroundColor: 'var(--surface-color)', padding: '2rem', borderRadius: '1rem', border: '1px solid var(--accent-color)', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <div style={{ fontSize: '4rem' }}>🕵️</div>
            <div>
              <h3 style={{ color: 'var(--text-secondary)', margin: '0 0 0.5rem 0', textTransform: 'uppercase', letterSpacing: '1px' }}>Your Player Profile</h3>
              <h2 style={{ color: 'var(--accent-color)', fontSize: '2rem', margin: '0 0 1rem 0' }}>{stats.classification}</h2>
              <p style={{ color: 'white', margin: 0, fontSize: '1.1rem', lineHeight: '1.5' }}>{stats.advice}</p>
            </div>
          </div>

          {/* Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            <StatCard 
              title="VPIP %" 
              value={`${stats.vpip}%`} 
              subtitle="Voluntarily Put in Pot" 
              target="20% - 25%"
              color={stats.vpip > 30 ? '#ef4444' : (stats.vpip < 15 ? '#eab308' : '#10b981')}
            />
            <StatCard 
              title="PFR %" 
              value={`${stats.pfr}%`} 
              subtitle="Preflop Raise" 
              target="15% - 20%"
              color={(stats.pfr < stats.vpip - 10) ? '#ef4444' : '#10b981'}
            />
            <StatCard 
              title="3-Bet %" 
              value={`${stats.threeBet}%`} 
              subtitle="Re-Raising Preflop" 
              target="6% - 9%"
            />
            <StatCard 
              title="Win Rate" 
              value={`${stats.winRate}%`} 
              subtitle="Hands Won at Showdown or Fold" 
            />
          </div>
          
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.9rem' }}>
            Analyzed based on your last {stats.totalHands} hands played in the AI Sandbox.
          </p>
        </>
      )}
    </div>
  );
};

export default Analytics;
