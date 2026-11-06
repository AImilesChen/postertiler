import React from 'react';

// Original neutral standing silhouette. The artwork reaches y=0 and y=400;
// a 495 x 1800 mm box therefore represents an actual 180 cm reference.
export default function SizeReference({ scene, posterWidth, posterHeight, fitScale, heightLabel }) {
  const p=scene.person, rulerX=posterWidth+24/fitScale;
  return <g className="preview-size-reference">
    <path className="preview-floor-line" d={`M${scene.bounds.x-8/fitScale} ${posterHeight}H${rulerX+6/fitScale}`} fill="none" stroke="#c9c8c3" strokeWidth={1/fitScale}/>
    <svg className="preview-scale-figure" {...p} viewBox="0 0 110 400" aria-hidden="true" data-reference-height-mm={p.height}>
      <g fill="#d6d5d0"><ellipse cx="51" cy="25" rx="15" ry="25"/>
        <path d="M43 46H59L62 55C76 57 80 63 83 75L94 122L102 174Q104 184 97 186Q90 188 87 178L77 127L71 105L74 169Q79 193 74 218L78 290L83 370L96 391Q101 400 90 400H70Q64 400 63 391L59 302L52 235L48 302L47 391Q47 400 40 400H21Q11 400 16 391L28 370L32 290L34 218Q30 193 33 169L35 105L29 127L19 178Q17 188 10 186Q3 184 5 174L14 122L24 75Q27 59 40 55Z"/>
      </g>
    </svg>
    <text className="preview-figure-caption" x={p.x+p.width/2} y={posterHeight+24/fitScale} textAnchor="middle" fontSize={11/fitScale} fill="#666">180 cm reference</text>
    <g className="preview-height-ruler" fill="#555" stroke="#85857f" strokeWidth={1/fitScale}>
      <path d={`M${rulerX} 0V${posterHeight}M${rulerX-5/fitScale} 0H${rulerX+5/fitScale}M${rulerX-5/fitScale} ${posterHeight}H${rulerX+5/fitScale}`} fill="none"/>
      <text x={rulerX+17/fitScale} y={posterHeight/2} transform={`rotate(-90 ${rulerX+17/fitScale} ${posterHeight/2})`} textAnchor="middle" stroke="none" fontSize={12/fitScale}>{heightLabel}</text>
    </g>
  </g>;
}
