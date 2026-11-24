/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 온라인 대결 API 서버 주소. 비우면 페이지와 같은 출처(서버가 dist 를 함께 서빙하는 경우) */
  readonly VITE_API_ORIGIN?: string;
}
