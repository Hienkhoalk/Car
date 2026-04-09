"use strict";

/* =========================
   1. GLOBAL STATE
========================= */
let currentMode = "MANUAL";
let packageCount = 0;
let activePickupTime = null;
let autoTimer = null;
let currentStep = 0;
let isAutoRunning = false;
let isRunEnabled = false;

const JOINTS_WITH_NAMES = [
    { id: 1, label: "Base", actionName: "Servo_Base" },
    { id: 2, label: "Shoulder", actionName: "Servo_Shoulder" },
    { id: 3, label: "Elbow", actionName: "Servo_Elbow" },
    { id: 4, label: "Wrist Pitch", actionName: "Servo_Wrist_Pitch" },
    { id: 5, label: "Wrist Roll", actionName: "Servo_Wrist_Roll" },
    { id: 6, label: "Gripper", actionName: "Servo_Gripper" },
];

const MOVE_CODES = {
    S: 0,
    F: 1,
    B: 2,
    L: 3,
    R: 4,
};

function getTerminal() {
    return document.getElementById("terminalBox");
}

/* =========================
   2. E-RA WIDGET
========================= */
const eraWidget = new EraWidget();

const eraActions = {
    // fixed movement
    moveStop: null,
    moveForward: null,
    moveBackward: null,
    moveLeft: null,
    moveRight: null,

    // run state
    runEnable: null,
    runDisable: null,

    // emergency
    emergencyOn: null,
    emergencyOff: null,

    // dynamic servo
    servoBase: null,
    servoShoulder: null,
    servoElbow: null,
    servoWristPitch: null,
    servoWristRoll: null,
    servoGripper: null,

    // optional quick gripper actions
    gripperClose: null,
    gripperOpen: null,
};

const eraRealtimeConfigs = {
    missionStep: null,
    emergencyState: null,
    totalCount: null,
};

/* =========================
   3. BOOTSTRAP
========================= */
document.addEventListener("DOMContentLoaded", () => {
    initDashboard();
    bindUIEvents();
    initEraWidget();
});

/* =========================
   4. INIT UI
========================= */
function initDashboard() {
    renderArmControls();
    startClock();
    setMode("MANUAL");
    printLog("Dashboard đã khởi tạo.", "info");
}

function renderArmControls() {
    const armHeader = document.querySelector(".arm-panel-header");
    if (armHeader && !document.getElementById("btnResetArm")) {
        const btn = document.createElement("button");
        btn.id = "btnResetArm";
        btn.className = "btn-reset-arm";
        btn.textContent = "Reset về 90°";
        armHeader.appendChild(btn);
    }

    const armGrid = document.getElementById("armControlsGrid");
    if (!armGrid || armGrid.children.length > 0) return;

    JOINTS_WITH_NAMES.forEach((joint) => {
        const wrapper = document.createElement("div");
        wrapper.className = "joint-widget";
        wrapper.innerHTML = `
            <div class="joint-header">
                <span>J${joint.id}: ${joint.label}</span>
                <div class="input-container">
                    <input
                        type="number"
                        id="num${joint.id}"
                        class="joint-input"
                        value="90"
                        min="0"
                        max="180"
                    >
                    <div class="input-tooltip">Nhập từ 0° - 180°</div>
                </div>
            </div>
            <input
                type="range"
                id="range${joint.id}"
                min="0"
                max="180"
                value="90"
            >
        `;
        armGrid.appendChild(wrapper);
    });

    JOINTS_WITH_NAMES.forEach((joint) => {
        const numInput = document.getElementById(`num${joint.id}`);
        const rangeInput = document.getElementById(`range${joint.id}`);

        if (numInput) {
            numInput.addEventListener("change", () => syncFromNum(joint.id));
            numInput.addEventListener("blur", () => syncFromNum(joint.id));
        }

        if (rangeInput) {
            rangeInput.addEventListener("input", () => syncFromRange(joint.id));
            rangeInput.addEventListener("change", () => sendArmCommand(joint.id, rangeInput.value));
        }
    });
}

