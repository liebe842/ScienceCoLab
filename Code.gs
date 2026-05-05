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
// ─────────────────────────────────────────────
function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
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
