'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc,
  serverTimestamp, getDocs, where,
} from 'firebase/firestore';
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { canManageClass } from '@/lib/auth-helpers';
import { SubmitType, HomeworkVisibility } from '@/lib/firestore-schema';
import { nudgesPath } from '@/lib/paths';
import DrawingPad from './DrawingPad';
import HomeworkTeacherGrid from './HomeworkTeacherGrid';


interface Homework {
  id: string;
  title: string;
  description: string;
  submitType: SubmitType;
  visibility: HomeworkVisibility;
  authorName: string;
  createdAt: Date | null;
}

interface Submission {
  id: string;
  studentUid: string;
  studentName: string;
  type: SubmitType;
  text: string;
  imageUrl: string;
  status: 'approved' | 'held';
  moderation: { flagged: boolean; reason: string } | null;
  teacherComment: string;
  stamp: { itemId: string; emoji: string; label: string } | null;
}

const TYPE_LABEL: Record<SubmitType, string> = {
  text: '✍️ 글쓰기',
  drawing: '🖌️ 손글씨·그리기',
  image: '📷 사진 올리기',
};

export default function HomeworkPanel({ schoolId, classId }: { schoolId: string; classId: string }) {
  const { user, userDoc, role } = useAuth();
  const isStaff = canManageClass(role);
  const basePath = `schools/${schoolId}/classes/${classId}/homeworks`;

  const [list, setList] = useState<Homework[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);

  // 출제
  const [writing, setWriting] = useState(false);
  const [wTitle, setWTitle] = useState('');
  const [wDesc, setWDesc] = useState('');
  const [wType, setWType] = useState<SubmitType>('text');
  const [wVis, setWVis] = useState<HomeworkVisibility>('class');
  const [saving, setSaving] = useState(false);

  // 제출
  const [subText, setSubText] = useState('');
  const [subFile, setSubFile] = useState<File | null>(null);
  const [subPreview, setSubPreview] = useState('');
  const [drawBlob, setDrawBlob] = useState<Blob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');
  const [myNudge, setMyNudge] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const open = list.find((h) => h.id === openId) || null;
  const mySub = subs.find((s) => s.studentUid === user?.uid) || null;

  useEffect(() => {
    if (!db) return;
    return onSnapshot(query(collection(db, basePath), orderBy('createdAt', 'desc')), (snap) => {
      setList(
        snap.docs.map((d) => {
          const v = d.data();
          return {
            id: d.id,
            title: v.title || '',
            description: v.description || '',
            submitType: v.submitType || 'text',
            visibility: v.visibility || 'class',
            authorName: v.authorName || '선생님',
            createdAt: v.createdAt?.toDate?.() ?? null,
          };
        })
      );
    }, () => setList([]));
  }, [basePath]);

  // 열린 숙제의 제출물 (학생·학부모용). 교직원 화면은 HomeworkTeacherGrid 가 직접 구독한다.
  useEffect(() => {
    if (!db || !openId || isStaff) { setSubs([]); return; }
    const col = collection(db, basePath, openId, 'submissions');
    const unsub = onSnapshot(query(col, where('publicToClass', '==', true)), (snap) => {
      setSubs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Submission, 'id'>) })));
    }, () => setSubs([]));
    // 본인 제출물은 공개 여부와 무관하게 보여야 한다
    if (user) {
      getDocs(query(col, where('studentUid', '==', user.uid)))
        .then((s) => {
          if (s.empty) return;
          const mine = { id: s.docs[0].id, ...(s.docs[0].data() as Omit<Submission, 'id'>) };
          setSubs((prev) => (prev.some((p) => p.id === mine.id) ? prev : [...prev, mine]));
        })
        .catch(() => {});
    }
    return () => unsub();
  }, [openId, basePath, isStaff, user]);

  // 선생님이 나를 콕 찔렀는지 (찔린 본인만 읽을 수 있다)
  useEffect(() => {
    if (!db || !openId || isStaff || !user) { setMyNudge(0); return; }
    return onSnapshot(
      doc(db, nudgesPath(schoolId, classId, openId), user.uid),
      (snap) => setMyNudge(snap.exists() ? (snap.data().count ?? 0) : 0),
      () => setMyNudge(0)
    );
  }, [openId, isStaff, user, schoolId, classId]);

  const createHomework = useCallback(async () => {
    if (!db || !user || !userDoc || !wTitle.trim()) return;
    setSaving(true);
    await addDoc(collection(db, basePath), {
      title: wTitle.trim(),
      description: wDesc.trim(),
      submitType: wType,
      visibility: wVis,
      dueDate: null,
      authorUid: user.uid,
      authorName: userDoc.displayName || '선생님',
      createdAt: serverTimestamp(),
    });
    setWTitle(''); setWDesc(''); setWriting(false); setSaving(false);
  }, [wTitle, wDesc, wType, wVis, user, userDoc, basePath]);

  const removeHomework = useCallback(async (id: string) => {
    if (!db) return;
    const s = await getDocs(collection(db, basePath, id, 'submissions'));
    await Promise.all(s.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(doc(db, basePath, id));
    setOpenId(null);
  }, [basePath]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setSubFile(f);
    setSubPreview(URL.createObjectURL(f));
  };

  const submit = useCallback(async () => {
    if (!open || !user || !storage) return;
    setSubmitting(true);
    setSubmitMsg('');

    let imageUrl = '';
    const blob: Blob | null = open.submitType === 'drawing' ? drawBlob : subFile;
    if (blob) {
      const ext = open.submitType === 'drawing' ? 'png' : (subFile?.name.split('.').pop() || 'jpg');
      const path = `homework/${user.uid}/${open.id}.${ext}`;
      const r = sRef(storage, path);
      await uploadBytes(r, blob);
      imageUrl = await getDownloadURL(r);
    }

    const token = await auth?.currentUser?.getIdToken();
    const res = await fetch('/api/homework', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ schoolId, classId, homeworkId: open.id, text: subText.trim(), imageUrl }),
    });
    const json = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setSubmitMsg(json.error || '제출에 실패했어요');
      return;
    }
    setSubmitMsg(
      json.held
        ? '제출했어요! 확인이 필요한 부분이 있어 선생님이 먼저 살펴본 뒤 공개돼요.'
        : '제출 완료! 잘했어요 🎉'
    );
    setSubText(''); setSubFile(null); setSubPreview(''); setDrawBlob(null);
  }, [open, user, subText, subFile, drawBlob, schoolId, classId]);

  // ---------- 숙제 상세 ----------
  if (open) {
    const shown = subs.filter((s) => s.status === 'approved');
    return (
      <div>
        <button onClick={() => setOpenId(null)} className="text-[11px] font-bold mb-2.5" style={{ color: '#8A7A5F' }}>
          ← 숙제 목록
        </button>

        <div className="rounded-2xl p-4 mb-3" style={{ background: 'rgba(255,255,255,0.8)' }}>
          <div className="flex items-start justify-between gap-2">
            <div className="text-base font-black" style={{ color: '#3A3226' }}>{open.title}</div>
            {isStaff && (
              <button
                onClick={() => removeHomework(open.id)}
                className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold"
                style={{ background: 'rgba(232,96,76,0.15)', color: '#E8604C' }}
              >
                삭제
              </button>
            )}
          </div>
          <div className="flex gap-1.5 mt-1.5 mb-2">
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: '#4A90D920', color: '#4A90D9' }}>
              {TYPE_LABEL[open.submitType]}
            </span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: '#8A7A5F20', color: '#8A7A5F' }}>
              {open.visibility === 'class' ? '👀 친구들과 함께 보기' : '🔒 선생님만 보기'}
            </span>
          </div>
          {open.description && (
            <div className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: '#54493A' }}>
              {open.description}
            </div>
          )}
        </div>

        {/* 교사 — 명부 기반 현황판 */}
        {isStaff && (
          <HomeworkTeacherGrid
            schoolId={schoolId}
            classId={classId}
            homeworkId={open.id}
            submitType={open.submitType}
            visibility={open.visibility}
          />
        )}

        {/* 학생 제출 */}
        {!isStaff && user && (
          <div className="rounded-2xl p-4 mb-3" style={{ background: 'rgba(255,255,255,0.8)' }}>
            <div className="text-xs font-black mb-2" style={{ color: '#3A3226' }}>
              {mySub ? '📮 다시 제출하기' : '📮 내 숙제 제출하기'}
            </div>

            {myNudge > 0 && !mySub && (
              <div
                className="rounded-xl px-3 py-2 mb-2.5 text-[12px] font-bold"
                style={{ background: '#FFF1D6', color: '#A6762A', border: '1px solid #F0D9A8' }}
              >
                👉 선생님이 콕 찔렀어요! 숙제를 내볼까요?
              </div>
            )}

            {open.submitType === 'text' && (
              <textarea
                value={subText}
                onChange={(e) => setSubText(e.target.value)}
                rows={5}
                placeholder="여기에 숙제를 써보세요"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none mb-2"
                style={{ background: 'white', color: '#3A3226' }}
              />
            )}

            {open.submitType === 'drawing' && (
              <div className="mb-2">
                <DrawingPad onChange={setDrawBlob} />
              </div>
            )}

            {open.submitType === 'image' && (
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full aspect-[4/3] rounded-xl mb-2 flex flex-col items-center justify-center gap-1.5 border-2 border-dashed overflow-hidden"
                  style={{ borderColor: '#D8C9AC', background: 'white' }}
                >
                  {subPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={subPreview} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <>
                      <span className="text-3xl">📷</span>
                      <span className="text-[11px]" style={{ color: '#A89880' }}>사진 고르기</span>
                    </>
                  )}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
              </>
            )}

            <button
              onClick={submit}
              disabled={submitting || (!subText.trim() && !subFile && !drawBlob)}
              className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40"
              style={{ background: 'var(--color-primary)' }}
            >
              {submitting ? '제출 중...' : '제출하기'}
            </button>

            {submitMsg && (
              <div className="text-[11px] mt-2 leading-relaxed" style={{ color: submitMsg.includes('실패') ? '#C0392B' : '#2E9E56' }}>
                {submitMsg}
              </div>
            )}

            {mySub && (
              <div className="mt-3 pt-3" style={{ borderTop: '1px dashed #E6DCC8' }}>
                <div className="text-[11px] font-bold mb-1" style={{ color: '#8A7A5F' }}>내 제출물</div>
                {mySub.status === 'held' && (
                  <div className="text-[11px] mb-1.5" style={{ color: '#E8A33C' }}>
                    ⏳ 선생님 확인을 기다리는 중이에요
                  </div>
                )}
                {mySub.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mySub.imageUrl} alt="" className="w-full rounded-lg mb-1" />
                )}
                {mySub.text && (
                  <div className="text-[12px] whitespace-pre-wrap" style={{ color: '#54493A' }}>{mySub.text}</div>
                )}
                {mySub.stamp && (
                  <div
                    className="mt-2 rounded-xl px-3 py-2.5 text-center"
                    style={{ background: '#E2F6E9', border: '1px solid #A0DCB7' }}
                  >
                    <div className="text-2xl leading-none mb-1">{mySub.stamp.emoji}</div>
                    <div className="text-[12px] font-bold" style={{ color: '#2E8B57' }}>
                      {mySub.stamp.label}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: '#5FA87C' }}>
                      선생님이 도장을 찍어주셨어요 🏅
                    </div>
                  </div>
                )}
                {mySub.teacherComment && (
                  <div className="mt-2 rounded-xl px-3 py-2 text-[12px]" style={{ background: '#FFF3E0', color: '#8A6D2F' }}>
                    👩‍🏫 {mySub.teacherComment}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 친구들 것 모아보기 (교사는 위 현황판에서 본다) */}
        {!isStaff && (
          <>
            <div className="text-[11px] font-bold mb-2" style={{ color: '#8A7A5F' }}>
              📋 친구들 숙제 {shown.length}건
            </div>
            {shown.length === 0 ? (
              <div className="py-8 text-center text-[11px]" style={{ color: '#A89880' }}>
                {open.visibility === 'teacher'
                  ? '선생님만 볼 수 있는 숙제예요'
                  : '아직 제출한 친구가 없어요'}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {shown.map((s) => (
                  <SubmissionCard key={s.id} sub={s} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ---------- 출제 폼 ----------
  if (writing) {
    return (
      <div>
        <div className="text-sm font-black mb-3" style={{ color: '#3A3226' }}>📝 숙제 내기</div>
        <input
          value={wTitle}
          onChange={(e) => setWTitle(e.target.value)}
          placeholder="숙제 제목 (예: 봄에 본 것 그리기)"
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none mb-2"
          style={{ background: 'rgba(255,255,255,0.9)', color: '#3A3226' }}
        />
        <textarea
          value={wDesc}
          onChange={(e) => setWDesc(e.target.value)}
          rows={3}
          placeholder="설명"
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none mb-3"
          style={{ background: 'rgba(255,255,255,0.9)', color: '#3A3226' }}
        />

        <div className="text-[11px] font-bold mb-1.5" style={{ color: '#8A7A5F' }}>어떻게 제출하나요?</div>
        <div className="flex flex-col gap-1.5 mb-3">
          {(Object.keys(TYPE_LABEL) as SubmitType[]).map((t) => (
            <button
              key={t}
              onClick={() => setWType(t)}
              className="rounded-xl py-2.5 text-xs font-bold"
              style={{
                background: wType === t ? '#4A90D9' : 'rgba(255,255,255,0.85)',
                color: wType === t ? 'white' : '#8A7A5F',
              }}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        <div className="text-[11px] font-bold mb-1.5" style={{ color: '#8A7A5F' }}>누가 볼 수 있나요?</div>
        <div className="flex gap-1.5 mb-4">
          {([
            { v: 'class' as const, label: '👀 아이들과 함께 보기' },
            { v: 'teacher' as const, label: '🔒 선생님만 보기' },
          ]).map((o) => (
            <button
              key={o.v}
              onClick={() => setWVis(o.v)}
              className="flex-1 rounded-xl py-2.5 text-[11px] font-bold"
              style={{
                background: wVis === o.v ? 'var(--color-primary)' : 'rgba(255,255,255,0.85)',
                color: wVis === o.v ? 'white' : '#8A7A5F',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setWriting(false)}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold"
            style={{ background: 'rgba(255,255,255,0.7)', color: '#8A7A5F' }}
          >
            취소
          </button>
          <button
            onClick={createHomework}
            disabled={!wTitle.trim() || saving}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40"
            style={{ background: '#4A90D9' }}
          >
            {saving ? '내는 중...' : '숙제 내기'}
          </button>
        </div>
      </div>
    );
  }

  // ---------- 숙제 목록 ----------
  return (
    <>
      {isStaff && (
        <button
          onClick={() => setWriting(true)}
          className="w-full rounded-2xl py-3 mb-3 text-xs font-bold border-2 border-dashed"
          style={{ borderColor: '#4A90D980', color: '#4A90D9' }}
        >
          + 새 숙제 내기
        </button>
      )}
      {list.length === 0 ? (
        <div className="py-10 text-center">
          <div className="text-4xl mb-2">📝</div>
          <div className="text-xs" style={{ color: '#A89880' }}>아직 나온 숙제가 없어요</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((h) => (
            <button
              key={h.id}
              onClick={() => setOpenId(h.id)}
              className="rounded-2xl p-3.5 text-left transition-transform hover:scale-[1.01]"
              style={{ background: 'rgba(255,255,255,0.8)' }}
            >
              <div className="text-sm font-bold" style={{ color: '#3A3226' }}>{h.title}</div>
              <div className="flex gap-1.5 mt-1">
                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: '#4A90D920', color: '#4A90D9' }}>
                  {TYPE_LABEL[h.submitType]}
                </span>
                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: '#8A7A5F20', color: '#8A7A5F' }}>
                  {h.visibility === 'class' ? '함께 보기' : '선생님만'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ---------- 제출물 카드 (학생이 친구들 것을 볼 때) ----------
function SubmissionCard({ sub }: { sub: Submission }) {
  return (
    <div className="rounded-2xl p-2.5 mb-1.5" style={{ background: 'white', border: '1px solid #EFE3CB' }}>
      <div className="text-[11px] font-bold mb-1" style={{ color: '#3A3226' }}>{sub.studentName}</div>
      {sub.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sub.imageUrl} alt="" className="w-full rounded-lg mb-1" style={{ maxHeight: 160, objectFit: 'contain' }} />
      )}
      {sub.text && (
        <div
          className="text-[11px] leading-snug whitespace-pre-wrap"
          style={{ color: '#54493A', display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {sub.text}
        </div>
      )}
      {sub.teacherComment && (
        <div className="mt-1.5 rounded-lg px-2 py-1 text-[10px]" style={{ background: '#FFF3E0', color: '#8A6D2F' }}>
          👩‍🏫 {sub.teacherComment}
        </div>
      )}
    </div>
  );
}