function startClock() {
    const update = () => {
        const timeEl = document.getElementById("sysTime");
        if (timeEl) {
            timeEl.innerText = new Date().toLocaleTimeString("vi-VN", {
                hour12: false,
            });
        }
    };
    update();
    setInterval(update, 1000);
}

/* =========================
   5. UI EVENTS
========================= */
function bindUIEvents() {
    const btnManual = document.getElementById("btnManual");
    const btnAuto = document.getElementById("btnAuto");
    const btnEmergency = document.getElementById("btnEmergency");
    const btnDismissAlert = document.getElementById("btnDismissAlert");
    const btnStopControl = document.getElementById("btnStopControl");
    const btnPick = document.getElementById("btnPick");
    const btnDrop = document.getElementById("btnDrop");
    const btnExportWMS = document.getElementById("btnExportWMS");
    const btnTestLineLost = document.getElementById("btnTestLineLost");
    const btnResetArm = document.getElementById("btnResetArm");

    if (btnManual) btnManual.addEventListener("click", () => setMode("MANUAL"));
    if (btnAuto) btnAuto.addEventListener("click", () => setMode("AUTO"));
    if (btnEmergency) btnEmergency.addEventListener("click", handleEmergencyButton);
    if (btnDismissAlert) btnDismissAlert.addEventListener("click", dismissAlert);
    if (btnStopControl) btnStopControl.addEventListener("click", toggleCenterButton);
    if (btnPick) btnPick.addEventListener("click", manualPick);
    if (btnDrop) btnDrop.addEventListener("click", manualDrop);
    if (btnExportWMS) btnExportWMS.addEventListener("click", exportWMS);
    if (btnTestLineLost) btnTestLineLost.addEventListener("click", showAlert);
    if (btnResetArm) btnResetArm.addEventListener("click", resetArm);

    const dirButtons = document.querySelectorAll(".btn-dir[data-dir]");
    dirButtons.forEach((btn) => {
        const dir = btn.dataset.dir;

        btn.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            move(dir);
        });

        const stopMovement = (e) => {
            if (e) e.preventDefault();
            move("S");
        };

        btn.addEventListener("pointerup", stopMovement);
        btn.addEventListener("pointerleave", stopMovement);
        btn.addEventListener("pointercancel", stopMovement);
    });
}

/* =========================
   6. E-RA CONFIG
========================= */
function initEraWidget() {
    eraWidget.init({
        onConfiguration: (configuration) => {
            bindEraConfiguration(configuration);
            printLog("Đã nhận cấu hình từ E-Ra.", "success");
            console.log("[E-Ra configuration]", configuration);
            console.log("[Mapped actions]", eraActions);
            console.log("[Mapped realtime]", eraRealtimeConfigs);
        },
        onValues: (values) => {
            handleEraValues(values);
        },
    });
}

