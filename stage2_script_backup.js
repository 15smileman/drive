const canvas = document.getElementById('playfield');
const ctx = canvas.getContext('2d');

const PIXELS_PER_METER = 22;
const DT_TARGET = 1 / 60;
const MAX_STEER = degToRad(28);
const ACCEL_RATE = 440;
const BRAKE_RATE = 1040;
const DRAG = 1.7;
const ROLLING_RESIST = 80;
const WHEEL_BASE = 110;

// 트랙 설정
const TRACK = {
  // 둥근 사각형 외곽 트랙
  outer: {
    centerX: 480,
    centerY: 270,
    width: 820,    // 트랙 너비
    height: 360,   // 트랙 높이
    radius: 120,   // 모서리 반경
    lineWidth: 100,
  },
  // S자 코스 (내부)
  sCurve: {
    startX: 480,
    startY: 200,
    width: 80,
    segments: [
      // S자 경로 포인트들 (추후 정교하게 조정)
      { x: 480, y: 200 },
      { x: 420, y: 250 },
      { x: 380, y: 300 },
      { x: 420, y: 350 },
      { x: 480, y: 380 },
      { x: 540, y: 350 },
      { x: 580, y: 300 },
      { x: 540, y: 250 },
      { x: 480, y: 220 },
    ]
  }
};

// DOM 초기화 및 이벤트 리스너 설정 함수
function initializeGame() {
  gameOverlay = document.getElementById('game-overlay');
  overlayTitle = document.getElementById('overlay-title');
  overlayMessage = document.getElementById('overlay-message');
  startGameBtn = document.getElementById('start-game-btn');

  successOverlay = document.getElementById('success-overlay');
  successTitle = document.getElementById('success-title');
  successTime = document.getElementById('success-time');

  if (!gameOverlay || !overlayTitle || !overlayMessage || !startGameBtn) {
    console.error('게임 오버레이 요소들을 찾을 수 없습니다.');
    return;
  }

  if (!successOverlay || !successTitle || !successTime) {
    console.error('성공 오버레이 요소들을 찾을 수 없습니다.');
    return;
  }

  startGameBtn.addEventListener('click', () => {
    console.log('시작 버튼 클릭됨');
    if (startGameBtn.classList.contains('restart')) {
      restartFromFailure();
    } else {
      startGame();
    }
  });

  initializeControlButtons();
  initializeChallengeButtons();

  console.log('게임 초기화 완료');
}

function initializeControlButtons() {
  const resetBtn = document.getElementById('reset-btn-mobile');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (game && gameStarted && !gameFailed) {
        game.reset(true);
        resetAllTimeRecords();
        startChallenge();
      }
    });
  }

  const arrowButtons = {
    forward: document.getElementById('forward-btn'),
    backward: document.getElementById('backward-btn'),
    left: document.getElementById('left-btn'),
    right: document.getElementById('right-btn'),
    brake: document.getElementById('brake-btn')
  };

  Object.keys(arrowButtons).forEach(direction => {
    const button = arrowButtons[direction];
    if (!button) return;

    const startEvent = (e) => {
      e.preventDefault();
      if (controls) {
        controls.state.set(direction, true);
      }
    };

    const endEvent = (e) => {
      e.preventDefault();
      if (controls) {
        controls.state.set(direction, false);
      }
    };

    button.addEventListener('touchstart', startEvent);
    button.addEventListener('touchend', endEvent);
    button.addEventListener('touchcancel', endEvent);
    button.addEventListener('mousedown', startEvent);
    button.addEventListener('mouseup', endEvent);
    button.addEventListener('mouseleave', endEvent);
  });
}

const controls = new Controls();
let game = null;
let running = false;
let gameStarted = false;
let gameFailed = false;
let runtimeError = null;
let lastTime = performance.now();

let gameOverlay, overlayTitle, overlayMessage, startGameBtn;

// 주행 도전 시스템 변수들
let currentChallenge = 'outer'; // 기본값: 외곽 트랙
let consecutiveMode = false; // 연속 주행 모드 (전체 버튼)
let challengeStartTime = null;
let completedCourses = new Set();
let timeRecords = {
  outer: null,
  s: null,
  all: null
};
let successOverlay, successTitle, successTime;

