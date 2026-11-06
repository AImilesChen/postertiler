import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, geometry } from '../src/engine/geometry.ts';
import { REFERENCE_HEIGHT_MM, sizeReferenceScene } from '../src/engine/size-reference.ts';

test('size reference keeps a 180 cm person and finished posters on one physical baseline',()=>{
  for(const height of [564,1800,3000]) {
    const {person,bounds}=sizeReferenceScene(1200,height);
    assert.equal(person.height,1800);
    assert.equal(person.y+person.height,height);
    assert.equal(bounds.y+ bounds.height,height);
    assert.ok(bounds.y<=person.y&&bounds.y<=0);
    // At any preview zoom, the visible height ratio is the physical ratio.
    for(const scale of [.1,.7,3]) assert.ok(Math.abs((height*scale)/(person.height*scale)-height/1800)<1e-12);
  }
});
test('size comparison uses finished dimensions, including framed gaps, rather than paper count or units',()=>{
  const ordinary=geometry({...DEFAULTS}), framed=geometry({...DEFAULTS,layoutMode:'framed',gap:10});
  assert.equal(sizeReferenceScene(ordinary.width,ordinary.height).person.y,564-REFERENCE_HEIGHT_MM);
  assert.equal(sizeReferenceScene(framed.width,framed.height).person.y,584-REFERENCE_HEIGHT_MM);
  const inches=geometry({...DEFAULTS,unit:'in'});
  assert.deepEqual(sizeReferenceScene(inches.width,inches.height),sizeReferenceScene(ordinary.width,ordinary.height));
  for(const value of [0,-1,NaN,Infinity])assert.throws(()=>sizeReferenceScene(400,value),/positive finished/);
});
