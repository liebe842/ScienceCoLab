/**
 * ScienceCoLab — 학교 간 공동 기후 탐구 (GAS 백엔드)
 *
 * 배포 방법:
 *   1) 아래 SPREADSHEET_ID, PHOTO_FOLDER_ID 두 상수에 본인 ID 입력
 *   2) 스프레드시트에 시트 2개 생성 (헤더 행 1줄 포함)
 *      - Schools:       학교명 | 위도 | 경도 | 비밀번호
 *      - Measurements:  타임스탬프 | 학교명 | 학생이름 | 측정날짜 | 측정시간 |
 *                       측정장소 | 기온 | 습도 | 주변환경 | 특이사항 | 사진URL
 *   3) Drive에 사진 저장용 폴더 생성 → 폴더 ID 복사
 *   4) 배포 → 새 배포 → 웹앱
 *      - 실행 주체:    나(Me)
 *      - 액세스 권한:  모든 사용자(Anyone)
 *   5) 발급된 웹앱 URL을 프론트엔드 js/config.js의 GAS_API_URL에 입력
 */

const SPREADSHEET_ID = '1zfrifBLjz9Sf184UUYS5iHuraQqaXmyOtAKBA-A01YA';
const PHOTO_FOLDER_ID = '12Elqhe2Vq3sUHHF744CdEtp218dHH6dE';

const SHEET_SCHOOLS = 'Schools';
const SHEET_MEASUREMENTS = 'Measurements';

const HEADERS_SCHOOLS = ['학교명', '위도', '경도', '비밀번호'];
const HEADERS_MEASUREMENTS = [
  '타임스탬프', '학교명', '학생이름', '측정날짜', '측정시간',
  '측정장소', '기온', '습도', '주변환경', '특이사항', '사진URL'
];

// ─────────────────────────────────────────────
// 🔧 초기 설정 (Apps Script 에디터에서 1회만 실행)
//    함수 선택창에서 'setupSheets' 선택 → ▶ 실행
//    - 시트 2개가 없으면 생성
//    - 헤더 행 1줄을 자동 입력
//    - 헤더 스타일링 (굵게 + 배경색 + 고정행)
//    - Schools 시트가 비어 있으면 예시 1줄 추가
// ─────────────────────────────────────────────
function setupSheets() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID.includes('여기에')) {
    throw new Error('먼저 SPREADSHEET_ID 상수에 스프레드시트 ID를 입력하세요.');
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  ensureSheet_(ss, SHEET_SCHOOLS, HEADERS_SCHOOLS);
  ensureSheet_(ss, SHEET_MEASUREMENTS, HEADERS_MEASUREMENTS);

  // Schools 시트가 헤더만 있고 비어있으면 예시 1줄 추가
  const schoolsSheet = ss.getSheetByName(SHEET_SCHOOLS);
  if (schoolsSheet.getLastRow() === 1) {
    schoolsSheet.appendRow(['예시초등학교', 37.5665, 126.9780, 'change-me']);
    Logger.log('예시 학교 1행 추가됨. 실제 학교 정보로 수정하세요.');
  }

  Logger.log('✅ 시트 준비 완료: ' + ss.getUrl());
  return ss.getUrl();
}

function ensureSheet_(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    Logger.log('시트 생성: ' + sheetName);
  }

  // 첫 행이 비어있거나 다른 헤더면 새로 입력
  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const isEmpty = firstRow.every(v => v === '' || v === null);
  const matches = headers.every((h, i) => firstRow[i] === h);
  if (isEmpty || !matches) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    Logger.log('헤더 입력: ' + sheetName);
  }

  // 헤더 스타일링
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange
    .setFontWeight('bold')
    .setBackground('#e8eef9')
    .setFontColor('#2d3e5e')
    .setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

