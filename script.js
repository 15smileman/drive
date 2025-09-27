const canvas = document.getElementById('playfield');
const ctx = canvas.getContext('2d');

const PIXELS_PER_METER = 22; // 화면 픽셀을 실제 감각에 맞추기 위한 비율
const DT_TARGET = 1 / 60;
const MAX_STEER = degToRad(28);
const ACCEL_RATE = 440;
const BRAKE_RATE = 1040; // 2배 강화된 브레이크
const DRAG = 1.7;
const ROLLING_RESIST = 80;
const WHEEL_BASE = 110;

const hud = {
  // HTML에서 현재 상태 섹션이 제거되어 더 이상 사용하지 않음
};

// DOM 초기화 및 이벤트 리스너 설정 함수
function initializeGame() {
  // DOM 요소들 가져오기
  gameOverlay = document.getElementById('game-overlay');
  overlayTitle = document.getElementById('overlay-title');
  overlayMessage = document.getElementById('overlay-message');
  startGameBtn = document.getElementById('start-game-btn');

  // 요소들이 존재하는지 확인
  if (!gameOverlay || !overlayTitle || !overlayMessage || !startGameBtn) {
    console.error('게임 오버레이 요소들을 찾을 수 없습니다.');
    return;
  }

  // 시작 게임 버튼 이벤트 리스너
  startGameBtn.addEventListener('click', () => {
    console.log('시작 버튼 클릭됨'); // 디버깅용
    startGame();
  });

  // 컨트롤 버튼들도 초기화
  initializeControlButtons();

  console.log('게임 초기화 완료'); // 디버깅용
}

