'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { isStaff } from '@/lib/auth-helpers';
import { playSound } from '@/lib/sound';
import { DIR_LABEL, type Dir, type LocalSite } from '@/lib/local-sites';
import { CHAPTERS, type Condition, type Quest } from '@/lib/village-rpg';
import type { CivicPlace } from '@/lib/civic-places';
import { useRpgContent } from '@/lib/use-rpg-content';
import { checkRpg, defaultsFor, errorsOf, isUsableId, type Problem } from '@/lib/rpg-content';

/**
 * 마을 조사대 — **선생님이 고치는 화면.**
 *
 * 여기서 고치는 것은 세 가지다.
 * - **유적·명소** — 아이가 가서 읽을 내용
 * - **기관** — 안에 있는 사람과 들려줄 이야기
 * - **심부름** — 누가 무엇을 시키고 무엇을 줄지
 *
 * **기본값은 안 지워진다.** 고치면 이 학교에만 덮이고, 언제든 되돌릴 수 있다.
 * 애월초가 통째로 이름이 바뀌었던 일에서 배운 것이다.
 *
 * **문제를 계속 보여준다.** 없는 곳으로 보내는 심부름, 앞뒤가 돌아버린 심부름은
 * 아이를 마을에 가둔다. 고치는 중에 바로 알려주고, 그래도 저장하려 하면
 * 서버가 막는다.
 */

type Tab = 'sites' | 'places' | 'quests';

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: 'sites', label: '유적·명소', emoji: '🗿' },
  { id: 'places', label: '기관', emoji: '🏛️' },
  { id: 'quests', label: '심부름', emoji: '📜' },
];

