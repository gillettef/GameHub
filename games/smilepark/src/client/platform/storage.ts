/**
 * 저장 관련 플랫폼 코드. 앱(Capacitor 등)으로 포장할 때 이 파일을 교체하면 된다.
 * 진행 중인 한 기기 게임은 공통 LocalSave(자리·시드·행동 기록)로 `smilepark:local` 에 둔다.
 * 엔진이 결정적이므로 이어 하기는 행동 기록을 다시 둔다. 옛 저장(`smilepark.save`, 상태 전체)은 읽지 않고 지운다.
 */
import type { LocalSave } from '@gamehub/net/client';
import type { Action } from '../../def';

const KEY = 'smilepark:local';
const LEGACY_KEYS = ['smilepark.save', 'smilepark.save.v2'];

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 저장해 둔 한 기기 판. 형식이 틀리면 null */
export function loadLocal(): LocalSave<Action> | null {
  const ls = storage();
  if (!ls) return null;
  try {
    for (const k of LEGACY_KEYS) ls.removeItem(k);
    const raw = ls.getItem(KEY);
    if (!raw) return null;
    const save = JSON.parse(raw) as Partial<LocalSave<Action>>;
    if (!Array.isArray(save.seats) || !Array.isArray(save.history) || typeof save.seed !== 'number') throw new Error('형식이 틀림');
    return save as LocalSave<Action>;
  } catch {
    clearSave();
    return null;
  }
}

export function saveLocal(save: LocalSave<Action> | null) {
  const ls = storage();
  if (!ls) return;
  try {
    if (save) ls.setItem(KEY, JSON.stringify(save));
    else ls.removeItem(KEY);
  } catch {
    /* 저장 불가 환경(용량 초과·사생활 모드 등)에서는 무시 */
  }
}

export function clearSave() {
  saveLocal(null);
}
