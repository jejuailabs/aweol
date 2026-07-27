'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';

/**
 * 총관리자 전용 — 학교 목록.
 *
 * 지금까지 관리 화면은 /admin/[schoolId] 하나뿐이라, 학교가 여러 개가 되면
 * 주소를 직접 쳐야 다른 학교로 갈 수 있었다. 여기서 전체를 보고 골라 들어간다.
 */

interface SchoolRow {
  id: string;
  name: string;
  tagline: string;
  imageUrl: string;
  classCount: number;
  activityCount: number;
  /** 'gallery' 면 지도에 세로 배너로, 아니면 학년·반 문패로 선다 */
  kind: string;
  /** 지도에서 내려놨나 */
  isArchived: boolean;
}

/**
 * 개인 전시관 한 줄.
 *
 * **총관리자는 이걸 볼 수 있어야 한다.** 규칙(firestore.rules)은 진작
 * `isSuper()` 로 열어 두었는데 **화면에 목록이 없었다** — 누가 무엇을
 * 지도에 올렸는지 알 길이 없었다는 뜻이다. 학교와 달리 개인 전시관은
 * 아무나 열 수 있으므로, 지도에 서는 것을 관리자가 못 보면 안 된다.
 */
interface HallRow {
  id: string;
  title: string;
  ownerName: string;
  ownerUid: string;
  placeName: string;
  isPublic: boolean;
  showCount: number;
  lat: number;
  lng: number;
}