// ─────────────────────────────────────────────
// GET: 학교 + 측정값을 join 해서 JSON 반환
//   (무파라미터)          기존 기온·습도 데이터 — 하위 호환 유지
//   ?topic=열섬           주제별 폼 응답 데이터 → {topic, schools:[...]}
//   ?topic=열섬&mode=headers  응답 탭 헤더/매핑 확인 (디버그)
//   ?mode=seed            가상 데이터 탭 생성 (시연용, 비어있을 때만)
// ─────────────────────────────────────────────
function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const params = (e && e.parameter) || {};

    if (params.mode === 'seed') {
      return jsonOutput_(setupTopicSampleData());
    }
    if (params.topic) {
      if (params.mode === 'headers') {
        return jsonOutput_(getTopicHeaders_(ss, params.topic));
      }
      return jsonOutput_(readTopic_(ss, params.topic));
    }

    const schools = readSchools_(ss);
    const measurements = readMeasurements_(ss);

    const grouped = schools.map(s => ({
      school: s.name,
      lat: s.lat,
      lng: s.lng,
      measurements: measurements
        .filter(m => m.school === s.name)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    }));

    return jsonOutput_(grouped);
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

// ─────────────────────────────────────────────
// POST: 학생 입력 → 비번 검증 → Drive 저장 → 시트 추가
// ─────────────────────────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // 1) 비밀번호 검증
    const schools = readSchools_(ss);
    const target = schools.find(s => s.name === data.school);
    if (!target) {
      return jsonOutput_({ ok: false, error: '등록되지 않은 학교입니다.' });
    }
    if (String(target.password) !== String(data.password)) {
      return jsonOutput_({ ok: false, error: '비밀번호가 올바르지 않습니다.' });
    }

    // 2) 사진 저장 (필수)
    if (!data.photoBase64 || !data.photoMimeType) {
      return jsonOutput_({ ok: false, error: '사진이 첨부되지 않았습니다.' });
    }
    const photoUrl = savePhoto_(data.photoBase64, data.photoMimeType, data.school, data.studentName);

    // 3) Measurements 시트에 행 추가
    const sheet = ss.getSheetByName(SHEET_MEASUREMENTS);
    sheet.appendRow([
      new Date(),
      data.school,
      data.studentName,
      data.date,
      data.time,
      data.location,
      Number(data.temp),
      Number(data.humidity),
      Array.isArray(data.environment) ? JSON.stringify(data.environment) : (data.environment || ''),
      data.notes || '',
      photoUrl
    ]);

    return jsonOutput_({ ok: true });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

// ─────────────────────────────────────────────
// 헬퍼들
// ─────────────────────────────────────────────
function readSchools_(ss) {
  const sheet = ss.getSheetByName(SHEET_SCHOOLS);
  const values = sheet.getDataRange().getValues();
  const rows = values.slice(1); // 헤더 제외
  return rows
    .filter(r => r[0] && r[1] !== '' && r[2] !== '')
    .map(r => ({
      name: String(r[0]).trim(),
      lat: Number(r[1]),
      lng: Number(r[2]),
      password: String(r[3] || '').trim()
    }));
}

function readMeasurements_(ss) {
  const sheet = ss.getSheetByName(SHEET_MEASUREMENTS);
  const values = sheet.getDataRange().getValues();
  const rows = values.slice(1);
  return rows
    .filter(r => r[1]) // 학교명 있는 행만
    .map(r => ({
      timestamp: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
      school: String(r[1]).trim(),
      studentName: String(r[2] || ''),
      date: r[3] instanceof Date ? Utilities.formatDate(r[3], 'Asia/Seoul', 'yyyy-MM-dd') : String(r[3] || ''),
      time: r[4] instanceof Date ? Utilities.formatDate(r[4], 'Asia/Seoul', 'HH:mm') : String(r[4] || ''),
      location: String(r[5] || ''),
      temp: r[6] === '' ? null : Number(r[6]),
      humidity: r[7] === '' ? null : Number(r[7]),
      environment: parseEnvironment_(r[8]),
      notes: String(r[9] || ''),
      photoUrl: String(r[10] || '')
    }));
}

