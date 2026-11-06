import React, { useId, useRef } from 'react';
import { ArrowCounterClockwise, ArrowLeft, CaretDown, CaretUp, PaintBrush, ImageSquare, CirclesFour, DotsNine, Palette } from '@phosphor-icons/react';
import { B } from './ui';
import { TREATMENT_DEFAULTS, isOriginalTreatment } from './engine/image-adjustments.ts';
import './image-adjustments.css';

function Slider({ label, value, min, max, unit='', onChange }) {
  const id=useId();
  return <div className="image-slider"><div><label htmlFor={id}>{label}</label><output htmlFor={id}>{value}{unit}</output></div><input id={id} aria-label={label} type="range" min={min} max={max} step="1" value={value} onChange={e=>onChange(Number(e.target.value))}/></div>;
}
const styles=[['original','Original',ImageSquare],['dots','Halftone dots',CirclesFour],['dither','B&W dither',DotsNine],['cmyk','CMYK-style',Palette]];

export default function ImageAdjustments({ open, hasSource, disabled, treatment, tab, onTab, onOpen, onChange, onRestore, onBack, onContinue, feedback,aiTools }) {
  const tabs=useRef([]),id=useId();
  const update=(key,value)=>onChange({...treatment,[key]:value});
  const chooseStyle=effect=>onChange({...treatment,effect,invert:false});
  const sections=[['basic','Basic adjustments'],['effects','Art effects']];
  const tabKeys=(e,index)=>{let next;if(e.key==='ArrowRight')next=(index+1)%sections.length;if(e.key==='ArrowLeft')next=(index+sections.length-1)%sections.length;if(e.key==='Home')next=0;if(e.key==='End')next=sections.length-1;if(next!==undefined){e.preventDefault();onTab(sections[next][0]);tabs.current[next]?.focus();}};
  return <section className={`step image-adjustment-step ${open?'active':''}`}>
    <button className="step-heading" aria-expanded={open} aria-controls={open?'image-adjustments-panel':undefined} disabled={disabled} onClick={onOpen}><PaintBrush size={19} aria-hidden="true"/><strong>Image adjustments</strong><span className="adjustment-optional">Optional</span>{open?<CaretUp size={18}/>:<CaretDown size={18}/>}</button>
    {open&&hasSource&&<div className="step-body" id="image-adjustments-panel">
      <p className="adjustment-intro">{tab==='ai'?'Optional AI processing uses credits and sends only a confirmed task to the provider.':'Fine-tune your image or try an art effect. These changes stay in your browser and appear in the exported PDF.'}</p>
      <div className="adjustment-tabs" role="tablist" aria-label="Image adjustment sections">{sections.map(([value,label],index)=><button key={value} ref={node=>{tabs.current[index]=node;}} id={`${id}-${value}-tab`} aria-controls={`${id}-panel`} role="tab" aria-selected={tab===value} tabIndex={tab===value?0:-1} onKeyDown={e=>tabKeys(e,index)} onClick={()=>onTab(value)}>{label}</button>)}</div>
      <fieldset disabled={disabled} className="adjustment-controls" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}-tab`}>
        {tab==='ai'?aiTools:tab==='basic'?<>
          <Slider label="Brightness" value={treatment.brightness} min={0} max={200} unit="%" onChange={v=>update('brightness',v)}/>
          <Slider label="Contrast" value={treatment.contrast} min={0} max={200} unit="%" onChange={v=>update('contrast',v)}/>
          <Slider label="Saturation" value={treatment.saturation} min={0} max={200} unit="%" onChange={v=>update('saturation',v)}/>
          <Slider label="Warmth" value={treatment.warmth} min={-100} max={100} onChange={v=>update('warmth',v)}/>
          <Slider label="Hue" value={treatment.hue} min={-180} max={180} unit="°" onChange={v=>update('hue',v)}/>
          <small>100% keeps the original brightness, contrast and saturation. Negative warmth is cooler; positive warmth is warmer.</small>
        </>:<>
          <div className="image-style-grid" role="group" aria-label="Image style">{styles.map(([value,label,Icon])=><button key={value} aria-label={`Style: ${label}`} aria-pressed={treatment.effect===value} onClick={()=>chooseStyle(value)}><Icon size={21} aria-hidden="true"/><span>{label}</span></button>)}</div>
          {['dots','cmyk'].includes(treatment.effect)&&<Slider label="Dot spacing" value={treatment.cell} min={2} max={100} unit=" px" onChange={v=>update('cell',v)}/>}
          {treatment.effect==='dots'&&<label className="check"><input type="checkbox" checked={treatment.colour} onChange={e=>update('colour',e.target.checked)}/>Use image colours for dots</label>}
          {['dots','dither'].includes(treatment.effect)&&<label className="check"><input type="checkbox" checked={treatment.invert} onChange={e=>update('invert',e.target.checked)}/>Invert tones</label>}
          <small>{treatment.effect==='cmyk'?'Four coloured screens are combined into one RGB image. This is a visual effect, not prepress CMYK separation.':treatment.effect==='original'?'No art effect. Your basic colour adjustments still apply.':'Effects use the full source dimensions. Adjust contrast in Basic adjustments for a different tonal result.'}</small>
        </>}
      </fieldset>
      {tab!=='ai'&&<button className="restore-image" disabled={disabled||isOriginalTreatment(treatment)} onClick={()=>onRestore({...TREATMENT_DEFAULTS})}><ArrowCounterClockwise size={16} aria-hidden="true"/>Restore original image</button>}
      {feedback}
      <div className="step-actions"><button className="text-button" onClick={onBack}><ArrowLeft size={18} aria-hidden="true"/>Back</button><B disabled={disabled} onClick={onContinue}>Continue</B></div>
    </div>}
  </section>;
}
