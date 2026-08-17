import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import curriculum from '../data/curriculum.json';
import Card from './Card';

// Flatten the curriculum into an array of lessons for step-by-step navigation
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

const LessonView = ({ session }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentIndex = parseInt(id, 10);
  
  if (isNaN(currentIndex) || currentIndex < 0 || currentIndex >= allLessons.length) {
    return <div className="container" style={{ textAlign: 'center', marginTop: '4rem' }}><h2>Lesson not found.</h2></div>;
  }

  const lesson = allLessons[currentIndex];
  const isLast = currentIndex === allLessons.length - 1;
  const isFirst = currentIndex === 0;

  const markCompleted = async () => {
    if (!session?.user) return;
    
    try {
      const { data, error } = await supabase
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
      }
    } catch (err) {
      console.error("Error saving progress", err);
    }
  };

  const handleNext = async () => {
    await markCompleted();
    if (!isLast) {
      const nextItem = allLessons[currentIndex + 1];
      navigate(nextItem.type === 'quiz' ? `/quiz/${currentIndex + 1}` : `/learn/${currentIndex + 1}`);
    }
    else navigate('/');
  };

  const handlePrev = () => {
    if (!isFirst) navigate(`/learn/${currentIndex - 1}`);
  };

  const handleHome = async () => {
    await markCompleted();
    navigate('/');
  };

  return (
    <div className="container" style={{ maxWidth: '800px', marginTop: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <button onClick={handleHome} style={{ background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>
          ← Back to Dashboard
        </button>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
          {lesson.trackTitle} / {lesson.moduleTitle}
        </span>
      </div>

      <div style={{ 
        backgroundColor: 'var(--surface-color)', 
        padding: '3rem', 
        borderRadius: '1rem', 
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
        border: '1px solid rgba(255,255,255,0.05)'
      }}>
        <h1 className="text-accent" style={{ marginBottom: '1.5rem', fontSize: '2.5rem' }}>{lesson.title}</h1>
        <p style={{ fontSize: '1.2rem', lineHeight: '1.8', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{lesson.content}</p>

        {lesson.id === 'l-royal-flush' && (
          <div style={{ marginTop: '3rem', textAlign: 'center' }}>
            <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>Example:</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', transform: 'scale(0.7)', transformOrigin: 'top center' }}>
              <Card suit="hearts" rank="A" isFaceUp={true} disableFlip={true} />
              <Card suit="hearts" rank="K" isFaceUp={true} disableFlip={true} />
              <Card suit="hearts" rank="Q" isFaceUp={true} disableFlip={true} />
              <Card suit="hearts" rank="J" isFaceUp={true} disableFlip={true} />
              <Card suit="hearts" rank="10" isFaceUp={true} disableFlip={true} />
            </div>
          </div>
        )}
        
        {lesson.id === 'l-straight-flush' && (
          <div style={{ marginTop: '3rem', textAlign: 'center' }}>
            <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>Example:</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', transform: 'scale(0.7)', transformOrigin: 'top center' }}>
              <Card suit="clubs" rank="9" isFaceUp={true} disableFlip={true} />
              <Card suit="clubs" rank="8" isFaceUp={true} disableFlip={true} />
              <Card suit="clubs" rank="7" isFaceUp={true} disableFlip={true} />
              <Card suit="clubs" rank="6" isFaceUp={true} disableFlip={true} />
              <Card suit="clubs" rank="5" isFaceUp={true} disableFlip={true} />
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem' }}>
        <button 
          className="btn-primary" 
          onClick={handlePrev} 
          disabled={isFirst}
          style={{ opacity: isFirst ? 0.5 : 1, cursor: isFirst ? 'not-allowed' : 'pointer', backgroundColor: 'var(--surface-color)', border: '1px solid var(--surface-color-hover)' }}
        >
          Previous
        </button>
        <button 
          className="btn-primary" 
          onClick={handleNext} 
          style={{ cursor: 'pointer' }}
        >
          {isLast ? 'Finish Module' : 'Next Lesson →'}
        </button>
      </div>
    </div>
  );
};

export default LessonView;
