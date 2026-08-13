import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from './Card';
import { Hand } from 'pokersolver';

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const toSolverFormat = (rank, suit) => {
  const solverRank = rank === '10' ? 'T' : rank;
  const solverSuit = suit.charAt(0);
  return `${solverRank}${solverSuit}`;
};

const HandAnalyzer = () => {
  const navigate = useNavigate();
  const [holeCards, setHoleCards] = useState([]);
  const [communityCards, setCommunityCards] = useState([]);
  const [result, setResult] = useState(null);

  const allSelectedCards = [...holeCards, ...communityCards];

  const handleCardClick = (rank, suit) => {
    const cardObj = { rank, suit };
    
    const isHole = holeCards.find(c => c.rank === rank && c.suit === suit);
    if (isHole) {
      setHoleCards(holeCards.filter(c => !(c.rank === rank && c.suit === suit)));
      return;
    }
    const isCommunity = communityCards.find(c => c.rank === rank && c.suit === suit);
    if (isCommunity) {
      setCommunityCards(communityCards.filter(c => !(c.rank === rank && c.suit === suit)));
      return;
    }

    if (holeCards.length < 2) {
      setHoleCards([...holeCards, cardObj]);
    } else if (communityCards.length < 5) {
      setCommunityCards([...communityCards, cardObj]);
    }
  };

  useEffect(() => {
    if (holeCards.length === 2 && communityCards.length >= 3) {
      const handFormat = [...holeCards, ...communityCards].map(c => toSolverFormat(c.rank, c.suit));
      const solvedHand = Hand.solve(handFormat);
      setResult(solvedHand);
    } else {
      setResult(null);
    }
  }, [holeCards, communityCards]);

  const isCardSelected = (rank, suit) => {
    return allSelectedCards.some(c => c.rank === rank && c.suit === suit);
  };

  return (
    <div className="container" style={{ maxWidth: '1400px', marginTop: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <button onClick={() => navigate('/')} style={{ background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>
          ← Back to Dashboard
        </button>
        <button 
          className="btn-secondary" 
          onClick={() => { setHoleCards([]); setCommunityCards([]); setResult(null); }}
          style={{ padding: '0.5rem 1rem' }}
        >
          Reset Cards
        </button>
      </div>

      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 className="text-accent">Hand Analyzer</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Select 2 hole cards and at least 3 community cards to evaluate your hand.</p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', marginBottom: '3rem', justifyContent: 'center' }}>
        <div style={{ backgroundColor: 'var(--surface-color)', padding: '2rem', borderRadius: '1rem', textAlign: 'center', flex: '1', minWidth: '300px' }}>
          <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Your Hole Cards (2)</h3>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', minHeight: '140px' }}>
            {holeCards.map((c, i) => <Card key={i} suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} onClick={() => handleCardClick(c.rank, c.suit)} />)}
            {[...Array(2 - holeCards.length)].map((_, i) => (
               <div key={`empty-hole-${i}`} style={{ width: '100px', height: '140px', border: '2px dashed var(--surface-color-hover)', borderRadius: '10px' }}></div>
            ))}
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--surface-color)', padding: '2rem', borderRadius: '1rem', textAlign: 'center', flex: '2', minWidth: '450px' }}>
          <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Community Cards (3-5)</h3>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', minHeight: '140px' }}>
            {communityCards.map((c, i) => <Card key={i} suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} onClick={() => handleCardClick(c.rank, c.suit)} />)}
            {[...Array(5 - communityCards.length)].map((_, i) => (
               <div key={`empty-comm-${i}`} style={{ width: '100px', height: '140px', border: '2px dashed var(--surface-color-hover)', borderRadius: '10px' }}></div>
            ))}
          </div>
        </div>
      </div>

      {result && (
        <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '2rem', borderRadius: '1rem', textAlign: 'center', marginBottom: '3rem', border: '1px solid rgba(16, 185, 129, 0.3)', animation: 'fadeIn 0.5s ease' }}>
          <h2 style={{ color: 'var(--accent-color)', marginBottom: '0.5rem' }}>Best Hand: {result.name}</h2>
          <p style={{ color: 'var(--text-primary)', fontSize: '1.2rem' }}>{result.descr}</p>
        </div>
      )}

      <div style={{ backgroundColor: 'var(--surface-color)', padding: '2rem', borderRadius: '1rem' }}>
        <h3 style={{ textAlign: 'center', marginBottom: '2rem', color: 'var(--text-primary)' }}>Deck Picker</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {SUITS.map(suit => (
            <div key={suit} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '1rem' }}>
              {RANKS.map((rank, i) => {
                const selected = isCardSelected(rank, suit);
                return (
                  <div 
                    key={`${rank}-${suit}`}
                    onClick={() => handleCardClick(rank, suit)}
                    style={{ 
                      opacity: selected ? 0.3 : 1, 
                      cursor: 'pointer',
                      width: '70px',
                      height: '100px'
                    }}
                  >
                    <div style={{ transform: 'scale(0.7)', transformOrigin: 'top left' }}>
                      <Card suit={suit} rank={rank} isFaceUp={true} disableFlip={true} />
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HandAnalyzer;
