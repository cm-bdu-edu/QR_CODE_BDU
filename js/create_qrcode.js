import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import {
    getDatabase,
    ref,
    push,
    set,
    onValue,
    query,
    orderByChild,
    equalTo,
    update
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

// Firebase Configuration
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);
let currentUser = null;
let qrCodesListener = null;

// tạo mã QR
async function generateQRCode({
    content,
    color = '#1a365d', // Màu QR code tối và chuyên nghiệp
    size = 400,
    logoSize = 60,
    padding = 5,
    dpi = 4,
    includeText = true,
    logoUrl = './image/Logo.ico',
    isListItem = false,
    cornerRadius = 20,
    // Thêm các tùy chọn màu mới
    backgroundColor = '#ffffff', // Nền trắng làm nổi bật QR
    gradientStart = '#2563eb',  // Màu gradient bắt đầu
    gradientEnd = '#1e40af',    // Màu gradient kết thúc

} = {}) {
    try {
        if (!content) {
            throw new Error('Content is required for QR code generation');
        }


        const adjustedLogoSize = isListItem ? size * 0.15 : logoSize;

        const qrDataUrl = await QRCode.toDataURL(content, {
            width: size,
            margin: 1,
            color: {
                dark: color,
                light: backgroundColor
            }
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const textHeight = includeText ? 30 : 0; // Tăng chiều cao text
        const textSpacing = 20;
        const canvasSize = size + (padding * 2);

        canvas.width = canvasSize * dpi;
        canvas.height = (canvasSize + textHeight + textSpacing) * dpi;
        ctx.scale(dpi, dpi);

        // Tạo gradient cho background
        const gradient = ctx.createLinearGradient(0, 0, canvasSize, canvasSize + textHeight + textSpacing);
        gradient.addColorStop(0, gradientStart);
        gradient.addColorStop(1, gradientEnd);

        // Vẽ background với gradient
        ctx.fillStyle = gradient;
        drawRoundedRect(ctx, 0, 0, canvasSize, canvasSize + textHeight + textSpacing, cornerRadius);
        ctx.fill();

        // Vẽ nền trắng cho QR code
        ctx.fillStyle = backgroundColor;
        drawRoundedRect(ctx, padding, padding, size, size, cornerRadius - 5);
        ctx.fill();

        // Tạo canvas tạm thời cho QR code
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
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

        // Vẽ logo với đổ bóng
        if (logoUrl) {
            const logoImage = await loadImage(logoUrl);
            const logoX = (size - adjustedLogoSize) / 2 + padding;
            const logoY = (size - adjustedLogoSize) / 2 + padding;

            // Thêm đổ bóng
            ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 2;

            const logoCanvas = document.createElement('canvas');
            const logoCtx = logoCanvas.getContext('2d');
            logoCanvas.width = adjustedLogoSize;
            logoCanvas.height = adjustedLogoSize;

            logoCtx.beginPath();
            logoCtx.arc(adjustedLogoSize / 2, adjustedLogoSize / 2, adjustedLogoSize / 2, 0, Math.PI * 2);
            logoCtx.closePath();
            logoCtx.clip();

            logoCtx.drawImage(logoImage, 0, 0, adjustedLogoSize, adjustedLogoSize);

            // Vẽ viền trắng xung quanh logo
            ctx.beginPath();
            ctx.arc(logoX + adjustedLogoSize / 2, logoY + adjustedLogoSize / 2,
                (adjustedLogoSize / 2) + 5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();

            ctx.drawImage(logoCanvas, logoX, logoY);

            // Reset shadow
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        }

        // Vẽ text với style mới
        if (includeText) {
            ctx.font = 'bold 24px Arial'; // Tăng kích thước font
            ctx.fillStyle = '#ffffff';    // Màu trắng cho text
            ctx.textAlign = 'center';
            // Thêm đổ bóng cho text
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 2;
            ctx.fillText('BDU-CM', canvasSize / 2, canvasSize + textSpacing + 10);
        }

        return {
            dataUrl: canvas.toDataURL('image/png', 1.0),
            canvas: canvas
        };
    } catch (error) {
        throw error;
    }
}

// Hàm vẽ hình chữ nhật với góc bo tròn (giữ nguyên)
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

// tải hình ảnh
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

// tạo và lưu mã QR
async function createAndSaveQRCode() {
    const name = document.getElementById("qr-name").value.trim();
    const content = document.getElementById("qr-content").value.trim();
    const color = document.getElementById("qr-color").value;

    if (!name || !content || !currentUser) {
        alert("Vui lòng nhập đầy đủ thông tin được yêu cầu hoặc đăng nhập lại!");
        return;
    }

    if (!validateURL(document.getElementById("qr-content"))) {
        return;
    }

    try {
        const qrRef = ref(database, "qrCodes");
        const newQRCodeRef = push(qrRef);

        // Xây dựng URL chuyển hướng dựa trên URL gốc và ID của mã QR
        const currentPath = window.location.pathname;
        const projectRoot = currentPath.substring(0, currentPath.lastIndexOf('/'));
        const redirectPath = `${projectRoot}/redirect.html`; // Đường dẫn file đích (cố định trên server)
        const redirectURL = `${window.location.origin}${redirectPath}?id=${newQRCodeRef.key}`;

        await set(newQRCodeRef, {
            userId: currentUser.uid,
            name,
            content,
            redirectURL,
            color,
            createdAt: new Date().toISOString()
        });

        resetForm();
        alert("Mã QR được tạo thành công!");
        await loadQRCodes(currentUser.uid);

    } catch (error) {
        alert("Đã xảy ra lỗi khi tạo mã QR!");
    }
}

// load danh sách mã QR
async function loadQRCodes(userId) {
    if (qrCodesListener) {
        qrCodesListener();
    }

    const qrList = document.getElementById("qr-list");
    const qrRef = ref(database, "qrCodes");
    const userQrQuery = query(qrRef, orderByChild("userId"), equalTo(userId));

    qrCodesListener = onValue(userQrQuery, async (snapshot) => {
        qrList.innerHTML = "";
        const data = snapshot.val();

        if (data) {
            const qrArray = Object.entries(data)
                .map(([key, value]) => ({ key, ...value }))
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            for (const qr of qrArray) {
                await renderQRCodeItem(qr, qrList);
            }
        } else {
            qrList.innerHTML = "<p class='text-center text-gray-500'>Chưa có mã QR nào được tạo.</p>";
        }
    });
}

// render mã QR
async function renderQRCodeItem(qr, qrList) {
    const qrItem = document.createElement("li");
    qrItem.className = "qr-item";

    try {
        const qrCode = await generateQRCode({
            content: qr.redirectURL,
            color: qr.color,
            size: 100,
            includeText: false,
            isListItem: true // Thêm flag để chỉ định đây là item trong danh sách
        });

        const img = document.createElement("img");
        img.src = qrCode.dataUrl;
        qrItem.appendChild(img);

        const qrActions = createQRCodeActions(qr);
        qrItem.appendChild(qrActions);
        qrList.appendChild(qrItem);
    } catch (error) {
        //console.error('Error rendering QR code:', error);
    }
}

// button cho mã QR và các thông tin
function createQRCodeActions(qr) {
    // SVG Icons as constants
    const ICONS = {
        download: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>`,
        edit: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>`,
        delete: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            <line x1="10" y1="11" x2="10" y2="17"/>
            <line x1="14" y1="11" x2="14" y2="17"/>
        </svg>`,
        copy: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>`
    };

    const qrActions = document.createElement("div");
    qrActions.className = "qr-actions";

    // Name
    const nameText = document.createElement("p");
    nameText.className = "font-medium text-lg mb-2 text-left";
    nameText.textContent = qr.name;
    qrActions.appendChild(nameText);

    // Date
    const dateText = document.createElement("p");
    dateText.className = "text-sm text-gray-500 mb-2";
    dateText.textContent = `Ngày tạo: ${new Date(qr.createdAt).toLocaleDateString("vi-VN")}`;
    qrActions.appendChild(dateText);

    // Tính số lượng người truy cập và thời gian truy cập lần cuối
    const accessLogs = qr.accessLogs || {};
    const uniqueUsers = Object.keys(accessLogs).length;
    let lastAccess = null;

    // Lấy thời gian truy cập lần cuối
    Object.values(accessLogs).forEach(log => {
        const timestamp = new Date(log.timestamp);
        if (!lastAccess || timestamp > lastAccess) {
            lastAccess = timestamp;
        }
    });

    // Hiển thị thông tin traffic
    const trafficInfo = document.createElement("p");
    trafficInfo.className = "text-sm text-gray-500 mb-2";
    const usersText = uniqueUsers ? `${uniqueUsers} người truy cập` : '0 người truy cập';
    const lastAccessText = lastAccess
        ? `Lần cuối: ${lastAccess.toLocaleString("vi-VN")}`
        : 'Không có thời gian';
    trafficInfo.textContent = `${usersText}, ${lastAccessText}`;
    qrActions.appendChild(trafficInfo);

    // hàm tạo button với icon
    function createButtonWithIcon(label, bgColor, onClick, iconSvg) {
        const button = document.createElement("button");
        button.className = `${bgColor} text-white px-3 py-2 rounded-lg flex items-center gap-2 hover:opacity-90 transition-opacity`;
        button.onclick = onClick;

        // thêm icon
        const iconSpan = document.createElement("span");
        iconSpan.className = "icon";
        iconSpan.innerHTML = iconSvg;

        // thêm text
        const textSpan = document.createElement("span");
        textSpan.textContent = label;

        button.appendChild(iconSpan);
        button.appendChild(textSpan);
        return button;
    }

    // hàm sao chép link
    async function copyQRLink(key) {
        // Lấy đường dẫn hiện tại và xác định đường dẫn gốc của dự án
        const currentPath = window.location.pathname;
        const projectRoot = currentPath.substring(0, currentPath.lastIndexOf('/'));

        // Định nghĩa đường dẫn đích một cách linh hoạt
        const redirectPath = `${projectRoot}/redirect.html`; // Đường dẫn file đích (cố định trên server)
        const link = `${window.location.origin}${redirectPath}?id=${key}`; // Tự động ghép URL gốc với đường dẫn

        try {
            await navigator.clipboard.writeText(link);
            alert('Đã sao chép link thành công!');
        } catch (err) {
            console.error('Không thể sao chép link:', err);
            alert('Không thể sao chép link. Vui lòng thử lại.');
        }
    }


    // Buttons container
    const buttonContainer = document.createElement("div");
    buttonContainer.className = "flex space-x-2 mt-2";

    // Download button with icon
    const downloadButton = createButtonWithIcon(
        "Tải xuống",
        "bg-blue-500",
        () => downloadQRCode(qr),
        ICONS.download
    );

    // Copy link button with icon
    const copyButton = createButtonWithIcon(
        "Copy link",
        "bg-green-500",
        () => copyQRLink(qr.key),
        ICONS.copy
    );

    // Edit button with icon
    const editButton = createButtonWithIcon(
        "Chỉnh sửa",
        "bg-yellow-500",
        () => showEditModal(qr.key, qr.name, qr.content),
        ICONS.edit
    );

    // Delete button with icon
    const deleteButton = createButtonWithIcon(
        "Xóa",
        "bg-red-500",
        () => deleteQRCode(qr.key),
        ICONS.delete
    );

    buttonContainer.append(downloadButton, copyButton, editButton, deleteButton);
    qrActions.appendChild(buttonContainer);

    return qrActions;
}


// Tải mã QR
async function downloadQRCode(qr) {
    try {
        const qrCode = await generateQRCode({
            content: qr.redirectURL,
            name: qr.name,
            color: qr.color,
            margin: 0,
            isListItem: false // Sử dụng kích thước logo mặc định cho bản tải xuống
        });

        const link = document.createElement('a');
        link.href = qrCode.dataUrl;
        link.download = `${qr.name}.png`;
        link.click();
    } catch (error) {
        //console.error("Error downloading QR code:", error);
        alert("Đã xảy ra lỗi khi tải xuống mã QR!");
    }
}

// kiểm tra URL
function validateURL(input) {
    const urlPattern = /^(https?:\/\/)[\w.-]+(\.[\w.-]+)+([/?#].*)?$/;
    const maxLength = 2048; // Giới hạn độ dài URL
    const errorElement = input.id === 'qr-content' ?
        document.getElementById('url-error') :
        document.getElementById('url-error-edit');

    // Kiểm tra nếu URL quá dài
    if (input.value.length > maxLength) {
        input.setCustomValidity(`URL quá dài (tối đa ${maxLength} ký tự)`);
        errorElement.textContent = `URL quá dài (tối đa ${maxLength} ký tự)`;
        errorElement.classList.remove('hidden');
        return false;
    }

    // Kiểm tra nếu không bắt đầu bằng http:// hoặc https://
    if (!input.value.startsWith('http://') && !input.value.startsWith('https://')) {
        input.setCustomValidity('URL phải bắt đầu bằng http:// hoặc https://');
        errorElement.textContent = 'URL phải bắt đầu bằng http:// hoặc https://';
        errorElement.classList.remove('hidden');
        return false;
    }

    // Kiểm tra định dạng URL
    if (!urlPattern.test(input.value)) {
        input.setCustomValidity('Vui lòng nhập đúng định dạng URL');
        errorElement.textContent = 'Vui lòng nhập đúng định dạng URL';
        errorElement.classList.remove('hidden');
        return false;
    }

    // URL hợp lệ
    input.setCustomValidity('');
    errorElement.classList.add('hidden');
    return true;
}


// Edit QR Code
function showEditModal(key, qrName, qrContent) {
    const editModal = document.getElementById("edit-modal");
    document.getElementById("edit-qr-name").value = qrName;
    document.getElementById("edit-qr-content").value = qrContent;
    editModal.dataset.key = key;
    editModal.classList.remove("hidden");
}


function closeEditModal() {
    document.getElementById("edit-modal").classList.add("hidden");
}

//Lưu chỉnh sửa mã QR
async function saveQRCodeEdit() {
    const editModal = document.getElementById("edit-modal");
    const key = editModal.dataset.key;
    const newQrName = document.getElementById("edit-qr-name").value.trim();
    const newQrContent = document.getElementById("edit-qr-content").value.trim();

    if (!newQrName || !newQrContent) {
        alert("Vui lòng nhập tất cả thông tin bắt buộc!");
        return;
    }

    if (!validateURL(document.getElementById("edit-qr-content"))) {
        return;
    }

    try {
        const qrRef = ref(database, `qrCodes/${key}`);
        await update(qrRef, {
            name: newQrName,
            content: newQrContent,
            updatedAt: new Date().toISOString()
        });

        alert("Mã QR được cập nhật thành công!");
        closeEditModal();
    } catch (error) {
        //console.error("Error updating QR code:", error);
        alert("Đã xảy ra lỗi khi cập nhật mã QR!");
    }
}

// Xóa QR Code
async function deleteQRCode(key) {
    if (!confirm("Bạn có chắc chắn muốn xóa mã QR này không?")) {
        return;
    }

    try {
        await set(ref(database, `qrCodes/${key}`), null);
        alert("Đã xóa mã QR thành công!");
        await loadQRCodes(currentUser.uid);

    } catch (error) {
        //console.error("Error deleting QR code:", error);
        alert("Đã xảy ra lỗi khi xóa mã QR.");
    }
}

// Lọc QR Codes
function filterQRCodes() {
    const searchValue = document.getElementById("search-qr").value.toLowerCase();
    const qrItems = document.querySelectorAll("#qr-list .qr-item");

    qrItems.forEach((item) => {
        const name = item.querySelector(".qr-actions p").textContent.toLowerCase();
        item.style.display = name.includes(searchValue) ? "flex" : "none";
    });
}

// đặt lại form
function resetForm() {
    document.getElementById("qr-name").value = "";
    document.getElementById("qr-content").value = "";
    document.getElementById("qr-color").value = "#000000";
}

//đăng nhập
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        const username = user.email.split('@')[0];
        document.getElementById("user-name").textContent = `Xin chào, ${username}`;
        loadQRCodes(user.uid);
    } else {
        window.location.href = "login.html";
    }
});


// lang nghe su kien dang xuat
document.getElementById("logout-btn").addEventListener("click", async () => {
    try {
        await signOut(auth);
        window.location.href = "login.html";
    } catch (error) {
        console.error("Logout failed:", error);
    }
});


// Lắng nghe sự kiện khi người dùng thay đổi màu sắc
document.getElementById('qr-color').addEventListener('input', function (event) {
    // Lấy giá trị màu sắc đã chọn từ input màu
    const selectedColor = event.target.value;

    // Cập nhật màu nền của ô hiển thị màu
    document.getElementById('color-display').style.backgroundColor = selectedColor;
});


// Vô hiệu hóa chuột phải
document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
});

