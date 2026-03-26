
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import {
    getDatabase,
    goOffline,
    ref,
    push,
    set,
    get,
    query,
    orderByChild,
    equalTo,
    limitToLast,
    update
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyDnkxcPxH3Gw0l-BNro17KKX2AEV_6bsaE",
    authDomain: "qr-code-65808.firebaseapp.com",
    databaseURL: "https://qr-code-65808-default-rtdb.firebaseio.com",
    projectId: "qr-code-65808",
    storageBucket: "qr-code-65808.firebasestorage.app",
    messagingSenderId: "953231243938",
    appId: "1:953231243938:web:318fde18c08154e01df5fb",
    measurementId: "G-FMV89YRW06"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

const ALLOWED_DOMAIN = "bdu.edu.vn";
const qrPreviewCache = new Map();
let currentUser = null;
let allQRCodes = [];
let selectedQRKeys = new Set();
let currentPreviewData = null;
let activeMenuElement = null;
let categoryOptions = [];
let idleTimer = null;
let idleCountdownTimer = null;
let isLoggingOut = false;

const IDLE_TIMEOUT_MS = 2 * 60 * 1000;

function isAllowedEmail(email = "") {
    return email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

function hideIdleWarningModal() {
    const modal = document.getElementById("idle-warning-modal");
    if (modal) {
        modal.classList.add("hidden");
    }

    if (idleCountdownTimer) {
        clearInterval(idleCountdownTimer);
        idleCountdownTimer = null;
    }
}

async function logoutAndDisconnect(reason = "idle") {
    if (isLoggingOut) return;
    isLoggingOut = true;

    hideIdleWarningModal();

    if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
    }

    try {
        goOffline(database);
    } catch (error) {
        // No-op: database may already be offline.
    }

    try {
        await signOut(auth);
    } catch (error) {
        // Ignore sign-out errors and continue redirecting.
    }

    if (reason === "idle") {
        alert("Phiên làm việc đã tự động đăng xuất do không thao tác trong 2 phút.");
    }

    window.location.href = "login.html";
}

function showIdleWarningModal() {
    logoutAndDisconnect("idle");
}

function resetIdleTimer() {
    if (!currentUser || isLoggingOut) return;

    hideIdleWarningModal();

    if (idleTimer) {
        clearTimeout(idleTimer);
    }

    idleTimer = setTimeout(() => {
        showToast("error", "Không thao tác quá 2 phút. Hệ thống đang tự động đăng xuất.");
        showIdleWarningModal();
    }, IDLE_TIMEOUT_MS);
}

function initIdleSessionGuard() {
    const activityEvents = ["click", "keydown", "mousemove", "scroll", "touchstart"];
    activityEvents.forEach((eventName) => {
        document.addEventListener(eventName, resetIdleTimer, { passive: true });
    });
}

function getProjectRedirectPath() {
    const currentPath = window.location.pathname;
    const projectRoot = currentPath.substring(0, currentPath.lastIndexOf('/'));
    return `${window.location.origin}${projectRoot}/redirect.html`;
}

async function generateQRCode({
    content,
    color = "#1a365d",
    size = 400,
    logoSize = 60,
    padding = 5,
    dpi = 3,
    includeText = true,
    logoUrl = "./image/Logo.ico",
    isListItem = false,
    cornerRadius = 20,
    backgroundColor = "#ffffff",
    gradientStart = "#2563eb",
    gradientEnd = "#1e40af"
} = {}) {
    if (!content) throw new Error("Content is required for QR generation");
    const adjustedLogoSize = isListItem ? size * 0.15 : logoSize;
    const qrDataUrl = await QRCode.toDataURL(content, {
        width: size,
        margin: 1,
        color: { dark: color, light: backgroundColor }
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const textHeight = includeText ? 30 : 0;
    const textSpacing = 20;
    const canvasSize = size + (padding * 2);

    canvas.width = canvasSize * dpi;
    canvas.height = (canvasSize + textHeight + textSpacing) * dpi;
    ctx.scale(dpi, dpi);

    const gradient = ctx.createLinearGradient(0, 0, canvasSize, canvasSize + textHeight + textSpacing);
    gradient.addColorStop(0, gradientStart);
    gradient.addColorStop(1, gradientEnd);

    ctx.fillStyle = gradient;
    drawRoundedRect(ctx, 0, 0, canvasSize, canvasSize + textHeight + textSpacing, cornerRadius);
    ctx.fill();

    ctx.fillStyle = backgroundColor;
    drawRoundedRect(ctx, padding, padding, size, size, cornerRadius - 5);
    ctx.fill();

    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");
    tempCanvas.width = size;
    tempCanvas.height = size;

    const qrImage = await loadImage(qrDataUrl);
    tempCtx.save();
    tempCtx.beginPath();
    tempCtx.moveTo(cornerRadius, 0);
    tempCtx.lineTo(size - cornerRadius, 0);
    tempCtx.quadraticCurveTo(size, 0, size, cornerRadius);
    tempCtx.lineTo(size, size - cornerRadius);
    tempCtx.quadraticCurveTo(size, size, size - cornerRadius, size);
    tempCtx.lineTo(cornerRadius, size);
    tempCtx.quadraticCurveTo(0, size, 0, size - cornerRadius);
    tempCtx.lineTo(0, cornerRadius);
    tempCtx.quadraticCurveTo(0, 0, cornerRadius, 0);
    tempCtx.closePath();
    tempCtx.clip();
    tempCtx.drawImage(qrImage, 0, 0, size, size);
    tempCtx.restore();
    ctx.drawImage(tempCanvas, padding, padding, size, size);

    if (logoUrl) {
        const logoImage = await loadImage(logoUrl);
        const logoX = (size - adjustedLogoSize) / 2 + padding;
        const logoY = (size - adjustedLogoSize) / 2 + padding;

        ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;

        const logoCanvas = document.createElement("canvas");
        const logoCtx = logoCanvas.getContext("2d");
        logoCanvas.width = adjustedLogoSize;
        logoCanvas.height = adjustedLogoSize;

        logoCtx.beginPath();
        logoCtx.arc(adjustedLogoSize / 2, adjustedLogoSize / 2, adjustedLogoSize / 2, 0, Math.PI * 2);
        logoCtx.closePath();
        logoCtx.clip();
        logoCtx.drawImage(logoImage, 0, 0, adjustedLogoSize, adjustedLogoSize);

        ctx.beginPath();
        ctx.arc(logoX + adjustedLogoSize / 2, logoY + adjustedLogoSize / 2, (adjustedLogoSize / 2) + 5, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.drawImage(logoCanvas, logoX, logoY);

        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }

    if (includeText) {
        ctx.font = "bold 24px Arial";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;
        ctx.fillText("BDU-CM", canvasSize / 2, canvasSize + textSpacing + 10);
    }

    return { dataUrl: canvas.toDataURL("image/png", 1.0), canvas };
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function parseTags(raw = "") {
    return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

function escapeICS(text = "") {
    return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function toICSDate(dateValue) {
    if (!dateValue) return "";
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function getScopedId(prefix, baseId) {
    return prefix ? `${prefix}${baseId}` : baseId;
}

function getScopedRadioName(prefix) {
    return prefix ? `${prefix}qr-type` : "qr-type";
}

function getDatetimeLocalValue(value) {
    if (!value) return "";

    if (/^\d{8}T\d{6}Z$/.test(value)) {
        const normalized = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}`;
        return normalized;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const pad = (num) => String(num).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseWifiContent(content = "") {
    const ssid = (content.match(/S:([^;]*)/) || [])[1] || "";
    const password = (content.match(/P:([^;]*)/) || [])[1] || "";
    const security = (content.match(/T:([^;]*)/) || [])[1] || "WPA";
    return { ssid, password, security };
}

function parseVCardContent(content = "") {
    const lines = content.split("\n");
    const getValue = (prefix) => (lines.find((line) => line.startsWith(prefix)) || "").slice(prefix.length);
    return {
        name: getValue("FN:"),
        phone: getValue("TEL:"),
        email: getValue("EMAIL:")
    };
}

function parseEventContent(content = "") {
    const lines = content.split("\n");
    const getValue = (prefix) => (lines.find((line) => line.startsWith(prefix)) || "").slice(prefix.length);
    return {
        title: getValue("SUMMARY:"),
        location: getValue("LOCATION:"),
        start: getDatetimeLocalValue(getValue("DTSTART:")),
        end: getDatetimeLocalValue(getValue("DTEND:"))
    };
}

function detectContentMode(qr) {
    if (qr.contentMode) return qr.contentMode;
    const content = qr.content || "";
    if (content.startsWith("WIFI:")) return "wifi";
    if (content.includes("BEGIN:VCARD")) return "contact";
    if (content.includes("BEGIN:VEVENT")) return "event";
    return "url";
}

function validateURL(input) {
    const errorElement = input.id === "qr-content" ? document.getElementById("url-error") : document.getElementById("url-error-edit");
    const value = input.value.trim();

    if (!value) {
        input.setCustomValidity("URL không được để trống");
        if (errorElement) {
            errorElement.textContent = "URL không được để trống";
            errorElement.classList.remove("hidden");
        }
        return false;
    }

    if (value.length > 2048) {
        input.setCustomValidity("URL quá dài (tối đa 2048 ký tự)");
        if (errorElement) {
            errorElement.textContent = "URL quá dài (tối đa 2048 ký tự)";
            errorElement.classList.remove("hidden");
        }
        return false;
    }

    try {
        const parsed = new URL(value);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Protocol invalid");
        input.setCustomValidity("");
        if (errorElement) errorElement.classList.add("hidden");
        return true;
    } catch (error) {
        input.setCustomValidity("Vui lòng nhập đúng định dạng URL");
        if (errorElement) {
            errorElement.textContent = "Vui lòng nhập đúng định dạng URL (http:// hoặc https://)";
            errorElement.classList.remove("hidden");
        }
        return false;
    }
}

function getTemplateContentFromFields(prefix = "") {
    const mode = document.getElementById(getScopedId(prefix, "content-mode")).value;

    if (mode === "url") {
        const input = document.getElementById(getScopedId(prefix, "qr-content"));
        const value = input.value.trim();
        if (!validateURL(input)) return { valid: false, mode, content: "", message: "URL không hợp lệ." };
        return { valid: !!value, mode, content: value, message: value ? "" : "URL không được để trống." };
    }

    if (mode === "wifi") {
        const ssid = document.getElementById(getScopedId(prefix, "wifi-ssid")).value.trim();
        const password = document.getElementById(getScopedId(prefix, "wifi-password")).value.trim();
        const security = document.getElementById(getScopedId(prefix, "wifi-security")).value;
        if (!ssid) return { valid: false, mode, content: "", message: "SSID WiFi không được để trống." };
        return { valid: true, mode, content: `WIFI:T:${security};S:${ssid};P:${password};;` };
    }

    if (mode === "contact") {
        const name = document.getElementById(getScopedId(prefix, "contact-name")).value.trim();
        const phone = document.getElementById(getScopedId(prefix, "contact-phone")).value.trim();
        const email = document.getElementById(getScopedId(prefix, "contact-email")).value.trim();
        if (!name) return { valid: false, mode, content: "", message: "Tên liên hệ không được để trống." };
        return { valid: true, mode, content: `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL:${phone}\nEMAIL:${email}\nEND:VCARD` };
    }

    if (mode === "event") {
        const title = document.getElementById(getScopedId(prefix, "event-title")).value.trim();
        const location = document.getElementById(getScopedId(prefix, "event-location")).value.trim();
        const start = document.getElementById(getScopedId(prefix, "event-start")).value;
        const end = document.getElementById(getScopedId(prefix, "event-end")).value;
        if (!title || !start) return { valid: false, mode, content: "", message: "Event cần tên sự kiện và thời gian bắt đầu." };
        if (end && new Date(end).getTime() < new Date(start).getTime()) return { valid: false, mode, content: "", message: "Thời gian kết thúc phải sau thời gian bắt đầu." };
        const content = [
            "BEGIN:VEVENT",
            `SUMMARY:${escapeICS(title)}`,
            `LOCATION:${escapeICS(location)}`,
            `DTSTART:${toICSDate(start)}`,
            end ? `DTEND:${toICSDate(end)}` : "",
            "END:VEVENT"
        ].filter(Boolean).join("\n");
        return { valid: true, mode, content };
    }

    return { valid: false, mode, content: "", message: "Template không hợp lệ." };
}

function getTemplateContentFromForm() {
    return getTemplateContentFromFields("");
}

function getAdvancedSettingsFromFields(prefix = "") {
    const qrType = document.querySelector(`input[name="${getScopedRadioName(prefix)}"]:checked`)?.value || "dynamic";
    if (qrType !== "dynamic") return { valid: true, value: null };

    const expireAtRaw = document.getElementById(getScopedId(prefix, "qr-expire-at")).value;
    const maxScansRaw = document.getElementById(getScopedId(prefix, "qr-max-scans")).value.trim();
    const password = document.getElementById(getScopedId(prefix, "qr-password")).value.trim();

    let expireAt = null;
    if (expireAtRaw) {
        const expireTime = new Date(expireAtRaw).getTime();
        if (Number.isNaN(expireTime)) return { valid: false, message: "Thời gian hết hạn không hợp lệ." };
        expireAt = new Date(expireTime).toISOString();
    }

    let maxScans = null;
    if (maxScansRaw) {
        const parsed = Number(maxScansRaw);
        if (!Number.isFinite(parsed) || parsed < 1) return { valid: false, message: "Giới hạn lượt quét phải lớn hơn 0." };
        maxScans = Math.floor(parsed);
    }

    return { valid: true, value: { expireAt, maxScans, password: password || null } };
}

function getAdvancedSettings() {
    return getAdvancedSettingsFromFields("");
}

function getScanCount(qr) {
    if (getNormalizedQRType(qr.type) !== "dynamic") return 0;
    return Object.keys(qr.accessLogs || {}).length;
}

function getLastScanDate(qr) {
    if (getNormalizedQRType(qr.type) !== "dynamic") return null;
    const logs = Object.values(qr.accessLogs || {});
    if (!logs.length) return null;
    let latest = null;
    logs.forEach((log) => {
        const date = new Date(log.timestamp);
        if (!latest || date > latest) latest = date;
    });
    return latest;
}

function getTrafficText(qr) {
    if (getNormalizedQRType(qr.type) !== "dynamic") return `<div class="qr-meta"><strong>QR tĩnh</strong><br>Không thống kê</div>`;
    const scans = getScanCount(qr);
    const lastScan = getLastScanDate(qr);
    return `<div class="qr-meta"><strong>${scans} lượt quét</strong><br>Lần cuối: ${lastScan ? lastScan.toLocaleString("vi-VN") : "Chưa có"}</div>`;
}

function getNormalizedQRType(type) {
    const normalized = String(type || "").trim().toLowerCase();
    if (["dynamic", "qr động", "động", "dong"].includes(normalized)) return "dynamic";
    if (["static", "qr tĩnh", "tĩnh", "tinh"].includes(normalized)) return "static";
    return normalized || "dynamic";
}

function getDateFilterPass(createdAt, filterValue) {
    if (filterValue === "all") return true;
    const created = new Date(createdAt || 0).getTime();
    if (!created) return false;
    if (filterValue === "today") {
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        return created >= start;
    }
    const days = Number(filterValue);
    if (!Number.isFinite(days)) return true;
    return Date.now() - created <= days * 24 * 60 * 60 * 1000;
}

function compareBySort(a, b, sortBy) {
    const aPinned = !!a.pinned;
    const bPinned = !!b.pinned;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    if (sortBy === "oldest") return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    if (sortBy === "traffic") {
        const trafficDiff = getScanCount(b) - getScanCount(a);
        if (trafficDiff !== 0) return trafficDiff;
    }
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
}

function getVisibleList() {
    const searchValue = document.getElementById("search-qr").value.trim().toLowerCase();
    const typeValue = document.getElementById("filter-type").value;
    const dateValue = document.getElementById("filter-date").value;
    const sortBy = document.getElementById("sort-by").value;

    return allQRCodes
        .filter((qr) => {
            const namePass = (qr.name || "").toLowerCase().includes(searchValue);
            const typePass = typeValue === "all" || getNormalizedQRType(qr.type) === typeValue;
            const datePass = getDateFilterPass(qr.createdAt, dateValue);
            return namePass && typePass && datePass;
        })
        .sort((a, b) => compareBySort(a, b, sortBy));
}

function updateCategorySuggestions() {
    categoryOptions = [...new Set(
        allQRCodes
            .map((qr) => (qr.category || "").trim())
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, "vi"));
}

function renderCategoryMenu(inputId, menuId) {
    const input = document.getElementById(inputId);
    const menu = document.getElementById(menuId);
    if (!input || !menu) return;

    const keyword = input.value.trim().toLowerCase();
    const filteredOptions = categoryOptions.filter((category) => category.toLowerCase().includes(keyword));

    if (!filteredOptions.length) {
        menu.innerHTML = `<div class="category-option-empty">Chưa có danh mục phù hợp.</div>`;
        menu.classList.remove("hidden");
        return;
    }

    menu.innerHTML = filteredOptions
        .map((category) => `<div class="category-option" data-value="${category}">${category}</div>`)
        .join("");

    menu.querySelectorAll(".category-option").forEach((option) => {
        option.addEventListener("mousedown", (event) => {
            event.preventDefault();
            input.value = option.dataset.value || "";
            menu.classList.add("hidden");
        });
    });

    menu.classList.remove("hidden");
}

function initCategoryField(inputId, menuId) {
    const input = document.getElementById(inputId);
    const menu = document.getElementById(menuId);
    if (!input || !menu) return;

    input.addEventListener("focus", () => {
        renderCategoryMenu(inputId, menuId);
    });

    input.addEventListener("input", () => {
        renderCategoryMenu(inputId, menuId);
    });

    input.addEventListener("blur", () => {
        setTimeout(() => {
            menu.classList.add("hidden");
        }, 120);
    });
}

async function generateListPreview(qr) {
    const previewKey = `${qr.key}_${qr.updatedAt || qr.createdAt || ""}_${qr.color || "#000000"}_${qr.redirectURL || qr.content}`;
    if (qrPreviewCache.has(previewKey)) return qrPreviewCache.get(previewKey);

    const dataUrl = await QRCode.toDataURL(qr.redirectURL || qr.content, {
        width: 90,
        margin: 1,
        color: { dark: qr.color || "#111827", light: "#ffffff" }
    });

    qrPreviewCache.set(previewKey, dataUrl);
    return dataUrl;
}

function getPreviewPlaceholder() {
    return "data:image/svg+xml;utf8," + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="90" height="90" viewBox="0 0 90 90">
            <rect width="90" height="90" rx="12" fill="#eff6ff"/>
            <rect x="12" y="12" width="18" height="18" rx="3" fill="#bfdbfe"/>
            <rect x="60" y="12" width="18" height="18" rx="3" fill="#bfdbfe"/>
            <rect x="12" y="60" width="18" height="18" rx="3" fill="#bfdbfe"/>
            <path d="M45 24h6v6h-6zM39 36h6v6h-6zM51 36h6v6h-6zM45 48h6v6h-6z" fill="#93c5fd"/>
        </svg>
    `);
}

function scheduleRowPreview(qr, img) {
    const run = async () => {
        try {
            const previewDataUrl = await generateListPreview(qr);
            if (img.isConnected) {
                img.src = previewDataUrl;
            }
        } catch (error) {
            // Keep placeholder if preview generation fails.
        }
    };

    if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(run, { timeout: 300 });
    } else {
        window.setTimeout(run, 0);
    }
}

function renderEmptyTable(message) {
    document.getElementById("qr-list").innerHTML = `<tr><td colspan="8" class="qr-empty">${message}</td></tr>`;
}

function closeActionMenu() {
    if (!activeMenuElement) return;
    activeMenuElement.classList.add("hidden");
    activeMenuElement = null;
}

function createActionMenuItem(label, onClick, options = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (options.disabled) {
        button.disabled = true;
        button.classList.add("action-disabled");
        if (options.title) button.title = options.title;
        return button;
    }
    button.addEventListener("click", () => {
        closeActionMenu();
        onClick();
    });
    return button;
}

function createQRCodeActions(qr) {
    const container = document.createElement("div");
    container.className = "qr-actions";
    const qrType = getNormalizedQRType(qr.type);

    const menuButton = document.createElement("button");
    menuButton.type = "button";
    menuButton.className = "action-menu-btn";
    menuButton.textContent = "...";

    const menu = document.createElement("div");
    menu.className = "action-menu hidden";

    menu.appendChild(createActionMenuItem("Tải PNG", () => downloadQRCodePNG(qr)));
    menu.appendChild(createActionMenuItem("Tải SVG", () => downloadQRCodeSVG(qr)));
    menu.appendChild(createActionMenuItem("Sao chép link", () => copyQRLink(qr)));
    menu.appendChild(createActionMenuItem(
        "Chỉnh sửa",
        () => showEditModal(qr),
        qrType === "static"
            ? { disabled: true, title: "QR tĩnh không cho chỉnh sửa nội dung." }
            : {}
    ));
    menu.appendChild(createActionMenuItem("Nhân bản", () => duplicateQRCode(qr)));
    menu.appendChild(createActionMenuItem(qr.pinned ? "Bỏ ghim" : "Ghim lên đầu", () => togglePinQRCode(qr)));
    menu.appendChild(createActionMenuItem("Xóa", () => deleteQRCode(qr.key)));

    menuButton.addEventListener("click", (event) => {
        event.stopPropagation();
        if (activeMenuElement && activeMenuElement !== menu) closeActionMenu();
        menu.classList.toggle("hidden");
        activeMenuElement = menu.classList.contains("hidden") ? null : menu;
    });

    container.append(menuButton, menu);
    return container;
}

function updateSelectAllState() {
    const selectAll = document.getElementById("select-all-qr");
    const visibleKeys = getVisibleList().map((item) => item.key);

    if (!visibleKeys.length) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
        return;
    }

    const selectedVisibleCount = visibleKeys.filter((key) => selectedQRKeys.has(key)).length;
    selectAll.checked = selectedVisibleCount === visibleKeys.length;
    selectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleKeys.length;
}

function renderQRCodeItem(qr) {
    try {
        const tr = document.createElement("tr");
        tr.className = "qr-item";

        const selectCell = document.createElement("td");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = selectedQRKeys.has(qr.key);
        checkbox.addEventListener("change", (event) => {
            if (event.target.checked) selectedQRKeys.add(qr.key);
            else selectedQRKeys.delete(qr.key);
            updateSelectAllState();
        });
        selectCell.appendChild(checkbox);

        const previewCell = document.createElement("td");
        const img = document.createElement("img");
        img.src = getPreviewPlaceholder();
        img.className = "qr-thumb";
        img.loading = "lazy";
        img.decoding = "async";
        previewCell.appendChild(img);
        scheduleRowPreview(qr, img);

        const nameCell = document.createElement("td");
        nameCell.className = "qr-name";
        nameCell.textContent = qr.name || "(Không tên)";

        const typeCell = document.createElement("td");
        const qrType = getNormalizedQRType(qr.type);
        const typeBadge = document.createElement("span");
        typeBadge.className = `qr-badge ${qrType === "static" ? "static" : "dynamic"}`;
        typeBadge.textContent = qrType === "static" ? "QR Tĩnh" : "QR Động";
        typeCell.appendChild(typeBadge);

        const categoryCell = document.createElement("td");
        const categoryText = qr.category || (Array.isArray(qr.tags) ? qr.tags.join(", ") : "") || "-";
        categoryCell.innerHTML = `<div class="qr-meta"><strong>${categoryText}</strong></div>`;

        const dateCell = document.createElement("td");
        dateCell.className = "qr-meta";
        dateCell.textContent = new Date(qr.createdAt || Date.now()).toLocaleDateString("vi-VN");

        const trafficCell = document.createElement("td");
        trafficCell.innerHTML = getTrafficText(qr);

        const actionCell = document.createElement("td");
        actionCell.appendChild(createQRCodeActions(qr));

        tr.append(selectCell, previewCell, nameCell, typeCell, categoryCell, dateCell, trafficCell, actionCell);
        return tr;
    } catch (error) {
        return null;
    }
}

function renderQRCodeList() {
    const qrList = document.getElementById("qr-list");
    const visibleList = getVisibleList();
    if (!visibleList.length) {
        renderEmptyTable("Không có QR phù hợp bộ lọc.");
        updateSelectAllState();
        return;
    }

    qrList.innerHTML = "";
    const fragment = document.createDocumentFragment();
    visibleList.forEach((qr) => {
        const row = renderQRCodeItem(qr);
        if (row) fragment.appendChild(row);
    });
    qrList.appendChild(fragment);
    updateSelectAllState();
}

async function loadQRCodes(userId) {
    renderEmptyTable("Đang tải dữ liệu...");
    try {
        const qrRef = ref(database, "qrCodes");
        const userQrQuery = query(qrRef, orderByChild("userId"), equalTo(userId), limitToLast(500));
        const snapshot = await get(userQrQuery);
        const data = snapshot.val();

        allQRCodes = data ? Object.entries(data).map(([key, value]) => ({ key, ...value })) : [];
        selectedQRKeys = new Set([...selectedQRKeys].filter((key) => allQRCodes.some((item) => item.key === key)));
        updateCategorySuggestions();

        renderQRCodeList();
    } catch (error) {
        renderEmptyTable("Không thể tải danh sách QR.");
        showToast("error", "Tải danh sách QR thất bại, vui lòng thử lại.");
    }
}

async function createAndSaveQRCode() {
    const name = document.getElementById("qr-name").value.trim();
    const category = document.getElementById("qr-category").value.trim();
    const color = document.getElementById("qr-color").value;
    const qrType = document.querySelector('input[name="qr-type"]:checked')?.value || "dynamic";

    if (!name || !currentUser) {
        showToast("error", "Vui lòng nhập tên mã QR và đăng nhập lại.");
        return;
    }

    const templateContent = getTemplateContentFromForm();
    if (!templateContent.valid) {
        showToast("error", templateContent.message || "Nội dung QR không hợp lệ.");
        return;
    }

    const settingsResult = getAdvancedSettings();
    if (!settingsResult.valid) {
        showToast("error", settingsResult.message);
        return;
    }

    try {
        const qrRef = ref(database, "qrCodes");
        const newQRCodeRef = push(qrRef);
        const redirectURL = qrType === "dynamic" ? `${getProjectRedirectPath()}?id=${newQRCodeRef.key}` : templateContent.content;

        await set(newQRCodeRef, {
            userId: currentUser.uid,
            name,
            content: templateContent.content,
            redirectURL,
            color,
            type: qrType,
            contentMode: templateContent.mode,
            category,
            settings: settingsResult.value,
            pinned: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });

        resetForm();
        showToast("success", "Mã QR được tạo thành công!");
        await loadQRCodes(currentUser.uid);
        await updateLivePreview();
    } catch (error) {
        showToast("error", "Đã xảy ra lỗi khi tạo mã QR!");
    }
}

async function copyQRLink(qr) {
    const link = getNormalizedQRType(qr.type) === "static" ? qr.content : `${getProjectRedirectPath()}?id=${qr.key}`;
    try {
        await navigator.clipboard.writeText(link);
        showToast("success", "Đã sao chép link thành công!");
    } catch (error) {
        showToast("error", "Không thể sao chép link. Vui lòng thử lại.");
    }
}

async function togglePinQRCode(qr) {
    try {
        const qrRef = ref(database, `qrCodes/${qr.key}`);
        const nextPinned = !qr.pinned;
        await update(qrRef, {
            pinned: nextPinned,
            pinnedAt: nextPinned ? new Date().toISOString() : null,
            updatedAt: new Date().toISOString()
        });
        showToast("success", nextPinned ? "Đã ghim mã QR lên đầu danh sách." : "Đã bỏ ghim mã QR.");
        await loadQRCodes(currentUser.uid);
    } catch (error) {
        showToast("error", "Không thể cập nhật trạng thái ghim.");
    }
}

async function downloadQRCodePNG(qr) {
    try {
        const qrCode = await generateQRCode({
            content: getNormalizedQRType(qr.type) === "dynamic" ? `${getProjectRedirectPath()}?id=${qr.key}` : qr.content,
            name: qr.name,
            color: qr.color || "#000000",
            isListItem: false
        });

        const link = document.createElement("a");
        link.href = qrCode.dataUrl;
        link.download = `${(qr.name || "qrcode").replace(/\s+/g, "-")}.png`;
        link.click();
    } catch (error) {
        showToast("error", "Đã xảy ra lỗi khi tải PNG.");
    }
}

async function downloadQRCodeSVG(qr) {
    try {
        const content = getNormalizedQRType(qr.type) === "dynamic" ? `${getProjectRedirectPath()}?id=${qr.key}` : qr.content;
        const svgString = await QRCode.toString(content, {
            type: "svg",
            margin: 1,
            color: { dark: qr.color || "#000000", light: "#ffffff" }
        });

        const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${(qr.name || "qrcode").replace(/\s+/g, "-")}.svg`;
        link.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        showToast("error", "Đã xảy ra lỗi khi tải SVG.");
    }
}

async function duplicateQRCode(qr) {
    if (!currentUser) return;
    try {
        const qrRef = ref(database, "qrCodes");
        const newQRCodeRef = push(qrRef);
        const duplicatedType = getNormalizedQRType(qr.type);

        await set(newQRCodeRef, {
            ...qr,
            userId: currentUser.uid,
            name: `${qr.name || "QR"} (Bản sao)`,
            type: duplicatedType,
            redirectURL: duplicatedType === "dynamic" ? `${getProjectRedirectPath()}?id=${newQRCodeRef.key}` : qr.content,
            pinned: false,
            pinnedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });

        showToast("success", "Đã nhân bản mã QR.");
        await loadQRCodes(currentUser.uid);
    } catch (error) {
        showToast("error", "Không thể nhân bản mã QR.");
    }
}
function showEditModal(qr) {
    const editModal = document.getElementById("edit-modal");
    const editNote = document.getElementById("edit-note");
    const isStaticQR = qr.type === "static";
    const editContentMode = document.getElementById("edit-content-mode");
    const editTemplateFields = [
        "edit-qr-content",
        "edit-wifi-ssid",
        "edit-wifi-password",
        "edit-wifi-security",
        "edit-contact-name",
        "edit-contact-phone",
        "edit-contact-email",
        "edit-event-title",
        "edit-event-location",
        "edit-event-start",
        "edit-event-end"
    ];

    document.getElementById("edit-qr-name").value = qr.name || "";
    const settings = qr.settings || {};
    const mode = detectContentMode(qr);

    document.getElementById("edit-qr-name").value = qr.name || "";
    document.getElementById("edit-qr-category").value = qr.category || "";
    document.getElementById("edit-content-mode").value = mode;
    document.getElementById("edit-qr-color").value = qr.color || "#000000";
    document.querySelector(`input[name="edit-qr-type"][value="${qr.type || "dynamic"}"]`).checked = true;
    document.getElementById("edit-qr-expire-at").value = getDatetimeLocalValue(settings.expireAt || "");
    document.getElementById("edit-qr-max-scans").value = settings.maxScans || "";
    document.getElementById("edit-qr-password").value = settings.password || "";

    document.getElementById("edit-qr-content").value = "";
    document.getElementById("edit-wifi-ssid").value = "";
    document.getElementById("edit-wifi-password").value = "";
    document.getElementById("edit-wifi-security").value = "WPA";
    document.getElementById("edit-contact-name").value = "";
    document.getElementById("edit-contact-phone").value = "";
    document.getElementById("edit-contact-email").value = "";
    document.getElementById("edit-event-title").value = "";
    document.getElementById("edit-event-location").value = "";
    document.getElementById("edit-event-start").value = "";
    document.getElementById("edit-event-end").value = "";

    if (mode === "url") {
        document.getElementById("edit-qr-content").value = qr.content || "";
    } else if (mode === "wifi") {
        const wifi = parseWifiContent(qr.content || "");
        document.getElementById("edit-wifi-ssid").value = wifi.ssid;
        document.getElementById("edit-wifi-password").value = wifi.password;
        document.getElementById("edit-wifi-security").value = wifi.security || "WPA";
    } else if (mode === "contact") {
        const contact = parseVCardContent(qr.content || "");
        document.getElementById("edit-contact-name").value = contact.name;
        document.getElementById("edit-contact-phone").value = contact.phone;
        document.getElementById("edit-contact-email").value = contact.email;
    } else if (mode === "event") {
        const eventData = parseEventContent(qr.content || "");
        document.getElementById("edit-event-title").value = eventData.title;
        document.getElementById("edit-event-location").value = eventData.location;
        document.getElementById("edit-event-start").value = eventData.start;
        document.getElementById("edit-event-end").value = eventData.end;
    }

    editModal.dataset.key = qr.key;
    editModal.dataset.originalType = qr.type || "dynamic";
    editModal.dataset.originalContent = qr.content || "";
    editModal.dataset.originalContentMode = mode;

    editContentMode.disabled = isStaticQR;
    editTemplateFields.forEach((fieldId) => {
        const field = document.getElementById(fieldId);
        if (field) field.disabled = isStaticQR;
    });

    editNote.textContent = qr.type === "dynamic"
        ? "Bạn có thể cập nhật lại toàn bộ cấu hình của QR này."
        : "QR tĩnh không cho chỉnh sửa nội dung sau khi tạo. Bạn chỉ có thể đổi tên, danh mục và màu QR.";

    updateTemplateUI("edit-");
    updateQRTypeUI("edit-");

    editModal.classList.remove("hidden");
}

function closeEditModal() {
    document.getElementById("edit-modal").classList.add("hidden");
}

async function saveQRCodeEdit() {
    const editModal = document.getElementById("edit-modal");
    const key = editModal.dataset.key;
    const originalType = editModal.dataset.originalType || "dynamic";
    const newName = document.getElementById("edit-qr-name").value.trim();
    const newCategory = document.getElementById("edit-qr-category").value.trim();
    const newColor = document.getElementById("edit-qr-color").value;
    const qrType = originalType;

    if (!newName) {
        showToast("error", "Tên QR không được để trống.");
        return;
    }

    let templateContent;
    if (originalType === "static") {
        templateContent = {
            valid: true,
            mode: editModal.dataset.originalContentMode || "url",
            content: editModal.dataset.originalContent || ""
        };
    } else {
        templateContent = getTemplateContentFromFields("edit-");
        if (!templateContent.valid) {
            showToast("error", templateContent.message || "Nội dung QR không hợp lệ.");
            return;
        }
    }

    const settingsResult = getAdvancedSettingsFromFields("edit-");
    if (!settingsResult.valid) {
        showToast("error", settingsResult.message);
        return;
    }

    const payload = {
        name: newName,
        category: newCategory,
        color: newColor,
        type: qrType,
        contentMode: templateContent.mode,
        content: templateContent.content,
        redirectURL: qrType === "dynamic" ? `${getProjectRedirectPath()}?id=${key}` : templateContent.content,
        settings: settingsResult.value,
        updatedAt: new Date().toISOString()
    };

    try {
        await update(ref(database, `qrCodes/${key}`), payload);
        showToast("success", "Mã QR được cập nhật thành công!");
        closeEditModal();
        await loadQRCodes(currentUser.uid);
    } catch (error) {
        showToast("error", "Đã xảy ra lỗi khi cập nhật mã QR!");
    }
}

function showConfirm(message, onConfirm) {
    if (document.getElementById("custom-confirm-modal")) return;
    const modal = document.createElement("div");
    modal.id = "custom-confirm-modal";
    modal.className = "fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40";
    modal.innerHTML = `
      <div class="bg-white rounded-lg shadow-lg p-6 w-full max-w-xs text-center">
        <p class="mb-6 text-gray-800 text-base">${message}</p>
        <div class="flex justify-center gap-4">
          <button id="confirm-ok" class="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">Xác nhận</button>
          <button id="confirm-cancel" class="bg-gray-300 text-gray-800 px-4 py-2 rounded hover:bg-gray-400">Hủy</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    document.getElementById("confirm-ok").onclick = () => { modal.remove(); onConfirm(); };
    document.getElementById("confirm-cancel").onclick = () => { modal.remove(); };
}

async function deleteQRCode(key) {
    showConfirm("Bạn có chắc chắn muốn xóa mã QR này không?", async () => {
        try {
            await set(ref(database, `qrCodes/${key}`), null);
            selectedQRKeys.delete(key);
            showToast("success", "Đã xóa mã QR thành công!");
            await loadQRCodes(currentUser.uid);
        } catch (error) {
            showToast("error", "Đã xảy ra lỗi khi xóa mã QR.");
        }
    });
}

async function deleteBulkQRCodes() {
    if (!selectedQRKeys.size) {
        showToast("error", "Bạn chưa chọn mã QR nào.");
        return;
    }

    showConfirm(`Xóa ${selectedQRKeys.size} mã QR đã chọn?`, async () => {
        try {
            const tasks = [...selectedQRKeys].map((key) => set(ref(database, `qrCodes/${key}`), null));
            await Promise.all(tasks);
            selectedQRKeys.clear();
            showToast("success", "Đã xóa các mã QR đã chọn.");
            await loadQRCodes(currentUser.uid);
        } catch (error) {
            showToast("error", "Xóa hàng loạt thất bại.");
        }
    });
}

function escapeCSV(value) {
    const stringValue = String(value ?? "");
    if (/[",\n]/.test(stringValue)) return `"${stringValue.replace(/"/g, '""')}"`;
    return stringValue;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function parseDataUrl(dataUrl) {
    const match = String(dataUrl || "").match(/^data:(.+);base64,(.+)$/);
    if (!match) {
        return { mimeType: "image/png", base64: "" };
    }

    return {
        mimeType: match[1],
        base64: match[2]
    };
}

async function exportSelectedQRCodes() {
    if (!selectedQRKeys.size) {
        showToast("error", "Bạn chưa chọn mã QR nào để xuất Excel.");
        return;
    }

    const selectedItems = allQRCodes.filter((qr) => selectedQRKeys.has(qr.key));
    const rows = [];
    const imageParts = [];

    await Promise.all(selectedItems.map(async (qr, index) => {
        const lastScan = getLastScanDate(qr);
        const qrPreview = await generateQRCode({
            content: getNormalizedQRType(qr.type) === "dynamic" ? `${getProjectRedirectPath()}?id=${qr.key}` : qr.content,
            color: qr.color || "#000000",
            size: 130,
            logoSize: 28,
            padding: 4,
            includeText: true,
            isListItem: false
        });

        const imageLocation = `file:///qr_export_images/qr_${index + 1}.png`;
        const imageMeta = parseDataUrl(qrPreview.dataUrl);

        imageParts.push(`
--QRMHTMLBOUNDARY
Content-Location: ${imageLocation}
Content-Transfer-Encoding: base64
Content-Type: ${imageMeta.mimeType}

${imageMeta.base64}
        `.trim());

        rows.push(`
            <tr>
                <td>${escapeHtml(qr.key)}</td>
                <td>${escapeHtml(qr.name || "")}</td>
                <td>${escapeHtml(getNormalizedQRType(qr.type) === "static" ? "QR Tĩnh" : "QR Động")}</td>
                <td>${escapeHtml(qr.category || "")}</td>
                <td>${escapeHtml(new Date(qr.createdAt || Date.now()).toLocaleString("vi-VN"))}</td>
                <td>${escapeHtml(String(getScanCount(qr)))}</td>
                <td>${escapeHtml(lastScan ? lastScan.toLocaleString("vi-VN") : "Chưa có")}</td>
                <td>${escapeHtml(qr.content || "")}</td>
                <td style="width:118px;height:118px;padding:6px;text-align:center;">
                    <img src="${imageLocation}" alt="QR Code" style="width:96px;height:auto;display:block;margin:0 auto;" />
                </td>
            </tr>
        `);
    }));

    const workbookHtml = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:x="urn:schemas-microsoft-com:office:excel"
              xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="UTF-8">
            <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>QRCodes</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
            <style>
                body { font-family: Arial, sans-serif; }
                table { border-collapse: collapse; width: 100%; table-layout: fixed; }
                th, td { border: 1px solid #cbd5e1; padding: 10px; vertical-align: middle; word-wrap: break-word; }
                th { background: #dbeafe; color: #1e3a8a; font-weight: 700; }
                tr:nth-child(even) td { background: #f8fbff; }
            </style>
        </head>
        <body>
            <table>
                <colgroup>
                    <col style="width:150px">
                    <col style="width:120px">
                    <col style="width:90px">
                    <col style="width:120px">
                    <col style="width:130px">
                    <col style="width:85px">
                    <col style="width:115px">
                    <col style="width:260px">
                    <col style="width:118px">
                </colgroup>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Tên</th>
                        <th>Loại</th>
                        <th>Danh mục</th>
                        <th>Ngày tạo</th>
                        <th>Lượt quét</th>
                        <th>Lần quét cuối</th>
                        <th>Nội dung</th>
                        <th>Mã QR</th>
                    </tr>
                </thead>
                <tbody>${rows.join("")}</tbody>
            </table>
        </body>
        </html>
    `;

    const mhtmlDocument = `
MIME-Version: 1.0
Content-Type: multipart/related; boundary="QRMHTMLBOUNDARY"

--QRMHTMLBOUNDARY
Content-Location: file:///qr_export_workbook.htm
Content-Transfer-Encoding: 8bit
Content-Type: text/html; charset="utf-8"

${workbookHtml}
${imageParts.join("\n")}
--QRMHTMLBOUNDARY--
    `.trim();

    const blob = new Blob([`\uFEFF${mhtmlDocument}`], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `qr_export_${new Date().toISOString().split("T")[0]}.xls`;
    link.click();
    URL.revokeObjectURL(url);

    showToast("success", "Đã xuất file Excel thành công.");
}

function filterQRCodes() {
    renderQRCodeList();
}

function resetForm() {
    document.getElementById("qr-name").value = "";
    document.getElementById("qr-category").value = "";
    document.getElementById("qr-content").value = "";
    document.getElementById("qr-color").value = "#000000";
    document.getElementById("content-mode").value = "url";
    document.getElementById("qr-expire-at").value = "";
    document.getElementById("qr-max-scans").value = "";
    document.getElementById("qr-password").value = "";
    document.getElementById("wifi-ssid").value = "";
    document.getElementById("wifi-password").value = "";
    document.getElementById("wifi-security").value = "WPA";
    document.getElementById("contact-name").value = "";
    document.getElementById("contact-phone").value = "";
    document.getElementById("contact-email").value = "";
    document.getElementById("event-title").value = "";
    document.getElementById("event-location").value = "";
    document.getElementById("event-start").value = "";
    document.getElementById("event-end").value = "";
}

function updateQRTypeUI(prefix = "") {
    const qrType = document.querySelector(`input[name="${getScopedRadioName(prefix)}"]:checked`)?.value || "dynamic";
    const targetId = prefix ? `${prefix}advanced-settings` : "advanced-settings";
    document.getElementById(targetId).classList.toggle("hidden", qrType !== "dynamic");
}

function updateTemplateUI(prefix = "") {
    const mode = document.getElementById(getScopedId(prefix, "content-mode")).value;
    ["url", "wifi", "contact", "event"].forEach((templateMode) => {
        const block = document.getElementById(getScopedId(prefix, `template-${templateMode}`));
        if (block) block.classList.add("hidden");
    });
    const currentBlock = document.getElementById(getScopedId(prefix, `template-${mode}`));
    if (currentBlock) currentBlock.classList.remove("hidden");
}

async function updateLivePreview() {
    const previewImage = document.getElementById("qr-live-preview");
    const previewEmptyState = document.getElementById("preview-empty-state");
    const previewNote = document.getElementById("preview-note");
    const color = document.getElementById("qr-color").value;
    const name = document.getElementById("qr-name").value.trim() || "preview-qr";

    const setPreviewState = ({ showImage, note }) => {
        previewImage.classList.toggle("hidden", !showImage);
        previewEmptyState.classList.toggle("hidden", showImage);
        if (!showImage) {
            previewImage.removeAttribute("src");
        }
        previewNote.textContent = note;
    };

    const templateData = getTemplateContentFromForm();
    if (!templateData.valid || !templateData.content) {
        setPreviewState({
            showImage: false,
            note: templateData.message || "Nhập nội dung để xem preview."
        });
        currentPreviewData = null;
        return;
    }

    try {
        const pngData = await generateQRCode({ content: templateData.content, color, size: 360, includeText: true, isListItem: false });
        previewImage.src = pngData.dataUrl;
        setPreviewState({
            showImage: true,
            note: "Preview đang cập nhật realtime theo nội dung vừa nhập."
        });

        const svgString = await QRCode.toString(templateData.content, {
            type: "svg",
            margin: 1,
            color: { dark: color, light: "#ffffff" }
        });

        currentPreviewData = { name, pngDataUrl: pngData.dataUrl, svgString };
    } catch (error) {
        setPreviewState({
            showImage: false,
            note: "Không thể tạo preview cho nội dung hiện tại."
        });
        currentPreviewData = null;
    }
}

function debounce(fn, delay = 250) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

function downloadPreviewPNG() {
    if (!currentPreviewData) return showToast("error", "Chưa có preview để tải.");
    const link = document.createElement("a");
    link.href = currentPreviewData.pngDataUrl;
    link.download = `${currentPreviewData.name.replace(/\s+/g, "-") || "preview-qr"}.png`;
    link.click();
}

function downloadPreviewSVG() {
    if (!currentPreviewData) return showToast("error", "Chưa có preview để tải.");
    const blob = new Blob([currentPreviewData.svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentPreviewData.name.replace(/\s+/g, "-") || "preview-qr"}.svg`;
    link.click();
    URL.revokeObjectURL(url);
}

function initFormListeners() {
    const debouncedPreview = debounce(updateLivePreview, 250);
    initCategoryField("qr-category", "qr-category-menu");
    initCategoryField("edit-qr-category", "edit-qr-category-menu");

    document.getElementById("content-mode")?.addEventListener("change", () => {
        updateTemplateUI();
        debouncedPreview();
    });

    document.getElementById("edit-content-mode")?.addEventListener("change", () => {
        updateTemplateUI("edit-");
    });

    document.querySelectorAll('input[name="qr-type"]').forEach((radio) => {
        radio.addEventListener("change", () => {
            updateQRTypeUI();
            debouncedPreview();
        });
    });

    document.querySelectorAll('input[name="edit-qr-type"]').forEach((radio) => {
        radio.addEventListener("change", () => {
            updateQRTypeUI("edit-");
        });
    });

    ["qr-name", "qr-category", "qr-content", "qr-color", "wifi-ssid", "wifi-password", "wifi-security", "contact-name", "contact-phone", "contact-email", "event-title", "event-location", "event-start", "event-end", "qr-expire-at", "qr-max-scans", "qr-password"]
        .forEach((id) => {
            const element = document.getElementById(id);
            if (!element) return;
            element.addEventListener("input", debouncedPreview);
            element.addEventListener("change", debouncedPreview);
        });

    document.getElementById("preview-download-png")?.addEventListener("click", downloadPreviewPNG);
    document.getElementById("preview-download-svg")?.addEventListener("click", downloadPreviewSVG);
    document.getElementById("bulk-delete-btn")?.addEventListener("click", deleteBulkQRCodes);
    document.getElementById("bulk-export-btn")?.addEventListener("click", exportSelectedQRCodes);

    document.getElementById("select-all-qr")?.addEventListener("change", (event) => {
        const visibleKeys = getVisibleList().map((item) => item.key);
        if (event.target.checked) visibleKeys.forEach((key) => selectedQRKeys.add(key));
        else visibleKeys.forEach((key) => selectedQRKeys.delete(key));
        renderQRCodeList();
    });

    document.addEventListener("click", () => closeActionMenu());
    document.addEventListener("click", (event) => {
        const categoryField = event.target.closest(".category-field");
        if (!categoryField) {
            document.getElementById("qr-category-menu")?.classList.add("hidden");
            document.getElementById("edit-qr-category-menu")?.classList.add("hidden");
        }
    });
    updateTemplateUI();
    updateQRTypeUI();
    updateTemplateUI("edit-");
    updateQRTypeUI("edit-");
    updateLivePreview();
}
onAuthStateChanged(auth, async (user) => {
    if (user) {
        if (!isAllowedEmail(user.email || "")) {
            await signOut(auth);
            showToast("error", "Chỉ tài khoản email @bdu.edu.vn được phép truy cập.");
            setTimeout(() => { window.location.href = "login.html"; }, 1000);
            return;
        }

        currentUser = user;
        isLoggingOut = false;
        const username = user.displayName || user.email.split("@")[0];
        document.getElementById("user-name").textContent = `Xin chào, ${username}`;
        resetIdleTimer();
        await loadQRCodes(user.uid);
    } else {
        currentUser = null;
        hideIdleWarningModal();
        window.location.href = "login.html";
    }
});

document.getElementById("logout-btn")?.addEventListener("click", async () => {
    try {
        await logoutAndDisconnect("manual");
    } catch (error) {
        showToast("error", "Đăng xuất thất bại.");
    }
});

document.addEventListener("DOMContentLoaded", () => {
    initFormListeners();
    initIdleSessionGuard();
    if (!localStorage.getItem("firstVisit")) {
        startIntroGuide();
        localStorage.setItem("firstVisit", "true");
    }
});

function startIntroGuide() {
    const intro = introJs();
    intro.setOptions({
        steps: [
            { intro: "Chào mừng bạn đến với Trình tạo mã QR!" },
            { element: "#create-form-zone", intro: "Khu vực tạo QR: chọn template, nội dung, loại QR và thiết lập nâng cao." },
            { element: "#preview-zone", intro: "Preview lớn realtime giúp bạn kiểm tra trước khi lưu." },
            { element: "#qr-type-group", intro: "QR động có thống kê và đổi link sau khi tạo; QR tĩnh cố định nội dung." },
            { element: "#qr-list-container", intro: "Danh sách QR hỗ trợ lọc, sắp xếp, bulk actions và thao tác nhanh trong menu." }
        ],
        nextLabel: "Tiếp tục",
        prevLabel: "Quay lại",
        doneLabel: "Hoàn thành"
    });
    intro.start();
}

function showToast(type, message) {
    const toast = document.createElement("div");
    toast.className = `fixed z-50 left-1/2 transform -translate-x-1/2 top-8 px-6 py-3 rounded shadow-lg text-white text-base font-medium transition-all duration-300 ${type === "success" ? "bg-green-500" : "bg-red-500"}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.top = "0px";
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

window.generateAndSaveQRCode = createAndSaveQRCode;
window.validateURL = validateURL;
window.filterQRCodes = filterQRCodes;
window.closeEditModal = closeEditModal;
window.saveQRCodeEdit = saveQRCodeEdit;
window.startIntroGuide = startIntroGuide;
