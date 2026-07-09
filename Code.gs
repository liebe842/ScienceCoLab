/**
 * ScienceCoLab — 학교 간 공동 기후 탐구 (GAS 백엔드)
 *
 * 배포 방법:
 *   1) 아래 SPREADSHEET_ID, PHOTO_FOLDER_ID 두 상수에 본인 ID 입력
 *   2) setupSheets 실행 → 필요한 시트(Schools, Students, 생태지도, 주제별 시트)가 자동 생성됨
 *      - Schools:  학교명 | 위도 | 경도 | 비밀번호
 *      - Students: 학교명 | 학번 | 이름 | 주제  (로그인 명부)
 *   3) Drive에 사진 저장용 폴더 생성 → 폴더 ID 복사
 *   4) 배포 → 새 배포 → 웹앱
 *      - 실행 주체:    나(Me)
 *      - 액세스 권한:  모든 사용자(Anyone)
 *   5) 발급된 웹앱 URL을 프론트엔드 js/config.js의 GAS_API_URL에 입력
 */

const SPREADSHEET_ID = '1zfrifBLjz9Sf184UUYS5iHuraQqaXmyOtAKBA-A01YA';
const PHOTO_FOLDER_ID = '12Elqhe2Vq3sUHHF744CdEtp218dHH6dE';

const SHEET_SCHOOLS = 'Schools';
const SHEET_ECOMAP = '생태지도';   // 앱 지도입력 관찰 저장 (앱이 소유하는 로컬 시트)
const SHEET_STUDENTS = 'Students';  // 학생 명부 (로그인 검증용)
const SHEET_ADMIN = 'Admin';        // 관리자 비밀번호 (A2 셀). 전체 수정·삭제·입력 권한.

const HEADERS_ADMIN = ['비밀번호'];  // A2에 관리자 비번을 직접 입력

const HEADERS_SCHOOLS = ['학교명', '위도', '경도', '비밀번호'];
// 학생 명부: 로그인 시 (주제·학교·학번·이름) 4개가 모두 일치해야 통과.
// '주제' 값은 앱의 주제명(apiTopic)과 정확히 일치해야 함:
//   열섬 · 태양광 · 미세먼지 · 우리나라날씨 · 탄소배출 · 소리데이터 · 생태지도
const HEADERS_STUDENTS = ['학교명', '학번', '이름', '주제'];
const HEADERS_ECOMAP = [
  '타임스탬프', '학교명', '학번', '이름', '위도', '경도',
  '관찰날짜', '장소설명', '생명체이름', '개체수', '온도', '습도', '사진URL'
];
// 앱 모달 입력 주제들 → 중앙 스프레드시트 로컬 시트에 저장.
// 헤더는 각 TOPIC_SHEETS[*].fields의 match 키워드를 포함하도록 명명한다.
const HEADERS_HEAT = [
  '타임스탬프', '학교명', '학번', '이름', '측정날짜', '측정시간',
  '날씨', '측정장소', '바닥상태', '측정환경', '열원', '기온', '사진URL'
];
const HEADERS_WEATHER = [
  '타임스탬프', '학교명', '학번', '이름', '측정날짜', '측정시간', '온도', '사진URL'
];
const HEADERS_DUST = [
  '타임스탬프', '학교명', '학번', '이름', '측정날짜', '측정시간',
  'PM10', 'PM2.5', '온도', '습도', '날씨', '청소여부', '특이사항', '사진URL'
];
const HEADERS_CARBON = [
  '타임스탬프', '학교명', '학번', '이름', '측정날짜', '측정장소',
  '종이', '플라스틱', '캔', '일반', '사진URL'
];
const HEADERS_SOLAR = [
  '타임스탬프', '학교명', '학번', '이름', '측정날짜', '측정장소', '측정시간',
  '온도', '습도', '조도', '전압', '상황', '사진URL'
];
const HEADERS_SOUND = [
  '타임스탬프', '학교명', '학번', '이름', '측정날짜', '측정시간', '측정장소',
  '온도', '습도', '소음평균', '소음최대', '측정상황', '집중도', '피로도', '장소특징', '특이사항', '사진URL'
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
  ensureSheet_(ss, SHEET_STUDENTS, HEADERS_STUDENTS);
  ensureSheet_(ss, SHEET_ADMIN, HEADERS_ADMIN);
  ensureSheet_(ss, SHEET_ECOMAP, HEADERS_ECOMAP);
  ensureSheet_(ss, '열섬', HEADERS_HEAT);
  ensureSheet_(ss, '우리나라날씨', HEADERS_WEATHER);
  ensureSheet_(ss, '미세먼지', HEADERS_DUST);
  ensureSheet_(ss, '탄소배출', HEADERS_CARBON);
  ensureSheet_(ss, '태양광', HEADERS_SOLAR);
  ensureSheet_(ss, '소리데이터', HEADERS_SOUND);

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
// ─────────────────────────────────────────────
function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const params = (e && e.parameter) || {};

    if (params.topic) {
      if (params.mode === 'headers') {
        return jsonOutput_(getTopicHeaders_(params.topic));
      }
      const tcfg = TOPIC_SHEETS[params.topic];
      if (tcfg && tcfg.pointMode) {
        return jsonOutput_(readTopicPoints_(params.topic));
      }
      return jsonOutput_(readTopic_(params.topic));
    }

    // 무파라미터 GET: 이제 모든 데이터는 topic별로 조회한다. topic 파라미터 필요.
    return jsonOutput_({ ok: false, error: 'topic 파라미터가 필요합니다. 예: ?topic=열섬' });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

// ─────────────────────────────────────────────
// POST: 앱 입력 → 액션/topic 라우팅.
//   action:'login'  → 학교 비번 검증 (세션 로그인)
//   topic:'생태지도' → 지도 클릭 관찰 입력 (좌표 포함, 전용 처리)
//   그 외 input:true 주제 → 제네릭 submitTopic_ (중앙 시트에 append)
//   공통: 학교 비번 검증 → Drive 사진 저장 → 시트 행 추가
// ─────────────────────────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'login') {
      return jsonOutput_(login_(data));
    }
    if (data.action === 'update') {
      return jsonOutput_(updateTopic_(data));
    }
    if (data.action === 'delete') {
      return jsonOutput_(deleteTopic_(data));
    }
    if (data.topic === '생태지도') {
      return jsonOutput_(submitEcomap_(data));
    }
    const cfg = TOPIC_SHEETS[data.topic];
    if (cfg && cfg.input) {
      return jsonOutput_(submitTopic_(data));
    }
    return jsonOutput_({ ok: false, error: '알 수 없는 제출 유형입니다: ' + (data.topic || '(없음)') });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

