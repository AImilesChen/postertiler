import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, geometry } from '../src/engine/geometry.ts';
import { REFERENCE_HEIGHT_MM, REFERENCE_ART, sizeReferenceScene } from '../src/engine/size-reference.ts';

test('a cropped 180 cm reference does not enlarge the fitted poster bounds',()=>{
  for(const height of [564,1800,3000]) {
    const {person,bounds}=sizeReferenceScene(1200,height);
    assert.equal(person.height,1800);
    assert.equal(person.y,0);
    assert.deepEqual(bounds,{x:0,y:0,width:1200,height});
    assert.ok(Math.abs(person.width/person.height-REFERENCE_ART.bounds.width/REFERENCE_ART.bounds.height)<1e-12);
    // At any preview zoom, the visible height ratio is the physical ratio.
    for(const scale of [.1,.7,3]) assert.ok(Math.abs((height*scale)/(person.height*scale)-height/1800)<1e-12);
  }
});
test('size comparison uses finished dimensions, including framed gaps, rather than paper count or units',()=>{
  const ordinary=geometry({...DEFAULTS}), framed=geometry({...DEFAULTS,layoutMode:'framed',gap:10});
  assert.equal(sizeReferenceScene(ordinary.width,ordinary.height).bounds.height,564);
  assert.equal(sizeReferenceScene(framed.width,framed.height).bounds.height,584);
  assert.equal(sizeReferenceScene(ordinary.width,ordinary.height).person.height,REFERENCE_HEIGHT_MM);
  const inches=geometry({...DEFAULTS,unit:'in'});
  assert.deepEqual(sizeReferenceScene(inches.width,inches.height),sizeReferenceScene(ordinary.width,ordinary.height));
  for(const value of [0,-1,NaN,Infinity])assert.throws(()=>sizeReferenceScene(400,value),/positive finished/);
});

test('reference spacing follows display scale without changing anatomy or physical height',()=>{
  for(const scale of [.1,.7,3]) {
    const {person}=sizeReferenceScene(390,564,scale,32);
    assert.ok(Math.abs((0-person.x-person.width)*scale-32)<1e-9);
    assert.equal(person.height,1800);
  }
  assert.throws(()=>sizeReferenceScene(390,564,0),/positive finished/);
  assert.throws(()=>sizeReferenceScene(390,564,1,-2),/positive finished/);
});
