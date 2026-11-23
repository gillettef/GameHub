// 룰북용 작은 마크다운 → HTML 변환기(의존성 없음).
// 지원: 제목(#~####), 문단, 순서/비순서 목록(들여쓰기 중첩), 표, 인용(> 안의 목록 포함), **굵게**, `코드`.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/_\(([^)]+)\)_/g, '<em>($1)</em>');
}
function slug(text, used) {
  let base = text.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'sec';
  let s = base;
  for (let i = 2; used.has(s); i++) s = `${base}-${i}`;
  used.add(s);
  return s;
}

/** 목록 줄들(들여쓰기 유지)을 중첩 목록 HTML로 */
function list(lines) {
  let html = '';
  const stack = []; // {indent, tag}
  for (const raw of lines) {
    const m = raw.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (!m) { html += ' ' + inline(raw.trim()); continue; }
    const indent = m[1].length;
    const tag = /\d/.test(m[2]) ? 'ol' : 'ul';
    while (stack.length && indent < stack[stack.length - 1].indent) html += `</li></${stack.pop().tag}>`;
    if (!stack.length || indent > stack[stack.length - 1].indent) {
      html += `<${tag}>`;
      stack.push({ indent, tag });
    } else {
      html += '</li>';
    }
    html += `<li>${inline(m[3])}`;
  }
  while (stack.length) html += `</li></${stack.pop().tag}>`;
  return html;
}

function table(lines) {
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const [head, , ...body] = lines;
  return `<div class="tbl"><table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${
    body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function markdownToHtml(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = [];
  const toc = [];
  const used = new Set();
  let i = 0;
  const isList = (l) => /^\s*([-*]|\d+\.)\s+/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const id = slug(h[2], used);
      if (level === 2) toc.push({ id, text: h[2] });
      out.push(`<h${level} id="${id}">${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }
    if (l.startsWith('|')) {
      const block = [];
      while (i < lines.length && lines[i].startsWith('|')) block.push(lines[i++]);
      out.push(table(block));
      continue;
    }
    if (l.startsWith('>')) {
      const block = [];
      while (i < lines.length && lines[i].startsWith('>')) block.push(lines[i++].replace(/^>\s?/, ''));
      const inner = [];
      let j = 0;
      while (j < block.length) {
        if (isList(block[j])) {
          const lb = [];
          while (j < block.length && (isList(block[j]) || /^\s+\S/.test(block[j]))) lb.push(block[j++]);
          inner.push(list(lb));
        } else {
          inner.push(`<p>${inline(block[j++])}</p>`);
        }
      }
      out.push(`<blockquote>${inner.join('')}</blockquote>`);
      continue;
    }
    if (isList(l)) {
      const block = [];
      while (i < lines.length && (isList(lines[i]) || /^\s{2,}\S/.test(lines[i]))) block.push(lines[i++]);
      out.push(list(block));
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\||>)/.test(lines[i]) && !isList(lines[i])) para.push(lines[i++].trim());
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return { html: out.join('\n'), toc };
}