export default function AdminHomePage() {
  const router = useRouter();
  const { user, actualRole, loading } = useAuth();
  const [rows, setRows] = useState<SchoolRow[]>([]);
  const [halls, setHalls] = useState<HallRow[]>([]);
  const [pendingTeachers, setPendingTeachers] = useState(0);
  const [fetched, setFetched] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // 역할 테스트 중이어도 실제 계정이 총관리자여야 한다
    if (!loading && (!user || actualRole !== 'super_admin')) router.replace('/');
  }, [loading, user, actualRole, router]);

  useEffect(() => {
    if (!db || actualRole !== 'super_admin') return;
    let alive = true;

    (async () => {
      try {
        const snap = await getDocs(collection(db, 'schools'));

        /**
         * 활동 수는 collectionGroup 으로 **한 번에** 센다.
         * 처음엔 학교마다 반을 돌고 반마다 활동을 읽었는데, 그러면 학교가 늘수록
         * 조회가 학교×반으로 불어난다(50곳이면 이 화면 한 번에 수천 건).
         * 지금은 학교 목록 1회 + 반 목록 학교당 1회 + 활동 전체 1회로 끝난다.
         */
        const allActs = await getDocs(collectionGroup(db, 'activities'));
        const actsBySchool = new Map<string, number>();
        allActs.docs.forEach((a) => {
          // schools/{schoolId}/classes/{classId}/activities/{id}
          const sid = a.ref.path.split('/')[1];
          actsBySchool.set(sid, (actsBySchool.get(sid) ?? 0) + 1);
        });

        const list = await Promise.all(
          snap.docs.map(async (d) => {
            const v = d.data();
            const classes = await getDocs(
              query(collection(db!, 'schools', d.id, 'classes'), where('isArchived', '==', false))
            );
            return {
              id: d.id,
              name: (v.name as string) || d.id,
              tagline: (v.tagline as string) || '',
              imageUrl: (v.imageUrl as string) || '',
              classCount: classes.size,
              activityCount: actsBySchool.get(d.id) ?? 0,
              kind: (v.kind as string) || 'school',
              isArchived: v.isArchived === true,
            };
          })
        );
        if (!alive) return;
        list.sort((a, b) => a.name.localeCompare(b.name));
        setRows(list);
      } catch {
        if (alive) setRows([]);
      }

      /**
       * 개인 전시관 — **비공개인 것까지 전부.**
       *
       * 지도(`/`)는 `isPublic == true` 만 묻지만 여기는 다르다. 관리자가
       * 봐야 할 것은 **지도에 이미 선 것**과 **곧 설 것** 둘 다이기 때문이다.
       * 규칙이 총관리자에게는 전부 열어 준다.
       */
      try {
        const hs = await getDocs(collection(db!, 'halls'));
        if (alive) {
          setHalls(
            hs.docs
              .map((d) => {
                const v = d.data();
                return {
                  id: d.id,
                  title: (v.title as string) || '이름 없는 전시관',
                  ownerName: (v.ownerName as string) || '',
                  ownerUid: (v.ownerUid as string) || '',
                  placeName: (v.placeName as string) || '',
                  isPublic: v.isPublic === true,
                  showCount: (v.showCount as number) ?? 0,
                  lat: Number(v.lat),
                  lng: Number(v.lng),
                };
              })
              // 공개된 것부터 — 지도에 이미 서 있는 것이 먼저 눈에 와야 한다
              .sort((a, b) => Number(b.isPublic) - Number(a.isPublic)
                || a.title.localeCompare(b.title))
          );
        }
      } catch {
        if (alive) setHalls([]);
      }

      try {
        const p = await getDocs(
          query(collection(db!, 'users'), where('pendingRole', '==', 'teacher'))
        );
        if (alive) setPendingTeachers(p.size);
      } catch {
        if (alive) setPendingTeachers(0);
      }
      if (alive) setFetched(true);
    })();

    return () => { alive = false; };
  }, [actualRole, refreshKey]);

  /**
   * 지도에 올리기 / 내리기 — **서버가 한다.**
   * 전시관·전시·작품 세 층을 한꺼번에 뒤집어야 해서 화면이 직접 못 쓴다
   * (`/api/hall` 의 publish). 규칙도 총관리자를 통과시킨다.
   */
  /**
   * 학교를 **지도에서 내리거나 다시 올린다.**
   * 지우는 것과 다르다 — 반과 작품은 그대로 두고 지도에서만 뺀다.
   * 되돌릴 수 있으니 웬만하면 이쪽이다.
   */
  const toggleArchive = async (s: SchoolRow) => {
    setBusy(s.id); setMsg('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const fd = new FormData();
      fd.set('schoolId', s.id);
      fd.set('isArchived', String(!s.isArchived));
      const res = await fetch('/api/school', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token ?? ''}` },
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '바꾸지 못했어요');
      setMsg(`${s.name} — ${!s.isArchived ? '지도에서 내렸어요' : '지도에 올렸어요'}`);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy('');
  };

  /**
   * 학교를 **통째로 지운다. 되돌릴 수 없다.**
   * 그래서 이름을 그대로 받아 적게 하고, 서버가 한 번 더 맞춰본다.
   */
  const removeSchool = async (s: SchoolRow) => {
    const typed = window.prompt(
      `"${s.name}" 을(를) 지웁니다.\n\n`
      + `반 ${s.classCount}개와 전시 ${s.activityCount}개, 그 안의 작품·숙제가 모두 사라져요.\n`
      + `되돌릴 수 없습니다.\n\n`
      + `그래도 지우려면 아래에 학교 이름을 그대로 적어주세요.`
    );
    if (typed === null) return;
    setBusy(s.id); setMsg('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/school', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ schoolId: s.id, confirmName: typed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '지우지 못했어요');
      setMsg(`${s.name} — 지웠어요. ${json.note ?? ''}`);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy('');
  };

  /** 개인 전시관 지우기 — 하위 문서까지 서버가 치운다(`/api/hall`) */
  const removeHall = async (h: HallRow) => {
    const typed = window.prompt(
      `"${h.title}" 전시관을 지웁니다.\n\n`
      + `전시 ${h.showCount}개와 그 안의 작품이 모두 사라져요. 되돌릴 수 없습니다.\n\n`
      + `그래도 지우려면 아래에 전시관 이름을 그대로 적어주세요.`
    );
    if (typed === null) return;
    if (typed.trim() !== h.title.trim()) {
      setMsg('이름이 달라요. 그대로 적어주세요.');
      return;
    }
    setBusy(h.id); setMsg('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/hall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ action: 'delete', hallId: h.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '지우지 못했어요');
      setMsg(`${h.title} — 지웠어요`);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy('');
  };

  const togglePublic = async (h: HallRow) => {
    setBusy(h.id); setMsg('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/hall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ action: 'publish', hallId: h.id, isPublic: !h.isPublic }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '바꾸지 못했어요');
      setMsg(`${h.title} — ${!h.isPublic ? '지도에 올렸어요' : '지도에서 내렸어요'}`);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy('');
  };

  if (loading || actualRole !== 'super_admin') return null;

  return (
    <div className="px-4 pt-6 pb-24 mx-auto max-w-[860px]">
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>
        🗂️ 전체 학교 관리
      </h1>
      <p className="text-sm mb-5" style={{ color: 'var(--color-text-sub)' }}>
        학교를 골라 들어가면 그 학교의 대시보드가 열려요
      </p>

      {/* 처리할 일 */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => router.push('/admin/teachers')}
          className="flex-1 rounded-2xl p-4 text-left transition-transform hover:scale-[1.02]"
          style={{ background: 'var(--color-surface-soft)' }}
        >
          <div className="text-2xl mb-1">👩‍🏫</div>
          <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>
            선생님 승인
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: pendingTeachers > 0 ? 'var(--color-primary)' : 'var(--color-text-sub)' }}>
            {pendingTeachers > 0 ? `${pendingTeachers}명 기다리는 중` : '기다리는 신청 없음'}
          </div>
        </button>
        <button
          onClick={() => router.push('/admin/logs')}
          className="flex-1 rounded-2xl p-4 text-left transition-transform hover:scale-[1.02]"
          style={{ background: 'var(--color-surface-soft)' }}
        >
          <div className="text-2xl mb-1">🔎</div>
          <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>
            접근 기록
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
            작성자·IP 확인
          </div>
        </button>
      </div>

      <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>
        🏫 학교 {rows.length}곳
      </h2>

      {!fetched ? (
        <div className="rounded-2xl py-10 text-center text-sm" style={{ background: 'var(--color-surface)', color: 'var(--color-text-sub)' }}>
          불러오는 중...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl py-10 text-center" style={{ background: 'var(--color-surface)' }}>
          <div className="text-3xl mb-2">🏫</div>
          <div className="text-sm mb-3" style={{ color: 'var(--color-text-sub)' }}>
            아직 만든 학교가 없어요
          </div>
          <button
            onClick={() => router.push('/')}
            className="rounded-full px-4 py-2 text-[14px] font-bold text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            지도에서 학교 만들기
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded-2xl p-3.5"
              style={{ background: 'var(--color-surface)', opacity: s.isArchived ? 0.6 : 1 }}
            >
              <button
                onClick={() => router.push(`/admin/${s.id}`)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div
                  className="h-12 w-12 shrink-0 rounded-xl overflow-hidden flex items-center justify-center"
                  style={{ background: 'var(--color-surface-soft)' }}
                >
                  {s.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xl">{s.kind === 'gallery' ? '🖼️' : '🏫'}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold truncate" style={{ color: 'var(--color-text-main)' }}>
                      {s.name}
                    </span>
                    {/* 학교인지 전시관인지 — 지도에 문패로 서는지 배너로 서는지가 갈린다 */}
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black"
                      style={s.kind === 'gallery'
                        ? { background: '#FFF1D6', color: '#A6762A' }
                        : { background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
                    >
                      {s.kind === 'gallery' ? '전시관' : '학교'}
                    </span>
                    {s.isArchived && (
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black"
                        style={{ background: 'rgba(0,0,0,0.08)', color: 'var(--color-text-sub)' }}
                      >
                        지도에 없음
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] truncate" style={{ color: 'var(--color-text-sub)' }}>
                    {s.tagline || s.id}
                  </div>
                  <div className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
                    반 {s.classCount}개 · 전시 {s.activityCount}개
                  </div>
                </div>
              </button>

              {/*
                **내리기를 지우기보다 앞에 둔다.**
                지우는 것은 되돌릴 수 없다. 대개는 지도에서 빼는 것으로 충분하다.
              */}
              <button
                onClick={() => toggleArchive(s)}
                disabled={!!busy}
                className="shrink-0 rounded-xl px-3 py-2 text-[12px] font-bold disabled:opacity-40"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
              >
                {busy === s.id ? '...' : s.isArchived ? '올리기' : '내리기'}
              </button>
              <button
                onClick={() => removeSchool(s)}
                disabled={!!busy}
                className="shrink-0 rounded-xl px-3 py-2 text-[12px] font-bold disabled:opacity-40"
                style={{ background: 'rgba(231,76,60,0.12)', color: '#C0392B' }}
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}

      {/*
        개인 전시관 — **학교와 따로 둔다.**

        학교는 총관리자가 만들지만 전시관은 **누구나 연다.** 그래서 지도에
        무엇이 서는지 관리자가 볼 수 있어야 하고, 필요하면 내릴 수 있어야 한다.
        그동안 규칙만 열려 있고 화면이 없어서, 누가 무엇을 올렸는지 알 길이 없었다.
      */}
      <h2 className="text-sm font-bold mt-6 mb-2" style={{ color: 'var(--color-text-main)' }}>
        🖼️ 개인 전시관 {halls.length}곳
        {halls.length > 0 && (
          <span className="ml-1.5 font-normal" style={{ color: 'var(--color-text-sub)' }}>
            (지도에 {halls.filter((h) => h.isPublic).length}곳)
          </span>
        )}
      </h2>

      {msg && (
        <div
          className="rounded-xl px-3 py-2.5 mb-2 text-[13px] font-bold"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
        >
          {msg}
        </div>
      )}

      {!fetched ? null : halls.length === 0 ? (
        <div
          className="rounded-2xl py-8 text-center text-sm"
          style={{ background: 'var(--color-surface)', color: 'var(--color-text-sub)' }}
        >
          아직 연 전시관이 없어요
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {halls.map((h) => (
            <div
              key={h.id}
              className="flex items-center gap-3 rounded-2xl p-3.5"
              style={{ background: 'var(--color-surface)' }}
            >
              <button
                onClick={() => router.push(`/hall/${h.id}`)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div
                  className="h-11 w-11 shrink-0 flex items-center justify-center"
                  style={{ background: '#2E2B27', borderRadius: 6, border: '2px solid #D8B25C' }}
                >
                  <span className="text-lg">🖼️</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold truncate" style={{ color: 'var(--color-text-main)' }}>
                    {h.title}
                  </div>
                  <div className="text-[12px] truncate" style={{ color: 'var(--color-text-sub)' }}>
                    {h.ownerName || h.ownerUid.slice(0, 8)} · {h.placeName || '자리 지정됨'}
                  </div>
                  <div className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
                    전시 {h.showCount}개
                    {Number.isFinite(h.lat) && ` · ${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}`}
                  </div>
                  {/*
                    **전시 0개면 들어가도 빈 광장이다.**
                    전시를 거는 것은 주인만 할 수 있으므로, 관리자가 눌러 들어가
                    막다른 길에 서기 전에 여기서 알려준다.
                  */}
                  {h.showCount === 0 && (
                    <div className="text-[12px] mt-1 font-bold" style={{ color: '#A6762A' }}>
                      {h.ownerUid === user?.uid
                        ? '전시가 없어요 — 내 전시관에서 열 수 있어요'
                        : `전시가 없어요 — ${h.ownerName || '주인'} 님만 걸 수 있어요`}
                    </div>
                  )}
                </div>
              </button>

              {/* 내 것이면 바로 고치러 간다 */}
              {h.ownerUid === user?.uid && (
                <button
                  onClick={() => router.push('/my-hall')}
                  className="shrink-0 rounded-xl px-3 py-2 text-[12px] font-bold"
                  style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
                >
                  ✏️ 관리
                </button>
              )}

              <span
                className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black"
                style={h.isPublic
                  ? { background: '#E6F4EA', color: '#1E7B45' }
                  : { background: '#FFF1D6', color: '#A6762A' }}
              >
                {h.isPublic ? '지도에 있음' : '나만 보는 중'}
              </span>

              <button
                onClick={() => togglePublic(h)}
                disabled={!!busy}
                className="shrink-0 rounded-xl px-3 py-2 text-[12px] font-bold disabled:opacity-40"
                style={h.isPublic
                  ? { background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }
                  : { background: 'var(--color-primary)', color: 'white' }}
              >
                {busy === h.id ? '...' : h.isPublic ? '내리기' : '올리기'}
              </button>
              <button
                onClick={() => removeHall(h)}
                disabled={!!busy}
                className="shrink-0 rounded-xl px-3 py-2 text-[12px] font-bold disabled:opacity-40"
                style={{ background: 'rgba(231,76,60,0.12)', color: '#C0392B' }}
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
