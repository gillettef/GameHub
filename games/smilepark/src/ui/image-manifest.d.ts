/** vite.config.ts 의 imageManifest 플러그인이 만드는 가상 모듈: public/images 기준 상대 경로 목록 */
declare module 'virtual:image-manifest' {
  const files: string[];
  export default files;
}