// 로그인: 학교 비번 검증 + (명부 있으면) 주제·학번·이름 명부 대조.
//   role:'admin' → 관리자 비번 검증 (전체 수정·삭제·입력 권한)
//   1) 학교 비번 일치 필수
//   2) Students 시트에 그 학교 명단이 있으면 → (주제·학번·이름) 4개가 모두 일치해야 통과
//      (등록 주제와 다른 주제 선택 시 로그인 실패)
//   3) 그 학교 명단이 없으면(명부 미비 전환기) → 비번만으로 통과 (기존 동작)
function login_(data) {
  if (data.role === 'admin') {
    if (isAdmin_(data.adminPassword)) return { ok: true, admin: true };
    return { ok: false, error: '관리자 비밀번호가 올바르지 않습니다.' };
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const target = readSchools_(ss).find(s => s.name === data.school);
  if (!target) return { ok: false, error: '등록되지 않은 학교입니다.' };
  if (String(target.password) !== String(data.password)) {
    return { ok: false, error: '비밀번호가 올바르지 않습니다.' };
  }

  const roster = readStudents_(ss);
  const schoolRoster = roster.filter(r => r.school === target.name);
  if (schoolRoster.length > 0) {
    const inId   = normKey_(data.studentId);
    const inName = normKey_(data.studentName);
    const inTopic = normKey_(data.topic);
    const match = schoolRoster.some(r =>
      normKey_(r.studentId) === inId &&
      normKey_(r.name) === inName &&
      normKey_(r.topic) === inTopic
    );
    if (!match) return { ok: false, error: '등록 정보와 일치하지 않습니다.' };
  }

  return { ok: true, school: target.name };
}

// 비교용 정규화: 앞뒤/내부 공백 제거 (띄어쓰기 차이로 인한 오탐 방지)
function normKey_(v) {
  return String(v === null || v === undefined ? '' : v).replace(/\s+/g, '');
}

// 학생 명부 읽기: [{school, studentId, name, topic}]
function readStudents_(ss) {
  const sheet = ss.getSheetByName(SHEET_STUDENTS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const rows = sheet.getDataRange().getValues().slice(1);
  return rows
    .filter(r => r[0] && r[1] !== '' && r[2] !== '')  // 학교·학번·이름 있는 행만
    .map(r => ({
      school: String(r[0]).trim(),
      studentId: String(r[1]).trim(),
      name: String(r[2]).trim(),
      topic: String(r[3] || '').trim()
    }));
}

// Admin 시트 A2의 관리자 비밀번호 (없으면 '')
function readAdminPassword_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_ADMIN);
  if (!sheet || sheet.getLastRow() < 2) return '';
  return String(sheet.getRange(2, 1).getValue() || '').trim();
}

