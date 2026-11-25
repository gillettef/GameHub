/** 여럿 중 하나 고르기(인원, 봇 성향, 속도) */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly (readonly [T, string])[]
  value: T
  onChange(v: T): void
  label?: string
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-bg p-1" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={String(v)}
          type="button"
          aria-pressed={v === value}
          className={`min-h-11 flex-1 rounded-lg px-2 text-sm ${v === value ? 'bg-raised font-bold text-text' : 'text-muted'}`}
          onClick={() => onChange(v)}
        >
          {text}
        </button>
      ))}
    </div>
  )
}