function startGame() {
  game = new Game();
  runtimeError = null;
  gameStarted = true;
  gameFailed = false;
  running = true;

  gameOverlay.classList.add('hidden');

  startChallenge();

  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function restartFromFailure() {
  if (!game) return;

  game.reset(false);
  runtimeError = null;
  gameStarted = true;
  gameFailed = false;
  running = true;

  gameOverlay.classList.add('hidden');

  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function showGameOver(title, message, isRestart = false) {
  running = false;
  gameStarted = false;

  overlayTitle.textContent = title;
  overlayMessage.textContent = message;
  startGameBtn.textContent = isRestart ? '다시 시작' : '게임 시작';
  startGameBtn.className = isRestart ? 'start-btn restart' : 'start-btn';
  gameOverlay.classList.remove('hidden');
}

function failGame() {
  if (!gameFailed) {
    gameFailed = true;
    setTimeout(() => {
      showGameOver('주행 실패!', '차선을 이탈했습니다. 다시 시도해보세요.', true);
    }, 1000);
  }
}

function loop(now) {
  if (!running) return;
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  try {
    game.update(dt);
    game.render();
  } catch (err) {
    runtimeError = err;
    running = false;
    console.error('시뮬레이터 오류:', err);
    drawFatalError(err);
    return;
  }
  requestAnimationFrame(loop);
}

function Controls() {
  this.state = new Map();
  this.touchState = {
    touching: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0
  };

  const keyMap = {
    ArrowUp: 'forward',
    ArrowDown: 'backward',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    KeyW: 'forward',
    KeyS: 'backward',
    KeyA: 'left',
    KeyD: 'right',
    Space: 'brake',
    KeyR: 'reset',
  };

  window.addEventListener('keydown', (e) => {
    const action = keyMap[e.code];
    if (action) {
      if (action === 'reset') {
        if (game) {
          game.reset(true);
          resetAllTimeRecords();
          startChallenge();
        }
        return;
      }
      this.state.set(action, true);
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    const action = keyMap[e.code];
    if (action) {
      this.state.set(action, false);
      e.preventDefault();
    }
  });

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;

    if (this.checkCarBrakeButtonClick(touchX, touchY)) {
      this.state.set('brake', true);
      setTimeout(() => {
        this.state.set('brake', false);
      }, 200);
      return;
    }

    this.touchState.touching = true;
    this.touchState.startX = touchX;
    this.touchState.startY = touchY;
    this.touchState.currentX = this.touchState.startX;
    this.touchState.currentY = this.touchState.startY;
  });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!this.touchState.touching) return;

    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    this.touchState.currentX = touch.clientX - rect.left;
    this.touchState.currentY = touch.clientY - rect.top;

    this.updateTouchControls();
  });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    this.touchState.touching = false;
    this.state.set('forward', false);
    this.state.set('backward', false);
    this.state.set('left', false);
    this.state.set('right', false);
  });

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    if (this.checkCarBrakeButtonClick(clickX, clickY)) {
      this.state.set('brake', true);
      setTimeout(() => {
        this.state.set('brake', false);
      }, 200);
    }
  });

  this.updateTouchControls = function() {
    if (!this.touchState.touching) return;

    const deltaX = this.touchState.currentX - this.touchState.startX;
    const deltaY = this.touchState.currentY - this.touchState.startY;

    if (deltaY < -30) {
      this.state.set('forward', true);
      this.state.set('backward', false);
    } else if (deltaY > 30) {
      this.state.set('backward', true);
      this.state.set('forward', false);
    } else {
      this.state.set('forward', false);
      this.state.set('backward', false);
    }

    if (deltaX < -20) {
      this.state.set('left', true);
      this.state.set('right', false);
    } else if (deltaX > 20) {
      this.state.set('right', true);
      this.state.set('left', false);
    } else {
      this.state.set('left', false);
      this.state.set('right', false);
    }
  };

  this.checkCarBrakeButtonClick = function(clickX, clickY) {
    if (!game || !game.car) return false;

    const car = game.car;
    const carScreenX = car.position.x;
    const carScreenY = car.position.y;

    const distance = Math.sqrt(
      Math.pow(clickX - carScreenX, 2) +
      Math.pow(clickY - carScreenY, 2)
    );

    return distance <= 18;
  };
}

function Game() {
  this.elapsed = 0;
  this.currentCourse = currentChallenge;
  this.courseCompleted = false;
  this.lapProgress = 0; // 외곽 트랙 진행도 (0~1)
  this.outerCompleted = false; // 외곽 트랙 완주 여부 (연속 모드용)
  this.sCompleted = false; // S자 트랙 완주 여부 (연속 모드용)

  // 신호등 시스템
  this.trafficLights = this.initTrafficLights();

  this.reset(true);
}

// 신호등 초기화 (랜덤으로 2개 선택하되 처음엔 모두 초록색)
Game.prototype.initTrafficLights = function() {
  const lights = [
    { id: 1, x: 640, y: 390, red: false, willBeRed: false },  // 680 → 640 (중앙으로 40px)
    { id: 2, x: 640, y: 150, red: false, willBeRed: false },  // 680 → 640 (중앙으로 40px)
    { id: 3, x: 320, y: 150, red: false, willBeRed: false },  // 280 → 320 (중앙으로 40px)
    { id: 4, x: 320, y: 390, red: false, willBeRed: false }   // 280 → 320 (중앙으로 40px)
  ];

  // 랜덤으로 2개 선택하여 빨간색으로 바뀔 예정으로 표시
  const indices = [0, 1, 2, 3];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  lights[indices[0]].willBeRed = true;
  lights[indices[1]].willBeRed = true;

  return lights;
};

