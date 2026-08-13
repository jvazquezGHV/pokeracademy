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
  
  // Default to Beginner track as requested by user
  const [activeSection, setActiveSection] = useState('track-beginner'); 

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
    if (!challenge.requiredLessonId) return true;
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

  // Render a specific curriculum track
  const renderTrack = (trackId) => {
    const track = curriculum.tracks.find(t => t.id === trackId);
    if (!track) return null;

    return (
      <div className="track-section">
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

                  <div className="lesson-list-container">
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
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard-layout">
      {/* Left Sidebar */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-header">
          <h1 className="sidebar-title">Poker Academy</h1>
        </div>
        
        <nav className="sidebar-nav">
          <div className="nav-section">
            <h3 className="nav-section-title">Play & Practice</h3>
            
            <div className="nav-item" onClick={() => navigate('/analyzer')}>
              <span className="nav-icon">🛠️</span>
              <span>Hand Analyzer</span>
            </div>
            
            <div className="nav-item" onClick={() => navigate('/ranges')}>
              <span className="nav-icon">📊</span>
              <span>Range Charts</span>
            </div>

            <div className="nav-item" onClick={() => navigate('/trainer/preflop')}>
              <span className="nav-icon">⚡</span>
              <span>Preflop Trainer</span>
            </div>

            <div className="nav-item" onClick={() => navigate('/trainer/math')}>
              <span className="nav-icon">🧮</span>
              <span>Pot Odds Drill</span>
            </div>

            <div className="nav-item" onClick={() => navigate('/trainer/postflop')}>
              <span className="nav-icon">🧩</span>
              <span>Post-Flop Simulator</span>
            </div>

            <div className="nav-item" onClick={() => navigate('/analytics')}>
              <span className="nav-icon">📈</span>
              <span>Leak Tracker</span>
            </div>

            <div className="nav-item" onClick={() => navigate('/history')}>
              <span className="nav-icon">📖</span>
              <span>Hand History Log</span>
            </div>
            
            <div className="nav-item" onClick={() => navigate('/sandbox')}>
              <span className="nav-icon">🤖</span>
              <span>AI Sandbox</span>
            </div>
            
            <div className="nav-item" onClick={() => navigate('/multiplayer')}>
              <span className="nav-icon">🌐</span>
              <span>Multiplayer</span>
            </div>
            
            <div 
              className={`nav-item ${activeSection === 'challenges' ? 'active' : ''}`} 
              onClick={() => setActiveSection('challenges')}
            >
              <span className="nav-icon">⚔️</span>
              <span>Boss Challenges</span>
            </div>
          </div>
          
          <div className="nav-section">
            <h3 className="nav-section-title">Curriculum</h3>
            
            {curriculum.tracks.map(track => (
              <div 
                key={track.id}
                className={`nav-item ${activeSection === 'track-' + track.id ? 'active' : ''}`}
                onClick={() => setActiveSection('track-' + track.id)}
              >
                <span className="nav-icon">📚</span>
                <span>{track.title.split(':')[0]}</span>
              </div>
            ))}
          </div>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="dashboard-main">
        <div className="dashboard-main-content">
          
          {activeSection.startsWith('track-') && renderTrack(activeSection.replace('track-', ''))}

          {activeSection === 'challenges' && (
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
                        border: isCompleted ? '1px solid #10b981' : (isUnlocked ? '1px solid var(--accent-color)' : '1px solid rgba(255,255,255,0.05)'),
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
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', flex: 1 }}>
                        {challenge.description}
                      </p>
                      
                      {!isUnlocked && (
                        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8rem', color: '#ef4444' }}>
                          Requires Module: {challenge.requiredLessonTitle}
                        </div>
                      )}
                      {isUnlocked && !isCompleted && (
                        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8rem', color: '#10b981' }}>
                          Challenge Unlocked! Click to begin.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default Dashboard;