function bindEraConfiguration(configuration) {
    const actions = Array.isArray(configuration?.actions) ? configuration.actions : [];
    const realtimeConfigs = Array.isArray(configuration?.realtime_configs)
        ? configuration.realtime_configs
        : [];

    // fixed actions
    eraActions.moveStop = findActionByNames(actions, ["Move_Stop"]);
    eraActions.moveForward = findActionByNames(actions, ["Move_Forward"]);
    eraActions.moveBackward = findActionByNames(actions, ["Move_Backward"]);
    eraActions.moveLeft = findActionByNames(actions, ["Move_Left"]);
    eraActions.moveRight = findActionByNames(actions, ["Move_Right"]);

    eraActions.runEnable = findActionByNames(actions, ["Run_Enable"]);
    eraActions.runDisable = findActionByNames(actions, ["Run_Disable"]);

    eraActions.emergencyOn = findActionByNames(actions, ["Emergency_On"]);
    eraActions.emergencyOff = findActionByNames(actions, ["Emergency_Off"]);

    // dynamic servo actions
    eraActions.servoBase = findActionByNames(actions, ["Servo_Base"]);
    eraActions.servoShoulder = findActionByNames(actions, ["Servo_Shoulder"]);
    eraActions.servoElbow = findActionByNames(actions, ["Servo_Elbow"]);
    eraActions.servoWristPitch = findActionByNames(actions, ["Servo_Wrist_Pitch"]);
    eraActions.servoWristRoll = findActionByNames(actions, ["Servo_Wrist_Roll"]);
    eraActions.servoGripper = findActionByNames(actions, ["Servo_Gripper"]);

    // optional quick gripper actions
    eraActions.gripperClose = findActionByNames(actions, ["Gripper_Close", "Pick", "Manual_Pick"]);
    eraActions.gripperOpen = findActionByNames(actions, ["Gripper_Open", "Drop", "Manual_Drop"]);

    // realtime
    eraRealtimeConfigs.missionStep = findRealtimeConfigLoose(realtimeConfigs, [
        "mission_step",
        "step",
        "agv_step",
        "auto_step",
    ]);
    eraRealtimeConfigs.emergencyState = findRealtimeConfigLoose(realtimeConfigs, [
        "emergency_state",
        "emergencystate",
        "emg",
        "locked",
    ]);
    eraRealtimeConfigs.totalCount = findRealtimeConfigLoose(realtimeConfigs, [
        "total_count",
        "package_count",
    ]);
}

function findActionByNames(actions, exactNames) {
    return actions.find((item) => exactNames.includes(item?.name)) || null;
}

function findRealtimeConfigLoose(configs, keywordList) {
    return (
        configs.find((item) => {
            const hay = `${item?.name || ""} ${item?.label || ""} ${item?.id || ""}`.toLowerCase();
            return keywordList.some((key) => hay.includes(String(key).toLowerCase()));
        }) || null
    );
}

function handleEraValues(values) {
    // Mission step
    if (
        eraRealtimeConfigs.missionStep &&
        values[eraRealtimeConfigs.missionStep.id] &&
        values[eraRealtimeConfigs.missionStep.id].value !== undefined
    ) {
        const step = parseInt(values[eraRealtimeConfigs.missionStep.id].value, 10);
        if (!Number.isNaN(step)) {
            if (step === 99) {
                showAlert();
                return;
            }
            currentStep = step;
            setMissionStep(step);
            handleWMSRecord(step);
        }
    }

    // Emergency state sync from V1
    if (
        eraRealtimeConfigs.emergencyState &&
        values[eraRealtimeConfigs.emergencyState.id] &&
        values[eraRealtimeConfigs.emergencyState.id].value !== undefined
    ) {
        const val = values[eraRealtimeConfigs.emergencyState.id].value;
        const isEmergency = String(val) === "1" || String(val).toLowerCase() === "true";

        if (isEmergency && currentMode !== "EMERGENCY") {
            triggerEmergency(false);
        }

        if (!isEmergency && currentMode === "EMERGENCY") {
            resetFromEmergency(false);
        }
    }

    // Total count
    if (
        eraRealtimeConfigs.totalCount &&
        values[eraRealtimeConfigs.totalCount.id] &&
        values[eraRealtimeConfigs.totalCount.id].value !== undefined
    ) {
        const count = parseInt(values[eraRealtimeConfigs.totalCount.id].value, 10);
        if (!Number.isNaN(count)) {
            packageCount = count;
            const totalCountEl = document.getElementById("totalCount");
            if (totalCountEl) {
                totalCountEl.innerText = String(packageCount).padStart(2, "0");
            }
        }
    }
}

/* =========================
   7. UTILITIES
========================= */
function printLog(message, type = "normal") {
    const box = getTerminal();
    if (!box) return;

    const time = new Date().toLocaleTimeString("vi-VN", { hour12: false });

    let style = "";
    if (type === "error") style = "color: var(--color-red);";
    if (type === "success") style = "color: #10b981;";
    if (type === "warn") style = "color: #f59e0b;";
    if (type === "info") style = "color: #3b82f6;";

    box.innerHTML += `
        <div class="log-line" style="${style}">
            <span class="time">[${time}]</span> ${message}
        </div>
    `;
    box.scrollTop = box.scrollHeight;
}

