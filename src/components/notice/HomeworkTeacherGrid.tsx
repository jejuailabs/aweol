'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { studentsPath, submissionsPath, nudgesPath, readsPath, inventoryPath } from '@/lib/paths';
import { SubmitType, HomeworkVisibility } from '@/lib/firestore-schema';
import { SHOP_ITEMS, ShopItem } from '@/lib/shop-catalog';
import { customStampsPath, type CustomStamp } from '@/lib/custom-stamps';

/**
 * 교사용 숙제 현황판.
 * 제출물만 나열하면 "누가 안 냈는지"가 안 보인다. 그래서 이 화면의 기준은
 * 제출물이 아니라 **명부**다. 명부 전원을 칸으로 깔고 상태를 색으로 칠한다.
 */

interface RosterRow {
  id: string;
  number: number;
  name: string;
  linkedUid: string | null;
}

interface Sub {
  studentUid: string;
  studentName: string;
  text: string;
  imageUrl: string;
  videoUrl: string;
  linkUrl: string;
  status: 'approved' | 'held';
  moderation: { flagged: boolean; reason: string } | null;
  teacherComment: string;
  checked: boolean;
  stamp: { itemId: string; emoji: string; label: string; imageUrl?: string } | null;
}

interface Nudge {
  studentUid: string;
  count: number;
}

/**
 * `unread` 와 `none` 을 나눈 이유.
 *
 * '아직 안 냈다' 와 '아예 못 봤다' 는 선생님에게 전혀 다른 이야기다.
 * 앞은 재촉할 일이고, 뒤는 알림이 안 닿았다는 뜻이라 연락 방법을 바꿔야 한다.
 * 콕 찌르기는 '봤는데 안 낸' 아이에게 먼저 가는 게 맞다.
 */
type CellState = 'unlinked' | 'unread' | 'none' | 'submitted' | 'checked';

const STATE_STYLE: Record<CellState, { bg: string; border: string; fg: string; label: string }> = {
  unlinked: { bg: '#FFFFFF', border: '#E0D3BB', fg: '#C0B197', label: '미연결' },
  unread: { bg: '#FBF1F0', border: '#EFC9C6', fg: '#B5645E', label: '안 봄' },
  none: { bg: '#F4EEE2', border: '#E0D3BB', fg: '#9C8A6C', label: '봤는데 안 냄' },
  submitted: { bg: '#E4F0FC', border: '#A9CDF0', fg: '#2E6DA8', label: '제출' },
  checked: { bg: '#E2F6E9', border: '#A0DCB7', fg: '#2E8B57', label: '검사완료' },
};

