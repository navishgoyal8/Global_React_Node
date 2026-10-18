import { useMemo, useState } from 'react';
import { imageCandidates } from '../../utils/productImages';

// <img> that walks through every known location for a product photo and only
// gives up (showing `fallback`) once they have all failed.
export default function SmartImage({ src, fallback, alt = '', className, style, ...rest }) {
  const candidates = useMemo(() => imageCandidates(src), [src]);
  const [failed, setFailed] = useState(() => new Set());

  const current = candidates.find(url => !failed.has(url));

  const handleError = (e) => {
    const url = e.currentTarget.getAttribute('src');
    setFailed(prev => {
      if (!url || prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  };

  if (!current) {
    if (!fallback) return null;
    return <img {...rest} src={fallback} alt={alt} className={className} style={style} />;
  }

  return (
    <img
      {...rest}
      src={current}
      alt={alt}
      className={className}
      style={style}
      onError={handleError}
    />
  );
}