const DIRS: Dir[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export default function VillageAdminPage() {
  const router = useRouter();
  const schoolId = String(useParams().schoolId ?? '');
  const { role, loading } = useAuth();
  const rpg = useRpgContent(schoolId);

  const [tab, setTab] = useState<Tab>('sites');
  /** 지금 고치는 것 — 저장 전까지는 화면 안에만 있다 */
  const [draft, setDraft] = useState<{ kind: Tab; id: string; value: unknown; isNew: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState<string[]>([]);

  const base = useMemo(() => defaultsFor(schoolId), [schoolId]);
  const baseIds = useMemo(() => ({
    sites: new Set(base.sites.map((s) => s.id)),
    places: new Set(base.places.map((p) => p.kind)),
    quests: new Set(base.quests.map((q) => q.id)),
  }), [base]);

  /** 지금 화면에 있는 대로 하면 무엇이 문제인가 — 저장 전에 보여준다 */
  const problems: Problem[] = useMemo(() => {
    if (!draft) return checkRpg(rpg);
    const next = {
      sites: [...rpg.sites],
      places: [...rpg.places],
      quests: [...rpg.quests],
    };
    if (draft.kind === 'sites') {
      const v = { ...(draft.value as Omit<LocalSite, 'id' | 'schoolIds'>), id: draft.id, schoolIds: [schoolId] };
      const i = next.sites.findIndex((s) => s.id === draft.id);
      if (i >= 0) next.sites[i] = v; else next.sites.push(v);
    }
    if (draft.kind === 'places') {
      const v = { ...(draft.value as Omit<CivicPlace, 'kind'>), kind: draft.id };
      const i = next.places.findIndex((x) => x.kind === draft.id);
      if (i >= 0) next.places[i] = v; else next.places.push(v);
    }
    if (draft.kind === 'quests') {
      const v = { ...(draft.value as Omit<Quest, 'id'>), id: draft.id };
      const i = next.quests.findIndex((q) => q.id === draft.id);
      if (i >= 0) next.quests[i] = v; else next.quests.push(v);
    }
    return checkRpg(next);
  }, [draft, rpg, schoolId]);

  const blocking = errorsOf(problems);

  if (loading) return <div className="p-8 text-center text-sm">불러오는 중…</div>;
  if (!isStaff(role)) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="text-4xl">🔒</span>
        <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
          선생님만 고칠 수 있어요
        </p>
      </div>
    );
  }

  const send = async (body: Record<string, unknown>) => {
    setBusy(true); setErr([]); setMsg('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/rpg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ schoolId, ...body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const list = (json.problems as Problem[] | undefined)?.map((p) => `${p.where} — ${p.message}`);
        setErr(list?.length ? list : [json.error || '저장하지 못했어요']);
        playSound('error');
        return false;
      }
      setMsg('저장했어요. 아이들 화면에 바로 반영돼요.');
      playSound('success');
      return true;
    } catch (e) {
      setErr([(e as Error).message]);
      playSound('error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    if (draft.isNew && !isUsableId(draft.id)) {
      setErr(['id 는 영문 소문자·숫자·- 로 2~40자예요 (예: aewol-jinseong)']);
      return;
    }
    const okDone = await send({ kind: draft.kind, id: draft.id, value: draft.value });
    if (okDone) setDraft(null);
  };

  const reset = async (kind: Tab, id: string) => {
    if (!window.confirm('이 학교에서 고친 내용을 버리고 기본값으로 되돌릴까요?')) return;
    await send({ kind, id, reset: true });
    setDraft(null);
  };

  const hide = async (kind: Tab, id: string, name: string) => {
    if (!window.confirm(`'${name}' 을(를) 우리 학교에서 안 보이게 할까요?\n\n지우는 게 아니라 감추는 거예요. 언제든 되돌릴 수 있어요.`)) return;
    await send({ kind, id, hidden: true });
  };

  return (
    <div className="px-4 pt-4 pb-28 mx-auto max-w-[760px]">
      <div className="flex items-center gap-2 mb-1">
        <button onClick={() => router.push(`/admin/${schoolId}`)} className="ac-btn px-3.5 py-2 text-sm">
          ← 관리
        </button>
        <h1 className="text-lg font-black" style={{ color: 'var(--color-text-main)' }}>🧭 마을 조사대</h1>
      </div>
      <p className="text-[13px] mb-3 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
        아이들이 마을에서 보고 듣는 내용이에요. 고치면 <b>이 학교에만</b> 적용되고,
        기본값은 지워지지 않아요.
      </p>

      {/* 문제 알림 — 늘 보인다 */}
      <ProblemBox problems={problems} />

      {err.length > 0 && (
        <div className="rounded-2xl p-3 mb-3" style={{ background: '#F6E0DC' }}>
          <div className="text-[13px] font-black mb-1" style={{ color: '#A6462A' }}>저장하지 못했어요</div>
          {err.map((e, i) => (
            <div key={i} className="text-[12px] leading-relaxed" style={{ color: '#7A3A2A' }}>· {e}</div>
          ))}
        </div>
      )}
      {msg && (
        <div className="rounded-2xl p-3 mb-3 text-[13px] font-bold" style={{ background: '#EAF6EF', color: '#2E7A5F' }}>
          {msg}
        </div>
      )}

      <div className="flex gap-1.5 mb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setDraft(null); }}
            className="flex-1 rounded-xl py-2.5 text-[13px] font-bold"
            style={tab === t.id
              ? { background: 'var(--color-primary)', color: 'white' }
              : { background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* 고치는 중 */}
      {draft && draft.kind === tab && (
        <div className="rounded-3xl p-4 mb-3" style={{ background: 'var(--color-surface)', border: '3px solid var(--color-primary)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[15px] font-black" style={{ color: 'var(--color-text-main)' }}>
              {draft.isNew ? '새로 만들기' : '고치기'}
            </span>
            <span className="text-[12px]" style={{ color: 'var(--color-text-sub)' }}>{draft.id}</span>
            <button
              onClick={() => setDraft(null)}
              className="ml-auto h-8 w-8 rounded-full text-sm"
              style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
            >
              ✕
            </button>
          </div>

          {draft.isNew && (
            <Field label="id (주소에 쓰여요. 영문 소문자·숫자·-)">
              <input
                value={draft.id}
                onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                placeholder="gueom-salt"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
              />
            </Field>
          )}

          {draft.kind === 'sites' && (
            <SiteForm
              value={draft.value as SiteValue}
              onChange={(v) => setDraft({ ...draft, value: v })}
            />
          )}
          {draft.kind === 'places' && (
            <PlaceForm
              value={draft.value as PlaceValue}
              onChange={(v) => setDraft({ ...draft, value: v })}
            />
          )}
          {draft.kind === 'quests' && (
            <QuestForm
              value={draft.value as QuestValue}
              onChange={(v) => setDraft({ ...draft, value: v })}
              places={rpg.places}
              sites={rpg.sites}
              quests={rpg.quests.filter((q) => q.id !== draft.id)}
            />
          )}

          <button
            onClick={save}
            disabled={busy || blocking.length > 0}
            className="w-full rounded-2xl py-3.5 mt-3 text-[15px] font-bold text-white disabled:opacity-40"
            style={{ background: 'var(--color-primary)' }}
          >
            {busy ? '저장하는 중…' : blocking.length > 0 ? '먼저 위 문제를 고쳐 주세요' : '저장하기'}
          </button>
        </div>
      )}

      {/* 목록 */}
      {!draft && (
        <>
          <button
            onClick={() => setDraft({ kind: tab, id: '', value: emptyOf(tab), isNew: true })}
            className="w-full rounded-2xl py-3 mb-2 text-[14px] font-bold"
            style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
          >
            + 새로 만들기
          </button>

          <div className="grid gap-1.5">
            {tab === 'sites' && rpg.sites.map((s) => (
              <Row
                key={s.id}
                emoji={s.emoji}
                title={s.name}
                sub={`${DIR_LABEL[s.dir]}쪽 ${s.km}km · ${s.pages.length}장${s.videoId ? ' · 영상' : ''}`}
                custom={!baseIds.sites.has(s.id)}
                onEdit={() => setDraft({ kind: 'sites', id: s.id, value: toSiteValue(s), isNew: false })}
                onReset={baseIds.sites.has(s.id) ? () => reset('sites', s.id) : undefined}
                onHide={() => hide('sites', s.id, s.name)}
              />
            ))}
            {tab === 'places' && rpg.places.map((x) => (
              <Row
                key={x.kind}
                emoji={x.emoji}
                title={x.label}
                sub={`사람 ${x.people.length}명 · 이야기 ${x.guide?.length ?? 0}장`}
                custom={!baseIds.places.has(x.kind)}
                onEdit={() => setDraft({ kind: 'places', id: x.kind, value: toPlaceValue(x), isNew: false })}
                onReset={baseIds.places.has(x.kind) ? () => reset('places', x.kind) : undefined}
                onHide={() => hide('places', x.kind, x.label)}
              />
            ))}
            {tab === 'quests' && rpg.quests.map((q) => {
              const giver = rpg.places.find((x) => x.kind === q.giver.placeKind);
              return (
                <Row
                  key={q.id}
                  emoji={q.badge?.emoji ?? '📜'}
                  title={q.title}
                  sub={`${giver?.label ?? q.giver.placeKind} · ${giver?.people[q.giver.at]?.name ?? `${q.giver.at + 1}번째`}${q.quiz ? ' · 문제' : ''}`}
                  custom={!baseIds.quests.has(q.id)}
                  onEdit={() => setDraft({ kind: 'quests', id: q.id, value: toQuestValue(q), isNew: false })}
                  onReset={baseIds.quests.has(q.id) ? () => reset('quests', q.id) : undefined}
                  onHide={() => hide('quests', q.id, q.title)}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function ProblemBox({ problems }: { problems: Problem[] }) {
  const errors = problems.filter((p) => p.level === 'error');
  const warns = problems.filter((p) => p.level === 'warn');
  if (problems.length === 0) {
    return (
      <div className="rounded-2xl p-3 mb-3 text-[13px] font-bold" style={{ background: '#EAF6EF', color: '#2E7A5F' }}>
        ✅ 지금은 문제가 없어요
      </div>
    );
  }
  return (
    <div className="rounded-2xl p-3 mb-3" style={{ background: errors.length ? '#F6E0DC' : '#FFF1D6' }}>
      <div className="text-[13px] font-black mb-1" style={{ color: errors.length ? '#A6462A' : '#8A6A2A' }}>
        {errors.length > 0
          ? `❗ 이대로면 아이가 막혀요 (${errors.length})`
          : `⚠️ 살펴볼 것이 있어요 (${warns.length})`}
      </div>
      {[...errors, ...warns].slice(0, 8).map((p, i) => (
        <div key={i} className="text-[12px] leading-relaxed" style={{ color: errors.length ? '#7A3A2A' : '#6B5B43' }}>
          · <b>{p.where}</b> — {p.message}
        </div>
      ))}
      {problems.length > 8 && (
        <div className="text-[12px] mt-0.5" style={{ color: '#8A7A5F' }}>… 그리고 {problems.length - 8}개 더</div>
      )}
    </div>
  );
}

function Row({ emoji, title, sub, custom, onEdit, onReset, onHide }: {
  emoji: string; title: string; sub: string; custom: boolean;
  onEdit: () => void; onReset?: () => void; onHide: () => void;
}) {
  return (
    <div className="rounded-2xl px-3.5 py-3 flex items-center gap-2" style={{ background: 'var(--color-surface-soft)' }}>
      <span className="text-[20px]">{emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold truncate" style={{ color: 'var(--color-text-main)' }}>
          {title}
          {custom && (
            <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-black align-middle"
              style={{ background: '#E8A33C', color: 'white' }}>
              우리 학교
            </span>
          )}
        </div>
        <div className="text-[12px] truncate" style={{ color: 'var(--color-text-sub)' }}>{sub}</div>
      </div>
      <button onClick={onEdit} className="shrink-0 rounded-xl px-3 py-2 text-[13px] font-bold"
        style={{ background: 'white', color: '#5B4A3B' }}>
        고치기
      </button>
      {onReset && (
        <button onClick={onReset} className="shrink-0 rounded-xl px-2.5 py-2 text-[12px] font-bold"
          style={{ background: 'white', color: '#8A7A5F' }} title="기본값으로 되돌리기">
          ↩
        </button>
      )}
      <button onClick={onHide} className="shrink-0 rounded-xl px-2.5 py-2 text-[12px] font-bold"
        style={{ background: 'white', color: '#A6462A' }} title="우리 학교에서 감추기">
        🚫
      </button>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-2.5">
      <div className="text-[12px] font-bold mb-1" style={{ color: 'var(--color-text-sub)' }}>{label}</div>
      {children}
      {hint && <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>{hint}</div>}
    </div>
  );
}

const inputStyle = {
  background: 'var(--color-surface-soft)',
  color: 'var(--color-text-main)',
} as const;

// ───────────────────────────────────────────────────────────
// 유적·명소
// ───────────────────────────────────────────────────────────

type SiteValue = Omit<LocalSite, 'id' | 'schoolIds'>;

const toSiteValue = (s: LocalSite): SiteValue => {
  const { id: _i, schoolIds: _s, ...rest } = s;
  void _i; void _s;
  return rest;
};

function SiteForm({ value, onChange }: { value: SiteValue; onChange: (v: SiteValue) => void }) {
  const set = (patch: Partial<SiteValue>) => onChange({ ...value, ...patch });
  return (
    <>
      <div className="flex gap-2">
        <Field label="그림">
          <input value={value.emoji} onChange={(e) => set({ emoji: e.target.value })}
            className="w-16 rounded-xl px-3 py-2.5 text-sm text-center outline-none" style={inputStyle} />
        </Field>
        <div className="flex-1">
          <Field label="이름">
            <input value={value.name} onChange={(e) => set({ name: e.target.value })}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle} />
          </Field>
        </div>
      </div>

      <Field label="한 줄 소개">
        <input value={value.oneLine} onChange={(e) => set({ oneLine: e.target.value })}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle} />
      </Field>

      <Field label="학교에서 어느 쪽으로, 몇 km" hint="걸어서 갈 수 있는 곳(0.4km 이하)만 마을 지도에 서요. 나머지는 읍 지도에 나와요.">
        <div className="flex gap-2">
          <select value={value.dir} onChange={(e) => set({ dir: e.target.value as Dir })}
            className="rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle}>
            {DIRS.map((d) => <option key={d} value={d}>{DIR_LABEL[d]}쪽</option>)}
          </select>
          <input type="number" step="0.1" min={0} max={50} value={value.km}
            onChange={(e) => set({ km: Math.max(0, Math.min(50, parseFloat(e.target.value) || 0)) })}
            className="w-24 rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle} />
          <span className="self-center text-[13px]" style={{ color: 'var(--color-text-sub)' }}>km</span>
        </div>
      </Field>

      <Field label="연표에 넣기" hint="시대를 적으면 조사 수첩 연표에 나와요. 비워 두면 안 나와요.">
        <div className="flex gap-2">
          <input
            value={value.era?.label ?? ''}
            onChange={(e) => set({ era: e.target.value ? { label: e.target.value, order: value.era?.order ?? 100 } : null })}
            placeholder="조선 1581 · 왜구 방어"
            className="flex-1 rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle}
          />
          <input
            type="number"
            value={value.era?.order ?? 100}
            onChange={(e) => value.era && set({ era: { ...value.era, order: parseInt(e.target.value, 10) || 0 } })}
            disabled={!value.era}
            title="작을수록 옛날"
            className="w-20 rounded-xl px-3 py-2.5 text-sm outline-none disabled:opacity-40" style={inputStyle}
          />
        </div>
      </Field>

      <Field label="가 볼 수 있나요?">
        <div className="flex gap-2">
          {([true, false] as const).map((v) => (
            <button key={String(v)} type="button" onClick={() => set({ open: v })}
              className="flex-1 rounded-xl py-2.5 text-[13px] font-bold"
              style={value.open === v
                ? { background: 'var(--color-primary)', color: 'white' }
                : { background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}>
              {v ? '갈 수 있어요' : '못 가요'}
            </button>
          ))}
        </div>
      </Field>
      {!value.open && (
        <Field label="왜 못 가나요?" hint="'왜 못 들어가게 하는가' 도 아이가 배울 것이에요.">
          <input value={value.closedWhy ?? ''} onChange={(e) => set({ closedWhy: e.target.value })}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle} />
        </Field>
      )}

      <Field label="유튜브 영상 id (선택)" hint="넣으면 끝까지 봐야 조사가 끝나요. 주소가 아니라 id 만 (예: gPa_UoTxB0o)">
        <input value={value.videoId ?? ''} onChange={(e) => set({ videoId: e.target.value.trim() || undefined })}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle} />
      </Field>

      <Field label="알게 되는 낱말" hint="쉼표로 구분해요">
        <input value={value.keywords.join(', ')}
          onChange={(e) => set({ keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle} />
      </Field>

      <ListEditor
        label="읽을 내용 (한 장에 한 가지)"
        hint="**굵게** 로 감싸면 굵은 글씨가 돼요."
        items={value.pages}
        onChange={(pages) => set({ pages })}
        empty={{ title: '', body: '' }}
        render={(p, set2) => (
          <>
            <input value={p.title} onChange={(e) => set2({ ...p, title: e.target.value })}
              placeholder="제목" className="w-full rounded-xl px-3 py-2 text-sm outline-none mb-1.5" style={inputStyle} />
            <textarea value={p.body} onChange={(e) => set2({ ...p, body: e.target.value })}
              placeholder="내용" rows={4}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={inputStyle} />
          </>
        )}
      />

      <ListEditor
        label="출처"
        hint="고장 이야기는 어디서 왔는지 밝혀야 해요. 화면에 그대로 보여요."
        items={value.sources}
        onChange={(sources) => set({ sources })}
        empty={{ label: '', url: '' }}
        render={(s, set2) => (
          <>
            <input value={s.label} onChange={(e) => set2({ ...s, label: e.target.value })}
              placeholder="한국민족문화대백과사전" className="w-full rounded-xl px-3 py-2 text-sm outline-none mb-1.5" style={inputStyle} />
            <input value={s.url} onChange={(e) => set2({ ...s, url: e.target.value })}
              placeholder="https://…" className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={inputStyle} />
          </>
        )}
      />
    </>
  );
}

// ───────────────────────────────────────────────────────────
// 기관
// ───────────────────────────────────────────────────────────

type PlaceValue = Omit<CivicPlace, 'kind'>;

const toPlaceValue = (p: CivicPlace): PlaceValue => {
  const { kind: _k, ...rest } = p;
  void _k;
  return rest;
};

function PlaceForm({ value, onChange }: { value: PlaceValue; onChange: (v: PlaceValue) => void }) {
  const set = (patch: Partial<PlaceValue>) => onChange({ ...value, ...patch });
  return (
    <>
      <div className="flex gap-2">
        <Field label="그림">
          <input value={value.emoji} onChange={(e) => set({ emoji: e.target.value })}
            className="w-16 rounded-xl px-3 py-2.5 text-sm text-center outline-none" style={inputStyle} />
        </Field>
        <div className="flex-1">
          <Field label="이름">
            <input value={value.label} onChange={(e) => set({ label: e.target.value })}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle} />
          </Field>
        </div>
        <Field label="벽 색">
          <input type="color" value={value.color} onChange={(e) => set({ color: e.target.value })}
            className="h-[42px] w-14 rounded-xl" />
        </Field>
      </div>

      <Field label="한 줄 소개">
        <input value={value.oneLine} onChange={(e) => set({ oneLine: e.target.value })}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle} />
      </Field>

      <Field label="마을에서 이 이름이 들어간 건물을 이 기관으로 봐요" hint="쉼표로 구분해요. 안 적으면 마을에 문이 안 생겨요 (예: 애월농협, 하나로마트)">
        <input value={(value.nameHints ?? []).join(', ')}
          onChange={(e) => set({ nameHints: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle} />
      </Field>

      <Field label="관공서가 아니면 그 까닭 (선택)" hint="농협처럼 나라가 만든 곳이 아니면 적어 주세요. 아이들이 큰 건물은 다 관공서로 알아요.">
        <input value={value.notPublic ?? ''} onChange={(e) => set({ notPublic: e.target.value || undefined })}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle} />
      </Field>

      <ListEditor
        label="안에 있는 사람들"
        hint="맨 앞이 그곳의 장(長)이에요. 심부름을 줄 사람도 여기서 골라요."
        items={value.people}
        onChange={(people) => set({ people })}
        empty={{ name: '', emoji: '🧑', job: '' }}
        render={(p, set2) => (
          <>
            <div className="flex gap-1.5 mb-1.5">
              <input value={p.emoji} onChange={(e) => set2({ ...p, emoji: e.target.value })}
                className="w-14 rounded-xl px-2 py-2 text-sm text-center outline-none" style={inputStyle} />
              <input value={p.name} onChange={(e) => set2({ ...p, name: e.target.value })}
                placeholder="창구 직원" className="flex-1 rounded-xl px-3 py-2 text-sm outline-none" style={inputStyle} />
            </div>
            <textarea value={p.job} onChange={(e) => set2({ ...p, job: e.target.value })}
              placeholder="가까이 가면 하는 말" rows={2}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={inputStyle} />
          </>
        )}
      />

      <Field label="이야기를 들려줄 사람" hint="이 사람 머리 위에 느낌표가 떠요.">
        <select
          value={value.guideAt ?? -1}
          onChange={(e) => set({ guideAt: parseInt(e.target.value, 10) < 0 ? undefined : parseInt(e.target.value, 10) })}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle}
        >
          <option value={-1}>— 없음 —</option>
          {value.people.map((p, i) => <option key={i} value={i}>{i + 1}. {p.name || '(이름 없음)'}</option>)}
        </select>
      </Field>

      <ListEditor
        label="들려줄 이야기 (한 장에 한 가지)"
        hint="다 들으면 심부름이 열려요."
        items={value.guide ?? []}
        onChange={(guide) => set({ guide })}
        empty={{ title: '', body: '' }}
        render={(g, set2) => (
          <>
            <input value={g.title} onChange={(e) => set2({ ...g, title: e.target.value })}
              placeholder="제목" className="w-full rounded-xl px-3 py-2 text-sm outline-none mb-1.5" style={inputStyle} />
            <textarea value={g.body} onChange={(e) => set2({ ...g, body: e.target.value })}
              placeholder="내용" rows={4}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={inputStyle} />
          </>
        )}
      />

      <ListEditor
        label="여기서 할 수 있는 일 (안내판)"
        items={(value.todo ?? []).map((t) => ({ t }))}
        onChange={(items) => set({ todo: items.map((x) => x.t) })}
        empty={{ t: '' }}
        render={(x, set2) => (
          <input value={x.t} onChange={(e) => set2({ t: e.target.value })}
            className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={inputStyle} />
        )}
      />
    </>
  );
}

// ───────────────────────────────────────────────────────────
// 심부름
// ───────────────────────────────────────────────────────────

type QuestValue = Omit<Quest, 'id'>;

const toQuestValue = (q: Quest): QuestValue => {
  const { id: _i, ...rest } = q;
  void _i;
  return rest;
};

function QuestForm({ value, onChange, places, sites, quests }: {
  value: QuestValue;
  onChange: (v: QuestValue) => void;
  places: CivicPlace[];
  sites: LocalSite[];
  quests: Quest[];
}) {
  const set = (patch: Partial<QuestValue>) => onChange({ ...value, ...patch });
  const giverPlace = places.find((p) => p.kind === value.giver.placeKind);

  return (
    <>
      <Field label="제목">
        <input value={value.title} onChange={(e) => set({ title: e.target.value })}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle} />
      </Field>

      <Field label="누가 시키나요?">
        <div className="flex gap-2">
          <select
            value={value.giver.placeKind}
            onChange={(e) => set({ giver: { placeKind: e.target.value, at: 0 } })}
            className="flex-1 rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle}
          >
            {places.map((p) => <option key={p.kind} value={p.kind}>{p.emoji} {p.label}</option>)}
          </select>
          <select
            value={value.giver.at}
            onChange={(e) => set({ giver: { ...value.giver, at: parseInt(e.target.value, 10) } })}
            className="flex-1 rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle}
          >
            {(giverPlace?.people ?? []).map((p, i) => (
              <option key={i} value={i}>{i + 1}. {p.name}</option>
            ))}
          </select>
        </div>
      </Field>

      <Field label="이야기 묶음 (에피소드)">
        <select value={value.chapter} onChange={(e) => set({ chapter: e.target.value })}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle}>
          {CHAPTERS.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.title}</option>)}
          {!CHAPTERS.some((c) => c.id === value.chapter) && (
            <option value={value.chapter}>{value.chapter}</option>
          )}
        </select>
      </Field>

      <Field label="시키는 말">
        <textarea value={value.ask} onChange={(e) => set({ ask: e.target.value })} rows={4}
          className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={inputStyle} />
      </Field>

      <Field label="마쳤을 때 하는 말">
        <textarea value={value.reward} onChange={(e) => set({ reward: e.target.value })} rows={3}
          className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={inputStyle} />
      </Field>

      <CondEditor
        label="무엇을 해야 끝나나요?"
        hint="여기 적은 곳을 다 다녀와야 '알리러 가기' 가 떠요."
        items={value.need}
        onChange={(need) => set({ need })}
        places={places} sites={sites} quests={quests}
      />

      <CondEditor
        label="언제 뜨나요? (비우면 처음부터)"
        hint="앞 심부름을 걸면 이야기가 이어져요."
        items={value.unlock ?? []}
        onChange={(unlock) => set({ unlock: unlock.length ? unlock : undefined })}
        places={places} sites={sites} quests={quests}
      />

      <Field label="문제 내기 (선택)" hint="갈 곳이 아니라 '아는지' 를 물을 때 써요. 맞히면 그 자리에서 끝나요.">
        <button
          type="button"
          onClick={() => set({
            quiz: value.quiz ? undefined : { q: '', choices: ['', '', '', ''], correct: 0, why: '' },
          })}
          className="rounded-xl px-3.5 py-2 text-[13px] font-bold"
          style={value.quiz
            ? { background: 'var(--color-primary)', color: 'white' }
            : { background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
        >
          {value.quiz ? '문제 있음' : '문제 없음'}
        </button>
      </Field>

      {value.quiz && (
        <div className="rounded-2xl p-3 mb-2.5" style={{ background: 'var(--color-surface-soft)' }}>
          <input value={value.quiz.q} onChange={(e) => set({ quiz: { ...value.quiz!, q: e.target.value } })}
            placeholder="문제" className="w-full rounded-xl px-3 py-2 text-sm outline-none mb-2" style={{ background: 'white', color: '#3A3226' }} />
          {value.quiz.choices.map((c, i) => (
            <div key={i} className="flex gap-1.5 mb-1.5">
              <button type="button" onClick={() => set({ quiz: { ...value.quiz!, correct: i } })}
                className="w-11 rounded-xl text-[13px] font-black"
                style={value.quiz!.correct === i
                  ? { background: '#3BAF9F', color: 'white' }
                  : { background: 'white', color: '#8A7A5F' }}>
                {value.quiz!.correct === i ? '정답' : i + 1}
              </button>
              <input
                value={c}
                onChange={(e) => {
                  const cs = [...value.quiz!.choices];
                  cs[i] = e.target.value;
                  set({ quiz: { ...value.quiz!, choices: cs } });
                }}
                className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
                style={{ background: 'white', color: '#3A3226' }}
              />
            </div>
          ))}
          <textarea value={value.quiz.why} onChange={(e) => set({ quiz: { ...value.quiz!, why: e.target.value } })}
            placeholder="왜 그런지 (맞혔을 때, 그리고 두 번 틀렸을 때 보여줘요)" rows={2}
            className="w-full rounded-xl px-3 py-2 text-sm outline-none mt-1" style={{ background: 'white', color: '#3A3226' }} />
        </div>
      )}

      <Field label="뱃지 (선택)">
        <div className="flex gap-2">
          <input value={value.badge?.emoji ?? ''} onChange={(e) => set({
            badge: e.target.value || value.badge?.label
              ? { emoji: e.target.value, label: value.badge?.label ?? '' }
              : undefined,
          })}
            placeholder="🏅" className="w-16 rounded-xl px-3 py-2.5 text-sm text-center outline-none" style={inputStyle} />
          <input value={value.badge?.label ?? ''} onChange={(e) => set({
            badge: e.target.value || value.badge?.emoji
              ? { emoji: value.badge?.emoji ?? '🏅', label: e.target.value }
              : undefined,
          })}
            placeholder="애월진성 조사" className="flex-1 rounded-xl px-3 py-2.5 text-sm outline-none" style={inputStyle} />
        </div>
      </Field>
    </>
  );
}

function CondEditor({ label, hint, items, onChange, places, sites, quests }: {
  label: string;
  hint?: string;
  items: Condition[];
  onChange: (v: Condition[]) => void;
  places: CivicPlace[];
  sites: LocalSite[];
  quests: Quest[];
}) {
  const setAt = (i: number, c: Condition) => onChange(items.map((x, j) => (j === i ? c : x)));
  return (
    <Field label={label} hint={hint}>
      <div className="grid gap-1.5">
        {items.map((c, i) => (
          <div key={i} className="flex gap-1.5">
            <select
              value={c.kind}
              onChange={(e) => {
                const k = e.target.value as Condition['kind'];
                setAt(i, k === 'site' ? { kind: 'site', siteId: sites[0]?.id ?? '' }
                  : k === 'guide' ? { kind: 'guide', placeKind: places[0]?.kind ?? '' }
                    : { kind: 'quest', questId: quests[0]?.id ?? '' });
              }}
              className="w-28 rounded-xl px-2 py-2 text-[13px] outline-none" style={inputStyle}
            >
              <option value="site">유적 가기</option>
              <option value="guide">기관 듣기</option>
              <option value="quest">앞 심부름</option>
            </select>
            {c.kind === 'site' && (
              <select value={c.siteId} onChange={(e) => setAt(i, { kind: 'site', siteId: e.target.value })}
                className="flex-1 rounded-xl px-2 py-2 text-[13px] outline-none" style={inputStyle}>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
              </select>
            )}
            {c.kind === 'guide' && (
              <select value={c.placeKind} onChange={(e) => setAt(i, { kind: 'guide', placeKind: e.target.value })}
                className="flex-1 rounded-xl px-2 py-2 text-[13px] outline-none" style={inputStyle}>
                {places.map((p) => <option key={p.kind} value={p.kind}>{p.emoji} {p.label}</option>)}
              </select>
            )}
            {c.kind === 'quest' && (
              <select value={c.questId} onChange={(e) => setAt(i, { kind: 'quest', questId: e.target.value })}
                className="flex-1 rounded-xl px-2 py-2 text-[13px] outline-none" style={inputStyle}>
                {quests.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
              </select>
            )}
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="w-9 rounded-xl text-[13px]" style={{ background: 'white', color: '#A6462A' }}>
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...items, { kind: 'site', siteId: sites[0]?.id ?? '' }])}
          className="rounded-xl py-2 text-[13px] font-bold"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
        >
          + 조건 넣기
        </button>
      </div>
    </Field>
  );
}

// ───────────────────────────────────────────────────────────

/** 여러 개를 넣고 빼고 순서를 바꾸는 칸 — 읽을 내용·사람·출처가 다 이 모양이다 */
function ListEditor<T>({ label, hint, items, onChange, empty, render }: {
  label: string;
  hint?: string;
  items: T[];
  onChange: (v: T[]) => void;
  empty: T;
  render: (item: T, set: (v: T) => void) => React.ReactNode;
}) {
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <Field label={label} hint={hint}>
      <div className="grid gap-2">
        {items.map((it, i) => (
          <div key={i} className="rounded-2xl p-2.5" style={{ background: 'var(--color-surface-soft)' }}>
            <div className="flex items-center gap-1 mb-1.5">
              <span className="text-[12px] font-bold" style={{ color: 'var(--color-text-sub)' }}>{i + 1}</span>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                className="ml-auto h-7 w-7 rounded-lg text-[12px] disabled:opacity-30" style={{ background: 'white' }}>↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1}
                className="h-7 w-7 rounded-lg text-[12px] disabled:opacity-30" style={{ background: 'white' }}>↓</button>
              <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="h-7 w-7 rounded-lg text-[12px]" style={{ background: 'white', color: '#A6462A' }}>✕</button>
            </div>
            {render(it, (v) => onChange(items.map((x, j) => (j === i ? v : x))))}
          </div>
        ))}
        <button type="button" onClick={() => onChange([...items, structuredClone(empty)])}
          className="rounded-xl py-2 text-[13px] font-bold"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}>
          + 하나 더
        </button>
      </div>
    </Field>
  );
}

function emptyOf(tab: Tab): unknown {
  if (tab === 'sites') {
    return {
      name: '', emoji: '📍', axis: 'life', era: null, dir: 'N', km: 1, open: true,
      oneLine: '', pages: [{ title: '', body: '' }], keywords: [], sources: [{ label: '', url: '' }],
    } satisfies SiteValue;
  }
  if (tab === 'places') {
    return {
      label: '', emoji: '🏢', color: '#8FA9C9', oneLine: '',
      people: [{ name: '', emoji: '🧑', job: '' }], todo: [], fixtures: ['noticeboard'],
      guideAt: 0, guide: [{ title: '', body: '' }],
    } satisfies PlaceValue;
  }
  return {
    chapter: CHAPTERS[0].id, order: 99,
    giver: { placeKind: 'townhall', at: 0 },
    title: '', ask: '', reward: '', need: [],
  } satisfies QuestValue;
}
