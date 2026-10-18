import DOMPurify from 'dompurify';

export const toSafeHtml = (raw) => {
  const text = (raw || '').trim();
  if (!text) return '';
  // older descriptions are plain text: one paragraph per line
  const html = /<[a-z][\s\S]*>/i.test(text)
    ? text
    : text.split(/\n+/).filter(Boolean)
        .map(l => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
        .join('');
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'ul', 'ol', 'li', 'strong', 'em', 'br'],
    ALLOWED_ATTR: [],
  });
};