// 환경 데이터 파싱: 신(JSON 배열) 포맷 우선, 실패 시 구(콤마 구분) 포맷 폴백
function parseEnvironment_(raw) {
  if (raw === null || raw === undefined || raw === '') return [];
  const s = String(raw).trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map(String).filter(Boolean);
    } catch (e) { /* fall through to legacy */ }
  }
  return s.split(',').map(t => t.trim()).filter(Boolean);
}

function savePhoto_(base64, mimeType, school, studentName) {
  const folder = DriveApp.getFolderById(PHOTO_FOLDER_ID);
  const stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd_HHmmss');
  const ext = (mimeType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const filename = `${school}_${studentName}_${stamp}.${ext}`;
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, filename);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return `https://drive.google.com/thumbnail?id=${file.getId()}&sz=w1024`;
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═════════════════════════════════════════════
// 공동탐구DAY 주제별 API
//
// 각 주제의 Google Form 응답을 이 스프레드시트의 탭으로 모으고
// (폼 → 응답 → "기존 스프레드시트에 저장" → 탭 이름을 주제명으로 변경),
// 아래 TOPIC_SHEETS에 등록하면 ?topic=주제명 으로 조회된다.
//
// 열 매핑은 "헤더 키워드 포함 매칭"이라 폼 질문의 정확한 문구·순서와
// 무관하게 동작한다. 매핑이 안 맞으면 ?topic=열섬&mode=headers 로
// 실제 헤더와 매핑 결과를 확인한 뒤 match 키워드를 조정할 것.
// ═════════════════════════════════════════════

const TOPIC_SHEETS = {
  '열섬': {
    sheet: '열섬',
    fields: [
      { key: 'school',      match: ['학교'] },
      { key: 'date',        match: ['날짜'], type: 'date' },
      { key: 'time',        match: ['시간'], type: 'time', exclude: ['타임'] },
      { key: 'location',    match: ['장소'], exclude: ['사진'] },
      { key: 'surface',     match: ['재질'] },
      { key: 'environment', match: ['환경'], type: 'tags' },
      { key: 'heatSource',  match: ['열원'] },
      { key: 'temp',        match: ['온도'], type: 'number' },
      { key: 'photoUrl',    match: ['사진'], type: 'photo' }
    ]
  },
  '태양광': {
    sheet: '태양광',
    fields: [
      { key: 'school',   match: ['학교'] },
      { key: 'date',     match: ['날짜'], type: 'date' },
      { key: 'time',     match: ['시간'], type: 'time', exclude: ['타임'] },
      { key: 'location', match: ['장소'], exclude: ['사진'] },
      { key: 'temp',     match: ['온도'], type: 'number' },
      { key: 'humidity', match: ['습도'], type: 'number' },
      { key: 'lux',      match: ['조도'], type: 'number' },
      { key: 'voltage',  match: ['전압'], type: 'number' },
      { key: 'weather',  match: ['날씨'] },
      { key: 'photoUrl', match: ['사진'], type: 'photo' }
    ]
  },
  '미세먼지': {
    sheet: '미세먼지',
    fields: [
      { key: 'school',   match: ['학교'] },
      { key: 'date',     match: ['날짜'], type: 'date' },
      { key: 'time',     match: ['시간'], type: 'time', exclude: ['타임'] },
      { key: 'location', match: ['장소'], exclude: ['사진'] },
      { key: 'pm10',     match: ['PM10'], type: 'number' },
      { key: 'pm25',     match: ['PM2.5'], type: 'number' },
      { key: 'temp',     match: ['온도'], type: 'number' },
      { key: 'humidity', match: ['습도'], type: 'number' },
      { key: 'weather',  match: ['날씨'] },
      { key: 'cleaning', match: ['청소'] },
      { key: 'notes',    match: ['특이'] },
      { key: 'photoUrl', match: ['사진'], type: 'photo' }
    ]
  }
};

function readTopic_(ss, topicKey) {
  const cfg = TOPIC_SHEETS[topicKey];
  if (!cfg) {
    return { ok: false, error: '알 수 없는 주제입니다: ' + topicKey };
  }
  const sheet = ss.getSheetByName(cfg.sheet);
  if (!sheet) {
    return { ok: false, error: '응답 탭이 없습니다: "' + cfg.sheet + '" (폼 응답 저장 위치 지정 또는 ?mode=seed 실행 필요)' };
  }

  const values = sheet.getDataRange().getValues();
  const cols = resolveColumns_(values[0], cfg.fields);
  const rows = values.slice(1);

  const records = rows
    .filter(r => cols.school !== undefined && r[cols.school])
    .map(r => {
      const rec = {
        timestamp: r[0] instanceof Date ? r[0].toISOString() : String(r[0] || '')
      };
      cfg.fields.forEach(f => {
        const c = cols[f.key];
        if (c === undefined) {
          rec[f.key] = f.type === 'tags' ? [] : (f.type === 'number' ? null : '');
          return;
        }
        const raw = r[c];
        switch (f.type) {
          case 'number':
            rec[f.key] = (raw === '' || raw === null) ? null : Number(raw);
            break;
          case 'date':
            rec[f.key] = raw instanceof Date ? Utilities.formatDate(raw, 'Asia/Seoul', 'yyyy-MM-dd') : String(raw || '');
            break;
          case 'time':
            rec[f.key] = raw instanceof Date ? Utilities.formatDate(raw, 'Asia/Seoul', 'HH:mm') : String(raw || '');
            break;
          case 'tags':
            rec[f.key] = parseEnvironment_(raw);
            break;
          case 'photo':
            rec[f.key] = parsePhotoUrl_(raw);
            break;
          default:
            rec[f.key] = String(raw === null || raw === undefined ? '' : raw).trim();
        }
      });
      return rec;
    });

  const schools = readSchools_(ss);
  return {
    topic: topicKey,
    schools: schools.map(s => ({
      school: s.name,
      lat: s.lat,
      lng: s.lng,
      measurements: records
        .filter(m => String(m.school).trim() === s.name)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    }))
  };
}

// 헤더 행에서 각 필드의 열 인덱스 결정 (공백 제거 + 대문자 통일 후 키워드 포함 매칭)
function resolveColumns_(headerRow, fields) {
  const norm = s => String(s || '').replace(/\s+/g, '').toUpperCase();
  const headers = headerRow.map(norm);
  const cols = {};
  const claimed = {};
  fields.forEach(f => {
    const need = f.match.map(norm);
    const not = (f.exclude || []).map(norm);
    for (let i = 0; i < headers.length; i++) {
      if (claimed[i] || !headers[i]) continue;
      const h = headers[i];
      if (need.every(k => h.indexOf(k) > -1) && !not.some(k => h.indexOf(k) > -1)) {
        cols[f.key] = i;
        claimed[i] = true;
        break;
      }
    }
  });
  return cols;
}

// 디버그: 응답 탭의 실제 헤더와 매핑 결과 확인 (?topic=열섬&mode=headers)
function getTopicHeaders_(ss, topicKey) {
  const cfg = TOPIC_SHEETS[topicKey];
  if (!cfg) return { ok: false, error: '알 수 없는 주제입니다: ' + topicKey };
  const sheet = ss.getSheetByName(cfg.sheet);
  if (!sheet) return { ok: false, error: '응답 탭이 없습니다: ' + cfg.sheet };
  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const cols = resolveColumns_(headerRow, cfg.fields);
  const resolved = {};
  cfg.fields.forEach(f => {
    resolved[f.key] = cols[f.key] !== undefined ? String(headerRow[cols[f.key]]) : null;
  });
  return { topic: topicKey, sheet: cfg.sheet, headers: headerRow, resolved: resolved };
}

// Forms 파일 업로드 답변("https://drive.google.com/open?id=...") → 썸네일 URL
// 드라이브 링크가 아닌 http URL(가상 데이터의 placeholder 등)은 그대로 통과
function parsePhotoUrl_(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const first = s.split(',')[0].trim();
  const m = first.match(/[?&]id=([\w-]+)/) || first.match(/\/d\/([\w-]+)/);
  if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1024';
  if (/^https?:\/\//.test(first)) return first;
  return '';
}

// ─────────────────────────────────────────────
// 가상 데이터 시딩 (시연용 — 웹 에디터에서 실행하거나 ?mode=seed 호출)
// - 주제 탭이 없으면 생성, 데이터가 이미 있으면 건드리지 않음 (idempotent)
// - Schools 시트가 비어있거나 예시뿐이면 데모 학교 5곳 추가
// - 시연이 끝나면 주제 탭의 가상 행과 데모 학교를 삭제하면 됨
// ─────────────────────────────────────────────
const DEMO_SCHOOLS = [
  ['미래초등학교', 37.4563, 126.7052, 'demo'],
  ['한빛초등학교', 37.4852, 126.7215, 'demo'],
  ['푸른초등학교', 37.5240, 126.6788, 'demo'],
  ['바다중학교',   37.3860, 126.6420, 'demo'],
  ['숲속초등학교', 37.5450, 126.7370, 'demo']
];

function setupTopicSampleData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  const schoolsSheet = ss.getSheetByName(SHEET_SCHOOLS);
  const existing = schoolsSheet.getDataRange().getValues().slice(1)
    .filter(r => r[0] && String(r[0]).trim() !== '예시초등학교');
  if (existing.length === 0) {
    DEMO_SCHOOLS.forEach(r => schoolsSheet.appendRow(r));
  }
  const schools = readSchools_(ss).filter(s => s.name !== '예시초등학교').slice(0, 8);

  const TIMES = ['09:10', '11:30', '13:50'];
  const DATE = '2026-07-10';
  const ts = i => new Date(DATE + 'T' + TIMES[i] + ':00+09:00');
  const pic = seed => 'https://picsum.photos/seed/' + seed + '/800/600';
  // 학교 인덱스별 성격값 (도심=덥고 탁함 → 숲=시원하고 맑음)
  const HEAT = [34.5, 31.5, 32.8, 28.4, 26.9];
  const PM25 = [41, 22, 56, 12, 9];
  const VOLT = [4.5, 3.8, 4.2, 5.1, 2.9];
  const HUMID = [52, 58, 55, 68, 63];
  const ENV = [
    '높은 건물(아파트, 빌딩)이 많다., 도로에 차가 많이 다닌다.',
    '높은 건물(아파트, 빌딩)이 많다.',
    '도로에 차가 많이 다닌다.',
    '바다나 하천이 가깝다.',
    '학교에 나무가 많거나 근처에 숲이나 공원이 있다.'
  ];
  const r1 = v => Math.round(v * 10) / 10;

  const result = {};

  const HEAT_SPOTS = [
    ['학교 앞 아스팔트 주차장', '아스팔트', 1.5],
    ['중앙 현관 보도블럭', '보도블럭', 0],
    ['운동장 옆 잔디밭', '잔디', -3.5]
  ];
  result['열섬'] = seedSheet_(ss, '열섬',
    ['타임스탬프', '학교명', '측정 날짜', '측정 시간', '측정 장소', '바닥 재질', '환경 특성', '열원 여부', '평균 온도(℃)', '측정 장소 사진'],
    schools,
    (s, si, i) => [
      ts(i), s.name, DATE, TIMES[i],
      HEAT_SPOTS[i][0], HEAT_SPOTS[i][1], ENV[si],
      (si < 2 && i === 0) ? '있음(에어컨 실외기)' : '없음',
      r1(HEAT[si] + HEAT_SPOTS[i][2] + i * 0.6),
      pic('heat' + si + i)
    ]);

  const WEATHERS = ['맑음', '맑음', '구름 조금'];
  result['태양광'] = seedSheet_(ss, '태양광',
    ['타임스탬프', '학교명', '측정 날짜', '측정 시간', '측정 장소', '평균 온도(℃)', '평균 습도(%)', '평균 조도(lx)', '최대 전압(V)', '측정 시 날씨', '측정 장소 사진'],
    schools,
    (s, si, i) => {
      const v = Math.max(0.5, r1(VOLT[si] + [-0.8, 0, 0.3][i]));
      return [
        ts(i), s.name, DATE, TIMES[i], '운동장 중앙 (그늘 없는 곳)',
        r1(HEAT[si] - 3 + i * 1.1), HUMID[si] - i * 3,
        Math.round(v * 17000 + i * 4000), v, WEATHERS[i],
        pic('solar' + si + i)
      ];
    });

  result['미세먼지'] = seedSheet_(ss, '미세먼지',
    ['타임스탬프', '학교명', '측정 날짜', '측정 시간', '측정 장소', 'PM10 농도 평균(㎍/㎥)', 'PM2.5 농도 평균(㎍/㎥)', '평균 온도(℃)', '평균 습도(%)', '측정 당시 날씨', '교실 청소 상황', '주변 특이사항', '측정 장소 사진'],
    schools,
    (s, si, i) => {
      const pm25 = Math.max(3, Math.round(PM25[si] + [-3, 0, 4][i]));
      return [
        ts(i), s.name, DATE, TIMES[i], '3층 교실 (창문 닫음)',
        Math.round(pm25 * 1.8), pm25,
        r1(HEAT[si] - 5), HUMID[si] + 4, WEATHERS[i],
        ['측정 전 청소함', '청소 안 함', '청소 안 함'][i],
        i === 2 ? '점심시간 이후 학생 이동이 많았음' : '',
        pic('dust' + si + i)
      ];
    });

  Logger.log('가상 데이터 시딩: ' + JSON.stringify(result));
  return { ok: true, result: result };
}

function seedSheet_(ss, name, headers, schools, rowFn) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold').setBackground('#e8eef9').setFontColor('#2d3e5e');
    sheet.setFrozenRows(1);
  }
  if (sheet.getLastRow() > 1) {
    return { skipped: '데이터가 이미 있어 시딩하지 않음', rows: sheet.getLastRow() - 1 };
  }
  const rows = [];
  schools.forEach((s, si) => {
    for (let i = 0; i < 3; i++) rows.push(rowFn(s, si % 5, i));
  });
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  return { seeded: rows.length };
}

