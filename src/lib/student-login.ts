/**
 * 아이 로그인 — **이름 + 반 비밀번호**.
 *
 * 아이에게 이메일도 아이디도 만들어 주지 않는다. 아이가 아는 것은 자기 이름뿐이고,
 * 비밀번호는 **반에 하나**다. 선생님이 칠판에 적어두면 그만이라 아이가 잊어버릴 일이 없다.
 *
 * **이건 금고가 아니다.** 여기 있는 것은 아이들 그림과 글이지 지켜야 할 비밀이 아니다.
 * 작정하고 파고들면 뚫린다 — 대신 **지나가던 사람이 그냥은 못 들어오는 정도**를 만든다.
 * 그 선을 넘겨 복잡하게 만들면 정작 아이가 못 들어온다.
 */

/**
 * 이름을 견주기 좋게 다듬는다.
 *
 * 아이는 '홍 길동' 이라고 띄어 쓰기도 하고 앞뒤로 공백을 넣기도 한다.
 * 그걸 다른 이름으로 보면 자기 이름을 정확히 쳤는데도 못 들어간다.
 */
export function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, '').trim();
}

/**
 * 동명이인에게 A·B 를 붙인다.
 *
 * 한 반에 김민준이 둘이면 이름만으로는 누가 누구인지 가릴 수 없다.
 * 번호를 쓰면 정확하지만 아이가 자기 번호를 모른다 — **A·B 는 선생님이
 * "너는 김민준A" 라고 한마디 하면 끝난다.**
 * 한 명뿐인 이름에는 아무것도 안 붙인다(대부분이 여기 해당한다).
 *
 * 명부 순서(번호)대로 A, B, C 를 준다 — 순서가 바뀌면 아이의 로그인 이름이
 * 바뀌므로, 부르는 쪽은 **번호순**이라는 것만 지키면 된다.
 */
export function assignLoginNames(
  roster: { id: string; number: number; name: string }[]
): Record<string, string> {
  const byName = new Map<string, { id: string; number: number }[]>();
  for (const s of roster) {
    const key = normalizeName(s.name);
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push({ id: s.id, number: s.number });
    byName.set(key, list);
  }

  const out: Record<string, string> = {};
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const [name, list] of byName) {
    if (list.length === 1) {
      out[list[0].id] = name;
      continue;
    }
    list.sort((a, b) => a.number - b.number);
    list.forEach((s, i) => {
      // 26명을 넘는 동명이인은 현실에 없다. 넘으면 번호로 떨어뜨린다.
      out[s.id] = i < ALPHABET.length ? `${name}${ALPHABET[i]}` : `${name}${s.number}`;
    });
  }
  return out;
}

/**
 * 반 비밀번호를 만든다 — **아이가 보고 칠 수 있어야 한다.**
 *
 * 기호도 대문자도 안 쓴다. 초등학생이 칠판을 보고 옮겨 치는 값이라
 * `Xk9#pQ` 같은 것을 주면 그때부터 로그인이 수업이 된다.
 * 헷갈리는 글자(0/O, 1/l)는 빼고, 낱말 하나에 숫자 둘을 붙인다.
 */
const WORDS = [
  'hallasan', 'jeju', 'orum', 'badang', 'dolhareu', 'gamgyul', 'yuchae',
  'haenyeo', 'sanho', 'moraeb', 'noeul', 'byeol', 'muzige', 'gureum',
];
export function makeClassPassword(): string {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const num = String(Math.floor(Math.random() * 90) + 10); // 10~99
  return `${word}${num}`;
}

/** 비밀번호로 받을 수 있는 값인지. 너무 짧으면 아무나 찍어서 맞힌다. */
export function isUsablePassword(raw: string): boolean {
  const p = raw.trim();
  return p.length >= 4 && p.length <= 32;
}

/**
 * 아이 계정의 uid.
 *
 * **명부 한 줄 = 계정 하나.** 그래야 도장·작품이 갈라지지 않는다.
 * 이미 학생코드로 구글 계정을 연결한 아이는 그 uid 를 그대로 쓴다(아래 API 참고).
 */
export function rosterUid(schoolId: string, classId: string, studentId: string): string {
  return `stu-${schoolId}-${classId}-${studentId}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120);
}
