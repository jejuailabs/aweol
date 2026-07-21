'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { setDoc, updateDoc,
  collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc,
  serverTimestamp, getDocs, where,
} from 'firebase/firestore';
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { isTeacherOfClass } from '@/lib/auth-helpers';
import { SubmitType, HomeworkVisibility } from '@/lib/firestore-schema';
import { nudgesPath, readsPath } from '@/lib/paths';
import DrawingPad from './DrawingPad';
import HomeworkTeacherGrid from './HomeworkTeacherGrid';


interface Homework {
  id: string;
  title: string;
  description: string;
  submitType: SubmitType;
  dueDate: string | null;
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
  videoUrl: string;
  linkUrl: string;
  status: 'approved' | 'held';
  moderation: { flagged: boolean; reason: string } | null;
  teacherComment: string;
  stamp: { itemId: string; emoji: string; label: string } | null;
}

const TYPE_LABEL: Record<SubmitType, string> = {
  text: '✍️ 글쓰기',
  drawing: '🖌️ 손글씨·그리기',
  image: '📷 사진 올리기',
  video: '🎬 동영상 올리기',
  link: '🔗 영상 주소 내기',
};

/** 출제 화면에서 종류를 고를 때 옆에 붙는 설명 */
const TYPE_HINT: Record<SubmitType, string> = {
  text: '아이 화면에 글 쓰는 칸만 나와요',
  drawing: '손으로 그리거나 쓰는 판만 나와요',
  image: '사진 고르기 버튼만 나와요',
  video: '20MB(30초쯤)까지 올릴 수 있어요',
  link: '유튜브 주소를 붙여넣어요 (용량 안 들어요)',
};

/** 영상 파일 상한 — storage.rules 의 20MB 와 같은 값이어야 한다 */
const VIDEO_MAX_MB = 20;

/** 마감일이 지났나 (그날 자정까지는 살아 있다) */
function isOverdue(due: string | null): boolean {
  if (!due) return false;
  const end = new Date(`${due}T23:59:59`);
  return Date.now() > end.getTime();
}