// 다른 버튼들의 이벤트 리스너 설정 함수
function initializeControlButtons() {
  // 리셋 버튼
  const resetBtn = document.getElementById('reset-btn-mobile');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (game && gameStarted && !gameFailed) {
        game.reset();
      }
    });
  }

  // 브레이크 버튼 (기존)
  const brakeBtn = document.getElementById('brake-btn');
  if (brakeBtn) {
    brakeBtn.addEventListener('click', () => {
      if (controls) {
        controls.state.set('brake', true);
        setTimeout(() => {
          controls.state.set('brake', false);
        }, 200);
      }
    });
  }


  // 화살표 버튼들
  const arrowButtons = {
    forward: document.getElementById('forward-btn'),
    backward: document.getElementById('backward-btn'),
    left: document.getElementById('left-btn'),
    right: document.getElementById('right-btn')
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

// DOM 요소들 (페이지 로드 후 초기화)
let gameOverlay, overlayTitle, overlayMessage, startGameBtn;

function startGame() {
  game = new Game();
  runtimeError = null;
  gameStarted = true;
  gameFailed = false;
  running = true;

  // 오버레이 숨기기
  gameOverlay.classList.add('hidden');

  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function showGameOver(title, message, isRestart = false) {
  running = false;
  gameStarted = false;

  // 오버레이 표시
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
      showGameOver('주차 실패!', '충돌이 발생했습니다. 다시 시도해보세요.', true);
    }, 1000); // 1초 후에 실패 메시지 표시
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

  // 키보드 이벤트
  window.addEventListener('keydown', (e) => {
    const action = keyMap[e.code];
    if (action) {
      if (action === 'reset') {
        if (game) game.reset();
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

  // 터치 이벤트 (자동차 정지 버튼 클릭 감지 포함)
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();

    // 자동차 정지 버튼 클릭 감지
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;
    if (this.checkCarBrakeButtonClick(touchX, touchY)) {
      this.state.set('brake', true);
      setTimeout(() => {
        this.state.set('brake', false);
      }, 200);
      return; // 정지 버튼 클릭이면 다른 터치 처리하지 않음
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

    // 터치 움직임을 조향 및 가속으로 변환
    this.updateTouchControls();
  });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    this.touchState.touching = false;
    // 터치가 끝나면 모든 터치 기반 입력을 리셋
    this.state.set('forward', false);
    this.state.set('backward', false);
    this.state.set('left', false);
    this.state.set('right', false);
  });

  // 마우스 클릭 이벤트 (자동차 정지 버튼 클릭 감지)
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

  // 터치 기반 조향 및 가속 계산
  this.updateTouchControls = function() {
    if (!this.touchState.touching) return;

    const deltaX = this.touchState.currentX - this.touchState.startX;
    const deltaY = this.touchState.currentY - this.touchState.startY;

    // 세로 방향 움직임으로 전진/후진 결정 (임계값: 30픽셀)
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

    // 가로 방향 움직임으로 좌우 조향 결정 (임계값: 20픽셀)
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

  // 자동차 정지 버튼 클릭 감지 함수
  this.checkCarBrakeButtonClick = function(clickX, clickY) {
    if (!game || !game.car) return false;

    const car = game.car;
    const carScreenX = car.position.x;
    const carScreenY = car.position.y;

    // 자동차 중심에서 8픽셀 반경 내 클릭인지 확인
    const distance = Math.sqrt(
      Math.pow(clickX - carScreenX, 2) +
      Math.pow(clickY - carScreenY, 2)
    );

    return distance <= 18; // 클릭 영역을 확대된 버튼에 맞춰 조정 (18픽셀 반경)
  };
}

function Game() {
  this.elapsed = 0;
  this.cameraMode = 'top'; // 수직뷰 고정
  this.target = { x: 750, y: 200, width: 130, height: 200 }; // 가로폭을 150에서 130으로 축소
  this.leftTarget = { x: 70, y: 250, width: 200, height: 100 };
  // 가운데 주차박스들 정의 (나중에 사용)
  this.centerTargets = [];
  // 주차 완료 상태 추적
  this.parkingCompleted = {
    area1: false, // T자 주차
    area2: false, // 첫 번째 가운데 주차
    area3: false, // 두 번째 가운데 주차
    area4: false  // 평행주차
  };
  this.obstacles = buildObstacles();
  this.reset();
}

Game.prototype.reset = function reset() {
  // T 주차 구역 옆에 차량 배치, 뒤쪽 끝이 가이드 라인 하단 근처에 오도록 위치 조정
  this.car = new Car({ x: 350, y: 420, heading: -Math.PI / 2 }); // 장애물과 안전거리 확보, 위쪽 방향
  this.elapsed = 0;
  this.grade = '진행중';
  this.finishCaptured = false;

  // 주차 완료 상태 초기화 (모든 번호를 빨간색으로 되돌림)
  this.parkingCompleted = {
    area1: false, // T자 주차
    area2: false, // 첫 번째 가운데 주차
    area3: false, // 두 번째 가운데 주차
    area4: false  // 평행주차
  };
};


Game.prototype.update = function update(dt) {
  this.elapsed += dt;
  const car = this.car;
  const snapshot = controls.state;
  const steerInput = (snapshot.get('left') ? -1 : 0) + (snapshot.get('right') ? 1 : 0);
  const accelInput = (snapshot.get('forward') ? 1 : 0) + (snapshot.get('backward') ? -1 : 0);

  const brake = snapshot.get('brake');
  car.update(dt, accelInput, steerInput, brake);
  this.handleBoundaries(car);
  this.evaluate();
};

Game.prototype.handleBoundaries = function handleBoundaries(car) {
  // 주행 구역 (중앙만)
  const lane = { x: 230, y: 60, width: 680, height: 420 };
  // 전체 허용 구역 (양쪽 주차구역 포함) - 인도와의 안전거리 확보
  const spawnLane = { x: 70, y: 60, width: 840, height: 420 };
  const footprint = car.getRect();

  // 충돌 상태 확인
  let hasCollision = false;
  let outOfBounds = false;

  // 경계 검사 (간단한 AABB 사용)
  if (!rectContainsRect(spawnLane, footprint)) {
    this.grade = '코스 이탈';
    outOfBounds = true;
    failGame(); // 코스 이탈 시에도 실패 처리
  }

  // 자동차의 실제 회전된 모서리 좌표 계산
  const carCorners = this.getCarCorners(car);

  // 주차구역 내 여부 확인 (AABB 사용)
  const inT주차구역 = rectContainsRect(expandRect(this.leftTarget, 10), footprint);
  const inParkingArea = rectContainsRect(expandRect(this.target, 10), footprint);
  let inCenterAreas = false;
  if (this.centerTargets && this.centerTargets.length > 0) {
    inCenterAreas = this.centerTargets.some(area =>
      rectContainsRect(expandRect(area, 10), footprint)
    );
  }
  const inAnyParkingZone = inT주차구역 || inParkingArea || inCenterAreas;

  // 장애물 충돌 검사 (정확한 회전된 사각형 vs 사각형 충돌)
  for (const ob of this.obstacles) {
    const obstacleCorners = [
      { x: ob.x, y: ob.y },
      { x: ob.x + ob.width, y: ob.y },
      { x: ob.x + ob.width, y: ob.y + ob.height },
      { x: ob.x, y: ob.y + ob.height }
    ];

    // 정확한 다각형 충돌 검사 (SAT - Separating Axes Theorem)
    if (this.polygonsOverlap(carCorners, obstacleCorners)) {
      // 인도(width가 15인 경우)와의 충돌인지 체크
      if (ob.width === 15) {
        // 주차구역 내에서는 인도 충돌 무시
        if (inAnyParkingZone) {
          console.log('주차구역 내 인도 충돌 무시');
          continue;
        }

        this.grade = '충돌';
        hasCollision = true;
        console.log('인도 충돌 (정확한 검사)');
        failGame(); // 실패 처리 호출
        break;
      } else {
        // 일반 장애물(차량)과의 충돌
        this.grade = '충돌';
        hasCollision = true;
        console.log('차량 충돌 (정확한 검사)');
        failGame(); // 실패 처리 호출
        break;
      }
    }
  }

  // 충돌이나 코스 이탈이 없으면 기존 충돌 상태를 해제
  if (!hasCollision && !outOfBounds) {
    if (this.grade === '충돌' || this.grade === '코스 이탈') {
      this.grade = '진행중';
    }
  }
};

Game.prototype.evaluate = function evaluate() {
  const car = this.car;
  const footprint = car.getRect();
  const target = this.target;
  const leftTarget = this.leftTarget;
  const speedMps = car.speed / PIXELS_PER_METER;

  // 모든 주차구역 체크
  const inRightSlot = rectContainsRect(expandRect(target, -10), footprint);
  const inLeftSlot = rectContainsRect(expandRect(leftTarget, -10), footprint);

  // 가운데 주차구역들도 체크 (centerTargets가 존재할 때만)
  let inFirstCenter = false;
  let inSecondCenter = false;
  if (this.centerTargets.length > 0) {
    inFirstCenter = rectContainsRect(expandRect(this.centerTargets[0], -10), footprint);
    inSecondCenter = rectContainsRect(expandRect(this.centerTargets[1], -10), footprint);
  }

  const inAnySlot = inRightSlot || inLeftSlot || inFirstCenter || inSecondCenter;

  // 정렬 체크
  const parallelAligned = Math.abs(normalizeAngle(car.heading + Math.PI / 2)) < degToRad(6); // 세로 정렬
  const tParkAligned = Math.abs(normalizeAngle(car.heading)) < degToRad(6); // 가로 정렬

  // 각 구역별 정렬 조건
  const rightAligned = inRightSlot && parallelAligned; // 평행주차는 세로 정렬
  const leftAligned = inLeftSlot && tParkAligned; // T자 주차는 가로 정렬
  const centerAligned = (inFirstCenter || inSecondCenter) && tParkAligned; // 가운데 주차들도 가로 정렬

  const properlyAligned = rightAligned || leftAligned || centerAligned;

  if (this.grade !== '충돌' && this.grade !== '코스 이탈') {
    // 주차 성공 조건: 구역 안에 있고, 올바르게 정렬되어 있고, 속도가 충분히 낮음
    if (inAnySlot && properlyAligned && Math.abs(speedMps) < 0.14) {
      if (this.grade !== '주차 성공') {
        this.grade = '주차 성공';
        this.finishCaptured = true;

        // 어느 구역에 주차했는지 콘솔 로그로 확인 (디버깅용)
        if (inLeftSlot) console.log('T자 주차 성공!');
        if (inFirstCenter) console.log('2번 주차 성공!');
        if (inSecondCenter) console.log('3번 주차 성공!');
        if (inRightSlot) console.log('평행주차 성공!');
      }
    } else if (Math.abs(speedMps) > 4.2) {
      this.grade = '과속';
      this.finishCaptured = false;
    } else if (!inAnySlot && (this.grade === '주차 성공' || this.finishCaptured)) {
      this.grade = '진행중';
      this.finishCaptured = false;
    } else if (!inAnySlot && this.grade !== '과속') {
      this.grade = '진행중';
    }
  }

  // HUD 정보는 drawOverlays 함수에서 캔버스에 직접 렌더링됨
};

Game.prototype.render = function render() {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  this.drawBackground();
  const car = this.car;
  const footprint = car.getRect();
  const inRightSlot = rectContainsRect(expandRect(this.target, -10), footprint);
  const inLeftSlot = rectContainsRect(expandRect(this.leftTarget, -10), footprint);

  // 2번과 3번 주차 구역 체크 (centerTargets가 존재할 때만)
  let inFirstCenter = false;
  let inSecondCenter = false;
  if (this.centerTargets.length > 0) {
    inFirstCenter = rectContainsRect(expandRect(this.centerTargets[0], -10), footprint);
    inSecondCenter = rectContainsRect(expandRect(this.centerTargets[1], -10), footprint);
  }

  drawTarget(this.target, this.cameraMode, this.grade === '주차 성공' && inRightSlot);
  drawTarget(this.leftTarget, this.cameraMode, this.grade === '주차 성공' && inLeftSlot);

  // 2번과 3번 주차 구역도 drawTarget으로 그리기 (색상 변경 효과 적용)
  if (this.centerTargets.length > 0) {
    drawTarget(this.centerTargets[0], this.cameraMode, this.grade === '주차 성공' && inFirstCenter);
    drawTarget(this.centerTargets[1], this.cameraMode, this.grade === '주차 성공' && inSecondCenter);
  }
  drawObstacles(this.obstacles, this.cameraMode);
  this.car.draw(ctx, this.cameraMode);

  // 디버깅: 충돌 박스 시각화
  this.drawCollisionBoxes();

  ctx.restore();
  drawOverlays(this.grade, this.cameraMode, this.elapsed, this.car.speed, this.car.steerAngle, this.parkingCompleted);
};

Game.prototype.drawBackground = function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, '#2c323a');
  grad.addColorStop(1, '#191f28');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 왼쪽과 오른쪽 주차구역 사이에 3개의 균등한 세로 가이드 라인
  const leftEnd = this.leftTarget.x + this.leftTarget.width;
  const rightStart = this.target.x;
  const spacing = (rightStart - leftEnd) / 4; // 4구간으로 나누어 3개 라인

  ctx.save();
  ctx.strokeStyle = '#f4f6fb';
  ctx.lineWidth = 2;
  ctx.setLineDash([22, 18]);

  // 3개의 가이드 라인 그리기
  for (let i = 1; i <= 3; i++) {
    const guideX = leftEnd + spacing * i;
    ctx.beginPath();
    ctx.moveTo(guideX, 60);
    ctx.lineTo(guideX, 480);
    ctx.stroke();
  }

  ctx.restore();

  // 가운데 주차박스들의 좌표 계산 (drawTarget으로 그리기 위해 좌표만 계산)
  const firstGuideX = leftEnd + spacing * 1;
  const secondGuideX = leftEnd + spacing * 2;
  const firstBoxWidth = secondGuideX - firstGuideX - 20; // 양쪽에 10픽셀 여백
  const firstBoxX = firstGuideX + 10;
  const boxY = 300; // 자동차가 들어갈 수 있는 적절한 위치
  const boxHeight = 160; // 자동차 길이(116) + 여유공간

  // 두 번째 주차박스 (두 번째와 세 번째 가이드 라인 사이)
  const thirdGuideX = leftEnd + spacing * 3;
  const secondBoxWidth = thirdGuideX - secondGuideX - 20; // 양쪽에 10픽셀 여백
  const secondBoxX = secondGuideX + 10;

  // 가운데 주차박스들을 centerTargets에 저장 (주차 완료 체크용)
  if (this.centerTargets.length === 0) {
    this.centerTargets = [
      { x: firstBoxX, y: boxY, width: firstBoxWidth, height: boxHeight },
      { x: secondBoxX, y: boxY, width: secondBoxWidth, height: boxHeight }
    ];
  }

  // 주차 완료 상태 체크
  const car = this.car;
  const footprint = car.getRect();

  // 각 주차구역 체크
  const inLeftSlot = rectContainsRect(expandRect(this.leftTarget, -10), footprint);
  const inFirstCenter = rectContainsRect(expandRect(this.centerTargets[0], -10), footprint);
  const inSecondCenter = rectContainsRect(expandRect(this.centerTargets[1], -10), footprint);
  const inRightSlot = rectContainsRect(expandRect(this.target, -10), footprint);

  // 주차 완료 조건: 구역 안에 있고, 속도가 충분히 낮음
  const speedMps = Math.abs(car.speed / PIXELS_PER_METER);
  const isParked = speedMps < 0.14;

  if (inLeftSlot && isParked) this.parkingCompleted.area1 = true;
  if (inFirstCenter && isParked) this.parkingCompleted.area2 = true;
  if (inSecondCenter && isParked) this.parkingCompleted.area3 = true;
  if (inRightSlot && isParked) this.parkingCompleted.area4 = true;

  // 주차구역 번호 표시
  ctx.save();
  ctx.font = 'bold 24px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 1번: T자 주차 (왼쪽)
  const leftTargetCenterX = this.leftTarget.x + this.leftTarget.width / 2;
  const leftTargetCenterY = this.leftTarget.y + this.leftTarget.height / 2;
  ctx.fillStyle = this.parkingCompleted.area1 ? '#4ade80' : '#f87171';
  ctx.fillText('1', leftTargetCenterX, leftTargetCenterY);

  // 2번: 첫 번째 가운데 주차박스
  const firstBoxCenterX = firstBoxX + firstBoxWidth / 2;
  const firstBoxCenterY = boxY + boxHeight / 2;
  ctx.fillStyle = this.parkingCompleted.area2 ? '#4ade80' : '#f87171';
  ctx.fillText('2', firstBoxCenterX, firstBoxCenterY);

  // 3번: 두 번째 가운데 주차박스
  const secondBoxCenterX = secondBoxX + secondBoxWidth / 2;
  const secondBoxCenterY = boxY + boxHeight / 2;
  ctx.fillStyle = this.parkingCompleted.area3 ? '#4ade80' : '#f87171';
  ctx.fillText('3', secondBoxCenterX, secondBoxCenterY);

  // 4번: 평행주차 (오른쪽)
  const rightTargetCenterX = this.target.x + this.target.width / 2;
  const rightTargetCenterY = this.target.y + this.target.height / 2;
  ctx.fillStyle = this.parkingCompleted.area4 ? '#4ade80' : '#f87171';
  ctx.fillText('4', rightTargetCenterX, rightTargetCenterY);

  ctx.restore();

  ctx.fillStyle = '#171d24';
  ctx.fillRect(0, 0, canvas.width, 80);
  ctx.fillRect(0, canvas.height - 80, canvas.width, 80);
};

