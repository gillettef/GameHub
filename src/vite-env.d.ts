/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 온라인 대결 API 서버 주소. 비우면 페이지와 같은 출처(Cloudflare에 함께 배포한 경우) */
  readonly VITE_API_ORIGIN?: string;
}