/** 'YYYY-MM-DD' → '7월 21일 (화)' */
function formatDue(due: string): string {
  const d = new Date(`${due}T00:00:00`);
  if (Number.isNaN(d.getTime())) return due;
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

export default function HomeworkPanel({ schoolId, classId }: { schoolId: string; classId: string }) {
  const { user, userDoc, role } = useAuth();
  /**
   * **이 반** 담임만 낸다. `canManageClass` 는 어느 반인지를 안 보므로
   * 그걸로 열면 남의 반에서 버튼이 보이다가 눌렀을 때 거부당한다.
   */
  const isStaff = isTeacherOfClass(role, userDoc?.classIds, classId);
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
  const [wDue, setWDue] = useState('');
  /** 수정 중인 숙제 id. null 이면 새로 내는 중 */
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  // 제출
  const [subText, setSubText] = useState('');
  const [subFile, setSubFile] = useState<File | null>(null);
  const [subPreview, setSubPreview] = useState('');
  const [drawBlob, setDrawBlob] = useState<Blob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');
  const [subLink, setSubLink] = useState('');
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
            dueDate: (v.dueDate as string | null) ?? null,
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

  /**
   * 숙제를 열면 '봤다'고 한 번 남긴다.
   *
   * 선생님에게 '아직 안 냈다' 와 '아예 못 봤다' 는 다른 이야기다.
   * 앞은 재촉할 일이고, 뒤는 알림이 안 닿았다는 뜻이라 연락 방법을 바꿔야 한다.
   *
   * **setDoc 이 아니라 실패해도 무시한다.** 이미 있으면 규칙이 막는데(update 금지),
   * 그건 정상이다 — 이미 본 적이 있다는 뜻이니까.
   * 교직원은 안 남긴다. 선생님이 자기 숙제를 연 건 셀 이유가 없다.
   */
  useEffect(() => {
    if (!db || !openId || !user || isStaff) return;
    setDoc(
      doc(db, readsPath(schoolId, classId, openId), user.uid),
      { studentUid: user.uid, readAt: serverTimestamp() }
    ).catch(() => {});
  }, [openId, user, isStaff, schoolId, classId]);

  // 선생님이 나를 콕 찔렀는지 (찔린 본인만 읽을 수 있다)
  useEffect(() => {
    if (!db || !openId || isStaff || !user) { setMyNudge(0); return; }
    return onSnapshot(
      doc(db, nudgesPath(schoolId, classId, openId), user.uid),
      (snap) => setMyNudge(snap.exists() ? (snap.data().count ?? 0) : 0),
      () => setMyNudge(0)
    );
  }, [openId, isStaff, user, schoolId, classId]);

  const openWriter = useCallback((h?: Homework) => {
    // 수정이면 원래 값을 채워 넣는다. 빈 폼이 뜨면 선생님이 처음부터 다시 쓴다.
    setEditId(h?.id ?? null);
    setWTitle(h?.title ?? '');
    setWDesc(h?.description ?? '');
    setWType(h?.submitType ?? 'text');
    setWVis(h?.visibility ?? 'class');
    setWDue(h?.dueDate ?? '');
    setWriting(true);
  }, []);

  const saveHomework = useCallback(async () => {
    if (!db || !user || !userDoc || !wTitle.trim()) return;
    setSaving(true);
    const payload = {
      title: wTitle.trim(),
      description: wDesc.trim(),
      submitType: wType,
      visibility: wVis,
      dueDate: wDue || null,
    };
    setSaveErr('');
    try {
      if (editId) {
        /**
         * 제출 종류를 바꾸면 이미 낸 아이들의 제출물이 그 종류와 안 맞게 된다.
         * 지우지는 않는다 — 아이가 한 걸 앱이 마음대로 없애면 안 된다.
         * 대신 선생님에게 미리 알린다(아래 경고).
         */
        await updateDoc(doc(db, basePath, editId), payload);
      } else {
        await addDoc(collection(db, basePath), {
          ...payload,
          authorUid: user.uid,
          authorName: userDoc.displayName || '선생님',
          createdAt: serverTimestamp(),
        });
      }
      setWTitle(''); setWDesc(''); setWDue(''); setEditId(null);
      setWriting(false);
    } catch {
      /**
       * 여기 오는 건 거의 '내 반이 아니다' 다.
       * 예전에는 오류를 안 잡아서 '저장 중...' 에서 영영 멈춰 있었다.
       */
      setSaveErr(
        isStaff
          ? '숙제를 내지 못했어요. 잠시 뒤 다시 해주세요.'
          : '내가 맡은 반이 아니라 숙제를 낼 수 없어요.'
      );
    } finally {
      setSaving(false);
    }
  }, [wTitle, wDesc, wType, wVis, wDue, editId, user, userDoc, basePath, isStaff]);

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
    /**
     * 용량은 **고르는 순간** 알려준다.
     * 올리다가 규칙에 막히면 아이 눈에는 한참 기다린 뒤 알 수 없는 오류만 뜬다.
     */
    if (f.type.startsWith('video/') && f.size > VIDEO_MAX_MB * 1024 * 1024) {
      setSubmitMsg(
        `동영상이 너무 커요 (${Math.round(f.size / 1024 / 1024)}MB). ` +
        `${VIDEO_MAX_MB}MB까지 올릴 수 있어요. 더 짧게 찍거나 선생님께 여쭤보세요.`
      );
      e.target.value = '';
      return;
    }
    setSubmitMsg('');
    setSubFile(f);
    setSubPreview(URL.createObjectURL(f));
  };

  const submit = useCallback(async () => {
    if (!open || !user || !storage) return;
    setSubmitting(true);
    setSubmitMsg('');

    let imageUrl = '';
    let videoUrl = '';
    const isVideo = open.submitType === 'video';
    const blob: Blob | null = open.submitType === 'drawing' ? drawBlob : subFile;
    if (blob) {
      const ext = open.submitType === 'drawing' ? 'png' : (subFile?.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg'));
      const path = `homework/${user.uid}/${open.id}.${ext}`;
      const r = sRef(storage, path);
      try {
        await uploadBytes(r, blob);
      } catch {
        setSubmitting(false);
        setSubmitMsg(isVideo
          ? `동영상을 올리지 못했어요. ${VIDEO_MAX_MB}MB보다 크지 않은지 확인해 주세요.`
          : '사진을 올리지 못했어요. 다시 해볼까요?');
        return;
      }
      const url = await getDownloadURL(r);
      if (isVideo) videoUrl = url; else imageUrl = url;
    }

    const token = await auth?.currentUser?.getIdToken();
    const res = await fetch('/api/homework', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        schoolId, classId, homeworkId: open.id,
        text: subText.trim(), imageUrl, videoUrl, linkUrl: subLink.trim(),
      }),
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
    setSubText(''); setSubFile(null); setSubPreview(''); setDrawBlob(null); setSubLink('');
  }, [open, user, subText, subFile, drawBlob, subLink, schoolId, classId]);

  // ---------- 숙제 상세 ----------
  if (open) {
    const shown = subs.filter((s) => s.status === 'approved');
    return (
      <div>
        <button onClick={() => setOpenId(null)} className="text-[13px] font-bold mb-2.5" style={{ color: '#8A7A5F' }}>
          ← 숙제 목록
        </button>

        <div className="rounded-2xl p-4 mb-3" style={{ background: 'rgba(255,255,255,0.8)' }}>
          <div className="flex items-start justify-between gap-2">
            <div className="text-base font-black" style={{ color: '#3A3226' }}>{open.title}</div>
            {isStaff && (
              <button
                onClick={() => removeHomework(open.id)}
                className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold"
                style={{ background: 'rgba(232,96,76,0.15)', color: '#E8604C' }}
              >
                삭제
              </button>
            )}
          </div>
          <div className="flex gap-1.5 mt-1.5 mb-2">
            <span className="rounded-full px-2 py-0.5 text-[12px] font-bold" style={{ background: '#4A90D920', color: '#4A90D9' }}>
              {TYPE_LABEL[open.submitType]}
            </span>
            <span className="rounded-full px-2 py-0.5 text-[12px] font-bold" style={{ background: '#8A7A5F20', color: '#8A7A5F' }}>
              {open.visibility === 'class' ? '👀 친구들과 함께 보기' : '🔒 선생님만 보기'}
            </span>
            {open.dueDate && (
              <span
                className="rounded-full px-2 py-0.5 text-[12px] font-bold"
                style={
                  isOverdue(open.dueDate)
                    ? { background: '#F8D7DA', color: '#B02A37' }
                    : { background: '#E3F1E3', color: '#2E7D4F' }
                }
              >
                {isOverdue(open.dueDate) ? '⏰ 기한 지남' : `📅 ${formatDue(open.dueDate)}까지`}
              </span>
            )}
          </div>
          {isStaff && (
            <button
              onClick={() => openWriter(open)}
              className="text-[13px] font-bold underline mb-1"
              style={{ color: '#4A90D9' }}
            >
              숙제 고치기
            </button>
          )}
          {open.description && (
            <div className="text-[15px] leading-relaxed whitespace-pre-wrap" style={{ color: '#54493A' }}>
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
            <div className="text-sm font-black mb-2" style={{ color: '#3A3226' }}>
              {mySub ? '📮 다시 제출하기' : '📮 내 숙제 제출하기'}
            </div>

            {myNudge > 0 && !mySub && (
              <div
                className="rounded-xl px-3 py-2 mb-2.5 text-[14px] font-bold"
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

            {open.submitType === 'video' && (
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full aspect-[4/3] rounded-xl mb-2 flex flex-col items-center justify-center gap-1.5 border-2 border-dashed overflow-hidden"
                  style={{ borderColor: '#D8C9AC', background: 'white' }}
                >
                  {subPreview ? (
                    <video src={subPreview} className="w-full h-full object-contain" controls playsInline />
                  ) : (
                    <>
                      <span className="text-3xl">🎬</span>
                      <span className="text-[13px]" style={{ color: '#A89880' }}>동영상 고르기</span>
                      <span className="text-[12px]" style={{ color: '#C4B69C' }}>{VIDEO_MAX_MB}MB까지 (30초쯤)</span>
                    </>
                  )}
                </button>
                <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={handleFile} />
              </>
            )}

            {open.submitType === 'link' && (
              <div className="mb-2">
                <input
                  value={subLink}
                  onChange={(e) => setSubLink(e.target.value)}
                  placeholder="https://youtu.be/..."
                  inputMode="url"
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ background: 'white', color: '#3A3226' }}
                />
                <div className="text-[12px] mt-1" style={{ color: '#A89880' }}>
                  유튜브에 영상을 올리고 주소를 붙여넣어 주세요.
                </div>
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
                      <span className="text-[13px]" style={{ color: '#A89880' }}>사진 고르기</span>
                    </>
                  )}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
              </>
            )}

            <button
              onClick={submit}
              disabled={submitting || (!subText.trim() && !subFile && !drawBlob && !subLink.trim())}
              className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40"
              style={{ background: 'var(--color-primary)' }}
            >
              {submitting ? '제출 중...' : '제출하기'}
            </button>

            {submitMsg && (
              <div className="text-[13px] mt-2 leading-relaxed" style={{ color: submitMsg.includes('실패') ? '#C0392B' : '#2E9E56' }}>
                {submitMsg}
              </div>
            )}

            {mySub && (
              <div className="mt-3 pt-3" style={{ borderTop: '1px dashed #E6DCC8' }}>
                <div className="text-[13px] font-bold mb-1" style={{ color: '#8A7A5F' }}>내 제출물</div>
                {mySub.status === 'held' && (
                  <div className="text-[13px] mb-1.5" style={{ color: '#E8A33C' }}>
                    ⏳ 선생님 확인을 기다리는 중이에요
                  </div>
                )}
                {mySub.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mySub.imageUrl} alt="" className="w-full rounded-lg mb-1" />
                )}
                {mySub.text && (
                  <div className="text-[14px] whitespace-pre-wrap" style={{ color: '#54493A' }}>{mySub.text}</div>
                )}
                {mySub.stamp && (
                  <div
                    className="mt-2 rounded-xl px-3 py-2.5 text-center"
                    style={{ background: '#E2F6E9', border: '1px solid #A0DCB7' }}
                  >
                    <div className="text-2xl leading-none mb-1">{mySub.stamp.emoji}</div>
                    <div className="text-[14px] font-bold" style={{ color: '#2E8B57' }}>
                      {mySub.stamp.label}
                    </div>
                    <div className="text-[12px] mt-0.5" style={{ color: '#5FA87C' }}>
                      선생님이 도장을 찍어주셨어요 🏅
                    </div>
                  </div>
                )}
                {mySub.teacherComment && (
                  <div className="mt-2 rounded-xl px-3 py-2 text-[14px]" style={{ background: '#FFF3E0', color: '#8A6D2F' }}>
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
            <div className="text-[13px] font-bold mb-2" style={{ color: '#8A7A5F' }}>
              📋 친구들 숙제 {shown.length}건
            </div>
            {shown.length === 0 ? (
              <div className="py-8 text-center text-[13px]" style={{ color: '#A89880' }}>
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

        <div className="text-[13px] font-bold mb-1" style={{ color: '#8A7A5F' }}>어떻게 제출하나요?</div>
        <div className="text-[12px] mb-1.5" style={{ color: '#A89880' }}>
          고른 것 하나만 아이 화면에 나와요. 헷갈릴 일이 없어요.
        </div>
        <div className="flex flex-col gap-1.5 mb-2">
          {(Object.keys(TYPE_LABEL) as SubmitType[]).map((t) => (
            <button
              key={t}
              onClick={() => setWType(t)}
              className="rounded-xl px-3 py-2.5 text-left"
              style={{
                background: wType === t ? '#4A90D9' : 'rgba(255,255,255,0.85)',
                color: wType === t ? 'white' : '#8A7A5F',
              }}
            >
              <div className="text-sm font-bold">{TYPE_LABEL[t]}</div>
              <div className="text-[12px] opacity-80">{TYPE_HINT[t]}</div>
            </button>
          ))}
        </div>

        {wType === 'video' && (
          <div
            className="rounded-xl px-3 py-2 mb-3 text-[12px] leading-relaxed"
            style={{ background: '#FFF1D6', color: '#A6762A', border: '1px solid #F0D9A8' }}
          >
            영상 파일은 자리를 많이 차지해요. 30초짜리도 한 반이면 450MB쯤이라
            숙제 열 개 남짓이면 무료 용량이 찹니다.
            <b> 긴 영상은 &lsquo;영상 주소 내기&rsquo;가 좋아요</b> — 유튜브에 올리고 주소만 내면 용량이 안 들어요.
          </div>
        )}

        {editId && (
          <div
            className="rounded-xl px-3 py-2 mb-3 text-[12px] leading-relaxed"
            style={{ background: '#FFF1D6', color: '#A6762A', border: '1px solid #F0D9A8' }}
          >
            제출 종류를 바꿔도 이미 낸 아이들의 숙제는 지워지지 않아요.
            대신 바뀐 종류와 안 맞을 수 있어요.
          </div>
        )}

        <div className="text-[13px] font-bold mb-1.5" style={{ color: '#8A7A5F' }}>언제까지 내나요? (안 정해도 돼요)</div>
        <div className="flex gap-1.5 mb-3">
          <input
            type="date"
            value={wDue}
            onChange={(e) => setWDue(e.target.value)}
            className="flex-1 min-w-0 rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ background: 'rgba(255,255,255,0.85)', color: '#3A3226' }}
          />
          {wDue && (
            <button
              onClick={() => setWDue('')}
              className="shrink-0 rounded-xl px-3 text-[13px] font-bold"
              style={{ background: 'rgba(255,255,255,0.7)', color: '#8A7A5F' }}
            >
              지우기
            </button>
          )}
        </div>

        <div className="text-[13px] font-bold mb-1.5" style={{ color: '#8A7A5F' }}>누가 볼 수 있나요?</div>
        <div className="flex gap-1.5 mb-4">
          {([
            { v: 'class' as const, label: '👀 아이들과 함께 보기' },
            { v: 'teacher' as const, label: '🔒 선생님만 보기' },
          ]).map((o) => (
            <button
              key={o.v}
              onClick={() => setWVis(o.v)}
              className="flex-1 rounded-xl py-2.5 text-[13px] font-bold"
              style={{
                background: wVis === o.v ? 'var(--color-primary)' : 'rgba(255,255,255,0.85)',
                color: wVis === o.v ? 'white' : '#8A7A5F',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>

        {saveErr && (
          <div
            className="rounded-xl px-3 py-2.5 mb-3 text-[14px] font-bold leading-relaxed"
            style={{ background: '#FDECEA', color: '#B02A37', border: '1px solid #F5C6C4' }}
          >
            ⚠️ {saveErr}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => { setWriting(false); setEditId(null); }}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold"
            style={{ background: 'rgba(255,255,255,0.7)', color: '#8A7A5F' }}
          >
            취소
          </button>
          <button
            onClick={saveHomework}
            disabled={!wTitle.trim() || saving}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40"
            style={{ background: '#4A90D9' }}
          >
            {saving ? '저장 중...' : editId ? '고치기' : '숙제 내기'}
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
          onClick={() => openWriter()}
          className="w-full rounded-2xl py-3 mb-3 text-sm font-bold border-2 border-dashed"
          style={{ borderColor: '#4A90D980', color: '#4A90D9' }}
        >
          + 새 숙제 내기
        </button>
      )}
      {list.length === 0 ? (
        <div className="py-10 text-center">
          <div className="text-4xl mb-2">📝</div>
          <div className="text-sm" style={{ color: '#A89880' }}>아직 나온 숙제가 없어요</div>
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
                <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: '#4A90D920', color: '#4A90D9' }}>
                  {TYPE_LABEL[h.submitType]}
                </span>
                <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: '#8A7A5F20', color: '#8A7A5F' }}>
                  {h.visibility === 'class' ? '함께 보기' : '선생님만'}
                </span>
                {/* 마감은 목록에서 바로 보여야 한다. 하나씩 열어보게 하면 놓친다. */}
                {h.dueDate && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                    style={
                      isOverdue(h.dueDate)
                        ? { background: '#F8D7DA', color: '#B02A37' }
                        : { background: '#E3F1E3', color: '#2E7D4F' }
                    }
                  >
                    {isOverdue(h.dueDate) ? '기한 지남' : `${formatDue(h.dueDate)}까지`}
                  </span>
                )}
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
      <div className="text-[13px] font-bold mb-1" style={{ color: '#3A3226' }}>{sub.studentName}</div>
      {sub.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sub.imageUrl} alt="" className="w-full rounded-lg mb-1" style={{ maxHeight: 160, objectFit: 'contain' }} />
      )}
      {sub.videoUrl && (
        // preload="none" — 카드가 여러 개 뜨는 화면이라 미리 받으면 트래픽이 몇 배가 된다
        <video
          src={sub.videoUrl}
          controls
          playsInline
          preload="none"
          className="w-full rounded-lg mb-1"
          style={{ maxHeight: 160 }}
        />
      )}
      {sub.linkUrl && (
        <a
          href={sub.linkUrl}
          target="_blank"
          /**
           * noreferrer 를 빼면 안 된다. 아이가 붙여넣은 주소라 어디로 갈지 모르는데,
           * 그 사이트에 우리 페이지 주소를 넘겨줄 이유가 없다.
           */
          rel="noreferrer noopener"
          className="block rounded-lg px-2 py-1.5 mb-1 text-[13px] font-bold truncate"
          style={{ background: '#EAF2FB', color: '#2F6DB5' }}
        >
          🔗 영상 보러가기
        </a>
      )}
      {sub.text && (
        <div
          className="text-[13px] leading-snug whitespace-pre-wrap"
          style={{ color: '#54493A', display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {sub.text}
        </div>
      )}
      {sub.teacherComment && (
        <div className="mt-1.5 rounded-lg px-2 py-1 text-[12px]" style={{ background: '#FFF3E0', color: '#8A6D2F' }}>
          👩‍🏫 {sub.teacherComment}
        </div>
      )}
    </div>
  );
}
