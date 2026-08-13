import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import Card from './Card';

const HandReplayer = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [handData, setHandData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Replayer state
  const [historyLines, setHistoryLines] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    fetchHand();
    // eslint-disable-next-line
  }, [id]);

  const fetchHand = async () => {
    try {
      const { data, error } = await supabase
        .from('hand_histories')
        .select('*')
        .eq('id', id)
        .single();
        
      if (error) throw error;
      
      setHandData(data);
      // Parse history string into array of non-empty lines
      const lines = data.history_json.historyStr
        .split('\n')
        .map(l => l.trim())
        .filter(l => l !== '' && !l.startsWith('--- CARDS AT END OF HAND ---') && !l.startsWith('Hero (Player)') && !l.startsWith('Villain') && !l.startsWith('Community'));
        
      setHistoryLines(lines);
      // Start at end of hand or step 0? Step 0 makes more sense for a replayer
      setCurrentStep(0);
    } catch (error) {
      console.error('Error fetching hand:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading Replayer...</div>;
  }

  if (!handData) {
    return <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Hand not found.</div>;
  }

  const { heroCards, villainCards, board } = handData.history_json;
  
  // Determine what to show based on the current step's visible history
  const visibleHistory = historyLines.slice(0, currentStep + 1);
  const visibleText = visibleHistory.join(' ');
  
  const showFlop = visibleText.includes('--- FLOP ---');
  const showTurn = visibleText.includes('--- TURN ---');
  const showRiver = visibleText.includes('--- RIVER ---');
  const showVillain = visibleText.includes('--- SHOWDOWN ---');

  // Determine board cards to show
  let visibleBoard = [];
  if (showFlop) visibleBoard = board.slice(0, 3);
  if (showTurn) visibleBoard = board.slice(0, 4);
  if (showRiver) visibleBoard = board.slice(0, 5);

  const nextStep = () => {
    if (currentStep < historyLines.length - 1) setCurrentStep(s => s + 1);
  };
  const prevStep = () => {
    if (currentStep > 0) setCurrentStep(s => s - 1);
  };
  const fastForward = () => setCurrentStep(historyLines.length - 1);
  const rewind = () => setCurrentStep(0);

  return (
    <div className="container" style={{ maxWidth: '1200px', marginTop: '2rem', display: 'flex', gap: '2rem' }}>
      
      {/* Left Col: Controls & Log */}
      <div style={{ flex: '0 0 350px', display: 'flex', flexDirection: 'column' }}>
        <button 
          onClick={() => navigate('/history')} 
          style={{ alignSelf: 'flex-start', background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', marginBottom: '1rem' }}
        >
          ← Back to Logs
        </button>

        <div style={{ backgroundColor: 'var(--surface-color)', padding: '1.5rem', borderRadius: '1rem', marginBottom: '1rem' }}>
          <h3 style={{ color: 'var(--accent-color)', margin: '0 0 1rem 0' }}>Replay Controls</h3>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
            <button className="btn-secondary" onClick={rewind} disabled={currentStep === 0}>⏮️</button>
            <button className="btn-secondary" onClick={prevStep} disabled={currentStep === 0}>◀ Prev</button>
            <button className="btn-primary" onClick={nextStep} disabled={currentStep === historyLines.length - 1}>Next ▶</button>
            <button className="btn-secondary" onClick={fastForward} disabled={currentStep === historyLines.length - 1}>⏭️</button>
          </div>
          <div style={{ textAlign: 'center', marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Step {currentStep + 1} of {historyLines.length}
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--surface-color)', padding: '1.5rem', borderRadius: '1rem', flex: 1, overflowY: 'auto' }}>
          <h4 style={{ color: 'var(--text-primary)', margin: '0 0 1rem 0', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>Action Log</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontFamily: 'monospace', fontSize: '0.9rem' }}>
            {visibleHistory.map((line, i) => (
              <div 
                key={i} 
                style={{ 
                  color: line.startsWith('---') ? 'var(--accent-color)' : 'var(--text-secondary)',
                  fontWeight: line.startsWith('---') ? 'bold' : 'normal',
                  padding: '4px 0',
                  opacity: i === currentStep ? 1 : 0.6,
                  backgroundColor: i === currentStep ? 'rgba(255,255,255,0.05)' : 'transparent',
                  borderRadius: '4px'
                }}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Col: Visual Table */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '2rem' }}>
        <h2 style={{ color: 'var(--text-primary)', marginBottom: '2rem' }}>Hand Replayer</h2>
        
        <div style={{ 
          width: '100%', maxWidth: '700px', 
          background: 'radial-gradient(circle at center, #166534 0%, #064e3b 100%)', 
          borderRadius: '200px', 
          border: '15px solid #291a10', 
          boxShadow: 'inset 0 0 60px rgba(0,0,0,0.8), 0 20px 50px rgba(0,0,0,0.5)', 
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center',
          padding: '2rem',
          height: '500px'
        }}>
          
          {/* Villain */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '10px', height: '119px' }}>
              {villainCards.map((c, i) => (
                <div key={i} style={{ transform: 'scale(0.8)', transformOrigin: 'top center' }}>
                  <Card suit={c.suit} rank={c.rank} isFaceUp={showVillain} disableFlip={true} />
                </div>
              ))}
            </div>
            <div style={{ backgroundColor: 'rgba(0,0,0,0.8)', padding: '0.2rem 1rem', borderRadius: '1rem', marginTop: '-20px', zIndex: 2, color: 'white', fontWeight: 'bold' }}>
              Villain {showVillain ? "" : "(Hidden)"}
            </div>
          </div>

          {/* Board */}
          <div style={{ display: 'flex', gap: '10px', height: '119px', alignItems: 'center' }}>
            {visibleBoard.map((c, i) => (
              <div key={i} style={{ transform: 'scale(0.85)', transformOrigin: 'center center' }}>
                <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
              </div>
            ))}
            {/* Empty slots */}
            {[...Array(5 - visibleBoard.length)].map((_, i) => (
              <div key={`empty-${i}`} style={{ width: '85px', height: '119px', border: '2px dashed rgba(255,255,255,0.2)', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.1)' }}></div>
            ))}
          </div>

          {/* Hero */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
             <div style={{ backgroundColor: 'rgba(0,0,0,0.8)', padding: '0.2rem 1rem', borderRadius: '1rem', marginBottom: '-20px', zIndex: 2, color: 'white', fontWeight: 'bold' }}>
              Hero
            </div>
            <div style={{ display: 'flex', gap: '10px', height: '119px' }}>
              {heroCards.map((c, i) => (
                <div key={i} style={{ transform: 'scale(0.8)', transformOrigin: 'bottom center' }}>
                  <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
      
    </div>
  );
};

export default HandReplayer;
