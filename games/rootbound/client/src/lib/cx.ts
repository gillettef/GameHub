/** 클래스명 결합. CSS Modules 키는 `string | undefined` 라 falsy 를 걸러낸다 */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}
