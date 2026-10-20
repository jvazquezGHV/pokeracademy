import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { playSound } from '../utils/audio';
import './RangeChart.css';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// Expanded GTO Range Definitions with multi-action frequencies
const GTO_PRESETS = [
  {
    id: 'utg',
    name: 'UTG (Under the Gun)',
    category: 'Open Raise (RFI)',
    description: 'First to act at a 6-max table. Requires a disciplined, premium starting hand range.',
    stats: '15.4% of hands • 204 combos',
    raise: [
      'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77',
      'AKs', 'AQs', 'AJs', 'ATs', 'A5s', 'A4s',
      'KQs', 'KJs', 'KTs', 'QJs', 'QTs', 'JTs', 'T9s', '98s', '87s',
      'AKo', 'AQo', 'AJo'
    ],
    call: [],
    threeBet: []
  },
  {
    id: 'mp',
    name: 'MP (Middle Position)',
    category: 'Open Raise (RFI)',
    description: 'Acts after UTG. Can open slightly wider with suited connectors and medium pocket pairs.',
    stats: '19.2% of hands • 254 combos',
    raise: [
      'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55',
      'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A5s', 'A4s', 'A3s',
      'KQs', 'KJs', 'KTs', 'K9s', 'QJs', 'QTs', 'JTs', 'J9s', 'T9s', '98s', '87s', '76s', '65s',
      'AKo', 'AQo', 'AJo', 'ATo', 'KQo', 'KJo'
    ],
    call: [],
    threeBet: []
  },
  {
    id: 'co',
    name: 'CO (Cutoff)',
    category: 'Open Raise (RFI)',
    description: 'Directly right of the Button. High-leverage position to steal blinds and isolate.',
    stats: '27.4% of hands • 364 combos',
    raise: [
      'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
      'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
      'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'QJs', 'QTs', 'Q9s', 'Q8s', 'JTs', 'J9s', 'J8s',
      'T9s', 'T8s', '98s', '97s', '87s', '86s', '76s', '75s', '65s', '54s',
      'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'KQo', 'KJo', 'KTo', 'QJo', 'QTo', 'JTo'
    ],
    call: [],
    threeBet: []
  },
  {
    id: 'btn',
    name: 'BTN (The Button)',
    category: 'Open Raise (RFI)',
    description: 'The most profitable seat in poker. Acts last on every post-flop street. Open aggressively.',
    stats: '44.8% of hands • 594 combos',
    raise: [
      'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
      'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
      'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s', 'K3s', 'K2s',
      'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s', 'Q6s', 'Q5s', 'Q4s', 'Q3s',
      'JTs', 'J9s', 'J8s', 'J7s', 'J6s', 'T9s', 'T8s', 'T7s', 'T6s',
      '98s', '97s', '96s', '87s', '86s', '85s', '76s', '75s', '65s', '64s', '54s', '53s', '43s',
      'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A6o', 'A5o', 'A4o', 'A3o', 'A2o',
      'KQo', 'KJo', 'KTo', 'K9o', 'K8o', 'QJo', 'QTo', 'Q9o', 'JTo', 'J9o', 'T9o', '98o'
    ],
    call: [],
    threeBet: []
  },
  {
    id: 'sb',
    name: 'SB (Small Blind Open)',
    category: 'Open Raise (RFI)',
    description: 'Folded to you in the SB. Only one player left (BB), but you will play post-flop out of position.',
    stats: '39.2% of hands • 520 combos',
    raise: [
      'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
      'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
      'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s',
      'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s', 'Q6s', 'JTs', 'J9s', 'J8s', 'J7s',
      'T9s', 'T8s', 'T7s', '98s', '97s', '87s', '86s', '76s', '65s', '54s',
      'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A6o', 'A5o',
      'KQo', 'KJo', 'KTo', 'K9o', 'QJo', 'QTo', 'Q9o', 'JTo', 'J9o', 'T9o'
    ],
    call: [],
    threeBet: []
  },
  {
    id: 'bb_vs_btn',
    name: 'BB vs BTN Open',
    category: 'Blind Defense (Facing Raise)',
    description: 'Optimal Big Blind defense facing a standard Button 2.5bb open. Features 3-Bets, Calls, and Folds.',
    stats: '51.2% Total Defense (14% 3-Bet • 37.2% Call)',
    threeBet: [
      'AA', 'KK', 'QQ', 'JJ', 'TT',
      'AKs', 'AQs', 'AJs', 'ATs', 'A5s', 'A4s', 'A3s', 'A2s',
      'KQs', 'KJs', 'QJs', 'JTs', 'T9s', '98s',
      'AKo', 'AQo', 'AJo'
    ],
    call: [
      '99', '88', '77', '66', '55', '44', '33', '22',
      'A9s', 'A8s', 'A7s', 'A6s',
      'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s', 'K3s', 'K2s',
      'QTs', 'Q9s', 'Q8s', 'Q7s', 'Q6s', 'Q5s',
      'J9s', 'J8s', 'J7s', 'T8s', 'T7s', '97s', '96s', '86s', '85s', '75s', '64s', '53s', '43s',
      'ATo', 'A9o', 'A8o', 'A7o', 'A6o', 'A5o',
      'KQo', 'KJo', 'KTo', 'K9o', 'QJo', 'QTo', 'Q9o', 'JTo', 'J9o', 'T9o', '98o', '87o'
    ],
    raise: []
  },
  {
    id: 'bb_vs_utg',
    name: 'BB vs UTG Open',
    category: 'Blind Defense (Facing Raise)',
    description: 'Defending against the tightest opening range. Tight defense focused on premium 3-Bets and implied odds.',
    stats: '24.1% Total Defense (5.6% 3-Bet • 18.5% Call)',
    threeBet: [
      'AA', 'KK', 'QQ', 'JJ',
      'AKs', 'AQs', 'A5s',
      'AKo'
    ],
    call: [
      'TT', '99', '88', '77', '66', '55', '44', '33', '22',
      'AJs', 'ATs', 'A9s', 'A8s', 'A4s', 'A3s',
      'KQs', 'KJs', 'KTs', 'QJs', 'QTs', 'JTs', 'T9s', '98s', '87s', '76s', '65s',
      'AQo', 'AJo', 'KQo'
    ],
    raise: []
  }
];

