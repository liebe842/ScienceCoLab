// ScienceCoLab — 프론트엔드 로직

let map;
let markers = [];
let chartInstance = null;
let lineChartInstance = null;
let schoolsData = [];
// 사이드바 상태
let sidebarState = {
  school: null
};

// ─────────────────────────────────────────────
// 초기화 (kakaoReady race condition 방어)
// ─────────────────────────────────────────────
function initApp() {
  console.log('[ScienceCoLab] initApp 시작 — 카카오맵 생성');
  const container = document.getElementById('map');
  map = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(37.5665, 126.9780),
    level: 9
  });

  // 줌 레벨에 따라 마커 크기 자동 조정
  kakao.maps.event.addListener(map, 'zoom_changed', updateMarkerScale);
  updateMarkerScale();

  loadData();
}

// 카카오맵 줌 레벨: 1(가장 확대) ~ 14(가장 축소)
function updateMarkerScale() {
  if (!map) return;
  const level = map.getLevel();
  let scale;
  if (level <= 3)       scale = 1.15;  // 매우 가깝게 (도로/건물 단위)
  else if (level <= 6)  scale = 1.00;  // 가까움 (동/구 단위)
  else if (level <= 9)  scale = 0.85;  // 기본 (시 단위)
  else if (level <= 11) scale = 0.70;  // 멀리 (광역시/도 단위)
  else                  scale = 0.55;  // 매우 멀리 (전국)

  document.documentElement.style.setProperty('--marker-scale', scale);
}

// 이미 카카오 SDK가 로드되어 있으면 즉시 초기화, 아니면 이벤트 대기
if (window.kakao && window.kakao.maps && typeof kakao.maps.LatLng === 'function') {
  console.log('[ScienceCoLab] 카카오 SDK 이미 준비됨');
  initApp();
} else {
  console.log('[ScienceCoLab] kakaoReady 이벤트 대기...');
  window.addEventListener('kakaoReady', initApp);

  // 안전망: 5초 안에 이벤트가 안 오면 폴링으로 확인
  let attempts = 0;
  const pollTimer = setInterval(() => {
    attempts++;
    if (window.kakao && window.kakao.maps && typeof kakao.maps.LatLng === 'function') {
      clearInterval(pollTimer);
      if (!map) {
        console.warn('[ScienceCoLab] kakaoReady 이벤트 누락, 폴링으로 초기화');
        initApp();
      }
    } else if (attempts > 50) {
      clearInterval(pollTimer);
      console.error('[ScienceCoLab] 카카오 SDK 로드 실패 — JS 키나 도메인 등록 확인');
      const loading = document.getElementById('loading');
      if (loading) loading.textContent = '카카오맵을 불러오지 못했습니다. (키/도메인 확인)';
    }
  }, 200);
}

