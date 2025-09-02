// --- ۱. ثابت‌ها و متغیرهای سراسری ---
const REPO_OWNER = 'YOUR_GITHUB_USERNAME'; // نام کاربری GitHub خود را اینجا وارد کنید
const REPO_NAME = 'YOUR_REPO_NAME'; // نام ریپازیتوری خود را اینجا وارد کنید (مثال: my-blog-data)
const POSTS_FILE = 'posts.json';
const FEEDBACKS_FILE = 'feedbacks.json';
const SCRIPTS_FILE = 'scripts.json';

// !!! هشدار امنیتی: این رمز عبور در کد قابل مشاهده است و برای پروژه واقعی مناسب نیست !!!
const CORRECT_PASS = 'admin123'; // رمز عبور دلخواه خود را اینجا قرار دهید

let githubToken = localStorage.getItem('githubToken') || '';
let loggedIn = localStorage.getItem('loggedIn') === 'true';
let currentEditingScriptSha = null; // برای ویرایش اسکریپت
let currentEditingScriptId = null; // برای ویرایش اسکریپت
let currentEditingPostSha = null; // برای ویرایش پست

// --- ۲. انتخابگرهای DOM ---
const loginSection = document.getElementById('login-section');
const mainContent = document.getElementById('main-content');
const sidebar = document.getElementById('sidebar');

const loginForm = document.getElementById('loginForm');
const passwordInput = document.getElementById('password');
const githubTokenInput = document.getElementById('githubTokenInput');
const logoutBtn = document.getElementById('logoutBtn');

const postsSection = document.getElementById('posts-section');
const addPostForm = document.getElementById('addPostForm');
const postTitleInput = document.getElementById('postTitle');
const postContentInput = document.getElementById('postContent');
const postsList = document.getElementById('postsList');
const addPostBtn = document.getElementById('addPostBtn'); // دکمه افزودن/به روزرسانی پست
const editingPostShaInput = document.getElementById('editingPostSha'); // فیلد مخفی برای SHA پست در حال ویرایش

const feedbacksSection = document.getElementById('feedbacks-section');
const feedbacksList = document.getElementById('feedbacksList');
const unreadFeedbackCount = document.getElementById('unread-feedback-count');

const scriptsSection = document.getElementById('scripts-section');
const addScriptForm = document.getElementById('addScriptForm');
const scriptNameInput = document.getElementById('scriptName');
const scriptContentInput = document.getElementById('scriptContent');
const scriptsList = document.getElementById('scriptsList');
const addScriptBtn = document.getElementById('addScriptBtn'); // دکمه افزودن/به روزرسانی اسکریپت
const editingScriptShaInput = document.getElementById('editingScriptSha'); // فیلد مخفی برای SHA اسکریپت در حال ویرایش
const editingScriptIdInput = document.getElementById('editingScriptId'); // فیلد مخفی برای ID اسکریپت در حال ویرایش

const notificationContainer = document.getElementById('notification-container');
const loadingSpinner = document.getElementById('loading-spinner');

// --- ۳. توابع کمکی UI ---

/**
 * نمایش نوتیفیکیشن موفقیت، خطا یا اطلاعات.
 * @param {string} message - متن پیام.
 * @param {'success'|'error'|'info'} type - نوع پیام.
 */
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.classList.add('notification', type);
    notification.textContent = message;
    notificationContainer.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 5000); // پیام بعد از ۵ ثانیه محو می‌شود
}

/**
 * نمایش اسپینر لودینگ.
 */
function showLoading() {
    loadingSpinner.style.display = 'flex';
}

/**
 * پنهان کردن اسپینر لودینگ.
 */
function hideLoading() {
    loadingSpinner.style.display = 'none';
}

/**
 * تغییر بخش فعال در پنل مدیریت.
 * @param {string} sectionId - ID بخش مورد نظر (مثال: 'posts').
 */