// 관리자 인증: 입력 비번이 Admin 시트 비번과 일치(비번이 설정돼 있을 때만)
function isAdmin_(adminPassword) {
  const stored = readAdminPassword_();
  return !!stored && String(adminPassword || '').trim() === stored;
}

// 제네릭 주제 제출: 비번 검증 → 사진 저장(선택) → cfg.writeOrder 순서로 시트에 append.
// 필드 직렬화는 cfg.fields의 type을 참조 (number/tags/기본).
function submitTopic_(data) {
  const cfg = TOPIC_SHEETS[data.topic];
  if (!cfg || !cfg.input || !cfg.sheet || !cfg.writeOrder) {
    return { ok: false, error: '입력을 지원하지 않는 주제입니다: ' + (data.topic || '(없음)') };
  }
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // 1) 인증: 관리자면 학교 비번 생략, 아니면 학교 비번 검증
  const target = readSchools_(ss).find(s => s.name === data.school);
  if (!target) return { ok: false, error: '등록되지 않은 학교입니다.' };
  if (!isAdmin_(data.adminPassword) && String(target.password) !== String(data.password)) {
    return { ok: false, error: '비밀번호가 올바르지 않습니다.' };
  }

  const sheet = ss.getSheetByName(cfg.sheet);
  if (!sheet) return { ok: false, error: cfg.sheet + ' 시트가 없습니다. setupSheets를 먼저 실행하세요.' };

  // 2) 사진 저장 (선택)
  let photoUrl = '';
  if (data.photoBase64 && data.photoMimeType) {
    photoUrl = savePhoto_(data.photoBase64, data.photoMimeType, data.school, data.studentName || '');
  }

  // 3) 필드 타입 맵 → 직렬화하며 헤더 순서(writeOrder)대로 행 구성
  const typeOf = {};
  cfg.fields.forEach(f => { typeOf[f.key] = f.type; });
  const row = [new Date()].concat(cfg.writeOrder.map(k => {
    if (k === 'photoUrl') return photoUrl;
    const v = data[k];
    switch (typeOf[k]) {
      case 'number': return (v === '' || v === null || v === undefined) ? '' : Number(v);
      case 'tags':   return JSON.stringify(Array.isArray(v) ? v : (v ? [v] : []));
      default:       return (v === null || v === undefined) ? '' : v;
    }
  }));
  sheet.appendRow(row);

  return { ok: true };
}

// ─────────────────────────────────────────────
// 수정 / 삭제 (작성 본인만: 학교 비번 + 기록의 학교·학번·이름 일치 확인)
//   기록 식별은 타임스탬프(ISO, ms 포함)로 — 제출마다 고유.
// ─────────────────────────────────────────────

// 공통: 인증 + 대상 행 찾기. 관리자는 전체 권한, 아니면 학교 비번 + 본인 소유 확인.
// 성공 시 {cfg, sheet, rowIndex, rowValues, cols}.
function locateOwnedRow_(data) {
  const cfg = TOPIC_SHEETS[data.topic];
  if (!cfg || !cfg.sheet) return { error: '알 수 없는 주제입니다: ' + (data.topic || '(없음)') };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const admin = isAdmin_(data.adminPassword);

  // 관리자가 아니면 학교 비번 검증
  if (!admin) {
    const target = readSchools_(ss).find(s => s.name === data.school);
    if (!target) return { error: '등록되지 않은 학교입니다.' };
    if (String(target.password) !== String(data.password)) {
      return { error: '비밀번호가 올바르지 않습니다.' };
    }
  }

  const sheet = ss.getSheetByName(cfg.sheet);
  if (!sheet) return { error: cfg.sheet + ' 시트가 없습니다.' };
  if (!data.timestamp) return { error: '기록 식별자(타임스탬프)가 없습니다.' };

  const values = sheet.getDataRange().getValues();
  const cols = resolveColumns_(values[0], cfg.fields);
  let rowIndex = -1, rowValues = null;
  for (let r = 1; r < values.length; r++) {
    const cell = values[r][0];
    const iso = cell instanceof Date ? cell.toISOString() : String(cell);
    if (iso === String(data.timestamp)) { rowIndex = r + 1; rowValues = values[r]; break; }
  }
  if (rowIndex < 0) return { error: '해당 기록을 찾지 못했습니다. (이미 삭제되었을 수 있음)' };

  // 관리자가 아니면 본인 소유 확인 (학교·학번·이름)
  if (!admin) {
    const rowSchool = String(rowValues[cols.school] === undefined ? '' : rowValues[cols.school]).trim();
    const rowSid    = String(rowValues[cols.studentId] === undefined ? '' : rowValues[cols.studentId]).trim();
    const rowName   = String(rowValues[cols.studentName] === undefined ? '' : rowValues[cols.studentName]).trim();
    if (rowSchool !== String(data.school).trim() ||
        rowSid !== String(data.studentId || '').trim() ||
        rowName !== String(data.studentName || '').trim()) {
      return { error: '본인이 작성한 기록만 수정·삭제할 수 있습니다.' };
    }
  }

  return { cfg: cfg, sheet: sheet, rowIndex: rowIndex, rowValues: rowValues, cols: cols };
}