Game.prototype.drawCollisionBoxes = function drawCollisionBoxes() {
  const car = this.car;
  const footprint = car.getRect();

  ctx.save();

  // 자동차의 실제 회전된 모습을 정확히 표시 (draw 함수와 동일한 회전)
  const carCorners = this.getCarCorners(car);

  // 자동차의 실제 회전된 형태 그리기 (빨간색 실선)
  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(carCorners[0].x, carCorners[0].y);
  for (let i = 1; i < carCorners.length; i++) {
    ctx.lineTo(carCorners[i].x, carCorners[i].y);
  }
  ctx.closePath();
  ctx.stroke();

  // getRect()로 계산된 경계 박스도 표시 (빨간색 점선)
  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(footprint.x, footprint.y, footprint.width, footprint.height);

  // 자동차 중심점 표시
  ctx.fillStyle = '#ff0000';
  ctx.beginPath();
  ctx.arc(car.position.x, car.position.y, 4, 0, Math.PI * 2);
  ctx.fill();

  // 자동차 방향 표시 (앞쪽을 가리키는 화살표)
  const arrowLength = 30;
  const arrowEndX = car.position.x + Math.cos(car.heading) * arrowLength;
  const arrowEndY = car.position.y + Math.sin(car.heading) * arrowLength;
  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(car.position.x, car.position.y);
  ctx.lineTo(arrowEndX, arrowEndY);
  ctx.stroke();

  // 화살표 머리 그리기
  const arrowHeadLength = 10;
  const arrowAngle = Math.PI / 6;
  ctx.beginPath();
  ctx.moveTo(arrowEndX, arrowEndY);
  ctx.lineTo(
    arrowEndX - arrowHeadLength * Math.cos(car.heading - arrowAngle),
    arrowEndY - arrowHeadLength * Math.sin(car.heading - arrowAngle)
  );
  ctx.moveTo(arrowEndX, arrowEndY);
  ctx.lineTo(
    arrowEndX - arrowHeadLength * Math.cos(car.heading + arrowAngle),
    arrowEndY - arrowHeadLength * Math.sin(car.heading + arrowAngle)
  );
  ctx.stroke();

  // 모든 장애물(인도 포함) 충돌 박스 그리기
  for (const ob of this.obstacles) {
    if (ob.width === 15) {
      // 인도는 파란색으로 표시
      ctx.strokeStyle = '#0066ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
    } else {
      // 일반 장애물(차량)은 노란색으로 표시
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 2]);
    }
    ctx.strokeRect(ob.x, ob.y, ob.width, ob.height);

    // 충돌 감지 확인
    if (rectsOverlap(ob, footprint)) {
      // 충돌이 감지된 장애물은 보라색으로 하이라이트
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 4;
      ctx.setLineDash([]);
      ctx.strokeRect(ob.x, ob.y, ob.width, ob.height);

      // 겹치는 영역 계산 및 표시
      const overlapX = Math.min(footprint.x + footprint.width, ob.x + ob.width) - Math.max(footprint.x, ob.x);
      const overlapY = Math.min(footprint.y + footprint.height, ob.y + ob.height) - Math.max(footprint.y, ob.y);

      // 겹치는 영역을 반투명 빨간색으로 채우기
      if (overlapX > 0 && overlapY > 0) {
        const overlapRect = {
          x: Math.max(footprint.x, ob.x),
          y: Math.max(footprint.y, ob.y),
          width: overlapX,
          height: overlapY
        };
        ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        ctx.fillRect(overlapRect.x, overlapRect.y, overlapRect.width, overlapRect.height);
      }
    }
  }

  // 주차구역 확장 경계 표시 (주차구역 내에서는 인도 충돌 무시되는 영역)
  const parkingZones = [
    expandRect(this.leftTarget, 10), // T자 주차구역 + 10픽셀
    expandRect(this.target, 10)      // 평행주차구역 + 10픽셀
  ];

  if (this.centerTargets && this.centerTargets.length > 0) {
    parkingZones.push(expandRect(this.centerTargets[0], 10)); // 2번 주차구역
    parkingZones.push(expandRect(this.centerTargets[1], 10)); // 3번 주차구역
  }

  for (const zone of parkingZones) {
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 1;
    ctx.setLineDash([10, 5]);
    ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);
  }

  ctx.restore();
};