Game.prototype.reset = function reset(fullReset = false) {
  // 도전 모드에 따라 시작 위치 설정
  if (currentChallenge === 's') {
    // S자 트랙: 오른쪽 아래 출발점 (출발 표시선 바로 위)
    // 차량을 -90도 회전하여 위쪽을 향하도록 함
    this.car = new Car({ x: 800, y: 460, heading: -Math.PI / 2 });
    this.sTrackReachedGoal = false;  // 도착 여부
  } else {
    // 둥근 사각형 트랙: 하단 중앙
    this.car = new Car({ x: 480, y: 450, heading: 0 });
  }
  this.elapsed = 0;
  this.grade = '진행중';
  this.courseCompleted = false;
  this.lapProgress = 0;
  this.startAngle = null; // 출발 각도 기록용 (사용 안 함)
  this.trackStartPos = null;  // 트랙 시작 위치
  this.trackDistance = 0;     // 트랙 이동 거리
  this.lastPos = null;        // 마지막 위치
};

Game.prototype.update = function update(dt) {
  // 도전이 진행 중일 때만 시간 증가 (완주 후에는 정지)
  if (challengeStartTime !== null) {
    this.elapsed += dt;
  }

  const car = this.car;
  const snapshot = controls.state;
  const steerInput = (snapshot.get('left') ? -1 : 0) + (snapshot.get('right') ? 1 : 0);
  const accelInput = (snapshot.get('forward') ? 1 : 0) + (snapshot.get('backward') ? -1 : 0);

  const brake = snapshot.get('brake');
  car.update(dt, accelInput, steerInput, brake);
  this.checkBoundaries(car);
  this.evaluate();
};

Game.prototype.checkBoundaries = function checkBoundaries(car) {
  // 차선 이탈 감지
  const carPos = car.position;

  if (currentChallenge === 'outer' || currentChallenge === 'all') {
    // 외곽 원형 트랙 차선 체크
    const dx = carPos.x - TRACK.outer.centerX;
    const dy = carPos.y - TRACK.outer.centerY;
    const distFromCenter = Math.sqrt(
      Math.pow(dx / TRACK.outer.radiusX, 2) +
      Math.pow(dy / TRACK.outer.radiusY, 2)
    );

    const outerBound = 1 + (TRACK.outer.lineWidth / 2) / TRACK.outer.radiusX;
    const innerBound = 1 - (TRACK.outer.lineWidth / 2) / TRACK.outer.radiusX;

    // 차선 이탈 시 실패
    if (distFromCenter > outerBound || distFromCenter < innerBound) {
      this.grade = '차선 이탈';
      failGame();
    }
  }

  if (currentChallenge === 's' || currentChallenge === 'all') {
    // S자 트랙 차선 체크
    const laneWidth = 100;
    const maxDistance = laneWidth / 2;  // 중심선에서 최대 50px까지 허용

    // S자 트랙 중심선까지의 최단 거리 계산
    const distToSTrack = this.getDistanceToSTrack(carPos.x, carPos.y);

    // 차선 이탈 시 실패
    if (distToSTrack > maxDistance) {
      this.grade = '차선 이탈';
      failGame();
    }
  }
};

// S자 트랙 중심선까지의 최단 거리 계산
Game.prototype.getDistanceToSTrack = function getDistanceToSTrack(x, y) {
  // S자 트랙의 주요 포인트들
  const points = [];

  // 시작 직선 추가 (도착 구역 포함)
  for (let py = 50; py <= 270; py += 10) {
    points.push({ x: 80, y: py });
  }

  // 베지어 곡선을 샘플링해서 포인트 추가
  for (let t = 0; t <= 1; t += 0.05) {
    // 첫 번째 베지어 곡선: (80, 270) -> (150, 340), (250, 360) -> (360, 320)
    const t1 = 1 - t;
    const x1 = t1*t1*t1*80 + 3*t1*t1*t*150 + 3*t1*t*t*250 + t*t*t*360;
    const y1 = t1*t1*t1*270 + 3*t1*t1*t*340 + 3*t1*t*t*360 + t*t*t*320;
    points.push({ x: x1, y: y1 });
  }

  for (let t = 0; t <= 1; t += 0.05) {
    // 두 번째 베지어 곡선: (360, 320) -> (470, 280), (550, 240) -> (630, 220)
    const t1 = 1 - t;
    const x2 = t1*t1*t1*360 + 3*t1*t1*t*470 + 3*t1*t*t*550 + t*t*t*630;
    const y2 = t1*t1*t1*320 + 3*t1*t1*t*280 + 3*t1*t*t*240 + t*t*t*220;
    points.push({ x: x2, y: y2 });
  }

  for (let t = 0; t <= 1; t += 0.05) {
    // 세 번째 베지어 곡선: (630, 220) -> (710, 200), (760, 220) -> (800, 270)
    const t1 = 1 - t;
    const x3 = t1*t1*t1*630 + 3*t1*t1*t*710 + 3*t1*t*t*760 + t*t*t*800;
    const y3 = t1*t1*t1*220 + 3*t1*t1*t*200 + 3*t1*t*t*220 + t*t*t*270;
    points.push({ x: x3, y: y3 });
  }

  // 끝 직선 추가 (출발 구역 포함)
  for (let py = 270; py <= 520; py += 10) {
    points.push({ x: 800, y: py });
  }

  // 모든 포인트와의 거리 계산 후 최소값 반환
  let minDist = Infinity;
  for (const p of points) {
    const dist = Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2);
    if (dist < minDist) {
      minDist = dist;
    }
  }

  return minDist;
};

