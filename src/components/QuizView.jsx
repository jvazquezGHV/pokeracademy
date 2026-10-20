import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import curriculum from '../data/curriculum.json';
import Card from './Card';
import FormattedProse from './FormattedProse';

const allLessons = [];
curriculum.tracks.forEach(track => {
  track.modules.forEach(mod => {
    mod.lessons.forEach(lesson => {
      allLessons.push({
        ...lesson,
        moduleTitle: mod.title,
        trackTitle: track.title,
        volumeTitle: track.volumeTitle || `Volume ${track.volume}: ${track.title}`
      });
    });
  });
});

const QuizView = ({ session }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentIndex = parseInt(id, 10);
  
  const quiz = allLessons[currentIndex];
  const isLast = currentIndex === allLessons.length - 1;

  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [flippedCards, setFlippedCards] = useState(0);

  // Reset state on quiz navigation
  useEffect(() => {
    setSelectedAnswer(null);
    setHasSubmitted(false);
    setFlippedCards(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentIndex]);

  if (!quiz || quiz.type !== 'quiz') {
    return (
      <div className="container" style={{ textAlign: 'center', marginTop: '4rem' }}>
        <h2>Quiz not found.</h2>
        <button className="btn-primary" onClick={() => navigate('/')} style={{ marginTop: '1rem' }}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  const hasCards = quiz.cards && quiz.cards.length > 0;
  const cardsRevealed = !hasCards || flippedCards >= quiz.cards.length;
  const isCorrect = selectedAnswer === quiz.correctAnswer;

  const handleSubmit = () => {
    if (selectedAnswer) {
      setHasSubmitted(true);
    }
  };

  const handleRetry = () => {
    setSelectedAnswer(null);
    setHasSubmitted(false);
  };

  const handleNext = async () => {
    if (isCorrect && session?.user) {
      try {
        const { data } = await supabase
          .from('user_progress')
          .select('completed_lessons')
          .eq('user_id', session.user.id)
          .single();
        
        let completed = data?.completed_lessons || [];
        if (!completed.includes(quiz.id)) {
          completed.push(quiz.id);
          if (data) {
            await supabase.from('user_progress').update({ completed_lessons: completed }).eq('user_id', session.user.id);
          } else {
            await supabase.from('user_progress').insert([{ user_id: session.user.id, completed_lessons: completed }]);
          }
        }
      } catch (err) {
        console.error('Error saving quiz progress', err);
      }
    }
    
    if (!isLast) {
      const nextItem = allLessons[currentIndex + 1];
      navigate(nextItem.type === 'quiz' ? `/quiz/${currentIndex + 1}` : `/learn/${currentIndex + 1}`);
    } else {
      navigate('/');
    }
  };

  return (
    <div className="container" style={{ maxWidth: '800px', marginTop: '2rem', paddingBottom: '4rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <button 
          onClick={() => navigate('/')} 
          style={{ background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}
        >
          ← Back to Dashboard
        </button>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
          {quiz.volumeTitle} • {quiz.moduleTitle}
        </span>
      </div>

      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <span style={{ 
          background: 'rgba(139, 92, 246, 0.15)', 
          color: '#a78bfa', 
          border: '1px solid rgba(139, 92, 246, 0.3)',
          padding: '0.25rem 0.75rem', 
          borderRadius: '9999px', 
          fontSize: '0.8rem', 
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          display: 'inline-block',
          marginBottom: '0.75rem'
        }}>
          🧠 Knowledge Checkpoint
        </span>
        <h1 className="text-accent" style={{ fontSize: '1.3rem', marginBottom: '0.4rem', fontWeight: 700 }}>{quiz.title}</h1>
        <div style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', maxWidth: '650px', margin: '0 auto', lineHeight: 1.55 }}>
          <FormattedProse content={quiz.question} />
        </div>
      </div>

      <div style={{ 
        backgroundColor: 'var(--surface-color)', 
        padding: '2.5rem', 
        borderRadius: '1.25rem', 
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(255,255,255,0.08)',
        textAlign: 'center'
      }}>
        {/* Render Cards if Quiz has cards */}
        {hasCards && (
          <div style={{ marginBottom: '2.5rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              {cardsRevealed ? 'All cards revealed:' : 'Click the cards to flip them face-up:'}
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', transform: 'scale(0.85)', transformOrigin: 'top center' }}>
              {quiz.cards.map((card, i) => (
                <Card 
                  key={`${currentIndex}-${i}`}
                  suit={card.suit} 
                  rank={card.rank} 
                  isFaceUp={false} 
                  disableFlip={hasSubmitted}
                  onClick={(isFlipped) => setFlippedCards(prev => isFlipped ? prev + 1 : prev - 1)} 
                />
              ))}
            </div>

            {!cardsRevealed && (
              <button 
                onClick={() => setFlippedCards(quiz.cards.length)}
                style={{ 
                  marginTop: '1rem', 
                  background: 'rgba(255,255,255,0.06)', 
                  color: 'var(--text-secondary)', 
                  border: '1px solid rgba(255,255,255,0.1)', 
                  padding: '0.35rem 0.75rem', 
                  borderRadius: '0.4rem', 
                  fontSize: '0.75rem', 
                  cursor: 'pointer' 
                }}
              >
                Reveal All Cards 🃏
              </button>
            )}
          </div>
        )}

        {/* Options Area (Visible once cards are revealed, or immediately if no cards) */}
        {cardsRevealed && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <h3 style={{ marginBottom: '1.25rem', color: '#ffffff', fontSize: '1rem', fontWeight: '600' }}>
              Select your answer:
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '480px', margin: '0 auto' }}>
              {quiz.options.map((opt, i) => {
                const isSelected = selectedAnswer === opt;
                let bgColor = 'var(--bg-color)';
                let borderColor = 'rgba(255,255,255,0.1)';
                let textColor = 'var(--text-primary)';

                if (isSelected && !hasSubmitted) {
                  bgColor = 'rgba(59, 130, 246, 0.2)';
                  borderColor = '#3b82f6';
                  textColor = '#93c5fd';
                }

                if (hasSubmitted) {
                  if (opt === quiz.correctAnswer) {
                    bgColor = 'rgba(16, 185, 129, 0.25)';
                    borderColor = '#10b981';
                    textColor = '#6ee7b7';
                  } else if (isSelected && !isCorrect) {
                    bgColor = 'rgba(239, 68, 68, 0.25)';
                    borderColor = '#ef4444';
                    textColor = '#fca5a5';
                  }
                }

                return (
                  <button
                    key={i}
                    onClick={() => !hasSubmitted && setSelectedAnswer(opt)}
                    style={{
                      padding: '0.65rem 1rem',
                      borderRadius: '0.5rem',
                      backgroundColor: bgColor,
                      color: textColor,
                      border: `1px solid ${borderColor}`,
                      cursor: hasSubmitted ? 'default' : 'pointer',
                      fontWeight: '600',
                      fontSize: '0.85rem',
                      textAlign: 'left',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem'
                    }}
                  >
                    <span style={{ 
                      width: '24px', 
                      height: '24px', 
                      borderRadius: '50%', 
                      background: 'rgba(255,255,255,0.08)', 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      fontSize: '0.8rem',
                      flexShrink: 0
                    }}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span>{opt}</span>
                  </button>
                );
              })}
            </div>

            {!hasSubmitted && (
              <button 
                className="btn-primary" 
                onClick={handleSubmit}
                disabled={!selectedAnswer}
                style={{ 
                  marginTop: '2rem', 
                  opacity: !selectedAnswer ? 0.5 : 1, 
                  cursor: !selectedAnswer ? 'not-allowed' : 'pointer',
                  padding: '0.75rem 2rem',
                  fontSize: '0.95rem'
                }}
              >
                Submit Answer
              </button>
            )}

            {hasSubmitted && (
              <div style={{ 
                marginTop: '2rem', 
                padding: '1.25rem', 
                borderRadius: '0.75rem', 
                backgroundColor: isCorrect ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                border: `1px solid ${isCorrect ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
              }}>
                <h3 style={{ color: isCorrect ? '#34d399' : '#f87171', marginBottom: '0.5rem', fontSize: '1.1rem' }}>
                  {isCorrect ? '🎉 Correct! Mastery Demonstrated.' : `❌ Incorrect. The correct answer was "${quiz.correctAnswer}".`}
                </h3>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.25rem' }}>
                  {!isCorrect && (
                    <button 
                      onClick={handleRetry}
                      style={{
                        background: 'rgba(255,255,255,0.1)',
                        color: '#ffffff',
                        border: '1px solid rgba(255,255,255,0.2)',
                        padding: '0.65rem 1.25rem',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '0.9rem'
                      }}
                    >
                      Try Again ↺
                    </button>
                  )}
                  <button 
                    className="btn-primary" 
                    onClick={handleNext}
                    style={{ padding: '0.65rem 1.5rem', fontSize: '0.9rem' }}
                  >
                    {isLast ? 'Complete Playbook 🏆' : 'Continue to Next Chapter →'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default QuizView;
