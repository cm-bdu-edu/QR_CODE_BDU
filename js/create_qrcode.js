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
    name = '',
    color = '#000000',
    size = 400,
    logoSize = 60,
    padding = 5,
    dpi = 4,
    includeText = true,
    logoUrl = './image/Logo.ico',
    isListItem = false
} = {}) {
    try {
        if (!content) {
            throw new Error('Content is required for QR code generation');
        }

        const adjustedLogoSize = isListItem ? size * 0.15 : logoSize;

        // Tạo QR code với padding nhỏ hơn
        const qrDataUrl = await QRCode.toDataURL(content, {
            width: size,
            margin: 1,
            color: {
                dark: color,
                light: '#ffffff'
            }
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Điều chỉnh kích thước canvas và khoảng cách text
        const textHeight = includeText ? 10 : 0; // Tăng chiều cao phần text
        const textSpacing = 15; // Thêm khoảng cách giữa QR và text
        const canvasSize = size + (padding * 2);

        canvas.width = canvasSize * dpi;
        canvas.height = (canvasSize + textHeight + textSpacing) * dpi;
        ctx.scale(dpi, dpi);

        // Vẽ background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasSize, canvasSize + textHeight + textSpacing);

        // Vẽ QR code
        const qrImage = await loadImage(qrDataUrl);
        ctx.drawImage(qrImage, padding, padding, size, size);

        // Vẽ logo nếu có
        if (logoUrl) {
            const logoImage = await loadImage(logoUrl);
            const logoX = (size - adjustedLogoSize) / 2 + padding;
            const logoY = (size - adjustedLogoSize) / 2 + padding;
            ctx.drawImage(logoImage, logoX, logoY, adjustedLogoSize, adjustedLogoSize);
        }

        // Vẽ text với khoảng cách đã điều chỉnh
        if (includeText) {
            ctx.font = 'bold 20px Arial';
            ctx.fillStyle = '#d32f2f';
            ctx.textAlign = 'center';
            // Điều chỉnh vị trí text, thêm textSpacing để tạo khoảng cách
            ctx.fillText('BDU-CM', canvasSize / 2, canvasSize + textSpacing);
        }

        return {
            dataUrl: canvas.toDataURL('image/png', 1.0),
            canvas: canvas
        };
    } catch (error) {
        console.error('Error generating QR code:', error);
        throw error;
    }
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
        const redirectURL = `${window.location.origin}/QR_CODE_BDU/redirect.html?id=${newQRCodeRef.key}`;

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
        console.error("Error creating QR code:", error);
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
        console.error('Error rendering QR code:', error);
    }
}

// button cho mã QR
// function createQRCodeActions(qr) {
//     const qrActions = document.createElement("div");
//     qrActions.className = "qr-actions";

//     // Name
//     const nameText = document.createElement("p");
//     nameText.className = "font-medium text-lg mb-2 text-left";
//     nameText.textContent = qr.name;
//     qrActions.appendChild(nameText);

//     // Date
//     const dateText = document.createElement("p");
//     dateText.className = "text-sm text-gray-500 mb-2";
//     dateText.textContent = `Ngày tạo: ${new Date(qr.createdAt).toLocaleDateString()}`;
//     qrActions.appendChild(dateText);

//     // Buttons
//     const buttonContainer = document.createElement("div");
//     buttonContainer.className = "flex space-x-2 mt-2";

//     // Download button
//     const downloadButton = createButton("Tải xuống", "bg-blue-500", () =>
//         downloadQRCode(qr));

//     // Edit button
//     const editButton = createButton("Chỉnh sửa", "bg-yellow-500", () =>
//         showEditModal(qr.key, qr.name, qr.content));

//     // Delete button
//     const deleteButton = createButton("Xóa", "bg-red-500", () =>
//         deleteQRCode(qr.key));

//     buttonContainer.append(downloadButton, editButton, deleteButton);
//     qrActions.appendChild(buttonContainer);

//     return qrActions;
// }

function createQRCodeActions(qr) {
    console.log("DỮ LIỆU NHẬN TRONG createQRCodeActions:", qr);

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
    const uniqueUsers = Object.keys(accessLogs).length; // Số lượng truy cập duy nhất
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

    // Buttons (Tạo các nút nếu cần)
    const buttonContainer = document.createElement("div");
    buttonContainer.className = "flex space-x-2 mt-2";

    // Download button
    const downloadButton = createButton("Tải xuống", "bg-blue-500", () =>
        downloadQRCode(qr));

    // Edit button
    const editButton = createButton("Chỉnh sửa", "bg-yellow-500", () =>
        showEditModal(qr.key, qr.name, qr.content));

    // Delete button
    const deleteButton = createButton("Xóa", "bg-red-500", () =>
        deleteQRCode(qr.key));

    buttonContainer.append(downloadButton, editButton, deleteButton);
    qrActions.appendChild(buttonContainer);

    return qrActions;
}



function createButton(text, className, onClick) {
    const button = document.createElement("button");
    button.className = `${className} hover:${className.replace('500', '600')} text-white px-4 py-2 rounded`;
    button.textContent = text;
    button.onclick = onClick;
    return button;
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
        console.error("Error downloading QR code:", error);
        alert("Đã xảy ra lỗi khi tải xuống mã QR!");
    }
}

// URL Validation
function validateURL(input) {
    const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
    const errorElement = input.id === 'qr-content' ?
        document.getElementById('url-error') :
        document.getElementById('url-error-edit');

    if (!input.value.startsWith('http://') && !input.value.startsWith('https://')) {
        input.setCustomValidity('URL must start with http:// or https://');
        errorElement.classList.remove('hidden');
        return false;
    }

    if (!urlPattern.test(input.value)) {
        input.setCustomValidity('Please enter a valid URL format');
        errorElement.classList.remove('hidden');
        return false;
    }

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
        alert("Please enter all required information!");
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
        console.error("Error updating QR code:", error);
        alert("Đã xảy ra lỗi khi cập nhật mã QR!");
    }
}

// Delete QR Code
async function deleteQRCode(key) {
    if (!confirm("Bạn có chắc chắn muốn xóa mã QR này không?")) {
        return;
    }

    try {
        await set(ref(database, `qrCodes/${key}`), null);
        alert("Đã xóa mã QR thành công!");
        await loadQRCodes(currentUser.uid);

    } catch (error) {
        console.error("Error deleting QR code:", error);
        alert("Đã xảy ra lỗi khi xóa mã QR.");
    }
}

// Filter QR Codes
function filterQRCodes() {
    const searchValue = document.getElementById("search-qr").value.toLowerCase();
    const qrItems = document.querySelectorAll("#qr-list .qr-item");

    qrItems.forEach((item) => {
        const name = item.querySelector(".qr-actions p").textContent.toLowerCase();
        item.style.display = name.includes(searchValue) ? "flex" : "none";
    });
}

// Utility Functions
function resetForm() {
    document.getElementById("qr-name").value = "";
    document.getElementById("qr-content").value = "";
    document.getElementById("qr-color").value = "#000000";
}

// Authentication Management
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


// Event Listeners
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



// Gọi hàm loadTrafficData khi tải trang
// onAuthStateChanged(auth, (user) => {
//     if (user) {
//         loadTrafficData(user.uid);
//         loadQRCodes(user.uid);
//     }
// });

// Export functions for global access
window.generateAndSaveQRCode = createAndSaveQRCode;
window.validateURL = validateURL;
window.filterQRCodes = filterQRCodes;
window.closeEditModal = closeEditModal;
window.saveQRCodeEdit = saveQRCodeEdit;

