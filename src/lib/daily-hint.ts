'use client';

import { useEffect, useState } from 'react';

/**
 * 하루에 한 번만 뜨는 안내.
 *
 * 전에는 화면에 들어올 때마다 떠서, 교실에 갔다 돌아오기만 해도 또 나왔다.
 * 안내는 처음 한 번이 도움이고 그 다음부터는 방해다.
 *
 * 사람마다 다른 기기를 쓰니 `localStorage` 에 둔다 — 서버에 쓸 만한 값이 아니다.
 * (읽기·쓰기 요금이 붙는 자리에 '오늘 안내 봤는지' 를 넣을 이유가 없다)
 */

/** 오늘 날짜(한국 기준). 자정에 바뀌어야 하니 UTC 로 자르면 안 된다. */
function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + (9 * 60 + now.getTimezoneOffset()) * 60000);
  return `${kst.getFullYear()}-${kst.getMonth() + 1}-${kst.getDate()}`;
}

/** 1970-01-01 부터 며칠째인가 (한국 기준). 메시지를 날마다 바꾸는 데 쓴다. */
function dayNumberKST(): number {
  const now = new Date();
  const kst = new Date(now.getTime() + (9 * 60 + now.getTimezoneOffset()) * 60000);
  return Math.floor(Date.UTC(kst.getFullYear(), kst.getMonth(), kst.getDate()) / 86400000);
}

/**
 * 오늘 아직 안 본 안내면 문구를 돌려주고, 이미 봤으면 `null`.
 *
 * 문구는 날마다 바뀐다 — 같은 말이 매일 나오면 읽지 않게 된다.
 * 무작위가 아니라 **날짜로 고른다.** 무작위면 한 아이가 같은 날 두 기기에서
 * 다른 말을 보고, 다시 열 때마다 달라져 '읽고 있던 말' 이 사라진다.
 *
 * 서버 렌더에서는 항상 `null` 이다(localStorage 가 없다). 그래서 화면이
 * 처음 그려질 때 안내가 깜빡 나타났다 사라지지 않는다.
 */
export function useDailyHint(key: string, messages: string[]): string | null {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (messages.length === 0) return;
    const storeKey = `aewol.hint.${key}`;
    try {
      if (localStorage.getItem(storeKey) === todayKST()) return;
      // 띄우는 순간 표시해둔다. 닫을 때 표시하면, 안 닫고 나갔다 오면 또 뜬다.
      localStorage.setItem(storeKey, todayKST());
    } catch {
      // 사생활 보호 모드 등으로 못 쓰면 그냥 띄운다. 안내 하나 때문에 막을 일은 아니다.
    }
    setMessage(messages[dayNumberKST() % messages.length]);
  }, [key, messages]);

  return message;
}
