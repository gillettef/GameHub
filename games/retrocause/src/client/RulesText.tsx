// 규칙 요약(옛 처음 화면의 '3분 규칙 요약')과 전체 룰북(rules/rulebook.md 를 그대로 보여 준다, 옛 화면의 '룰북 보기'와 같다)
import rulebook from '../../rules/rulebook.md?raw'

export function RulesText() {
  return (
    <ol className="m-0 flex list-decimal flex-col gap-2.5 pl-5 text-muted [&_b]:text-text">
      <li>
        결말 3장은 고정이다. 시간선의 <b>빈 칸 어디에나</b> 원인 카드를 끼워 넣는다. 위가 과거, 아래가 결말이다.
      </li>
      <li>
        카드는 <b>놓인 칸의 다음 칸부터</b> 사실을 바꾼다. 카드의 조건은 그 칸에서 참이어야 한다.
      </li>
      <li>결말과 다른 결과는, 결말과 같은 결과가 더 아래에 있을 때만 놓을 수 있다.</li>
      <li>
        내 카드 때문에 이미 놓인 카드가 깨지면 버려지고, 장당 <b>패러독스</b> 1개(-2점)를 받는다.
      </li>
      <li>
        <b>결정 원인</b>: 결말과 같은 결과를 내는 <b>조건 있는</b> 카드 중 가장 아래 카드. 그 인물이 역사에 범인으로 남는다.
      </li>
      <li>
        차례마다 <b>놓기</b> 또는 <b>교체</b>. 빈 칸이 없거나 덱이 비면 패스할 수 있다.
      </li>
      <li>
        점수: 내 비밀 목표 인물이 결정 원인 +3, 시간선의 내 인물 카드 +1, 끝나고 남의 인물을 맞히면 +1.
      </li>
    </ol>
  )
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** 룰북에 쓰는 만큼의 마크다운(제목·목록·표·인용·코드·굵게)을 HTML 로. 모든 글자는 먼저 이스케이프한다 */
function md(src: string): string {
  const lines = src.split('\n')
  const out: string[] = []
  let i = 0
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
  while (i < lines.length) {
    const l = lines[i]!
    if (l.startsWith('```')) {
      const b: string[] = []
      i++
      while (i < lines.length && !lines[i]!.startsWith('```')) b.push(lines[i++]!)
      i++
      out.push(`<pre>${esc(b.join('\n'))}</pre>`)
      continue
    }
    if (/^\s*\|/.test(l)) {
      const rows: string[] = []
      while (i < lines.length && /^\s*\|/.test(lines[i]!)) rows.push(lines[i++]!.trim())
      const cells = rows.filter((r) => !/^\|[-\s|:]+\|$/.test(r)).map((r) => r.replace(/^\||\|$/g, '').split('|'))
      out.push(`<table>${cells.map((c, k) => `<tr>${c.map((x) => `<${k ? 'td' : 'th'}>${inline(x.trim())}</${k ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table>`)
      continue
    }
    if (l.startsWith('>')) {
      const b: string[] = []
      while (i < lines.length && lines[i]!.startsWith('>')) b.push(inline(lines[i++]!.replace(/^>\s?/, '')))
      out.push(`<blockquote>${b.join('<br>')}</blockquote>`)
      continue
    }
    const h = l.match(/^(#{1,3})\s+(.*)/)
    if (h) {
      out.push(`<h${h[1]!.length}>${inline(h[2]!)}</h${h[1]!.length}>`)
      i++
      continue
    }
    if (/^\s*(-|\d+\.)\s/.test(l)) {
      const b: string[] = []
      while (i < lines.length && /^\s*(-|\d+\.)\s/.test(lines[i]!)) b.push(`<li>${inline(lines[i++]!.replace(/^\s*(-|\d+\.)\s/, ''))}</li>`)
      out.push(`<ul>${b.join('')}</ul>`)
      continue
    }
    if (l.trim() && l.trim() !== '---') out.push(`<p>${inline(l)}</p>`)
    i++
  }
  return out.join('')
}

const RULEBOOK_HTML = md(rulebook.replace(/\r/g, ''))

export function Rulebook() {
  return <div className="rc-rulebook" dangerouslySetInnerHTML={{ __html: RULEBOOK_HTML }} />
}
