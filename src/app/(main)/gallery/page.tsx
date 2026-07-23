'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ArtworkDoc } from '@/lib/firestore-schema';
import { useAuth } from '@/lib/auth-context';
import { isStaff, myClassIds } from '@/lib/auth-helpers';
import { scopeFromPath } from '@/lib/exhibit-scope';
import ArtworkDetailModal from '@/components/artwork/ArtworkDetailModal';

type ArtworkItem = ArtworkDoc & { id: string; path: string };

/** 반 하나. 갤러리에서 필요한 것만. */
interface ClassInfo {
  /** `${schoolId}/${classId}` — 반 번호는 학교마다 겹친다(3-1 이 두 학교에 다 있다) */
  key: string;
  grade: string;
  classNumber: number;
  isArchived: boolean;
}

/**
 * 작품이 **어디에 걸려 있는지**.
 *
 * 경로에 이미 다 들어 있다 —
 * `schools/{schoolId}/classes/{classId}/activities/{activityId}/artworks/{id}`.
 * 그래서 학교·반·활동을 알아내는 데 **읽기가 한 번도 안 든다.**
 */
const whereItHangs = scopeFromPath;

export default function GalleryPage() {
  const router = useRouter();
  const { userDoc } = useAuth();
  const [artworks, setArtworks] = useState<ArtworkItem[]>([]);
  /** 활동 id → 활동 이름. 쿼리 한 번으로 통째로 받는다(작품마다 읽지 않는다). */
  const [actNames, setActNames] = useState<Record<string, string>>({});
  /** 반 정보 — 학년·반 필터와 **보관된 반 걸러내기**에 쓴다 */
  const [classes, setClasses] = useState<Record<string, ClassInfo>>({});
  const [filter, setFilter] = useState<'all' | 'flat' | 'sculpture'>('all');
  /** 학년 필터. 빈 문자열이면 전체. */
  const [grade, setGrade] = useState('');
  /** 반 필터(반 번호). 학년을 고른 뒤에만 쓴다. */
  const [classNo, setClassNo] = useState('');
  const [fetched, setFetched] = useState(false);
  const [selected, setSelected] = useState<ArtworkItem | null>(null);

  const staff = isStaff(userDoc?.role ?? null);
  const myClasses = useMemo(() => myClassIds(userDoc), [userDoc]);
  const mySchools = useMemo(() => userDoc?.schoolIds ?? [], [userDoc]);

  /**
   * 작품 가져오기 — **질의 조건이 보안 규칙과 정확히 같아야 한다.**
   *
   * 규칙은 '승인 + 학교 공개' 이거나 '내 반' 인 작품만 열어준다. 그보다 넓게 물으면
   * (예전처럼 `status == 'approved'` 하나로만 물으면) 막히는 문서 하나 때문에
   * **질의 전체가 실패해서 갤러리가 통째로 빈다.**
   *
   * 그래서 세 갈래다:
   * - 교직원은 규칙이 전부 열어주므로 한 번에 긁는다.
   * - 그 밖에는 '학교 공개' 를 긁고, 로그인했으면 **내 반** 것을 따로 긁어 합친다.
   */
  useEffect(() => {
    async function fetchAll() {
      if (!db) return;
      try {
        const queries = staff
          ? [query(collectionGroup(db, 'artworks'), where('status', '==', 'approved'))]
          : [
              query(
                collectionGroup(db, 'artworks'),
                where('status', '==', 'approved'),
                where('visibility', '==', 'school')
              ),
              ...myClasses.map((c) =>
                query(
                  collectionGroup(db!, 'artworks'),
                  where('status', '==', 'approved'),
                  where('classId', '==', c)
                )
              ),
            ];

        const snaps = await Promise.all(queries.map((q) => getDocs(q)));
        // 내 반 것은 '학교 공개' 질의에도 들어 있다. 경로로 겹침을 없앤다.
        const byPath = new Map<string, ArtworkItem>();
        for (const snap of snaps) {
          for (const d of snap.docs) {
            const item = { id: d.id, path: d.ref.path, ...d.data() } as ArtworkItem;
            /**
             * 반 번호는 학교마다 겹친다 — '3-1' 로 물으면 남의 학교 3-1 까지 온다.
             * 규칙은 통과시키지만(내 반 번호이므로) 보여줄 이유가 없다.
             */
            const hangs = whereItHangs(item.path);
            if (
              item.visibility === 'class' &&
              mySchools.length > 0 &&
              !mySchools.includes(hangs.schoolId)
            ) continue;
            byPath.set(item.path, item);
          }
        }
        setArtworks([...byPath.values()]);
      } catch (e) {
        console.error('Failed to fetch gallery:', e);
      }
      setFetched(true);
    }
    fetchAll();
  }, [staff, myClasses, mySchools]);

  /**
   * 활동 이름을 한 번에 받아온다.
   *
   * 작품마다 활동 문서를 읽으면 작품 수만큼 읽기가 든다(수백 건).
   * 활동은 반마다 몇 개뿐이라 통째로 받는 게 훨씬 싸다.
   * 실패해도 화면은 그대로 뜬다 — 활동 이름만 안 보인다.
   */
  useEffect(() => {
    if (!db) return;
    getDocs(collectionGroup(db, 'activities'))
      .then((snap) => {
        const map: Record<string, string> = {};
        snap.docs.forEach((d) => {
          const t = (d.data().title as string) || '';
          if (t) map[d.id] = t;
        });
        setActNames(map);
      })
      .catch(() => setActNames({}));
  }, []);

  /**
   * 반 목록 — 학년·반 필터의 재료이자 **해가 바뀌면 갤러리를 비우는 장치**다.
   *
   * 기억창고로 갈무리한 반은 `isArchived` 가 서고, 그 반 작품은 여기서 빠진다.
   * 갤러리에 '올해' 라는 필드를 따로 두지 않은 이유는, 그러면 해가 바뀔 때
   * 누군가 모든 작품을 손봐야 하기 때문이다. 갈무리는 이미 있는 절차다.
   */
  useEffect(() => {
    if (!db) return;
    getDocs(collectionGroup(db, 'classes'))
      .then((snap) => {
        const map: Record<string, ClassInfo> = {};
        snap.docs.forEach((d) => {
          const v = d.data();
          const key = `${v.schoolId ?? ''}/${d.id}`;
          map[key] = {
            key,
            grade: String(v.grade ?? ''),
            classNumber: Number(v.classNumber ?? 0),
            isArchived: v.isArchived === true,
          };
        });
        setClasses(map);
      })
      .catch(() => setClasses({}));
  }, []);

  /** 보관되지 않은 반의 작품만. 반 정보를 아직 못 읽었으면 그대로 둔다. */
  const live = useMemo(() => {
    if (Object.keys(classes).length === 0) return artworks;
    return artworks.filter((a) => {
      const w = whereItHangs(a.path);
      const info = classes[`${w.schoolId}/${w.classId}`];
      return !info?.isArchived;
    });
  }, [artworks, classes]);

  /** 필터에 쓸 학년 목록 — 실제로 작품이 있는 학년만 보여준다 */
  const grades = useMemo(() => {
    const s = new Set<string>();
    live.forEach((a) => {
      const g = whereItHangs(a.path).classId.split('-')[0];
      if (g) s.add(g);
    });
    return [...s].sort();
  }, [live]);

  /** 고른 학년 안의 반 번호들 */
  const classNos = useMemo(() => {
    if (!grade) return [];
    const s = new Set<string>();
    live.forEach((a) => {
      const [g, n] = whereItHangs(a.path).classId.split('-');
      if (g === grade && n) s.add(n);
    });
    return [...s].sort((a, b) => Number(a) - Number(b));
  }, [live, grade]);

  const filtered = useMemo(
    () =>
      live.filter((a) => {
        if (filter !== 'all' && a.type !== filter) return false;
        if (!grade) return true;
        const [g, n] = whereItHangs(a.path).classId.split('-');
        if (g !== grade) return false;
        return !classNo || n === classNo;
      }),
    [live, filter, grade, classNo]
  );

  const chip = (on: boolean) => ({
    background: on ? 'var(--color-primary)' : 'var(--color-surface-soft)',
    color: on ? 'white' : 'var(--color-text-sub)',
  });

  return (
    <div className="px-4 pt-8 pb-24 mx-auto max-w-[960px]">
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>🖼️ 전체 갤러리</h1>
      <p className="text-sm mb-5" style={{ color: 'var(--color-text-sub)' }}>
        학교 전체가 볼 수 있는 전시 작품을 한눈에 봐요.
        {myClasses.length > 0 && ' 우리 반 전시는 잠겨 있어도 보여요.'}
      </p>

      {/* 종류 */}
      <div className="flex gap-2 mb-2.5">
        {([
          { key: 'all', label: '전체' },
          { key: 'flat', label: '그림·글' },
          { key: 'sculpture', label: '조형물' },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className="rounded-full px-4 py-1.5 text-sm font-bold transition-all"
            style={chip(filter === tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/*
        학년·반 — **전체 갤러리라 작품이 섞인다.** 선생님이 "우리 반 것만" 을
        보려면 스크롤로 찾는 수밖에 없었다. 학년을 고르면 그 학년의 반이 따라 나온다.
        작품이 하나도 없는 학년·반은 아예 안 만든다(누를 것이 없는 칸은 방해만 된다).
      */}
      {grades.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          <button
            onClick={() => { setGrade(''); setClassNo(''); }}
            className="rounded-full px-3.5 py-1.5 text-[13px] font-bold"
            style={chip(!grade)}
          >
            모든 학년
          </button>
          {grades.map((g) => (
            <button
              key={g}
              onClick={() => { setGrade(g); setClassNo(''); }}
              className="rounded-full px-3.5 py-1.5 text-[13px] font-bold"
              style={chip(grade === g)}
            >
              {g}학년
            </button>
          ))}
        </div>
      )}

      {grade && classNos.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          <button
            onClick={() => setClassNo('')}
            className="rounded-full px-3.5 py-1.5 text-[13px] font-bold"
            style={chip(!classNo)}
          >
            {grade}학년 전체
          </button>
          {classNos.map((n) => (
            <button
              key={n}
              onClick={() => setClassNo(n)}
              className="rounded-full px-3.5 py-1.5 text-[13px] font-bold"
              style={chip(classNo === n)}
            >
              {n}반
            </button>
          ))}
        </div>
      )}

      <div className="text-[13px] mb-4" style={{ color: 'var(--color-text-sub)' }}>
        {fetched ? `${filtered.length}점` : '불러오는 중...'}
      </div>

      {fetched && filtered.length === 0 && (
        <div
          className="rounded-2xl p-10 text-center text-sm leading-relaxed"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
        >
          {grade
            ? `${grade}학년${classNo ? ` ${classNo}반` : ''}에는 아직 전시된 작품이 없어요`
            : '아직 전시된 작품이 없어요'}
        </div>
      )}

      {/* 벽돌형 그리드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {filtered.map((art) => (
          <button
            key={art.path}
            onClick={() => setSelected(art)}
            className="rounded-2xl overflow-hidden shadow-md transition-transform hover:scale-[1.02] text-left"
            style={{ background: 'var(--color-surface)' }}
          >
            <div className="h-32 flex items-center justify-center overflow-hidden" style={{ background: 'var(--color-surface-soft)' }}>
              {art.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={art.imageUrl} alt={art.title} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <span className="text-4xl">{art.type === 'sculpture' ? '🏺' : '🎨'}</span>
              )}
            </div>
            <div className="p-2.5">
              <div className="text-sm font-bold truncate" style={{ color: 'var(--color-text-main)' }}>{art.title}</div>
              <div className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>{art.artistName}</div>
              {/*
                어디에 걸린 작품인지. 선생님이 갤러리에서 작품을 보고
                '이게 어느 반 어느 활동이더라' 를 되짚을 수가 없었다.
              */}
              <div
                className="text-[12px] mt-1.5 truncate font-bold"
                style={{ color: 'var(--color-primary)' }}
              >
                {art.visibility === 'class' ? '🔒 ' : '📍 '}
                {whereItHangs(art.path).classId}
                {actNames[whereItHangs(art.path).activityId]
                  ? ` · ${actNames[whereItHangs(art.path).activityId]}`
                  : ''}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* 작품 상세 — path에서 상위 컬렉션 경로를 잘라내 모달에 전달 */}
      {selected && (
        <div className="fixed inset-0 z-50">
          <ArtworkDetailModal
            artwork={{
              id: selected.id,
              title: selected.title,
              artistName: selected.artistName,
              imageUrl: selected.imageUrl,
              type: selected.type,
              artistComment: selected.artistComment,
              videoId: selected.videoId ?? null,
            }}
            collectionPath={selected.path.split('/').slice(0, -1).join('/')}
            onClose={() => setSelected(null)}
          />
          {/*
            '이 작품이 걸린 전시실로' — 갤러리에서 작품만 보고 끝나면
            선생님이 그 반 전시를 통째로 볼 방법이 없었다.
            모달보다 위(z-60)에 띄운다.
          */}
          <button
            onClick={() => {
              const w = whereItHangs(selected.path);
              router.push(`/school/${w.schoolId}/class/${w.classId}/activity/${w.activityId}`);
            }}
            className="fixed left-1/2 z-[60] -translate-x-1/2 rounded-full px-5 py-3 text-[14px] font-bold pos-above-nav"
            style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
          >
            🚪 이 작품이 걸린 전시실로
          </button>
        </div>
      )}
    </div>
  );
}