// ─────────────────────────────────────────────
// Forms 업로드 사진 공유 설정
// Forms 파일 업로드는 기본 비공개라 지도에서 안 보임 → 링크 공개로 변경.
// 웹 에디터에서 수동 실행하거나, 행사 당일 5분 시간 트리거로 걸어둘 것.
// 파일 소유자가 이 스크립트 계정이 아니면 실패함 (폼 소유권 필요).
// ─────────────────────────────────────────────
function shareTopicPhotos() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const props = PropertiesService.getScriptProperties();
  const done = JSON.parse(props.getProperty('sharedPhotoIds') || '{}');
  let shared = 0, failed = 0;

  Object.keys(TOPIC_SHEETS).forEach(topicKey => {
    const cfg = TOPIC_SHEETS[topicKey];
    const sheet = ss.getSheetByName(cfg.sheet);
    if (!sheet || sheet.getLastRow() < 2) return;
    const values = sheet.getDataRange().getValues();
    const cols = resolveColumns_(values[0], cfg.fields);
    const photoField = cfg.fields.filter(f => f.type === 'photo')[0];
    const c = photoField ? cols[photoField.key] : undefined;
    if (c === undefined) return;

    for (let r = 1; r < values.length; r++) {
      String(values[r][c] || '').split(',').forEach(part => {
        const m = part.match(/[?&]id=([\w-]+)/) || part.match(/\/d\/([\w-]+)/);
        if (!m || done[m[1]]) return;
        try {
          DriveApp.getFileById(m[1]).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          done[m[1]] = 1;
          shared++;
        } catch (err) {
          failed++;
          Logger.log('사진 공유 실패 (파일 소유자가 아닐 수 있음): ' + m[1] + ' — ' + err);
        }
      });
    }
  });

  props.setProperty('sharedPhotoIds', JSON.stringify(done));
  Logger.log('사진 공유: 성공 ' + shared + '건, 실패 ' + failed + '건');
  return { ok: true, shared: shared, failed: failed };
}
