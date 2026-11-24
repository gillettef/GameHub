import { GlyphText } from './DieFace'
import { Sheet } from './primitives'
import { PROLOGUE, STORY_MAP } from './story'
import { TesseractLogo } from './TesseractLogo'

/** 세계관 「테서랙트 복원」 */
export function StorySheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="테서랙트 이야기" onClose={onClose}>
      <div className="flex justify-center pt-1">
        <TesseractLogo size={96} />
      </div>
      <div className="flex flex-col gap-3">
        {PROLOGUE.map((line, i) => (
          <p key={i} className="animate-rise text-[15px] leading-relaxed" style={{ animationDelay: `${i * 80}ms` }}>
            <GlyphText text={line} />
          </p>
        ))}
      </div>
      <section className="rounded-2xl bg-raised/60 p-4 ring-1 ring-line ring-inset">
        <h3 className="font-bold">게임 속 이야기</h3>
        <dl className="mt-2 flex flex-col gap-2 text-sm leading-relaxed">
          {STORY_MAP.map(([term, text]) => (
            <div key={term}>
              <dt className="font-bold text-accent">
                <GlyphText text={term} />
              </dt>
              <dd className="text-muted">{text}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Sheet>
  )
}
