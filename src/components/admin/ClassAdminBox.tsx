'use client';

import { useState } from 'react';
import { collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * 총관리자만 쓰는 반 손보기 상자.
 *
 * **기본은 '보관' 이다.** 반을 지우면 그 안의 작품·숙제·명부가 딸려 사라지고
 * 되돌릴 수 없다. 보관은 목록에서 감출 뿐 자료를 남긴다(기억창고와 같은 방식).
 *
 * 그래도 지우기를 막지는 않는다 — 시범 운영 중에는 잘못 만든 반을 치워야 한다.
 * 대신 **무엇이 몇 개 사라지는지 세어서 보여준 뒤** 확인을 받는다.
 * 숫자를 보고 누르는 것과 모르고 누르는 것은 다르다.
 */
export default function ClassAdminBox({
  schoolId, classId, grade, classNumber, displayName, kind, onChanged,
}: {
  schoolId: string;
  classId: string;
  grade: string;
  classNumber: number;
  /** 전시관에서 '반' 대신 보여줄 전시 주제 */
  displayName?: string;
  kind: 'school' | 'gallery';
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [g, setG] = useState(grade);
  const [n, setN] = useState(String(classNumber));
  const [title, setTitle] = useState(displayName || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  /** 지우기 전에 센 것들. null 이면 아직 안 셌다. */
  const [counts, setCounts] = useState<{ students: number; activities: number; artworks: number } | null>(null);

  const base = `schools/${schoolId}/classes/${classId}`;

  const rename = async () => {
    if (!db) return;
    const num = Number(n);
    if (!g.trim() || !Number.isInteger(num) || num < 1) {
      setErr('학년과 반 번호를 확인해주세요.');
      return;
    }
    setBusy(true); setErr('');
    try {
      /*
        전시 주제는 빈 문자열로 지울 수 있어야 한다 — 지우면 다시 '3-1' 로 보인다.
        학년·반 번호는 늘 같이 저장한다(경로도 규칙도 이걸 쓴다).
      */
      await updateDoc(doc(db, base), {
        grade: g.trim(),
        classNumber: num,
        displayName: title.trim().slice(0, 20),
      });
      onChanged();
    } catch {
      setErr('고치지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!db) return;
    setBusy(true); setErr('');
    try {
      await updateDoc(doc(db, base), { isArchived: true });
      onChanged();
    } catch {
      setErr('보관하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  /** 무엇이 딸려 사라지는지 센다. 세는 것만으로는 아무것도 안 지운다. */
  const countAll = async () => {
    if (!db) return;
    setBusy(true); setErr('');
    try {
      const [st, act] = await Promise.all([
        getDocs(collection(db, `${base}/students`)),
        getDocs(collection(db, `${base}/activities`)),
      ]);
      let artworks = 0;
      for (const a of act.docs) {
        const arts = await getDocs(collection(db, `${base}/activities/${a.id}/artworks`));
        artworks += arts.size;
      }
      setCounts({ students: st.size, activities: act.size, artworks });
    } catch {
      setErr('세지 못했어요. 그냥 지우지 말고 다시 눌러주세요.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * 반 문서를 지운다.
   *
   * 하위 문서는 Firestore 가 알아서 지워주지 않는다 — 그래서 **화면에는 남지
   * 않지만 자료는 남는다.** 그게 오히려 안전하다(되살릴 여지가 있다).
   * 정말 싹 지우는 건 서버에서 할 일이라 여기서 하지 않는다.
   */
  const remove = async () => {
    if (!db || !counts) return;
    setBusy(true); setErr('');
    try {
      await deleteDoc(doc(db, base));
      onChanged();
    } catch {
      setErr('지우지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl py-2 text-[13px] font-bold"
        style={{ background: 'var(--color-surface)', color: 'var(--color-text-sub)' }}
      >
        ⚙️ 반 손보기 (총관리자)
      </button>
    );
  }

  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--color-surface)' }}>
      <div className="text-[13px] font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>
        ⚙️ 반 손보기
      </div>

      {/* 이름 바꾸기 */}
      <div className="flex gap-1.5 mb-2">
        <input
          value={g}
          onChange={(e) => setG(e.target.value)}
          className="w-16 min-w-0 rounded-lg px-2 py-2 text-[14px] outline-none"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
        />
        <span className="self-center text-[13px]" style={{ color: 'var(--color-text-sub)' }}>학년</span>
        <input
          value={n}
          onChange={(e) => setN(e.target.value)}
          inputMode="numeric"
          className="w-14 min-w-0 rounded-lg px-2 py-2 text-[14px] outline-none"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
        />
        <span className="self-center text-[13px]" style={{ color: 'var(--color-text-sub)' }}>반</span>
        <button
          onClick={rename}
          disabled={busy}
          className="ml-auto shrink-0 rounded-lg px-3 text-[13px] font-bold text-white disabled:opacity-40"
          style={{ background: 'var(--color-primary)' }}
        >
          바꾸기
        </button>
      </div>

      {/* 전시관일 때만 — 반 대신 보여줄 주제 */}
      {kind === 'gallery' && (
        <div className="mb-2">
          <label className="block text-[12px] font-bold mb-1" style={{ color: 'var(--color-text-sub)' }}>
            전시 주제 (배너에 걸려요)
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={20}
            placeholder="예: 제주도, 이태리"
            className="w-full rounded-lg px-3 py-2 text-[14px] outline-none"
            style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
          />
          <p className="text-[12px] mt-1" style={{ color: 'var(--color-text-sub)' }}>
            위 &lsquo;바꾸기&rsquo;를 눌러야 저장돼요. 비우면 {grade}-{classNumber} 로 보여요.
          </p>
        </div>
      )}

      {/* 보관 — 권하는 쪽 */}
      <button
        onClick={archive}
        disabled={busy}
        className="w-full rounded-lg py-2 mb-1.5 text-[13px] font-bold disabled:opacity-40"
        style={{ background: '#FFF1D6', color: '#A6762A' }}
      >
        📦 보관하기 (목록에서 감춤 · 자료는 남아요)
      </button>

      {/* 지우기 — 숫자를 본 뒤에만 */}
      {!counts ? (
        <button
          onClick={countAll}
          disabled={busy}
          className="w-full rounded-lg py-2 text-[13px] font-bold disabled:opacity-40"
          style={{ background: 'transparent', color: '#C0392B', border: '1px solid #F0C4BE' }}
        >
          {busy ? '세는 중...' : '🗑️ 지우기 — 먼저 무엇이 사라지는지 보기'}
        </button>
      ) : (
        <div className="rounded-lg p-2.5" style={{ background: '#FDECEA' }}>
          <div className="text-[13px] font-bold mb-1" style={{ color: '#B02A37' }}>
            지우면 이 반이 목록에서 사라져요
          </div>
          <div className="text-[12px] mb-2 leading-relaxed" style={{ color: '#B02A37' }}>
            아이 {counts.students}명 · 전시실 {counts.activities}개 · 작품 {counts.artworks}점이
            딸려 있어요. 되돌릴 수 없어요.
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setCounts(null)}
              className="flex-1 rounded-lg py-2 text-[13px] font-bold"
              style={{ background: 'white', color: 'var(--color-text-sub)' }}
            >
              그만두기
            </button>
            <button
              onClick={remove}
              disabled={busy}
              className="flex-1 rounded-lg py-2 text-[13px] font-bold text-white disabled:opacity-40"
              style={{ background: '#C0392B' }}
            >
              {busy ? '지우는 중...' : '정말 지우기'}
            </button>
          </div>
        </div>
      )}

      {err && <div className="text-[12px] font-bold mt-2" style={{ color: '#C0392B' }}>⚠️ {err}</div>}

      <button
        onClick={() => { setOpen(false); setCounts(null); setErr(''); }}
        className="w-full mt-2 text-[12px] underline"
        style={{ color: 'var(--color-text-sub)' }}
      >
        접기
      </button>
    </div>
  );
}
