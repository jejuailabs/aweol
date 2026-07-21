'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { collection, collectionGroup, getDocs, getDoc, query, where, doc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { canAccessAdmin } from '@/lib/auth-helpers';
import { UserRole } from '@/lib/firestore-schema';
import SchoolSettingsModal, { type SchoolSettings } from '@/components/admin/SchoolSettingsModal';
import ClassAdminBox from '@/components/admin/ClassAdminBox';


interface ActivityStat {
  id: string;
  title: string;
  artworkCount: number;
  pendingCount: number;
}

interface ClassStat {
  id: string;
  grade: string;
  classNumber: number;
  teacherName: string;
  teacherUid: string;
  studentCount: number;
  activityCount: number;
  artworkCount: number;
  approvedCount: number;
  pendingCount: number;
  activities: ActivityStat[];
  /** 전시관에서 '반' 대신 보여줄 전시 주제 */
  displayName?: string;
}

interface MemberStat {
  teachers: { name: string; uid: string }[];
  students: { name: string; classIds: string[] }[];
  parents: { name: string; childCount: number }[];
  pending: number; // 역할 미지정
  readable: boolean;
}

const EMPTY_MEMBERS: MemberStat = { teachers: [], students: [], parents: [], pending: 0, readable: true };

export default function AdminPage() {
  const router = useRouter();
  const schoolId = useParams().schoolId as string;
  const { user, userDoc, role, actualRole, loading } = useAuth();
  const [classes, setClasses] = useState<ClassStat[]>([]);
  const [members, setMembers] = useState<MemberStat>(EMPTY_MEMBERS);
  const [fetched, setFetched] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  /**
   * 반을 펼칠 때만 그 반의 작품을 읽는다.
   * 대시보드를 열자마자 학교 전체 작품을 읽던 걸 여기로 미뤘다.
   */
  const loadClassArtworks = useCallback(async (classId: string) => {
    if (!db) return;
    const cls = classes.find((c) => c.id === classId);
    if (!cls || cls.artworkCount >= 0) return; // 이미 읽었으면 건너뛴다

    const acts = await Promise.all(
      cls.activities.map(async (a) => {
        const snap = await getDocs(
          collection(db!, 'schools', schoolId, 'classes', classId, 'activities', a.id, 'artworks')
        );
        let approved = 0;
        snap.docs.forEach((d) => { if (d.data().status === 'approved') approved += 1; });
        return { id: a.id, total: snap.size, approved };
      })
    );

    setClasses((prev) =>
      prev.map((c) => {
        if (c.id !== classId) return c;
        const total = acts.reduce((s, a) => s + a.total, 0);
        const approved = acts.reduce((s, a) => s + a.approved, 0);
        return {
          ...c,
          artworkCount: total,
          approvedCount: approved,
          activities: c.activities.map((a) => ({
            ...a,
            artworkCount: acts.find((x) => x.id === a.id)?.total ?? 0,
          })),
        };
      })
    );
  }, [classes, schoolId]);

  const [showCreate, setShowCreate] = useState(false);
  const [newGrade, setNewGrade] = useState('3');
  const [newClassNum, setNewClassNum] = useState('');
  const [newMotto, setNewMotto] = useState('');
  const [creating, setCreating] = useState(false);
  /**
   * 만들기 결과 안내.
   *
   * **'이미 있어요' 는 오류가 아니다.** 선생님이 잘못한 게 없고, 그냥 이미 있는 것뿐이다.
   * 빨간 오류로 띄우면 뭘 잘못한 줄 안다. 그래서 종류를 나눠 색을 다르게 쓴다.
   */
  const [createMsg, setCreateMsg] = useState<{ kind: 'info' | 'error'; text: string; hint?: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [school, setSchool] = useState<SchoolSettings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [villageBusy, setVillageBusy] = useState(false);
  const [villageMsg, setVillageMsg] = useState('');

  const isSuper = role === 'super_admin';

  /**
   * 고른 학년에 이미 있는 반 번호.
   * 목록은 이미 읽어둔 것을 쓴다 — 이것 때문에 따로 더 읽지 않는다.
   */
  const takenInGrade = classes
    .filter((c) => String(c.grade) === String(newGrade))
    .map((c) => c.classNumber)
    .sort((a, b) => a - b);
  const isTaken = !!newClassNum && takenInGrade.includes(parseInt(newClassNum, 10));

  /**
   * 반 만들기는 서버(/api/class)가 한다.
   *
   * 예전에는 여기서 곧장 `setDoc` 을 했는데 두 가지가 잘못돼 있었다.
   * - `setDoc` 은 있는 문서를 **덮어쓴다.** 이미 있는 반 번호를 넣으면 그 반의
   *   담임·급훈·명단이 통째로 날아간다.
   * - 있는 문서는 규칙이 update 로 보는데 update 는 담임만 허용이라, 남의 반 번호를
   *   넣으면 권한 오류가 났다. 그런데 오류를 잡는 코드가 없어서 '만드는 중...' 에서
   *   영영 멈춰 있었다.
   */
  const handleCreateClass = useCallback(async () => {
    const num = parseInt(newClassNum, 10);
    if (!user) return;
    if (!Number.isInteger(num) || num < 1 || num > 12) {
      setCreateMsg({ kind: 'error', text: '반 번호는 1반부터 12반까지 숫자로 적어주세요' });
      return;
    }
    setCreating(true);
    setCreateMsg(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/class', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          schoolId,
          grade: Number(newGrade),
          classNumber: num,
          motto: newMotto,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateMsg(
          json.code === 'ALREADY_EXISTS'
            ? { kind: 'info', text: json.message, hint: json.hint }
            : { kind: 'error', text: json.error || '반을 만들지 못했어요' }
        );
        return;
      }
      setShowCreate(false);
      setNewClassNum('');
      setNewMotto('');
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setCreateMsg({ kind: 'error', text: (e as Error).message || '반을 만들지 못했어요' });
    } finally {
      // 성공하든 실패하든 반드시 푼다. 이게 없어서 버튼이 영영 멈춰 있었다.
      setCreating(false);
    }
  }, [schoolId, newGrade, newClassNum, newMotto, user]);

  // 학교 문서 (제목과 설정 모달에 쓴다)
  useEffect(() => {
    if (!db) return;
    getDoc(doc(db, 'schools', schoolId))
      .then((s) => {
        if (!s.exists()) { setSchool(null); return; }
        const v = s.data();
        setSchool({
          id: s.id,
          name: (v.name as string) || s.id,
          tagline: (v.tagline as string) || '',
          imageUrl: (v.imageUrl as string) || '',
          gradeCount: (v.gradeCount as number) ?? 6,
          classPerGrade: (v.classPerGrade as number) ?? 4,
          emblemUrl: (v.emblemUrl as string) || '',
          profile: (v.profile as SchoolSettings['profile']) ?? undefined,
          kind: v.kind === 'gallery' ? 'gallery' : 'school',
        });
      })
      .catch(() => setSchool(null));
  }, [schoolId, refreshKey]);

  useEffect(() => {
    if (!loading && (!user || !canAccessAdmin(role))) {
      router.replace('/');
      return;
    }

    async function fetchData() {
      if (!db) return;

      // ---- 학급별 집계 ----
      const classSnap = await getDocs(
        query(collection(db, 'schools', schoolId, 'classes'), where('isArchived', '==', false))
      );

      /**
       * 승인 대기는 collectionGroup 으로 한 번에 센다.
       * 예전에는 반 → 활동 → 작품을 전부 읽고 나서 상태별로 세었다. 대기가 0건이어도
       * 학교의 모든 작품을 읽는 구조라 반이 늘수록 읽기가 급격히 불어났다.
       * 작품 총계는 반을 펼칠 때만 읽는다 (아래 loadClassArtworks).
       */
      const pendingSnap = await getDocs(
        query(collectionGroup(db, 'artworks'), where('status', '==', 'pending'))
      );
      const prefix = `schools/${schoolId}/classes/`;
      const pendingByClass = new Map<string, number>();
      const pendingByActivity = new Map<string, number>();
      pendingSnap.docs.forEach((d) => {
        if (!d.ref.path.startsWith(prefix)) return;
        const seg = d.ref.path.split('/');
        pendingByClass.set(seg[3], (pendingByClass.get(seg[3]) ?? 0) + 1);
        const key = `${seg[3]}/${seg[5]}`;
        pendingByActivity.set(key, (pendingByActivity.get(key) ?? 0) + 1);
      });

      /**
       * 담당 반만 읽는다.
       * 명부는 이제 담임만 읽을 수 있어서, 전체 반을 돌면 남의 반에서 권한 오류가 난다.
       * (총관리자는 전부 본다)
       */
      const mine = userDoc?.classIds || [];
      const targetClasses = role === 'super_admin'
        ? classSnap.docs
        : classSnap.docs.filter((c) => mine.includes(c.id) || c.data().teacherUid === user?.uid);

      const stats: ClassStat[] = [];
      for (const cls of targetClasses) {
        const data = cls.data();
        const [studentsSnap, activitiesSnap] = await Promise.all([
          getDocs(collection(db, 'schools', schoolId, 'classes', cls.id, 'students')),
          getDocs(collection(db, 'schools', schoolId, 'classes', cls.id, 'activities')),
        ]);

        const pendingCount = pendingByClass.get(cls.id) ?? 0;
        const activities: ActivityStat[] = activitiesSnap.docs.map((act) => ({
          id: act.id,
          title: (act.data().title as string) || act.id,
          artworkCount: -1, // -1 = 아직 안 읽음 (펼칠 때 채운다)
          pendingCount: pendingByActivity.get(`${cls.id}/${act.id}`) ?? 0,
        }));
        const artworkCount = -1;
        const approvedCount = -1;

        stats.push({
          id: cls.id,
          grade: data.grade,
          classNumber: data.classNumber,
          teacherName: data.teacherName || '미지정',
          displayName: (data as { displayName?: string }).displayName || '',
          teacherUid: data.teacherUid || '',
          studentCount: studentsSnap.size,
          activityCount: activitiesSnap.size,
          artworkCount,
          approvedCount,
          pendingCount,
          activities,
        });
      }
      stats.sort((a, b) => (a.grade === b.grade ? a.classNumber - b.classNumber : a.grade.localeCompare(b.grade)));
      setClasses(stats);

      // ---- 구성원 현황 (교사/슈퍼관리자만 users 조회 가능) ----
      try {
        const userSnap = await getDocs(collection(db, 'users'));
        const m: MemberStat = { teachers: [], students: [], parents: [], pending: 0, readable: true };
        userSnap.docs.forEach((d) => {
          const u = d.data();
          const name = (u.displayName as string) || '(이름 없음)';
          const r = u.role as UserRole | null;
          if (r === 'teacher' || r === 'super_admin') m.teachers.push({ name, uid: d.id });
          else if (r === 'student') m.students.push({ name, classIds: (u.classIds as string[]) || [] });
          else if (r === 'parent') m.parents.push({ name, childCount: ((u.children as unknown[]) || []).length });
          else m.pending += 1;
        });
        setMembers(m);
      } catch {
        setMembers({ ...EMPTY_MEMBERS, readable: false });
      }

      setFetched(true);
    }

    if (!loading && user) fetchData();
  }, [user, userDoc, role, loading, router, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="text-sm" style={{ color: 'var(--color-text-sub)' }}>로딩 중...</div>
      </div>
    );
  }

  // 교사는 본인이 담당하는 반만 본다 (담당 반이 없으면 전체를 보여줘 초기 세팅을 돕는다)
  /**
   * 담당 반 판정은 users.classIds 를 기준으로 한다.
   * teacherUid 만 보면 담임이 비어 있는 반까지 '내 반'에서 빠진다.
   */
  const myClassIds = userDoc?.classIds || [];
  const myClasses = classes.filter((c) => myClassIds.includes(c.id) || c.teacherUid === user?.uid);
  const noOwnedClass = !isSuper && myClasses.length === 0;
  /**
   * 담당 반이 없다고 전체 반을 보여주면 안 된다.
   * 규칙이 남의 반 명부·제출물을 막고 있어서 화면만 깨지고, 애초에 보여줄 이유도 없다.
   */
  const visibleClasses = isSuper ? classes : myClasses;

  // 작품 수(-1)는 아직 안 읽은 반이라 합계에서 뺀다
  const totals = visibleClasses.reduce(
    (acc, c) => ({
      students: acc.students + c.studentCount,
      activities: acc.activities + c.activityCount,
      artworks: acc.artworks + Math.max(0, c.artworkCount),
      approved: acc.approved + Math.max(0, c.approvedCount),
      pending: acc.pending + c.pendingCount,
    }),
    { students: 0, activities: 0, artworks: 0, approved: 0, pending: 0 }
  );
  const artworksLoaded = visibleClasses.every((c) => c.artworkCount >= 0);

  // 학년별 그룹 (슈퍼 관리자용)
  const byGrade = visibleClasses.reduce<Record<string, ClassStat[]>>((acc, c) => {
    (acc[c.grade] ||= []).push(c);
    return acc;
  }, {});

  return (
    <div className="px-4 pt-6 pb-24 mx-auto max-w-[860px]">
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>
        {isSuper ? '🏫 학교 관리자 대시보드' : '👩‍🏫 우리 반 관리'}
      </h1>
      <div className="flex items-center gap-2 mb-5">
        <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
          {isSuper
            ? `${school?.name || schoolId} 전체 현황을 한눈에 봅니다`
            : '학생·학부모와 전시 내용을 관리합니다'}
        </p>
        {school && (
          <button
            onClick={() => setShowSettings(true)}
            className="ml-auto shrink-0 rounded-full px-3 py-1.5 text-[13px] font-bold"
            style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
          >
            ⚙️ 학교 정보
          </button>
        )}
      </div>

      {showSettings && school && (
        <SchoolSettingsModal
          school={school}
          isSuper={isSuper}
          onSaved={() => setRefreshKey((k) => k + 1)}
          onClose={() => setShowSettings(false)}
        />
      )}

      {noOwnedClass && fetched && classes.length > 0 && (
        <div
          className="rounded-2xl p-3.5 mb-4 text-[13px] leading-relaxed"
          style={{ background: '#FFF6E5', border: '1px solid #F0D9A8', color: '#8A6D2F' }}
        >
          담당 반으로 지정된 학급이 없어 학교 전체를 표시하고 있어요.
          &lsquo;+ 반 만들기&rsquo;로 직접 만든 반은 자동으로 담당 반이 됩니다.
        </div>
      )}

      {/* ===== 요약 ===== */}
      <div className="grid grid-cols-3 gap-2.5 mb-3">
        {[
          { label: isSuper ? '학급' : '내 반', value: visibleClasses.length, icon: '🏫' },
          { label: '학생(명부)', value: totals.students, icon: '🎒' },
          { label: '전시실', value: totals.activities, icon: '🖼️' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl p-3.5 text-center" style={{ background: 'var(--color-surface-soft)' }}>
            <div className="text-lg mb-0.5">{s.icon}</div>
            <div className="text-xl font-bold" style={{ color: 'var(--color-text-main)' }}>{s.value}</div>
            <div className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2.5 mb-6">
        {[
          { label: '전시 중', value: totals.approved, color: 'var(--color-primary)' },
          { label: '승인 대기', value: totals.pending, color: '#E8A33C', link: true },
          { label: '전체 작품', value: totals.artworks, color: 'var(--color-text-main)' },
        ].map((s) => (
          <button
            key={s.label}
            onClick={() => s.link && router.push(`/admin/${schoolId}/approval`)}
            className="rounded-2xl p-3.5 text-center transition-transform hover:scale-[1.02]"
            style={{ background: 'var(--color-surface-soft)', cursor: s.link ? 'pointer' : 'default' }}
          >
            <div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>{s.label}</div>
          </button>
        ))}
      </div>

      {/* ===== 구성원 현황 ===== */}
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>
          {isSuper ? '👥 구성원 현황' : '👥 우리 반 구성원'}
        </h2>
      </div>
      {!members.readable ? (
        <div
          className="rounded-2xl p-4 mb-6 text-[13px]"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
        >
          구성원 정보를 불러올 권한이 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2.5 mb-2">
          {[
            { label: '선생님', value: members.teachers.length, icon: '👩‍🏫', names: members.teachers.map((t) => t.name) },
            { label: '학생 계정', value: members.students.length, icon: '🎒', names: members.students.map((s) => s.name) },
            { label: '학부모', value: members.parents.length, icon: '👨‍👩‍👧', names: members.parents.map((p) => p.name) },
          ].map((g) => (
            <div key={g.label} className="rounded-2xl p-3.5" style={{ background: 'var(--color-surface-soft)' }}>
              <div className="text-lg mb-0.5">{g.icon}</div>
              <div className="text-xl font-bold" style={{ color: 'var(--color-text-main)' }}>{g.value}</div>
              <div className="text-[12px] mb-1" style={{ color: 'var(--color-text-sub)' }}>{g.label}</div>
              {g.names.length > 0 && (
                <div className="text-[11px] leading-snug break-keep" style={{ color: 'var(--color-text-sub)' }}>
                  {g.names.slice(0, 3).join(', ')}
                  {g.names.length > 3 ? ` 외 ${g.names.length - 3}` : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {members.readable && (
        <div className="text-[12px] mb-6 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
          {members.pending > 0 && `· 역할 미지정 가입자 ${members.pending}명 `}
          {members.parents.length > 0 &&
            `· 자녀 연결된 학부모 ${members.parents.filter((p) => p.childCount > 0).length}/${members.parents.length}명 (연결 기능 준비 중)`}
        </div>
      )}

      {/* 우리 동네 만들기 — 학교 좌표로 걸어다닐 동네를 굽는다 */}
      <div className="rounded-3xl p-4 mb-4" style={{ background: 'var(--color-surface)' }}>
        <div className="text-sm font-black mb-1" style={{ color: 'var(--color-text-main)' }}>
          🏘️ 우리 동네 만들기
        </div>
        <div className="text-[13px] mb-3 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
          학교 둘레 400m 를 지도에서 받아 <b>걸어다닐 수 있는 동네</b>로 만들어요.
          아이들은 만들어진 파일 하나만 받으니 몇 명이 들어와도 요금이 늘지 않아요.
          지도가 바뀌면 다시 눌러주세요.
        </div>
        <button
          onClick={async () => {
            setVillageBusy(true); setVillageMsg('');
            try {
              const token = await auth?.currentUser?.getIdToken();
              const res = await fetch('/api/village', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ schoolId }),
              });
              const json = await res.json();
              if (!res.ok) throw new Error(json.error || '만들지 못했어요');
              setVillageMsg(
                `동네를 만들었어요 — 건물 ${json.counts.buildings}채, 길 ${json.counts.roads}조각`
                + (json.named?.length ? ` (${json.named.slice(0, 3).join(', ')} …)` : '')
              );
            } catch (e) {
              setVillageMsg((e as Error).message);
            }
            setVillageBusy(false);
          }}
          disabled={villageBusy}
          className="w-full rounded-xl py-2.5 text-sm font-bold disabled:opacity-40"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
        >
          {villageBusy ? '지도를 받는 중...' : '동네 만들기 (또는 다시 만들기)'}
        </button>
        {villageMsg && (
          <div className="text-[13px] font-bold mt-2 leading-relaxed" style={{ color: 'var(--color-primary)' }}>
            {villageMsg}
          </div>
        )}
      </div>

      {/* ===== 학급 / 전시 내용 관리 ===== */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>
          {isSuper ? '📚 학년·반 현황' : '📚 전시 내용 관리'}
        </h2>
        <button
          onClick={() => { setCreateMsg(null); setShowCreate(true); }}
          className="rounded-full px-4 py-1.5 text-sm font-bold text-white shadow-md transition-transform hover:scale-105"
          style={{ background: 'var(--color-primary)' }}
        >
          + 반 만들기
        </button>
      </div>

      {fetched && visibleClasses.length === 0 && (
        <div
          className="rounded-2xl p-8 text-center text-sm leading-relaxed"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
        >
          아직 만든 반이 없어요. &lsquo;+ 반 만들기&rsquo;로 첫 교실을 만들어보세요!<br />
          반을 만들면 학교 건물 창문에 문패가 걸리고 빈 교실이 생깁니다.
        </div>
      )}

      {Object.entries(byGrade).map(([grade, list]) => (
        <div key={grade} className="mb-4">
          {isSuper && (
            <div className="text-[13px] font-bold mb-1.5 px-1" style={{ color: 'var(--color-text-sub)' }}>
              {grade}학년 · {list.length}개 반
            </div>
          )}
          <div className="flex flex-col gap-2">
            {list.map((cls) => (
              <div key={cls.id} className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface-soft)' }}>
                <button
                  onClick={() => {
                    const next = expanded === cls.id ? null : cls.id;
                    setExpanded(next);
                    if (next) loadClassArtworks(next);
                  }}
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-sm font-bold"
                      style={{ background: 'var(--color-primary)', color: 'white' }}
                    >
                      {cls.grade}-{cls.classNumber}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>
                        {cls.grade}학년 {cls.classNumber}반
                      </div>
                      <div className="text-[12px] truncate" style={{ color: 'var(--color-text-sub)' }}>
                        담임 {cls.teacherName} · 학생 {cls.studentCount}명 · 전시실 {cls.activityCount}개{cls.artworkCount >= 0 ? ` · 작품 ${cls.artworkCount}점` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {cls.pendingCount > 0 && (
                      <span
                        className="text-[12px] font-bold px-2 py-1 rounded-full"
                        style={{ background: '#E8A33C', color: 'white' }}
                      >
                        {cls.pendingCount} 대기
                      </span>
                    )}
                    <span style={{ color: 'var(--color-text-sub)' }}>{expanded === cls.id ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* 펼쳤을 때: 전시실(활동) 목록 */}
                {expanded === cls.id && (
                  <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--color-surface)' }}>
                    <div className="flex gap-2 my-3">
                      <button
                        onClick={() => router.push(`/school/${schoolId}/class/${cls.id}/room`)}
                        className="flex-1 rounded-xl py-2 text-[13px] font-bold"
                        style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
                      >
                        🏫 교실 열기
                      </button>
                      <button
                        onClick={() => router.push(`/admin/${schoolId}/class/${cls.id}`)}
                        className="flex-1 rounded-xl py-2 text-[13px] font-bold"
                        style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
                      >
                        ⚙️ 학급 설정
                      </button>
                      <button
                        onClick={() => router.push(`/admin/${schoolId}/roster`)}
                        className="flex-1 rounded-xl py-2 text-[13px] font-bold"
                        style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
                      >
                        📋 명부
                      </button>
                    </div>

                    <div className="text-[13px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>
                      전시실 {cls.activities.length}개
                    </div>

                    {/*
                      반 손보기 — 총관리자만. 담임에게는 안 보인다.
                      규칙(isTeacherOf)은 담임에게도 열려 있지만, 자기 반을 통째로
                      지우는 건 실수로 일어나기 쉬워서 화면에서는 막아둔다.
                    */}
                    {isSuper && (
                      <div className="mb-3">
                        <ClassAdminBox
                          schoolId={schoolId}
                          classId={cls.id}
                          grade={cls.grade}
                          classNumber={cls.classNumber}
                          displayName={cls.displayName}
                          kind={school?.kind === 'gallery' ? 'gallery' : 'school'}
                          onChanged={() => setRefreshKey((k) => k + 1)}
                        />
                      </div>
                    )}
                    {cls.activities.length === 0 ? (
                      <div className="text-[13px] py-3 text-center" style={{ color: 'var(--color-text-sub)' }}>
                        아직 전시실이 없어요. 교실 게시판의 ➕로 첫 수업을 만들어보세요.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {cls.activities.map((act) => (
                          <button
                            key={act.id}
                            onClick={() => router.push(`/school/${schoolId}/class/${cls.id}/activity/${act.id}`)}
                            className="flex items-center justify-between rounded-xl px-3 py-2.5 text-left"
                            style={{ background: 'var(--color-surface)' }}
                          >
                            <span className="text-sm font-bold truncate" style={{ color: 'var(--color-text-main)' }}>
                              🖼️ {act.title}
                            </span>
                            <span className="text-[12px] shrink-0 ml-2" style={{ color: 'var(--color-text-sub)' }}>
                              {act.artworkCount >= 0 ? `작품 ${act.artworkCount}점` : '작품 …'}
                              {act.pendingCount > 0 && ` · 대기 ${act.pendingCount}`}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* ===== 빠른 메뉴 ===== */}
      <h2 className="text-sm font-bold mb-3 mt-6" style={{ color: 'var(--color-text-main)' }}>
        빠른 메뉴
      </h2>
      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={() => router.push(`/admin/${schoolId}/approval`)}
          className="rounded-2xl p-4 text-left transition-transform hover:scale-[1.02]"
          style={{ background: totals.pending > 0 ? '#FFF3E0' : 'var(--color-surface-soft)' }}
        >
          <div className="text-2xl mb-2">✅</div>
          <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>작품 승인</div>
          <div className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
            {totals.pending > 0 ? `${totals.pending}점 대기 중` : '대기 중인 작품 없음'}
          </div>
        </button>
        <button
          onClick={() => router.push(`/admin/${schoolId}/roster`)}
          className="rounded-2xl p-4 text-left transition-transform hover:scale-[1.02]"
          style={{ background: 'var(--color-surface-soft)' }}
        >
          <div className="text-2xl mb-2">📋</div>
          <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>학생 명부</div>
          <div className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
            직접 입력 / 엑셀 등록
          </div>
        </button>
        {actualRole === 'super_admin' && (
          <>
            <button
              onClick={() => router.push('/admin/teachers')}
              className="rounded-2xl p-4 text-left transition-transform hover:scale-[1.02]"
              style={{ background: 'var(--color-surface-soft)' }}
            >
              <div className="text-2xl mb-2">👩‍🏫</div>
              <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>선생님 승인</div>
              <div className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
                교사 신청 확인 후 권한 부여
              </div>
            </button>
            <button
              onClick={() => router.push('/admin/logs')}
              className="rounded-2xl p-4 text-left transition-transform hover:scale-[1.02]"
              style={{ background: 'var(--color-surface-soft)' }}
            >
              <div className="text-2xl mb-2">🔎</div>
              <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>접근 기록</div>
              <div className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
                작성자·IP 확인 (도용 추적)
              </div>
            </button>
          </>
        )}
      </div>

      {/* 반 만들기 모달 */}
      {showCreate && (
        <div
          className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center px-5"
          style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowCreate(false)}
        >
          <div
            className="modal-card w-full max-w-[360px] rounded-3xl p-6"
            style={{ background: 'var(--color-surface)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-5">
              <div className="text-3xl mb-1">🏫</div>
              <h3 className="text-base font-bold" style={{ color: 'var(--color-text-main)' }}>새 반 만들기</h3>
              <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-sub)' }}>
                만들면 학교 창문에 문패가 걸리고 빈 교실이 생겨요
              </p>
            </div>

            <div className="mb-3">
              <div className="text-[13px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>학년</div>
              <div className="grid grid-cols-6 gap-1.5">
                {['1', '2', '3', '4', '5', '6'].map((g) => (
                  <button
                    key={g}
                    onClick={() => setNewGrade(g)}
                    className="rounded-lg py-2 text-sm font-bold transition-all"
                    style={{
                      background: newGrade === g ? 'var(--color-primary)' : 'var(--color-surface-soft)',
                      color: newGrade === g ? 'white' : 'var(--color-text-main)',
                    }}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-3">
              <div className="text-[13px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>반 번호</div>
              <input
                type="number"
                min={1}
                max={20}
                value={newClassNum}
                onChange={(e) => { setNewClassNum(e.target.value); setCreateMsg(null); }}
                placeholder="예: 1"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
              />
            </div>

            {/*
              이미 있는 반을 보여준다. 안 보여주면 3-4 를 적어놓고 만들기를 눌러본 뒤에야
              '이미 있어요' 를 듣는다 — 적기 전에 알 수 있어야 한다.
            */}
            {takenInGrade.length > 0 && (
              <div className="mb-3 text-[12px] leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
                {newGrade}학년에 이미 있는 반: <b>{takenInGrade.join(', ')}반</b>
              </div>
            )}

            {isTaken && (
              <div
                className="rounded-xl px-3 py-2 mb-3 text-[13px]"
                style={{ background: '#EAF2FB', color: '#2F6DB5', border: '1px solid #C9DDF2' }}
              >
                <b>ℹ️ {newGrade}학년 {newClassNum}반은 이미 있어요.</b> 다른 번호를 골라주세요.
              </div>
            )}

            <div className="mb-5">
              <div className="text-[13px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>급훈 (선택)</div>
              <input
                type="text"
                value={newMotto}
                onChange={(e) => setNewMotto(e.target.value)}
                placeholder="함께 웃고, 함께 자라자"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
              />
            </div>

            {createMsg && (
              <div
                className="rounded-xl px-3 py-2.5 mb-3 text-[13px] leading-relaxed"
                style={
                  createMsg.kind === 'info'
                    ? { background: '#EAF2FB', color: '#2F6DB5', border: '1px solid #C9DDF2' }
                    : { background: '#FDECEA', color: '#B02A37', border: '1px solid #F5C6C4' }
                }
              >
                <div className="font-bold">
                  {createMsg.kind === 'info' ? 'ℹ️ ' : '⚠️ '}{createMsg.text}
                </div>
                {createMsg.hint && <div className="mt-0.5 opacity-85">{createMsg.hint}</div>}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 rounded-xl py-3 text-sm font-bold"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
              >
                취소
              </button>
              <button
                onClick={handleCreateClass}
                disabled={!newClassNum || creating || isTaken}
                className="flex-1 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50"
                style={{ background: 'var(--color-primary)' }}
              >
                {creating ? '만드는 중...' : `${newGrade}-${newClassNum || '?'}반 만들기`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
