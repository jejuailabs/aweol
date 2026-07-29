'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { usePicks, type PickRow } from '@/lib/picks';
import { showPath } from '@/lib/art-hall';
import { backdropClose } from '@/lib/backdrop';

/**
 * 내가 찜한 그림.
 *
 * 전시관은 여기저기 흩어져 있어서, 한 번 나오면 그 그림을 다시 찾아가기가
 * 어렵다. 여기가 **돌아가는 길**이다 — 카드를 누르면 그 그림이 걸린
 * 전시실로 바로 들어간다.
 *
 * 목록은 **질의 한 번**으로 끝난다. 찜 문서에 제목과 그림 주소를 함께
 * 적어 두었기 때문이다(`lib/picks.ts` 참고). 대신 원본이 바뀌면 여기가
 * 낡는다 — 눌러 들어가면 진짜가 나오므로 그 정도는 받아들인다.
 */
export default function PicksPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const picks = usePicks(user?.uid);
  /** 크게 보는 중인 그림 */
  const [open, setOpen] = useState<PickRow | null>(null);

  /**
   * 전시별로 묶는다.
   *
   * 스무 장이 한 줄로 늘어서면 어디서 담은 것인지가 안 보인다. 찜은
   * 보통 **한 전시에서 여러 장**을 담게 되므로, 묶어 놓으면 "그때 그
   * 전시" 단위로 눈에 들어온다.
   */
  const groups = useMemo(() => {
    const map = new Map<string, { hallId: string; showId: string; label: string; rows: PickRow[] }>();
    for (const r of picks.rows) {
      const key = `${r.hallId}/${r.showId}`;
      if (!map.has(key)) {
        map.set(key, {
          hallId: r.hallId,
          showId: r.showId,
          label: [r.hallTitle, r.showTitle].filter(Boolean).join(' · ') || '전시',
          rows: [],
        });
      }
      map.get(key)!.rows.push(r);
    }
    return [...map.values()];
  }, [picks.rows]);

  if (loading) {
    return (
      <div className="px-4 pt-8 pb-24 mx-auto max-w-[960px]">
        <div className="text-sm" style={{ color: 'var(--color-text-sub)' }}>불러오는 중...</div>
      </div>
    );
  }

  /** 로그인 안 하면 담을 곳이 없다 — 빈 목록을 보여주는 것보다 이유를 말해준다 */
  if (!user) {
    return (
      <div className="px-4 pt-8 pb-24 mx-auto max-w-[960px]">
        <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>
          ♥ 내가 찜한 그림
        </h1>
        <div
          className="mt-5 rounded-2xl p-10 text-center text-sm leading-relaxed"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
        >
          로그인하면 마음에 든 그림을 담아 둘 수 있어요.
          <div className="mt-4">
            <button
              onClick={() => router.push('/login?from=/picks')}
              className="rounded-full px-6 py-2.5 text-sm font-bold text-white"
              style={{ background: 'var(--color-primary)' }}
            >
              로그인하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-8 pb-24 mx-auto max-w-[960px]">
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>
        ♥ 내가 찜한 그림
      </h1>
      <p className="text-sm mb-5" style={{ color: 'var(--color-text-sub)' }}>
        전시실에서 그림을 크게 보고 <b>♡ 찜하기</b>를 누르면 여기에 담겨요.
        {picks.rows.length > 0 && ` 지금 ${picks.rows.length}점.`}
      </p>

      {picks.loaded && picks.rows.length === 0 && (
        <div
          className="rounded-2xl p-10 text-center text-sm leading-relaxed"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
        >
          아직 담은 그림이 없어요.
          <div className="mt-4">
            <button
              onClick={() => router.push('/')}
              className="rounded-full px-6 py-2.5 text-sm font-bold text-white"
              style={{ background: 'var(--color-primary)' }}
            >
              🗺️ 전시관 보러 가기
            </button>
          </div>
        </div>
      )}

      {groups.map((g) => (
        <section key={`${g.hallId}/${g.showId}`} className="mb-7">
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <div className="min-w-0">
              <div className="text-[15px] font-bold truncate" style={{ color: 'var(--color-text-main)' }}>
                {g.label}
              </div>
              <div className="text-[12px]" style={{ color: 'var(--color-text-sub)' }}>
                {g.rows.length}점
              </div>
            </div>
            <button
              onClick={() => router.push(showPath(g.hallId, g.showId))}
              className="shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-bold"
              style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
            >
              🚪 전시실로
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {g.rows.map((r) => (
              <div
                key={r.id}
                className="relative rounded-2xl overflow-hidden shadow-md"
                style={{ background: 'var(--color-surface)' }}
              >
                <button onClick={() => setOpen(r)} className="block w-full text-left">
                  <div
                    className="h-32 flex items-center justify-center overflow-hidden"
                    style={{ background: 'var(--color-surface-soft)' }}
                  >
                    {r.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.imageUrl} alt={r.title} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <span className="text-4xl">🎨</span>
                    )}
                  </div>
                  <div className="p-2.5 pr-9">
                    <div className="text-sm font-bold truncate" style={{ color: 'var(--color-text-main)' }}>
                      {r.title || '무제'}
                    </div>
                  </div>
                </button>
                {/*
                  찜 풀기 — **여기서 뺄 수 있어야 한다.**
                  빼려고 그 전시실까지 다시 걸어 들어가게 하면 아무도 안 뺀다.
                */}
                <button
                  onClick={() => picks.remove(r.id)}
                  className="absolute bottom-2 right-2 h-7 w-7 rounded-full text-[13px] font-bold leading-none"
                  style={{ background: '#E8604C', color: '#FFF5F2' }}
                  aria-label="찜 빼기"
                  title="찜 빼기"
                >
                  ♥
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* 크게 보기 — 담아 둔 그림을 여기서 바로 본다 */}
      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6"
          style={{ background: 'rgba(16,14,12,0.88)' }}
          {...backdropClose(() => setOpen(null))}
        >
          <div className="w-full max-w-[860px] max-h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={open.imageUrl}
              alt={open.title || ''}
              className="w-full min-h-0 flex-1 object-contain rounded-xl"
              style={{ background: '#1A1816' }}
            />
            <div className="mt-3 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-black" style={{ color: '#FBFAF8' }}>
                  {open.title || '무제'}
                </div>
                <div className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {[open.hallTitle, open.showTitle].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="shrink-0 flex flex-col gap-2">
                <button
                  onClick={() => router.push(showPath(open.hallId, open.showId))}
                  className="rounded-full px-4 py-2 text-[14px] font-bold whitespace-nowrap"
                  style={{ background: 'rgba(255,255,255,0.14)', color: '#FBFAF8' }}
                >
                  🚪 전시실로
                </button>
                <button
                  onClick={() => setOpen(null)}
                  className="rounded-full px-4 py-2 text-[14px] font-bold"
                  style={{ background: 'rgba(255,255,255,0.14)', color: '#FBFAF8' }}
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
