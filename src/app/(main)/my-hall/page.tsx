'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection, deleteDoc, doc, getDocs, orderBy, query, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { resizeImage } from '@/lib/client-image';
import { playSound } from '@/lib/sound';
import {
  BANNER_SLOTS, HALL_THEMES, LIMITS, MAX_HALLS_PER_USER, MAX_SHOWS_PER_HALL,
  MAX_WORKS_PER_SHOW, PHASE_COLOR, hallPath, showPeriod, todayStr,
  type HallDoc, type HallTheme, type ShowDoc, type WorkDoc,
} from '@/lib/art-hall';

/**
 * 내 전시관 관리 — **누구나 자기 전시를 연다.**
 *
 * 학교 전시는 담임이 승인해야 걸리지만, 여기는 **내 전시관이라 내가 건다.**
 * 그래서 화면도 승인 절차 없이 곧장 올리고 곧장 보인다.
 *
 * 흐름은 셋으로 나뉜다 — 전시관 고르기 → 전시 고르기 → 작품 걸기.
 * 한 화면에 셋을 다 펼치면 휴대폰에서 아무것도 못 찾는다.
 */

type View =
  | { at: 'halls' }
  | { at: 'hall'; hallId: string }
  | { at: 'show'; hallId: string; showId: string };

type HallRow = HallDoc & { id: string };
type ShowRow = ShowDoc & { id: string };
type WorkRow = WorkDoc & { id: string };

/** 올리는 중인 사진 한 장 */
interface Pending {
  id: string;
  file: File;
  previewUrl: string;
  title: string;
  takenAt: string;
  caption: string;
  status: 'waiting' | 'fixing' | 'ready';
  /** 보정본. 실패하면 null 이고 원본을 쓴다. */
  fixed: Blob | null;
  useFixed: boolean;
}

const card = { background: 'var(--color-surface)' };
const input =
  'w-full rounded-xl px-3 py-2.5 text-sm outline-none';
const inputStyle = { background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' };

export default function MyHallPage() {
  const router = useRouter();
  const { user, userDoc, role } = useAuth();

  const [view, setView] = useState<View>({ at: 'halls' });
  const [halls, setHalls] = useState<HallRow[]>([]);
  const [shows, setShows] = useState<ShowRow[]>([]);
  const [works, setWorks] = useState<WorkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const hall = halls.find((h) => h.id === (view.at !== 'halls' ? view.hallId : ''));
  const show = shows.find((s) => s.id === (view.at === 'show' ? view.showId : ''));

  // ---------- 읽기 ----------
  const loadHalls = useCallback(async () => {
    if (!db || !user) { setHalls([]); setLoading(false); return; }
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'halls'), where('ownerUid', '==', user.uid))
      );
      setHalls(snap.docs.map((d) => ({ id: d.id, ...(d.data() as HallDoc) })));
    } catch {
      setHalls([]);
    }
    setLoading(false);
  }, [user]);

  const loadShows = useCallback(async (hallId: string) => {
    if (!db) return;
    const snap = await getDocs(
      query(collection(db, 'halls', hallId, 'shows'), orderBy('order', 'asc'))
    );
    setShows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ShowDoc) })));
  }, []);

  const loadWorks = useCallback(async (hallId: string, showId: string) => {
    if (!db) return;
    const snap = await getDocs(
      query(collection(db, 'halls', hallId, 'shows', showId, 'works'), orderBy('order', 'asc'))
    );
    setWorks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as WorkDoc) })));
  }, []);

  useEffect(() => { loadHalls(); }, [loadHalls]);
  useEffect(() => {
    if (view.at !== 'halls') loadShows(view.hallId).catch(() => setShows([]));
  }, [view, loadShows]);
  useEffect(() => {
    if (view.at === 'show') loadWorks(view.hallId, view.showId).catch(() => setWorks([]));
  }, [view, loadWorks]);

  const call = async (body: Record<string, unknown>) => {
    const token = await auth?.currentUser?.getIdToken();
    const res = await fetch('/api/hall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || '안 됐어요');
    return json;
  };

  /**
   * ---------- 아이는 여기 못 들어온다 ----------
   *
   * 지도에서 단추를 감췄지만 **주소를 치면 그대로 열린다.** 감춘 것과 막은 것은
   * 다르다. 규칙(firestore.rules)이 읽기를 막으므로 열어봤자 빈 화면이지만,
   * 빈 화면은 '고장 났나' 로 읽힌다 — 왜 못 들어오는지 말해준다.
   */
  if (role === 'student') {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="text-5xl">🔒</span>
        <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
          개인 전시관은 선생님과 어른들이 쓰는 곳이에요
        </p>
        <button
          onClick={() => router.push('/')}
          className="rounded-full px-6 py-2.5 text-sm font-bold text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          지도로 돌아가기
        </button>
      </div>
    );
  }

  // ---------- 로그인 안 했을 때 ----------
  if (!user) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="text-5xl">🖼️</span>
        <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
          로그인하면 내 전시관을 열 수 있어요
        </p>
        <button
          onClick={() => router.push('/login')}
          className="rounded-full px-6 py-2.5 text-sm font-bold text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          로그인하러 가기
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pt-4 pb-28">
      {/* 머리말 */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => {
            if (view.at === 'show') setView({ at: 'hall', hallId: view.hallId });
            else if (view.at === 'hall') setView({ at: 'halls' });
            else router.push('/');
          }}
          className="rounded-full px-3.5 py-2 text-sm font-bold shrink-0"
          style={{ background: 'var(--color-surface)', color: 'var(--color-text-sub)' }}
        >
          ←
        </button>
        <h1 className="text-[17px] font-black min-w-0 truncate" style={{ color: 'var(--color-text-main)' }}>
          {view.at === 'show' ? show?.title || '전시'
            : view.at === 'hall' ? hall?.title || '전시관'
              : '🖼️ 내 전시관'}
        </h1>
        {view.at !== 'halls' && hall && (
          <button
            onClick={() => router.push(hallPath(hall.id))}
            className="ml-auto shrink-0 rounded-full px-3.5 py-2 text-[13px] font-bold"
            style={{ background: 'var(--color-surface)', color: 'var(--color-primary)' }}
          >
            미리보기
          </button>
        )}
      </div>

      {err && (
        <div className="rounded-xl px-3 py-2.5 mb-3 text-[13px] font-bold"
          style={{ background: '#FDECEA', color: '#B02A37' }}>
          ⚠️ {err}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl p-6 text-center text-sm" style={{ ...card, color: 'var(--color-text-sub)' }}>
          불러오는 중...
        </div>
      ) : view.at === 'halls' ? (
        <HallList
          halls={halls}
          onOpen={(id) => setView({ at: 'hall', hallId: id })}
          onCreated={async () => { await loadHalls(); }}
          call={call}
          setErr={setErr}
        />
      ) : view.at === 'hall' && hall ? (
        <HallDetail
          hall={hall}
          shows={shows}
          busy={busy}
          setBusy={setBusy}
          setErr={setErr}
          call={call}
          reloadHalls={loadHalls}
          reloadShows={() => loadShows(hall.id)}
          onOpenShow={(showId) => setView({ at: 'show', hallId: hall.id, showId })}
          onDeleted={() => { setView({ at: 'halls' }); loadHalls(); }}
          ownerName={userDoc?.displayName || '나'}
        />
      ) : view.at === 'show' && hall && show ? (
        <ShowDetail
          hall={hall}
          show={show}
          works={works}
          uid={user.uid}
          busy={busy}
          setBusy={setBusy}
          setErr={setErr}
          reloadShows={() => loadShows(hall.id)}
          reloadWorks={() => loadWorks(hall.id, show.id)}
          onDeleted={() => { setView({ at: 'hall', hallId: hall.id }); loadShows(hall.id); }}
        />
      ) : null}
    </div>
  );
}

