import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from './Card';
import { Hand } from 'pokersolver';
import { calculateOdds } from '../utils/pokerLogic';
import { playSound } from '../utils/audio';
import './HandAnalyzer.css';

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

const SUIT_ICONS = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠'
};

const PRESET_MATCHUPS = [
  {
    name: '🪙 Classic Coinflip',
    hero: [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'spades' }],
    villain: [{ rank: 'Q', suit: 'hearts' }, { rank: 'Q', suit: 'diamonds' }],
    board: []
  },
  {
    name: '💥 Cooler: AA vs KK',
    hero: [{ rank: 'A', suit: 'spades' }, { rank: 'A', suit: 'hearts' }],
    villain: [{ rank: 'K', suit: 'diamonds' }, { rank: 'K', suit: 'clubs' }],
    board: []
  },
  {
    name: '🎯 Domination: AK vs AQ',
    hero: [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'diamonds' }],
    villain: [{ rank: 'A', suit: 'hearts' }, { rank: 'Q', suit: 'clubs' }],
    board: []
  },
  {
    name: '🌊 Overpair vs Flush Draw',
    hero: [{ rank: 'J', suit: 'spades' }, { rank: 'J', suit: 'hearts' }],
    villain: [{ rank: 'A', suit: 'diamonds' }, { rank: '9', suit: 'diamonds' }],
    board: [{ rank: 'K', suit: 'diamonds' }, { rank: '7', suit: 'diamonds' }, { rank: '2', suit: 'clubs' }]
  }
];

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

  const [activeSlotTarget, setActiveSlotTarget] = useState('hero'); // 'hero' | 'villain' | 'board'
  const [result, setResult] = useState(null);
  const [villainResult, setVillainResult] = useState(null);
  const [equity, setEquity] = useState(null);

  const allSelectedCards = useMemo(() => {
    return [...holeCards, ...villainCards, ...communityCards];
  }, [holeCards, villainCards, communityCards]);

  const handleCardClick = (rank, suit) => {
    const cardObj = { rank, suit };
    
    // Check if already selected -> remove it
    if (holeCards.some(c => c.rank === rank && c.suit === suit)) {
      setHoleCards(holeCards.filter(c => !(c.rank === rank && c.suit === suit)));
      playSound('click');
      return;
    }
    if (villainCards.some(c => c.rank === rank && c.suit === suit)) {
      setVillainCards(villainCards.filter(c => !(c.rank === rank && c.suit === suit)));
      playSound('click');
      return;
    }
    if (communityCards.some(c => c.rank === rank && c.suit === suit)) {
      setCommunityCards(communityCards.filter(c => !(c.rank === rank && c.suit === suit)));
      playSound('click');
      return;
    }

    // Add card to appropriate target
    if (activeSlotTarget === 'hero') {
      if (holeCards.length < 2) {
        setHoleCards(prev => [...prev, cardObj]);
        playSound('deal');
        if (holeCards.length === 1 && villainCards.length < 2) {
          setActiveSlotTarget('villain');
        }
      }
    } else if (activeSlotTarget === 'villain') {
      if (villainCards.length < 2) {
        setVillainCards(prev => [...prev, cardObj]);
        playSound('deal');
        if (villainCards.length === 1 && communityCards.length < 5) {
          setActiveSlotTarget('board');
        }
      }
    } else if (activeSlotTarget === 'board') {
      if (communityCards.length < 5) {
        setCommunityCards(prev => [...prev, cardObj]);
        playSound('deal');
      }
    }
  };

  const loadPreset = (preset) => {
    setHoleCards(preset.hero);
    setVillainCards(preset.villain);
    setCommunityCards(preset.board);
    playSound('deal');
  };

  const handleReset = () => {
    setHoleCards([]);
    setVillainCards([]);
    setCommunityCards([]);
    setResult(null);
    setVillainResult(null);
    setEquity(null);
    setActiveSlotTarget('hero');
    playSound('click');
  };

  // Equity & Solvers Calculation
  useEffect(() => {
    if (holeCards.length === 2 && villainCards.length === 2) {
      setEquity('Calculating...');
      calculateOdds(holeCards, villainCards, communityCards).then(pct => {
        setEquity(pct);
      });
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

  // Board Texture Analyzer
  const boardTexture = useMemo(() => {
    if (communityCards.length < 3) return null;

    const suitCounts = {};
    const rankCounts = {};
    communityCards.forEach(c => {
      suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
      rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
    });

    const maxSuit = Math.max(...Object.values(suitCounts));
    const maxRank = Math.max(...Object.values(rankCounts));

    const tags = [];

    // Flush texture
    if (maxSuit >= 4) tags.push('🌊 4 to a Flush');
    else if (maxSuit === 3) tags.push('💧 Monotone (3 to Flush)');
    else if (maxSuit === 2) tags.push('🌈 Two-Tone');
    else tags.push('☀️ Rainbow (Dry)');

    // Pairing
    if (maxRank === 3) tags.push('👯 Trips on Board');
    else if (maxRank === 2) tags.push('⚡ Paired Board');

    // High Card
    const highRank = communityCards[0]?.rank;
    if (['A', 'K', 'Q'].includes(highRank)) tags.push(`👑 High Card: ${highRank}`);

    return tags;
  }, [communityCards]);

  const isCardSelected = (rank, suit) => {
    return allSelectedCards.some(c => c.rank === rank && c.suit === suit);
  };

  const heroPct = typeof equity === 'number' ? equity : 50;
  const villainPct = typeof equity === 'number' ? 100 - equity : 50;

  return (
    <div className="analyzer-container">
      {/* Header */}
      <div className="analyzer-header">
        <div>
          <h1>🛠️ Hand Equity & Board Analyzer</h1>
          <p>Calculate exact mathematical win probabilities and analyze board textures in real time.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <button
            type="button"
            className="user-mgmt-btn user-mgmt-btn-secondary user-mgmt-btn-sm"
            onClick={handleReset}
          >
            Clear All
          </button>
          <button
            type="button"
            className="user-mgmt-btn user-mgmt-btn-secondary user-mgmt-btn-sm"
            onClick={() => navigate('/')}
          >
            ← Dashboard
          </button>
        </div>
      </div>

      {/* Quick Presets Bar */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
          Quick Matchups:
        </span>
        {PRESET_MATCHUPS.map((preset, idx) => (
          <button
            key={idx}
            type="button"
            className="user-mgmt-btn user-mgmt-btn-secondary user-mgmt-btn-sm"
            style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem' }}
            onClick={() => loadPreset(preset)}
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* Equity Result Display Banner */}
      {equity !== null && (
        <div className="equity-banner">
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '0.76rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Hero Equity
            </span>
            <div className="equity-stat-val" style={{ color: heroPct >= 50 ? '#34d399' : '#f87171' }}>
              {equity !== 'Calculating...' ? `${equity}%` : '...'}
            </div>
            {result && (
              <span style={{ fontSize: '0.78rem', color: '#e2e8f0', fontWeight: 600 }}>
                {result.name}
              </span>
            )}
          </div>

          <div style={{ flex: 1, minWidth: '240px', maxWidth: '420px', textAlign: 'center' }}>
            <div className="equity-bar-track">
              <div className="equity-bar-fill" style={{ width: `${heroPct}%` }}></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8' }}>
              <span>Hero: {heroPct}%</span>
              <span>Villain: {villainPct}%</span>
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '0.76rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Opponent Equity
            </span>
            <div className="equity-stat-val" style={{ color: villainPct > 50 ? '#34d399' : '#f87171' }}>
              {equity !== 'Calculating...' ? `${(100 - equity).toFixed(1)}%` : '...'}
            </div>
            {villainResult && (
              <span style={{ fontSize: '0.78rem', color: '#f87171', fontWeight: 600 }}>
                {villainResult.name}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Cards Slots Grid */}
      <div className="analyzer-grid">
        {/* Slot 1: Hero Cards */}
        <div
          className="analyzer-card-slot-box"
          style={{ borderColor: activeSlotTarget === 'hero' ? 'var(--accent-color)' : undefined }}
          onClick={() => setActiveSlotTarget('hero')}
        >
          <div className="analyzer-slot-title">
            <span style={{ color: '#34d399' }}>Hero Hand (2)</span>
            {activeSlotTarget === 'hero' && <span style={{ color: '#34d399', fontSize: '0.72rem' }}>● Active Target</span>}
          </div>

          <div className="analyzer-slots">
            {holeCards.map((c, i) => (
              <div key={i} onClick={() => handleCardClick(c.rank, c.suit)} style={{ cursor: 'pointer' }} title="Click to remove">
                <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
              </div>
            ))}
            {Array.from({ length: 2 - holeCards.length }).map((_, i) => (
              <div
                key={`empty-hero-${i}`}
                className="analyzer-empty-slot"
                onClick={() => setActiveSlotTarget('hero')}
              >
                + Card
              </div>
            ))}
          </div>
        </div>

        {/* Slot 2: Villain Cards */}
        <div
          className="analyzer-card-slot-box"
          style={{ borderColor: activeSlotTarget === 'villain' ? '#f87171' : undefined }}
          onClick={() => setActiveSlotTarget('villain')}
        >
          <div className="analyzer-slot-title">
            <span style={{ color: '#f87171' }}>Opponent Hand (2)</span>
            {activeSlotTarget === 'villain' && <span style={{ color: '#f87171', fontSize: '0.72rem' }}>● Active Target</span>}
          </div>

          <div className="analyzer-slots">
            {villainCards.map((c, i) => (
              <div key={i} onClick={() => handleCardClick(c.rank, c.suit)} style={{ cursor: 'pointer' }} title="Click to remove">
                <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
              </div>
            ))}
            {Array.from({ length: 2 - villainCards.length }).map((_, i) => (
              <div
                key={`empty-villain-${i}`}
                className="analyzer-empty-slot"
                onClick={() => setActiveSlotTarget('villain')}
              >
                + Card
              </div>
            ))}
          </div>
        </div>

        {/* Slot 3: Community Cards */}
        <div
          className="analyzer-card-slot-box"
          style={{ borderColor: activeSlotTarget === 'board' ? '#60a5fa' : undefined }}
          onClick={() => setActiveSlotTarget('board')}
        >
          <div className="analyzer-slot-title">
            <span style={{ color: '#60a5fa' }}>Community Board (Flop / Turn / River)</span>
            {activeSlotTarget === 'board' && <span style={{ color: '#60a5fa', fontSize: '0.72rem' }}>● Active Target</span>}
          </div>

          <div className="analyzer-slots">
            {communityCards.map((c, i) => (
              <div key={i} onClick={() => handleCardClick(c.rank, c.suit)} style={{ cursor: 'pointer' }} title="Click to remove">
                <Card suit={c.suit} rank={c.rank} isFaceUp={true} disableFlip={true} />
              </div>
            ))}
            {Array.from({ length: 5 - communityCards.length }).map((_, i) => (
              <div
                key={`empty-board-${i}`}
                className="analyzer-empty-slot"
                onClick={() => setActiveSlotTarget('board')}
              >
                + Board
              </div>
            ))}
          </div>

          {/* Board Texture Badges */}
          {boardTexture && (
            <div className="board-texture-bar">
              {boardTexture.map((tag, idx) => (
                <span key={idx} className="texture-tag">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Compact Deck Card Picker */}
      <div className="deck-picker-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Interactive 52-Card Picker (Selected: {allSelectedCards.length} / 9)
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Adding to:{' '}
            <strong style={{ color: activeSlotTarget === 'hero' ? '#34d399' : (activeSlotTarget === 'villain' ? '#f87171' : '#60a5fa') }}>
              {activeSlotTarget === 'hero' ? 'Hero Hand' : (activeSlotTarget === 'villain' ? 'Opponent' : 'Board')}
            </strong>
          </span>
        </div>

        <div className="deck-picker-grid">
          {SUITS.map(suit => {
            const isRed = suit === 'hearts' || suit === 'diamonds';
            return (
              <div key={suit} className="deck-picker-suit-row">
                {RANKS.map(rank => {
                  const selected = isCardSelected(rank, suit);
                  return (
                    <button
                      key={`${rank}-${suit}`}
                      type="button"
                      className={`mini-card-btn ${selected ? 'selected' : ''}`}
                      disabled={selected}
                      onClick={() => handleCardClick(rank, suit)}
                    >
                      <span className={`mini-card-rank ${isRed ? 'card-red' : 'card-black'}`}>{rank}</span>
                      <span className={`mini-card-suit ${isRed ? 'card-red' : 'card-black'}`}>{SUIT_ICONS[suit]}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default HandAnalyzer;
