/**
 * 운동장에서 할 수 있는 것들.
 *
 * **게임을 늘릴 때 여기 한 줄만 더한다.** 카드 화면도 순위표도 이 목록을 읽는다.
 * 전에는 운동장에 들어가면 곧장 달리기가 떠서, 양궁을 만들어도 아이가
 * 찾을 길이 없었다.
 */

export interface PlaygroundGame {
  key: string;
  label: string;
  emoji: string;
  /** 카드에 적는 한 줄. 무엇을 하는 놀이인지 */
  desc: string;
  /** 어떤 힘이 늘어나는지 — 선생님이 고를 때 본다 */
  trains: string;
  /** `/school/{schoolId}` 뒤에 붙는 길 */
  path: string;
  color: string;
  /**
   * 내 최고 기록이 담긴 문서 이름 (`schools/{id}/{recordCol}/{uid}`).
   * 없으면 기록을 안 보여준다.
   */
  recordCol?: string;
  /** 기록을 사람이 읽는 말로. 없으면 기록 칸이 안 뜬다. */
  formatBest?: (v: Record<string, unknown>) => string | null;
  /** 랭킹을 어느 쪽으로 줄 세우나. 달리기는 작을수록, 점수는 클수록 잘한 것. */
  rankBy?: { field: string; dir: 'asc' | 'desc' };
  /** 운동장 카드에 안 띄우는 게임(교실 안에서만 하는 것)도 랭킹에는 올린다 */
  hideOnPlayground?: boolean;
}

export const PLAYGROUND_GAMES: PlaygroundGame[] = [
  {
    key: 'track',
    label: '달리기',
    emoji: '🏃',
    desc: '트랙을 한 바퀴 돌아요',
    trains: '끈기',
    path: 'track',
    color: '#3BAF9F',
    recordCol: 'trackRecords',
    rankBy: { field: 'bestMs', dir: 'asc' },
    formatBest: (v) => {
      const ms = typeof v.bestMs === 'number' ? v.bestMs : typeof v.ms === 'number' ? v.ms : null;
      if (ms == null) return null;
      return `${(ms / 1000).toFixed(2)}초`;
    },
  },
  {
    key: 'archery',
    label: '양궁',
    emoji: '🏹',
    desc: '흔들리는 조준점으로 과녁을 맞혀요',
    trains: '집중력',
    path: 'archery',
    color: '#E8604C',
    recordCol: 'archeryRecords',
    rankBy: { field: 'total', dir: 'desc' },
    formatBest: (v) => (typeof v.total === 'number' ? `${v.total}점` : null),
  },
  {
    /*
      짝맞추기는 반 안(교실 게임 칸)에서 한다. 운동장 카드에는 안 띄우지만
      랭킹에는 올린다 — 아이가 '내가 뭘 잘하나' 를 한자리에서 봐야 한다.
    */
    key: 'match',
    label: '짝맞추기',
    emoji: '🃏',
    desc: '낱말과 뜻을 맞춰요',
    trains: '기억력',
    path: '',
    color: '#7B4B94',
    recordCol: 'matchRecords',
    rankBy: { field: 'score', dir: 'desc' },
    formatBest: (v) => (typeof v.score === 'number' ? `${v.score}점` : null),
    hideOnPlayground: true,
  },
];