Game.prototype.evaluate = function evaluate() {
  const car = this.car;

  if (currentChallenge === 'outer' || currentChallenge === 'all') {
    // 도착 주차 구역 체크 (90도 회전 - 가로 방향)
    const finishX = TRACK.outer.centerX;
    const finishY = 450;  // 차량 시작 위치와 동일 (차량 중앙 기준)
    const finishWidth = 110;  // 가로 길이
    const finishHeight = 70;  // 세로 길이

    // 차량 크기
    const carLength = car.length;  // 80
    const carWidth = car.width;    // 40

    // 시작 위치 기록 (거리 체크용)
    if (!this.trackStartPos) {
      this.trackStartPos = { x: car.position.x, y: car.position.y };
      this.trackDistance = 0;
      this.lastPos = { x: car.position.x, y: car.position.y };
    }

    // 이동 거리 누적
    const dx = car.position.x - this.lastPos.x;
    const dy = car.position.y - this.lastPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    this.trackDistance += distance;
    this.lastPos = { x: car.position.x, y: car.position.y };

    // 트랙 둘레 계산
    const trackPerimeter = 2 * (TRACK.outer.width + TRACK.outer.height) * 0.9;

    // 주차 구역 안에 들어왔는지 체크 (박스가 가로 방향이므로 차량 길이와 너비 매칭)
    const inFinishX = Math.abs(car.position.x - finishX) < (finishWidth / 2 - carLength / 2);
    const inFinishY = Math.abs(car.position.y - finishY) < (finishHeight / 2 - carWidth / 2);
    const inFinish = inFinishX && inFinishY;

    // 완주 조건: 주차 구역 안 + 정지 + 충분한 거리 이동
    const readyToComplete = inFinish && Math.abs(car.speed) < 0.5 && this.trackDistance > trackPerimeter * 0.7;

    if (readyToComplete && !this.courseCompleted) {
      this.courseCompleted = true;

      // 연속 모드가 아닐 때만 성공 메시지 표시
      if (!consecutiveMode) {
        this.grade = '완주 성공';
      }

      checkCourseComplete();
    }

    // 신호등 색상 업데이트 (차량 크기의 1.5배 거리 앞에서 빨간색으로 변경)
    const carSize = 80;  // 차량 길이
    const triggerDistance = carSize * 1.5;  // 120px

    this.trafficLights.forEach(light => {
      const distance = Math.sqrt(
        (car.position.x - light.x) ** 2 +
        (car.position.y - light.y) ** 2
      );

      // willBeRed가 true인 신호등: 가까워지면 빨간색으로 변경
      if (distance < triggerDistance && light.willBeRed && !light.red) {
        light.red = true;
      }
    });
  }

  if (currentChallenge === 's' || currentChallenge === 'all') {
    // S자 트랙 주차 구역 체크
    const parkingX = 80;
    const parkingY = 65;
    const parkingWidth = 70;  // 차량 폭(40px)보다 충분히 크게 (기존 55 → 70)
    const parkingHeight = 110;  // 차량 길이(80px)보다 충분히 크게 (기존 90 → 110)

    // 차량의 크기 (길이 80px, 폭 40px)
    const carLength = car.length;  // 80
    const carWidth = car.width;    // 40

    // 차량이 완전히 주차 구역 안에 들어왔는지 체크
    const inParkingX = Math.abs(car.position.x - parkingX) < (parkingWidth / 2 - carWidth / 2);
    const inParkingY = Math.abs(car.position.y - parkingY) < (parkingHeight / 2 - carLength / 2);
    const inParking = inParkingX && inParkingY;

    // 차량 각도가 수직(-90도)에 가까운지 체크 (±15도 허용)
    const targetHeading = -Math.PI / 2;
    let headingDiff = Math.abs(normalizeAngle(car.heading - targetHeading));
    const correctAngle = headingDiff < degToRad(15);

    // 완주 조건: 주차 구역 안 + 정지 + 올바른 각도
    const readyToComplete = inParking && Math.abs(car.speed) < 0.5 && correctAngle;

    // 완주 조건을 만족할 때만 초록색 표시 (동기화)
    if (readyToComplete && !this.sTrackReachedGoal) {
      this.sTrackReachedGoal = true;
    }

    // 완주 처리
    if (readyToComplete && !this.courseCompleted) {
      this.courseCompleted = true;
      this.grade = '완주 성공';

      // 도전 완료 체크 (즉시 시간 기록)
      checkCourseComplete();
    }
  }
};

Game.prototype.render = function render() {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  this.drawBackground();
  this.drawTrack();
  this.car.draw(ctx);
  ctx.restore();
  drawOverlays(this.grade, this.elapsed, this.car.speed, this.car.steerAngle);
};

Game.prototype.drawBackground = function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, '#2c323a');
  grad.addColorStop(1, '#191f28');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#171d24';
  ctx.fillRect(0, 0, canvas.width, 45);
  ctx.fillRect(0, canvas.height - 80, canvas.width, 80);
};