// Vô hiệu hóa phím F12 và DevTools
document.addEventListener('keydown', function (e) {
    if (e.key === "F12" || (e.ctrlKey && e.shiftKey && e.key === "I")) {
        e.preventDefault();
    }
});

// Hướng dẫn sử dụng
document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('firstVisit')) {
        startIntroGuide();
        localStorage.setItem('firstVisit', 'true');
    }
});

function startIntroGuide() {
    const intro = introJs();
    intro.setOptions({
        steps: [
            { intro: "Chào mừng bạn đến với Trình tạo mã QR!" },
            { element: '#qr-name', intro: "Nhập tên gợi nhớ cho mã QR tại đây." },
            { element: '#qr-content', intro: "Nhập nội dung (URL) mà mã QR sẽ liên kết." },
            { element: '#qr-color', intro: "Bạn có thể chọn màu sắc cho mã QR." },
            { element: '#qr-list-container', intro: "Danh sách các mã QR đã tạo sẽ xuất hiện tại đây." }
        ],
        nextLabel: "Tiếp tục",
        prevLabel: "Quay lại",
        doneLabel: "Hoàn thành"
    });
    intro.start();
}

// xuất ra các hàm
window.generateAndSaveQRCode = createAndSaveQRCode;
window.validateURL = validateURL;
window.filterQRCodes = filterQRCodes;
window.closeEditModal = closeEditModal;
window.saveQRCodeEdit = saveQRCodeEdit;
