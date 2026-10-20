import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import curriculum from '../data/curriculum.json';
import Card from './Card';
import './LessonView.css';

// The Official 10 Poker Hands Hierarchy
const POKER_HANDS_HIERARCHY = [
  {
    rank: 1,
    name: 'Royal Flush',
    odds: '1 in 649,740 (0.00015%)',
    cards: [
      { suit: 'hearts', rank: 'A' },
      { suit: 'hearts', rank: 'K' },
      { suit: 'hearts', rank: 'Q' },
      { suit: 'hearts', rank: 'J' },
      { suit: 'hearts', rank: '10' }
    ],
    rule: 'Ace, King, Queen, Jack, and Ten of the exact same suit.',
    tiebreaker: 'The absolute peak of Texas Hold\'em. Unbeatable under any rules.'
  },
  {
    rank: 2,
    name: 'Straight Flush',
    odds: '1 in 72,193 (0.00139%)',
    cards: [
      { suit: 'clubs', rank: '9' },
      { suit: 'clubs', rank: '8' },
      { suit: 'clubs', rank: '7' },
      { suit: 'clubs', rank: '6' },
      { suit: 'clubs', rank: '5' }
    ],
    rule: 'Any five consecutive cards of the exact same suit.',
    tiebreaker: 'If two players have a straight flush, the hand with the highest top card wins (e.g. 9-high beats 7-high).'
  },
  {
    rank: 3,
    name: 'Four of a Kind (Quads)',
    odds: '1 in 4,165 (0.024%)',
    cards: [
      { suit: 'spades', rank: 'Q' },
      { suit: 'hearts', rank: 'Q' },
      { suit: 'diamonds', rank: 'Q' },
      { suit: 'clubs', rank: 'Q' },
      { suit: 'spades', rank: '4' }
    ],
    rule: 'All four cards of the same numerical rank.',
    tiebreaker: 'Higher quadruplet rank wins (e.g. 8-8-8-8 beats 5-5-5-5). If quads are on the board, the 5th card kicker breaks ties.'
  },
  {
    rank: 4,
    name: 'Full House (Boat)',
    odds: '1 in 694 (0.144%)',
    cards: [
      { suit: 'spades', rank: 'K' },
      { suit: 'hearts', rank: 'K' },
      { suit: 'diamonds', rank: 'K' },
      { suit: 'clubs', rank: '8' },
      { suit: 'diamonds', rank: '8' }
    ],
    rule: 'Three cards of one rank and two cards of another rank (Kings full of Eights).',
    tiebreaker: 'The three-of-a-kind rank decides the winner first (e.g. 10-10-10-2-2 beats 9-9-9-A-A). If trips tie, higher pair wins.'
  },
  {
    rank: 5,
    name: 'Flush',
    odds: '1 in 508 (0.196%)',
    cards: [
      { suit: 'diamonds', rank: 'A' },
      { suit: 'diamonds', rank: 'J' },
      { suit: 'diamonds', rank: '9' },
      { suit: 'diamonds', rank: '6' },
      { suit: 'diamonds', rank: '3' }
    ],
    rule: 'Any five cards of the same suit, not in numerical sequence.',
    tiebreaker: 'Always beats a Straight! The player holding the highest single card in the flush wins (Nut Flush = Ace-high).'
  },
  {
    rank: 6,
    name: 'Straight',
    odds: '1 in 254 (0.392%)',
    cards: [
      { suit: 'spades', rank: '10' },
      { suit: 'hearts', rank: '9' },
      { suit: 'diamonds', rank: '8' },
      { suit: 'clubs', rank: '7' },
      { suit: 'spades', rank: '6' }
    ],
    rule: 'Five consecutive cards of mixed suits. Ace can count as high (A-K-Q-J-10) or low (5-4-3-2-A).',
    tiebreaker: 'Highest top card of the sequence wins. Broadway (A-high) beats a 10-high straight. The Wheel (A-2-3-4-5) is 5-high.'
  },
  {
    rank: 7,
    name: 'Three of a Kind (Trips / Set)',
    odds: '1 in 47 (2.11%)',
    cards: [
      { suit: 'spades', rank: '7' },
      { suit: 'hearts', rank: '7' },
      { suit: 'diamonds', rank: '7' },
      { suit: 'clubs', rank: 'A' },
      { suit: 'spades', rank: '5' }
    ],
    rule: 'Three cards of the same rank plus two non-paired kickers.',
    tiebreaker: 'Always beats Two Pair! Higher triplet wins (e.g. 8-8-8 beats 7-7-7). If identical, highest kicker decides.'
  },
  {
    rank: 8,
    name: 'Two Pair (Double Pair)',
    odds: '1 in 21 (4.75%)',
    cards: [
      { suit: 'spades', rank: 'J' },
      { suit: 'diamonds', rank: 'J' },
      { suit: 'hearts', rank: '4' },
      { suit: 'clubs', rank: '4' },
      { suit: 'spades', rank: 'A' }
    ],
    rule: 'Two distinct pairs plus one fifth card kicker (Jacks and Fours with an Ace kicker).',
    tiebreaker: 'The highest single pair decides the winner! Aces and Deuces beats Kings and Queens. Second pair breaks ties only if top pairs match.'
  },
  {
    rank: 9,
    name: 'One Pair',
    odds: '1 in 2.37 (42.26%)',
    cards: [
      { suit: 'spades', rank: 'A' },
      { suit: 'diamonds', rank: 'A' },
      { suit: 'hearts', rank: 'K' },
      { suit: 'clubs', rank: '9' },
      { suit: 'diamonds', rank: '3' }
    ],
    rule: 'Two cards of identical rank plus three kickers.',
    tiebreaker: 'Higher pair wins (e.g. Pair of Kings beats Pair of Tens). If both have the same pair, the highest kicker card decides.'
  },
  {
    rank: 10,
    name: 'High Card',
    odds: '1 in 1.99 (50.12%)',
    cards: [
      { suit: 'spades', rank: 'A' },
      { suit: 'diamonds', rank: 'Q' },
      { suit: 'hearts', rank: '9' },
      { suit: 'clubs', rank: '6' },
      { suit: 'diamonds', rank: '2' }
    ],
    rule: 'No pairs, no straight, and no flush. The highest single card in your 5-card holding plays.',
    tiebreaker: 'Highest card wins. Ace-high beats King-high. If highest cards tie, subsequent cards (2nd, 3rd, 4th, 5th) break the tie.'
  }
];

