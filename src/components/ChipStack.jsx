import React from 'react';

const CHIP_VALUES = [
  { val: 1000, color: '#eab308' }, // Gold
  { val: 500, color: '#9333ea' },  // Purple
  { val: 100, color: '#1f2937' },  // Black
  { val: 25, color: '#16a34a' },   // Green
  { val: 5, color: '#dc2626' },    // Red
  { val: 1, color: '#2563eb' }     // Blue
];

const ChipStack = ({ amount }) => {
  if (!amount || amount <= 0) return null;

  let remaining = amount;
  const chipsToRender = [];
  
  CHIP_VALUES.forEach(({ val, color }) => {
    const count = Math.floor(remaining / val);
    remaining %= val;
    // Cap visual count of same denomination to prevent massive towers
    const visualCount = Math.min(count, 5); 
    for (let i = 0; i < visualCount; i++) {
       chipsToRender.push({ val, color });
    }
  });

  // Reverse so biggest chips are on the bottom
  const displayChips = chipsToRender.reverse();

  return (
    <div style={{ position: 'relative', width: '50px', height: `${displayChips.length * 5 + 35}px` }}>
       {displayChips.map((chip, index) => (
         <div 
            key={index} 
            style={{ 
              position: 'absolute', 
              bottom: `${index * 5}px`,
              width: '50px', 
              height: '35px', 
              borderRadius: '50%', 
              backgroundColor: chip.color,
              border: '4px dashed rgba(255,255,255,0.8)',
              boxShadow: '0 3px 5px rgba(0,0,0,0.6), inset 0 3px 5px rgba(255,255,255,0.4), inset 0 -3px 5px rgba(0,0,0,0.4)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: index,
              transition: 'all 0.3s ease-out',
              animation: 'slideUp 0.3s ease-out forwards'
            }}
         >
           <div style={{ width: '28px', height: '18px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.6)', backgroundColor: 'rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'white', textShadow: '0 1px 2px rgba(0,0,0,0.8)', transform: 'scaleY(0.8)' }}>
                {chip.val >= 1000 ? `${chip.val/1000}k` : chip.val}
              </span>
           </div>
         </div>
       ))}
    </div>
  );
};

export default ChipStack;
