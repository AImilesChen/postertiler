import React from 'react';
import { Minus, Plus, CheckCircle, WarningCircle } from '@phosphor-icons/react';
export const B = ({ children, secondary = false, className = '', ...props }) => <button className={`${secondary ? 'button secondary' : 'button'} ${className}`} {...props}>{children}</button>;
export function Field({ label, children, hint }) {
  const id = React.useId();
  const control = React.isValidElement(children) && ['input', 'select', 'textarea'].includes(children.type) ? React.cloneElement(children, { 'aria-label': label }) : children;
  return <div className="field" role="group" aria-labelledby={id}><span id={id}>{label}</span>{control}{hint && <small>{hint}</small>}</div>;
}
export function NumberInput({ label, value, onChange, unit, min = 0, step = 1 }) {
  return <Field label={label}><div className="number"><button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, Number(value) - step))}><Minus size={18} /></button><input aria-label={label} type="number" step={step} min={min} value={value} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} />{unit && <span>{unit}</span>}<button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(Number(value) + step)}><Plus size={18} /></button></div></Field>;
}
export function Alert({ tone = 'info', children }) {
  return <div className={`alert ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{tone === 'success' ? <CheckCircle size={18} aria-hidden /> : <WarningCircle size={18} aria-hidden />}<div>{children}</div></div>;
}