// 수정: 대상 행을 payload 값으로 덮어쓰기. payload에 없는 키(예: 좌표)와 새 사진 미첨부 시 기존 값 유지.
function updateTopic_(data) {
  const loc = locateOwnedRow_(data);
  if (loc.error) return { ok: false, error: loc.error };
  const cfg = loc.cfg;
  if (!cfg.writeOrder) return { ok: false, error: '이 주제는 수정할 수 없습니다.' };

  const newRow = loc.rowValues.slice();       // 기존 값 복사 (타임스탬프 등 보존)
  const typeOf = {};
  cfg.fields.forEach(f => { typeOf[f.key] = f.type; });

  // 새 사진 있으면 저장, 없으면 기존 photoUrl 유지
  let photoUrl = null;
  if (data.photoBase64 && data.photoMimeType) {
    photoUrl = savePhoto_(data.photoBase64, data.photoMimeType, data.school, data.studentName || '');
  }

  // 신원 열(학교·학번·이름)은 수정 대상이 아님 — 항상 기존 값 유지 (관리자 수정 시 작성자 보존)
  const IDENTITY = { school: 1, studentId: 1, studentName: 1 };
  cfg.writeOrder.forEach((k, i) => {
    const colIdx = i + 1;                      // writeOrder[i] ↔ 헤더 열 i+1
    if (IDENTITY[k]) return;                   // 신원 열 보존
    if (k === 'photoUrl') { if (photoUrl !== null) newRow[colIdx] = photoUrl; return; }
    const v = data[k];
    if (v === undefined) return;               // payload에 없으면 기존 값 유지 (예: 좌표)
    switch (typeOf[k]) {
      case 'number': newRow[colIdx] = (v === '' || v === null) ? '' : Number(v); break;
      case 'tags':   newRow[colIdx] = JSON.stringify(Array.isArray(v) ? v : (v ? [v] : [])); break;
      default:       newRow[colIdx] = (v === null) ? '' : v;
    }
  });

  loc.sheet.getRange(loc.rowIndex, 1, 1, newRow.length).setValues([newRow]);
  return { ok: true };
}

// 삭제: 대상 행 제거.
function deleteTopic_(data) {
  const loc = locateOwnedRow_(data);
  if (loc.error) return { ok: false, error: loc.error };
  loc.sheet.deleteRow(loc.rowIndex);
  return { ok: true };
}