function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(`${sectionId}-section`).classList.add('active');

    // هایلایت کردن لینک فعال در نوار کناری
    document.querySelectorAll('.sidebar nav ul li a').forEach(link => {
        link.classList.remove('active');
    });
    const activeLink = document.querySelector(`.sidebar nav ul li a[data-section="${sectionId}"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }

    // رندر کردن محتوای بخش فعال
    if (sectionId === 'posts') {
        renderPostsSection();
    } else if (sectionId === 'feedbacks') {
        renderFeedbacksSection();
    } else if (sectionId === 'scripts') {
        renderScriptsSection();
    }
}

// --- ۴. توابع احراز هویت ---

/**
 * ورود به پنل مدیریت.
 */
async function login(e) {
    e.preventDefault();
    showLoading();
    const password = passwordInput.value;
    const token = githubTokenInput.value;

    if (password === CORRECT_PASS && token) {
        localStorage.setItem('githubToken', token);
        localStorage.setItem('loggedIn', 'true');
        githubToken = token;
        loggedIn = true;
        initAdminPanel();
        showNotification('با موفقیت وارد شدید!', 'success');
    } else {
        showNotification('رمز عبور یا توکن GitHub اشتباه است.', 'error');
    }
    hideLoading();
}

/**
 * خروج از پنل مدیریت.
 */
function logout() {
    localStorage.removeItem('githubToken');
    localStorage.removeItem('loggedIn');
    githubToken = '';
    loggedIn = false;
    loginSection.classList.add('active');
    mainContent.style.display = 'none';
    sidebar.style.display = 'none';
    showNotification('با موفقیت خارج شدید.', 'info');
}

// --- ۵. توابع GitHub API Helper ---

/**
 * ساخت هدرهای لازم برای درخواست‌های GitHub API.
 * @returns {Headers}
 */
function getGitHubHeaders() {
    return {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
    };
}

/**
 * دریافت محتوای یک فایل از ریپازیتوری GitHub.
 * @param {string} filePath - مسیر فایل (مثال: 'posts.json').
 * @returns {Promise<{content: Array|Object, sha: string}>}
 */
async function fetchGitHubFile(filePath) {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`;
    try {
        const response = await fetch(url, { headers: getGitHubHeaders() });
        if (!response.ok) {
            if (response.status === 404) {
                // اگر فایل وجود نداشت، یک آرایه خالی و SHA null برگردان
                return { content: [], sha: null };
            }
            throw new Error(`GitHub API error: ${response.statusText}`);
        }
              const data = await response.json();
        const content = JSON.parse(atob(data.content)); // Base64 decode and parse JSON
        return { content, sha: data.sha };
    } catch (error) {
        console.error(`Error fetching ${filePath}:`, error);
        showNotification(`خطا در دریافت فایل ${filePath}. ${error.message}`, 'error');
        return { content: [], sha: null };
    }
}

/**
 * به‌روزرسانی محتوای یک فایل در ریپازیتوری GitHub.
 * @param {string} filePath - مسیر فایل.
 * @param {Array|Object} newContent - محتوای جدید برای فایل.
 * @param {string} message - پیام کامیت.
 * @param {string} sha - SHA فعلی فایل.
 */
async function updateGitHubFile(filePath, newContent, message, sha) {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`;
    const contentEncoded = btoa(JSON.stringify(newContent, null, 2)); // Base64 encode and stringify

    const body = {
        message: message,
        content: contentEncoded,
        sha: sha
    };

    try {
        const response = await fetch(url, {
            method: 'PUT',
            headers: getGitHubHeaders(),
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.statusText}`);
        }
        const data = await response.json();
        showNotification(`فایل ${filePath} با موفقیت به‌روزرسانی شد.`, 'success');
        return data.content.sha; // برگرداندن SHA جدید
    } catch (error) {
        console.error(`Error updating ${filePath}:`, error);
        showNotification(`خطا در به‌روزرسانی فایل ${filePath}. ${error.message}`, 'error');
        return null;
    }
}

/**
 * حذف یک فایل از ریپازیتوری GitHub.
 * @param {string} filePath - مسیر فایل.
 * @param {string} message - پیام کامیت.
 * @param {string} sha - SHA فعلی فایل.
 */
async function deleteGitHubFile(filePath, message, sha) {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`;
    const body = {
        message: message,
        sha: sha
    };

    try {
        const response = await fetch(url, {
            method: 'DELETE',
            headers: getGitHubHeaders(),
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.statusText}`);
        }
        showNotification(`فایل ${filePath} با موفقیت حذف شد.`, 'success');
        return true;
    } catch (error) {
        console.error(`Error deleting ${filePath}:`, error);
        showNotification(`خطا در حذف فایل ${filePath}. ${error.message}`, 'error');
        return false;
    }
}

