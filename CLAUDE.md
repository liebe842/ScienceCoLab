# ScienceCoLab — 학교 간 공동 기후 탐구

여러 학교 학생들이 기온·습도를 함께 측정하고 지도 위에서 비교 시각화하는 웹 프로젝트.

## 아키텍처

```
[학생 브라우저]                          [선생님 / 운영자]
    │                                        │
    │  GET / POST                            │ Schools 시트에 학교 사전 등록
    ↓                                        ↓
[GAS 웹앱]  ←──── 코드: clasp push ──── [로컬 Code.gs]
    │
    ├─→ Google Spreadsheet (Schools, Measurements 시트)
    └─→ Google Drive (사진 폴더)
```

- **백엔드**: Google Apps Script (`Code.gs`) — 스프레드시트 기반 JSON API
- **프론트엔드**: 순수 HTML/CSS/JS, 프레임워크 없음
- **외부 라이브러리**: 카카오맵 SDK, Chart.js
- **배포**: 백엔드는 GAS 웹앱, 프론트엔드는 GitHub Pages 정적 호스팅

## 파일 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 단일 페이지 — 지도, 사이드바, FAB, 입력 모달, 라이트박스 |
| `css/style.css` | 디자인 시스템 전체 |
| `js/app.js` | 지도/마커/사이드바/모달/차트/리사이즈/라이트박스 로직 |
| `js/config.js` | 카카오 JS 키, GAS API URL (운영자가 채움) |
| `Code.gs` | GAS 백엔드 — `doGet`, `doPost`, `setupSheets` |
| `appsscript.json` | GAS 매니페스트 (시간대 Asia/Seoul, OAuth 스코프) |
| `.clasp.json` | clasp ↔ GAS 프로젝트 연결 (스크립트 ID) — `.gitignore`로 제외 |
| `.claspignore` | clasp가 GAS에 푸시할 파일 화이트리스트 (`Code.gs`, `appsscript.json`만) |

## 데이터 모델

### 스프레드시트 `Schools` 시트
| 학교명 | 위도 | 경도 | 비밀번호 |
|---|---|---|---|

### 스프레드시트 `Measurements` 시트
| 타임스탬프 | 학교명 | 학생이름 | 측정날짜 | 측정시간 | 측정장소 | 기온 | 습도 | 주변환경 | 특이사항 | 사진URL |
|---|---|---|---|---|---|---|---|---|---|---|

- **주변환경 셀 형식**: JSON 배열 문자열 (`["A","B"]`) — 값에 콤마가 들어가는 경우(예: "높은 건물(아파트, 빌딩)") 안전하게 보존하기 위함
- 레거시 콤마 구분 데이터도 `parseEnvironment_` 폴백으로 호환

### 스프레드시트 `열섬` 시트 (앱 모달 입력 주제)
| 타임스탬프 | 학교명 | 학번 | 이름 | 측정날짜 | 측정시간 | 날씨 | 측정장소 | 바닥상태 | 측정환경 | 열원 | 기온 | 사진URL |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

- **열섬은 구글폼이 아니라 앱 로그인 → 모달 제출**로 수집 (생태지도와 같은 방식). `HEADERS_HEAT` 상수가 열 정의.
- `측정환경` 셀도 JSON 배열 문자열. 헤더는 `TOPIC_SHEETS['열섬'].fields`의 match 키워드를 포함하도록 명명 (매핑 확인: `?topic=열섬&mode=headers`).

### 나머지 앱 입력 주제 시트 (태양광·미세먼지·우리나라날씨·탄소배출·소리데이터)
- **7개 주제 전부 앱 로그인 → 모달 제출**로 전환 완료 (구글폼 폐지). 각 주제가 중앙 스프레드시트의 동명 시트에 저장.
- 열 정의는 `HEADERS_SOLAR`/`HEADERS_DUST`/`HEADERS_WEATHER`/`HEADERS_CARBON`/`HEADERS_SOUND` 상수. 공통 선행 열: `타임스탬프 | 학교명 | 학번 | 이름 | 측정날짜 | (측정시간)` → 주제별 열 → `사진URL`.
- 체크박스 필드(`측정상황` 등)는 JSON 배열 문자열. `TOPIC_SHEETS[*].writeOrder`가 저장 열 순서, `fields`의 match가 읽기 매핑 (확인: `?topic=태양광&mode=headers`).
- 옛 외부 폼 응답 스프레드시트 ID는 코드에서 제거됨. 폼 데이터가 0건이라 손실 없이 컷오버.