// 생태지도 관찰 제출: 비번 검증 → 사진 저장 → 생태지도 시트에 좌표 포함 행 추가
function submitEcomap_(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // 1) 인증: 관리자면 학교 비번 생략, 아니면 학교 비번 검증
  const target = readSchools_(ss).find(s => s.name === data.school);
  if (!target) return { ok: false, error: '등록되지 않은 학교입니다.' };
  if (!isAdmin_(data.adminPassword) && String(target.password) !== String(data.password)) {
    return { ok: false, error: '비밀번호가 올바르지 않습니다.' };
  }

  // 2) 좌표 검증
  const lat = Number(data.lat), lng = Number(data.lng);
  if (isNaN(lat) || isNaN(lng)) return { ok: false, error: '관찰 위치(좌표)가 없습니다.' };

  // 3) 사진 저장 (필수)
  if (!data.photoBase64 || !data.photoMimeType) {
    return { ok: false, error: '사진이 첨부되지 않았습니다.' };
  }
  const photoUrl = savePhoto_(data.photoBase64, data.photoMimeType, data.school, data.studentName);

  // 4) 생태지도 시트에 행 추가 (HEADERS_ECOMAP 순서)
  const sheet = ss.getSheetByName(SHEET_ECOMAP);
  if (!sheet) return { ok: false, error: '생태지도 시트가 없습니다. setupSheets를 먼저 실행하세요.' };
  sheet.appendRow([
    new Date(),
    data.school,
    data.studentId || '',
    data.studentName || '',
    lat,
    lng,
    data.date || '',
    data.location || '',
    data.species || '',
    (data.count === '' || data.count == null) ? '' : Number(data.count),
    (data.temp === '' || data.temp == null) ? '' : Number(data.temp),
    (data.humidity === '' || data.humidity == null) ? '' : Number(data.humidity),
    photoUrl
  ]);

  return { ok: true };
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

// 중복선택(체크박스) 옵션 중 값 안에 콤마가 들어가는 항목이 있어(예: "주변에 물(분수, 연못 등)이 있음")
// 단순 콤마 분리로는 깨진다. 아래 옵션 목록으로 원본 문자열에서 매칭해 안전하게 태그를 복원한다.
const HEAT_ENV_OPTIONS = [
  '주변에 건물이 많음', '나무가 많아 그늘짐', '차량 통행이 잦음',
  '주변에 물(분수, 연못 등)이 있음', '사람들의 이동이 많은 개방된 공간'
];
const SOUND_SITUATION_OPTIONS = [
  '대화소리 많음', '기계음(에어컨, 히터 등)', '외부소음(자동차, 공사 등)', '조용함'
];

// 각 주제의 응답은 "별도 스프레드시트"에 있음 (폼마다 응답 대상이 다름).
//   spreadsheetId : 응답 스프레드시트 ID (URL /d/{ID}/edit)
//   gid           : 응답 탭 gid (URL 끝 #gid=...). 지정 시 그 탭, 없으면 첫 탭 사용
//   sumFields     : 지정하면 그 필드들의 합을 rec.total 로 파생 (예: 탄소 총배출량)
// 열 매핑은 헤더 "키워드 포함 매칭"이라 폼 문구/순서가 조금 달라도 동작.
// 매핑 확인: ?topic=열섬&mode=headers
const TOPIC_SHEETS = {
  // 열섬: 앱 모달 입력 → 중앙 스프레드시트 로컬 시트('열섬')에 저장. (구글폼 아님)
  '열섬': {
    sheet: '열섬',        // spreadsheetId 없음 → SPREADSHEET_ID 사용
    input: true,          // 앱 모달 제출 대상 (doPost → submitTopic_)
    // 제출 시 시트 열 순서(HEADERS_HEAT의 타임스탬프 다음 열들과 일치)
    writeOrder: ['school', 'studentId', 'studentName', 'date', 'time',
                 'weather', 'location', 'surface', 'environment', 'heatSource', 'temp', 'photoUrl'],
    fields: [
      { key: 'school',      match: ['학교'] },
      { key: 'studentId',   match: ['학번'] },
      { key: 'studentName', match: ['이름'] },
      { key: 'date',        match: ['날짜'], type: 'date' },
      { key: 'time',        match: ['시간'], type: 'time', exclude: ['타임', '시간대'] },
      { key: 'weather',     match: ['날씨'] },
      { key: 'location',    match: ['장소'], exclude: ['상태', '사진'] },
      { key: 'surface',     match: ['상태'] },
      { key: 'environment', match: ['환경'], type: 'tags', options: HEAT_ENV_OPTIONS },
      { key: 'heatSource',  match: ['열원'] },
      { key: 'temp',        match: ['기온'], type: 'number' },
      { key: 'photoUrl',    match: ['사진'], type: 'photo' }
    ]
  },
  // 태양광: 앱 모달 입력 → 중앙 '태양광' 시트
  '태양광': {
    sheet: '태양광',
    input: true,
    writeOrder: ['school', 'studentId', 'studentName', 'date', 'location', 'time',
                 'temp', 'humidity', 'lux', 'voltage', 'weather', 'photoUrl'],
    fields: [
      { key: 'school',      match: ['학교'] },
      { key: 'studentId',   match: ['학번'] },
      { key: 'studentName', match: ['이름'] },
      { key: 'date',        match: ['날짜'], type: 'date' },
      { key: 'location',    match: ['장소'], exclude: ['사진'] },
      { key: 'time',        match: ['시간'], exclude: ['타임'] },
      { key: 'temp',        match: ['온도'], type: 'number' },
      { key: 'humidity',    match: ['습도'], type: 'number' },
      { key: 'lux',         match: ['조도'], type: 'number' },
      { key: 'voltage',     match: ['전압'], type: 'number' },
      { key: 'weather',     match: ['상황'] },
      { key: 'photoUrl',    match: ['사진'], type: 'photo' }
    ]
  },
  // 미세먼지: 앱 모달 입력 → 중앙 '미세먼지' 시트
  '미세먼지': {
    sheet: '미세먼지',
    input: true,
    writeOrder: ['school', 'studentId', 'studentName', 'date', 'time',
                 'pm10', 'pm25', 'temp', 'humidity', 'weather', 'cleaning', 'airNote', 'photoUrl'],
    fields: [
      { key: 'school',      match: ['학교'] },
      { key: 'studentId',   match: ['학번'] },
      { key: 'studentName', match: ['이름'] },
      { key: 'date',        match: ['날짜'], type: 'date' },
      { key: 'time',        match: ['시간'], exclude: ['타임'] },
      { key: 'pm10',        match: ['PM10'], type: 'number' },
      { key: 'pm25',        match: ['PM2.5'], type: 'number' },
      { key: 'temp',        match: ['온도'], type: 'number' },
      { key: 'humidity',    match: ['습도'], type: 'number' },
      { key: 'weather',     match: ['날씨'] },
      { key: 'cleaning',    match: ['청소'] },
      { key: 'airNote',     match: ['특이'] },
      { key: 'photoUrl',    match: ['사진'], type: 'photo' }
    ]
  },
  // 우리나라날씨: 앱 모달 입력 → 중앙 '우리나라날씨' 시트
  '우리나라날씨': {
    sheet: '우리나라날씨',
    input: true,
    writeOrder: ['school', 'studentId', 'studentName', 'date', 'time', 'temp', 'photoUrl'],
    fields: [
      { key: 'school',      match: ['학교'] },
      { key: 'studentId',   match: ['학번'] },
      { key: 'studentName', match: ['이름'] },
      { key: 'date',        match: ['날짜'], type: 'date' },
      { key: 'time',        match: ['시간'], exclude: ['타임'] },
      { key: 'temp',        match: ['온도'], type: 'number' },
      { key: 'photoUrl',    match: ['사진'], type: 'photo' }
    ]
  },
  // 탄소배출: 앱 모달 입력 → 중앙 '탄소배출' 시트 (total은 sumFields로 파생, 저장 안 함)
  '탄소배출': {
    sheet: '탄소배출',
    input: true,
    writeOrder: ['school', 'studentId', 'studentName', 'date', 'location',
                 'paper', 'plastic', 'can', 'general', 'photoUrl'],
    sumFields: ['paper', 'plastic', 'can', 'general'],
    fields: [
      { key: 'school',      match: ['학교'] },
      { key: 'studentId',   match: ['학번'] },
      { key: 'studentName', match: ['이름'] },
      { key: 'date',        match: ['날짜'], type: 'date' },
      { key: 'location',    match: ['장소'], exclude: ['사진'] },
      { key: 'paper',       match: ['종이'], type: 'number' },
      { key: 'plastic',     match: ['플라스틱'], type: 'number' },
      { key: 'can',         match: ['캔'], type: 'number' },
      { key: 'general',     match: ['일반'], type: 'number' },
      { key: 'photoUrl',    match: ['사진'], type: 'photo' }
    ]
  },
  // 소리데이터: 앱 모달 입력 → 중앙 '소리데이터' 시트
  '소리데이터': {
    sheet: '소리데이터',
    input: true,
    writeOrder: ['school', 'studentId', 'studentName', 'date', 'time', 'location',
                 'temp', 'humidity', 'soundAvg', 'soundMax', 'situation',
                 'concentration', 'fatigue', 'placeFeature', 'notes', 'photoUrl'],
    fields: [
      { key: 'school',        match: ['학교'] },
      { key: 'studentId',     match: ['학번'] },
      { key: 'studentName',   match: ['이름'] },
      { key: 'date',          match: ['날짜'], type: 'date' },
      { key: 'time',          match: ['시간'], exclude: ['타임'] },
      { key: 'location',      match: ['장소'], exclude: ['특징', '사진'] },
      { key: 'temp',          match: ['온도'], type: 'number' },
      { key: 'humidity',      match: ['습도'], type: 'number' },
      { key: 'soundAvg',      match: ['평균'], type: 'number' },
      { key: 'soundMax',      match: ['최대'], type: 'number' },
      { key: 'situation',     match: ['상황'], type: 'tags', options: SOUND_SITUATION_OPTIONS },
      { key: 'concentration', match: ['집중도'] },
      { key: 'fatigue',       match: ['피로도'] },
      { key: 'placeFeature',  match: ['특징'], exclude: ['사진'] },
      { key: 'notes',         match: ['특이'] },
      { key: 'photoUrl',      match: ['사진'], type: 'photo' }
    ]
  },
  // 생태지도: 앱 지도입력 → 앱 스프레드시트 로컬 시트(SHEET_ECOMAP)에 저장. 관찰 지점별(pointMode).
  '생태지도': {
    sheet: SHEET_ECOMAP,   // spreadsheetId 없음 → SPREADSHEET_ID 사용
    pointMode: true,
    // 제네릭 수정(updateTopic_)용 열 순서 (HEADERS_ECOMAP 타임스탬프 다음 열들과 일치)
    writeOrder: ['school', 'studentId', 'studentName', 'lat', 'lng', 'date',
                 'location', 'species', 'count', 'temp', 'humidity', 'photoUrl'],
    fields: [
      { key: 'school',      match: ['학교'] },
      { key: 'studentId',   match: ['학번'] },
      { key: 'studentName', match: ['이름'], exclude: ['생명체'] },
      { key: 'lat',         match: ['위도'], type: 'number' },
      { key: 'lng',         match: ['경도'], type: 'number' },
      { key: 'date',        match: ['날짜'], type: 'date' },
      { key: 'location',    match: ['장소'], exclude: ['사진'] },
      { key: 'species',     match: ['생명체'] },
      { key: 'count',       match: ['개체'], type: 'number' },
      { key: 'temp',        match: ['온도'], type: 'number' },
      { key: 'humidity',    match: ['습도'], type: 'number' },
      { key: 'photoUrl',    match: ['사진'], type: 'photo' }
    ]
  }
};

function readTopic_(topicKey) {
  const cfg = TOPIC_SHEETS[topicKey];
  if (!cfg) {
    return { ok: false, error: '알 수 없는 주제입니다: ' + topicKey };
  }

  let sheet;
  try {
    const src = SpreadsheetApp.openById(cfg.spreadsheetId || SPREADSHEET_ID);
    sheet = getResponseSheet_(src, cfg);
  } catch (e) {
    return { ok: false, error: '응답 스프레드시트에 접근할 수 없습니다 (배포 계정의 열람 권한 확인): ' + e };
  }
  if (!sheet) {
    // 앱 입력 주제인데 아직 시트가 없으면(= setupSheets 전) 학교만, 측정값은 빈 배열로 반환.
    if (cfg.input) {
      const schools0 = readSchools_(SpreadsheetApp.openById(SPREADSHEET_ID));
      return {
        topic: topicKey,
        schools: schools0.map(s => ({ school: s.name, lat: s.lat, lng: s.lng, measurements: [] }))
      };
    }
    return { ok: false, error: '응답 시트를 찾지 못했습니다: ' + topicKey };
  }

  const values = sheet.getDataRange().getValues();
  const cols = resolveColumns_(values[0], cfg.fields);
  const rows = values.slice(1);

  const records = rows
    .filter(r => cols.school !== undefined && r[cols.school])
    .map(r => buildRecord_(r, cfg, cols));

  const schools = readSchools_(SpreadsheetApp.openById(SPREADSHEET_ID));
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

// 한 행 → 레코드 객체 (필드 타입별 변환 + sumFields 파생)
function buildRecord_(r, cfg, cols) {
  const rec = { timestamp: r[0] instanceof Date ? r[0].toISOString() : String(r[0] || '') };
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
        rec[f.key] = parseTags_(raw, f.options);
        break;
      case 'photo':
        rec[f.key] = parsePhotoUrl_(raw);
        break;
      default:
        rec[f.key] = String(raw === null || raw === undefined ? '' : raw).trim();
    }
  });
  if (cfg.sumFields) {
    rec.total = cfg.sumFields.reduce((sum, k) => sum + (Number(rec[k]) || 0), 0);
  }
  return rec;
}

