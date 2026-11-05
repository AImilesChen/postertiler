import React from 'react';
import { Field, NumberInput } from './ui';
export default function ToolControls({ settings, onChange, units = false }) {
  const update = (key, value) => onChange({ ...settings, [key]: value });
  return <>
    <div className="field-pair"><Field label="Paper size"><select value={settings.paper} onChange={e => update('paper', e.target.value)}><option>A4</option><option>US Letter</option><option>A3</option></select></Field><Field label="Orientation"><select value={settings.orientation} onChange={e => update('orientation', e.target.value)}><option>Automatic</option><option>Portrait</option><option>Landscape</option></select></Field></div>
    {units && <Field label="Display units"><select value={settings.unit} onChange={e => update('unit', e.target.value)}><option>cm</option><option>mm</option><option>in</option></select></Field>}
    <NumberInput label="Printer margins" value={settings.margin} onChange={value => update('margin', value)} unit="mm" />
    <label className="check"><input type="checkbox" checked={!!settings.separateMargins} onChange={e => update('separateMargins', e.target.checked)} />Set margins separately</label>
    {settings.separateMargins && <div className="field-pair">{['Top', 'Right', 'Bottom', 'Left'].map(side => <NumberInput key={side} label={`${side} margin`} unit="mm" value={settings[`margin${side}`] ?? settings.margin} onChange={value => update(`margin${side}`, value)} />)}</div>}
    <small>Use paper your printer supports. Margins reserve the edges it cannot print.</small>
  </>;
}