function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return m > 0 ? `${m}p ${s}s` : `${s} giây`;
}

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, Number(val)));
}

function triggerEraAction(actionObj, value = undefined) {
    if (!actionObj || !actionObj.action) {
        printLog("Thiếu action E-Ra tương ứng. Kiểm tra cấu hình widget.", "error");
        return false;
    }

    try {
        if (value === undefined) {
            eraWidget.triggerAction(actionObj.action, null);
        } else {
            eraWidget.triggerAction(actionObj.action, null, { value });
        }
        return true;
    } catch (err) {
        console.error(err);
        printLog("Gửi action lên E-Ra thất bại.", "error");
        return false;
    }
}

function triggerFixedMoveAction(direction) {
    const actionMap = {
        S: eraActions.moveStop,
        F: eraActions.moveForward,
        B: eraActions.moveBackward,
        L: eraActions.moveLeft,
        R: eraActions.moveRight,
    };

    const actionObj = actionMap[direction];
    if (!actionObj) {
        printLog(`Thiếu action di chuyển cho hướng ${direction}`, "error");
        return false;
    }

    return triggerEraAction(actionObj);
}

function getServoActionById(id) {
    switch (id) {
        case 1: return eraActions.servoBase;
        case 2: return eraActions.servoShoulder;
        case 3: return eraActions.servoElbow;
        case 4: return eraActions.servoWristPitch;
        case 5: return eraActions.servoWristRoll;
        case 6: return eraActions.servoGripper;
        default: return null;
    }
}

function setRunEnabled(enabled) {
    isRunEnabled = enabled;

    const stopBtn = document.getElementById("btnStopControl");
    if (!stopBtn) return;

    if (enabled) {
        stopBtn.innerHTML = "<span>STOP</span>";
        stopBtn.classList.remove("is-start", "is-auto-start");
        stopBtn.classList.add("is-stop");
    } else {
        stopBtn.innerHTML = "<span>START</span>";
        stopBtn.classList.remove("is-stop");
        stopBtn.classList.add("is-start");
    }
}

function sendRunEnable() {
    if (eraActions.runEnable) {
        return triggerEraAction(eraActions.runEnable);
    }
    return true;
}

function sendRunDisable() {
    let ok = true;

    if (eraActions.runDisable) {
        ok = triggerEraAction(eraActions.runDisable);
    }

    if (eraActions.moveStop) {
        triggerFixedMoveAction("S");
    }

    return ok;
}

function autoEnableRunIfNeeded() {
    if (isRunEnabled) return true;

    const ok = sendRunEnable();
    if (ok) {
        setRunEnabled(true);
        printLog("Auto START...", "info");
    }
    return ok;
}

/* =========================
   8. MODE MANAGEMENT
========================= */
function setMode(mode) {
    if (currentMode === "EMERGENCY" && mode !== "MANUAL") {
        printLog("HỆ THỐNG ĐANG KHÓA CỨNG! Hãy nhấn RESET SYSTEM trên nút màu đỏ.", "error");
        return;
    }

    currentMode = mode;

    const statusObj = document.getElementById("missionStatus");
    const modeDisplay = document.getElementById("modeDisplay");
    const btnManual = document.getElementById("btnManual");
    const btnAuto = document.getElementById("btnAuto");
    const stopBtn = document.getElementById("btnStopControl");

    if (statusObj) {
        statusObj.classList.remove("moving-status", "done-status", "ready-status");
    }

    if (stopBtn) {
        stopBtn.style.background = "";
        stopBtn.style.boxShadow = "";
        stopBtn.style.color = "";
        stopBtn.style.borderColor = "";
    }

    if (modeDisplay) modeDisplay.innerText = mode;

    if (mode === "MANUAL") {
        isAutoRunning = false;
        clearInterval(autoTimer);
        currentStep = 0;
        setRunEnabled(false);

        if (btnManual) btnManual.classList.add("active");
        if (btnAuto) btnAuto.classList.remove("active-auto");

        if (statusObj) statusObj.innerText = "Chế độ tay";

        setMissionStep(0);
        printLog("Đã chuyển sang MANUAL.", "info");
    }

    if (mode === "AUTO") {
        isAutoRunning = false;
        clearInterval(autoTimer);
        currentStep = 0;
        setRunEnabled(false);

        if (btnAuto) btnAuto.classList.add("active-auto");
        if (btnManual) btnManual.classList.remove("active");

        if (statusObj) {
            statusObj.innerText = "Sẵn sàng";
            statusObj.classList.add("ready-status");
        }

        setMissionStep(0);
        printLog("Đã chuyển sang AUTO (Sẵn sàng).", "info");
    }
}

