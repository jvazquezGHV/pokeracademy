import React, { useState, useEffect } from 'react';
import './Card.css';

const Card = ({ suit, rank, isFaceUp = false, disableFlip = false, onClick }) => {
  const [flipped, setFlipped] = useState(isFaceUp);

  useEffect(() => {
    setFlipped(isFaceUp);
  }, [isFaceUp]);
  
  const isRed = suit === 'hearts' || suit === 'diamonds';
  const colorClass = isRed ? 'text-red' : 'text-black';

  const suitSymbols = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠'
  };

  const handleFlip = () => {
    if (disableFlip) return;
    setFlipped(!flipped);
    if (onClick) onClick(!flipped);
  };

  return (
    <div className="playing-card-container perspective-1000 animate-deal" onClick={handleFlip}>
      <div className={`playing-card-inner ${flipped ? 'flipped' : ''}`}>
        
        {/* Back of the card */}
        <div className="playing-card-back">
          <div className="card-pattern"></div>
        </div>
        
        {/* Face of the card */}
        <div className={`playing-card-face ${colorClass}`}>
          <div className="card-corner top-left">
            <span className="rank">{rank}</span>
            <span className="suit">{suitSymbols[suit]}</span>
          </div>
          
          <div className="card-center">
            <span className="suit main-suit">{suitSymbols[suit]}</span>
          </div>
          
          <div className="card-corner bottom-right">
            <span className="rank">{rank}</span>
            <span className="suit">{suitSymbols[suit]}</span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Card;
