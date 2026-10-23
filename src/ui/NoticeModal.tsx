import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { LawId } from '../engine'
import type { Seat } from '../app/session'
import { useBack } from './back'
import { Card, CardZoom } from './Card'
import type { CardKey } from './cardArtData'
import { ROUND_INFO, seatColor } from './colors'
import { GlyphText, Hourglass } from './DieFace'
import { buzz } from './fx'
import type { Notice } from './notices'
import { Avatar, Button } from './primitives'
import { Icon } from './icons'

interface NoticeModalProps {
  /** 한 번에 생긴 알림 묶음. 결과(평면·목표·잔해)가 먼저, 라운드 안내가 마지막 */
  notices: Notice[]
  /** 남은 묶음 수 (지금 것 포함) */
  remaining: number
  law: LawId
  seats: Seat[]
  onConfirm: () => void
}

/**
 * 확인해야 넘어가는 알림 모달. 같은 행동으로 생긴 알림은 한 장에 모아 「확인」 한 번으로 넘긴다.
 * 배경을 눌러도 닫히지 않고 「확인」(또는 Enter·Esc·뒤로가기)으로만 넘어간다. 열려 있는 동안 봇은 기다린다 (App).
 */
export function NoticeModal({ notices, remaining, law, seats, onConfirm }: NoticeModalProps) {
  const titleId = useId()
  const dialog = useRef<HTMLDivElement>(null)
  const confirmRef = useRef(onConfirm)
  useEffect(() => {
    confirmRef.current = onConfirm
  }, [onConfirm])
  // 뒤로가기도 「확인」으로 본다 (밑에 깔린 화면이 닫히지 않게)
  useBack(onConfirm)

  // 묶음마다 가장 중요한 알림으로 한 번 진동하고 확인 버튼에 포커스
  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('[data-notice-ok]')?.focus()
    if (notices.some((n) => n.kind === 'goal')) buzz([20, 60, 30])
    else if (notices.some((n) => n.kind === 'round')) buzz([15, 40, 15])
    else if (notices.some((n) => n.kind === 'debris')) buzz([40])
  }, [notices])

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') confirmRef.current()
      // 버튼이 하나뿐이라 포커스를 그 자리에 둔다
      if (e.key === 'Tab') {
        e.preventDefault()
        dialog.current?.querySelector<HTMLElement>('[data-notice-ok]')?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      before?.focus?.()
    }
  }, [])

  const name = (p: number) => seats[p]?.name ?? `${p + 1}번`
  const last = remaining <= 1
  const [zoom, setZoom] = useState<CardKey | null>(null)

  return (
    <div ref={dialog} className="fixed inset-0 z-50 flex animate-fade items-center justify-center bg-black/70 px-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div
        key={JSON.stringify(notices)}
        className="flex max-h-[88dvh] w-full max-w-[400px] animate-pop flex-col overflow-hidden rounded-[28px] bg-surface shadow-[0_20px_60px_rgb(0_0_0/0.6)] ring-1 ring-line"
      >
        <div className="flex flex-col gap-3 overflow-y-auto overscroll-contain px-5 pt-5 pb-3 [&>*]:shrink-0">
          {notices.map((notice, i) => (
            <section key={i} className={`flex flex-col gap-3 ${i > 0 ? 'border-t border-line pt-4' : ''}`}>
              {notice.kind === 'round' ? (
                <RoundBody notice={notice} law={law} titleId={i === 0 ? titleId : undefined} name={name} onZoom={setZoom} />
              ) : (
                <ResultBody notice={notice} titleId={i === 0 ? titleId : undefined} name={name} />
              )}
            </section>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-line px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
          {remaining > 1 && <span className="shrink-0 font-display text-xs font-bold text-muted">남은 알림 {remaining - 1}장</span>}
          <Button data-notice-ok variant="primary" size="lg" block onClick={onConfirm}>
            {last ? '확인' : '확인 · 다음'}
          </Button>
        </div>
      </div>
      {zoom && <CardZoom card={zoom} onClose={() => setZoom(null)} />}
    </div>
  )
}

function RoundBody({
  notice,
  law,
  titleId,
  name,
  onZoom,
}: {
  notice: Extract<Notice, { kind: 'round' }>
  law: LawId
  titleId?: string
  name: (p: number) => string
  onZoom: (card: CardKey) => void
}) {
  const info = ROUND_INFO[notice.round - 1]
  if (!info) return null
  // 1라운드에는 이번 게임의 법칙을, 3라운드부터는 쌓기를 바꾸는 법칙을 다시 보여 준다
  const showLaw = notice.round === 1 || (notice.round >= 3 && (law === 'flat' || law === 'inverted'))
  const cards: CardKey[] = [...(showLaw ? [{ kind: 'law' as const, id: law }] : []), ...notice.goals.map((id) => ({ kind: 'goal' as const, id }))]
  return (
    <>
      <div className="flex items-center gap-4">
        <span aria-hidden="true" className="font-display text-[72px] leading-none font-bold text-transparent [-webkit-text-stroke:2px_#9b8cff]">
          {notice.round}
        </span>
        <div>
          <p className="font-display text-xs font-semibold tracking-[0.25em] text-accent">
            ROUND {notice.round} · {info.dim}
          </p>
          <h2 id={titleId} className="text-2xl font-black">
            {info.name}의 세계
          </h2>
          <p className="text-[13px] text-muted italic">“{info.quote}”</p>
        </div>
      </div>
      <p className="rounded-xl bg-white/5 px-4 py-2.5 text-sm">
        <GlyphText text={info.hint} />
      </p>
      {notice.startPlayer !== null && (
        <Row player={notice.startPlayer} name={name(notice.startPlayer)}>
          <span className="text-sm text-muted">시작 플레이어</span>
        </Row>
      )}
      {notice.pending && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-bold text-muted">넘길 ⧗ 주사위 · 1개씩 번갈아 넘겨요</p>
          {notice.pending.map((n, p) => (
            <Row key={p} player={p} name={name(p)}>
              {n > 0 ? (
                <span className="inline-flex items-center gap-1 font-display text-lg font-bold text-personal">
                  <Hourglass size={14} color="#f2a65a" /> {n}
                </span>
              ) : (
                <span className="text-right text-xs text-muted">
                  꼭대기에 ⧗이 없어
                  <br />
                  4라운드는 쉬어요
                </span>
              )}
            </Row>
          ))}
        </div>
      )}
      {cards.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(cards.length, 2)}, minmax(0, 1fr))` }}>
            {cards.map((card, i) => (
              <div key={`${card.kind}-${card.id}`} className="animate-rise" style={{ animationDelay: `${120 + i * 90}ms` }}>
                <Card card={card} size="mini" onOpen={() => onZoom(card)} />
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-muted">카드를 누르면 크게 볼 수 있어요</p>
        </div>
      )}
    </>
  )
}

function ResultBody({ notice, titleId, name }: { notice: Exclude<Notice, { kind: 'round' }>; titleId?: string; name: (p: number) => string }) {
  const title = notice.kind === 'goal' ? '라운드 목표 달성' : notice.kind === 'plane' ? '평면 점수 확정' : '잔해 발생'
  const sub =
    notice.kind === 'goal'
      ? '처음 달성하면 선착 4점, 그 뒤로는 달성 2점'
      : notice.kind === 'plane'
        ? '2라운드가 끝나 평면 점수를 점수 시트에 적어요'
        : '잔해는 게임 끝에 1개당 −1점'
  const tone = notice.kind === 'goal' ? '#5ad1e6' : notice.kind === 'plane' ? '#34c483' : '#ff6b6b'
  return (
    <>
      <div>
        <h2 id={titleId} className="text-2xl font-black" style={{ color: tone }}>
          {notice.kind === 'goal' && <Icon name="target" size={22} className="-mt-1 mr-1.5" />}
          {title}
        </h2>
        <p className="text-[13px] text-muted">{sub}</p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {notice.kind === 'goal' &&
          notice.items.map((it, i) => (
            <li key={i} className="animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
              <Row player={it.player} name={name(it.player)}>
                <span className="text-right">
                  <span className="block text-xs text-muted">
                    {it.first && <Icon name="crown" size={12} className="-mt-0.5 mr-1 text-[#F5C842]" />}
                    {it.name} · {it.first ? '선착' : '달성'}
                  </span>
                  <span className="font-display text-xl font-bold" style={{ color: tone }}>
                    +{it.points}
                  </span>
                </span>
              </Row>
            </li>
          ))}
        {notice.kind === 'plane' &&
          notice.items.map((it, i) => (
            <li key={i} className="animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
              <Row player={it.player} name={name(it.player)}>
                <span className="font-display text-xl font-bold" style={{ color: tone }}>
                  {it.points}점
                </span>
              </Row>
            </li>
          ))}
        {notice.kind === 'debris' &&
          notice.items.map((it, i) => (
            <li key={i} className="animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
              <Row player={it.player} name={name(it.player)}>
                <span className="text-right">
                  <span className="block text-xs text-muted">잔해 {it.count}개</span>
                  <span className="font-display text-xl font-bold" style={{ color: tone }}>
                    −{it.count}
                  </span>
                </span>
              </Row>
            </li>
          ))}
      </ul>
    </>
  )
}

function Row({ player, name, children }: { player: number; name: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-3 rounded-2xl bg-raised/70 px-3 py-2 ring-1 ring-line ring-inset">
      <Avatar name={name} color={seatColor(player)} size={30} />
      <span className="min-w-0 flex-1 truncate font-bold">{name}</span>
      {children}
    </div>
  )
}
