'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Archive {
  id: string;
  year: string;
  classId: string;
  grade: string;
  classNumber: number;
  teacherName: string;
  coverUrl: string;
  counts: { students: number; artworks: number; homeworks: number; quizzes: number; activities: number };
  detailUrl: string;
}

interface Detail {
  /**
   * 명부는 담기지 않는다 — 갈무리 파일은 주소만 알면 누구나 받으므로
   * 아이 이름 목록을 넣을 수 없다. 몇 명이었는지만 남는다.
   */
  studentCount: number;
  artworks: { id: string; title: string; artistName: string; thumbnailUrl?: string; imageUrl?: string }[];
  activities: { id: string; title: string; date?: string; emoji?: string }[];
  homeworks: { id: string; title: string }[];
}

/**
 * 기억창고 — 지나간 해의 반들.
 *
 * 목록은 Firestore 요약 문서만 읽는다(반 하나에 1건).
 * 자세한 내용은 눌렀을 때 Storage 의 JSON 파일 하나를 받아온다.
 * 이렇게 안 하면 졸업한 반이 쌓일수록 이 화면 한 번 여는 데 드는 읽기가 계속 는다.
 */
export default function ArchivePage() {
  const router = useRouter();
  const schoolId = useParams().schoolId as string;

  const [list, setList] = useState<Archive[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Archive | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!db) return;
    getDocs(query(collection(db, 'schools', schoolId, 'archives'), orderBy('year', 'desc')))
      .then((snap) => setList(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Archive))))
      .catch(() => setErr('기억창고를 열지 못했어요'))
      .finally(() => setLoading(false));
  }, [schoolId]);

  const openArchive = useCallback(async (a: Archive) => {
    setOpen(a);
    setDetail(null);
    setErr('');
    if (!a.detailUrl) return;
    setDetailBusy(true);
    try {
      const res = await fetch(a.detailUrl);
      if (!res.ok) throw new Error('파일을 받지 못했어요');
      setDetail(await res.json());
    } catch {
      setErr('그 해의 자세한 기록을 불러오지 못했어요');
    }
    setDetailBusy(false);
  }, []);

  // 연도별로 묶는다
  const byYear = list.reduce<Record<string, Archive[]>>((acc, a) => {
    (acc[a.year] ||= []).push(a);
    return acc;
  }, {});
  const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));

  return (
    <div className="px-4 pt-6 pb-24 mx-auto max-w-[720px]">
      <button
        onClick={() => router.push(`/school/${schoolId}`)}
        className="text-[11px] font-bold mb-3"
        style={{ color: 'var(--color-text-sub)' }}
      >
        ← 학교로
      </button>

      <h1 className="text-lg font-black mb-1" style={{ color: 'var(--color-text-main)' }}>
        📦 기억창고
      </h1>
      <p className="text-[11px] mb-5 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
        지나간 해의 우리 반이 여기 담겨 있어요. 졸업해도 볼 수 있어요.
      </p>

      {err && <div className="text-[11px] font-bold mb-3" style={{ color: '#C0392B' }}>{err}</div>}

      {loading ? (
        <div className="text-[12px]" style={{ color: 'var(--color-text-sub)' }}>여는 중...</div>
      ) : list.length === 0 ? (
        <div className="py-12 text-center">
          <div className="text-4xl mb-2">📦</div>
          <div className="text-xs leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
            아직 담긴 해가 없어요.<br />
            한 해가 끝나면 선생님이 반을 기억창고로 옮겨요.
          </div>
        </div>
      ) : (
        years.map((y) => (
          <div key={y} className="mb-5">
            <div className="text-sm font-black mb-2" style={{ color: 'var(--color-text-main)' }}>{y}년</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {byYear[y]
                .sort((a, b) => a.classId.localeCompare(b.classId))
                .map((a) => (
                  <button
                    key={a.id}
                    onClick={() => openArchive(a)}
                    className="rounded-2xl overflow-hidden text-left transition-transform hover:scale-[1.02]"
                    style={{ background: 'var(--color-surface)' }}
                  >
                    <div className="aspect-[4/3]" style={{ background: 'var(--color-surface-soft)' }}>
                      {a.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.coverUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-3xl">🎒</div>
                      )}
                    </div>
                    <div className="px-2.5 py-2">
                      <div className="text-[13px] font-bold" style={{ color: 'var(--color-text-main)' }}>
                        {a.grade}학년 {a.classNumber}반
                      </div>
                      <div className="text-[10px]" style={{ color: 'var(--color-text-sub)' }}>
                        {a.teacherName || '담임 미정'} · 작품 {a.counts?.artworks ?? 0}개
                      </div>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        ))
      )}

      {/* 자세히 보기 */}
      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6"
          style={{ background: 'rgba(24,20,16,0.55)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}
        >
          <div
            className="w-full max-w-[520px] rounded-[28px] overflow-hidden flex flex-col"
            style={{ maxHeight: '88vh', background: 'var(--color-surface)' }}
          >
            <div className="px-5 pt-4 pb-3 flex items-center" style={{ background: 'linear-gradient(135deg, #C9A87Cdd, #A98A6099)' }}>
              <div>
                <div className="text-base font-black text-white">
                  {open.year}년 {open.grade}학년 {open.classNumber}반
                </div>
                <div className="text-[10px] text-white opacity-85">{open.teacherName || '담임 미정'}</div>
              </div>
              <button
                onClick={() => setOpen(null)}
                className="ml-auto h-8 w-8 rounded-full text-sm"
                style={{ background: 'rgba(255,255,255,0.3)', color: 'white' }}
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-4 gap-2 mb-4">
                {([
                  ['👦', '친구', open.counts?.students],
                  ['🖼️', '작품', open.counts?.artworks],
                  ['📝', '숙제', open.counts?.homeworks],
                  ['🎪', '활동', open.counts?.activities],
                ] as [string, string, number][]).map(([emoji, label, n]) => (
                  <div key={label} className="rounded-2xl py-2.5 text-center" style={{ background: 'var(--color-surface-soft)' }}>
                    <div className="text-lg">{emoji}</div>
                    <div className="text-sm font-black" style={{ color: 'var(--color-text-main)' }}>{n ?? 0}</div>
                    <div className="text-[9px]" style={{ color: 'var(--color-text-sub)' }}>{label}</div>
                  </div>
                ))}
              </div>

              {detailBusy && (
                <div className="text-[12px]" style={{ color: 'var(--color-text-sub)' }}>기록을 펼치는 중...</div>
              )}

              {detail && (
                <>
                  {detail.artworks?.length > 0 && (
                    <>
                      <div className="text-[11px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>🖼️ 그 해의 작품</div>
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        {detail.artworks.slice(0, 12).map((a) => (
                          <div key={a.id} className="rounded-xl overflow-hidden" style={{ background: 'var(--color-surface-soft)' }}>
                            <div className="aspect-square">
                              {(a.thumbnailUrl || a.imageUrl) && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={a.thumbnailUrl || a.imageUrl} alt={a.title} className="h-full w-full object-cover" />
                              )}
                            </div>
                            <div className="px-1.5 py-1">
                              <div className="text-[9px] font-bold truncate" style={{ color: 'var(--color-text-main)' }}>{a.title}</div>
                              <div className="text-[8px] truncate" style={{ color: 'var(--color-text-sub)' }}>{a.artistName}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {detail.activities?.length > 0 && (
                    <>
                      <div className="text-[11px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>🎪 그 해의 활동</div>
                      <div className="flex flex-col gap-1 mb-4">
                        {detail.activities.map((v) => (
                          <div key={v.id} className="rounded-xl px-3 py-2 text-[12px]" style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}>
                            {v.emoji ?? '🎪'} {v.title}
                            {v.date && <span className="text-[10px] ml-1.5" style={{ color: 'var(--color-text-sub)' }}>{v.date}</span>}
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