### GAS GET 응답
```json
[
  {
    "school": "○○초",
    "lat": 37.5665,
    "lng": 126.978,
    "measurements": [
      {
        "timestamp": "ISO",
        "studentName": "...",
        "date": "yyyy-MM-dd",
        "time": "HH:mm",
        "location": "학교 운동장(모래)",
        "temp": 24.3,
        "humidity": 55,
        "environment": ["...", "..."],
        "notes": "...",
        "photoUrl": "https://drive.google.com/thumbnail?id=...&sz=w1024"
      }
    ]
  }
]
```

측정값은 timestamp 기준 **내림차순(최신이 0번째)** 으로 정렬됨.

## 개발 워크플로

### GAS 코드 수정 → 반영
```powershell
clasp push --force      # 로컬 → GAS 코드만 갱신
```
**주의**: `clasp push`만으로는 배포된 웹앱 URL이 갱신되지 않음. 웹 에디터에서:
→ 배포 관리 → 기존 배포 [편집] → 버전 [새 버전] → 배포 (URL은 유지됨)

### 시트 초기화
- 새 스프레드시트에 `Schools`/`Measurements`/`생태지도`/`열섬` 시트와 헤더 자동 생성
- 웹 에디터에서 함수 `setupSheets` 선택 → ▶ 실행
- idempotent — 여러 번 실행해도 안전
- **앱 입력 주제를 새로 추가할 때**: `HEADERS_*` 상수 + `setupSheets`에 `ensureSheet_` 한 줄 + `TOPIC_SHEETS`에 `sheet`/`input`/`writeOrder`/`fields` 등록 + `js/topics.js`에 `input:true`+`inputFields` 추가

### 첫 GAS 실행 시
- 권한 승인: "고급 → 안전하지 않음 → 프로젝트로 이동 → 허용"
- standalone 스크립트라 `SpreadsheetApp.getActive()`는 `null`. 항상 `openById(SPREADSHEET_ID)` 사용

## 핵심 설정 위치

### `Code.gs` 상단
- `SPREADSHEET_ID` — 스프레드시트 URL `/d/{ID}/edit`의 ID
- `PHOTO_FOLDER_ID` — Drive 폴더 URL `/folders/{ID}`의 ID

### `js/config.js`
- `KAKAO_APP_KEY` — 카카오 개발자 콘솔 → 플랫폼 키 → JavaScript 키
- `GAS_API_URL` — GAS 웹앱 배포 URL (`...exec`로 끝남)

## 배포 체크리스트

### 백엔드 (GAS)
1. Google Spreadsheet + Drive 폴더 생성, 두 ID 복사
2. `Code.gs`에 ID 채우고 `clasp push`
3. 웹 에디터에서 `setupSheets` 실행 (헤더/예시 학교 자동 생성)
4. 배포 → 새 배포 → 웹 앱
   - 실행 주체: **나(Me)**
   - 액세스 권한: **모든 사용자(Anyone)**
5. 발급 URL을 `js/config.js`에 입력

