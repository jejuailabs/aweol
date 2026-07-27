'use client';

/**
 * 모달 바깥을 **눌러서** 닫기 — 끌어서 나온 것은 닫지 않는다.
 *
 * ---
 *
 * **왜 필요한가.**
 *
 * 그동안 바깥 덮개에 `onClick={닫기}` 만 걸어 두었다. 그런데 브라우저의
 * `click` 은 **누른 곳과 뗀 곳의 공통 조상**에서 일어난다 — 모달 안에서
 * 글씨를 긁다가 손이 모달 밖에서 떨어지면, 그 `click` 이 덮개에서 일어나
 * **쓰던 창이 그냥 닫혔다.** 적던 글도 같이 날아갔다.
 *
 * `e.target === e.currentTarget` 만으로는 못 막는다. 그 경우에도 `target` 이
 * 덮개라서 그대로 통과한다 — **누르기 시작한 자리**를 함께 봐야 한다.
 *
 * ---
 *
 * **훅이 아니라 그냥 함수다.**
 *
 * 모달은 대개 `{열렸으면 && (<div …/>)}` 안에 있어서, 훅으로 만들면
 * 조건부 호출이 되어 리액트 규칙을 어긴다. 손짓은 한 번에 하나뿐이라
 * (누름 → 뗌이 반드시 차례로 온다) 값 하나를 나눠 써도 안전하다.
 *
 * ```tsx
 * <div className="fixed inset-0 …" {...backdropClose(() => setOpen(false))}>
 *   <div onClick={(e) => e.stopPropagation()}>…</div>
 * </div>
 * ```
 */
let fromBackdrop = false;

export function backdropClose(onClose: () => void) {
  return {
    onPointerDown: (e: React.PointerEvent) => {
      fromBackdrop = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent) => {
      // 뗀 자리도 덮개여야 한다 — 안에서 시작해 밖에서 뗀 것은 여기서 걸린다
      const ok = fromBackdrop && e.target === e.currentTarget;
      fromBackdrop = false;
      if (ok) onClose();
    },
  };
}