// --- ۶. توابع مدیریت پست‌ها ---

/**
 * رندر کردن لیست پست‌ها.
 */
async function renderPostsSection() {
    showLoading();
    const { content: posts, sha: postsSha } = await fetchGitHubFile(POSTS_FILE);
    hideLoading();

    postsList.innerHTML = '';
    if (posts.length === 0) {
        postsList.innerHTML = '<p>هیچ پستی یافت نشد.</p>';
        return;
    }

    posts.forEach(post => {
        const li = document.createElement('li');
        li.innerHTML = `
            <h4>${post.title}</h4>
            <p>${post.content.substring(0, 150)}...</p>
            <div class="actions">
                <button class="edit-btn" data-id="${post.id}"><i class="fas fa-edit"></i> ویرایش</button>
                <button class="delete-btn" data-id="${post.id}"><i class="fas fa-trash-alt"></i> حذف</button>
            </div>
        `;
        postsList.appendChild(li);
    });

    // اضافه کردن شنونده‌های رویداد برای دکمه‌های ویرایش و حذف
    postsList.querySelectorAll('.edit-btn').forEach(btn => {        btn.addEventListener('click', () => editPost(btn.dataset.id, posts, postsSha));
    });
    postsList.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deletePost(btn.dataset.id, posts, postsSha));
    });
}

/**
 * افزودن یا به‌روزرسانی یک پست.
 */
addPostForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading();

    const title = postTitleInput.value;
    const content = postContentInput.value;

    const { content: posts, sha: postsSha } = await fetchGitHubFile(POSTS_FILE);
    let newPosts = [...posts];

    if (currentEditingPostSha) { // حالت ویرایش
        const postIndex = newPosts.findIndex(p => p.id === editingPostShaInput.value); // استفاده از id برای یافتن پست
        if (postIndex !== -1) {
            newPosts[postIndex] = { ...newPosts[postIndex], title, content };
        }
        currentEditingPostSha = null;
        editingPostShaInput.value = '';
        addPostBtn.textContent = 'افزودن/به‌روزرسانی پست';
    } else { // حالت افزودن
        const newPost = {
            id: Date.now().toString(), // یک ID منحصر به فرد ساده
            title,
            content,
            date: new Date().toISOString()
        };
        newPosts.push(newPost);
    }

    const newSha = await updateGitHubFile(POSTS_FILE, newPosts, `Update post ${title}`, postsSha);
    if (newSha) {
        postTitleInput.value = '';
        postContentInput.value = '';
        renderPostsSection();
    }
    hideLoading();
});

/**
 * بارگذاری اطلاعات یک پست برای ویرایش.
 * @param {string} postId - ID پست مورد نظر.
 * @param {Array} posts - لیست فعلی پست‌ها.
 * @param {string} postsSha - SHA فعلی فایل posts.json.
 */
function editPost(postId, posts, postsSha) {
    const postToEdit = posts.find(p => p.id === postId);
    if (postToEdit) {
        postTitleInput.value = postToEdit.title;
        postContentInput.value = postToEdit.content;
        editingPostShaInput.value = postId; // ذخیره ID پست در حال ویرایش
        currentEditingPostSha = postsSha; // ذخیره SHA فایل برای به‌روزرسانی
        addPostBtn.textContent = 'ذخیره تغییرات پست';
    }
}

/**
 * حذف یک پست.
 * @param {string} postId - ID پست مورد نظر.
 * @param {Array} posts - لیست فعلی پست‌ها.
 * @param {string} postsSha - SHA فعلی فایل posts.json.
 */
async function deletePost(postId, posts, postsSha) {
    if (!confirm('آیا از حذف این پست مطمئن هستید؟')) {
        return;
    }
    showLoading();
    const newPosts = posts.filter(post => post.id !== postId);
    const newSha = await updateGitHubFile(POSTS_FILE, newPosts, `Delete post ${postId}`, postsSha);
    if (newSha) {
        renderPostsSection();
    }
    hideLoading();
}