// pointMode 주제(생태지도): 관찰마다 위경도를 가진 배열 반환. { topic, observations, schools:[이름] }
function readTopicPoints_(topicKey) {
  const cfg = TOPIC_SHEETS[topicKey];
  if (!cfg) return { ok: false, error: '알 수 없는 주제입니다: ' + topicKey };

  const appSs = SpreadsheetApp.openById(SPREADSHEET_ID);
  const schoolNames = readSchools_(appSs).map(s => s.name);

  let sheet;
  try {
    const src = SpreadsheetApp.openById(cfg.spreadsheetId || SPREADSHEET_ID);
    sheet = getResponseSheet_(src, cfg);
  } catch (e) {
    return { ok: false, error: '스프레드시트에 접근할 수 없습니다: ' + e };
  }
  if (!sheet || sheet.getLastRow() < 2) {
    return { topic: topicKey, observations: [], schools: schoolNames };
  }

  const values = sheet.getDataRange().getValues();
  const cols = resolveColumns_(values[0], cfg.fields);
  const observations = values.slice(1)
    .filter(r => cols.lat !== undefined && cols.lng !== undefined && r[cols.lat] !== '' && r[cols.lng] !== '')
    .map(r => buildRecord_(r, cfg, cols))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return { topic: topicKey, observations: observations, schools: schoolNames };
}

