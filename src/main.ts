import './style.css';
import { isRoomCode, normalizeRoomCode } from './net/protocol';
import { App } from './ui/app';

const root = document.getElementById('app');
if (root) {
  const app = new App(root);
  // 초대 링크(?room=ABCD)로 열면 바로 그 방에 참가
  const url = new URL(location.href);
  const room = normalizeRoomCode(url.searchParams.get('room') ?? '');
  if (url.searchParams.has('room')) {
    url.searchParams.delete('room');
    history.replaceState(null, '', url);
  }
  if (isRoomCode(room)) app.startOnline(room, false);
  else app.showMenu();
}

// 오프라인 플레이용 서비스 워커 (개발 서버에서는 등록하지 않음)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