/* =========================
   9. CENTER BUTTON
========================= */
function toggleCenterButton() {
    if (currentMode === "EMERGENCY") {
        printLog("HỆ THỐNG ĐANG KHÓA!", "error");
        return;
    }

    if (currentMode === "AUTO") {
        if (!isAutoRunning) {
            const ok = sendRunEnable();
            if (!ok) return;

            isAutoRunning = true;
            setRunEnabled(true);
            printLog("AUTO: Tiếp tục hành trình...", "success");
            startAutoLogic();
        } else {
            isAutoRunning = false;
            clearInterval(autoTimer);
            sendRunDisable();
            setRunEnabled(false);
            printLog("AUTO: Đã tạm dừng.", "warn");
        }
        return;
    }

    if (!isRunEnabled) {
        const ok = sendRunEnable();
        if (!ok) return;

        setRunEnabled(true);
        printLog("MANUAL: Hệ thống sẵn sàng điều khiển.", "success");
    } else {
        sendRunDisable();
        setRunEnabled(false);
        printLog("MANUAL: Đã dừng xe. (Ấn START để tiếp tục)", "warn");
    }
}

/* =========================
   10. EMERGENCY
========================= */
function handleEmergencyButton() {
    if (currentMode === "EMERGENCY") {
        if (eraActions.emergencyOff) {
            triggerEraAction(eraActions.emergencyOff);
        } else {
            resetFromEmergency(true);
        }
    } else {
        if (eraActions.emergencyOn) {
            triggerEraAction(eraActions.emergencyOn);
        } else {
            triggerEmergency(true);
        }
    }
}

function triggerEmergency(sendToEra = true) {
    currentMode = "EMERGENCY";
    isAutoRunning = false;
    clearInterval(autoTimer);
    isRunEnabled = false;

    const emerBtn = document.getElementById("btnEmergency");
    const stopBtn = document.getElementById("btnStopControl");
    const modeDisplay = document.getElementById("modeDisplay");

    if (eraActions.moveStop) {
        triggerFixedMoveAction("S");
    }

    if (emerBtn) {
        emerBtn.innerText = "RESET SYSTEM";
        emerBtn.classList.add("active-emergency");
    }

    if (stopBtn) {
        stopBtn.classList.remove("is-start", "is-auto-start");
        stopBtn.classList.add("is-stop");
        stopBtn.innerHTML = "<span>LOCKED</span>";
        stopBtn.style.background = "var(--color-red)";
        stopBtn.style.color = "#fff";
        stopBtn.style.borderColor = "#ef4444";
        stopBtn.style.boxShadow = "0 0 20px rgba(239, 68, 68, 0.5)";
    }

    if (modeDisplay) modeDisplay.innerText = "EMG-LOCKED";

    const actionBtns = document.querySelectorAll(".btn-action");
    actionBtns.forEach((btn) => {
        btn.style.opacity = "0.5";
        btn.style.pointerEvents = "none";
        btn.style.cursor = "not-allowed";
    });

    printLog("⚠️ EMERGENCY: Hệ thống đã khóa. Nhấn RESET để tiếp tục!", "error");

    if (sendToEra && eraActions.emergencyOn) {
        triggerEraAction(eraActions.emergencyOn);
    }
}

