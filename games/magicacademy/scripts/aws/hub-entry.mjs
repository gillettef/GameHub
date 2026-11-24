// GameHub 허브 안에서 실행할 때의 진입점(허브 games.json 의 "mode": "inproc"). 단독 실행(로컬·플레이테스트)은 server/dist/index.js.
// server/dist/app.js(tsc 산출물)가 express·ws 를 ~/magicacademy/server/node_modules 에서 찾는다(deploy-remote.sh 가 설치).
// 정적 파일(client/dist)과 SPA 폴백도 Express 앱이 맡으므로 모든 요청을 넘긴다.
export async function mount() {
  const { app, upgrade, close } = await import('../../server/dist/app.js');
  return {
    handle(req, res) {
      app(req, res);
      return true;
    },
    upgrade,
    close,
  };
}
