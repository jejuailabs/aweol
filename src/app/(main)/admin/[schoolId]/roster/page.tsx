'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { collection, getDocs, doc, getDoc, setDoc, deleteDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { canAccessAdmin, isSchoolManager } from '@/lib/auth-helpers';
import { assignLoginNames, normalizeName } from '@/lib/student-login';


interface StudentRow {
  number: number;
  name: string;
  classId: string;
  code?: string | null;
  linkedUid?: string | null;
}

export default function RosterPage() {
  const router = useRouter();
  const schoolId = useParams().schoolId as string;
  const { user, userDoc, role, loading } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedClass, setSelectedClass] = useState('3-1');
  const [classes, setClasses] = useState<{ id: string; label: string }[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [orphanStudents, setOrphanStudents] = useState<{ id: string; name: string }[]>([]);

  // 수동 등록
  const [mode, setMode] = useState<'manual' | 'excel'>('manual');
  const [newName, setNewName] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingNum, setEditingNum] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  /**
   * 학생 로그인 비밀번호 — **반에 하나**.
   *
   * 아이마다 다르게 주면 잊어버리고, 잊어버리면 수업 시간에 선생님이 스무 번
   * 다시 알려주게 된다. 하나면 칠판에 적어두면 끝이다. 누가 누구인지는 이름이 가른다.
   * 담임만 읽을 수 있는 딸린 문서에 있다(반 문서는 공개 읽기라 거기 두면 안 된다).
   */
  const [classPassword, setClassPassword] = useState<string | null>(null);
  const [pwInput, setPwInput] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const studentsCol = useCallback(() => {
    if (!db) return null;
    return collection(db, 'schools', schoolId, 'classes', selectedClass, 'students');
  }, [selectedClass]);

  const nextNumber = students.length > 0 ? Math.max(...students.map((s) => s.number)) + 1 : 1;

  /**
   * 이름이 겹치는 아이들만 추려 **아이가 칠 이름**을 만든다.
   * 판정은 서버(`assignLoginNames`)와 같은 함수를 쓴다 — 두 벌이면
   * 화면에는 김민준A 라고 적혀 있는데 서버는 다르게 부르는 일이 생긴다.
   */
  const loginNames = (() => {
    const rows = students.map((s) => ({ id: String(s.number), number: s.number, name: s.name }));
    const assigned = assignLoginNames(rows);
    const out: Record<string, string[]> = {};
    for (const r of rows) {
      const given = assigned[r.id];
      if (!given || given === normalizeName(r.name)) continue;
      (out[normalizeName(r.name)] ||= []).push(given);
    }
    return out;
  })();

  // 새 명부에 없는 기존 학생을 교사가 확인 후 직접 삭제
  const handleDeleteOrphans = async () => {
    const col = studentsCol();
    if (!col || orphanStudents.length === 0) return;
    for (const o of orphanStudents) {
      await deleteDoc(doc(col, o.id));
    }
    setStudents((prev) => prev.filter((s) => !orphanStudents.some((o) => o.id === `student-${s.number}`)));
    setMessage(`${orphanStudents.length}명을 명단에서 삭제했습니다.`);
    setOrphanStudents([]);
  };

  useEffect(() => {
    if (!loading && (!user || !canAccessAdmin(role))) {
      router.replace('/');
      return;
    }

    async function fetchClasses() {
      if (!db) return;
      const snap = await getDocs(
        query(collection(db, 'schools', schoolId, 'classes'), where('isArchived', '==', false))
      );
      /**
       * **담임은 자기 반만 본다.**
       *
       * 규칙(isTeacherOf)은 이미 남의 반 명부를 막고 있었는데, 화면이 전체 반을
       * 탭으로 늘어놓아서 눌러보면 오류가 나는 상태였다. 명부는 아이들 개인정보라
       * 목록에 보이는 것 자체가 맞지 않는다.
       * 총관리자만 전체를 본다.
       */
      const mine = userDoc?.classIds ?? [];
      const list = snap.docs
        .map((d) => ({ id: d.id, label: `${d.data().grade}-${d.data().classNumber}반` }))
        .filter((c) => isSchoolManager(role) || mine.includes(c.id))
        .sort((a, b) => a.id.localeCompare(b.id));
      setClasses(list);
      if (list.length > 0 && !list.some((c) => c.id === selectedClass)) {
        setSelectedClass(list[0].id);
      }
    }

    if (!loading && user) fetchClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userDoc, role, loading, router]);

  useEffect(() => {
    async function fetchStudents() {
      if (!db) return;
      const snap = await getDocs(
        collection(db, 'schools', schoolId, 'classes', selectedClass, 'students')
      );
      const list = snap.docs
        .map((d) => ({
          number: d.data().number || 0,
          name: d.data().name || '',
          classId: selectedClass,
          code: d.data().code ?? null,
          linkedUid: d.data().linkedUid ?? null,
        }))
        .sort((a, b) => a.number - b.number);
      setStudents(list);
    }
    fetchStudents();
  }, [selectedClass, refreshKey]);

  // 반 비밀번호 읽기 — 규칙이 담임에게만 열어둔다
  useEffect(() => {
    if (!db || !selectedClass) return;
    getDoc(doc(db, 'schools', schoolId, 'classes', selectedClass, 'settings', 'studentLogin'))
      .then((s) => setClassPassword(s.exists() ? String(s.data()?.password ?? '') : null))
      .catch(() => setClassPassword(null));
  }, [schoolId, selectedClass, refreshKey]);

  /**
   * 비밀번호 정하기 — **쓰기는 서버만 한다.** 규칙이 이 문서의 클라이언트 쓰기를
   * 막아뒀다. 열려 있으면 아이가 자기 반 비밀번호를 바꿔놓을 수 있다.
   * 비워 두고 누르면 서버가 아이도 옮겨 칠 수 있는 값으로 만들어준다.
   */
  const saveClassPassword = async (password?: string) => {
    setPwBusy(true); setMessage('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/student-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ schoolId, classId: selectedClass, password: password ?? '' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage(json.error || '비밀번호를 정하지 못했어요.'); return; }
      setClassPassword(json.password);
      setPwInput('');
      setMessage(`학생 로그인 비밀번호를 ${password ? '바꿨어요' : '만들었어요'}.`);
    } catch {
      setMessage('비밀번호를 정하지 못했어요.');
    } finally {
      setPwBusy(false);
    }
  };

  // 코드 발급은 서버를 거친다 (역인덱스를 클라이언트가 못 만지게 하려고)
  const issueCodes = async (regenerate = false) => {
    setIssuing(true);
    const token = await auth?.currentUser?.getIdToken();
    const res = await fetch('/api/student-code', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ schoolId, classId: selectedClass, regenerate }),
    });
    const json = await res.json();
    setIssuing(false);
    setMessage(res.ok ? `학생코드 ${json.issued}개를 발급했습니다.` : json.error || '발급에 실패했습니다.');
    setRefreshKey((k) => k + 1);
  };

  // ---------- 수동: 한 명 추가 ----------
  const handleAddOne = async () => {
    const col = studentsCol();
    const name = newName.trim();
    if (!col || !name) return;
    const num = parseInt(newNumber, 10) || nextNumber;

    if (students.some((s) => s.number === num)) {
      setMessage(`${num}번은 이미 있어요. 다른 번호를 쓰거나 기존 학생을 수정하세요.`);
      return;
    }

    setSaving(true);
    await setDoc(doc(col, `student-${num}`), { number: num, name }, { merge: true });
    setStudents((prev) => [...prev, { number: num, name, classId: selectedClass }].sort((a, b) => a.number - b.number));
    setNewName('');
    setNewNumber('');
    setMessage(`${num}번 ${name} 학생을 추가했습니다.`);
    setSaving(false);
  };

  // ---------- 수동: 이름 목록 붙여넣기 ----------
  const parsedBulk = bulkText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // "1 김하늘", "1. 김하늘", "1,김하늘", "김하늘" 모두 허용
      const m = line.match(/^(\d+)\s*[.,)\s]\s*(.+)$/);
      if (m) return { number: parseInt(m[1], 10), name: m[2].trim() };
      return { number: 0, name: line };
    })
    .filter((s) => s.name);

  const handleBulkAdd = async () => {
    const col = studentsCol();
    if (!col || parsedBulk.length === 0) return;
    setSaving(true);

    let auto = nextNumber;
    const added: StudentRow[] = [];
    for (const row of parsedBulk) {
      const num = row.number > 0 ? row.number : auto++;
      await setDoc(doc(col, `student-${num}`), { number: num, name: row.name }, { merge: true });
      added.push({ number: num, name: row.name, classId: selectedClass });
    }

    setStudents((prev) => {
      const map = new Map(prev.map((s) => [s.number, s]));
      added.forEach((s) => map.set(s.number, s));
      return [...map.values()].sort((a, b) => a.number - b.number);
    });
    setBulkText('');
    setShowBulk(false);
    setMessage(`${added.length}명을 등록했습니다.`);
    setSaving(false);
  };

  // ---------- 수동: 이름 수정 / 삭제 ----------
  const handleSaveEdit = async (num: number) => {
    const col = studentsCol();
    const name = editName.trim();
    if (!col || !name) { setEditingNum(null); return; }
    await setDoc(doc(col, `student-${num}`), { number: num, name }, { merge: true });
    setStudents((prev) => prev.map((s) => (s.number === num ? { ...s, name } : s)));
    setEditingNum(null);
  };

  const handleDeleteStudent = async (num: number) => {
    const col = studentsCol();
    if (!col) return;
    await deleteDoc(doc(col, `student-${num}`));
    setStudents((prev) => prev.filter((s) => s.number !== num));
    setMessage(`${num}번 학생을 삭제했습니다.`);
  };

  // ---------- 엑셀 업로드 ----------
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !db || !user) return;
    setUploading(true);
    setMessage('');

    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<{ 번호?: number; 이름?: string; number?: number; name?: string }>(sheet);

      const studentsRef = collection(db, 'schools', schoolId, 'classes', selectedClass, 'students');
      const existingSnap = await getDocs(studentsRef);

      // 기존 문서를 지우지 않고 병합 저장한다.
      // (학생 계정 uid·학부모 연결 정보가 나중에 붙어도 재업로드로 날아가지 않도록)
      const parsed: StudentRow[] = [];
      const seenIds = new Set<string>();
      for (const row of rows) {
        const num = row['번호'] || row['number'] || 0;
        const name = row['이름'] || row['name'] || '';
        if (!name) continue;
        const docId = `student-${num}`;
        seenIds.add(docId);
        await setDoc(doc(studentsRef, docId), { number: num, name }, { merge: true });
        parsed.push({ number: num as number, name: name as string, classId: selectedClass });
      }

      // 새 명부에 없는 기존 학생은 자동 삭제하지 않고 사용자에게 알린다
      const orphans = existingSnap.docs
        .filter((d) => !seenIds.has(d.id))
        .map((d) => ({ id: d.id, name: (d.data().name as string) || d.id }));
      setOrphanStudents(orphans);

      await setDoc(
        doc(db, 'schools', schoolId, 'rosterUploads', `${selectedClass}-${Date.now()}`),
        {
          classId: selectedClass,
          uploadedBy: user.uid,
          fileName: file.name,
          rowCount: parsed.length,
          uploadedAt: serverTimestamp(),
        }
      );

      setStudents(parsed.sort((a, b) => a.number - b.number));
      setMessage(`${parsed.length}명의 학생이 등록되었습니다.`);
    } catch (err) {
      console.error(err);
      setMessage('엑셀 파일 처리 중 오류가 발생했습니다.');
    }

    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="text-sm" style={{ color: 'var(--color-text-sub)' }}>로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-24 mx-auto max-w-[720px]">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push(`/admin/${schoolId}`)}
          className="text-sm"
          style={{ color: 'var(--color-text-sub)' }}
        >
          ← 대시보드
        </button>
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-main)' }}>
          학생 명부
        </h1>
      </div>

      {/* 반 선택 */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {classes.length === 0 && (
          <div
            className="rounded-2xl px-4 py-3 text-[15px] leading-relaxed"
            style={{ background: '#EAF2FB', color: '#2F6DB5', border: '1px solid #C9DDF2' }}
          >
            ℹ️ 아직 맡은 반이 없어요. 총관리자에게 담임 배정을 요청하면
            여기에서 우리 반 명부를 관리할 수 있어요.
          </div>
        )}
        {classes.map((cls) => (
          <button
            key={cls.id}
            onClick={() => setSelectedClass(cls.id)}
            className="rounded-xl px-4 py-2 text-sm font-bold whitespace-nowrap transition-all"
            style={{
              background: selectedClass === cls.id ? 'var(--color-primary)' : 'var(--color-surface-soft)',
              color: selectedClass === cls.id ? 'white' : 'var(--color-text-sub)',
            }}
          >
            {cls.label}
          </button>
        ))}
      </div>

      {/* 등록 방법 선택 */}
      <div className="flex gap-2 mb-3">
        {([
          { key: 'manual', label: '✏️ 직접 입력' },
          { key: 'excel', label: '📄 엑셀 업로드' },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setMode(t.key)}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold transition-all"
            style={{
              background: mode === t.key ? 'var(--color-surface)' : 'transparent',
              color: mode === t.key ? 'var(--color-text-main)' : 'var(--color-text-sub)',
              border: mode === t.key ? '2px solid var(--color-primary)' : '2px solid var(--color-surface-soft)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== 직접 입력 ===== */}
      {mode === 'manual' && (
        <div className="rounded-2xl p-4 mb-4" style={{ background: 'var(--color-surface-soft)' }}>
          <div className="text-sm font-bold mb-2.5" style={{ color: 'var(--color-text-main)' }}>
            학생 추가
          </div>

          <div className="flex gap-2 mb-2">
            <input
              type="number"
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
              placeholder={String(nextNumber)}
              className="w-16 shrink-0 rounded-xl px-3 py-2.5 text-sm outline-none text-center"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
            />
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddOne(); }}
              placeholder="학생 이름 (엔터로 빠르게 추가)"
              className="flex-1 min-w-0 rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
            />
            <button
              onClick={handleAddOne}
              disabled={!newName.trim() || saving}
              className="shrink-0 rounded-xl px-4 text-sm font-bold text-white disabled:opacity-40"
              style={{ background: 'var(--color-primary)' }}
            >
              추가
            </button>
          </div>
          <p className="text-[12px] mb-3" style={{ color: 'var(--color-text-sub)' }}>
            번호를 비우면 {nextNumber}번으로 자동 지정돼요
          </p>

          {/* 여러 명 붙여넣기 */}
          <button
            onClick={() => setShowBulk((v) => !v)}
            className="w-full rounded-xl py-2.5 text-sm font-bold"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
          >
            {showBulk ? '▲ 접기' : '📋 여러 명 한 번에 붙여넣기'}
          </button>

          {showBulk && (
            <div className="mt-2.5">
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={6}
                placeholder={'한 줄에 한 명씩 붙여넣으세요\n\n김하늘\n이서준\n박지우\n\n번호를 같이 써도 돼요:\n1 김하늘\n2. 이서준\n3, 박지우'}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
                style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
              />
              {parsedBulk.length > 0 && (
                <div className="text-[13px] mt-1.5 mb-2 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
                  {parsedBulk.length}명 인식됨 ·{' '}
                  {parsedBulk.slice(0, 5).map((p) => p.name).join(', ')}
                  {parsedBulk.length > 5 ? ` 외 ${parsedBulk.length - 5}명` : ''}
                </div>
              )}
              <button
                onClick={handleBulkAdd}
                disabled={parsedBulk.length === 0 || saving}
                className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40"
                style={{ background: 'var(--color-primary)' }}
              >
                {saving ? '등록 중...' : `${parsedBulk.length}명 등록하기`}
              </button>
            </div>
          )}

          {message && (
            <div
              className="text-sm font-bold mt-2.5"
              style={{ color: message.includes('오류') || message.includes('이미') ? '#E8604C' : 'var(--color-primary)' }}
            >
              {message}
            </div>
          )}
        </div>
      )}

      {/* ===== 엑셀 업로드 ===== */}
      {mode === 'excel' && (
        <div className="rounded-2xl p-4 mb-4" style={{ background: 'var(--color-surface-soft)' }}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>
                엑셀로 명부 등록
              </div>
              <div className="text-[12px]" style={{ color: 'var(--color-text-sub)' }}>
                &ldquo;번호&rdquo;, &ldquo;이름&rdquo; 컬럼이 포함된 엑셀 파일
              </div>
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="rounded-xl px-4 py-2 text-sm font-bold text-white"
              style={{ background: 'var(--color-primary)' }}
            >
              {uploading ? '처리 중...' : '파일 선택'}
            </button>
          </div>
          {message && (
            <div className="text-sm font-bold mt-2" style={{ color: message.includes('오류') ? '#FF6B6B' : 'var(--color-primary)' }}>
              {message}
            </div>
          )}

          {/* 새 명부에 없는 기존 학생 — 자동 삭제하지 않고 확인받는다 */}
          {orphanStudents.length > 0 && (
            <div className="mt-3 rounded-xl p-3.5 text-left" style={{ background: '#FFF6E5', border: '1px solid #F0D9A8' }}>
              <div className="text-sm font-bold mb-1" style={{ color: '#8A6D2F' }}>
                ⚠️ 새 명부에 없는 학생 {orphanStudents.length}명
              </div>
              <div className="text-[13px] mb-2.5 leading-relaxed" style={{ color: '#A08A5B' }}>
                {orphanStudents.map((o) => o.name).join(', ')}
                <br />
                전학·오타일 수 있어 자동으로 지우지 않았어요. 확인 후 삭제하세요.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleDeleteOrphans}
                  className="rounded-lg px-3 py-1.5 text-[13px] font-bold text-white"
                  style={{ background: '#E8604C' }}
                >
                  명단에서 삭제
                </button>
                <button
                  onClick={() => setOrphanStudents([])}
                  className="rounded-lg px-3 py-1.5 text-[13px] font-bold"
                  style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
                >
                  그대로 두기
                </button>
              </div>
            </div>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelUpload} />
        </div>
      )}

      {/* 학생 목록 */}
      {students.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">📋</div>
          <div className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
            등록된 학생이 없습니다
          </div>
          <div className="text-[13px] mt-1" style={{ color: 'var(--color-text-sub)' }}>
            위에서 직접 입력하거나 엑셀로 등록해보세요
          </div>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface-soft)' }}>
          {/*
            학생 로그인 — 아이는 **이름 + 이 비밀번호**로 들어온다.
            학생코드(가입 연결)와 다른 것이다: 코드는 계정을 반에 잇는 것이고,
            이건 계정 자체가 없는 아이가 들어오는 길이다.
          */}
          <div className="px-4 py-3" style={{ background: '#FFF3E0', borderBottom: '1px solid var(--color-surface)' }}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="text-sm font-bold" style={{ color: '#A6762A' }}>
                🎒 학생 로그인 비밀번호
              </div>
              {classPassword ? (
                <div
                  className="rounded-lg px-3 py-1.5 text-[15px] font-black tracking-wide"
                  style={{ background: 'white', color: '#A6762A' }}
                >
                  {classPassword}
                </div>
              ) : (
                <button
                  onClick={() => saveClassPassword()}
                  disabled={pwBusy}
                  className="rounded-lg px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-50"
                  style={{ background: '#E8A33C' }}
                >
                  {pwBusy ? '만드는 중...' : '비밀번호 만들기'}
                </button>
              )}
            </div>
            {classPassword && (
              <div className="flex gap-1.5 mb-1.5">
                <input
                  value={pwInput}
                  onChange={(e) => setPwInput(e.target.value)}
                  placeholder="새 비밀번호로 바꾸기"
                  className="flex-1 min-w-0 rounded-lg px-3 py-1.5 text-[13px] outline-none"
                  style={{ background: 'white', color: 'var(--color-text-main)' }}
                />
                <button
                  onClick={() => saveClassPassword(pwInput.trim())}
                  disabled={pwBusy || pwInput.trim().length < 4}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-40"
                  style={{ background: '#E8A33C' }}
                >
                  바꾸기
                </button>
              </div>
            )}
            <div className="text-[12px] leading-relaxed" style={{ color: '#9A7C4A' }}>
              반 전체가 <b>같은 비밀번호</b>를 씁니다. 칠판에 적어두세요.
              아이는 <b>자기 이름</b>과 이 비밀번호로 들어옵니다 — 계정을 따로 만들지 않아요.
              <b> 아이가 다른 곳에서 쓰는 비밀번호는 넣지 마세요.</b>
            </div>
          </div>

          {/* 학생코드 안내 + 발급 */}
          <div className="px-4 py-3" style={{ background: '#EAF4FF', borderBottom: '1px solid var(--color-surface)' }}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="text-sm font-bold" style={{ color: '#2E6DA4' }}>
                🔑 학생코드 {students.filter((s) => s.code).length}/{students.length}
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => issueCodes(false)}
                  disabled={issuing}
                  className="rounded-lg px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-50"
                  style={{ background: '#4A90D9' }}
                >
                  {issuing ? '발급 중...' : '코드 발급'}
                </button>
                {students.some((s) => s.code) && (
                  <button
                    onClick={() => issueCodes(true)}
                    disabled={issuing}
                    className="rounded-lg px-3 py-1.5 text-[13px] font-bold disabled:opacity-50"
                    style={{ background: 'white', color: '#E8604C' }}
                  >
                    전체 재발급
                  </button>
                )}
              </div>
            </div>
            <div className="text-[12px] leading-relaxed" style={{ color: '#5B8CB8' }}>
              학생은 가입 절차 없이 이 코드만 입력하면 우리 반에 들어옵니다.
              학부모가 같은 코드를 넣으면 자녀와 연결돼요. 재발급하면 이전 코드는 즉시 무효가 됩니다.
            </div>
          </div>

          <div
            className="flex px-4 py-2.5 text-[12px] font-bold"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text-sub)' }}
          >
            <div className="w-10">번호</div>
            <div className="flex-1">이름</div>
            <div className="w-24">코드</div>
            <div className="w-16 text-right">관리</div>
          </div>
          {/*
            동명이인이 있으면 아이가 칠 이름이 달라진다(김민준A). 선생님이 그걸
            모르면 아이는 자기 이름을 정확히 치고도 못 들어간다 — 그래서 여기 적어준다.
            한 명뿐인 이름에는 아무것도 안 붙으므로 대부분의 반에는 이 줄이 안 뜬다.
          */}
          {Object.keys(loginNames).length > 0 && (
            <div
              className="px-4 py-2 text-[12px] leading-relaxed border-t"
              style={{ background: '#FFF8E7', borderColor: 'var(--color-surface)', color: '#8A6D2F' }}
            >
              이름이 같은 친구가 있어요. 이 아이들은 <b>이름 뒤에 글자를 붙여</b> 들어옵니다 —{' '}
              {Object.entries(loginNames).map(([n, v]) => `${n} → ${v.join(', ')}`).join(' · ')}
            </div>
          )}
          {students.map((s) => (
            <div
              key={s.number}
              className="flex items-center px-4 py-2.5 border-t text-sm"
              style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-main)' }}
            >
              <div className="w-10 text-sm font-bold" style={{ color: 'var(--color-text-sub)' }}>
                {s.number}
              </div>
              <div className="flex-1 min-w-0">
                {editingNum === s.number ? (
                  <input
                    type="text"
                    value={editName}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => handleSaveEdit(s.number)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSaveEdit(s.number);
                      if (e.key === 'Escape') setEditingNum(null);
                    }}
                    className="w-full rounded-lg px-2 py-1 text-sm outline-none"
                    style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
                  />
                ) : (
                  <span className="font-medium">{s.name}</span>
                )}
              </div>
              <div className="w-24">
                {s.code ? (
                  <div className="flex items-center gap-1">
                    <span
                      className="rounded-md px-1.5 py-0.5 text-[13px] font-mono font-bold tracking-wider"
                      style={{ background: '#EAF4FF', color: '#2E6DA4' }}
                    >
                      {s.code}
                    </span>
                    {s.linkedUid && <span title="계정 연결됨">✅</span>}
                  </div>
                ) : (
                  <span className="text-[12px]" style={{ color: 'var(--color-text-sub)' }}>미발급</span>
                )}
              </div>
              <div className="w-16 flex justify-end gap-1">
                <button
                  onClick={() => { setEditingNum(s.number); setEditName(s.name); }}
                  className="w-7 h-7 rounded-lg text-[13px]"
                  style={{ background: 'var(--color-surface)', color: 'var(--color-text-sub)' }}
                  title="이름 수정"
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleDeleteStudent(s.number)}
                  className="w-7 h-7 rounded-lg text-[13px]"
                  style={{ background: 'var(--color-surface)', color: '#E8604C' }}
                  title="삭제"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          <div
            className="px-4 py-2.5 text-[12px] border-t text-right"
            style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-sub)' }}
          >
            총 {students.length}명
          </div>
        </div>
      )}
    </div>
  );
}
