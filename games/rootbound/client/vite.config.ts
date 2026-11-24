import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * 빌드한 index.html 의 JS·CSS 태그(`./assets/...`)를 index.html 인라인 스크립트가 계산한 앱 base(`window.__APP_BASE__`)
 * 기준 주소로 다시 쓴다. 상대 base('./')만 쓰면 `/room/abc` 에서 새로고침할 때 `/room/assets/...` 를 찾아 깨지고,
 * `<base>` 태그는 보드 SVG 의 `url(#rb-grass)` 같은 문서 안 참조를 깨뜨릴 수 있어 쓰지 않는다.
 * 파서가 읽는 중에 document.write 로 넣으므로 원래 태그와 같은 순서·같은 방식으로 불러온다.
 * 청크끼리의 import 는 Vite 가 import.meta.url 기준 상대 주소로 만들므로 손대지 않는다.
 */
function runtimeBaseEntry(): Plugin {
  return {
    name: 'rootbound-runtime-base-entry',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const tagRe = /<(?:script|link)\b[^>]*\b(?:src|href)="\.\/[^"]*"[^>]*>(?:<\/script>)?/g;
        const tags = html.match(tagRe) ?? [];
        if (tags.length === 0) return html;
        const written = JSON.stringify(tags.join('').replace(/="\.\//g, '="__APP_BASE__/')).replace(/<\//g, '<\\/');
        const loader = `<script>document.write(${written}.split('__APP_BASE__/').join(window.__APP_BASE__ || '/'));</script>`;
        return html.replace(tagRe, '').replace('</head>', `    ${loader}\n  </head>`);
      },
    },
  };
}

export default defineConfig({
  // 허브(/rootbound/) 아래와 서버 루트 양쪽에서 돌도록 상대 base. 실제 주소는 runtimeBaseEntry·src/lib/appBase.ts 가 맞춘다
  base: './',
  plugins: [react(), runtimeBaseEntry()],
  server: {
    port: 5173,
    strictPort: true,
    // /dev 의 Cloudflare 빠른 터널(*.trycloudflare.com)로 들어온 요청을 받는다(Vite 는 모르는 Host 를 막는다)
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': 'http://127.0.0.1:3101',
      '/socket.io': { target: 'http://127.0.0.1:3101', ws: true },
    },
  },
});
