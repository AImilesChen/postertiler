import React, { useEffect, useState } from 'react';
import { ImageSquare } from '@phosphor-icons/react';

export default function AiImagePreview({ source, result, sourcePixels, resultPixels }) {
  const [detail, setDetail] = useState(false);
  useEffect(() => setDetail(false), [source, result]);
  return <section className="ai-image-preview" aria-label="AI image preview"><header><div><strong>{result ? 'Compare your result' : 'Your image preview'}</strong><small>{result ? 'Review the details before applying or downloading.' : source ? 'Your original stays unchanged until you apply a result.' : 'Choose an image to see it here.'}</small></div>{result && <button aria-pressed={detail} onClick={() => setDetail(value => !value)}>{detail ? 'Fit preview' : '100% detail'}</button>}</header>
    <div className={`ai-preview-images ${source && result ? 'has-comparison' : ''}`}>
      {source && <figure><figcaption>Original{sourcePixels?.width ? ` · ${sourcePixels.width} × ${sourcePixels.height} px` : ''}</figcaption><div className={detail ? 'actual-size' : ''}><img src={source} alt="Original image before AI processing" style={detail && resultPixels ? { width: resultPixels.width, maxWidth: 'none' } : undefined}/></div></figure>}
      {result && <figure><figcaption>AI result · {resultPixels?.width} × {resultPixels?.height} px</figcaption><div className={detail ? 'actual-size' : ''}><img src={result} alt="AI image result" style={detail && resultPixels ? { width: resultPixels.width, maxWidth: 'none' } : undefined}/></div></figure>}
      {!source && !result && <div className="ai-preview-empty"><ImageSquare size={45} weight="light"/><h3>Start with your image</h3><p>Your preview and completed result appear here.</p></div>}
    </div>
  </section>;
}
