import { useState } from 'react';
import { MiniPitch } from './Cards';
import { Chip, Icon, TokenChip, TrackChip } from './Icons';

interface Row {
  sample: React.ReactNode;
  name: string;
  desc: string;
}

const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: '자원',
    rows: [
      { sample: <Chip icon="money" value={3} />, name: '돈', desc: '선수 영입, 직원 고용, 시설 건설, 유지비에 씁니다. 주말에도 버려지지 않습니다.' },
      { sample: <Chip icon="fandom" value={1} />, name: '팬덤', desc: '주사위를 다시 굴릴 때 1개씩 씁니다. 경기 때 관중석에 놓으면 경기 후 돈이 됩니다.' },
      { sample: <Chip icon="ops" value={2} />, name: '운영', desc: '2개를 내면 그날 카드 행동을 한 번 더 할 수 있습니다(유급 행동).' },
      { sample: <Chip icon="stamina" value={1} />, name: '체력', desc: '경기에 내보내는 선수마다 1개씩 냅니다. 카드 효과 비용으로도 씁니다.' },
      { sample: <Chip icon="vp" value={2} />, name: '승점', desc: '게임 끝에 가장 많이 모은 사람이 이깁니다. 유망주 경력 칸의 승점은 카드 위에 남아 있습니다.' },
    ],
  },
  {
    title: '변화 표시',
    rows: [
      { sample: <Chip icon="money" value="+2" />, name: '자원 획득/손실', desc: '+는 공급처에서 받고, −는 잃습니다.' },
      { sample: <TrackChip track="stamina" delta={1} />, name: '능력치 트랙 이동', desc: '"트랙" 표시가 있는 칩은 자원이 아니라 구단 보드의 트랙 마커를 옮깁니다. 5를 넘으면 대신 보드에 표시된 자원을, 1 아래면 자원을 잃습니다.' },
      { sample: <Chip icon="train">훈련</Chip>, name: '훈련', desc: '선수 카드를 훈련 면으로 뒤집습니다. 보통 역량이 오르고 효과가 강해집니다.' },
      { sample: <Chip icon="tactic">전술</Chip>, name: '전술 카드', desc: '전술 카드를 1장 받습니다. 경기마다 포메이션으로 1장을 씁니다.' },
      { sample: <Chip icon="prospect">유망주 무료</Chip>, name: '유망주 무료 영입', desc: '유망주 더미 맨 위 카드를 비용 없이 받습니다.' },
      { sample: <Chip icon="goal" value="+1" tone="goal" />, name: '득점', desc: '경기 점수에 골을 더하거나 뺍니다. 상대 표시가 있으면 상대 팀 점수입니다.' },
    ],
  },
  {
    title: '선수 카드',
    rows: [
      { sample: <span className="role-badge attack legend-inline"><Icon name="attack" size={14} /></span>, name: '공격', desc: '구획 비교에서 상대 수비보다 역량이 높으면 득점합니다.' },
      { sample: <span className="role-badge defense legend-inline"><Icon name="defense" size={14} /></span>, name: '수비', desc: '역량이 상대 공격 이상이면 그 공격을 막습니다.' },
      { sample: <span className="skill-flame legend-inline">3</span>, name: '역량', desc: '0~4. 역량·약점 토큰으로 오르내립니다. 카드 없는 유니폼 토큰은 역량 1입니다.' },
      { sample: <span className="number-circle legend-inline">8</span>, name: '유니폼 번호', desc: '같은 번호의 선수 두 명은 한 경기에 함께 뛸 수 없습니다. 부상 주사위(12면체)도 이 번호로 대상을 고릅니다.' },
      { sample: <MiniPitch zones={['CM', 'LW']} />, name: '배치 가능 지역', desc: '주황 칸이 이 선수를 놓을 수 있는 구획입니다. 가운데 열은 위부터 포워드·미드·백, 양옆 열은 윙입니다.' },
      { sample: <span className="cost-badge legend-inline"><Icon name="money" size={13} /><span>−2</span></span>, name: '비용', desc: '영입·고용에 내는 돈입니다.' },
      { sample: <span className="timing-band beforeMatch legend-inline">경기 전</span>, name: '효과 시점', desc: '경기 전·중·후 중 언제 효과가 적용되는지입니다. "강제"는 출전하면 반드시 적용됩니다.' },
    ],
  },
  {
    title: '선수 위의 토큰',
    rows: [
      { sample: <TokenChip token="injury" count={1} />, name: '부상', desc: '경기에 나갈 수 없습니다. 경기 준비 때 1개씩 줄어듭니다. 방출하면 돈이 절반입니다.' },
      { sample: <TokenChip token="suspension" count={1} />, name: '출장정지', desc: '선수는 출전 불가, 직원은 행동 불가. 게임 끝에 1개당 승점 −1.' },
      { sample: <TokenChip token="strengthTemp" count={1} />, name: '일시 역량', desc: '역량 +1. 다음 경기가 끝나면 사라집니다.' },
      { sample: <TokenChip token="strengthPerm" count={1} />, name: '영구 역량', desc: '역량 +1. 게임 끝까지 남습니다(테두리 표시).' },
      { sample: <TokenChip token="weaknessTemp" count={1} />, name: '일시 약점', desc: '역량 −1. 다음 경기가 끝나면 사라집니다.' },
      { sample: <TokenChip token="weaknessPerm" count={1} />, name: '영구 약점', desc: '역량 −1. 게임 끝까지 남습니다.' },
    ],
  },
  {
    title: '직원 · 임원',
    rows: [
      { sample: <span className="staff-foot legend-inline"><span className="laurel">0</span><span className="laurel">2</span><span className="laurel">4</span><span className="laurel">6</span></span>, name: '세트 점수', desc: '같은 세트 직원을 1·2·3·4장 가졌을 때 게임 끝에 받는 승점. 마지막 값이 상한입니다.' },
      { sample: <span className="exec-dice legend-inline"><span className="die yellow">1</span><span className="die blue">2</span><span className="die red">3</span></span>, name: '임원 투표', desc: '이사회에서 주사위 눈에 해당하는 색으로 투표합니다. 노랑 = 돈·스타디움·스폰서, 파랑 = 선수·전술·체력, 빨강 = 팬덤·직원·운영.' },
      { sample: <Chip icon="die">굴림</Chip>, name: '주사위', desc: '이사회(6면)와 경기 영향(6면), 부상 대상(12면)에 씁니다. 팬덤 1개로 다시 굴릴 수 있습니다.' },
    ],
  },
];

export function LegendButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="legend-button" onClick={() => setOpen(true)} title="화면에 쓰인 아이콘 설명">
        <Icon name="vp" size={14} />아이콘 설명
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal legend" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="아이콘 설명">
            <div className="panel-head">
              <h2>아이콘 설명</h2>
              <button className="ghost small" onClick={() => setOpen(false)}>닫기</button>
            </div>
            {SECTIONS.map((s) => (
              <section key={s.title} className="legend-section">
                <h3>{s.title}</h3>
                <dl className="legend-list">
                  {s.rows.map((r) => (
                    <div key={r.name} className="legend-row">
                      <dt>
                        <span className="legend-sample">{r.sample}</span>
                        <span className="legend-name">{r.name}</span>
                      </dt>
                      <dd>{r.desc}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