// --- ۷. توابع مدیریت بازخوردها ---

/**
 * رندر کردن لیست بازخوردها.
 */
async function renderFeedbacksSection() {
    showLoading();
    const { content: feedbacks, sha: feedbacksSha } = await fetchGitHubFile(FEEDBACKS_FILE);
    hideLoading();

    feedbacksList.innerHTML = '';
    if (feedbacks.length === 0) {
        feedbacksList.innerHTML = '<p>هیچ بازخوردی یافت نشد.</p>';
        unreadFeedbackCount.textContent = '';
        return;
    }

    let unreadCount = 0;
    feedbacks.forEach(feedback => {
        if (!feedback.read) {
            unreadCount++;
        }

        const li = document.createElement('li');
        li.classList.add('feedback-item');
        if (feedback.read) {
            li.classList.add('feedback-read');
        }

        // پاکسازی محتوای بازخورد و پاسخ با DOMPurify برای جلوگیری از XSS
        const sanitizedText = DOMPurify.sanitize(feedback.text);
        const sanitizedReply = feedback.reply ? DOMPurify.sanitize(feedback.reply) : '';

        li.innerHTML = `            <h4>بازخورد از: ${feedback.name} (${feedback.email})</h4>
            <p><strong>تاریخ:</strong> ${new Date(feedback.date).toLocaleString('fa-IR')}</p>
            <p><strong>متن:</strong> ${sanitizedText}</p>
            ${sanitizedReply ? `<div class="feedback-reply"><strong>پاسخ:</strong> ${sanitizedReply}</div>` : ''}
            <div class="actions">
                <button class="reply-btn" data-id="${feedback.id}"><i class="fas fa-reply"></i> پاسخ</button>
                <button class="delete-btn" data-id="${feedback.id}"><i class="fas fa-trash-alt"></i> حذف</button>
                <button class="mark-read-btn ${feedback.read ? 'mark-unread-btn' : ''}" data-id="${feedback.id}">
                    ${feedback.read ? '<i class="fas fa-envelope-open"></i> علامت‌گذاری به عنوان نخوانده' : '<i class="fas fa-envelope"></i> علامت‌گذاری به عنوان خوانده شده'}
                </button>
            </div>
            <form class="feedback-reply-form" style="display:none;" data-id="${feedback.id}">
                <textarea placeholder="پاسخ خود را بنویسید..." rows="3"></textarea>
                <button type="submit">ارسال پاسخ</button>
            </form>
        `;
        feedbacksList.appendChild(li);
    });

    unreadFeedbackCount.textContent = unreadCount > 0 ? unreadCount : '';

    // اضافه کردن شنونده‌های رویداد
    feedbacksList.querySelectorAll('.reply-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const form = feedbacksList.querySelector(`.feedback-reply-form[data-id="${btn.dataset.id}"]`);
            if (form) {
                form.style.display = form.style.display === 'none' ? 'block' : 'none';
            }
            // اگر بازخورد نخوانده بود، آن را به عنوان خوانده شده علامت‌گذاری کن
            const feedbackItem = feedbacks.find(f => f.id === btn.dataset.id);
            if (feedbackItem && !feedbackItem.read) {
                toggleFeedbackReadStatus(btn.dataset.id, feedbacks, feedbacksSha, true); // true = mark as read
            }
        });
    });

    feedbacksList.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteFeedback(btn.dataset.id, feedbacks, feedbacksSha));
    });

    feedbacksList.querySelectorAll('.mark-read-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const feedbackItem = feedbacks.find(f => f.id === btn.dataset.id);
            if (feedbackItem) {
                toggleFeedbackReadStatus(btn.dataset.id, feedbacks, feedbacksSha, !feedbackItem.read);
            }
        });
    });

    feedbacksList.querySelectorAll('.feedback-reply-form').forEach(form => {
        form.addEventListener('submit', (e) => replyToFeedback(e, form.dataset.id, feedbacks, feedbacksSha));
    });
}

/**
 * پاسخ دادن به یک بازخورد.
 */