Game.prototype.drawTrack = function drawTrack() {
  ctx.save();

  const outer = TRACK.outer;
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 4;

  // 도전 모드에 따라 다른 트랙 표시
  if (currentChallenge === 'outer' || currentChallenge === 'all') {
    // 원형 트랙 그리기
    this.drawOvalTrack();
  }

  if (currentChallenge === 's' || currentChallenge === 'all') {
    // S자 트랙 그리기
    this.drawSTrack();
  }

  ctx.restore();
};

// 둥근 사각형 트랙 그리기
Game.prototype.drawOvalTrack = function drawOvalTrack() {
  const outer = TRACK.outer;
  const laneWidth = outer.lineWidth;  // 100

  // 둥근 사각형 경로를 그리는 함수
  function drawRoundedRect(width, height, radius) {
    const x = outer.centerX - width / 2;
    const y = outer.centerY - height / 2;

    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.arcTo(x + width, y, x + width, y + radius, radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    ctx.lineTo(x + radius, y + height);
    ctx.arcTo(x, y + height, x, y + height - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  }

  // 1. 가장 바깥쪽 노란색 라인 (가장 두꺼운 선)
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = laneWidth + 10;  // 110
  drawRoundedRect(outer.width, outer.height, outer.radius);
  ctx.stroke();

  // 2. 빨간색 도로 면 (중간 두께)
  ctx.strokeStyle = '#c53030';
  ctx.lineWidth = laneWidth;  // 100
  drawRoundedRect(outer.width, outer.height, outer.radius);
  ctx.stroke();

  // 3. 흰색 라인 (중간보다 조금 얇은 선)
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = laneWidth - 16;  // 84
  drawRoundedRect(outer.width, outer.height, outer.radius);
  ctx.stroke();

  // 4. 빨간색 도로 안쪽 (가장 얇은 선)
  ctx.strokeStyle = '#c53030';
  ctx.lineWidth = laneWidth - 22;  // 78
  drawRoundedRect(outer.width, outer.height, outer.radius);
  ctx.stroke();

  // 5. 중앙 흰색 점선
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);  // 점선 패턴
  drawRoundedRect(outer.width, outer.height, outer.radius);
  ctx.stroke();
  ctx.setLineDash([]);  // 점선 해제

  // 6. 도착 주차 구역 (하단 중앙, 90도 회전 - 가로 방향)
  const finishX = outer.centerX;
  const finishY = 450;  // 차량 시작 위치와 동일 (차량 중앙 기준)
  const finishWidth = 110;  // 가로 길이 (기존 height)
  const finishHeight = 70;  // 세로 길이 (기존 width)

  // 완주 조건 만족 시 초록색, 아니면 노란색
  const finishColor = this.courseCompleted ? '#4ade80' : '#facc15';

  // 주차 구역 사각형 (점선)
  ctx.strokeStyle = finishColor;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 8]);
  ctx.strokeRect(
    finishX - finishWidth / 2,
    finishY - finishHeight / 2,
    finishWidth,
    finishHeight
  );

  // 주차 구역 양 끝 실선 (상단/하단)
  ctx.setLineDash([]);
  ctx.lineWidth = 3;

  // 상단 실선
  ctx.beginPath();
  ctx.moveTo(finishX - finishWidth / 2, finishY - finishHeight / 2);
  ctx.lineTo(finishX + finishWidth / 2, finishY - finishHeight / 2);
  ctx.stroke();

  // 하단 실선
  ctx.beginPath();
  ctx.moveTo(finishX - finishWidth / 2, finishY + finishHeight / 2);
  ctx.lineTo(finishX + finishWidth / 2, finishY + finishHeight / 2);
  ctx.stroke();

  // 도착 텍스트 (주차 박스 안)
  ctx.fillStyle = finishColor;
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('출발/도착', finishX, finishY);

  // 7. 신호등 4개 (1번: 우하단, 2번: 우상단, 3번: 좌상단, 4번: 좌하단)
  const trafficLightRadius = 12;
  const trafficLightBorder = 3;

  // 신호등 그리기 함수
  const drawTrafficLight = (x, y, label, isRed) => {
    // 신호등 기둥 (회색)
    ctx.fillStyle = '#4a5568';
    ctx.fillRect(x - 3, y, 6, 30);

    // 신호등 박스 (검은색)
    ctx.fillStyle = '#2d3748';
    ctx.fillRect(x - trafficLightRadius - 2, y - trafficLightRadius - 2,
                 trafficLightRadius * 2 + 4, trafficLightRadius * 2 + 4);

    // 신호등 (빨간색 또는 초록색)
    ctx.fillStyle = isRed ? '#ef4444' : '#10b981';
    ctx.beginPath();
    ctx.arc(x, y, trafficLightRadius - trafficLightBorder, 0, Math.PI * 2);
    ctx.fill();

    // 번호 표시
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 45);
  };

  // 트랙 중심과 크기 정보
  const trackCenterX = outer.centerX;
  const trackCenterY = outer.centerY;

  // 신호등을 트랙 도로 위에 배치 (동적 색상)
  this.trafficLights.forEach(light => {
    drawTrafficLight(light.x, light.y, light.id.toString(), light.red);
  });
};

