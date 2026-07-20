'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { collection, getDocs, query, where, doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { canAccessAdmin } from '@/lib/auth-helpers';
import { UserRole } from '@/lib/firestore-schema';


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

  const [showCreate, setShowCreate] = useState(false);
  const [newGrade, setNewGrade] = useState('3');
  const [newClassNum, setNewClassNum] = useState('');
  const [newMotto, setNewMotto] = useState('');
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const isSuper = role === 'super_admin';

  const handleCreateClass = useCallback(async () => {
    const num = parseInt(newClassNum, 10);
    if (!db || !user || !newGrade || !num || num < 1) return;
    setCreating(true);
    const classId = `${newGrade}-${num}`;
    await setDoc(doc(db, 'schools', schoolId, 'classes', classId), {
      schoolId: schoolId,
      grade: newGrade,
      classNumber: num,
      year: String(new Date().getFullYear()),
      teacherUid: user.uid,
      teacherName: userDoc?.displayName || '선생님',
      motto: newMotto.trim() || '함께 웃고, 함께 자라자',
      introText: '',
      isArchived: false,
      memberUids: [user.uid],
    });
    setCreating(false);
    setShowCreate(false);
    setNewClassNum('');
    setNewMotto('');
    setRefreshKey((k) => k + 1);
  }, [newGrade, newClassNum, newMotto, user, userDoc]);

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

      const stats: ClassStat[] = [];
      for (const cls of classSnap.docs) {
        const data = cls.data();
        const [studentsSnap, activitiesSnap] = await Promise.all([
          getDocs(collection(db, 'schools', schoolId, 'classes', cls.id, 'students')),
          getDocs(collection(db, 'schools', schoolId, 'classes', cls.id, 'activities')),
        ]);

        const activities: ActivityStat[] = [];
        let artworkCount = 0;
        let approvedCount = 0;
        let pendingCount = 0;

        for (const act of activitiesSnap.docs) {
          const artSnap = await getDocs(
            collection(db, 'schools', schoolId, 'classes', cls.id, 'activities', act.id, 'artworks')
          );
          let actPending = 0;
          artSnap.docs.forEach((d) => {
            const st = d.data().status;
            if (st === 'approved') approvedCount += 1;
            else if (st === 'pending') { pendingCount += 1; actPending += 1; }
          });
          artworkCount += artSnap.size;
          activities.push({
            id: act.id,
            title: (act.data().title as string) || act.id,
            artworkCount: artSnap.size,
            pendingCount: actPending,
          });
        }

        stats.push({
          id: cls.id,
          grade: data.grade,
          classNumber: data.classNumber,
          teacherName: data.teacherName || '미지정',
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
  }, [user, role, loading, router, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-sm" style={{ color: 'var(--color-text-sub)' }}>로딩 중...</div>
      </div>
    );
  }

  // 교사는 본인이 담당하는 반만 본다 (담당 반이 없으면 전체를 보여줘 초기 세팅을 돕는다)
  const myClasses = classes.filter((c) => c.teacherUid === user?.uid);
  const noOwnedClass = !isSuper && myClasses.length === 0;
  const visibleClasses = isSuper ? classes : myClasses.length > 0 ? myClasses : classes;

  const totals = visibleClasses.reduce(
    (acc, c) => ({
      students: acc.students + c.studentCount,
      activities: acc.activities + c.activityCount,
      artworks: acc.artworks + c.artworkCount,
      approved: acc.approved + c.approvedCount,
      pending: acc.pending + c.pendingCount,
    }),
    { students: 0, activities: 0, artworks: 0, approved: 0, pending: 0 }
  );

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
      <p className="text-xs mb-5" style={{ color: 'var(--color-text-sub)' }}>
        {isSuper ? '애월초등학교 전체 현황을 한눈에 봅니다' : '학생·학부모와 전시 내용을 관리합니다'}
      </p>

      {noOwnedClass && fetched && classes.length > 0 && (
        <div
          className="rounded-2xl p-3.5 mb-4 text-[11px] leading-relaxed"
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
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>{s.label}</div>
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
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>{s.label}</div>
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
          className="rounded-2xl p-4 mb-6 text-[11px]"
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
              <div className="text-[10px] mb-1" style={{ color: 'var(--color-text-sub)' }}>{g.label}</div>
              {g.names.length > 0 && (
                <div className="text-[9px] leading-snug break-keep" style={{ color: 'var(--color-text-sub)' }}>
                  {g.names.slice(0, 3).join(', ')}
                  {g.names.length > 3 ? ` 외 ${g.names.length - 3}` : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {members.readable && (
        <div className="text-[10px] mb-6 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
          {members.pending > 0 && `· 역할 미지정 가입자 ${members.pending}명 `}
          {members.parents.length > 0 &&
            `· 자녀 연결된 학부모 ${members.parents.filter((p) => p.childCount > 0).length}/${members.parents.length}명 (연결 기능 준비 중)`}
        </div>
      )}

      {/* ===== 학급 / 전시 내용 관리 ===== */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>
          {isSuper ? '📚 학년·반 현황' : '📚 전시 내용 관리'}
        </h2>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-full px-4 py-1.5 text-xs font-bold text-white shadow-md transition-transform hover:scale-105"
          style={{ background: 'var(--color-primary)' }}
        >
          + 반 만들기
        </button>
      </div>

      {fetched && visibleClasses.length === 0 && (
        <div
          className="rounded-2xl p-8 text-center text-xs leading-relaxed"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
        >
          아직 만든 반이 없어요. &lsquo;+ 반 만들기&rsquo;로 첫 교실을 만들어보세요!<br />
          반을 만들면 학교 건물 창문에 문패가 걸리고 빈 교실이 생깁니다.
        </div>
      )}

      {Object.entries(byGrade).map(([grade, list]) => (
        <div key={grade} className="mb-4">
          {isSuper && (
            <div className="text-[11px] font-bold mb-1.5 px-1" style={{ color: 'var(--color-text-sub)' }}>
              {grade}학년 · {list.length}개 반
            </div>
          )}
          <div className="flex flex-col gap-2">
            {list.map((cls) => (
              <div key={cls.id} className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface-soft)' }}>
                <button
                  onClick={() => setExpanded(expanded === cls.id ? null : cls.id)}
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
                      <div className="text-[10px] truncate" style={{ color: 'var(--color-text-sub)' }}>
                        담임 {cls.teacherName} · 학생 {cls.studentCount}명 · 전시실 {cls.activityCount}개 · 작품 {cls.artworkCount}점
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {cls.pendingCount > 0 && (
                      <span
                        className="text-[10px] font-bold px-2 py-1 rounded-full"
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
                        className="flex-1 rounded-xl py-2 text-[11px] font-bold"
                        style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
                      >
                        🏫 교실 열기
                      </button>
                      <button
                        onClick={() => router.push(`/admin/${schoolId}/class/${cls.id}`)}
                        className="flex-1 rounded-xl py-2 text-[11px] font-bold"
                        style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
                      >
                        ⚙️ 학급 설정
                      </button>
                      <button
                        onClick={() => router.push(`/admin/${schoolId}/roster`)}
                        className="flex-1 rounded-xl py-2 text-[11px] font-bold"
                        style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
                      >
                        📋 명부
                      </button>
                    </div>

                    <div className="text-[11px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>
                      전시실 {cls.activities.length}개
                    </div>
                    {cls.activities.length === 0 ? (
                      <div className="text-[11px] py-3 text-center" style={{ color: 'var(--color-text-sub)' }}>
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
                            <span className="text-xs font-bold truncate" style={{ color: 'var(--color-text-main)' }}>
                              🖼️ {act.title}
                            </span>
                            <span className="text-[10px] shrink-0 ml-2" style={{ color: 'var(--color-text-sub)' }}>
                              작품 {act.artworkCount}점
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
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
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
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
            직접 입력 / 엑셀 등록
          </div>
        </button>
        {actualRole === 'super_admin' && (
          <button
            onClick={() => router.push('/admin/logs')}
            className="rounded-2xl p-4 text-left transition-transform hover:scale-[1.02]"
            style={{ background: 'var(--color-surface-soft)' }}
          >
            <div className="text-2xl mb-2">🔎</div>
            <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>접근 기록</div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
              작성자·IP 확인 (도용 추적)
            </div>
          </button>
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
              <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-sub)' }}>
                만들면 학교 창문에 문패가 걸리고 빈 교실이 생겨요
              </p>
            </div>

            <div className="mb-3">
              <div className="text-[11px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>학년</div>
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
              <div className="text-[11px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>반 번호</div>
              <input
                type="number"
                min={1}
                max={20}
                value={newClassNum}
                onChange={(e) => setNewClassNum(e.target.value)}
                placeholder="예: 1"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
              />
            </div>

            <div className="mb-5">
              <div className="text-[11px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>급훈 (선택)</div>
              <input
                type="text"
                value={newMotto}
                onChange={(e) => setNewMotto(e.target.value)}
                placeholder="함께 웃고, 함께 자라자"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
              />
            </div>

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
                disabled={!newClassNum || creating}
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