function resetFromEmergency(sendToEra = true) {
    printLog("Hệ thống: Đang giải phóng lệnh khóa...", "info");

    const emerBtn = document.getElementById("btnEmergency");
    const stopBtn = document.getElementById("btnStopControl");

    if (emerBtn) {
        emerBtn.innerText = "EMERGENCY";
        emerBtn.classList.remove("active-emergency");
    }

    if (stopBtn) {
        stopBtn.style.background = "";
        stopBtn.style.color = "";
        stopBtn.style.borderColor = "";
        stopBtn.style.boxShadow = "";
    }

    const actionBtns = document.querySelectorAll(".btn-action");
    actionBtns.forEach((btn) => {
        btn.style.opacity = "1";
        btn.style.pointerEvents = "auto";
        btn.style.cursor = "pointer";
    });

    if (sendToEra && eraActions.emergencyOff) {
        triggerEraAction(eraActions.emergencyOff);
    }

    setMode("MANUAL");
    printLog("Hệ thống: Đã mở khóa hoàn toàn.", "success");
}

/* =========================
   11. MOVEMENT
========================= */
function move(direction) {
    if (currentMode === "EMERGENCY") {
        if (direction !== "S") {
            printLog("HỆ THỐNG ĐANG KHÓA! Hãy nhấn RESET SYSTEM trên nút màu đỏ.", "error");
        }
        return;
    }

    if (!MOVE_CODES.hasOwnProperty(direction)) return;

    if (currentMode === "AUTO") {
        if (direction !== "S") {
            printLog("Lỗi: Đang AUTO!", "error");
        }
        return;
    }

    if (direction !== "S") {
        const ok = autoEnableRunIfNeeded();
        if (!ok) return;

        const moved = triggerFixedMoveAction(direction);
        if (moved) {
            printLog(`Motor Drive: ${direction} (Mã: ${MOVE_CODES[direction]})`, "info");
        }
        return;
    }

    triggerFixedMoveAction("S");
}

function startAutoLogic() {
    clearInterval(autoTimer);

    autoTimer = setInterval(() => {
        if (currentMode !== "AUTO" || !isAutoRunning) {
            clearInterval(autoTimer);
            return;
        }

        if (!isRunEnabled) {
            const ok = sendRunEnable();
            if (ok) setRunEnabled(true);
        }

        triggerFixedMoveAction("F");
    }, 2500);
}

/* =========================
   12. ARM CONTROL (DYNAMIC ACTION)
========================= */
function sendArmCommand(id, value) {
    if (currentMode === "EMERGENCY") {
        printLog("LỖI: Tay máy bị khóa cứng do EMERGENCY!", "error");
        return;
    }

    if (currentMode !== "MANUAL") {
        printLog("Lỗi: Tay máy bị khóa trong chế độ AUTO", "error");
        return;
    }

    const safeValue = clamp(value, 0, 180);
    const action = getServoActionById(id);
    const joint = JOINTS_WITH_NAMES.find((j) => j.id === id);
    const jointName = joint ? joint.label : `Joint ${id}`;

    const ok = triggerEraAction(action, safeValue);
    if (ok) {
        printLog(`Khớp ${jointName} (J${id}) -> ${safeValue}°`, "info");
    }
}

function syncFromNum(id) {
    const numInput = document.getElementById(`num${id}`);
    const rangeInput = document.getElementById(`range${id}`);
    if (!numInput || !rangeInput) return;

    const val = clamp(numInput.value, 0, 180);
    numInput.value = val;
    rangeInput.value = val;
    sendArmCommand(id, val);
}

function syncFromRange(id) {
    const numInput = document.getElementById(`num${id}`);
    const rangeInput = document.getElementById(`range${id}`);
    if (!numInput || !rangeInput) return;

    const val = clamp(rangeInput.value, 0, 180);
    numInput.value = val;
}