// 자동차의 실제 회전된 모서리 좌표 계산 (draw 함수와 동일한 회전 적용)
Game.prototype.getCarCorners = function getCarCorners(car) {
  const halfL = car.length / 2;
  const halfW = car.width / 2;
  // draw 함수와 동일하게 Math.PI / 2를 추가
  const drawHeading = car.heading + Math.PI / 2;
  const sin = Math.sin(drawHeading);
  const cos = Math.cos(drawHeading);

  return [
    { x: -halfW, y: -halfL },
    { x: halfW, y: -halfL },
    { x: halfW, y: halfL },
    { x: -halfW, y: halfL },
  ].map((corner) => ({
    x: car.position.x + corner.x * cos - corner.y * sin,
    y: car.position.y + corner.x * sin + corner.y * cos,
  }));
};

// 두 다각형이 겹치는지 확인 (SAT - Separating Axes Theorem 사용)
Game.prototype.polygonsOverlap = function polygonsOverlap(poly1, poly2) {
  // 두 다각형의 모든 축에 대해 검사
  const axes = [];

  // poly1의 모든 변에 수직인 축들 추가
  for (let i = 0; i < poly1.length; i++) {
    const p1 = poly1[i];
    const p2 = poly1[(i + 1) % poly1.length];
    const edge = { x: p2.x - p1.x, y: p2.y - p1.y };
    // 수직 벡터 (법선)
    axes.push({ x: -edge.y, y: edge.x });
  }

  // poly2의 모든 변에 수직인 축들 추가
  for (let i = 0; i < poly2.length; i++) {
    const p1 = poly2[i];
    const p2 = poly2[(i + 1) % poly2.length];
    const edge = { x: p2.x - p1.x, y: p2.y - p1.y };
    // 수직 벡터 (법선)
    axes.push({ x: -edge.y, y: edge.x });
  }

  // 각 축에 대해 분리 축이 있는지 확인
  for (const axis of axes) {
    // 축을 정규화
    const length = Math.sqrt(axis.x * axis.x + axis.y * axis.y);
    if (length === 0) continue;
    const normalizedAxis = { x: axis.x / length, y: axis.y / length };

    // 각 다각형을 축에 투영
    const proj1 = this.projectPolygon(poly1, normalizedAxis);
    const proj2 = this.projectPolygon(poly2, normalizedAxis);

    // 투영된 구간이 겹치지 않으면 분리됨
    if (proj1.max < proj2.min || proj2.max < proj1.min) {
      return false; // 분리 축 발견
    }
  }

  return true; // 모든 축에서 겹침 = 충돌
};

