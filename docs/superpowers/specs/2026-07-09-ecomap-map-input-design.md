# 생태지도 — 지도 클릭 입력 기능 설계

작성일: 2026-07-09
대상: ScienceCoLab (학교 간 공동 기후 탐구 웹앱)

## 배경 / 목적

2026 공동탐구 공식 7개 주제 중 **생태지도**는 관찰 지점을 지도에 직접 찍는 방식이 본질이다
(원본 폼에도 "지도에 찍어서 올리는 방식이면 좋겠습니다"라고 명시). 사용자는 이 폼의 편집
권한이 없고, 폼은 "수집 예시" 단계다. 또한 Google Forms는 지도 클릭으로 좌표를 받을 수 없다.

따라서 생태지도만 **앱 네이티브 입력**으로 구현한다: 학생이 지도를 클릭해 위치를 찍고,
모달에서 관찰 정보를 입력·제출하면 앱이 소유한 스프레드시트에 좌표와 함께 저장한다.
나머지 6개 주제(열섬·태양광·미세먼지·우리나라날씨·탄소배출·소리데이터)는 기존 Forms 기반
읽기전용 그대로 둔다.

## 확정된 결정 (사용자 승인)

- **범위**: 생태지도만 앱 지도입력. 나머지 6개는 Forms 유지.
- **표시**: 관찰 하나 = 지도 핀 하나(개별 핀). 가까운 핀은 클러스터링.
- **인증**: 학교 비밀번호 + 학번/이름 (Forms 6개와 동일한 `학교+학번` 연속성 키).
- **입력 순서**: 지도 먼저 클릭 → 좌표 캡처 → 모달.

## 아키텍처 개요

생태지도는 학교 집계가 아닌 **관찰 지점(pointMode) 주제**다. 기존 주제 시스템을 최대한
재사용하되, 지도 렌더링과 입력 경로만 분기한다.

```
[학생 브라우저]
  생태지도 선택 → ⊕ → 지도 클릭(좌표) → 모달 입력 → POST(topic=생태지도)
        │                                                   │
        ▼ 핀/클러스터 렌더 (GET ?topic=생태지도)             ▼
[GAS doGet] ← 생태지도 시트 ──────────────── [GAS doPost] 비번검증→사진저장→행추가
        │                                                   │
        └──────── 앱 스프레드시트(SPREADSHEET_ID)의 `생태지도` 시트 ────────┘
```

## 데이터 모델

### 새 시트 `생태지도` (앱 스프레드시트 `SPREADSHEET_ID` 안)

| 타임스탬프 | 학교명 | 학번 | 이름 | 위도 | 경도 | 관찰날짜 | 장소설명 | 생명체이름 | 개체수 | 온도 | 습도 | 사진URL |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

- `Code.gs`의 `setupSheets`에 이 시트 자동 생성/헤더 추가.
- 다른 6개 주제(외부 응답 스프레드시트)는 변경 없음.

### GET 응답 형태 (pointMode)

```json
{ "topic": "생태지도",
  "observations": [
    { "timestamp":"ISO", "school":"미래초등학교", "studentId":"20831", "studentName":"홍길동",
      "lat":37.4712, "lng":126.6183, "date":"2026-07-10", "location":"운동장 화단 옆",
      "species":"민들레", "count":12, "temp":29.5, "humidity":54,
      "photoUrl":"https://drive.google.com/thumbnail?id=...&sz=w1024" }
  ] }
```

기존 6개 주제의 `{topic, schools:[...]}` 와 달리 `observations` 키를 쓴다.

## 프론트엔드

### `js/topics.js` — 생태지도 주제 추가

```
ecomap: {
  id:'ecomap', label:'생태지도', icon:'🌿', apiTopic:'생태지도',
  pointMode:true,                 // 관찰 지점 렌더 분기
  chartMetrics:[], groupBy:null,  // 차트 없음(기존 "수치만" 로직 재사용)
  statFields:[{count},{temp},{humidity}],
  tagFields:[{species},{school},{location}],
  envTitle:'관찰 정보', hasNotes:false,
  marker:{ pointLabel: rec=>rec.species, badge: rec=>rec.count, color:'#3d8b40' }
}
```
칩은 `TOPICS`에서 자동 생성되므로 7번째 칩이 자동 추가됨.

