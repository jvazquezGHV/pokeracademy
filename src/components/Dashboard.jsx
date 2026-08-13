import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import curriculum from '../data/curriculum.json';
import challenges from '../data/challenges.json';
import './Dashboard.css';

// Flatten lessons to find global index for routing
const buildGlobalLessonMap = () => {
  let index = 0;
  const map = {};
  curriculum.tracks.forEach(track => {
    track.modules.forEach(mod => {
      mod.lessons.forEach(lesson => {
        map[lesson.id] = index++;
      });
    });
  });
  return map;
};

const lessonIndexMap = buildGlobalLessonMap();

const Dashboard = ({ session }) => {
  const navigate = useNavigate();
  const [completedLessons, setCompletedLessons] = useState([]);
  const [activeTab, setActiveTab] = useState('curriculum');

  useEffect(() => {
    const fetchProgress = async () => {
      if (session?.user) {
        const { data, error } = await supabase
          .from('user_progress')
          .select('completed_lessons')
          .eq('user_id', session.user.id)
          .single();
        
        if (data && data.completed_lessons) {
          setCompletedLessons(data.completed_lessons);
        }
      }
    };
    fetchProgress();
  }, [session]);

  const hasCompletedRequiredLesson = (challenge) => {
    // Also true if there's no required lesson
    if (!challenge.requiredLessonId) return true;
    
    // Check if the user has completed all lessons in the required module
    let requiredMod = null;
    curriculum.tracks.forEach(t => {
      t.modules.forEach(m => {
        if (m.id === challenge.requiredLessonId) requiredMod = m;
      });
    });

    if (requiredMod) {
      const allLessonsInMod = requiredMod.lessons.map(l => l.id);
      const userCompletedInMod = allLessonsInMod.filter(id => completedLessons.includes(id));
      return userCompletedInMod.length === allLessonsInMod.length && allLessonsInMod.length > 0;
    }
    
    return false;
  };

  return (
    <div className="container" style={{ maxWidth: '1000px' }}>
      <header style={{ textAlign: 'center', marginBottom: '3rem', marginTop: '2rem' }}>
        <h1 className="text-accent" style={{ fontSize: '3.5rem', marginBottom: '0.5rem', fontWeight: '800' }}>Texas Hold'em Academy</h1>
        <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>Master the game with interactive lessons and scenarios.</p>
        
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem' }}>
          <button 
            className="action-button" 
            style={{ opacity: activeTab === 'curriculum' ? 1 : 0.5 }}
            onClick={() => setActiveTab('curriculum')}
          >
            📚 Curriculum
          </button>
          <button 
            className="action-button" 
            style={{ opacity: activeTab === 'challenges' ? 1 : 0.5 }}
            onClick={() => setActiveTab('challenges')}
          >
            ⚔️ Boss Challenges
          </button>
        </div>
      </header>

      <main>
        {activeTab === 'curriculum' && (
          <>
            <div className="track-section">
          <h2 className="track-title">Interactive Tools</h2>
          <p className="track-desc">Level up your game with our dynamic poker tools.</p>
          <div className="modules-grid">
            <div 
              className="module-card" 
              onClick={() => navigate('/analyzer')} 
              style={{ cursor: 'pointer', border: '1px solid var(--accent-color)' }}
            >
              <h3 className="module-title" style={{ color: 'var(--accent-color)' }}>🛠️ Hand Analyzer</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Select your hole cards and community cards to evaluate your exact hand strength.</p>
            </div>
            <div 
              className="module-card" 
              onClick={() => navigate('/sandbox')} 
              style={{ cursor: 'pointer', border: '1px solid #10b981' }}
            >
              <h3 className="module-title" style={{ color: '#10b981' }}>🤖 AI Sandbox</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Play heads-up against a computer opponent and get custom AI coaching feedback.</p>
            </div>
            <div 
              className="module-card" 
              onClick={() => navigate('/multiplayer')} 
              style={{ cursor: 'pointer', border: '1px solid #eab308' }}
            >
              <h3 className="module-title" style={{ color: '#eab308' }}>🌐 Play with Friends</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Create a private room and play real-time multiplayer Texas Hold'em.</p>
            </div>
          </div>
        </div>

        {curriculum.tracks.map((track) => (
          <div key={track.id} className="track-section">
            <h2 className="track-title">{track.title}</h2>
            <p className="track-desc">{track.description}</p>
            
            <div className="modules-grid">
              {track.modules.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Coming soon...</p>
              ) : (
                track.modules.map((mod) => {
                  const totalLessons = mod.lessons.length;
                  const completedCount = mod.lessons.filter(l => completedLessons.includes(l.id)).length;
                  const progress = totalLessons === 0 ? 0 : Math.round((completedCount / totalLessons) * 100);
                  
                  return (
                    <div key={mod.id} className="module-card">
                      <h3 className="module-title">{mod.title}</h3>
                      
                      <div className="progress-container">
                        <div className="progress-bar-bg">
                          <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                        </div>
                        <span className="progress-text">{progress}%</span>
                      </div>

                      <ul className="lesson-list">
                        {mod.lessons.map(lesson => {
                          const isCompleted = completedLessons.includes(lesson.id);
                          return (
                            <li 
                              key={lesson.id} 
                              className="lesson-item"
                              onClick={() => navigate(lesson.type === 'quiz' ? `/quiz/${lessonIndexMap[lesson.id]}` : `/learn/${lessonIndexMap[lesson.id]}`)}
                            >
                              <span className="lesson-icon">{isCompleted ? '✅' : (lesson.type === 'quiz' ? '🧠' : '📄')}</span>
                              <span style={{ textDecoration: isCompleted ? 'line-through' : 'none', opacity: isCompleted ? 0.7 : 1 }}>
                                {lesson.title}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
          </>
        )}

        {activeTab === 'challenges' && (
          <div className="track-section">
            <h2 className="track-title">Boss Challenges</h2>
            <p className="track-desc">Test your mastery of specific concepts in 1v1 scenarios against the AI Coach.</p>
            
            <div className="modules-grid">
              {challenges.map(challenge => {
                const isUnlocked = hasCompletedRequiredLesson(challenge);
                const isCompleted = completedLessons.includes(challenge.id);
                
                return (
                  <div 
                    key={challenge.id} 
                    className="module-card" 
                    style={{ 
                      opacity: isUnlocked ? 1 : 0.5,
                      border: isCompleted ? '1px solid #10b981' : (isUnlocked ? '1px solid var(--accent-color)' : '1px solid #333'),
                      cursor: isUnlocked ? 'pointer' : 'not-allowed'
                    }}
                    onClick={() => {
                      if (isUnlocked) navigate(`/challenge/${challenge.id}`);
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <h3 className="module-title" style={{ color: isCompleted ? '#10b981' : (isUnlocked ? 'var(--accent-color)' : 'inherit') }}>
                        {isUnlocked ? '⚔️' : '🔒'} {challenge.title}
                      </h3>
                      {isCompleted && <span style={{ color: '#10b981', fontSize: '1.2rem' }}>⭐⭐⭐</span>}
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                      {challenge.description}
                    </p>
                    
                    {!isUnlocked && (
                      <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #333', fontSize: '0.8rem', color: '#ef4444' }}>
                        Requires Module: {challenge.requiredLessonTitle}
                      </div>
                    )}
                    {isUnlocked && !isCompleted && (
                      <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #333', fontSize: '0.8rem', color: '#10b981' }}>
                        Challenge Unlocked! Click to begin.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