// ─────────────────────────────────────────────
// 데이터 로드 + 마커 렌더링
// ─────────────────────────────────────────────
async function loadData() {
  const loading = document.getElementById('loading');
  loading.style.display = 'block';
  loading.textContent = '데이터를 불러오는 중...';

  try {
    const res = await fetch(CONFIG.GAS_API_URL);
    const data = await res.json();

    if (!Array.isArray(data)) {
      throw new Error(data.error || '데이터 형식이 올바르지 않습니다');
    }

    schoolsData = data;
    renderMarkers(data);
    populateSchoolSelect();
    loading.style.display = 'none';
  } catch (err) {
    console.error(err);
    loading.textContent = '데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }
}

function renderMarkers(schools) {
  // 기존 마커 제거
  markers.forEach(m => m.setMap(null));
  markers = [];

  if (!schools.length) return;

  const bounds = new kakao.maps.LatLngBounds();
  const positions = [];

  schools.forEach(school => {
    const pos = new kakao.maps.LatLng(school.lat, school.lng);
    positions.push(pos);

    const count = (school.measurements || []).length;
    const el = document.createElement('div');
    el.className = 'school-marker';
    el.innerHTML = `
      <div class="sm-pin">
        <span class="sm-icon">🏫</span>
        <span class="sm-name">${escapeHtml(school.school)}</span>
        ${count > 0 ? `<span class="sm-count">${count}</span>` : ''}
      </div>
      <div class="sm-tail"></div>
    `;
    el.addEventListener('click', () => openSidebar(school));

    const overlay = new kakao.maps.CustomOverlay({
      position: pos,
      content: el,
      yAnchor: 1,
      xAnchor: 0.5,
      clickable: true
    });
    overlay.setMap(map);
    bounds.extend(pos);
    markers.push(overlay);
  });

  if (markers.length === 1) {
    map.setCenter(positions[0]);
  } else {
    map.setBounds(bounds);
  }
}

// ─────────────────────────────────────────────
// 사이드바
// ─────────────────────────────────────────────
function openSidebar(school) {
  const sidebar = document.getElementById('sidebar');
  const records = school.measurements || [];
  const latest = records[0];

  // 사이드바 상태 초기화 (학교 바뀔 때마다 리셋)
  sidebarState = { school };

  document.getElementById('sb-school').textContent = school.school;

  if (records.length === 0) {
    document.getElementById('sb-meta').textContent = '아직 측정 기록이 없습니다 · ⊕ 버튼으로 첫 측정값을 추가해 보세요';
    showSelectedRecord(null);
    renderLineChart([]);
    renderChart([]);
  } else {
    document.getElementById('sb-meta').textContent = `최근: ${latest.date} ${latest.time} · 총 ${records.length}건`;
    showSelectedRecord(latest); // 기본은 가장 최근 측정 (차트 점 클릭 시 갱신)
    renderLineChart(records);
    renderChart(records);
  }

  sidebar.classList.add('open');
}

// ─────────────────────────────────────────────
// 라이트박스 (사진 클릭 시 큰 이미지 팝업)
// ─────────────────────────────────────────────
function openLightbox(url) {
  document.getElementById('lightbox-img').src = url;
  document.getElementById('lightbox').classList.add('open');
}

function closeLightbox(e) {
  // 이미지 자체 클릭은 무시 (배경/X 버튼 클릭 시에만 닫힘)
  if (e && e.target && e.target.tagName === 'IMG') return;
  document.getElementById('lightbox').classList.remove('open');
}

// ESC 키로 라이트박스 닫기
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.getElementById('lightbox').classList.remove('open');
  }
});

// 클릭 위임: data-lightbox 이미지 → 라이트박스 열기
document.addEventListener('click', (e) => {
  const lbTarget = e.target.closest('[data-lightbox]');
  if (lbTarget) {
    e.preventDefault();
    openLightbox(lbTarget.dataset.lightbox);
  }
});

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
}

// ─────────────────────────────────────────────
// 꺾은선 그래프: 시간순 기온/습도 추이 + 클릭 시 상세
// ─────────────────────────────────────────────
function renderLineChart(records) {
  const canvas = document.getElementById('dataChartLine');
  if (lineChartInstance) {
    lineChartInstance.destroy();
    lineChartInstance = null;
  }
  if (!records.length) return;

  // 시간 오름차순으로 정렬한 사본
  const sorted = [...records].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const labels = sorted.map(r => `${(r.date || '').slice(5)} ${r.time || ''}`.trim()); // MM-DD HH:mm
  const temps = sorted.map(r => (r.temp === null || r.temp === undefined || isNaN(r.temp)) ? null : r.temp);
  const humids = sorted.map(r => (r.humidity === null || r.humidity === undefined || isNaN(r.humidity)) ? null : r.humidity);

  lineChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '기온 (℃)',
          data: temps,
          borderColor: '#d96b3e',
          backgroundColor: 'rgba(217, 107, 62, 0.15)',
          tension: 0.3,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: '#d96b3e',
          yAxisID: 'y',
          spanGaps: true
        },
        {
          label: '습도 (%)',
          data: humids,
          borderColor: '#5b8def',
          backgroundColor: 'rgba(91, 141, 239, 0.15)',
          tension: 0.3,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: '#5b8def',
          yAxisID: 'y1',
          spanGaps: true
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      onClick: (evt, elements) => {
        if (elements && elements.length > 0) {
          const idx = elements[0].index;
          showSelectedRecord(sorted[idx]);
        }
      },
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 } } }
      },
      scales: {
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: '℃', font: { size: 10 } }
        },
        y1: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: '%', font: { size: 10 } },
          grid: { drawOnChartArea: false }
        },
        x: {
          ticks: { font: { size: 10 }, maxRotation: 0, autoSkipPadding: 12 }
        }
      }
    }
  });
}