### `index.html`
- 카카오 SDK URL에 `&libraries=clusterer` 추가(클러스터러 로드).
- 입력 모달을 생태지도 필드에 맞게 조정(또는 생태지도 전용 필드 세트). 필드: 학교▼·학교
  비밀번호·학번·이름·관찰날짜·장소설명·생명체이름·개체수·온도(선택)·습도(선택)·사진.
  모달 상단에 "찍은 위치: 위도,경도 · [지도에서 다시 찍기]".
- FAB는 `pointMode` 주제일 때만 표시(현재는 항상 숨김).

### `js/app.js`
- **renderMarkers 분기**: `topic.pointMode`이면 `data.observations`를 순회하며 관찰마다
  `kakao.maps.Marker`(또는 초록 커스텀 핀) 생성 → `kakao.maps.MarkerClusterer`로 묶음.
  핀 클릭 → `openSidebar`에 단일 관찰을 담은 합성 객체 전달
  `{ school: <생명체이름 표시용>, lat, lng, measurements:[obs] }`.
  기존 pill CustomOverlay 경로는 6개 주제용으로 유지(클러스터 미적용).
- **입력 흐름**: 생태지도 선택 시 FAB 표시. FAB 클릭 → "지도를 눌러 위치를 찍으세요" 모드 →
  지도 `click` 이벤트로 `latlng` 캡처 → 임시 핀 표시 + 모달 오픈. 모달의 "다시 찍기"로 재선택.
- **제출**: 기존 `handleSubmit` 패턴 확장 — POST 바디에 `topic:'생태지도'`, `lat`,`lng`,
  관찰 필드, `photoBase64` 포함. 성공 시 모달 닫고 `loadData(force)`로 핀 갱신.
- **사이드바**: `pointMode`는 차트가 없으므로 기존 차트 숨김 로직 재사용. 헤딩=생명체이름,
  메타=학교·관찰날짜, 수치=개체수·온·습도, 태그=학교·이름·장소설명, 사진 1장.

## 백엔드 (`Code.gs`)

- **`setupSheets`**: `생태지도` 시트 + 헤더 자동 생성 추가.
- **`TOPIC_SHEETS['생태지도']`**: `{ sheet:'생태지도', pointMode:true, fields:[...] }`
  (외부 spreadsheetId 없음 → 앱 스프레드시트 로컬 시트). fields는 위도/경도/생명체/개체수 등 매핑.
- **`doGet`**: `topic==='생태지도'`(pointMode)면 관찰 배열을 `{topic, observations:[...]}`로 반환
  (학교 집계 안 함, 각 행의 위경도 그대로).
- **`doPost`**: 바디의 `topic`으로 라우팅. `생태지도`면 → 학교 비번 검증(`readSchools_`) →
  `savePhoto_` 재사용 → `생태지도` 시트에 좌표 포함 행 append. 레거시 무-topic(climate) 제출
  경로는 **제거**(기온·습도 주제 삭제로 이미 미사용). 알 수 없는 topic이면 오류 JSON 반환.

## 보안

- 제출은 **학교 비밀번호 일치** 필요(기존 6개의 자기입력 신원과 동일한 `학교+학번` 연속성).
- 비번은 Schools 시트 평문 저장(기존 모델 유지). GitHub Pages 공개 환경에서 학교 비번이
  무차별 입력에 대한 1차 방어.
- 사진은 `savePhoto_`가 Drive에 저장하며 `ANYONE_WITH_LINK` 공유(기존과 동일).

## 검증

1. **목데이터**: `js/mock-data.js`에 생태지도 관찰 5~10건(서로 다른 좌표) 추가 →
   `?mock=1`에서 개별 핀·클러스터·핀 클릭 상세 확인.
2. **입력 흐름(로컬)**: `python -m http.server 8000` + 브라우저로
   생태지도 선택 → ⊕ → 지도 클릭 → 모달 입력 → (mock에서는 제출 시뮬레이션/실백엔드 연결 시 실제 POST).
3. **백엔드**: 배포 후 지도 클릭→모달→제출 → `생태지도` 시트에 좌표 포함 행 추가 확인,
   새로고침 시 핀 표시 확인. `?topic=생태지도`로 observations JSON 확인.

## 범위 밖 (YAGNI)

- 관찰 기록 수정/삭제 UI (선생님이 시트에서 직접).
- GPS 현재위치 자동찍기(추후 옵션).
- 다중 사진.
- 다른 6개 주제의 앱 입력화(폼 유지).
