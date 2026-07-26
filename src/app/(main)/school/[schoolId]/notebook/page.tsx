'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useProgress } from '@/lib/use-progress';
import { DIR_LABEL, howFar, siteXZ, type LocalSite } from '@/lib/local-sites';
import {
  CHAPTERS, badgesOf, chapterProgress, doneQuests, openQuests,
  questState, questTarget, rankForSchool, siteKey, toNextRank, type Quest,
} from '@/lib/village-rpg';
import { useRpgContent } from '@/lib/use-rpg-content';
import { useCollection } from '@/lib/use-collection';
import { usePurify } from '@/lib/use-purify';
import { COLLECT_KINDS, PER_SPOT, kindOfToken } from '@/lib/village-collect';
import { MOB_KINDS, MOBS_PER_SPOT, mobKindOfToken } from '@/lib/village-mobs';
import { spotsOfSchool } from '@/lib/village-spots';
import { villageHref } from '@/lib/village-return';
import { auth } from '@/lib/firebase';

/**
 * 조사 수첩 — **지금 할 일과, 지금까지 알아낸 것.**
 *
 * 이게 없으면 아이는 마을에서 헤맨다. 심부름을 받아도 어디로 가야 하는지
 * 잊어버리고, 다 하고 나서도 **무엇이 남았는지** 모른다.
 *
 * 그리고 **연표**가 여기 있다. 조사의 결과가 남는 것이어야 하는데,
 * 점수는 남지 않는다. 연표는 남는다.
 */

type Tab = 'todo' | 'timeline' | 'map' | 'badge' | 'book' | 'clean';

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: 'todo', label: '할 일', emoji: '📌' },
  { id: 'timeline', label: '연표', emoji: '🕰️' },
  { id: 'map', label: '읍 지도', emoji: '🧭' },
  { id: 'badge', label: '뱃지', emoji: '🏅' },
  { id: 'book', label: '도감', emoji: '🐚' },
  { id: 'clean', label: '정화', emoji: '🗡️' },
];

