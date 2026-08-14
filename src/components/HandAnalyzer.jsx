import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from './Card';
import { Hand } from 'pokersolver';
import { calculateOdds } from '../utils/pokerLogic';

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
  const [villainCards, setVillainCards] = useState([]);
  const [communityCards, setCommunityCards] = useState([]);
  const [result, setResult] = useState(null);
  const [villainResult, setVillainResult] = useState(null);
  const [equity, setEquity] = useState(null);

  const allSelectedCards = [...holeCards, ...villainCards, ...communityCards];

  const handleCardClick = (rank, suit) => {
    const cardObj = { rank, suit };
    
    const isHole = holeCards.find(c => c.rank === rank && c.suit === suit);
    if (isHole) {
      setHoleCards(holeCards.filter(c => !(c.rank === rank && c.suit === suit)));
      return;
    }
    const isVillain = villainCards.find(c => c.rank === rank && c.suit === suit);
    if (isVillain) {
      setVillainCards(villainCards.filter(c => !(c.rank === rank && c.suit === suit)));
      return;
    }
    const isCommunity = communityCards.find(c => c.rank === rank && c.suit === suit);
    if (isCommunity) {
      setCommunityCards(communityCards.filter(c => !(c.rank === rank && c.suit === suit)));
      return;
    }

    if (holeCards.length < 2) {
      setHoleCards([...holeCards, cardObj]);
    } else if (villainCards.length < 2) {
      setVillainCards([...villainCards, cardObj]);
    } else if (communityCards.length < 5) {
      setCommunityCards([...communityCards, cardObj]);
    }
  };

  useEffect(() => {
    if (holeCards.length === 2 && villainCards.length === 2) {
      setEquity("Calculating...");
      calculateOdds(holeCards, villainCards, communityCards).then(pct => setEquity(pct));
    } else {
      setEquity(null);
    }

    if (holeCards.length === 2 && communityCards.length >= 3) {
      const handFormat = [...holeCards, ...communityCards].map(c => toSolverFormat(c.rank, c.suit));
      setResult(Hand.solve(handFormat));
    } else {
      setResult(null);
    }

    if (villainCards.length === 2 && communityCards.length >= 3) {
      const vFormat = [...villainCards, ...communityCards].map(c => toSolverFormat(c.rank, c.suit));
      setVillainResult(Hand.solve(vFormat));
    } else {
      setVillainResult(null);
    }
  }, [holeCards, villainCards, communityCards]);

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
          onClick={() => { setHoleCards([]); setVillainCards([]); setCommunityCards([]); setResult(null); setVillainResult(null); setEquity(null); }}
          style={{ padding: '0.5rem 1rem' }}
        >
          Reset Cards
        </button>
      </div>

      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 className="text-accent">Equity Calculator</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Select your cards, an opponent's cards, and the board to calculate your exact win probability!</p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', marginBottom: '3rem', justifyContent: 'center' }}>
        <div className="analyzer-col" style={{ backgroundColor: 'var(--surface-color)', padding: '2rem', borderRadius: '1rem', textAlign: 'center', flex: '1', minWidth: '250px' }}>
          <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Your Cards (2)</h3>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', minHeight: '140px' }}>
            {holeCards.map((c, i) => <Card key={i} suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} onClick={() => handleCardClick(c.rank, c.suit)} />)}
            {[...Array(2 - holeCards.length)].map((_, i) => (
               <div key={`empty-hole-${i}`} style={{ width: '100px', height: '140px', border: '2px dashed var(--surface-color-hover)', borderRadius: '10px' }}></div>
            ))}
          </div>
        </div>

        <div className="analyzer-col" style={{ backgroundColor: 'var(--surface-color)', padding: '2rem', borderRadius: '1rem', textAlign: 'center', flex: '1', minWidth: '250px' }}>
          <h3 style={{ marginBottom: '1rem', color: 'var(--danger-color)' }}>Opponent (2)</h3>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', minHeight: '140px' }}>
            {villainCards.map((c, i) => <Card key={i} suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} onClick={() => handleCardClick(c.rank, c.suit)} />)}
          </div>
        </div>

        <div className="analyzer-col" style={{ backgroundColor: 'var(--surface-color)', padding: '2rem', borderRadius: '1rem', textAlign: 'center', flex: '2', minWidth: '400px' }}>
          <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Community Cards</h3>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', minHeight: '140px' }}>
            {communityCards.map((c, i) => <Card key={i} suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} onClick={() => handleCardClick(c.rank, c.suit)} />)}
          </div>
        </div>
      </div>

      {equity !== null && (
        <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: '2rem', borderRadius: '1rem', textAlign: 'center', marginBottom: '2rem', border: '1px solid rgba(59, 130, 246, 0.3)', animation: 'fadeIn 0.5s ease' }}>
          <h2 style={{ color: '#60a5fa', marginBottom: '0.5rem' }}>Your Win Probability</h2>
          <div style={{ fontSize: '3rem', fontWeight: 'bold', color: equity === 'Calculating...' ? 'var(--text-secondary)' : (equity > 50 ? '#4ade80' : '#ef4444') }}>
            {equity}{equity !== 'Calculating...' ? '%' : ''}
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginTop: '1rem' }}>
            {result && (
               <div style={{ color: 'var(--text-secondary)' }}>You have: <strong style={{ color: 'var(--text-primary)' }}>{result.name}</strong></div>
            )}
            {villainResult && (
               <div style={{ color: 'var(--text-secondary)' }}>Opponent has: <strong style={{ color: 'var(--danger-color)' }}>{villainResult.name}</strong></div>
            )}
          </div>
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
