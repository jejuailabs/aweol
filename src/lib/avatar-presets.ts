import { AvatarId } from './firestore-schema';

/**
 * 아바타 고르는 화면이 쓰는 얇은 목록.
 *
 * 3D 실물은 walker.tsx 의 AVATAR_LOOKS 가 그린다. 그런데 walker.tsx 는 three 를 끌고 들어와서,
 * 아바타 선택 화면(로그인 직후, 아직 3D 를 안 보여주는 화면)이 그걸 import 하면
 * three 전체가 그 페이지 번들에 딸려온다. 그래서 미리보기에 필요한 색만 따로 둔다.
 * AVATAR_LOOKS 를 고치면 여기 색도 같이 맞춰야 한다.
 */
export interface AvatarPreset {
  id: AvatarId;
  label: string;
  emoji: string;
  desc: string;
  skin: string;
  hair: string;
  shirt: string;
  /** 'long' 이면 미리보기에서 머리가 어깨까지 내려온다 */
  longHair?: boolean;
  /** 사람이 아닌 캐릭터는 머리카락 대신 귀를 그린다 */
  ears?: 'cat' | 'dog';
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: 'avatar_01', label: '교복 소년', emoji: '👦', desc: '기본 남학생', skin: '#FFDDB8', hair: '#6B4226', shirt: '#E8493C' },
  { id: 'avatar_02', label: '교복 소녀', emoji: '👧', desc: '긴 머리 + 리본', skin: '#FFDDB8', hair: '#4A2C18', shirt: '#F06AA0', longHair: true },
  { id: 'avatar_03', label: '화가 소년', emoji: '🎨', desc: '베레모 + 붓', skin: '#FFDDB8', hair: '#6B4226', shirt: '#4FA8E8' },
  { id: 'avatar_04', label: '화가 소녀', emoji: '🖌️', desc: '리본 + 팔레트', skin: '#FFDDB8', hair: '#8A5A2B', shirt: '#FFD93D', longHair: true },
  { id: 'avatar_05', label: '탐험가', emoji: '🔍', desc: '모자 + 돋보기', skin: '#FFDDB8', hair: '#3A2A1A', shirt: '#8FD98A' },
  { id: 'avatar_06', label: '로봇 친구', emoji: '🤖', desc: '안테나 미니 로봇', skin: '#C7D2DC', hair: '#8FA0B0', shirt: '#7B8794' },
  { id: 'avatar_07', label: '고양이', emoji: '🐱', desc: '뾰족 귀 고양이', skin: '#F5C77E', hair: '#E0A94F', shirt: '#FFD93D', ears: 'cat' },
  { id: 'avatar_08', label: '강아지', emoji: '🐶', desc: '처진 귀 강아지', skin: '#F0DCC0', hair: '#C89A6B', shirt: '#4FA8E8', ears: 'dog' },
  { id: 'avatar_09', label: '까만머리 친구', emoji: '🧑', desc: '짧은 머리', skin: '#C68642', hair: '#2B1B12', shirt: '#F5A623' },
  { id: 'avatar_10', label: '단발머리 친구', emoji: '🙋', desc: '차분한 단발', skin: '#F3D2A8', hair: '#1F1410', shirt: '#7ED6C4', longHair: true },
  { id: 'avatar_11', label: '모자 쓴 친구', emoji: '🧢', desc: '긴 머리 + 야구모자', skin: '#FFDDB8', hair: '#5A3418', shirt: '#FF8FB1', longHair: true },
  { id: 'avatar_12', label: '리본 친구', emoji: '🎀', desc: '노란 리본', skin: '#FFE0BD', hair: '#8A5A2B', shirt: '#9AD4F5' },
  { id: 'avatar_13', label: '토끼', emoji: '🐰', desc: '하얀 토끼', skin: '#FFF3E6', hair: '#EFE3D0', shirt: '#FFB7C5', ears: 'cat' },
  { id: 'avatar_14', label: '곰돌이', emoji: '🐻', desc: '동글 귀 곰', skin: '#B98A5E', hair: '#8A6038', shirt: '#6FBF73', ears: 'dog' },
  { id: 'avatar_15', label: '우주비행사', emoji: '🚀', desc: '안테나 + 은빛 옷', skin: '#FFE0BD', hair: '#3A2A1A', shirt: '#D7DEE8' },
  { id: 'avatar_16', label: '요리사', emoji: '👨‍🍳', desc: '하얀 조리복', skin: '#F3D2A8', hair: '#4A2C18', shirt: '#FFFFFF' },
];

/** 옷·머리 색 고르기 (아바타 선택 화면과 3D 가 같은 목록을 쓴다) */
export const SHIRT_COLORS = [
  '#E8493C', '#F5A623', '#FFD93D', '#6FBF73', '#4FA8E8',
  '#7B4B94', '#FF8FB1', '#3BAF9F', '#FFFFFF', '#5A6570',
];
export const HAIR_COLORS = [
  '#2B1B12', '#4A2C18', '#6B4226', '#8A5A2B', '#C89A6B',
  '#E0A94F', '#A03E3E', '#3E5C76', '#7B4B94', '#EFE3D0',
];
