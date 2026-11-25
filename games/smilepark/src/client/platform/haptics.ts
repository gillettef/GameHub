/** 햅틱 피드백 (플랫폼 종속). 앱 포장 시 Capacitor Haptics 등으로 교체한다. */
export function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* 지원하지 않는 기기에서는 무시 */
  }
}
