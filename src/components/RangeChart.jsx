import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import rangeData from '../data/ranges.json';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

const RangeChart = () => {
  const navigate = useNavigate();
  const [activePosition, setActivePosition] = useState(rangeData.positions[0]);

  const getHandString = (rowIdx, colIdx) => {
    const rank1 = RANKS[rowIdx];
    const rank2 = RANKS[colIdx];
    if (rowIdx === colIdx) return `${rank1}${rank2}`; // Pair
    if (rowIdx < colIdx) return `${rank1}${rank2}s`; // Suited
    return `${rank2}${rank1}o`; // Offsuit
  };

  const isHandInRaiseRange = (hand) => {
    return activePosition.raise.includes(hand);
  };

  return (
    <div className="container" style={{ maxWidth: '1200px', marginTop: '2rem' }}>
      <button 
        onClick={() => navigate('/')} 
        style={{ background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', marginBottom: '2rem' }}
      >
        ← Back to Dashboard
      </button>

      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 className="text-accent">Pre-Flop Range Charts</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Explore Game Theory Optimal (GTO) opening ranges for different table positions.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        
        {/* Left Sidebar for Positions */}
        <div style={{ flex: '1', minWidth: '250px', maxWidth: '350px' }}>
          <div style={{ backgroundColor: 'var(--surface-color)', padding: '1.5rem', borderRadius: '1rem' }}>
            <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
              Select Position
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {rangeData.positions.map(pos => (
                <button
                  key={pos.id}
                  onClick={() => setActivePosition(pos)}
                  style={{
                    padding: '1rem',
                    textAlign: 'left',
                    backgroundColor: activePosition.id === pos.id ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                    border: activePosition.id === pos.id ? '1px solid var(--accent-color)' : '1px solid rgba(255,255,255,0.05)',
                    color: activePosition.id === pos.id ? 'var(--accent-color)' : 'var(--text-primary)',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontWeight: activePosition.id === pos.id ? 'bold' : 'normal',
                    transition: 'all 0.2s'
                  }}
                >
                  {pos.name}
                </button>
              ))}
            </div>

            <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '0.5rem' }}>
              <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Position Details</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.4' }}>
                {activePosition.description}
              </p>
            </div>
            
            <div style={{ marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div style={{ width: '20px', height: '20px', backgroundColor: '#10b981', borderRadius: '4px' }}></div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Raise / Open</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '20px', height: '20px', backgroundColor: '#333', borderRadius: '4px' }}></div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Fold</span>
              </div>
            </div>
          </div>
        </div>

        {/* 13x13 Grid */}
        <div style={{ flex: '2', minWidth: '400px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(13, 1fr)', 
            gap: '2px',
            backgroundColor: '#222',
            padding: '1rem',
            borderRadius: '1rem',
            width: '100%',
            maxWidth: '650px',
            aspectRatio: '1 / 1'
          }}>
            {RANKS.map((_, rowIdx) => (
              RANKS.map((_, colIdx) => {
                const hand = getHandString(rowIdx, colIdx);
                const isRaise = isHandInRaiseRange(hand);
                const isPair = rowIdx === colIdx;
                const isSuited = rowIdx < colIdx;

                // Determine background color
                let bgColor = '#333'; // Fold
                if (isRaise) bgColor = '#10b981'; // Raise (Green)

                return (
                  <div 
                    key={hand}
                    style={{
                      backgroundColor: bgColor,
                      color: isRaise ? '#000' : 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      borderRadius: '4px',
                      cursor: 'default',
                      transition: 'background-color 0.3s ease',
                      border: isPair ? '1px solid rgba(255,255,255,0.2)' : 'none',
                      opacity: isSuited || isPair || isRaise ? 1 : 0.7
                    }}
                    title={hand}
                  >
                    {hand}
                  </div>
                );
              })
            ))}
          </div>
        </div>
        
      </div>
    </div>
  );
};

export default RangeChart;