// Flatten the curriculum into an array of lessons for sequential navigation
const allLessons = [];
const lessonIndexMap = {};

curriculum.tracks.forEach(track => {
  track.modules.forEach(mod => {
    mod.lessons.forEach((lesson, lIdx) => {
      const idx = allLessons.length;
      allLessons.push({
        ...lesson,
        globalIndex: idx,
        volume: track.volume,
        volumeTitle: track.volumeTitle || `Volume ${track.volume}: ${track.title}`,
        trackTitle: track.title,
        trackId: track.id,
        moduleTitle: mod.title,
        moduleId: mod.id,
        lessonOrder: lIdx + 1,
        totalInModule: mod.lessons.length
      });
      lessonIndexMap[lesson.id] = idx;
    });
  });
});

const LessonView = ({ session }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentIndex = parseInt(id, 10);

  // User state & progress
  const [completedLessons, setCompletedLessons] = useState([]);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const [selectedHandRank, setSelectedHandRank] = useState(8); // Default to Two Pair for immediate recognition

  // Interactive decision challenge state (resets per lesson)
  const [selectedDecision, setSelectedDecision] = useState(null);

  // Interactive pot odds slider state
  const [potSize, setPotSize] = useState(100);
  const [betSize, setBetSize] = useState(50);

  // Reset challenge selection when navigating lessons
  useEffect(() => {
    setSelectedDecision(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentIndex]);

  // Fetch completed lessons for TOC badges
  useEffect(() => {
    const fetchProgress = async () => {
      if (!session?.user) return;
      try {
        const { data } = await supabase
          .from('user_progress')
          .select('completed_lessons')
          .eq('user_id', session.user.id)
          .single();
        if (data?.completed_lessons) {
          setCompletedLessons(data.completed_lessons);
        }
      } catch (err) {
        console.error('Error fetching lesson progress', err);
      }
    };
    fetchProgress();
  }, [session, currentIndex]);

  if (isNaN(currentIndex) || currentIndex < 0 || currentIndex >= allLessons.length) {
    return (
      <div className="lesson-page-container" style={{ textAlign: 'center', marginTop: '4rem' }}>
        <h2>Lesson not found.</h2>
        <button className="btn-primary" onClick={() => navigate('/')} style={{ marginTop: '1rem' }}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  const lesson = allLessons[currentIndex];
  const isLast = currentIndex === allLessons.length - 1;
  const isFirst = currentIndex === 0;

  const markCompleted = async () => {
    if (!session?.user) return;
    try {
      const { data } = await supabase
        .from('user_progress')
        .select('completed_lessons')
        .eq('user_id', session.user.id)
        .single();

      let completed = data?.completed_lessons || [];
      if (!completed.includes(lesson.id)) {
        completed.push(lesson.id);
        if (data) {
          await supabase.from('user_progress').update({ completed_lessons: completed }).eq('user_id', session.user.id);
        } else {
          await supabase.from('user_progress').insert([{ user_id: session.user.id, completed_lessons: completed }]);
        }
        setCompletedLessons(completed);
      }
    } catch (err) {
      console.error('Error saving progress', err);
    }
  };

  const handleNext = async () => {
    await markCompleted();
    if (!isLast) {
      const nextItem = allLessons[currentIndex + 1];
      navigate(nextItem.type === 'quiz' ? `/quiz/${currentIndex + 1}` : `/learn/${currentIndex + 1}`);
    } else {
      navigate('/');
    }
  };

  const handlePrev = () => {
    if (!isFirst) {
      const prevItem = allLessons[currentIndex - 1];
      navigate(prevItem.type === 'quiz' ? `/quiz/${currentIndex - 1}` : `/learn/${currentIndex - 1}`);
    }
  };

  const handleHome = async () => {
    await markCompleted();
    navigate('/');
  };

  // Pot Odds calculations for the interactive tool
  const totalPotAfterCall = potSize + betSize + betSize;
  const potOddsRatio = totalPotAfterCall > 0 ? (betSize / totalPotAfterCall) * 100 : 0;
  const directOddsRatioText = betSize > 0 ? `${((potSize + betSize) / betSize).toFixed(1)}:1` : '0:1';

  const activeHand = POKER_HANDS_HIERARCHY.find(h => h.rank === selectedHandRank) || POKER_HANDS_HIERARCHY[7];

  return (
    <div className="lesson-page-container">
      {/* Top Header / Navigation */}
      <div className="lesson-top-nav">
        <div className="lesson-nav-actions">
          <button className="lesson-back-btn" onClick={handleHome}>
            ← Dashboard
          </button>
          <button className="lesson-toc-btn" onClick={() => setIsTocOpen(true)}>
            📑 Table of Contents
          </button>
          <button 
            className="lesson-toc-btn" 
            onClick={() => setShowCheatSheet(!showCheatSheet)}
            style={{ 
              backgroundColor: showCheatSheet ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              borderColor: showCheatSheet ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)',
              color: showCheatSheet ? '#93c5fd' : 'var(--text-secondary)'
            }}
          >
            🃏 Hand Rankings Reference
          </button>
        </div>

        <div className="lesson-meta-badge">
          <span className="lesson-volume-pill">Vol {lesson.volume}</span>
          <span className="lesson-read-time-pill">
            ⏱️ {lesson.estimatedMinutes || 4} min read
          </span>
        </div>
      </div>

      {/* Module Progress Bar */}
      <div className="lesson-progress-indicator">
        <div className="lesson-progress-bar-bg">
          <div 
            className="lesson-progress-bar-fill"
            style={{ width: `${Math.round((lesson.lessonOrder / lesson.totalInModule) * 100)}%` }}
          />
        </div>
        <span className="lesson-progress-label">
          Lesson {lesson.lessonOrder} of {lesson.totalInModule} in Module
        </span>
      </div>

      {/* Main Book Reader Card */}
      <article className="lesson-card-wrapper">
        <div className="lesson-breadcrumbs">
          {lesson.volumeTitle} • {lesson.moduleTitle}
        </div>
        <h1 className="lesson-main-title">{lesson.title}</h1>

        {/* Core Concept Spotlight */}
        {lesson.coreConcept && (
          <div className="lesson-core-concept-box">
            <div className="lesson-core-concept-title">
              <span>🎯</span> Core Strategic Principle
            </div>
            <p className="lesson-core-concept-text">{lesson.coreConcept}</p>
          </div>
        )}

        {/* Interactive Hands Hierarchy Explorer (All 10 Hands from Royal Flush to High Card) */}
        {(lesson.hasHandsExplorer || showCheatSheet) && (
          <div className="hands-explorer-card">
            <div className="hands-explorer-top">
              <h3 className="hands-explorer-title">
                <span>🃏</span> The Official 10 Poker Hands (Highest to Lowest)
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Click any hand below to view card combinations & tiebreakers:
              </span>
            </div>

            {/* Hand Pills Selector */}
            <div className="hands-selector-bar">
              {POKER_HANDS_HIERARCHY.map((h) => {
                const isActive = activeHand.rank === h.rank;
                return (
                  <button
                    key={`hand-tab-${h.rank}`}
                    className={`hand-pill-btn ${isActive ? 'active' : ''}`}
                    onClick={() => setSelectedHandRank(h.rank)}
                  >
                    <span className="hand-rank-tag">#{h.rank}</span>
                    <span>{h.name.split(' (')[0]}</span>
                  </button>
                );
              })}
            </div>

            {/* Active Hand Showcase */}
            <div className="hands-showcase-box">
              <div className="hand-showcase-meta">
                <div className="hand-showcase-name">
                  #{activeHand.rank}: {activeHand.name}
                </div>
                <div className="hand-showcase-odds">
                  Odds: {activeHand.odds}
                </div>
              </div>

              <div className="hand-showcase-cards">
                {activeHand.cards.map((c, i) => (
                  <Card
                    key={`hand-showcase-${activeHand.rank}-${i}`}
                    suit={c.suit}
                    rank={c.rank}
                    isFaceUp={true}
                    disableFlip={true}
                  />
                ))}
              </div>

              <div className="hand-showcase-rule">
                <strong>Definition:</strong> {activeHand.rule}
              </div>
              <div className="hand-showcase-tiebreaker">
                <strong>⚖️ Tiebreaker Rule:</strong> {activeHand.tiebreaker}
              </div>
            </div>
          </div>
        )}

        {/* Lesson Body Content */}
        <div className="lesson-body-prose">
          {lesson.content}
        </div>

        {/* Visual Poker Spot (Felt Table) */}
        {lesson.visualSpot && (
          <div className="lesson-spot-container">
            <div className="lesson-spot-header">
              <span className="lesson-spot-tag">
                ♠️ Hand Spotlight: {lesson.visualSpot.handDescription || 'Key Scenario'}
              </span>
              {lesson.visualSpot.pot && (
                <span className="lesson-spot-pot-badge">
                  Pot: ${lesson.visualSpot.pot}
                </span>
              )}
            </div>

            <div className="lesson-spot-table-area">
              {/* Community Board Cards */}
              {lesson.visualSpot.boardCards && lesson.visualSpot.boardCards.length > 0 && (
                <div className="lesson-spot-board-section">
                  <span className="lesson-spot-section-label">Community Board</span>
                  <div className="lesson-spot-cards-row">
                    {lesson.visualSpot.boardCards.map((c, i) => (
                      <Card 
                        key={`board-${i}`}
                        suit={c.suit}
                        rank={c.rank}
                        isFaceUp={true}
                        disableFlip={true}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Player Cards */}
              <div className="lesson-spot-hands-row">
                {lesson.visualSpot.heroCards && (
                  <div className="lesson-spot-player-box">
                    <span className="lesson-spot-section-label" style={{ color: '#34d399' }}>
                      Hero ({lesson.visualSpot.heroPosition || 'BTN'})
                    </span>
                    <div className="lesson-spot-cards-row">
                      {lesson.visualSpot.heroCards.map((c, i) => (
                        <Card 
                          key={`hero-${i}`}
                          suit={c.suit}
                          rank={c.rank}
                          isFaceUp={true}
                          disableFlip={true}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {lesson.visualSpot.villainCards && (
                  <div className="lesson-spot-player-box">
                    <span className="lesson-spot-section-label" style={{ color: '#f87171' }}>
                      Opponent (Villain)
                    </span>
                    <div className="lesson-spot-cards-row">
                      {lesson.visualSpot.villainCards.map((c, i) => (
                        <Card 
                          key={`villain-${i}`}
                          suit={c.suit}
                          rank={c.rank}
                          isFaceUp={true}
                          disableFlip={true}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {lesson.visualSpot.handDescription && (
              <div className="lesson-spot-desc-banner">
                {lesson.visualSpot.handDescription}
              </div>
            )}
          </div>
        )}

        {/* Interactive Pot Odds Calculator Widget */}
        {lesson.mathTool === 'pot_odds_slider' && (
          <div className="lesson-pot-odds-tool">
            <div className="pot-odds-tool-title">
              <span>🧮</span> Interactive Pot Odds & Equity Lab
            </div>
            <p className="pot-odds-tool-subtitle">
              Drag the sliders below to simulate any pot & bet size. Watch how the required break-even equity automatically shifts.
            </p>

            <div className="pot-odds-controls-grid">
              <div className="pot-odds-control-group">
                <div className="pot-odds-label-row">
                  <span>Current Pot Size:</span>
                  <span className="pot-odds-val-chip">${potSize}</span>
                </div>
                <input 
                  type="range"
                  min="20"
                  max="1000"
                  step="10"
                  value={potSize}
                  onChange={(e) => setPotSize(Number(e.target.value))}
                  className="pot-odds-slider"
                />
              </div>

              <div className="pot-odds-control-group">
                <div className="pot-odds-label-row">
                  <span>Opponent Bet Size:</span>
                  <span className="pot-odds-val-chip">${betSize}</span>
                </div>
                <input 
                  type="range"
                  min="10"
                  max="500"
                  step="5"
                  value={betSize}
                  onChange={(e) => setBetSize(Number(e.target.value))}
                  className="pot-odds-slider"
                />
              </div>
            </div>

            <div className="pot-odds-results-dashboard">
              <div className="pot-odds-metric-card">
                <span className="pot-odds-metric-name">Cost to Call</span>
                <span className="pot-odds-metric-val highlight-blue">${betSize}</span>
              </div>
              <div className="pot-odds-metric-card">
                <span className="pot-odds-metric-name">Total Pot to Win</span>
                <span className="pot-odds-metric-val">${totalPotAfterCall}</span>
              </div>
              <div className="pot-odds-metric-card">
                <span className="pot-odds-metric-name">Required Equity</span>
                <span className="pot-odds-metric-val highlight-green">{potOddsRatio.toFixed(1)}%</span>
              </div>
              <div className="pot-odds-metric-card">
                <span className="pot-odds-metric-name">Direct Pot Odds</span>
                <span className="pot-odds-metric-val">{directOddsRatioText}</span>
              </div>
            </div>

            {/* Visual Equity Gauge */}
            <div className="equity-gauge-container">
              <div className="pot-odds-label-row" style={{ marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Break-Even Equity Gauge: <strong>{potOddsRatio.toFixed(1)}%</strong>
                </span>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  Formula: ${betSize} / (${potSize} + ${betSize} + ${betSize})
                </span>
              </div>

              <div className="equity-gauge-bar-wrapper">
                <div 
                  className="equity-gauge-fill" 
                  style={{ width: `${Math.min(potOddsRatio, 100)}%` }}
                />
                <div 
                  className="equity-gauge-marker"
                  style={{ left: `${Math.min(potOddsRatio, 100)}%` }}
                />
              </div>

              <div className="equity-benchmarks-list">
                <div className="equity-benchmark-item">
                  <span className="equity-benchmark-badge" style={{ background: '#10b981' }} />
                  <span>Flush Draw (Flop): ~36% {potOddsRatio <= 36 ? '✅ Profitable' : '❌ Needs Implied Odds'}</span>
                </div>
                <div className="equity-benchmark-item">
                  <span className="equity-benchmark-badge" style={{ background: '#3b82f6' }} />
                  <span>OESD (Flop): ~32% {potOddsRatio <= 32 ? '✅ Profitable' : '❌ Needs Implied Odds'}</span>
                </div>
                <div className="equity-benchmark-item">
                  <span className="equity-benchmark-badge" style={{ background: '#f59e0b' }} />
                  <span>Flush Draw (Turn): ~18% {potOddsRatio <= 18 ? '✅ Profitable' : '⚠️ Pricey'}</span>
                </div>
                <div className="equity-benchmark-item">
                  <span className="equity-benchmark-badge" style={{ background: '#ef4444' }} />
                  <span>Gutshot (Turn): ~8.5% {potOddsRatio <= 8.5 ? '✅ Cheap' : '🚫 Fold'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Inline Decision Challenge */}
        {lesson.decisionChallenge && (
          <div className="lesson-decision-card">
            <span className="decision-card-badge">
              ⚡ What Would You Do?
            </span>
            <div className="decision-question-text">
              {lesson.decisionChallenge.question}
            </div>

            <div className="decision-options-list">
              {lesson.decisionChallenge.options.map((optionText, optIdx) => {
                const isSelected = selectedDecision === optIdx;
                const isCorrectChoice = optIdx === lesson.decisionChallenge.correctIndex;
                let btnClass = 'decision-option-btn';
                if (selectedDecision !== null) {
                  if (isSelected && isCorrectChoice) btnClass += ' selected-correct';
                  else if (isSelected && !isCorrectChoice) btnClass += ' selected-incorrect';
                  else if (isCorrectChoice) btnClass += ' selected-correct';
                }

                return (
                  <button
                    key={`opt-${optIdx}`}
                    className={btnClass}
                    onClick={() => setSelectedDecision(optIdx)}
                  >
                    <span style={{ 
                      width: '20px', 
                      height: '20px', 
                      borderRadius: '50%', 
                      background: 'rgba(255,255,255,0.08)', 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      flexShrink: 0
                    }}>
                      {String.fromCharCode(65 + optIdx)}
                    </span>
                    <span>{optionText}</span>
                  </button>
                );
              })}
            </div>

            {selectedDecision !== null && (
              <div className={`decision-feedback-banner ${selectedDecision === lesson.decisionChallenge.correctIndex ? 'success' : 'warning'}`}>
                <div className={`decision-feedback-title ${selectedDecision === lesson.decisionChallenge.correctIndex ? 'success' : 'warning'}`}>
                  <span>{selectedDecision === lesson.decisionChallenge.correctIndex ? '✅ Optimal Decision!' : '⚠️ Suboptimal Choice'}</span>
                </div>
                <p className="decision-feedback-explanation">
                  {lesson.decisionChallenge.explanation}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Pro Coach Callouts (Tip, Trap, Golden Rule) */}
        {(lesson.proTip || lesson.commonMistake || lesson.goldenRule) && (
          <div className="lesson-callouts-grid">
            {lesson.proTip && (
              <div className="callout-box callout-box-protip">
                <span className="callout-icon">💡</span>
                <div className="callout-content">
                  <div className="callout-title">Pro Coach Insight</div>
                  <p className="callout-desc">{lesson.proTip}</p>
                </div>
              </div>
            )}

            {lesson.commonMistake && (
              <div className="callout-box callout-box-mistake">
                <span className="callout-icon">⚠️</span>
                <div className="callout-content">
                  <div className="callout-title">Amateur Trap / Common Leak</div>
                  <p className="callout-desc">{lesson.commonMistake}</p>
                </div>
              </div>
            )}

            {lesson.goldenRule && (
              <div className="callout-box callout-box-goldenrule">
                <span className="callout-icon">🏆</span>
                <div className="callout-content">
                  <div className="callout-title">The Golden Rule</div>
                  <p className="callout-desc">{lesson.goldenRule}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </article>

      {/* Footer Navigation */}
      <div className="lesson-footer-nav">
        <button 
          className="lesson-footer-btn-prev" 
          onClick={handlePrev}
          disabled={isFirst}
        >
          ← Previous Chapter
        </button>

        <button 
          className="lesson-footer-btn-next" 
          onClick={handleNext}
        >
          {isLast ? 'Complete Playbook 🏆' : 'Mark Complete & Continue →'}
        </button>
      </div>

      {/* Table of Contents Drawer */}
      {isTocOpen && (
        <>
          <div className="lesson-toc-overlay" onClick={() => setIsTocOpen(false)} />
          <aside className="lesson-toc-drawer">
            <div className="lesson-toc-header">
              <h3 className="lesson-toc-title">
                <span>📚</span> Poker Playbook
              </h3>
              <button className="lesson-toc-close-btn" onClick={() => setIsTocOpen(false)}>
                ✕
              </button>
            </div>

            <div className="lesson-toc-body">
              {curriculum.tracks.map((track) => (
                <div key={track.id} className="toc-volume-group">
                  <div className="toc-volume-heading">
                    {track.volumeTitle || `Volume ${track.volume}: ${track.title}`}
                  </div>

                  {track.modules.map((mod) => (
                    <div key={mod.id} className="toc-module-block">
                      <div className="toc-module-name">{mod.title}</div>
                      <ul className="toc-lessons-list">
                        {mod.lessons.map((item) => {
                          const itemIdx = lessonIndexMap[item.id];
                          const isActive = currentIndex === itemIdx;
                          const isDone = completedLessons.includes(item.id);

                          return (
                            <li
                              key={item.id}
                              className={`toc-lesson-item ${isActive ? 'active' : ''} ${isDone ? 'completed' : ''}`}
                              onClick={() => {
                                setIsTocOpen(false);
                                navigate(item.type === 'quiz' ? `/quiz/${itemIdx}` : `/learn/${itemIdx}`);
                              }}
                            >
                              <span>
                                {isDone ? '✅' : (item.type === 'quiz' ? '🧠' : '📄')}
                              </span>
                              <span className="toc-item-title">{item.title}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </aside>
        </>
      )}
    </div>
  );
};

export default LessonView;