### 프론트엔드 (카카오 + GitHub Pages)
1. 카카오 개발자 콘솔 (https://developers.kakao.com)
   - 앱 추가 → JavaScript 키 복사
   - **제품 설정 → 카카오맵 활성화** ⚠️ 필수
   - **플랫폼 키 → Default JS Key → JavaScript SDK 도메인**에 사이트 도메인 등록
     - 로컬: `http://localhost:5500`, `http://127.0.0.1:5500`, `:8000`
     - 프로덕션: `https://{username}.github.io`
2. GitHub 레포 → Settings → Pages → main / root 선택
3. 발급된 GitHub Pages URL을 카카오 도메인에 추가 등록

## UX / 디자인 시스템

### 색상 의미 코드 (의도된 일관성)
- **파란색** (`#5b8def`, `#4a6dc7`, `#e8eef9`) — UI 강조, 시스템 요소, 습도 데이터
- **주황색** (`#d96b3e`) — 기온 데이터 전용
- **중성 회색** — 보조 메타 정보 (날짜, 측정자명 등)

### 주요 인터랙션 결정
- **입력 모달은 취소/X 버튼으로만 닫힘** — 배경 클릭으로 닫히지 않음 (입력 중 실수 방지)
- **사이드바 열리면 FAB가 좌측으로 슬라이드** — 가려지지 않도록. 모바일에서는 페이드 아웃
- **마커 크기 줌 연동** — `--marker-scale` CSS 변수, JS가 `zoom_changed` 이벤트로 갱신
- **마커 = CustomOverlay** — 학교명 + 측정 건수 뱃지가 보이는 알약 마커. `MarkerClusterer`는 미적용
- **사진 클릭 = 라이트박스** — 새 탭 아닌 풀스크린 모달. ESC/배경/X로 닫힘
- **꺾은선 점 클릭** — 사이드바 하단 "선택된 측정 기록" 영역(`sr-header` + 환경/사진/특이사항)이 그 기록으로 갱신. 기본은 가장 최근 기록 표시

### 사이드바 구조
1. 학교명 + 메타 (최근 시간, 총 건수)
2. 측정 장소별 평균 막대그래프
3. 시간순 추이 꺾은선그래프 (점 클릭 가능)
4. **선택된 기록 헤더** — 📍 장소 / 날짜 시간 / 🌡 기온 · 💧 습도
5. 학교 주변 환경 (선택된 기록의 환경 태그)
6. 현장 사진 (선택된 기록 1장, 큼지막)
7. 특이사항 (선택된 기록의 메모)
8. — 측정자: 이름

## 로그인 / 입력 모델

- **로그인 = 학교 비번 + 본인 입력** (별도 학생 명부 없음). 헤더 우상단 `[로그인]` → 학교 select + 학번 + 이름 + 학교 비밀번호.
- 프론트: `POST {action:'login', school, password}` → 백엔드 `login_`이 비번 검증. 성공 시 `{school, studentId, name, password}`를 **`sessionStorage`(키 `scl_session`)** 에 저장. `getSession/setSession/clearSession`(`js/app.js`).
- 로그인 상태에서 FAB(+) → 설문 모달. 학교·학번·이름·비번은 세션에서 자동 첨부(폼에 재입력 없음). 생태지도는 로그인 후 지도 클릭 → 모달.
- 모달 폼은 **주제별 `inputFields` 스키마**(`js/topics.js`)로 동적 렌더(`renderModalFields`/`renderField`). 타입: text/number/date/time/select/checkbox/photo/coord.
- 제출: `handleSubmit`이 세션 신원 + 스키마 값으로 payload 구성 → `POST`. 백엔드 `doPost` 라우팅:
  1. `action:'login'` → `login_`
  2. `topic:'생태지도'` → `submitEcomap_`(좌표 전용)
  3. 그 외 `input:true` 주제 → **제네릭 `submitTopic_`** (`cfg.writeOrder` 순서로 시트 append, `cfg.fields`의 type으로 직렬화)

## 보안 모델

- 학교별 비밀번호 — `Schools` 시트 D열에 평문 저장
- 모든 사람이 지도/데이터를 볼 수 있음. **로그인·제출만** 학교 비번 일치 필요 (제출 시 서버에서 재검증)
- 세션은 `sessionStorage`에 학교 비번 포함 저장 — 학교 단위 공유 비번이고 제출 시 재검증하므로 신뢰 모델상 허용. (개인별 비번이 필요해지면 강화 검토)
- 사진은 Drive에 저장하면서 `ANYONE_WITH_LINK` 공유 — `https://drive.google.com/thumbnail?id=...`로 임베드
- 학교 단위 협력 신뢰 모델. 외부에 무차별 공개 시 비번 정책 강화 필요

## 알려진 제약 / 트레이드오프

- **GAS 50MB 요청 한도** → 클라이언트가 사진을 1024px JPEG로 리사이즈 후 Base64 전송 (`resizeImage` 함수)
- **CORS 회피 패턴** → POST 시 `Content-Type: text/plain` 사용. preflight 미발생
- **측정 기록 수정/삭제 UI 없음** — 선생님이 스프레드시트에서 직접 수정
- **사진 1장만 지원** — 다중 업로드는 향후
- **클러스터링 미적용** — 학교가 많아지면 도입 검토. 현재는 학교당 알약 마커가 더 가독성 좋음

## 자주 빠지는 함정

- `clasp push` 후 **재배포 잊으면** 변경 미반영 — 웹 에디터에서 새 버전으로 배포 (deploymentId 유지)
- 카카오 도메인 등록은 **플랫폼 키 → JavaScript SDK 도메인** (제품 링크 관리 / 일반 / 고급 아님)
- 카카오 SDK 로드 안 되면 → **제품 설정 → 카카오맵 활성화** 확인
- 환경값에 콤마 들어가면 깨졌던 이슈 → JSON 직렬화로 해결됨. 옛 데이터 잔존 시 셀 직접 수정 필요
- standalone GAS에서 `SpreadsheetApp.getActive()`는 null — 항상 `openById` 사용
- `kakaoReady` 이벤트 race condition 방어 코드 있음 (`initApp` + 폴링)