async function replyToFeedback(e, feedbackId, feedbacks, feedbacksSha) {
    e.preventDefault();
    showLoading();
    const replyTextarea = e.target.querySelector('textarea');
    const reply = replyTextarea.value;

    const feedbackIndex = feedbacks.findIndex(f => f.id === feedbackId);
    if (feedbackIndex !== -1) {
        feedbacks[feedbackIndex].reply = reply;
        feedbacks[feedbackIndex].read = true; // بعد از پاسخ دادن، به عنوان خوانده شده علامت‌گذاری شود
        const newSha = await updateGitHubFile(FEEDBACKS_FILE, feedbacks, `Reply to feedback ${feedbackId}`, feedbacksSha);
        if (newSha) {
            replyTextarea.value = '';
            e.target.style.display = 'none'; // مخفی کردن فرم پاسخ
            renderFeedbacksSection();
        }
    }
    hideLoading();
}

/**
 * حذف یک بازخورد.
 */async function deleteFeedback(feedbackId, feedbacks, feedbacksSha) {
    if (!confirm('آیا از حذف این بازخورد مطمئن هستید؟')) {
        return;
    }
    showLoading();
    const newFeedbacks = feedbacks.filter(feedback => feedback.id !== feedbackId);
    const newSha = await updateGitHubFile(FEEDBACKS_FILE, newFeedbacks, `Delete feedback ${feedbackId}`, feedbacksSha);
    if (newSha) {
        renderFeedbacksSection();
    }
    hideLoading();
}

/**
 * تغییر وضعیت خوانده شده/نخوانده شده یک بازخورد.
 * @param {string} feedbackId - ID بازخورد.
 * @param {Array} feedbacks - لیست فعلی بازخوردها.
 * @param {string} feedbacksSha - SHA فعلی فایل feedbacks.json.
 * @param {boolean} newStatus - وضعیت جدید (true برای خوانده شده، false برای نخوانده).
 */
async function toggleFeedbackReadStatus(feedbackId, feedbacks, feedbacksSha, newStatus) {
    showLoading();
    const feedbackIndex = feedbacks.findIndex(f => f.id === feedbackId);
    if (feedbackIndex !== -1) {
        feedbacks[feedbackIndex].read = newStatus;
        const message = newStatus ? `Mark feedback ${feedbackId} as read` : `Mark feedback ${feedbackId} as unread`;
        const newSha = await updateGitHubFile(FEEDBACKS_FILE, feedbacks, message, feedbacksSha);
        if (newSha) {
            renderFeedbacksSection();
        }
    }
    hideLoading();
}

// --- ۸. توابع مدیریت اسکریپت‌ها ---

/**
 * رندر کردن لیست اسکریپت‌ها.
 */
async function renderScriptsSection() {
    showLoading();
    const { content: scripts, sha: scriptsSha } = await fetchGitHubFile(SCRIPTS_FILE);
    hideLoading();

    scriptsList.innerHTML = '';
    if (scripts.length === 0) {
        scriptsList.innerHTML = '<p>هیچ اسکریپتی یافت نشد.</p>';
        return;
    }

    scripts.forEach(script => {
        const li = document.createElement('li');
        li.innerHTML = `
            <h4>${script.name}</h4>
            <p>${script.content.substring(0, 100)}...</p>
            <div class="actions">
                <button class="edit-btn" data-id="${script.id}"><i class="fas fa-edit"></i> ویرایش</button>
                <button class="delete-btn" data-id="${script.id}"><i class="fas fa-trash-alt"></i> حذف</button>
            </div>
        `;
        scriptsList.appendChild(li);
    });

    // اضافه کردن شنونده‌های رویداد
    scriptsList.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => editScript(btn.dataset.id, scripts, scriptsSha));
    });
    scriptsList.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteScript(btn.dataset.id, scripts, scriptsSha));
    });
}

/**
 * افزودن یا به‌روزرسانی یک اسکریپت.
 */
addScriptForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading();

    const name = scriptNameInput.value;
    const content = scriptContentInput.value;

    const { content: scripts, sha: scriptsSha } = await fetchGitHubFile(SCRIPTS_FILE);
    let newScripts = [...scripts];

    if (currentEditingScriptId) { // حالت ویرایش
        const scriptIndex = newScripts.findIndex(s => s.id === currentEditingScriptId);
        if (scriptIndex !== -1) {
            newScripts[scriptIndex] = { ...newScripts[scriptIndex], name, content };
        }
        currentEditingScriptId = null;
        editingScriptIdInput.value = '';
        currentEditingScriptSha = null; // SHA فایل
        editingScriptShaInput.value = ''; // SHA فایل
        addScriptBtn.textContent = 'افزودن/به‌روزرسانی اسکریپت';
    } else { // حالت افزودن
        const newScript = {
            id: Date.now().toString(), // یک ID منحصر به فرد ساده
            name,
            content
        };
        newScripts.push(newScript);
    }
      const newSha = await updateGitHubFile(SCRIPTS_FILE, newScripts, `Update script ${name}`, scriptsSha);
    if (newSha) {
        scriptNameInput.value = '';
        scriptContentInput.value = '';
        renderScriptsSection();
    }
    hideLoading();
});

/**
 * بارگذاری اطلاعات یک اسکریپت برای ویرایش.
 * @param {string} scriptId - ID اسکریپت مورد نظر.
 * @param {Array} scripts - لیست فعلی اسکریپت‌ها.
 * @param {string} scriptsSha - SHA فعلی فایل scripts.json.
 */
function editScript(scriptId, scripts, scriptsSha) {
    const scriptToEdit = scripts.find(s => s.id === scriptId);
    if (scriptToEdit) {
        scriptNameInput.value = scriptToEdit.name;
        scriptContentInput.value = scriptToEdit.content;
        editingScriptIdInput.value = scriptId; // ذخیره ID اسکریپت در حال ویرایش
        editingScriptShaInput.value = scriptsSha; // ذخیره SHA فایل برای به‌روزرسانی
        currentEditingScriptId = scriptId;
        currentEditingScriptSha = scriptsSha;
        addScriptBtn.textContent = 'ذخیره تغییرات اسکریپت';
    }
}

/**
 * حذف یک اسکریپت.
 * @param {string} scriptId - ID اسکریپت مورد نظر.
 * @param {Array} scripts - لیست فعلی اسکریپت‌ها.
 * @param {string} scriptsSha - SHA فعلی فایل scripts.json.
 */
async function deleteScript(scriptId, scripts, scriptsSha) {
    if (!confirm('آیا از حذف این اسکریپت مطمئن هستید؟')) {
        return;
    }
    showLoading();
    const newScripts = scripts.filter(script => script.id !== scriptId);
    const newSha = await updateGitHubFile(SCRIPTS_FILE, newScripts, `Delete script ${scriptId}`, scriptsSha);
    if (newSha) {
        renderScriptsSection();
    }
    hideLoading();
}

// --- ۹. توابع راه‌اندازی و شنونده‌های رویداد عمومی ---

/**
 * راه‌اندازی پنل مدیریت بعد از ورود موفق.
 */
function initAdminPanel() {
    loginSection.classList.remove('active');
    mainContent.style.display = 'flex'; // تغییر به flex برای نمایش صحیح
    sidebar.style.display = 'flex'; // نمایش sidebar
    githubTokenInput.value = ''; // پاک کردن توکن از فیلد
    passwordInput.value = ''; // پاک کردن رمز عبور

    showSection('posts'); // نمایش پیش‌فرض بخش پست‌ها
}

// شنونده‌های رویداد
loginForm.addEventListener('submit', login);
logoutBtn.addEventListener('click', logout);

// شنونده‌های رویداد برای ناوبری در نوار کناری
document.querySelectorAll('.sidebar nav ul li a').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const sectionId = e.target.closest('a').dataset.section; // استفاده از closest برای اطمینان از گرفتن تگ <a>
        showSection(sectionId);
    });
});

// بررسی وضعیت ورود در هنگام بارگذاری صفحه
document.addEventListener('DOMContentLoaded', () => {
    if (loggedIn && githubToken) {
        initAdminPanel();
    } else {
        loginSection.classList.add('active');
        mainContent.style.display = 'none';
        sidebar.style.display = 'none';
        // اگر توکن قبلاً ذخیره شده بود، آن را در فیلد نمایش بده
        if (githubToken) {
            githubTokenInput.value = githubToken;
        }
    }
});