// S자 트랙만 그리기
Game.prototype.drawSTrack = function drawSTrack() {
  const laneWidth = 100;

  // 중심선 경로 정의
  function drawCenterPath() {
    ctx.moveTo(80, 80);
    ctx.lineTo(80, 270);
    ctx.bezierCurveTo(150, 340, 250, 360, 360, 320);
    ctx.bezierCurveTo(470, 280, 550, 240, 630, 220);
    ctx.bezierCurveTo(710, 200, 760, 220, 800, 270);
    ctx.lineTo(800, 480);
  }

  // 1. 가장 바깥쪽 노란색 라인 (가장 두꺼운 선)
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = laneWidth + 10;  // 100 + 10 = 110
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  drawCenterPath();
  ctx.stroke();

  // 2. 빨간색 도로 면 (중간 두께)
  ctx.strokeStyle = '#c53030';
  ctx.lineWidth = laneWidth;  // 100
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  drawCenterPath();
  ctx.stroke();

  // 3. 흰색 라인 (중간보다 조금 얇은 선)
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = laneWidth - 16;  // 100 - 16 = 84
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  drawCenterPath();
  ctx.stroke();

  // 4. 빨간색 도로 안쪽 (가장 얇은 선)
  ctx.strokeStyle = '#c53030';
  ctx.lineWidth = laneWidth - 22;  // 100 - 22 = 78
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  drawCenterPath();
  ctx.stroke();

  // 5. 중앙 흰색 점선
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);  // 점선 패턴
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  drawCenterPath();
  ctx.stroke();
  ctx.setLineDash([]);  // 점선 해제

  // 6. 도착 주차 구역 (왼쪽 위)
  const goalColor = this.sTrackReachedGoal ? '#4ade80' : '#facc15';  // 도착하면 초록색
  const parkingY = 65;  // 주차 구역 중앙 Y 좌표
  const parkingWidth = 70;  // 차량 폭(40px)보다 충분히 크게 (기존 55 → 70)
  const parkingHeight = 110;  // 차량 길이(80px)보다 충분히 크게 (기존 90 → 110)

  // 주차 구역 사각형 (점선)
  ctx.strokeStyle = goalColor;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 8]);
  ctx.strokeRect(
    80 - parkingWidth / 2,
    parkingY - parkingHeight / 2,
    parkingWidth,
    parkingHeight
  );

  // 주차 구역 양 끝 실선
  ctx.setLineDash([]);
  ctx.lineWidth = 3;

  // 왼쪽 실선
  ctx.beginPath();
  ctx.moveTo(80 - parkingWidth / 2, parkingY - parkingHeight / 2);
  ctx.lineTo(80 - parkingWidth / 2, parkingY + parkingHeight / 2);
  ctx.stroke();

  // 오른쪽 실선
  ctx.beginPath();
  ctx.moveTo(80 + parkingWidth / 2, parkingY - parkingHeight / 2);
  ctx.lineTo(80 + parkingWidth / 2, parkingY + parkingHeight / 2);
  ctx.stroke();

  // 도착점 텍스트
  ctx.fillStyle = goalColor;
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('도착', 80, 15);

  // 오른쪽 아래 점선 (출발점)
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.moveTo(800 - laneWidth / 2, 480);
  ctx.lineTo(800 - laneWidth / 2, 520);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(800 + laneWidth / 2, 480);
  ctx.lineTo(800 + laneWidth / 2, 520);
  ctx.stroke();

  // 출발점 텍스트
  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('출발', 800, 535);

  ctx.setLineDash([]);
};

function Car({ x, y, heading }) {
  this.position = { x, y };
  this.heading = heading;
  this.velocity = 0;
  this.speed = 0;
  this.length = 80; // 116에서 축소
  this.width = 40; // 54에서 축소
  this.mass = 1200;
  this.steerAngle = 0;
}

Car.prototype.update = function update(dt, accelInput, steerInput, brake) {
  const targetSteer = steerInput * MAX_STEER;
  const steerRate = degToRad(120);
  const steerDelta = clamp(targetSteer - this.steerAngle, -steerRate * dt, steerRate * dt);
  this.steerAngle += steerDelta;

  let accelForce = accelInput * ACCEL_RATE;
  if (brake) {
    accelForce -= Math.sign(this.velocity) * BRAKE_RATE;
  }

  let drag = DRAG * this.velocity;
  let roll = ROLLING_RESIST * Math.sign(this.velocity);
  if (Math.abs(this.velocity) < 2) {
    roll = this.velocity * 40;
  }
  const force = accelForce - drag - roll;
  const acceleration = force / this.mass;
  this.velocity += acceleration * dt * PIXELS_PER_METER;
  const stopThreshold = brake ? 2 : 0.2;
  if (Math.abs(this.velocity) < stopThreshold && accelInput === 0) {
    this.velocity = 0;
  }
  this.speed = this.velocity;

  const slip = Math.tan(this.steerAngle) * (this.velocity / WHEEL_BASE) * dt;
  this.heading += slip;
  this.position.x += Math.cos(this.heading) * this.velocity * dt;
  this.position.y += Math.sin(this.heading) * this.velocity * dt;
};

