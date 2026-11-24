import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const IMAGES_DIR = fileURLToPath(new URL('./public/images', import.meta.url));
const IMAGE_RE = /\.(webp|png|jpg)$/i;

/** public/images 아래 이미지 파일 목록(슬롯키.확장자, '/' 구분)을 재귀로 수집 */
function scanImages(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let names: string[];
    try {
      names = readdirSync(d);
    } catch {
      return;
    }
    for (const n of names) {
      const full = join(d, n);
      if (statSync(full).isDirectory()) walk(full);
      else if (IMAGE_RE.test(n)) out.push(relative(dir, full).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * `virtual:image-manifest` — public/images 에 실제로 있는 파일 목록을 빌드 타임에 제공한다.
 * <Slot>은 이 목록에 있는 슬롯만 요청하므로, 파일이 없는 슬롯은 404 요청을 보내지 않는다.
 * 개발 서버에서는 파일을 추가/삭제하면 목록을 갱신하고 새로고침한다.
 */
function imageManifest(): Plugin {
  const VIRTUAL = 'virtual:image-manifest';
  const RESOLVED = '\0' + VIRTUAL;
  return {
    name: 'smilepark-image-manifest',
    resolveId(id) {
      if (id === VIRTUAL) return RESOLVED;
    },
    load(id) {
      if (id === RESOLVED) return `export default ${JSON.stringify(scanImages(IMAGES_DIR))};`;
    },
    configureServer(server) {
      server.watcher.add(IMAGES_DIR);
      const onChange = (file: string) => {
        if (!resolve(file).startsWith(IMAGES_DIR) || !IMAGE_RE.test(file)) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', onChange);
      server.watcher.on('unlink', onChange);
    },
  };
}

export default defineConfig({
  plugins: [react(), imageManifest()],
  base: './', // WebView/Capacitor 포장 대비 상대 경로
});
