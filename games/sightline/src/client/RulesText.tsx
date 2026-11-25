// 규칙 요약(3분)과 전체 룰북(rules/rulebook.md 를 그대로 보여 준다, 옛 화면의 '규칙' 창과 같다)
import rulebook from '../../rules/rulebook.md?raw'

export function RulesText() {
  return (
    <ol className="m-0 flex list-decimal flex-col gap-2.5 pl-5 text-muted [&_b]:text-text">
      <li>
        <b>시야</b> · 손님 말의 가면은 한쪽 면에만 있다. 가면이 향한 좌석에 앉은 사람만, 가면 바로 앞이 막혀 있지 않을 때 그 문양(소속)을 본다.
      </li>
      <li>
        <b>목표</b> · 내 첩자 셋을 접선 지점(금색 칸)에 들여보내 접선하면 3점. 왼쪽 후원자(다음 차례)의 첩자를 지목해 포획하면 2점. 8라운드 뒤 점수가 높은 사람이 이긴다.
      </li>
      <li>
        <b>내 차례</b> · 이동·지목·접선·정찰 중 하나만 한다. 할 수 있는 것이 없을 때만 넘긴다.
      </li>
      <li>
        <b>이동</b> · 아무 손님 말이나 1~2칸 옮긴다. 옮긴 방향이 곧 가면 방향. <b>내 좌석에 가면이 새로 드러나는 이동은 할 수 없다.</b> 접선 지점에 들어가면 내 초대장 토큰이 올라가 내 다음 차례까지 아무도 못 옮긴다.
      </li>
      <li>
        <b>지목</b> · 지금 내 좌석을 향한 말(가려져 있어도 된다)을 왼쪽 후원자의 첩자로 지목한다. 맞으면 +2, 틀리면 오인 −1과 지목 카드를 잃는다.
      </li>
      <li>
        <b>접선</b> · 접선 지점에 있는 말을 내 첩자로 공개한다. 맞으면 +3, 틀리면 오인 −2.
      </li>
      <li>
        <b>정찰</b> · 오페라 글라스(한 번뿐)로 다른 후원자의 좌석에서 정원을 본다. 그 좌석을 향한 말을 이어서 지목할 수 있다.
      </li>
      <li>
        <b>3인</b> · 빈 발코니 쪽으로 옮긴 말은 가려진 채 멈춰야 한다. 빈 발코니를 향한 말은 누구나 자기 좌석에서 지목할 수 있다.
      </li>
    </ol>
  )
}

/** 보드 읽는 법(옛 화면의 범례) */
export function Legend() {
  return (
    <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted">
      <li>색 점선 = 그 가면을 볼 수 있는 단 하나의 좌석</li>
      <li>말 가장자리의 굵은 선 = 가면 면. 검은색이면 가려짐</li>
      <li>말 안의 색 점 = 내가 아는 정체(빈 원은 예전에 본 것)</li>
      <li>금테 원 = 초대장 토큰(그 색 후원자의 다음 차례까지 못 옮김)</li>
      <li>빨간 점선 테두리 = 지금 지목할 수 있는 말 · 노란 칸 = 고른 말이 갈 수 있는 곳</li>
    </ul>
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
  return <div className="sl-rulebook" dangerouslySetInnerHTML={{ __html: RULEBOOK_HTML }} />
}
