import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const serviceAccount = {
  type: 'service_account',
  project_id: 'aewol-62635',
  private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: 'firebase-adminsdk-fbsvc@aewol-62635.iam.gserviceaccount.com',
};

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const SCHOOL_ID = 'aewol-elementary';

async function seed() {
  console.log('Seeding Firestore...');

  // 1. School
  await db.doc(`schools/${SCHOOL_ID}`).set({
    name: '애월초등학교',
    createdAt: Timestamp.now(),
  });
  console.log('School created');

  // 2. Grade
  await db.doc(`schools/${SCHOOL_ID}/grades/3`).set({
    label: '3학년',
    order: 3,
  });
  console.log('Grade created');

  // 3. Classes
  const classes = [
    { id: '3-1', classNumber: 1, teacherName: '김선생님', motto: '함께 배우고 함께 자라요', introText: '미술을 사랑하는 3학년 1반입니다!' },
    { id: '3-2', classNumber: 2, teacherName: '이선생님', motto: '꿈을 그리는 교실', introText: '창의력이 넘치는 3학년 2반!' },
    { id: '3-3', classNumber: 3, teacherName: '박선생님', motto: '예술로 세상을 보자', introText: '자유로운 표현의 3학년 3반!' },
    { id: '3-4', classNumber: 4, teacherName: '최선생님', motto: '모든 아이가 예술가', introText: '따뜻한 마음의 3학년 4반!' },
  ];

  for (const cls of classes) {
    await db.doc(`schools/${SCHOOL_ID}/classes/${cls.id}`).set({
      schoolId: SCHOOL_ID,
      grade: '3',
      classNumber: cls.classNumber,
      year: '2025',
      teacherUid: '',
      teacherName: cls.teacherName,
      motto: cls.motto,
      introText: cls.introText,
      isArchived: false,
      memberUids: [],
    });
    console.log(`Class ${cls.id} created`);
  }

  // 4. Activities for class 3-1
  const activities = [
    { id: 'watercolor', title: '수채화 그리기', description: '봄 풍경을 수채화로 표현해봐요', order: 1, date: '2025-03-15' },
    { id: 'clay', title: '점토 공예', description: '나만의 동물 친구를 만들어요', order: 2, date: '2025-04-10' },
    { id: 'printmaking', title: '판화 수업', description: '고무판화로 나를 표현해요', order: 3, date: '2025-05-20' },
    { id: 'self-portrait', title: '자화상 그리기', description: '거울 속 나의 모습을 그려봐요', order: 4, date: '2025-06-05' },
    { id: 'summer-diary', title: '여름 일기', description: '여름 방학 추억을 글과 그림으로', order: 5, date: '2025-07-18' },
    { id: 'collage', title: '콜라주 만들기', description: '잡지와 색종이로 꿈의 세계를', order: 6, date: '2025-09-12' },
  ];

  for (const act of activities) {
    await db.doc(`schools/${SCHOOL_ID}/classes/3-1/activities/${act.id}`).set({
      title: act.title,
      description: act.description,
      thumbnailUrl: '',
      order: act.order,
      date: Timestamp.fromDate(new Date(act.date)),
    });
    console.log(`Activity ${act.id} created`);
  }

  // 5. Demo artworks for watercolor activity
  const studentNames = [
    '김하늘', '이서준', '박지우', '최민서', '정서윤', '윤도현',
    '한소율', '강예린', '오시우', '신지호', '임채원', '조유나',
  ];

  const artworkTitles = [
    { title: '봄날의 꽃밭', type: 'flat', comment: '우리 집 앞 꽃밭을 그렸어요' },
    { title: '우리집 강아지', type: 'flat', comment: '우리 강아지 초코를 그렸어요' },
    { title: '바다 풍경', type: 'flat', comment: '제주 바다가 너무 예뻐서 그렸어요' },
    { title: '나의 보물상자', type: 'sculpture', comment: '소중한 것들을 담는 상자에요' },
    { title: '가을 단풍', type: 'flat', comment: '한라산 단풍이 정말 예뻐요' },
    { title: '꿈속의 세계', type: 'flat', comment: '꿈에서 본 신기한 세계를 그렸어요' },
    { title: '무지개 마을', type: 'flat', comment: '무지개 색깔로 마을을 칠했어요' },
    { title: '우주 탐험', type: 'flat', comment: '우주에 가보고 싶어서 그렸어요' },
    { title: '엄마 아빠', type: 'flat', comment: '우리 가족을 수채화로 그렸어요' },
    { title: '나비 정원', type: 'sculpture', comment: '나비가 가득한 정원이에요' },
    { title: '겨울 눈사람', type: 'flat', comment: '눈이 오면 꼭 만들고 싶은 눈사람' },
    { title: '선생님 초상화', type: 'flat', comment: '김선생님을 그려봤어요!' },
  ];

  for (let i = 0; i < 12; i++) {
    const artData = artworkTitles[i];
    await db.doc(`schools/${SCHOOL_ID}/classes/3-1/activities/watercolor/artworks/art-${i + 1}`).set({
      title: artData.title,
      artistName: studentNames[i],
      artistUid: `demo-student-${i + 1}`,
      imageUrl: '',
      thumbnailUrl: '',
      type: artData.type,
      artistComment: artData.comment,
      uploadedBy: `demo-student-${i + 1}`,
      uploadedByRole: 'student',
      uploadedAt: Timestamp.now(),
      status: 'approved',
      rejectionReason: null,
    });
  }
  console.log('12 demo artworks created for watercolor activity');

  // 6. A few demo comments
  const comments = [
    { artworkId: 'art-1', text: '정말 예쁘다! 꽃 색깔이 너무 좋아', authorName: '이서준', authorRole: 'student' },
    { artworkId: 'art-1', text: '하늘이가 그림을 정말 잘 그렸네요', authorName: '김선생님', authorRole: 'teacher' },
    { artworkId: 'art-2', text: '초코 너무 귀엽다!', authorName: '박지우', authorRole: 'student' },
    { artworkId: 'art-3', text: '바다 색이 진짜 예뻐요', authorName: '최민서', authorRole: 'student' },
  ];

  for (const c of comments) {
    await db.collection(`schools/${SCHOOL_ID}/classes/3-1/activities/watercolor/artworks/${c.artworkId}/comments`).add({
      text: c.text,
      authorUid: 'demo-user',
      authorName: c.authorName,
      authorRole: c.authorRole,
      createdAt: Timestamp.now(),
    });
  }
  console.log('Demo comments created');

  console.log('\nSeeding complete!');
}

seed().catch(console.error);