// 응답 스프레드시트에서 데이터 탭 선택: gid 우선, 없으면 이름, 둘 다 없으면 첫 탭.
// cfg.sheet가 지정됐는데 그 이름의 탭이 없으면 null (엉뚱한 첫 탭을 읽지 않도록).
function getResponseSheet_(ss, cfg) {
  if (cfg.gid !== undefined && cfg.gid !== null) {
    const byGid = ss.getSheets().filter(sh => sh.getSheetId() === cfg.gid)[0];
    if (byGid) return byGid;
  }
  if (cfg.sheet) {
    return ss.getSheetByName(cfg.sheet) || null;
  }
  return ss.getSheets()[0];
}

// 체크박스(중복선택) 응답 파싱.
// options가 주어지면 값 내부 콤마로 깨지지 않도록 옵션 문자열을 직접 매칭.
function parseTags_(raw, options) {
  const s = String(raw === null || raw === undefined ? '' : raw).trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map(String).filter(Boolean);
    } catch (e) { /* fall through */ }
  }
  if (options && options.length) {
    const found = options.filter(o => s.indexOf(o) > -1);
    if (found.length) {
      let rem = s;
      found.forEach(o => { rem = rem.split(o).join(''); });
      rem.split(',').forEach(t => { const v = t.trim(); if (v) found.push(v); }); // "기타" 자유입력 등
      return found;
    }
  }
  return s.split(',').map(t => t.trim()).filter(Boolean);
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