Car.prototype.draw = function draw(context) {
  context.save();
  context.translate(this.position.x, this.position.y);
  context.rotate(this.heading + Math.PI / 2);
  context.fillStyle = '#e9edf5';
  context.strokeStyle = '#1c2028';
  context.lineWidth = 2;
  context.beginPath();
  drawRoundedRectPath(context, -this.width / 2, -this.length / 2, this.width, this.length, 10);
  context.fill();
  context.stroke();

  context.fillStyle = '#12151c';
  context.fillRect(-this.width / 2 + 4, -this.length / 2 + 8, this.width - 8, 14);
  context.fillRect(-this.width / 2 + 4, this.length / 2 - 20, this.width - 8, 14);

  // 자동차 앞쪽 방향 화살표 (빨간색)
  context.fillStyle = '#dc2626';
  context.strokeStyle = '#ffffff';
  context.lineWidth = 1.5;

  // 화살표 삼각형 (차량 앞쪽 = -length/2 방향)
  context.beginPath();
  const arrowY = -this.length / 2 - 8; // 차량 앞쪽 끝에서 약간 밖
  context.moveTo(0, arrowY); // 화살표 끝점
  context.lineTo(-6, arrowY + 10); // 왼쪽 날개
  context.lineTo(6, arrowY + 10); // 오른쪽 날개
  context.closePath();
  context.fill();
  context.stroke();

  // 자동차 중앙의 정지 버튼
  context.fillStyle = '#dc2626';
  context.strokeStyle = '#ffffff';
  context.lineWidth = 2;
  context.beginPath();
  context.arc(0, 0, 10, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = '#ffffff';
  context.fillRect(-4, -4, 8, 8);

  context.restore();
};

function drawOverlays(grade, elapsed, speed, steerAngle) {
  ctx.save();

  const speedKmh = Math.abs(speed / PIXELS_PER_METER * 3.6);
  const steerDegrees = (steerAngle * 180 / Math.PI);
  const direction = speed >= 0 ? '전진' : '후진';
  let steerDirection = '직진';
  if (Math.abs(steerAngle) > 0.05) {
    steerDirection = steerAngle > 0 ? '우회전' : '좌회전';
  }

  const hudText = `상태: ${grade} | 시간: ${elapsed.toFixed(1)}s | 속도: ${speedKmh.toFixed(1)} km/h | 조향: ${steerDegrees.toFixed(0)}° | ${direction} | ${steerDirection}`;

  ctx.font = '16px Segoe UI, sans-serif';
  const hudTextWidth = ctx.measureText(hudText).width;

  const hudWidth = hudTextWidth + 40;
  const hudHeight = 35;
  const x = (canvas.width - hudWidth) / 2;
  const y = 5;

  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x, y, hudWidth, hudHeight);

  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, hudWidth, hudHeight);

  const textX = x + 20;
  const textY = y + 23;

  ctx.fillStyle = grade === '완주 성공' ? '#4ade80' : grade === '진행중' ? '#f8fafc' : '#f87171';
  ctx.fillText(`상태: ${grade}`, textX, textY);

  ctx.fillStyle = '#f8fafc';
  const gradeWidth = ctx.measureText(`상태: ${grade}`).width;
  const remainingText = ` | 시간: ${elapsed.toFixed(1)}s | 속도: ${speedKmh.toFixed(1)} km/h | 조향: ${steerDegrees.toFixed(0)}° | ${direction} | ${steerDirection}`;
  ctx.fillText(remainingText, textX + gradeWidth, textY);

  ctx.restore();
}

function drawFatalError(err) {
  ctx.save();
  ctx.fillStyle = 'rgba(12, 16, 24, 0.92)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f87171';
  ctx.font = '28px Segoe UI';
  ctx.fillText('렌더링 오류가 발생했습니다.', 80, 160);
  ctx.font = '18px Segoe UI';
  const message = (err && err.message) ? err.message : String(err);
  wrapText(ctx, 'Message: ' + message, 80, 210, canvas.width - 160, 24);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('자세한 내용은 개발자 도구(Console)를 확인하세요.', 80, 320);
  ctx.restore();
}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrapText(context, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const testLine = line + word + ' ';
    if (context.measureText(testLine).width > maxWidth && line) {
      context.fillText(line.trimEnd(), x, y);
      line = word + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    context.fillText(line.trimEnd(), x, y);
  }
}