export default function HomeworkTeacherGrid({
  schoolId,
  classId,
  homeworkId,
  submitType,
  visibility,
}: {
  schoolId: string;
  classId: string;
  homeworkId: string;
  submitType: SubmitType;
  visibility: HomeworkVisibility;
}) {
  const { user } = useAuth();
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  /** 숙제를 열어본 학생 uid */
  const [readUids, setReadUids] = useState<Set<string>>(new Set());
  const [myStamps, setMyStamps] = useState<ShopItem[]>([]);
  const [mine, setMine] = useState<CustomStamp[]>([]);
  const [openUid, setOpenUid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!db) return;
    return onSnapshot(
      query(collection(db, studentsPath(schoolId, classId)), orderBy('number')),
      (snap) =>
        setRoster(
          snap.docs.map((d) => {
            const v = d.data();
            return {
              id: d.id,
              number: v.number ?? 0,
              name: v.name || '',
              linkedUid: v.linkedUid ?? null,
            };
          })
        ),
      () => setRoster([])
    );
  }, [schoolId, classId]);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(
      collection(db, submissionsPath(schoolId, classId, homeworkId)),
      (snap) =>
        setSubs(
          snap.docs.map((d) => {
            const v = d.data();
            return {
              studentUid: v.studentUid || d.id,
              studentName: v.studentName || '',
              text: v.text || '',
              // 옛 제출물에는 이 칸이 없다. 빈 문자열로 채워야 화면이 안 깨진다.
              videoUrl: v.videoUrl || '',
              linkUrl: v.linkUrl || '',
              imageUrl: v.imageUrl || '',
              status: v.status === 'held' ? 'held' : 'approved',
              moderation: v.moderation ?? null,
              teacherComment: v.teacherComment || '',
              checked: v.checked === true,
              stamp: v.stamp ?? null,
            };
          })
        ),
      () => setSubs([])
    );
  }, [schoolId, classId, homeworkId]);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(
      collection(db, nudgesPath(schoolId, classId, homeworkId)),
      (snap) =>
        setNudges(snap.docs.map((d) => ({ studentUid: d.id, count: d.data().count ?? 0 }))),
      () => setNudges([])
    );
  }, [schoolId, classId, homeworkId]);

  // 선생님이 상점에서 챙겨둔 도장 도안
  useEffect(() => {
    if (!db || !user) { setMyStamps([]); return; }
    return onSnapshot(
      collection(db, inventoryPath(user.uid)),
      (snap) => {
        const ids = new Set(snap.docs.map((d) => d.id));
        setMyStamps(SHOP_ITEMS.filter((i) => i.category === 'stamp' && ids.has(i.id)));
      },
      () => setMyStamps([])
    );
  }, [user]);

  // 선생님이 직접 만든 도장 (상점 것과 나란히 고를 수 있어야 한다)
  useEffect(() => {
    if (!db || !user) { setMine([]); return; }
    return onSnapshot(
      collection(db, customStampsPath(user.uid)),
      (snap) => setMine(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CustomStamp, 'id'>) }))),
      () => setMine([])
    );
  }, [user]);

  const subByUid = useMemo(() => {
    const m = new Map<string, Sub>();
    subs.forEach((s) => m.set(s.studentUid, s));
    return m;
  }, [subs]);

  const nudgeByUid = useMemo(() => {
    const m = new Map<string, number>();
    nudges.forEach((n) => m.set(n.studentUid, n.count));
    return m;
  }, [nudges]);

  // 열어본 기록 (문서 id = 학생 uid)
  useEffect(() => {
    if (!db) return;
    return onSnapshot(
      collection(db, readsPath(schoolId, classId, homeworkId)),
      (snap) => setReadUids(new Set(snap.docs.map((d) => d.id))),
      () => setReadUids(new Set())
    );
  }, [schoolId, classId, homeworkId]);

  const cells = useMemo(
    () =>
      roster.map((r) => {
        const sub = r.linkedUid ? subByUid.get(r.linkedUid) ?? null : null;
        const state: CellState = !r.linkedUid
          ? 'unlinked'
          : sub
            ? (sub.checked ? 'checked' : 'submitted')
            : (r.linkedUid && readUids.has(r.linkedUid) ? 'none' : 'unread');
        return { row: r, sub, state, nudged: r.linkedUid ? nudgeByUid.get(r.linkedUid) ?? 0 : 0 };
      }),
    [roster, subByUid, nudgeByUid, readUids]
  );

  /** 명부에 없는 사람의 제출물(전학·교사 테스트 등)은 따로 보여준다 */
  const orphans = useMemo(() => {
    const known = new Set(roster.map((r) => r.linkedUid).filter(Boolean) as string[]);
    return subs.filter((s) => !known.has(s.studentUid));
  }, [subs, roster]);

  const counts = useMemo(() => {
    const c = { unlinked: 0, unread: 0, none: 0, submitted: 0, checked: 0 };
    cells.forEach((x) => { c[x.state] += 1; });
    return c;
  }, [cells]);

  const call = useCallback(
    async (studentUid: string, patch: Record<string, unknown>) => {
      setBusy(true);
      try {
        const token = await auth?.currentUser?.getIdToken();
        const res = await fetch('/api/homework', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ schoolId, classId, homeworkId, studentUid, ...patch }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setToast(j.error || '처리하지 못했어요');
          return false;
        }
        return true;
      } finally {
        setBusy(false);
      }
    },
    [schoolId, classId, homeworkId]
  );

  const nudgeAll = useCallback(async () => {
    // 안 낸 아이 전부 — 본 아이든 아직 못 본 아이든 아직 안 낸 건 같다
    const targets = cells.filter(
      (c) => (c.state === 'none' || c.state === 'unread') && c.row.linkedUid
    );
    if (targets.length === 0) return;
    setBusy(true);
    for (const t of targets) {
      await call(t.row.linkedUid!, { nudge: true, studentName: t.row.name });
    }
    setBusy(false);
    setToast(`${targets.length}명을 콕 찔렀어요`);
  }, [cells, call]);

  const opened = cells.find((c) => c.row.linkedUid === openUid) ?? null;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  if (roster.length === 0) {
    return (
      <div className="rounded-2xl py-8 px-4 text-center" style={{ background: 'rgba(255,255,255,0.8)' }}>
        <div className="text-3xl mb-2">📋</div>
        <div className="text-[14px] font-bold mb-1" style={{ color: '#3A3226' }}>명부가 아직 없어요</div>
        <div className="text-[13px] leading-relaxed" style={{ color: '#A89880' }}>
          관리 → 명부에서 학생을 등록하면
          <br />
          누가 냈고 누가 안 냈는지 한눈에 보여요
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* 요약 */}
      <div className="flex gap-1.5 mb-2.5">
        {(['unread', 'none', 'submitted', 'checked'] as CellState[]).map((s) => (
          <div
            key={s}
            className="flex-1 rounded-xl py-2 text-center"
            style={{ background: STATE_STYLE[s].bg, border: `1px solid ${STATE_STYLE[s].border}` }}
          >
            <div className="text-base font-black leading-none" style={{ color: STATE_STYLE[s].fg }}>
              {counts[s]}
            </div>
            <div className="text-[12px] font-bold mt-0.5" style={{ color: STATE_STYLE[s].fg }}>
              {STATE_STYLE[s].label}
            </div>
          </div>
        ))}
      </div>

      {counts.none + counts.unread > 0 && (
        <>
          <button
            onClick={nudgeAll}
            disabled={busy}
            className="w-full rounded-xl py-2 mb-1.5 text-[13px] font-bold disabled:opacity-40"
            style={{ background: '#FFF1D6', color: '#A6762A', border: '1px solid #F0D9A8' }}
          >
            👉 미제출 {counts.none + counts.unread}명 모두 콕 찌르기
          </button>
          {counts.unread > 0 && (
            <div className="text-[12px] mb-2.5 leading-relaxed" style={{ color: '#B5645E' }}>
              이 중 <b>{counts.unread}명</b>은 숙제를 아직 열어보지도 않았어요.
              콕 찌르기가 안 닿고 있을 수 있으니 다른 방법으로도 알려주세요.
            </div>
          )}
        </>
      )}

      {/* 명부 그리드 */}
      <div className="grid grid-cols-5 gap-1.5">
        {cells.map(({ row, sub, state, nudged }) => {
          const st = STATE_STYLE[state];
          const disabled = state === 'unlinked';
          return (
            <button
              key={row.id}
              disabled={disabled}
              onClick={() => setOpenUid(row.linkedUid)}
              className="relative rounded-xl py-2 px-1 text-center transition-transform active:scale-95 disabled:cursor-default"
              style={{
                background: st.bg,
                border: `1px ${state === 'unlinked' ? 'dashed' : 'solid'} ${st.border}`,
                minHeight: 52,
              }}
            >
              <div className="text-[11px] font-bold leading-none opacity-70" style={{ color: st.fg }}>
                {row.number}
              </div>
              <div
                className="text-[13px] font-bold leading-tight mt-1 truncate"
                style={{ color: st.fg }}
              >
                {row.name}
              </div>
              {sub?.status === 'held' && (
                <span className="absolute -top-1 -right-1 text-[13px]" title="AI 보류">⏳</span>
              )}
              {(state === 'none' || state === 'unread') && nudged > 0 && (
                <span className="absolute -top-1 -right-1 text-[13px]" title={`${nudged}번 찔렀어요`}>👉</span>
              )}
              {sub?.teacherComment && (
                <span className="absolute -bottom-1 -right-1 text-[12px]">💬</span>
              )}
            </button>
          );
        })}
      </div>

      {counts.unlinked > 0 && (
        <div className="text-[12px] mt-2 leading-relaxed" style={{ color: '#A89880' }}>
          점선 칸 {counts.unlinked}명은 아직 학생코드로 계정을 연결하지 않아 제출할 수 없어요.
        </div>
      )}

      {visibility === 'teacher' && (
        <div className="text-[12px] mt-1" style={{ color: '#A89880' }}>
          🔒 이 숙제는 선생님만 볼 수 있어요.
        </div>
      )}

      {/* 명부 밖 제출물 */}
      {orphans.length > 0 && (
        <div className="mt-3 rounded-2xl p-3" style={{ background: '#FFF6E5', border: '1px solid #F0D9A8' }}>
          <div className="text-[13px] font-bold mb-1.5" style={{ color: '#8A6D2F' }}>
            명부에 없는 제출물 {orphans.length}건
          </div>
          {orphans.map((s) => (
            <div key={s.studentUid} className="text-[13px]" style={{ color: '#A08A5B' }}>
              {s.studentName || s.studentUid}
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div
          className="fixed left-1/2 -translate-x-1/2 bottom-24 z-50 rounded-full px-4 py-2 text-[14px] font-bold text-white"
          style={{ background: 'rgba(58,50,38,0.92)' }}
        >
          {toast}
        </div>
      )}

      {/* 상세 */}
      {opened && (
        <StudentSheet
          key={opened.row.id}
          name={opened.row.name}
          number={opened.row.number}
          state={opened.state}
          sub={opened.sub}
          nudged={opened.nudged}
          submitType={submitType}
          busy={busy}
          myStamps={myStamps}
          mine={mine}
          onClose={() => setOpenUid(null)}
          onNudge={async () => {
            if (await call(opened.row.linkedUid!, { nudge: true, studentName: opened.row.name })) {
              setToast(`${opened.row.name} 콕!`);
            }
          }}
          onComment={async (c) => {
            if (await call(opened.row.linkedUid!, { comment: c })) setToast('코멘트를 남겼어요');
          }}
          onCheck={async (v, stampId) => {
            if (await call(opened.row.linkedUid!, { check: v, stampId })) {
              setToast(v ? `검사완료! ${opened.row.name}에게 도장 1개 🏅` : '검사완료를 취소했어요');
            }
          }}
          onApprove={async () => {
            if (await call(opened.row.linkedUid!, { approve: true })) setToast('공개했어요');
          }}
        />
      )}
    </div>
  );
}

// ---------- 학생 한 명 상세 ----------
function StudentSheet({
  name, number, state, sub, nudged, submitType, busy, myStamps, mine,
  onClose, onNudge, onComment, onCheck, onApprove,
}: {
  name: string;
  number: number;
  state: CellState;
  sub: Sub | null;
  nudged: number;
  submitType: SubmitType;
  busy: boolean;
  myStamps: ShopItem[];
  /** 선생님이 직접 만든 도장 */
  mine: CustomStamp[];
  onClose: () => void;
  onNudge: () => void;
  onComment: (c: string) => void;
  onCheck: (v: boolean, stampId?: string) => void;
  onApprove: () => void;
}) {
  const [cmt, setCmt] = useState(sub?.teacherComment || '');
  const [pickedStamp, setPickedStamp] = useState(
    sub?.stamp?.itemId || myStamps[0]?.id || mine[0]?.id || ''
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(30,26,20,0.45)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl p-4 pb-8 max-h-[80vh] overflow-y-auto"
        style={{ background: '#FAF5EA' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-black" style={{ color: '#3A3226' }}>
            {number}번 {name}
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-[12px] font-bold"
            style={{ background: STATE_STYLE[state].bg, color: STATE_STYLE[state].fg, border: `1px solid ${STATE_STYLE[state].border}` }}
          >
            {STATE_STYLE[state].label}
          </span>
        </div>

        {!sub ? (
          <div className="rounded-2xl p-4 text-center" style={{ background: 'white' }}>
            <div className="text-3xl mb-2">📭</div>
            <div className="text-[14px] mb-1" style={{ color: '#54493A' }}>아직 내지 않았어요</div>
            {nudged > 0 && (
              <div className="text-[13px] mb-3" style={{ color: '#A6762A' }}>👉 {nudged}번 콕 찔렀어요</div>
            )}
            <button
              onClick={onNudge}
              disabled={busy}
              className="w-full rounded-xl py-2.5 text-[14px] font-bold disabled:opacity-40"
              style={{ background: '#FFF1D6', color: '#A6762A', border: '1px solid #F0D9A8' }}
            >
              👉 콕 찌르기
            </button>
            <div className="text-[12px] mt-2 leading-relaxed" style={{ color: '#A89880' }}>
              종이로 낸 아이라면 찌르지 않아도 괜찮아요.
            </div>
          </div>
        ) : (
          <>
            {sub.status === 'held' && (
              <div className="rounded-2xl p-3 mb-2" style={{ background: '#FFF6E5', border: '1px solid #F0D9A8' }}>
                <div className="text-[13px] font-bold mb-1" style={{ color: '#8A6D2F' }}>
                  ⏳ AI가 확인을 요청했어요
                </div>
                <div className="text-[12px] leading-relaxed mb-2" style={{ color: '#A08A5B' }}>
                  {sub.moderation?.reason || '확인 필요'} · 오탐일 수 있으니 직접 보고 판단해 주세요.
                </div>
                <button
                  onClick={onApprove}
                  disabled={busy}
                  className="w-full rounded-xl py-2 text-[13px] font-bold text-white disabled:opacity-40"
                  style={{ background: '#3BAF9F' }}
                >
                  괜찮아요, 공개하기
                </button>
              </div>
            )}

            <div className="rounded-2xl p-3 mb-2" style={{ background: 'white' }}>
              {sub.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sub.imageUrl} alt="" className="w-full rounded-xl mb-2" style={{ maxHeight: 320, objectFit: 'contain' }} />
              )}
              {sub.videoUrl && (
                <video
                  src={sub.videoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full rounded-xl mb-2"
                  style={{ maxHeight: 320 }}
                />
              )}
              {sub.linkUrl && (
                <a
                  href={sub.linkUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block rounded-xl px-3 py-2 mb-2 text-[14px] font-bold break-all"
                  style={{ background: '#EAF2FB', color: '#2F6DB5' }}
                >
                  🔗 {sub.linkUrl}
                </a>
              )}
              {sub.text && (
                <div className="text-[15px] leading-relaxed whitespace-pre-wrap" style={{ color: '#3A3226' }}>
                  {sub.text}
                </div>
              )}
              {!sub.imageUrl && !sub.videoUrl && !sub.linkUrl && !sub.text && (
                <div className="text-[13px]" style={{ color: '#A89880' }}>
                  내용이 비어 있어요 ({submitType})
                </div>
              )}
            </div>

            <div className="text-[13px] font-bold mb-1.5" style={{ color: '#8A7A5F' }}>💬 칭찬 한마디</div>
            <div className="flex gap-1.5 mb-3">
              <input
                value={cmt}
                onChange={(e) => setCmt(e.target.value)}
                placeholder="참 잘했어요!"
                className="min-w-0 flex-1 rounded-xl px-3 py-2 text-[14px] outline-none"
                style={{ background: 'white', color: '#3A3226' }}
              />
              <button
                onClick={() => onComment(cmt)}
                disabled={busy}
                className="shrink-0 rounded-xl px-3 py-2 text-[13px] font-bold text-white disabled:opacity-40"
                style={{ background: 'var(--color-primary)' }}
              >
                저장
              </button>
            </div>

            {/* 도장 고르기 */}
            {!sub.checked && (
              (myStamps.length > 0 || mine.length > 0) ? (
                <>
                  <div className="text-[13px] font-bold mb-1.5" style={{ color: '#8A7A5F' }}>💮 찍어줄 도장</div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {myStamps.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setPickedStamp(s.id)}
                        className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[13px] font-bold"
                        style={
                          pickedStamp === s.id
                            ? { background: 'var(--color-primary)', color: 'white' }
                            : { background: 'white', color: '#8A7A5F' }
                        }
                      >
                        <span className="text-sm">{s.emoji}</span>
                        {s.label}
                      </button>
                    ))}
                    {/* 내가 만든 도장 — 상점 것과 나란히 고른다 */}
                    {mine.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setPickedStamp(s.id)}
                        className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[13px] font-bold"
                        style={
                          pickedStamp === s.id
                            ? { background: 'var(--color-primary)', color: 'white' }
                            : { background: 'white', color: '#8A7A5F' }
                        }
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.imageUrl} alt="" className="h-4 w-4 rounded object-cover" />
                        {s.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-xl px-3 py-2 mb-3 text-[12px] leading-relaxed" style={{ background: '#FFF6E5', color: '#A08A5B' }}>
                  상점에서 도장을 받아오면 여기서 찍어줄 수 있어요. (지금은 전부 무료)
                </div>
              )
            )}

            {sub.checked && sub.stamp && (
              <div className="rounded-xl px-3 py-2 mb-3 text-[14px] font-bold text-center flex items-center justify-center gap-1.5" style={{ background: '#E2F6E9', color: '#2E8B57' }}>
                {/* 선생님이 만든 도장이면 이모지 대신 그림이 찍혀 있다 */}
                {sub.stamp.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sub.stamp.imageUrl} alt="" className="h-6 w-6 rounded object-cover" />
                ) : (
                  <span>{sub.stamp.emoji}</span>
                )}
                {sub.stamp.label}
              </div>
            )}

            <button
              onClick={() => onCheck(!sub.checked, pickedStamp || undefined)}
              disabled={busy}
              className="w-full rounded-xl py-3 text-[15px] font-bold disabled:opacity-40"
              style={
                sub.checked
                  ? { background: '#E2F6E9', color: '#2E8B57', border: '1px solid #A0DCB7' }
                  : { background: 'var(--color-primary)', color: 'white' }
              }
            >
              {sub.checked ? '✅ 검사완료 (눌러서 취소)' : '도장 찍고 검사완료'}
            </button>
            {!sub.checked && (
              <div className="text-[12px] mt-1.5 text-center" style={{ color: '#A89880' }}>
                검사완료하면 {name}에게 도장 1개가 쌓여요
              </div>
            )}
          </>
        )}

        <button
          onClick={onClose}
          className="w-full rounded-xl py-2.5 mt-2 text-[14px] font-bold"
          style={{ background: 'rgba(255,255,255,0.8)', color: '#8A7A5F' }}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