function resetArm() {
    if (currentMode !== "MANUAL") {
        printLog("Lỗi: Cần chuyển sang MANUAL để Reset tay máy", "error");
        return;
    }

    printLog("Hệ thống: Đang đưa tay máy về vị trí mặc định (90°)...", "info");

    JOINTS_WITH_NAMES.forEach((joint) => {
        const defaultVal = 90;
        const numInput = document.getElementById(`num${joint.id}`);
        const rangeInput = document.getElementById(`range${joint.id}`);

        if (numInput) numInput.value = defaultVal;
        if (rangeInput) rangeInput.value = defaultVal;

        const action = getServoActionById(joint.id);
        triggerEraAction(action, defaultVal);
    });

    setTimeout(() => {
        printLog("Hoàn tất: Tay máy đã về vị trí 90°.", "success");
    }, 3000);
}

/* =========================
   13. PICK / DROP
========================= */
function manualPick() {
    if (currentMode !== "MANUAL") {
        printLog("Lỗi: Hãy chuyển sang MANUAL để gắp!", "error");
        return;
    }

    const gripAngle = 160;
    const ok =
        triggerEraAction(eraActions.gripperClose) ||
        triggerEraAction(eraActions.servoGripper, gripAngle);

    if (ok) {
        const num6 = document.getElementById("num6");
        const range6 = document.getElementById("range6");
        if (num6) num6.value = gripAngle;
        if (range6) range6.value = gripAngle;
        printLog(`MANUAL: Lệnh GẮP HÀNG (${gripAngle}°)`, "success");
    }
}

function manualDrop() {
    if (currentMode !== "MANUAL") {
        printLog("Lỗi: Hãy chuyển sang MANUAL để thả!", "error");
        return;
    }

    const openAngle = 10;
    const ok =
        triggerEraAction(eraActions.gripperOpen) ||
        triggerEraAction(eraActions.servoGripper, openAngle);

    if (ok) {
        const num6 = document.getElementById("num6");
        const range6 = document.getElementById("range6");
        if (num6) num6.value = openAngle;
        if (range6) range6.value = openAngle;
        printLog(`MANUAL: Lệnh THẢ HÀNG (${openAngle}°)`, "warn");
    }
}

/* =========================
   14. ALERT
========================= */
function showAlert() {
    clearInterval(autoTimer);
    isAutoRunning = false;

    const alertBox = document.getElementById("lineAlert");
    if (alertBox) alertBox.style.display = "flex";

    if (eraActions.moveStop) {
        triggerFixedMoveAction("S");
    }

    printLog("CRITICAL ERROR: Xe bị mất line!", "error");
}

function dismissAlert() {
    const alertBox = document.getElementById("lineAlert");
    if (alertBox) alertBox.style.display = "none";
    setMode("MANUAL");
}

/* =========================
   15. MISSION UI
========================= */
function setMissionStep(stepIndex) {
    const labels = [
        "Sẵn sàng",
        "Đang tới A",
        "Tại A: Gắp hàng",
        "Đang tới B",
        "Tại B: Thả hàng",
        "Hoàn thành",
    ];

    const statusObj = document.getElementById("missionStatus");

    if (statusObj) {
        statusObj.innerText = labels[stepIndex] || "N/A";
        statusObj.classList.remove("moving-status", "done-status", "ready-status");

        if (stepIndex >= 1 && stepIndex <= 4) {
            statusObj.classList.add("moving-status");
        } else if (stepIndex === 5) {
            statusObj.classList.add("done-status");
        } else if (stepIndex === 0 && currentMode === "AUTO") {
            statusObj.classList.add("ready-status");
        }
    }

    for (let i = 0; i <= 5; i++) {
        const step = document.getElementById(`step${i}`);
        const line = document.getElementById(`line${i}`);

        if (!step) continue;

        step.classList.remove("active", "done");
        if (line) line.classList.remove("done");

        if (i < stepIndex) {
            step.classList.add("done");
            if (line) line.classList.add("done");
        } else if (i === stepIndex) {
            step.classList.add("active");
        }
    }
}