function drawRoundedRectPath(ctx, x, y, width, height, radius) {
  let r = radius;
  if (ctx.roundRect) {
    ctx.roundRect(x, y, width, height, r);
    return;
  }
  r = Math.max(0, Math.min(r, Math.min(width, height) / 2));
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

// 도전 시스템 함수들
function initializeChallengeButtons() {
  const challengeButtons = document.querySelectorAll('.challenge-btn');

  challengeButtons.forEach(button => {
    button.addEventListener('click', () => {
      // 모든 버튼에서 active 클래스 제거
      challengeButtons.forEach(btn => btn.classList.remove('active'));
      // 클릭된 버튼에 active 클래스 추가
      button.classList.add('active');

      // 현재 도전 모드 설정
      currentChallenge = button.dataset.course;

      // 전체(all) 모드인 경우 연속 주행 모드 활성화
      if (currentChallenge === 'all') {
        consecutiveMode = true;

        if (game) {
          // 경과 시간 초기화
          game.elapsed = 0;
          // 외곽 트랙부터 시작
          game.car = new Car({ x: 480, y: 450, heading: 0 });
          game.grade = '진행중';
          game.courseCompleted = false;
          game.outerCompleted = false;
          game.sCompleted = false;
        }

        console.log(`연속 주행 모드 활성화 - 외곽 → S자 순서로 완주`);
      } else {
        consecutiveMode = false;
        console.log(`개별 코스 모드: ${currentChallenge}`);
      }

      // 개별 도전 모드(외곽, S자)를 선택한 경우 초기화
      if (currentChallenge !== 'all') {
        if (game) {
          // 경과 시간 초기화
          game.elapsed = 0;

          // 도전 모드에 따라 차량 시작 위치 설정
          if (currentChallenge === 's') {
            // S자 트랙: 오른쪽 아래 출발점
            game.car = new Car({ x: 800, y: 460, heading: -Math.PI / 2 });
            game.sTrackReachedGoal = false;
          } else {
            // 외곽 트랙: 하단 중앙
            game.car = new Car({ x: 480, y: 450, heading: 0 });
          }
          game.grade = '진행중';
          game.courseCompleted = false;
        }

        // 전체 시간 기록도 초기화
        timeRecords.all = null;
        const allTimeElement = document.getElementById('time-record-all');
        if (allTimeElement) {
          allTimeElement.textContent = '--';
          allTimeElement.classList.remove('completed');
        }
        console.log(`${currentChallenge} 개별 도전 모드 - 차량 위치, 경과 시간 및 전체 시간 초기화`);
      }

      // 도전 시작
      startChallenge();
    });
  });
}

function resetAllTimeRecords() {
  timeRecords = {
    outer: null,
    s: null,
    all: null
  };

  const timeElements = document.querySelectorAll('.time-record');
  timeElements.forEach(element => {
    element.textContent = '--';
    element.classList.remove('completed');
  });

  console.log('모든 시간 기록이 초기화되었습니다.');
}

function startChallenge() {
  challengeStartTime = performance.now();
  completedCourses.clear();
  console.log(`${currentChallenge} 코스 도전 시작!`);
}

function checkCourseComplete() {
  // 이미 처리되었거나 타이머가 없으면 무시
  if (!game || !challengeStartTime) return;

  const currentTime = performance.now();
  const courseTime = (currentTime - challengeStartTime) / 1000;

  // 연속 주행 모드인 경우
  if (consecutiveMode) {
    // 외곽 트랙 완주 체크
    if (!game.outerCompleted && currentChallenge === 'all') {
      game.outerCompleted = true;
      console.log('외곽 트랙 완주! S자 트랙으로 이동...');

      // S자 트랙 시작 위치로 이동
      game.car = new Car({ x: 800, y: 460, heading: -Math.PI / 2 });
      game.courseCompleted = false;
      game.sTrackReachedGoal = false;
      return; // 계속 진행
    }

    // S자 트랙 완주 체크 (전체 완주)
    if (game.outerCompleted && !game.sCompleted) {
      game.sCompleted = true;
      timeRecords.all = courseTime;
      updateTimeDisplay('all', courseTime);
      showSuccessMessage(`🎉 전체 코스 완주!`, courseTime);
      challengeStartTime = null; // 타이머 정지 (중복 호출 방지)
      console.log(`전체 완주 시간 기록: ${courseTime.toFixed(1)}초`);
      return;
    }
  } else {
    // 개별 코스 모드
    timeRecords[currentChallenge] = courseTime;
    updateTimeDisplay(currentChallenge, courseTime);
    showSuccessMessage(`🎉 ${getCourseDisplayName(currentChallenge)} 완주!`, courseTime);
    challengeStartTime = null; // 타이머 정지 (중복 호출 방지)
    console.log(`${currentChallenge} 완주 시간 기록: ${courseTime.toFixed(1)}초`);
  }
}

function getCourseDisplayName(course) {
  const names = {
    outer: '트랙',
    s: 'S라인',
    all: '전체 코스'
  };
  return names[course] || course;
}

function showSuccessMessage(message, time) {
  if (!successOverlay || !successTitle || !successTime) return;

  const displayTime = (time && time > 0) ? time.toFixed(1) : '0.0';

  successTitle.textContent = message;
  successTime.textContent = `시간: ${displayTime}초`;

  successOverlay.classList.remove('hidden');

  setTimeout(() => {
    successOverlay.classList.add('hidden');
    console.log('성공 메시지 숨김 완료');
  }, 3000);
}

function updateTimeDisplay(course, time) {
  const recordElement = document.getElementById(`time-record-${course}`);
  if (recordElement) {
    recordElement.textContent = `${time.toFixed(1)}초`;
    recordElement.classList.add('completed');
  }
}

// 페이지 로드 완료 후 게임 초기화
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM 로드 완료');
  initializeGame();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeGame);
} else {
  initializeGame();
}