// 다각형을 축에 투영
Game.prototype.projectPolygon = function projectPolygon(polygon, axis) {
  let min = Infinity;
  let max = -Infinity;

  for (const vertex of polygon) {
    const dot = vertex.x * axis.x + vertex.y * axis.y;
    min = Math.min(min, dot);
    max = Math.max(max, dot);
  }

  return { min, max };
};

function Car({ x, y, heading }) {
  this.position = { x, y };
  this.heading = heading;
  this.velocity = 0;
  this.speed = 0;
  this.length = 116;
  this.width = 54;
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

Car.prototype.draw = function draw(context, cameraMode) {
  context.save();
  const pos = projectPoint(this.position.x, this.position.y, cameraMode);
  context.translate(pos.x, pos.y);
  context.rotate(this.heading + Math.PI / 2);
  const scaleY = cameraMode === 'tilt' ? 0.85 : 1;
  context.scale(1, scaleY);
  context.fillStyle = '#e9edf5';
  context.strokeStyle = '#1c2028';
  context.lineWidth = 2;
  context.beginPath();
  drawRoundedRectPath(context, -this.width / 2, -this.length / 2, this.width, this.length, 10);
  context.fill();
  context.stroke();

  context.fillStyle = '#12151c';
  context.fillRect(-this.width / 2 + 4, -this.length / 2 + 8, this.width - 8, 18);
  context.fillRect(-this.width / 2 + 4, this.length / 2 - 26, this.width - 8, 18);

  // 자동차 중앙의 정지 버튼 (노란색 원 대신)
  context.fillStyle = '#dc2626'; // 빨간색 배경
  context.strokeStyle = '#ffffff'; // 흰색 테두리
  context.lineWidth = 2;
  context.beginPath();
  context.arc(0, 0, 12, 0, Math.PI * 2); // 반지름을 8에서 12로 확대
  context.fill();
  context.stroke();

  // 정지 사각형 기호 (■)
  context.fillStyle = '#ffffff';
  context.fillRect(-5, -5, 10, 10); // 사각형도 크게 조정 (8x8 → 10x10)

  context.restore();
};

Car.prototype.getRect = function getRect() {
  const halfL = this.length / 2;
  const halfW = this.width / 2;
  // draw 함수와 동일한 회전 적용
  const drawHeading = this.heading + Math.PI / 2;
  const sin = Math.sin(drawHeading);
  const cos = Math.cos(drawHeading);
  const corners = [
    { x: -halfW, y: -halfL },
    { x: halfW, y: -halfL },
    { x: halfW, y: halfL },
    { x: -halfW, y: halfL },
  ].map((corner) => rotateAndTranslate(corner, sin, cos, this.position));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
};

function drawTarget(target, cameraMode, highlight) {
  ctx.save();
  const { x, y, width, height } = target;
  ctx.strokeStyle = highlight ? '#4ade80' : '#facc15';
  ctx.lineWidth = 6;
  ctx.setLineDash([20, 14]);
  const p = projectPoint(x, y, cameraMode);
  const scaleY = cameraMode === 'tilt' ? 0.88 : 1;
  ctx.strokeRect(p.x, p.y, width, height * scaleY);
  ctx.restore();
}


function drawObstacles(obstacles, cameraMode) {
  ctx.save();
  const scaleY = cameraMode === 'tilt' ? 0.9 : 1;
  for (const ob of obstacles) {
    const p = projectPoint(ob.x, ob.y, cameraMode);
    ctx.fillStyle = ob.color;
    ctx.fillRect(p.x, p.y, ob.width, ob.height * scaleY);
    ctx.strokeStyle = '#0f141d';
    ctx.lineWidth = 3;
    ctx.strokeRect(p.x, p.y, ob.width, ob.height * scaleY);
  }
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

function drawOverlays(grade, cameraMode, elapsed, speed, steerAngle, parkingCompleted) {
  ctx.save();

  // HUD 텍스트 구성
  const speedKmh = Math.abs(speed / PIXELS_PER_METER * 3.6);
  const steerDegrees = (steerAngle * 180 / Math.PI);
  const direction = speed >= 0 ? '전진' : '후진';
  let steerDirection = '직진';
  if (Math.abs(steerAngle) > 0.05) {
    steerDirection = steerAngle > 0 ? '우회전' : '좌회전';
  }

  // 주차 완료 상태 표시
  const completedCount = Object.values(parkingCompleted).filter(Boolean).length;
  const totalCount = 4;
  const parkingStatus = `주차: ${completedCount}/${totalCount}`;

  const hudText = `상태: ${grade} | 시간: ${elapsed.toFixed(1)}s | 속도: ${speedKmh.toFixed(1)} km/h | 조향: ${steerDegrees.toFixed(0)}° | ${direction} | ${steerDirection}`;

  // 텍스트 너비 측정
  ctx.font = '16px Segoe UI, sans-serif';
  const hudTextWidth = ctx.measureText(hudText).width;
  const statusWidth = ctx.measureText(parkingStatus).width;
  const totalWidth = hudTextWidth + statusWidth + 20; // 20px 간격

  // HUD 배경 - 화면 중앙에 배치
  const hudWidth = totalWidth + 40;
  const hudHeight = 35;
  const x = (canvas.width - hudWidth) / 2;
  const y = 20;

  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x, y, hudWidth, hudHeight);

  // 테두리
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, hudWidth, hudHeight);

  // 텍스트 위치 (중앙 정렬)
  const textX = x + 20;
  const textY = y + 23;

  // 상태 부분만 색상 변경하여 표시
  ctx.fillStyle = grade === '주차 성공' ? '#4ade80' : grade === '진행중' ? '#f8fafc' : '#f87171';
  ctx.fillText(`상태: ${grade}`, textX, textY);

  // 나머지 부분은 흰색으로 표시
  ctx.fillStyle = '#f8fafc';
  const gradeWidth = ctx.measureText(`상태: ${grade}`).width;
  const remainingText = ` | 시간: ${elapsed.toFixed(1)}s | 속도: ${speedKmh.toFixed(1)} km/h | 조향: ${steerDegrees.toFixed(0)}° | ${direction} | ${steerDirection}`;
  ctx.fillText(remainingText, textX + gradeWidth, textY);

  // 주차 완료 상태를 오른쪽 끝에 표시
  const parkingColor = completedCount === totalCount ? '#4ade80' : completedCount > 0 ? '#facc15' : '#f87171';
  ctx.fillStyle = parkingColor;
  const parkingX = x + hudWidth - statusWidth - 20;
  ctx.fillText(parkingStatus, parkingX, textY);

  ctx.restore();
}