// 선택된 측정 기록 → 헤더 + 환경/사진/특이사항/측정자 영역 갱신
function showSelectedRecord(record) {
  const $place = document.getElementById('sr-place');
  const $when  = document.getElementById('sr-when');
  const $stats = document.getElementById('sr-stats');
  const $env   = document.getElementById('sb-environment');
  const $photo = document.getElementById('sb-photos');
  const $notes = document.getElementById('sb-notes');
  const $auth  = document.getElementById('sb-author');

  if (!record) {
    $place.textContent = '📍 -';
    $when.textContent  = '-';
    $stats.innerHTML   = '-';
    $env.innerHTML     = '';
    $photo.innerHTML   = '';
    $notes.textContent = '-';
    $auth.textContent  = '';
    return;
  }

  $place.textContent = `📍 ${record.location || '-'}`;
  $when.textContent  = `${record.date || ''} ${record.time || ''}`.trim() || '-';
  $stats.innerHTML   = `
    <span class="sr-temp">🌡 ${formatNum(record.temp)}℃</span>
    <span class="sr-humid">💧 ${formatNum(record.humidity)}%</span>
  `;

  const env = record.environment || [];
  $env.innerHTML = env.length
    ? env.map(e => `<span class="tag">${escapeHtml(e)}</span>`).join('')
    : '<span style="color:#aaa;font-size:12px;">-</span>';

  $photo.innerHTML = record.photoUrl
    ? `<img src="${escapeAttr(record.photoUrl)}" alt="" loading="lazy" data-lightbox="${escapeAttr(record.photoUrl)}" />`
    : '<div class="empty">사진 없음</div>';

  $notes.textContent = record.notes || '-';
  $auth.textContent  = record.studentName ? `— 측정자: ${record.studentName}` : '';
}

// ─────────────────────────────────────────────
// 차트: 측정 장소별 평균 기온/습도 비교
// ─────────────────────────────────────────────
function renderChart(records) {
  const canvas = document.getElementById('dataChart');
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  if (!records.length) return;

  // 측정 장소별 그룹
  const groups = {};
  records.forEach(r => {
    const key = r.location || '기타';
    if (!groups[key]) groups[key] = { temps: [], humids: [] };
    if (r.temp !== null && !isNaN(r.temp)) groups[key].temps.push(r.temp);
    if (r.humidity !== null && !isNaN(r.humidity)) groups[key].humids.push(r.humidity);
  });

  const labels = Object.keys(groups);
  const tempAvg = labels.map(k => avg(groups[k].temps));
  const humidAvg = labels.map(k => avg(groups[k].humids));

  chartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '기온 (℃)',
          data: tempAvg,
          backgroundColor: 'rgba(217, 107, 62, 0.7)',
          borderRadius: 6,
          yAxisID: 'y'
        },
        {
          label: '습도 (%)',
          data: humidAvg,
          backgroundColor: 'rgba(91, 141, 239, 0.7)',
          borderRadius: 6,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 } } },
        title: {
          display: true,
          text: '측정 장소별 평균',
          font: { size: 12, weight: '700' },
          color: '#4a5670'
        }
      },
      scales: {
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: '℃', font: { size: 10 } }
        },
        y1: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: '%', font: { size: 10 } },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

// ─────────────────────────────────────────────
// 입력 모달
// ─────────────────────────────────────────────
function openModal() {
  const backdrop = document.getElementById('modalBackdrop');
  populateSchoolSelect();
  prefillDateTime();
  backdrop.classList.add('open');
}

function closeModal() {
  const backdrop = document.getElementById('modalBackdrop');
  backdrop.classList.remove('open');
  const form = document.getElementById('submitForm');
  form.reset();
  const preview = document.getElementById('photoPreview');
  preview.classList.remove('show');
  preview.removeAttribute('src');
}

function populateSchoolSelect() {
  const select = document.getElementById('f-school');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">학교를 선택하세요</option>' +
    schoolsData.map(s => `<option value="${escapeAttr(s.school)}">${escapeHtml(s.school)}</option>`).join('');
  if (current) select.value = current;
}

function prefillDateTime() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('f-date').value = `${yyyy}-${mm}-${dd}`;
  document.getElementById('f-time').value = `${hh}:${mi}`;
}

