'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, doc, setDoc, deleteDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { canAccessAdmin } from '@/lib/auth-helpers';

const SCHOOL_ID = 'aewol-elementary';

interface StudentRow {
  number: number;
  name: string;
  classId: string;
}

export default function RosterPage() {
  const router = useRouter();
  const { user, role, loading } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedClass, setSelectedClass] = useState('3-1');
  const [classes, setClasses] = useState<{ id: string; label: string }[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!loading && (!user || !canAccessAdmin(role))) {
      router.replace('/school');
      return;
    }

    async function fetchClasses() {
      if (!db) return;
      const snap = await getDocs(
        query(collection(db, 'schools', SCHOOL_ID, 'classes'), where('isArchived', '==', false))
      );
      const list = snap.docs
        .map((d) => ({ id: d.id, label: `${d.data().grade}-${d.data().classNumber}반` }))
        .sort((a, b) => a.id.localeCompare(b.id));
      setClasses(list);
    }

    if (!loading && user) fetchClasses();
  }, [user, role, loading, router]);

  useEffect(() => {
    async function fetchStudents() {
      if (!db) return;
      const snap = await getDocs(
        collection(db, 'schools', SCHOOL_ID, 'classes', selectedClass, 'students')
      );
      const list = snap.docs
        .map((d) => ({ number: d.data().number || 0, name: d.data().name || '', classId: selectedClass }))
        .sort((a, b) => a.number - b.number);
      setStudents(list);
    }
    fetchStudents();
  }, [selectedClass]);

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

      const studentsRef = collection(db, 'schools', SCHOOL_ID, 'classes', selectedClass, 'students');
      const existingSnap = await getDocs(studentsRef);
      for (const d of existingSnap.docs) {
        await deleteDoc(d.ref);
      }

      const parsed: StudentRow[] = [];
      for (const row of rows) {
        const num = row['번호'] || row['number'] || 0;
        const name = row['이름'] || row['name'] || '';
        if (!name) continue;
        await setDoc(doc(studentsRef, `student-${num}`), { number: num, name });
        parsed.push({ number: num as number, name: name as string, classId: selectedClass });
      }

      await setDoc(
        doc(db, 'schools', SCHOOL_ID, 'rosterUploads', `${selectedClass}-${Date.now()}`),
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-sm" style={{ color: 'var(--color-text-sub)' }}>로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/admin')}
          className="text-xs"
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

      {/* 엑셀 업로드 */}
      <div className="rounded-2xl p-4 mb-4" style={{ background: 'var(--color-surface-soft)' }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>
              엑셀로 명부 등록
            </div>
            <div className="text-[10px]" style={{ color: 'var(--color-text-sub)' }}>
              &ldquo;번호&rdquo;, &ldquo;이름&rdquo; 컬럼이 포함된 엑셀 파일
            </div>
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="rounded-xl px-4 py-2 text-xs font-bold text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            {uploading ? '처리 중...' : '파일 선택'}
          </button>
        </div>
        {message && (
          <div className="text-xs font-bold mt-2" style={{ color: message.includes('오류') ? '#FF6B6B' : 'var(--color-primary)' }}>
            {message}
          </div>
        )}
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelUpload} />
      </div>

      {/* 학생 목록 */}
      {students.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">📋</div>
          <div className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
            등록된 학생이 없습니다
          </div>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface-soft)' }}>
          <div
            className="flex px-4 py-2.5 text-[10px] font-bold"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text-sub)' }}
          >
            <div className="w-12">번호</div>
            <div className="flex-1">이름</div>
          </div>
          {students.map((s, i) => (
            <div
              key={i}
              className="flex items-center px-4 py-3 border-t text-sm"
              style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-main)' }}
            >
              <div className="w-12 text-xs font-bold" style={{ color: 'var(--color-text-sub)' }}>
                {s.number}
              </div>
              <div className="flex-1 font-medium">{s.name}</div>
            </div>
          ))}
          <div
            className="px-4 py-2.5 text-[10px] border-t text-right"
            style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-sub)' }}
          >
            총 {students.length}명
          </div>
        </div>
      )}
    </div>
  );
}