export default function NotebookPage() {
  const router = useRouter();
  const params = useParams();
  const schoolId = String(params.schoolId ?? '');
  const { userDoc } = useAuth();
  const { done, signedIn } = useProgress();
  const rpg = useRpgContent(schoolId);
  const [tab, setTab] = useState<Tab>('todo');

  const grade = Number(userDoc?.classIds?.[0]?.split('-')[0]) || undefined;

  const open = useMemo(() => openQuests(rpg.quests, done, grade), [rpg.quests, done, grade]);
  const fin = useMemo(() => doneQuests(rpg.quests, done), [rpg.quests, done]);
  const badges = useMemo(() => badgesOf(rpg.quests, done), [rpg.quests, done]);
  // 등급은 **그 학교의 심부름 수**에 맞춘다 — 학교가 늘리거나 줄일 수 있으니까
  const rank = rankForSchool(fin.length, rpg.quests.length);
  const next = toNextRank(fin.length);
  const sites = rpg.sites;
  const timeline = useMemo(
    () => rpg.sites.filter((s) => s.era).sort((a, b) => a.era!.order - b.era!.order),
    [rpg.sites]
  );

  const goQuest = (q: Quest) => {
    const st = questState(q, done);
    // **알릴 것이 있으면 준 사람에게** 먼저 보낸다 — 그게 다음 할 일이다
    if (st === 'ready' || q.quiz?.length) {
      router.push(`/school/${schoolId}/place/${q.giver.placeKind}`);
      return;
    }
    const t = questTarget(q, done);
    if (!t) { router.push(`/school/${schoolId}/place/${q.giver.placeKind}`); return; }
    router.push(t.kind === 'site' ? `/school/${schoolId}/site/${t.id}` : `/school/${schoolId}/place/${t.id}`);
  };

  return (
    <div className="px-4 pt-4 pb-28 mx-auto max-w-[640px]">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => router.push(villageHref())} className="ac-btn px-3.5 py-2 text-sm">
          ← 마을로
        </button>
        <h1 className="text-lg font-black" style={{ color: 'var(--color-text-main)' }}>📓 조사 수첩</h1>
      </div>

      {/* 등급 */}
      <div className="rounded-3xl p-4 mb-3" style={{ background: 'linear-gradient(135deg,#FFF1D6,#F6E6C8)' }}>
        <div className="flex items-center gap-3">
          <div className="text-[38px]">{rank.emoji}</div>
          <div className="min-w-0">
            <div className="text-[18px] font-black" style={{ color: '#5B4A3B' }}>{rank.label}</div>
            <div className="text-[13px]" style={{ color: '#8A7A5F' }}>
              심부름 {fin.length} / {rpg.quests.length} 개
              {next && ` · ${next.label}까지 ${next.left}개`}
            </div>
          </div>
        </div>
        <div className="mt-2.5 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${rpg.quests.length ? (fin.length / rpg.quests.length) * 100 : 0}%`, background: '#E8A33C' }}
          />
        </div>
      </div>

      {!signedIn && (
        <div className="rounded-2xl p-3 mb-3 text-[13px] text-center" style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}>
          로그인하면 조사한 것이 <b>수첩에 남아요.</b>
        </div>
      )}

      {/* 칸 고르기 */}
      <div className="flex gap-1.5 mb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 rounded-xl py-2.5 text-[13px] font-bold"
            style={
              tab === t.id
                ? { background: 'var(--color-primary)', color: 'white' }
                : { background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }
            }
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {tab === 'todo' && <TodoTab open={open} onGo={goQuest} done={done} quests={rpg.quests} places={rpg.places} />}
      {tab === 'timeline' && <TimelineTab sites={timeline} done={done} schoolId={schoolId} />}
      {tab === 'map' && <MapTab sites={sites} done={done} schoolId={schoolId} />}
      {tab === 'badge' && <BadgeTab badges={badges} done={done} quests={rpg.quests} />}
      {tab === 'book' && <BookTab schoolId={schoolId} />}
      {tab === 'clean' && <CleanTab schoolId={schoolId} />}
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function TodoTab({ open, onGo, done, quests, places }: {
  open: Quest[];
  onGo: (q: Quest) => void;
  done: ReadonlySet<string>;
  quests: Quest[];
  places: { kind: string; label: string; emoji: string; people: { name: string }[] }[];
}) {
  /**
   * 학교가 새로 만든 심부름이 우리가 모르는 이야기(에피소드)에 속할 수 있다.
   * 그런 것도 **빠뜨리지 않고** 아래 '그 밖의 심부름' 에 모은다.
   */
  const known = new Set(CHAPTERS.map((c) => c.id));
  const others = open.filter((q) => !known.has(q.chapter));
  if (open.length === 0) {
    return (
      <div className="rounded-3xl p-6 text-center" style={{ background: 'var(--color-surface)' }}>
        <div className="text-[34px] mb-1">🎉</div>
        <div className="text-[15px] font-black" style={{ color: 'var(--color-text-main)' }}>
          할 일이 없어요!
        </div>
        <p className="text-[13px] mt-1 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
          마을 기관에 들어가서 이야기를 들으면 새 심부름이 생겨요.<br />
          읍사무소부터 가 보세요.
        </p>
      </div>
    );
  }

  const groups: { id: string; title: string; emoji: string; blurb: string }[] = [
    ...CHAPTERS,
    ...(others.length
      ? [{ id: '__other', title: '그 밖의 심부름', emoji: '📎', blurb: '우리 학교에서 만든 심부름이에요.' }]
      : []),
  ];

  return (
    <div className="grid gap-2">
      {groups.map((ch) => {
        const mine = ch.id === '__other' ? others : open.filter((q) => q.chapter === ch.id);
        if (mine.length === 0) return null;
        const prog = ch.id === '__other'
          ? { done: 0, total: others.length }
          : chapterProgress(quests, ch.id, done);
        return (
          <div key={ch.id} className="rounded-3xl p-4" style={{ background: 'var(--color-surface)' }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[18px]">{ch.emoji}</span>
              <span className="text-[15px] font-black" style={{ color: 'var(--color-text-main)' }}>{ch.title}</span>
              <span className="ml-auto text-[12px] font-bold" style={{ color: 'var(--color-text-sub)' }}>
                {prog.done}/{prog.total}
              </span>
            </div>
            <p className="text-[12px] mb-2.5" style={{ color: 'var(--color-text-sub)' }}>{ch.blurb}</p>

            <div className="grid gap-1.5">
              {mine.map((q) => {
                const st = questState(q, done);
                const giver = places.find((x) => x.kind === q.giver.placeKind);
                return (
                  <button
                    key={q.id}
                    onClick={() => onGo(q)}
                    className="rounded-2xl px-3.5 py-3 text-left"
                    style={{ background: st === 'ready' ? '#FFF1D6' : 'var(--color-surface-soft)' }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14px] font-bold" style={{ color: 'var(--color-text-main)' }}>
                        {q.title}
                      </span>
                      {st === 'ready' && (
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-black" style={{ background: '#E8604C', color: 'white' }}>
                          알리러 가기
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
                      {st === 'ready'
                        ? `${giver?.label ?? ''} ${giver?.people[q.giver.at]?.name ?? ''} 에게 돌아가세요`
                        : `${giver?.emoji ?? ''} ${giver?.label ?? ''} · ${giver?.people[q.giver.at]?.name ?? ''}`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 연표 — **조사의 결과가 남는 곳.**
 *
 * 조사하기 전에는 '???' 로 가려 둔다. 다 보이면 조사할 이유가 없다.
 * 다만 **자리는 보여준다** — 몇 칸이 남았는지 알아야 채우고 싶어진다.
 */
function TimelineTab({ sites, done, schoolId }: {
  sites: LocalSite[];
  done: ReadonlySet<string>;
  schoolId: string;
}) {
  const router = useRouter();
  const gotCount = sites.filter((s) => done.has(siteKey(s.id))).length;

  return (
    <div>
      <div className="text-[13px] mb-2.5" style={{ color: 'var(--color-text-sub)' }}>
        조사한 곳이 연표에 채워져요. <b>{gotCount} / {sites.length}</b> 칸
      </div>
      <div className="relative pl-6">
        {/* 세로 줄 */}
        <div className="absolute left-[9px] top-2 bottom-2 w-[2px]" style={{ background: 'var(--color-surface-soft)' }} />
        <div className="grid gap-2">
          {sites.map((s) => {
            const got = done.has(siteKey(s.id));
            return (
              <button
                key={s.id}
                onClick={() => router.push(`/school/${schoolId}/site/${s.id}`)}
                className="relative rounded-2xl px-3.5 py-3 text-left"
                style={{ background: got ? '#FFFAF0' : 'var(--color-surface-soft)' }}
              >
                <span
                  className="absolute -left-[21px] top-[18px] h-3 w-3 rounded-full"
                  style={{ background: got ? '#E8A33C' : '#CFC6B4', border: '2px solid white' }}
                />
                <div className="text-[12px] font-bold" style={{ color: got ? '#A6762A' : 'var(--color-text-sub)' }}>
                  {s.era?.label}
                </div>
                <div className="text-[15px] font-black mt-0.5" style={{ color: got ? '#3A3226' : 'var(--color-text-sub)' }}>
                  {got ? `${s.emoji} ${s.name}` : '❓ 아직 조사 안 했어요'}
                </div>
                {got && (
                  <div className="text-[12px] mt-0.5 leading-relaxed" style={{ color: '#6B5B43' }}>
                    {s.oneLine}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * 읍 지도 — **방위와 거리로 그린 모식도.**
 *
 * 측량 지도가 아니다. 아이에게 필요한 건 좌표가 아니라
 * "학교에서 남동쪽으로 4km" 이고, 그게 마침 방위를 배우는 일이다.
 */
function MapTab({ sites, done, schoolId }: {
  sites: LocalSite[];
  done: ReadonlySet<string>;
  schoolId: string;
}) {
  const router = useRouter();
  const maxKm = Math.max(4, ...sites.map((s) => s.km));
  // 화면은 한 변 200. 가운데가 학교.
  const R = 92;
  const scale = R / maxKm;

  return (
    <div>
      <div className="text-[13px] mb-2" style={{ color: 'var(--color-text-sub)' }}>
        가운데가 우리 학교예요. <b>방위와 거리를 대강 그린 그림</b>이라 실제 지도와는 조금 달라요.
      </div>

      <div className="rounded-3xl p-3" style={{ background: '#EAF3EC' }}>
        <svg viewBox="-100 -100 200 200" className="w-full" style={{ maxHeight: '58vh' }}>
          {/* 거리 고리 — 1km 마다 */}
          {Array.from({ length: Math.ceil(maxKm) }, (_, i) => i + 1).map((km) => (
            <circle key={km} cx={0} cy={0} r={km * scale} fill="none" stroke="#CFE0D2" strokeWidth={0.7} />
          ))}
          {/* 방위 십자 */}
          <line x1={-R} y1={0} x2={R} y2={0} stroke="#CFE0D2" strokeWidth={0.7} />
          <line x1={0} y1={-R} x2={0} y2={R} stroke="#CFE0D2" strokeWidth={0.7} />
          {([['N', 0, -R - 2], ['S', 0, R + 7], ['E', R + 3, 2], ['W', -R - 6, 2]] as const).map(([d, x, y]) => (
            <text key={d} x={x} y={y} fontSize={7} fontWeight={800} fill="#7FA089" textAnchor="middle">
              {DIR_LABEL[d]}
            </text>
          ))}

          {/* 학교 */}
          <circle cx={0} cy={0} r={5} fill="#E8A33C" stroke="white" strokeWidth={1.5} />
          <text x={0} y={12} fontSize={6.5} fontWeight={800} fill="#5B4A3B" textAnchor="middle">우리 학교</text>

          {/* 곳들 */}
          {sites.map((s) => {
            const { x, z } = siteXZ(s);
            const px = x * scale;
            const py = z * scale;
            const got = done.has(siteKey(s.id));
            return (
              <g
                key={s.id}
                style={{ cursor: 'pointer' }}
                onClick={() => router.push(`/school/${schoolId}/site/${s.id}`)}
              >
                <circle cx={px} cy={py} r={4.5} fill={got ? '#3BAF9F' : 'white'} stroke={got ? '#2E8C7F' : '#A9BDAE'} strokeWidth={1.2} />
                <text x={px} y={py + 2.2} fontSize={5} textAnchor="middle">{got ? '' : '?'}</text>
                <text
                  x={px}
                  y={py - 6.5}
                  fontSize={6}
                  fontWeight={800}
                  fill={got ? '#2E7A5F' : '#7A8B7F'}
                  textAnchor="middle"
                >
                  {s.emoji} {s.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="grid gap-1.5 mt-3">
        {sites.map((s) => (
          <button
            key={s.id}
            onClick={() => router.push(`/school/${schoolId}/site/${s.id}`)}
            className="rounded-2xl px-3.5 py-2.5 text-left flex items-center gap-2"
            style={{ background: 'var(--color-surface-soft)' }}
          >
            <span className="text-[18px]">{s.emoji}</span>
            <span className="text-[14px] font-bold" style={{ color: 'var(--color-text-main)' }}>{s.name}</span>
            <span className="ml-auto text-[12px]" style={{ color: 'var(--color-text-sub)' }}>
              {howFar(s)}
            </span>
            {done.has(siteKey(s.id)) && <span className="text-[13px]">✅</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function BadgeTab({ badges, done, quests }: {
  badges: { emoji: string; label: string }[];
  done: ReadonlySet<string>;
  quests: Quest[];
}) {
  const all = quests.filter((q) => q.badge);
  return (
    <div>
      <div className="text-[13px] mb-2.5" style={{ color: 'var(--color-text-sub)' }}>
        <b>{badges.length} / {all.length}</b> 개 모았어요
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {all.map((q) => {
          const got = done.has(`quest-${q.id}`);
          return (
            <div
              key={q.id}
              className="rounded-2xl py-3 px-1.5 text-center"
              style={{ background: got ? '#FFF1D6' : 'var(--color-surface-soft)', opacity: got ? 1 : 0.55 }}
            >
              <div className="text-[26px]">{got ? q.badge!.emoji : '🔒'}</div>
              <div className="text-[11px] font-bold mt-0.5 leading-tight" style={{ color: got ? '#8A6A2A' : 'var(--color-text-sub)' }}>
                {got ? q.badge!.label : '아직'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════ 도감 ══════════════════════ */

/**
 * 마을에서 주운 것들.
 *
 * **아직 못 주운 것도 자리를 비워 보여준다.** 빈 칸이 있어야 채우고 싶어진다 —
 * 뱃지 칸을 자물쇠로 보여주는 것과 같은 판단이다.
 *
 * 자리마다 다 모으면 도장 하나를 받는다. 받는 것은 서버가 정한다
 * (`/api/collect`) — 화면이 잔액을 만질 수 있으면 상점을 턴다.
 */
function BookTab({ schoolId }: { schoolId: string }) {
  const { picked, rewarded, signedIn } = useCollection();
  const spots = useMemo(() => spotsOfSchool(schoolId), [schoolId]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  /** 자리마다 몇 개 주웠나 */
  const countOf = (spotId: string) =>
    Array.from(picked).filter((p) => p.startsWith(`${spotId}-`)).length;

  /**
   * 도감에 채워진 종류.
   * 기록 한 줄이 `{자리}-{번호}-{종류}` 라, 마을 파일 없이도 종류를 알 수 있다.
   */
  const gotKinds = useMemo(
    () => new Set(Array.from(picked).map(kindOfToken)),
    [picked]
  );

  const claim = async (spotId: string, name: string) => {
    setBusy(spotId); setMsg('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ spotId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '받지 못했어요');
      setMsg(`${name} — 도장 ${json.got}개를 받았어요!`);
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy('');
  };

  if (!signedIn) {
    return (
      <div className="rounded-2xl p-6 text-center text-[13px]"
        style={{ background: 'var(--color-surface)', color: 'var(--color-text-sub)' }}>
        로그인하면 주운 것이 도감에 남아요
      </div>
    );
  }

  return (
    <>
      <div className="text-[13px] mb-3 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
        마을을 걷다 보면 <b>반짝이는 것</b>이 보여요. 가까이 가면 저절로 주워져요.
      </div>

      {/* 자리마다 얼마나 모았나 */}
      <div className="flex flex-col gap-1.5 mb-4">
        {spots.map((sp) => {
          const n = countOf(sp.id);
          const full = n >= PER_SPOT;
          const got = rewarded.has(sp.id);
          return (
            <div
              key={sp.id}
              className="rounded-2xl p-3 flex items-center gap-2.5"
              style={{ background: 'var(--color-surface)' }}
            >
              <span className="text-[20px] shrink-0">{sp.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold" style={{ color: 'var(--color-text-main)' }}>
                  {sp.name}
                </div>
                <div className="text-[12px]" style={{ color: 'var(--color-text-sub)' }}>
                  {n} / {PER_SPOT}개
                </div>
              </div>
              {full && !got && (
                <button
                  onClick={() => claim(sp.id, sp.name)}
                  disabled={!!busy}
                  className="shrink-0 rounded-xl px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-40"
                  style={{ background: 'var(--color-primary)' }}
                >
                  {busy === sp.id ? '...' : '🏅 상 받기'}
                </button>
              )}
              {got && (
                <span className="shrink-0 text-[12px] font-black" style={{ color: '#1E7B45' }}>
                  ✓ 다 모음
                </span>
              )}
            </div>
          );
        })}
      </div>

      {msg && (
        <div className="rounded-xl px-3 py-2.5 mb-3 text-[13px] font-bold"
          style={{ background: '#E6F4EA', color: '#1E7B45' }}>
          {msg}
        </div>
      )}

      {/* 종류별 도감 */}
      <div className="text-[13px] font-black mb-2" style={{ color: 'var(--color-text-main)' }}>
        무엇을 주웠나
      </div>
      <div className="flex flex-col gap-1.5">
        {COLLECT_KINDS.map((k) => {
          const got = gotKinds.has(k.id);
          return (
            <div
              key={k.id}
              className="rounded-2xl p-3 flex items-start gap-2.5"
              style={{ background: 'var(--color-surface)', opacity: got ? 1 : 0.55 }}
            >
              <span className="text-[22px] shrink-0">{got ? k.emoji : '❔'}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold" style={{ color: 'var(--color-text-main)' }}>
                  {got ? k.name : '아직 못 주웠어요'}
                </div>
                {got && (
                  <div className="text-[12px] leading-relaxed mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
                    {k.note}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ══════════════════════ 정화 도감 ══════════════════════ */

/**
 * 마을에서 정화한 것들.
 *
 * 줍기 도감(`BookTab`)과 **같은 꼴**이다 — 아직 못 만난 것도 자리를 비워 두고,
 * 자리마다 다 치우면 상을 받는다. 상은 서버가 준다(`/api/purify`).
 *
 * **여기가 이 놀이의 진짜 상이다.** 베는 재미로 끝나면 그냥 게임이지만,
 * 무엇이 왜 문제인지 한 줄씩 남으면 마을을 치운 것이 뜻을 갖는다.
 */
function CleanTab({ schoolId }: { schoolId: string }) {
  const { cleared, rewarded, signedIn } = usePurify();
  const spots = useMemo(() => spotsOfSchool(schoolId), [schoolId]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const countOf = (spotId: string) =>
    Array.from(cleared).filter((c) => c.startsWith(`${spotId}-`)).length;

  const gotKinds = useMemo(
    () => new Set(Array.from(cleared).map(mobKindOfToken)),
    [cleared]
  );

  const claim = async (spotId: string, name: string) => {
    setBusy(spotId); setMsg('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/purify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ spotId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '받지 못했어요');
      setMsg(`${name} — 도장 ${json.got}개를 받았어요!`);
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy('');
  };

  if (!signedIn) {
    return (
      <div className="rounded-2xl p-6 text-center text-[13px]"
        style={{ background: 'var(--color-surface)', color: 'var(--color-text-sub)' }}>
        로그인하면 정화한 것이 도감에 남아요
      </div>
    );
  }

  return (
    <>
      <div className="text-[13px] mb-3 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
        마을을 걷다 <b>쓰레기</b>를 만나면 정화의 검이 나와요.
        컴퓨터는 <b>화면을 클릭</b>(스페이스도 돼요), 휴대폰은 오른쪽 아래 <b>베기</b>를
        누르면 <b>앞쪽</b>을 벱니다 — 등 뒤는 안 맞아요.
        <b>우두머리</b>는 세 대 때려 껍질을 깨면 <b>문제</b>가 나와요. 맞히면 정화!
      </div>

      {/* 자리마다 얼마나 치웠나 */}
      <div className="flex flex-col gap-1.5 mb-4">
        {spots.map((sp) => {
          const n = countOf(sp.id);
          const full = n >= MOBS_PER_SPOT;
          const got = rewarded.has(sp.id);
          return (
            <div
              key={sp.id}
              className="rounded-2xl p-3 flex items-center gap-2.5"
              style={{ background: 'var(--color-surface)' }}
            >
              <span className="text-[20px] shrink-0">{sp.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold" style={{ color: 'var(--color-text-main)' }}>
                  {sp.name}
                </div>
                <div className="text-[12px]" style={{ color: 'var(--color-text-sub)' }}>
                  {n} / {MOBS_PER_SPOT}마리
                </div>
              </div>
              {full && !got && (
                <button
                  onClick={() => claim(sp.id, sp.name)}
                  disabled={!!busy}
                  className="shrink-0 rounded-xl px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-40"
                  style={{ background: 'var(--color-primary)' }}
                >
                  {busy === sp.id ? '...' : '🏅 상 받기'}
                </button>
              )}
              {got && (
                <span className="shrink-0 text-[12px] font-black" style={{ color: '#1E7B45' }}>
                  ✓ 깨끗해짐
                </span>
              )}
            </div>
          );
        })}
      </div>

      {msg && (
        <div className="rounded-xl px-3 py-2.5 mb-3 text-[13px] font-bold"
          style={{ background: '#E6F4EA', color: '#1E7B45' }}>
          {msg}
        </div>
      )}

      {/* 종류별 도감 */}
      <div className="text-[13px] font-black mb-2" style={{ color: 'var(--color-text-main)' }}>
        무엇을 치웠나
      </div>
      <div className="flex flex-col gap-1.5">
        {MOB_KINDS.map((k) => {
          const got = gotKinds.has(k.id);
          return (
            <div
              key={k.id}
              className="rounded-2xl p-3 flex items-start gap-2.5"
              style={{ background: 'var(--color-surface)', opacity: got ? 1 : 0.55 }}
            >
              <span className="text-[22px] shrink-0">{got ? k.emoji : '❔'}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[14px] font-bold" style={{ color: 'var(--color-text-main)' }}>
                    {got ? k.name : '아직 못 만났어요'}
                  </span>
                  {got && k.tier === 'boss' && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-black"
                      style={{ background: '#DFF3FF', color: '#2A6F8C' }}
                    >
                      우두머리
                    </span>
                  )}
                </div>
                {got && (
                  <div className="text-[12px] leading-relaxed mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
                    {k.note}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
