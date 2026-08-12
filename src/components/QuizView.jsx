import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import curriculum from '../data/curriculum.json';
import Card from './Card';

const allLessons = [];
curriculum.tracks.forEach(track => {
  track.modules.forEach(mod => {
    mod.lessons.forEach(lesson => {
      allLessons.push({
        ...lesson,
        moduleTitle: mod.title,
        trackTitle: track.title
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

  if (!quiz || quiz.type !== 'quiz') {
    return <div className="container" style={{ textAlign: 'center', marginTop: '4rem' }}><h2>Quiz not found.</h2></div>;
  }

  const isCorrect = selectedAnswer === quiz.correctAnswer;

  const handleSubmit = () => {
    if (selectedAnswer) {
      setHasSubmitted(true);
    }
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
        console.error("Error saving quiz progress", err);
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
    <div className="container" style={{ maxWidth: '800px', marginTop: '2rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 className="text-accent">{quiz.title}</h1>
        <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>{quiz.question}</p>
      </div>

      <div style={{ 
        backgroundColor: 'var(--surface-color)', 
        padding: '3rem', 
        borderRadius: '1rem', 
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(255,255,255,0.05)',
        textAlign: 'center'
      }}>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '3rem' }}>
          {quiz.cards.map((card, i) => (
            <Card 
              key={`${currentIndex}-${i}`} // Force re-render on quiz change
              suit={card.suit} 
              rank={card.rank} 
              isFaceUp={false} 
              disableFlip={hasSubmitted} // Stop flipping after submit
              onClick={(isFlipped) => setFlippedCards(prev => isFlipped ? prev + 1 : prev - 1)} 
            />
          ))}
        </div>

        {flippedCards === quiz.cards.length && (
          <div style={{ animation: 'fadeIn 0.5s ease' }}>
            <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Select the correct hand:</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '400px', margin: '0 auto' }}>
              {quiz.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => !hasSubmitted && setSelectedAnswer(opt)}
                  style={{
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    backgroundColor: selectedAnswer === opt ? 'var(--accent-color)' : 'var(--bg-color)',
                    color: selectedAnswer === opt ? 'white' : 'var(--text-primary)',
                    border: '1px solid',
                    borderColor: selectedAnswer === opt ? 'var(--accent-color)' : 'var(--surface-color-hover)',
                    cursor: hasSubmitted ? 'default' : 'pointer',
                    fontWeight: 'bold',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>

            {!hasSubmitted && (
              <button 
                className="btn-primary" 
                onClick={handleSubmit}
                disabled={!selectedAnswer}
                style={{ marginTop: '2rem', opacity: !selectedAnswer ? 0.5 : 1 }}
              >
                Submit Answer
              </button>
            )}

            {hasSubmitted && (
              <div style={{ marginTop: '2rem', padding: '1rem', borderRadius: '0.5rem', backgroundColor: isCorrect ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)' }}>
                <h3 style={{ color: isCorrect ? 'var(--accent-color)' : 'var(--danger-color)' }}>
                  {isCorrect ? 'Correct! Well done.' : `Incorrect. The correct answer was ${quiz.correctAnswer}.`}
                </h3>
                <button className="btn-primary" onClick={handleNext} style={{ marginTop: '1rem' }}>
                  {isCorrect ? 'Continue' : 'Back to Dashboard'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default QuizView;