const CUSTOM_RANGES_STORAGE_KEY = 'poker_custom_ranges_v1';

const getHandString = (rowIdx, colIdx) => {
  const rank1 = RANKS[rowIdx];
  const rank2 = RANKS[colIdx];
  if (rowIdx === colIdx) return `${rank1}${rank2}`; // Pair
  if (rowIdx < colIdx) return `${rank1}${rank2}s`; // Suited
  return `${rank2}${rank1}o`; // Offsuit
};

const getHandCombos = (hand) => {
  if (hand.length === 2) return 6; // Pair (e.g. AA)
  if (hand.endsWith('s')) return 4; // Suited (e.g. AKs)
  return 12; // Offsuit (e.g. AKo)
};

const RangeChart = () => {
  const navigate = useNavigate();

  // Mode: 'gto' | 'custom'
  const [activeMode, setActiveMode] = useState('gto');
  
  // GTO State
  const [activePosition, setActivePosition] = useState(GTO_PRESETS[0]);
  
  // Custom Range State
  const [customRange, setCustomRange] = useState({}); // { 'AA': 'raise', 'KK': 'call', ... }
  const [activeBrush, setActiveBrush] = useState('raise'); // 'raise' | 'call' | '3bet' | 'fold'
  const [customRangeName, setCustomRangeName] = useState('My Custom Range');
  const [savedCustomRanges, setSavedCustomRanges] = useState([]);
  
  // Mouse Drag state
  const [isMouseDown, setIsMouseDown] = useState(false);

  // Inspector Hover State
  const [hoveredHand, setHoveredHand] = useState(null);

  // Load custom ranges from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CUSTOM_RANGES_STORAGE_KEY);
      if (stored) {
        setSavedCustomRanges(JSON.parse(stored));
      }
    } catch {}
  }, []);

  // Calculate Combos and Percentage for Custom Range
  const calculateCustomStats = () => {
    let totalCombos = 0;
    Object.keys(customRange).forEach(hand => {
      if (customRange[hand] && customRange[hand] !== 'fold') {
        totalCombos += getHandCombos(hand);
      }
    });
    const pct = ((totalCombos / 1326) * 100).toFixed(1);
    return { totalCombos, pct };
  };

  const handleCellClickOrDrag = (hand) => {
    if (activeMode !== 'custom') return;
    
    setCustomRange(prev => {
      const current = prev[hand];
      if (current === activeBrush) {
        // Toggle off
        const next = { ...prev };
        delete next[hand];
        return next;
      }
      return { ...prev, [hand]: activeBrush };
    });
    playSound('click');
  };

  const handleSaveCustomRange = () => {
    if (!customRangeName.trim()) return;
    const entry = {
      id: `range_${Date.now()}`,
      name: customRangeName.trim(),
      range: customRange,
      updatedAt: new Date().toISOString()
    };
    const updated = [entry, ...savedCustomRanges.filter(r => r.name !== customRangeName.trim())];
    setSavedCustomRanges(updated);
    localStorage.setItem(CUSTOM_RANGES_STORAGE_KEY, JSON.stringify(updated));
    playSound('win');
  };

  const handleLoadCustomRange = (rangeObj) => {
    setCustomRange(rangeObj.range || {});
    setCustomRangeName(rangeObj.name || 'Loaded Range');
    playSound('click');
  };

  const handleDeleteCustomRange = (id) => {
    const updated = savedCustomRanges.filter(r => r.id !== id);
    setSavedCustomRanges(updated);
    localStorage.setItem(CUSTOM_RANGES_STORAGE_KEY, JSON.stringify(updated));
  };

  // Determine action for a given hand in active position
  const getHandAction = (hand) => {
    if (activeMode === 'custom') {
      return customRange[hand] || 'fold';
    }

    if (activePosition.threeBet && activePosition.threeBet.includes(hand)) {
      return '3bet';
    }
    if (activePosition.raise && activePosition.raise.includes(hand)) {
      return 'raise';
    }
    if (activePosition.call && activePosition.call.includes(hand)) {
      return 'call';
    }
    return 'fold';
  };

  const customStats = calculateCustomStats();

  return (
    <div className="range-container">
      {/* Header */}
      <div className="range-header">
        <div>
          <h1>📊 Pre-Flop Range Charts & GTO Matrix</h1>
          <p>Analyze Game Theory Optimal opening frequencies, 3-bet defense, or build custom strategies.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            className="user-mgmt-btn user-mgmt-btn-secondary user-mgmt-btn-sm"
            onClick={() => navigate('/')}
          >
            ← Dashboard
          </button>
        </div>
      </div>

      <div className="range-layout">
        {/* Left Control Sidebar */}
        <div className="range-sidebar">
          {/* Mode Switcher */}
          <div className="range-mode-toggle">
            <button
              type="button"
              className={`range-mode-btn ${activeMode === 'gto' ? 'active' : ''}`}
              onClick={() => setActiveMode('gto')}
            >
              🎓 GTO Presets
            </button>
            <button
              type="button"
              className={`range-mode-btn ${activeMode === 'custom' ? 'active' : ''}`}
              onClick={() => setActiveMode('custom')}
            >
              🛠️ Custom Range Builder
            </button>
          </div>

          {activeMode === 'gto' ? (
            <div className="range-card">
              <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.75rem 0', fontWeight: 600 }}>
                Select Position / Scenario
              </h3>

              <div className="position-list">
                {GTO_PRESETS.map((pos) => {
                  const isSelected = activePosition.id === pos.id;
                  return (
                    <button
                      key={pos.id}
                      type="button"
                      className={`pos-btn ${isSelected ? 'active' : ''}`}
                      onClick={() => {
                        setActivePosition(pos);
                        playSound('click');
                      }}
                    >
                      <span>{pos.name}</span>
                      <span className="pos-pct-badge">{pos.stats.split('•')[0].trim()}</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#38bdf8', marginBottom: '0.35rem' }}>
                  {activePosition.name}
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4, margin: '0 0 0.5rem 0' }}>
                  {activePosition.description}
                </p>
                <div style={{ fontSize: '0.76rem', color: '#34d399', fontWeight: 600 }}>
                  📈 {activePosition.stats}
                </div>
              </div>
            </div>
          ) : (
            /* Custom Range Builder Controls */
            <div className="range-card">
              <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.75rem 0', fontWeight: 600 }}>
                Range Paint Tools
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginBottom: '1rem' }}>
                <button
                  type="button"
                  className="user-mgmt-btn user-mgmt-btn-sm"
                  style={{
                    background: activeBrush === 'raise' ? '#ef4444' : 'rgba(239, 68, 68, 0.15)',
                    color: '#ffffff',
                    border: '1px solid rgba(239, 68, 68, 0.3)'
                  }}
                  onClick={() => setActiveBrush('raise')}
                >
                  🔴 Paint Raise
                </button>

                <button
                  type="button"
                  className="user-mgmt-btn user-mgmt-btn-sm"
                  style={{
                    background: activeBrush === 'call' ? '#3b82f6' : 'rgba(59, 130, 246, 0.15)',
                    color: '#ffffff',
                    border: '1px solid rgba(59, 130, 246, 0.3)'
                  }}
                  onClick={() => setActiveBrush('call')}
                >
                  🔵 Paint Call
                </button>

                <button
                  type="button"
                  className="user-mgmt-btn user-mgmt-btn-sm"
                  style={{
                    background: activeBrush === '3bet' ? '#a855f7' : 'rgba(168, 85, 247, 0.15)',
                    color: '#ffffff',
                    border: '1px solid rgba(168, 85, 247, 0.3)'
                  }}
                  onClick={() => setActiveBrush('3bet')}
                >
                  🟣 Paint 3-Bet
                </button>

                <button
                  type="button"
                  className="user-mgmt-btn user-mgmt-btn-sm"
                  style={{
                    background: activeBrush === 'fold' ? '#475569' : 'rgba(71, 85, 105, 0.2)',
                    color: '#cbd5e1',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}
                  onClick={() => setActiveBrush('fold')}
                >
                  🧹 Erase / Fold
                </button>
              </div>

              {/* Stats */}
              <div style={{ background: '#0b1120', padding: '0.75rem', borderRadius: '0.45rem', marginBottom: '1rem', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <span>Combos Selected:</span>
                  <strong style={{ color: '#f8fafc' }}>{customStats.totalCombos} / 1326</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  <span>Table Coverage:</span>
                  <strong style={{ color: '#34d399' }}>{customStats.pct}% of hands</strong>
                </div>
              </div>

              {/* Save Form */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                  Range Label
                </label>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input
                    type="text"
                    className="user-mgmt-input"
                    value={customRangeName}
                    onChange={(e) => setCustomRangeName(e.target.value)}
                    style={{ height: '32px', fontSize: '0.82rem' }}
                  />
                  <button
                    type="button"
                    className="user-mgmt-btn user-mgmt-btn-primary user-mgmt-btn-sm"
                    onClick={handleSaveCustomRange}
                  >
                    💾 Save
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <button
                  type="button"
                  className="user-mgmt-btn user-mgmt-btn-secondary user-mgmt-btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setCustomRange({});
                    playSound('click');
                  }}
                >
                  Clear All
                </button>
              </div>

              {/* Saved Ranges List */}
              {savedCustomRanges.length > 0 && (
                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '0.75rem' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                    Saved Ranges ({savedCustomRanges.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '140px', overflowY: 'auto' }}>
                    {savedCustomRanges.map(saved => (
                      <div key={saved.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0b1120', padding: '0.35rem 0.6rem', borderRadius: '4px' }}>
                        <button
                          type="button"
                          onClick={() => handleLoadCustomRange(saved)}
                          style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '0.8rem', cursor: 'pointer', textAlign: 'left', fontWeight: 500 }}
                        >
                          {saved.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomRange(saved.id)}
                          style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '0.8rem', cursor: 'pointer' }}
                          title="Delete saved range"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 13x13 Interactive Grid */}
        <div className="range-grid-container">
          <div
            className="range-grid-card"
            onMouseDown={() => setIsMouseDown(true)}
            onMouseUp={() => setIsMouseDown(false)}
            onMouseLeave={() => {
              setIsMouseDown(false);
              setHoveredHand(null);
            }}
          >
            <div className="range-grid">
              {RANKS.map((_, rowIdx) =>
                RANKS.map((_, colIdx) => {
                  const hand = getHandString(rowIdx, colIdx);
                  const isPair = rowIdx === colIdx;
                  const action = getHandAction(hand);

                  let cellClass = 'range-cell cell-fold';
                  if (action === 'raise') cellClass = 'range-cell cell-raise';
                  else if (action === 'call') cellClass = 'range-cell cell-call';
                  else if (action === '3bet') cellClass = 'range-cell cell-3bet';

                  if (isPair) cellClass += ' cell-pair';

                  return (
                    <div
                      key={hand}
                      className={cellClass}
                      onClick={() => handleCellClickOrDrag(hand)}
                      onMouseEnter={() => {
                        setHoveredHand({ hand, isPair, isSuited: rowIdx < colIdx, action });
                        if (isMouseDown && activeMode === 'custom') {
                          handleCellClickOrDrag(hand);
                        }
                      }}
                    >
                      {hand}
                    </div>
                  );
                })
              )}
            </div>

            {/* Action Legend */}
            <div className="range-legend">
              <div className="legend-item">
                <div className="legend-box cell-raise"></div>
                <span>Raise / Open</span>
              </div>
              <div className="legend-item">
                <div className="legend-box cell-3bet"></div>
                <span>3-Bet / Reraise</span>
              </div>
              <div className="legend-item">
                <div className="legend-box cell-call"></div>
                <span>Call</span>
              </div>
              <div className="legend-item">
                <div className="legend-box cell-fold"></div>
                <span>Fold</span>
              </div>
            </div>

            {/* Hand Inspector */}
            <div className="range-inspector">
              {hoveredHand ? (
                <>
                  <div>
                    <span className="inspector-hand">{hoveredHand.hand}</span>
                    <span style={{ color: 'var(--text-secondary)', marginLeft: '0.6rem' }}>
                      {hoveredHand.isPair ? 'Pocket Pair (6 combos)' : (hoveredHand.isSuited ? 'Suited (4 combos)' : 'Offsuit (12 combos)')}
                    </span>
                  </div>
                  <div style={{ textTransform: 'uppercase', fontWeight: 600, fontSize: '0.78rem' }}>
                    Action:{' '}
                    <span style={{
                      color: hoveredHand.action === 'raise' ? '#ef4444' : (hoveredHand.action === 'call' ? '#38bdf8' : (hoveredHand.action === '3bet' ? '#a855f7' : '#64748b'))
                    }}>
                      {hoveredHand.action}
                    </span>
                  </div>
                </>
              ) : (
                <div style={{ color: '#64748b', fontStyle: 'italic', margin: '0 auto' }}>
                  Hover over any card combo to inspect action and combos
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RangeChart;