// 사진 미리보기 + "기타" 선택 시 직접 입력 칸 토글
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'f-photo') {
    const file = e.target.files[0];
    const preview = document.getElementById('photoPreview');
    if (!file) {
      preview.classList.remove('show');
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      preview.src = ev.target.result;
      preview.classList.add('show');
    };
    reader.readAsDataURL(file);
  }

  if (e.target && e.target.id === 'f-location') {
    const otherInput = document.getElementById('f-location-other');
    if (e.target.value === '기타') {
      otherInput.classList.add('show');
      otherInput.required = true;
      otherInput.focus();
    } else {
      otherInput.classList.remove('show');
      otherInput.required = false;
      otherInput.value = '';
    }
  }

  if (e.target && e.target.id === 'f-env-other-cb') {
    const otherInput = document.getElementById('f-env-other');
    if (e.target.checked) {
      otherInput.classList.add('show');
      otherInput.focus();
    } else {
      otherInput.classList.remove('show');
      otherInput.value = '';
    }
  }
});

// 제출 핸들러
async function handleSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = document.getElementById('submitBtn');
  const fd = new FormData(form);

  const photoFile = fd.get('photo');
  if (!photoFile || !photoFile.size) {
    showToast('사진을 첨부해 주세요.', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = '제출 중...';

  try {
    const { base64, mimeType } = await resizeImage(photoFile, 1024, 0.85);

    // "기타" 선택 시 직접 입력값을 location으로 사용
    let location = fd.get('location');
    if (location === '기타') {
      const other = (fd.get('locationOther') || '').trim();
      if (!other) {
        showToast('측정 장소를 직접 입력해 주세요.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = '제출';
        return;
      }
      location = other;
    }

    // 환경: 기타 체크 시 직접 입력값으로 치환, 최소 1개 검증
    let environment = fd.getAll('environment');
    if (environment.includes('기타')) {
      const other = (fd.get('environmentOther') || '').trim();
      if (!other) {
        showToast('"기타"를 선택하셨다면 학교 특징을 직접 입력해 주세요.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = '제출';
        return;
      }
      environment = environment.filter(v => v !== '기타').concat(other);
    }
    if (environment.length === 0) {
      showToast('우리 학교의 특징을 한 가지 이상 선택해 주세요.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = '제출';
      return;
    }

    const payload = {
      school: fd.get('school'),
      password: fd.get('password'),
      studentName: fd.get('studentName'),
      date: fd.get('date'),
      time: fd.get('time'),
      location: location,
      temp: fd.get('temp'),
      humidity: fd.get('humidity'),
      environment: environment,
      notes: fd.get('notes'),
      photoBase64: base64,
      photoMimeType: mimeType
    };

    // GAS는 application/json preflight를 처리하지 않으므로 text/plain으로 보냄
    const res = await fetch(CONFIG.GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (!result.ok) {
      showToast(result.error || '제출에 실패했습니다.', 'error');
    } else {
      showToast('측정 데이터가 등록되었습니다 ✓', 'success');
      closeModal();
      await loadData();
    }
  } catch (err) {
    console.error(err);
    showToast('네트워크 오류로 제출에 실패했습니다.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '제출';
  }
}

// ─────────────────────────────────────────────
// 사진 리사이즈 (Canvas → JPEG Base64)
// ─────────────────────────────────────────────
function resizeImage(file, maxSize = 1024, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = ev => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width >= height) {
            height = Math.round(height * (maxSize / width));
            width = maxSize;
          } else {
            width = Math.round(width * (maxSize / height));
            height = maxSize;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        // dataUrl: "data:image/jpeg;base64,xxxx" → base64 부분만 추출
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, mimeType: 'image/jpeg' });
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────
// 토스트
// ─────────────────────────────────────────────
let toastTimer = null;
function showToast(message, type = '') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = 'toast show' + (type ? ' ' + type : '');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.className = 'toast' + (type ? ' ' + type : '');
  }, 3000);
}

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────
function avg(arr) {
  if (!arr.length) return 0;
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
}
function formatNum(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return Number(n).toFixed(1).replace(/\.0$/, '');
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(s) {
  return String(s ?? '').replace(/["'<>&]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// 전역 노출 (HTML inline 핸들러용)
window.openModal = openModal;
window.closeModal = closeModal;
window.handleSubmit = handleSubmit;
window.closeSidebar = closeSidebar;
window.closeLightbox = closeLightbox;