// 디버그: 응답 시트의 실제 헤더와 매핑 결과 확인 (?topic=열섬&mode=headers)
function getTopicHeaders_(topicKey) {
  const cfg = TOPIC_SHEETS[topicKey];
  if (!cfg) return { ok: false, error: '알 수 없는 주제입니다: ' + topicKey };
  let sheet;
  try {
    sheet = getResponseSheet_(SpreadsheetApp.openById(cfg.spreadsheetId || SPREADSHEET_ID), cfg);
  } catch (e) {
    return { ok: false, error: '응답 스프레드시트에 접근할 수 없습니다: ' + e };
  }
  if (!sheet) return { ok: false, error: '응답 시트를 찾지 못했습니다: ' + topicKey };
  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const cols = resolveColumns_(headerRow, cfg.fields);
  const resolved = {};
  cfg.fields.forEach(f => {
    resolved[f.key] = cols[f.key] !== undefined ? String(headerRow[cols[f.key]]) : null;
  });
  return { topic: topicKey, sheet: sheet.getName(), headers: headerRow, resolved: resolved };
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
// Forms 업로드 사진 공유 설정
// Forms 파일 업로드는 기본 비공개라 지도에서 안 보임 → 링크 공개로 변경.
// 웹 에디터에서 수동 실행하거나, 행사 당일 5분 시간 트리거로 걸어둘 것.
// 파일 소유자가 이 스크립트 계정이 아니면 실패함 (폼 소유권 필요).
// ─────────────────────────────────────────────
function shareTopicPhotos() {
  const props = PropertiesService.getScriptProperties();
  const done = JSON.parse(props.getProperty('sharedPhotoIds') || '{}');
  let shared = 0, failed = 0;

  Object.keys(TOPIC_SHEETS).forEach(topicKey => {
    const cfg = TOPIC_SHEETS[topicKey];
    let sheet;
    try {
      sheet = getResponseSheet_(SpreadsheetApp.openById(cfg.spreadsheetId || SPREADSHEET_ID), cfg);
    } catch (e) {
      Logger.log('사진 공유: ' + topicKey + ' 스프레드시트 접근 실패 — ' + e);
      return;
    }
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