function dashedRect(x, y, w, h, dash) {
  ctx.save();
  ctx.setLineDash(dash);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function rotateAndTranslate(point, sin, cos, origin) {
  return {
    x: origin.x + point.x * cos - point.y * sin,
    y: origin.y + point.x * sin + point.y * cos,
  };
}

function rectContainsRect(outer, inner) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function rectsOverlap(a, b) {
  return !(
    a.x + a.width < b.x ||
    a.x > b.x + b.width ||
    a.y + a.height < b.y ||
    a.y > b.y + b.height
  );
}

function expandRect(rect, margin) {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad) {
  return (rad * 180) / Math.PI;
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

function projectPoint(x, y, cameraMode) {
  if (cameraMode === 'top') {
    return { x, y };
  }
  const tilt = 0.18;
  const offsetY = (y - canvas.height / 2) * tilt;
  return { x: x + offsetY, y: y * 0.92 };
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


function buildObstacles() {
  return [
    // 맨 왼쪽 경계 (인도/벽) - 주차공간과 더 가깝게
    { x: 50, y: 60, width: 15, height: 420, color: '#34404d' },
    // 왼쪽 주차구역 좌측 차량 (T자 주차용) - T자 주차구역(y=250~350)과 정교하게 분리
    { x: 70, y: 180, width: 200, height: 60, color: '#2b3844' },
    // 왼쪽 주차구역 우측 차량 (T자 주차용) - T자 주차구역과 정교하게 분리
    { x: 70, y: 360, width: 200, height: 60, color: '#2b3844' },
    // 오른쪽 주차구역 앞 차량 (주차구역과 맞춤)
    { x: 750, y: 120, width: 130, height: 70, color: '#2b3844' },
    // 오른쪽 주차구역 뒤 차량 (주차구역과 맞춤)
    { x: 750, y: 410, width: 130, height: 70, color: '#2b3844' },
    // 맨 오른쪽 경계 (인도/벽) - 주차공간과 더 가깝게
    { x: 915, y: 60, width: 15, height: 420, color: '#34404d' },
  ];
}

// 페이지 로드 완료 후 게임 초기화
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM 로드 완료');
  initializeGame();
});

// 혹시 DOMContentLoaded가 이미 지났을 경우를 대비
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeGame);
} else {
  // DOM이 이미 로드됨
  initializeGame();
}