/* ══════════════════════ 전시관 목록 ══════════════════════ */

function HallList({
  halls, onOpen, onCreated, call, setErr,
}: {
  halls: HallRow[];
  onOpen: (id: string) => void;
  onCreated: () => Promise<void>;
  call: (b: Record<string, unknown>) => Promise<Record<string, unknown>>;
  setErr: (s: string) => void;
}) {
  const [opening, setOpening] = useState(false);
  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [theme, setTheme] = useState<HallTheme>('white');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  /**
   * 첫 전시 — **전시관과 함께 받는다.**
   * 전에는 전시관만 만들 수 있어서 전시 0개인 빈 건물이 남았다.
   */
  const [showTitle, setShowTitle] = useState('');
  const [startAt, setStartAt] = useState(todayStr());
  const [endAt, setEndAt] = useState('');

  const badDates = !!startAt && !!endAt && endAt < startAt;
  const canCreate = !!title.trim() && !!showTitle.trim() && !!coords && !badDates;

  const create = async () => {
    if (!canCreate || !coords) return;
    setSaving(true); setErr('');
    try {
      await call({
        action: 'create',
        title: title.trim(),
        tagline: tagline.trim(),
        placeName: placeName.trim(),
        theme,
        lat: coords.lat,
        lng: coords.lng,
        showTitle: showTitle.trim(),
        startAt,
        endAt,
      });
      playSound('success');
      setOpening(false);
      setTitle(''); setTagline(''); setPlaceName(''); setCoords(null);
      setShowTitle(''); setStartAt(todayStr()); setEndAt('');
      await onCreated();
    } catch (e) {
      setErr((e as Error).message);
      playSound('error');
    }
    setSaving(false);
  };

  return (
    <>
      {halls.length === 0 && !opening && (
        <div className="rounded-3xl p-6 text-center mb-3" style={card}>
          <div className="text-4xl mb-2">🖼️</div>
          <div className="text-[15px] font-black mb-1" style={{ color: 'var(--color-text-main)' }}>
            아직 전시관이 없어요
          </div>
          <div className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
            지도 위에 내 미술관을 세우고, 찍은 사진이나 그린 그림을 걸어
            누구에게나 보여줄 수 있어요.
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 mb-3">
        {halls.map((h) => (
          <button
            key={h.id}
            onClick={() => onOpen(h.id)}
            className="rounded-2xl p-3.5 text-left flex items-center gap-3"
            style={card}
          >
            <div
              className="h-12 w-12 shrink-0 rounded-xl overflow-hidden flex items-center justify-center"
              style={{ background: HALL_THEMES[h.theme]?.facade ?? '#E8E4DC' }}
            >
              {h.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.coverUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xl">🏛️</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-black truncate" style={{ color: 'var(--color-text-main)' }}>
                {h.title}
              </div>
              <div className="text-[12px] truncate" style={{ color: 'var(--color-text-sub)' }}>
                전시 {h.showCount ?? 0}개 · {h.placeName || '자리 지정됨'}
              </div>
              {/*
                **왜 지도에 없는지 여기서 말해준다.**
                '준비 중' 배지만 달아 뒀더니, 전시관을 열고도 지도에서 못 찾고
                "가려진 건가?" 하고 헤맸다. 배지는 상태를 알리지만
                **다음에 무엇을 할지는 안 알려준다.**
              */}
              {!h.isPublic && (
                <div className="text-[12px] font-bold mt-1" style={{ color: '#A6762A' }}>
                  {(h.showCount ?? 0) === 0
                    ? '아직 지도에 없어요 — 눌러서 전시를 만들어요'
                    : '아직 지도에 없어요 — 눌러서 공개하면 떠요'}
                </div>
              )}
            </div>
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black"
              style={h.isPublic
                ? { background: '#E6F4EA', color: '#1E7B45' }
                : { background: '#FFF1D6', color: '#A6762A' }}
            >
              {h.isPublic ? '지도에 있음' : '나만 보는 중'}
            </span>
          </button>
        ))}
      </div>

      {/* 새로 열기 */}
      {opening ? (
        <div className="rounded-3xl p-4" style={card}>
          <div className="text-sm font-black mb-3" style={{ color: 'var(--color-text-main)' }}>
            새 전시관 열기
          </div>

          <label className="text-[12px] font-bold" style={{ color: 'var(--color-text-sub)' }}>전시관 이름</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, LIMITS.title))}
            placeholder="예) 민준이의 바다 사진관"
            className={`${input} mt-1 mb-3`}
            style={inputStyle}
          />

          <label className="text-[12px] font-bold" style={{ color: 'var(--color-text-sub)' }}>한 줄 소개</label>
          <input
            value={tagline}
            onChange={(e) => setTagline(e.target.value.slice(0, LIMITS.tagline))}
            placeholder="예) 애월 바다를 3년 동안 찍었어요"
            className={`${input} mt-1 mb-3`}
            style={inputStyle}
          />

          {/*
            첫 전시 — **이름과 기간을 여기서 받는다.**

            실제 미술관은 '무엇을 언제까지 거는지' 를 정하고 문을 연다.
            기간이 있어야 건물 배너에 '전시 예정' · '3월 20일까지' 가 뜨고,
            보러 온 사람이 지금 볼 수 있는 것인지 배너만 보고 안다.
          */}
          <div
            className="rounded-2xl p-3 mb-3"
            style={{ background: 'var(--color-surface-soft)' }}
          >
            <div className="text-[12px] font-black mb-2" style={{ color: 'var(--color-text-main)' }}>
              🎫 첫 전시회
            </div>

            <label className="text-[12px] font-bold" style={{ color: 'var(--color-text-sub)' }}>전시회 이름</label>
            <input
              value={showTitle}
              onChange={(e) => setShowTitle(e.target.value.slice(0, LIMITS.showTitle))}
              placeholder="예) 애월 바다, 사계"
              className={`${input} mt-1 mb-2.5`}
              style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
            />

            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <label className="text-[12px] font-bold" style={{ color: 'var(--color-text-sub)' }}>시작</label>
                <input
                  type="date"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className={`${input} mt-1`}
                  style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <label className="text-[12px] font-bold" style={{ color: 'var(--color-text-sub)' }}>끝</label>
                <input
                  type="date"
                  value={endAt}
                  min={startAt || undefined}
                  onChange={(e) => setEndAt(e.target.value)}
                  className={`${input} mt-1`}
                  style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
                />
              </div>
            </div>
            <div className="text-[11px] mt-1.5" style={{ color: badDates ? '#C0392B' : 'var(--color-text-sub)' }}>
              {badDates
                ? '끝나는 날이 시작하는 날보다 빨라요'
                : endAt
                  ? `건물 배너에 “${showPeriod({ startAt, endAt }).badge} · ${showPeriod({ startAt, endAt }).note}” 로 걸려요`
                  : '끝나는 날을 비우면 상시 전시로 걸려요'}
            </div>
          </div>

          <label className="text-[12px] font-bold" style={{ color: 'var(--color-text-sub)' }}>
            지도에 세울 자리
          </label>
          <div className="mt-1">
            <LocationPicker
              coords={coords}
              onCoords={setCoords}
              placeName={placeName}
              onPlaceName={setPlaceName}
            />
          </div>

          <label className="block text-[12px] font-bold mt-3" style={{ color: 'var(--color-text-sub)' }}>
            전시장 분위기
          </label>
          <div className="flex gap-1.5 mt-1.5 mb-3">
            {Object.values(HALL_THEMES).map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className="flex-1 rounded-xl py-2 text-[12px] font-bold"
                style={theme === t.id
                  ? { background: 'var(--color-primary)', color: 'white' }
                  : { background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setOpening(false)}
              className="rounded-xl px-4 py-2.5 text-sm font-bold"
              style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
            >
              그만두기
            </button>
            <button
              onClick={create}
              disabled={saving || !canCreate}
              className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40"
              style={{ background: 'var(--color-primary)' }}
            >
              {saving ? '여는 중...' : '전시관 열기'}
            </button>
          </div>
          <p className="text-[12px] mt-2 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
            연 뒤에는 <b>나만 보는 중</b>이에요. 작품을 걸고 <b>공개하기</b>를 눌러야 지도에 뜹니다.
          </p>
        </div>
      ) : halls.length < MAX_HALLS_PER_USER ? (
        <button
          onClick={() => setOpening(true)}
          className="w-full rounded-2xl py-3 text-sm font-bold text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          + 새 전시관 열기
        </button>
      ) : (
        <p className="text-[12px] text-center" style={{ color: 'var(--color-text-sub)' }}>
          전시관은 {MAX_HALLS_PER_USER}개까지 열 수 있어요
        </p>
      )}
    </>
  );
}

/* ══════════════════════ 전시관 하나 ══════════════════════ */

function HallDetail({
  hall, shows, busy, setBusy, setErr, call, reloadHalls, reloadShows, onOpenShow, onDeleted, ownerName,
}: {
  hall: HallRow;
  shows: ShowRow[];
  busy: string;
  setBusy: (s: string) => void;
  setErr: (s: string) => void;
  call: (b: Record<string, unknown>) => Promise<Record<string, unknown>>;
  reloadHalls: () => Promise<void>;
  reloadShows: () => Promise<void>;
  onOpenShow: (showId: string) => void;
  onDeleted: () => void;
  ownerName: string;
}) {
  const [title, setTitle] = useState(hall.title);
  const [tagline, setTagline] = useState(hall.tagline);
  const [intro, setIntro] = useState(hall.intro ?? '');
  const [theme, setTheme] = useState<HallTheme>(hall.theme);
  const [dirty, setDirty] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const coverRef = useRef<HTMLInputElement>(null);

  /**
   * 지도 마커에 쓰는 대표 이미지.
   *
   * 없으면 지도에 **이모지 액자**만 뜬다 — 전시관이 여럿이면 다 똑같아 보여서
   * 어느 것이 누구 것인지 알 수 없다. 마커는 작으니 작게 줄여 올린다.
   */
  const pickCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !storage || !db) return;
    setBusy('cover'); setErr('');
    try {
      const small = await resizeImage(f, 600);
      const blob = small?.blob ?? f;
      const r = ref(storage, `halls/${hall.ownerUid}/${hall.id}-cover-${Date.now()}.jpg`);
      await uploadBytes(r, blob);
      const url = await getDownloadURL(r);
      await updateDoc(doc(db, 'halls', hall.id), { coverUrl: url });
      playSound('success');
      await reloadHalls();
    } catch {
      setErr('대표 이미지를 올리지 못했어요.');
    }
    setBusy('');
  };

  /**
   * 전시 차례 바꾸기 — **앞 4개만 건물 앞 배너에 걸린다.**
   * 순서를 못 바꾸면 나중에 만든 전시를 앞으로 낼 방법이 없다.
   */
  const moveShow = async (idx: number, dir: -1 | 1) => {
    if (!db) return;
    const to = idx + dir;
    if (to < 0 || to >= shows.length) return;
    setBusy('move');
    try {
      const a = shows[idx];
      const b = shows[to];
      await Promise.all([
        updateDoc(doc(db, 'halls', hall.id, 'shows', a.id), { order: to }),
        updateDoc(doc(db, 'halls', hall.id, 'shows', b.id), { order: idx }),
      ]);
      await reloadShows();
    } catch {
      setErr('순서를 바꾸지 못했어요.');
    }
    setBusy('');
  };

  useEffect(() => {
    setTitle(hall.title); setTagline(hall.tagline);
    setIntro(hall.intro ?? ''); setTheme(hall.theme); setDirty(false);
  }, [hall]);

  const save = async () => {
    if (!db) return;
    setBusy('hall'); setErr('');
    try {
      await updateDoc(doc(db, 'halls', hall.id), {
        title: title.trim().slice(0, LIMITS.title),
        tagline: tagline.trim().slice(0, LIMITS.tagline),
        intro: intro.trim().slice(0, LIMITS.intro),
        theme,
        updatedAt: new Date(),
      });
      playSound('success');
      setDirty(false);
      await reloadHalls();
    } catch {
      setErr('저장하지 못했어요.');
    }
    setBusy('');
  };

  const togglePublic = async () => {
    setBusy('pub'); setErr('');
    try {
      await call({ action: 'publish', hallId: hall.id, isPublic: !hall.isPublic });
      playSound('success');
      await reloadHalls();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy('');
  };

  const remove = async () => {
    setBusy('del'); setErr('');
    try {
      await call({ action: 'delete', hallId: hall.id });
      onDeleted();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy('');
  };

  const addShow = async () => {
    if (!db) return;
    setBusy('addshow'); setErr('');
    try {
      const id = `show-${Date.now()}`;
      await setDoc(doc(db, 'halls', hall.id, 'shows', id), {
        hallId: hall.id,
        ownerUid: hall.ownerUid,
        isPublic: hall.isPublic,
        title: '새 전시',
        subtitle: '',
        intro: '',
        posterUrl: '',
        // 기간을 안 적으면 '상시 전시' 로 걸린다 — 아래 전시 화면에서 고친다
        startAt: todayStr(),
        endAt: '',
        order: shows.length,
        workCount: 0,
        createdAt: new Date(),
      });
      await updateDoc(doc(db, 'halls', hall.id), { showCount: shows.length + 1 });
      await reloadShows();
      await reloadHalls();
      onOpenShow(id);
    } catch {
      setErr('전시를 만들지 못했어요.');
    }
    setBusy('');
  };

  const mark = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); };

  return (
    <>
      {/* 공개 상태 */}
      <div className="rounded-2xl p-3.5 mb-3 flex items-center gap-3" style={card}>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-black" style={{ color: 'var(--color-text-main)' }}>
            {hall.isPublic ? '🌏 지도에 공개 중' : '🔒 나만 보는 중'}
          </div>
          <div className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
            {hall.isPublic
              ? '누구나 지도에서 찾아와 볼 수 있어요.'
              : '공개하면 지도에 마커가 생겨요.'}
          </div>
        </div>
        <button
          onClick={togglePublic}
          disabled={!!busy}
          className="shrink-0 rounded-xl px-4 py-2.5 text-[13px] font-bold disabled:opacity-40"
          style={hall.isPublic
            ? { background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }
            : { background: 'var(--color-primary)', color: 'white' }}
        >
          {busy === 'pub' ? '...' : hall.isPublic ? '감추기' : '공개하기'}
        </button>
      </div>

      {/* 전시 목록 */}
      <div className="rounded-3xl p-4 mb-3" style={card}>
        <div className="flex items-center gap-2 mb-2">
          <div className="text-sm font-black" style={{ color: 'var(--color-text-main)' }}>
            🎫 전시 (배너)
          </div>
          <div className="text-[12px]" style={{ color: 'var(--color-text-sub)' }}>
            앞쪽 {BANNER_SLOTS}개가 건물 앞에 걸려요
          </div>
        </div>

        {shows.length === 0 ? (
          <div className="text-[13px] leading-relaxed mb-3" style={{ color: 'var(--color-text-sub)' }}>
            아직 전시가 없어요. 전시를 만들면 미술관 앞에 <b>세로 배너</b>가 걸립니다.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 mb-3">
            {shows.map((s, i) => (
              <div
                key={s.id}
                className="rounded-2xl p-2.5 flex items-center gap-2.5"
                style={{ background: 'var(--color-surface-soft)' }}
              >
                {/* 차례 바꾸기 — 앞 4개만 배너에 걸리므로 순서가 곧 자리다 */}
                <div className="flex flex-col gap-0.5 shrink-0">
                  {([-1, 1] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => moveShow(i, d)}
                      disabled={!!busy || (d === -1 ? i === 0 : i === shows.length - 1)}
                      className="h-6 w-6 rounded-md text-[11px] font-black disabled:opacity-25"
                      style={{ background: 'var(--color-surface)', color: 'var(--color-text-sub)' }}
                      aria-label={d === -1 ? '앞으로' : '뒤로'}
                    >
                      {d === -1 ? '▲' : '▼'}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => onOpenShow(s.id)}
                  className="min-w-0 flex-1 text-left flex items-center gap-2.5"
                >
                  <div
                    className="h-14 w-10 shrink-0 rounded-md overflow-hidden flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.06)' }}
                  >
                    {s.posterUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.posterUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[11px]" style={{ color: '#A89880' }}>사진</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14px] font-bold truncate" style={{ color: 'var(--color-text-main)' }}>
                        {s.title}
                      </span>
                      {/* 지금이 어느 때인지 — 건물 배너에 걸리는 것과 같은 말 */}
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black text-white"
                        style={{ background: PHASE_COLOR[showPeriod(s).phase] }}
                      >
                        {showPeriod(s).badge}
                      </span>
                    </div>
                    <div className="text-[12px]" style={{ color: 'var(--color-text-sub)' }}>
                      작품 {s.workCount ?? 0}점
                      {showPeriod(s).note ? ` · ${showPeriod(s).note}` : ''}
                      {i < BANNER_SLOTS ? ' · 배너에 걸림' : ' · 배너 밖'}
                    </div>
                  </div>
                  <span className="shrink-0 text-[13px]" style={{ color: 'var(--color-text-sub)' }}>›</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {shows.length < MAX_SHOWS_PER_HALL && (
          <button
            onClick={addShow}
            disabled={!!busy}
            className="w-full rounded-xl py-2.5 text-sm font-bold disabled:opacity-40"
            style={{ background: 'var(--color-primary)', color: 'white' }}
          >
            {busy === 'addshow' ? '만드는 중...' : '+ 전시 만들기'}
          </button>
        )}
      </div>

      {/* 전시관 정보 */}
      <div className="rounded-3xl p-4 mb-3" style={card}>
        <div className="text-sm font-black mb-3" style={{ color: 'var(--color-text-main)' }}>
          전시관 정보
        </div>

        {/* 지도 마커에 쓰는 대표 이미지 */}
        <label className="block text-[12px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>
          대표 이미지 (지도 마커)
        </label>
        <div className="flex items-center gap-2.5 mb-3">
          <div
            className="h-16 w-16 shrink-0 overflow-hidden flex items-center justify-center"
            style={{ background: 'var(--color-surface-soft)', borderRadius: 8 }}
          >
            {hall.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hall.coverUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl">🖼️</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <button
              onClick={() => coverRef.current?.click()}
              disabled={!!busy}
              className="w-full rounded-xl py-2.5 text-[13px] font-bold disabled:opacity-40"
              style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
            >
              {busy === 'cover' ? '올리는 중...' : hall.coverUrl ? '다른 사진으로' : '사진 고르기'}
            </button>
            <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
              없으면 지도에서 다른 전시관과 <b>똑같아 보여요</b>
            </p>
          </div>
          <input ref={coverRef} type="file" accept="image/*" hidden onChange={pickCover} />
        </div>

        <label className="text-[12px] font-bold" style={{ color: 'var(--color-text-sub)' }}>이름</label>
        <input
          value={title}
          onChange={(e) => mark(setTitle)(e.target.value.slice(0, LIMITS.title))}
          className={`${input} mt-1 mb-3`}
          style={inputStyle}
        />

        <label className="text-[12px] font-bold" style={{ color: 'var(--color-text-sub)' }}>한 줄 소개</label>
        <input
          value={tagline}
          onChange={(e) => mark(setTagline)(e.target.value.slice(0, LIMITS.tagline))}
          className={`${input} mt-1 mb-3`}
          style={inputStyle}
        />

        <label className="text-[12px] font-bold" style={{ color: 'var(--color-text-sub)' }}>
          관장의 말 (전시관 소개)
        </label>
        <textarea
          value={intro}
          onChange={(e) => mark(setIntro)(e.target.value.slice(0, LIMITS.intro))}
          rows={4}
          placeholder={`${ownerName}의 전시관에 오신 것을 환영합니다…`}
          className={`${input} mt-1 mb-3 resize-none`}
          style={inputStyle}
        />

        <label className="block text-[12px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>
          전시장 분위기
        </label>
        <div className="flex gap-1.5 mb-3">
          {Object.values(HALL_THEMES).map((t) => (
            <button
              key={t.id}
              onClick={() => mark(setTheme)(t.id)}
              className="flex-1 rounded-xl py-2 text-[12px] font-bold"
              style={theme === t.id
                ? { background: 'var(--color-primary)', color: 'white' }
                : { background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          onClick={save}
          disabled={!dirty || !!busy || !title.trim()}
          className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40"
          style={{ background: 'var(--color-primary)' }}
        >
          {busy === 'hall' ? '저장 중...' : dirty ? '저장하기' : '저장됨'}
        </button>
      </div>

      {/* 지우기 */}
      <div className="rounded-3xl p-4" style={card}>
        {confirmDel ? (
          <>
            <div className="text-[13px] leading-relaxed mb-2.5" style={{ color: '#B02A37' }}>
              <b>{hall.title}</b> 과 그 안의 전시·작품이 <b>모두</b> 지워져요. 되돌릴 수 없어요.
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDel(false)}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
              >
                그만두기
              </button>
              <button
                onClick={remove}
                disabled={!!busy}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40"
                style={{ background: '#C0392B' }}
              >
                {busy === 'del' ? '지우는 중...' : '정말 지우기'}
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={() => setConfirmDel(true)}
            className="w-full rounded-xl py-2.5 text-[13px] font-bold"
            style={{ background: 'transparent', color: '#C0392B', border: '1px solid #F0C4BE' }}
          >
            전시관 지우기
          </button>
        )}
      </div>
    </>
  );
}

/* ══════════════════════ 전시 하나 ══════════════════════ */

function ShowDetail({
  hall, show, works, uid, busy, setBusy, setErr, reloadShows, reloadWorks, onDeleted,
}: {
  hall: HallRow;
  show: ShowRow;
  works: WorkRow[];
  uid: string;
  busy: string;
  setBusy: (s: string) => void;
  setErr: (s: string) => void;
  reloadShows: () => Promise<void>;
  reloadWorks: () => Promise<void>;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(show.title);
  const [subtitle, setSubtitle] = useState(show.subtitle ?? '');
  const [intro, setIntro] = useState(show.intro ?? '');
  /** 전시 기간 — 건물 배너에 그대로 걸린다 */
  const [startAt, setStartAt] = useState(show.startAt ?? '');
  const [endAt, setEndAt] = useState(show.endAt ?? '');
  const [dirty, setDirty] = useState(false);
  const badDates = !!startAt && !!endAt && endAt < startAt;
  const [pending, setPending] = useState<Pending[]>([]);
  const [uploading, setUploading] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  /** 지금 고치는 중인 작품. null 이면 닫혀 있다. */
  const [editing, setEditing] = useState<WorkRow | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const posterRef = useRef<HTMLInputElement>(null);

  /** 작품 차례 바꾸기 — 앞쪽이 뒷벽(들어서면 정면)에 걸린다 */
  const moveWork = async (workId: string, dir: -1 | 1) => {
    if (!db) return;
    const idx = works.findIndex((w) => w.id === workId);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= works.length) return;
    setBusy('movew');
    try {
      const a = works[idx];
      const b = works[to];
      const base = `halls/${hall.id}/shows/${show.id}/works`;
      await Promise.all([
        updateDoc(doc(db, base, a.id), { order: to }),
        updateDoc(doc(db, base, b.id), { order: idx }),
      ]);
      await reloadWorks();
    } catch {
      setErr('차례를 바꾸지 못했어요.');
    }
    setBusy('');
  };

  useEffect(() => {
    setTitle(show.title); setSubtitle(show.subtitle ?? '');
    setIntro(show.intro ?? ''); setDirty(false);
    setStartAt(show.startAt ?? ''); setEndAt(show.endAt ?? '');
  }, [show]);

  // 미리보기 주소는 컴포넌트가 사라질 때 돌려준다 (안 하면 메모리가 샌다)
  useEffect(() => () => { pending.forEach((p) => URL.revokeObjectURL(p.previewUrl)); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);

  const saveShow = async () => {
    if (!db) return;
    setBusy('show'); setErr('');
    try {
      await updateDoc(doc(db, 'halls', hall.id, 'shows', show.id), {
        title: title.trim().slice(0, LIMITS.showTitle) || '무제 전시',
        subtitle: subtitle.trim().slice(0, LIMITS.subtitle),
        intro: intro.trim().slice(0, LIMITS.showIntro),
        // 꼴이 어긋나면 빈 값(상시)으로 — 서버가 만들 때 보는 기준과 같다
        startAt: /^\d{4}-\d{2}-\d{2}$/.test(startAt) ? startAt : '',
        endAt: /^\d{4}-\d{2}-\d{2}$/.test(endAt) ? endAt : '',
      });
      playSound('success');
      setDirty(false);
      await reloadShows();
    } catch {
      setErr('저장하지 못했어요.');
    }
    setBusy('');
  };

  /** 배너에 걸 대표 이미지 */
  const pickPoster = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !storage || !db) return;
    setBusy('poster'); setErr('');
    try {
      // 배너 썸네일은 작게 — 미술관 앞에서 여러 장이 한꺼번에 뜬다
      const small = await resizeImage(f, 900);
      const blob = small?.blob ?? f;
      const r = ref(storage, `halls/${uid}/${show.id}-poster-${Date.now()}.jpg`);
      await uploadBytes(r, blob);
      const url = await getDownloadURL(r);
      await updateDoc(doc(db, 'halls', hall.id, 'shows', show.id), { posterUrl: url });
      playSound('success');
      await reloadShows();
    } catch {
      setErr('대표 이미지를 올리지 못했어요.');
    }
    setBusy('');
  };

  /**
   * 사진 고르기 — 고르는 즉시 **보정을 걸어 둔다.**
   * 제목을 적는 동안 뒤에서 돌아가므로 기다리는 느낌이 없다.
   * (학교 작품 업로드에서 쓰던 것과 같은 길 — `/api/enhance`)
   */
  const pickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (files.length === 0) return;

    const room = MAX_WORKS_PER_SHOW - works.length - pending.length;
    if (room <= 0) { setErr(`한 전시에 ${MAX_WORKS_PER_SHOW}점까지 걸 수 있어요.`); return; }

    const next: Pending[] = files.slice(0, room).map((f, i) => ({
      id: `p-${Date.now()}-${i}`,
      file: f,
      previewUrl: URL.createObjectURL(f),
      title: f.name.replace(/\.[^.]+$/, '').slice(0, LIMITS.workTitle),
      takenAt: '',
      caption: '',
      status: 'waiting',
      fixed: null,
      useFixed: true,
    }));
    setPending((p) => [...p, ...next]);

    // 하나씩 차례로 — 한꺼번에 보내면 서버가 몰린다
    for (const item of next) {
      setPending((p) => p.map((x) => (x.id === item.id ? { ...x, status: 'fixing' } : x)));
      try {
        const fd = new FormData();
        fd.append('image', item.file);
        const res = await fetch('/api/enhance', { method: 'POST', body: fd });
        const blob = res.ok ? await res.blob() : null;
        setPending((p) => p.map((x) => (x.id === item.id ? { ...x, fixed: blob, status: 'ready' } : x)));
      } catch {
        // 보정에 실패해도 원본으로 올린다 — 보정 때문에 전시가 막히면 안 된다
        setPending((p) => p.map((x) => (x.id === item.id ? { ...x, status: 'ready' } : x)));
      }
    }
  };

  const uploadAll = async () => {
    if (!db || !storage || pending.length === 0) return;
    setUploading(true); setErr('');
    try {
      let order = works.length;
      for (const p of pending) {
        const blob = p.useFixed && p.fixed ? p.fixed : p.file;
        const workId = `w-${Date.now()}-${order}`;
        const r = ref(storage, `halls/${uid}/${workId}.jpg`);
        await uploadBytes(r, blob);
        const imageUrl = await getDownloadURL(r);

        /**
         * 벽에 거는 작은 판을 따로 올린다.
         * 스물다섯 점짜리 방이 원본으로만 뜨면 휴대폰에서 한참 안 열린다.
         * 못 만들면 원본을 쓴다 — 썸네일 때문에 전시가 막히면 안 된다.
         */
        let thumbnailUrl = imageUrl;
        const thumb = await resizeImage(blob);
        if (thumb) {
          try {
            const tr = ref(storage, `halls/${uid}/${workId}-thumb.jpg`);
            await uploadBytes(tr, thumb.blob);
            thumbnailUrl = await getDownloadURL(tr);
          } catch { /* 원본 주소를 그대로 쓴다 */ }
        }

        await setDoc(doc(db, 'halls', hall.id, 'shows', show.id, 'works', workId), {
          hallId: hall.id,
          showId: show.id,
          ownerUid: uid,
          isPublic: hall.isPublic,
          imageUrl,
          thumbnailUrl,
          title: p.title.trim().slice(0, LIMITS.workTitle),
          caption: p.caption.trim().slice(0, LIMITS.caption),
          takenAt: p.takenAt.trim().slice(0, LIMITS.takenAt),
          order: order++,
          createdAt: new Date(),
        });
      }
      await updateDoc(doc(db, 'halls', hall.id, 'shows', show.id), { workCount: order });
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPending([]);
      playSound('success');
      await Promise.all([reloadWorks(), reloadShows()]);
    } catch {
      setErr('작품을 올리지 못했어요.');
      playSound('error');
    }
    setUploading(false);
  };

  const removeWork = async (workId: string) => {
    if (!db) return;
    setBusy(workId);
    try {
      await deleteDoc(doc(db, 'halls', hall.id, 'shows', show.id, 'works', workId));
      await updateDoc(doc(db, 'halls', hall.id, 'shows', show.id), {
        workCount: Math.max(0, works.length - 1),
      });
      await Promise.all([reloadWorks(), reloadShows()]);
    } catch {
      setErr('지우지 못했어요.');
    }
    setBusy('');
  };

  const removeShow = async () => {
    if (!db) return;
    setBusy('delshow');
    try {
      // 작품부터 지운다 — 전시만 지우면 작품이 갈 곳 없이 남는다
      for (const w of works) {
        await deleteDoc(doc(db, 'halls', hall.id, 'shows', show.id, 'works', w.id));
      }
      await deleteDoc(doc(db, 'halls', hall.id, 'shows', show.id));
      onDeleted();
    } catch {
      setErr('지우지 못했어요.');
    }
    setBusy('');
  };

  const patchPending = (id: string, patch: Partial<Pending>) =>
    setPending((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const stillFixing = pending.some((p) => p.status !== 'ready');

  return (
    <>
      {/* 전시 정보 */}
      <div className="rounded-3xl p-4 mb-3" style={card}>
        <label className="text-[12px] font-bold" style={{ color: 'var(--color-text-sub)' }}>전시 제목</label>
        <input
          value={title}
          onChange={(e) => { setTitle(e.target.value.slice(0, LIMITS.showTitle)); setDirty(true); }}
          placeholder="예) 애월 바다, 사계"
          className={`${input} mt-1 mb-3`}
          style={inputStyle}
        />
        <label className="text-[12px] font-bold" style={{ color: 'var(--color-text-sub)' }}>부제</label>
        <input
          value={subtitle}
          onChange={(e) => { setSubtitle(e.target.value.slice(0, LIMITS.subtitle)); setDirty(true); }}
          placeholder="예) 2026 봄 사진전"
          className={`${input} mt-1 mb-3`}
          style={inputStyle}
        />
        {/*
          전시 기간 — **건물 배너에 그대로 걸린다.**
          아래 미리보기가 배너에 뜰 말과 같아서, 저장 전에 확인할 수 있다.
        */}
        <label className="text-[12px] font-bold" style={{ color: 'var(--color-text-sub)' }}>전시 기간</label>
        <div className="flex gap-2 mt-1">
          <input
            type="date"
            value={startAt}
            onChange={(e) => { setStartAt(e.target.value); setDirty(true); }}
            className={`${input} flex-1 min-w-0`}
            style={inputStyle}
          />
          <input
            type="date"
            value={endAt}
            min={startAt || undefined}
            onChange={(e) => { setEndAt(e.target.value); setDirty(true); }}
            className={`${input} flex-1 min-w-0`}
            style={inputStyle}
          />
        </div>
        <div
          className="text-[11px] mt-1.5 mb-3 font-bold"
          style={{ color: badDates ? '#C0392B' : PHASE_COLOR[showPeriod({ startAt, endAt }).phase] }}
        >
          {badDates
            ? '끝나는 날이 시작하는 날보다 빨라요'
            : `배너: ${showPeriod({ startAt, endAt }).badge}`
              + (showPeriod({ startAt, endAt }).note ? ` · ${showPeriod({ startAt, endAt }).note}` : '')}
        </div>

        <label className="text-[12px] font-bold" style={{ color: 'var(--color-text-sub)' }}>전시 소개</label>
        <textarea
          value={intro}
          onChange={(e) => { setIntro(e.target.value.slice(0, LIMITS.showIntro)); setDirty(true); }}
          rows={3}
          className={`${input} mt-1 mb-3 resize-none`}
          style={inputStyle}
        />

        <label className="block text-[12px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>
          배너 대표 이미지
        </label>
        <div className="flex items-center gap-2.5 mb-3">
          <div
            className="h-20 w-14 shrink-0 rounded-md overflow-hidden flex items-center justify-center"
            style={{ background: 'var(--color-surface-soft)' }}
          >
            {show.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={show.posterUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[11px]" style={{ color: '#A89880' }}>없음</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <button
              onClick={() => posterRef.current?.click()}
              disabled={!!busy}
              className="w-full rounded-xl py-2.5 text-[13px] font-bold disabled:opacity-40"
              style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
            >
              {busy === 'poster' ? '올리는 중...' : show.posterUrl ? '다른 사진으로' : '사진 고르기'}
            </button>
            <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
              미술관 앞 세로 배너에 걸려요
            </p>
          </div>
          <input ref={posterRef} type="file" accept="image/*" hidden onChange={pickPoster} />
        </div>

        <button
          onClick={saveShow}
          disabled={!dirty || !!busy}
          className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40"
          style={{ background: 'var(--color-primary)' }}
        >
          {busy === 'show' ? '저장 중...' : dirty ? '저장하기' : '저장됨'}
        </button>
      </div>

      {/* 작품 올리기 */}
      <div className="rounded-3xl p-4 mb-3" style={card}>
        <div className="flex items-center gap-2 mb-2">
          <div className="text-sm font-black" style={{ color: 'var(--color-text-main)' }}>
            🖼️ 작품
          </div>
          <div className="text-[12px]" style={{ color: 'var(--color-text-sub)' }}>
            {works.length} / {MAX_WORKS_PER_SHOW}점
          </div>
        </div>

        {pending.length > 0 && (
          <div className="flex flex-col gap-2 mb-3">
            {pending.map((p) => (
              <div key={p.id} className="rounded-2xl p-2.5" style={{ background: 'var(--color-surface-soft)' }}>
                <div className="flex gap-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.useFixed && p.fixed ? URL.createObjectURL(p.fixed) : p.previewUrl}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                    <input
                      value={p.title}
                      onChange={(e) => patchPending(p.id, { title: e.target.value.slice(0, LIMITS.workTitle) })}
                      placeholder="작품 제목"
                      className="w-full rounded-lg px-2.5 py-1.5 text-[13px] outline-none"
                      style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
                    />
                    <input
                      value={p.takenAt}
                      onChange={(e) => patchPending(p.id, { takenAt: e.target.value.slice(0, LIMITS.takenAt) })}
                      placeholder="찍은 곳·때 (예: 곽지, 2026 여름)"
                      className="w-full rounded-lg px-2.5 py-1.5 text-[13px] outline-none"
                      style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[11px] font-bold" style={{ color: 'var(--color-text-sub)' }}>
                    {p.status === 'ready'
                      ? p.fixed ? '✨ 보정됨' : '원본'
                      : '보정 중...'}
                  </span>
                  {p.fixed && (
                    <button
                      onClick={() => patchPending(p.id, { useFixed: !p.useFixed })}
                      className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                      style={{ background: 'var(--color-surface)', color: 'var(--color-text-sub)' }}
                    >
                      {p.useFixed ? '원본으로' : '보정본으로'}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      URL.revokeObjectURL(p.previewUrl);
                      setPending((prev) => prev.filter((x) => x.id !== p.id));
                    }}
                    className="ml-auto rounded-full px-2.5 py-1 text-[11px] font-bold"
                    style={{ background: '#FDECEA', color: '#B02A37' }}
                  >
                    빼기
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={uploadAll}
              disabled={uploading || stillFixing}
              className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40"
              style={{ background: 'var(--color-primary)' }}
            >
              {uploading ? '거는 중...' : stillFixing ? '보정 기다리는 중...' : `${pending.length}점 걸기`}
            </button>
          </div>
        )}

        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading || works.length + pending.length >= MAX_WORKS_PER_SHOW}
          className="w-full rounded-xl py-2.5 text-sm font-bold disabled:opacity-40"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
        >
          + 사진 고르기 (여러 장 가능)
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={pickFiles} />
        <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
          올리면 <b>자동으로 반듯하게 잘리고 밝기가 맞춰져요.</b> 마음에 안 들면 원본으로 되돌릴 수 있어요.
        </p>

        {/*
          걸린 작품들 — **눌러서 고친다.**
          예전에는 ✕(지우기)뿐이라, 제목에 오타 하나만 나도 작품을 지웠다가
          다시 올려야 했다. 칠판에는 '고치기' 를 넣어놓고 여기만 빠져 있었다.
        */}
        {works.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5 mt-3">
            {works.map((w, i) => (
              <button
                key={w.id}
                onClick={() => setEditing(w)}
                className="relative rounded-lg overflow-hidden"
                style={{ aspectRatio: '1' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={w.thumbnailUrl || w.imageUrl}
                  alt={w.title}
                  className="h-full w-full object-cover"
                />
                {/* 몇 번째로 걸리는지 — 벽에 거는 차례다 */}
                <div
                  className="absolute left-1 top-1 h-5 min-w-5 px-1 rounded-full text-[10px] font-black flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.6)', color: 'white' }}
                >
                  {i + 1}
                </div>
                <div
                  className="absolute inset-x-0 bottom-0 px-1.5 py-1 text-[10px] font-bold truncate text-left"
                  style={{ background: 'rgba(0,0,0,0.55)', color: 'white' }}
                >
                  {w.title || '무제'}
                </div>
              </button>
            ))}
          </div>
        )}
        {works.length > 0 && (
          <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-text-sub)' }}>
            작품을 누르면 제목·설명을 고치고 차례를 바꿀 수 있어요
          </p>
        )}
      </div>

      {/* 작품 고치기 */}
      {editing && (
        <WorkEditor
          hallId={hall.id}
          showId={show.id}
          work={editing}
          index={works.findIndex((w) => w.id === editing.id)}
          total={works.length}
          busy={busy}
          onMove={(d) => moveWork(editing.id, d)}
          onRemove={async () => { await removeWork(editing.id); setEditing(null); }}
          onSaved={async () => { await reloadWorks(); setEditing(null); }}
          onClose={() => setEditing(null)}
          setErr={setErr}
          setBusy={setBusy}
        />
      )}

      {/* 전시 지우기 */}
      <div className="rounded-3xl p-4" style={card}>
        {confirmDel ? (
          <>
            <div className="text-[13px] leading-relaxed mb-2.5" style={{ color: '#B02A37' }}>
              <b>{show.title}</b> 과 작품 {works.length}점이 지워져요. 되돌릴 수 없어요.
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDel(false)}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
              >
                그만두기
              </button>
              <button
                onClick={removeShow}
                disabled={!!busy}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40"
                style={{ background: '#C0392B' }}
              >
                {busy === 'delshow' ? '지우는 중...' : '정말 지우기'}
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={() => setConfirmDel(true)}
            className="w-full rounded-xl py-2.5 text-[13px] font-bold"
            style={{ background: 'transparent', color: '#C0392B', border: '1px solid #F0C4BE' }}
          >
            이 전시 지우기
          </button>
        )}
      </div>
    </>
  );
}

/* ══════════════════════ 작품 고치기 ══════════════════════ */

/**
 * 걸린 작품 하나를 고친다 — 제목·찍은 곳·작가의 말, 그리고 걸리는 차례.
 *
 * **올릴 때만 적을 수 있으면 안 된다.** 오타 하나 때문에 작품을 지웠다가
 * 다시 올리게 하는 것은 고칠 수 없다고 말하는 것과 같다.
 */
function WorkEditor({
  hallId, showId, work, index, total, busy, onMove, onRemove, onSaved, onClose, setErr, setBusy,
}: {
  hallId: string;
  showId: string;
  work: WorkRow;
  index: number;
  total: number;
  busy: string;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => Promise<void>;
  onSaved: () => Promise<void>;
  onClose: () => void;
  setErr: (s: string) => void;
  setBusy: (s: string) => void;
}) {
  const [title, setTitle] = useState(work.title ?? '');
  const [takenAt, setTakenAt] = useState(work.takenAt ?? '');
  const [caption, setCaption] = useState(work.caption ?? '');
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    setTitle(work.title ?? '');
    setTakenAt(work.takenAt ?? '');
    setCaption(work.caption ?? '');
    setConfirmDel(false);
  }, [work]);

  const save = async () => {
    if (!db) return;
    setBusy('editw'); setErr('');
    try {
      await updateDoc(doc(db, 'halls', hallId, 'shows', showId, 'works', work.id), {
        title: title.trim().slice(0, LIMITS.workTitle),
        takenAt: takenAt.trim().slice(0, LIMITS.takenAt),
        caption: caption.trim().slice(0, LIMITS.caption),
      });
      playSound('success');
      await onSaved();
    } catch {
      setErr('고치지 못했어요.');
    }
    setBusy('');
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center px-4 py-6"
      style={{ background: 'rgba(24,20,16,0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] rounded-3xl p-4 max-h-[88vh] overflow-y-auto"
        style={{ background: 'var(--color-bg)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="text-sm font-black" style={{ color: 'var(--color-text-main)' }}>
            🛠️ 작품 고치기
          </div>
          <button
            onClick={onClose}
            className="ml-auto rounded-full px-3.5 py-1.5 text-[13px] font-bold"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text-sub)' }}
          >
            닫기
          </button>
        </div>

        <div className="flex gap-3 mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={work.thumbnailUrl || work.imageUrl}
            alt=""
            className="h-24 w-24 shrink-0 rounded-xl object-cover"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-bold mb-1" style={{ color: 'var(--color-text-sub)' }}>
              벽에 걸리는 차례
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onMove(-1)}
                disabled={!!busy || index <= 0}
                className="h-9 w-9 rounded-lg text-[13px] font-black disabled:opacity-30"
                style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
              >
                ▲
              </button>
              <span className="text-[14px] font-black" style={{ color: 'var(--color-text-main)' }}>
                {index + 1} / {total}
              </span>
              <button
                onClick={() => onMove(1)}
                disabled={!!busy || index >= total - 1}
                className="h-9 w-9 rounded-lg text-[13px] font-black disabled:opacity-30"
                style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
              >
                ▼
              </button>
            </div>
            <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
              앞쪽 작품이 <b>들어서면 정면인 뒷벽</b>에 걸려요
            </p>
          </div>
        </div>

        <label className="text-[12px] font-bold" style={{ color: 'var(--color-text-sub)' }}>작품 제목</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, LIMITS.workTitle))}
          className={`${input} mt-1 mb-3`}
          style={inputStyle}
        />

        <label className="text-[12px] font-bold" style={{ color: 'var(--color-text-sub)' }}>찍은 곳·때</label>
        <input
          value={takenAt}
          onChange={(e) => setTakenAt(e.target.value.slice(0, LIMITS.takenAt))}
          placeholder="예) 곽지, 2026 여름"
          className={`${input} mt-1 mb-3`}
          style={inputStyle}
        />

        <label className="text-[12px] font-bold" style={{ color: 'var(--color-text-sub)' }}>작가의 말</label>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value.slice(0, LIMITS.caption))}
          rows={4}
          placeholder="이 작품에 대해 하고 싶은 말"
          className={`${input} mt-1 mb-3 resize-none`}
          style={inputStyle}
        />

        <button
          onClick={save}
          disabled={!!busy}
          className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40 mb-2"
          style={{ background: 'var(--color-primary)' }}
        >
          {busy === 'editw' ? '고치는 중...' : '이대로 고치기'}
        </button>

        {confirmDel ? (
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDel(false)}
              className="flex-1 rounded-xl py-2.5 text-[13px] font-bold"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
            >
              그만두기
            </button>
            <button
              onClick={onRemove}
              disabled={!!busy}
              className="flex-1 rounded-xl py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
              style={{ background: '#C0392B' }}
            >
              정말 지우기
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDel(true)}
            className="w-full rounded-xl py-2.5 text-[13px] font-bold"
            style={{ background: 'transparent', color: '#C0392B', border: '1px solid #F0C4BE' }}
          >
            이 작품 지우기
          </button>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════ 자리 고르기 ══════════════════════ */

/**
 * 지도에 세울 자리를 고른다 — **만들 때와 고칠 때가 같은 것을 쓴다.**
 *
 * 처음에는 만들 때만 자리를 정할 수 있었다. 그런데 사람이 백록담에 유럽 전시관을
 * 열어두고 나서야 자리를 잘못 골랐다는 것을 알았고, **옮길 방법이 없었다.**
 * 두 군데에 같은 것을 두 벌 쓰면 반드시 한쪽이 낡으므로 여기 한 벌만 둔다.
 */
function LocationPicker({
  coords, onCoords, placeName, onPlaceName,
}: {
  coords: { lat: number; lng: number } | null;
  onCoords: (c: { lat: number; lng: number }) => void;
  placeName: string;
  onPlaceName: (s: string) => void;
}) {
  const [addr, setAddr] = useState('');
  const [finding, setFinding] = useState(false);
  const [msg, setMsg] = useState('');

  /** 주소 → 좌표 (OpenStreetMap Nominatim, 열쇠 없이 쓴다) */
  const searchAddress = async () => {
    if (!addr.trim()) return;
    setFinding(true); setMsg('');
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addr)}`,
        { headers: { 'Accept-Language': 'ko' } }
      );
      const json = await res.json();
      if (Array.isArray(json) && json.length > 0) {
        onCoords({ lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon) });
        setMsg(`📍 ${json[0].display_name}`);
        if (!placeName.trim()) onPlaceName(addr.trim().slice(0, LIMITS.placeName));
      } else {
        setMsg('그 주소를 찾지 못했어요. 더 자세히 적어보세요.');
      }
    } catch {
      setMsg('주소를 찾지 못했어요.');
    }
    setFinding(false);
  };

  /** 지금 있는 자리로 — 휴대폰이면 이게 제일 빠르다 */
  const useMyPlace = () => {
    if (!navigator.geolocation) { setMsg('이 기기에서는 위치를 쓸 수 없어요.'); return; }
    setFinding(true); setMsg('');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
        setMsg('📍 지금 있는 자리로 정했어요');
        setFinding(false);
      },
      () => { setMsg('위치를 가져오지 못했어요. 주소로 찾아보세요.'); setFinding(false); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <>
      <div className="flex gap-1.5">
        <input
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') searchAddress(); }}
          placeholder="주소나 장소 이름"
          className={`${input} min-w-0 flex-1`}
          style={inputStyle}
        />
        <button
          onClick={searchAddress}
          disabled={finding}
          className="shrink-0 rounded-xl px-3.5 text-[13px] font-bold disabled:opacity-40"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
        >
          찾기
        </button>
      </div>
      <button
        onClick={useMyPlace}
        disabled={finding}
        className="w-full rounded-xl py-2 mt-1.5 text-[13px] font-bold disabled:opacity-40"
        style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
      >
        📍 지금 있는 자리로
      </button>
      {msg && (
        <div className="text-[12px] mt-1.5 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
          {msg}
        </div>
      )}
      {coords && (
        <div className="text-[12px] mt-1 font-bold" style={{ color: 'var(--color-primary)' }}>
          ✓ {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
        </div>
      )}
      <input
        value={placeName}
        onChange={(e) => onPlaceName(e.target.value.slice(0, LIMITS.placeName))}
        placeholder="자리 이름 (예: 애월 한담해변)"
        className={`${input} mt-1.5`}
        style={inputStyle}
      />
    </>
  );
}
