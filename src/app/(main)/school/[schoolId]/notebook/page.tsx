'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useProgress } from '@/lib/use-progress';
import { civicByKind } from '@/lib/civic-places';
import {
  DIR_LABEL, howFar, sitesOfSchool, siteXZ, timelineOf, type LocalSite,
} from '@/lib/local-sites';
import {
  CHAPTERS, QUESTS, badgesOf, chapterProgress, doneQuests, openQuests,
  questState, questTarget, rankOf, siteKey, toNextRank, type Quest,
} from '@/lib/village-rpg';

/**
 * 조사 수첩 — **지금 할 일과, 지금까지 알아낸 것.**
 *
 * 이게 없으면 아이는 마을에서 헤맨다. 심부름을 받아도 어디로 가야 하는지
 * 잊어버리고, 다 하고 나서도 **무엇이 남았는지** 모른다.
 *
 * 그리고 **연표**가 여기 있다. 조사의 결과가 남는 것이어야 하는데,
 * 점수는 남지 않는다. 연표는 남는다.
 */

type Tab = 'todo' | 'timeline' | 'map' | 'badge';

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: 'todo', label: '할 일', emoji: '📌' },
  { id: 'timeline', label: '연표', emoji: '🕰️' },
  { id: 'map', label: '읍 지도', emoji: '🧭' },
  { id: 'badge', label: '뱃지', emoji: '🏅' },
];

export default function NotebookPage() {
  const router = useRouter();
  const params = useParams();
  const schoolId = String(params.schoolId ?? '');
  const { userDoc } = useAuth();
  const { done, signedIn } = useProgress();
  const [tab, setTab] = useState<Tab>('todo');

  const grade = Number(userDoc?.classIds?.[0]?.split('-')[0]) || undefined;

  const open = useMemo(() => openQuests(done, grade), [done, grade]);
  const fin = useMemo(() => doneQuests(done), [done]);
  const badges = useMemo(() => badgesOf(done), [done]);
  const rank = rankOf(fin.length);
  const next = toNextRank(fin.length);
  const sites = useMemo(() => sitesOfSchool(schoolId), [schoolId]);
  const timeline = useMemo(() => timelineOf(schoolId), [schoolId]);

  const goQuest = (q: Quest) => {
    const st = questState(q, done);
    // **알릴 것이 있으면 준 사람에게** 먼저 보낸다 — 그게 다음 할 일이다
    if (st === 'ready' || q.quiz) {
      router.push(`/school/${schoolId}/place/${q.giver.placeKind}`);
      return;
    }
    const t = questTarget(q);
    if (!t) { router.push(`/school/${schoolId}/place/${q.giver.placeKind}`); return; }
    router.push(t.kind === 'site' ? `/school/${schoolId}/site/${t.id}` : `/school/${schoolId}/place/${t.id}`);
  };

  return (
    <div className="px-4 pt-4 pb-28 mx-auto max-w-[640px]">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => router.push('/village')} className="ac-btn px-3.5 py-2 text-sm">
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
              심부름 {fin.length} / {QUESTS.length} 개
              {next && ` · ${next.label}까지 ${next.left}개`}
            </div>
          </div>
        </div>
        <div className="mt-2.5 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${(fin.length / QUESTS.length) * 100}%`, background: '#E8A33C' }}
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

      {tab === 'todo' && <TodoTab open={open} onGo={goQuest} done={done} />}
      {tab === 'timeline' && <TimelineTab sites={timeline} done={done} schoolId={schoolId} />}
      {tab === 'map' && <MapTab sites={sites} done={done} schoolId={schoolId} />}
      {tab === 'badge' && <BadgeTab badges={badges} done={done} />}
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function TodoTab({ open, onGo, done }: {
  open: Quest[];
  onGo: (q: Quest) => void;
  done: ReadonlySet<string>;
}) {
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

  return (
    <div className="grid gap-2">
      {CHAPTERS.map((ch) => {
        const mine = open.filter((q) => q.chapter === ch.id);
        if (mine.length === 0) return null;
        const prog = chapterProgress(ch.id, done);
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
                const giver = civicByKind(q.giver.placeKind);
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

function BadgeTab({ badges, done }: {
  badges: { emoji: string; label: string }[];
  done: ReadonlySet<string>;
}) {
  const all = QUESTS.filter((q) => q.badge);
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
