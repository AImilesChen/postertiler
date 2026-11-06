import React from 'react';
import { REFERENCE_ART } from './engine/size-reference.ts';

export default function SizeReference({ scene, id }) {
  const b=REFERENCE_ART.bounds, maskId=`${id}-person-alpha`;
  return <svg className="preview-scale-figure" {...scene.person} viewBox={`${b.x} ${b.y} ${b.width} ${b.height}`} aria-hidden="true" data-reference-height-mm={scene.person.height}>
    <defs><mask id={maskId} maskUnits="userSpaceOnUse" {...b} style={{maskType:'alpha'}}>
      <image href={REFERENCE_ART.src} x="0" y="0" width={REFERENCE_ART.width} height={REFERENCE_ART.height}/>
    </mask></defs>
    <rect {...b} fill="#f0efeb" mask={`url(#${maskId})`}/>
  </svg>;
}