/* =========================
   16. WMS
========================= */
function handleWMSRecord(step) {
    const tbody = document.getElementById("wmsBody");
    if (!tbody) return;

    const timeNow = new Date();
    const timeStr = timeNow.toLocaleTimeString("vi-VN", { hour12: false });
    const dateStr = timeNow.toLocaleDateString("vi-VN");

    if (step === 2) {
        activePickupTime = timeNow;

        const newId = packageCount + 1;
        const pkgCode = `PKG-${String(newId).padStart(4, "0")}`;

        if (document.getElementById(`pkg-row-${newId}`)) return;

        const row = document.createElement("tr");
        row.id = `pkg-row-${newId}`;
        row.innerHTML = `
            <td class="font-mono text-blue font-bold">${pkgCode}</td>
            <td>${dateStr}</td>
            <td>${timeStr}</td>
            <td id="t-drop-${newId}" style="color: var(--text-dim);">--:--:--</td>
            <td id="t-diff-${newId}" style="color: var(--text-dim);">Đang tính...</td>
            <td id="t-stat-${newId}"><span class="tag tag-warn">Đang trung chuyển</span></td>
        `;

        tbody.appendChild(row);

        const tableWrap = document.getElementById("wmsTableWrap");
        if (tableWrap) tableWrap.scrollTop = tableWrap.scrollHeight;

        printLog(`[WMS] Bắt đầu gắp: ${pkgCode}`, "info");
    }

    if (step === 5) {
        const currentPkgId = packageCount + 1;

        packageCount++;
        const totalCountEl = document.getElementById("totalCount");
        if (totalCountEl) {
            totalCountEl.innerText = String(packageCount).padStart(2, "0");
        }

        const dropCell = document.getElementById(`t-drop-${currentPkgId}`);
        const diffCell = document.getElementById(`t-diff-${currentPkgId}`);
        const statCell = document.getElementById(`t-stat-${currentPkgId}`);

        if (dropCell && activePickupTime) {
            dropCell.innerText = timeStr;
            dropCell.style.color = "var(--text-main)";

            if (statCell) {
                statCell.innerHTML = `<span class="tag tag-succ">Đã nhập kho B</span>`;
            }

            const diffMs = timeNow - activePickupTime;
            if (diffCell) {
                diffCell.innerText = formatDuration(diffMs);
                diffCell.className = "text-green font-bold";
            }
        }

        printLog(`[WMS] Nhập kho thành công kiện thứ ${packageCount}`, "success");

        setTimeout(() => {
            if (currentMode === "AUTO") setMissionStep(0);
        }, 3000);
    }
}

/* =========================
   17. EXPORT
========================= */
function exportWMS() {
    const table = document.getElementById("wmsTable");
    if (!table) {
        printLog("Không tìm thấy bảng WMS để export.", "error");
        return;
    }

    const rows = table.querySelectorAll("tr");
    let csv = "\uFEFF";

    rows.forEach((row) => {
        const cols = row.querySelectorAll("td, th");
        const rowData = Array.from(cols).map((col) => `"${col.innerText.trim()}"`);
        csv += `${rowData.join(",")}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `AGV_WMS_Export_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();

    printLog("Đã export dữ liệu WMS ra CSV.", "success");
}

/* =========================
   18. OPTIONAL GLOBALS
========================= */
window.setMode = setMode;
window.move = move;
window.resetArm = resetArm;
window.manualPick = manualPick;
window.manualDrop = manualDrop;
window.dismissAlert = dismissAlert;
window.syncFromNum = syncFromNum;
window.syncFromRange = syncFromRange;
window.sendArmCommand = sendArmCommand;
window.exportWMS = exportWMS;
window.triggerEmergency = triggerEmergency;
window.resetFromEmergency = resetFromEmergency;
window.showAlert = showAlert;