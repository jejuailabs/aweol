const STORAGE_BASE = 'https://storage.googleapis.com/aewol-62635.firebasestorage.app';

export const APP_IMAGES = {
  schoolEventMain: `${STORAGE_BASE}/app-assets/school-event-main.png`,
  schoolFacade: `${STORAGE_BASE}/app-assets/school-facade.png`,
  classroomInterior: `${STORAGE_BASE}/app-assets/classroom-interior.png`,

  /**
   * NPC 빌보드 — gpt-image-2 로 뽑아 누끼 딴 캐릭터 (webp 20~40KB).
   * 마을 관공서 앞에 판때기로 세운다. 올리기: scripts/upload-npc-billboards.mjs
   */
  npcOfficer: `${STORAGE_BASE}/app-assets/npc-officer.webp`,
  npcPostman: `${STORAGE_BASE}/app-assets/npc-postman.webp`,
  npcLibrarian: `${STORAGE_BASE}/app-assets/npc-librarian.webp`,
  mobDolhareubang: `${STORAGE_BASE}/app-assets/mob-dolhareubang.webp`,
  playerBoy: `${STORAGE_BASE}/app-assets/player-boy.webp`,
  playerGirl: `${STORAGE_BASE}/app-assets/player-girl.webp`,
} as const;
