import fs from 'fs';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BUCKET_NAME = 'aewol-62635.firebasestorage.app';
const LOCAL_TEMP = 'C:/Users/na/AppData/Local/Temp/claude/C--Users-na-Desktop-newproject-00-aewol/bf494b00-5837-4aba-b217-c2e54d44a996/scratchpad/temp_images';

const serviceAccount = {
  type: 'service_account',
  project_id: 'aewol-62635',
  private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: 'firebase-adminsdk-fbsvc@aewol-62635.iam.gserviceaccount.com',
};

initializeApp({ credential: cert(serviceAccount), storageBucket: BUCKET_NAME });
const bucket = getStorage().bucket();

if (!fs.existsSync(LOCAL_TEMP)) fs.mkdirSync(LOCAL_TEMP, { recursive: true });

async function generateImage(prompt, filename, size = '1024x1536') {
  console.log(`Generating with gpt-image-2: ${filename}...`);
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-image-2',
      prompt,
      n: 1,
      size,
      quality: 'low',
    }),
  });
  if (!res.ok) { console.error(`Error:`, await res.text()); return null; }
  const data = await res.json();
  const b64 = data.data[0].b64_json;
  const localPath = path.join(LOCAL_TEMP, filename);
  if (b64) {
    fs.writeFileSync(localPath, Buffer.from(b64, 'base64'));
  } else if (data.data[0].url) {
    const imgRes = await fetch(data.data[0].url);
    fs.writeFileSync(localPath, Buffer.from(await imgRes.arrayBuffer()));
  }
  console.log(`Generated: ${filename}`);
  return localPath;
}

async function uploadToStorage(localPath, storagePath) {
  console.log(`Uploading: ${storagePath}...`);
  await bucket.upload(localPath, {
    destination: storagePath,
    metadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000' },
  });
  const file = bucket.file(storagePath);
  await file.makePublic();
  const url = `https://storage.googleapis.com/${BUCKET_NAME}/${storagePath}`;
  console.log(`Uploaded: ${url}`);
  return url;
}

// 메인 화면 재생성
const mainPrompt = `A bright, cheerful cartoon illustration in bird's-eye/aerial view of a Korean elementary school field event day. The scene shows:
- A large vivid green grass field viewed from directly above (drone perspective)
- Two long lines of cute cartoon children holding large colorful fabric banners
- Top line: children in white shirts holding a long yellow and red banner stretched out
- Bottom line: children in colorful casual clothes holding a long yellow and blue banner
- Small various national flags on tiny sticks scattered on the grass between the two groups
- Bright sunny day with warm lighting
- The grass has natural variation in green tones
- Style: high quality cute cartoon illustration, warm and inviting, like Studio Ghibli meets Animal Crossing
- Vibrant pastel colors, soft shadows
- The children should look happy and energetic, with diverse appearances
- No text anywhere in the image
- Portrait orientation, looking straight down from above`;

const mainPath = await generateImage(mainPrompt, 'school-event-main-v2.png');
if (mainPath) {
  await uploadToStorage(mainPath, 'app-assets/school-event-main.png');
}

// 학교 건물도 재생성
const facadePrompt = `A beautiful, warm cartoon illustration of a cute Korean elementary school building facade. Features:
- A charming 2-story cream/beige school building with an orange terracotta pitched roof
- A clock tower on top center of the building
- Large windows with blue sky reflections on both floors
- A warm brown arched entrance door in the center
- A school name plate on the building (blank/no text)
- Lush green trees on both sides of the building
- Colorful flowers (pink, yellow, orange, white) in the foreground garden
- Bright blue sky with fluffy white clouds and a smiling cartoon sun
- Green grass lawn in front
- Style: high quality warm cartoon illustration, like Studio Ghibli meets cozy mobile game art
- Very inviting and kid-friendly atmosphere
- No people, no readable text
- Portrait orientation with sky above and grass below`;

const facadePath = await generateImage(facadePrompt, 'school-facade-v2.png');
if (facadePath) {
  await uploadToStorage(facadePath, 'app-assets/school-facade.png');
}

// 교실 내부도 재생성
const classroomPrompt = `A warm, inviting cartoon illustration of a Korean elementary school classroom interior. Features:
- Bright and cheerful atmosphere with warm sunlight coming through large windows
- Wooden floor, cream colored walls
- A green chalkboard on the front wall
- Neatly arranged wooden desks and chairs
- Colorful bulletin boards with student artwork pinned to side walls
- Potted plants on the windowsill
- Art supplies (paintbrushes, crayons, colored pencils) on some desks
- A view of green trees through the windows
- Warm afternoon lighting creating soft shadows
- Style: high quality cozy cartoon illustration, inviting and nostalgic
- No people, no text
- Wide angle perspective showing the whole room`;

const classroomPath = await generateImage(classroomPrompt, 'classroom-interior-v2.png');
if (classroomPath) {
  await uploadToStorage(classroomPath, 'app-assets/classroom-interior.png');
}

console.log('\nDone! All images regenerated with gpt-image-2.');
