// ============================================================================
// Admin Operations Management System — script.js
// Phase 1: Login + App Shell (نظام دخول مخصص عبر RPC + JWT — راجع القسم 10 في database/schema.sql)
// Phase 2: Vehicles Module (list, search/filter/pagination, details, add/edit)
// لا يوجد أي بيانات وهمية أو مستخدمين تجريبيين في أي جزء من هذا الملف.
//
// ⚠️ ملاحظة للغة: كل نص عربي في هذا الملف (رسائل واجهة، تعليقات كود) يجب أن
// يكون بالفصحى (Modern Standard Arabic) وليس بالعامية المصرية. عند إضافة أو
// تعديل أي نص عربي مستقبلاً، تجنّب كلمات مثل: مش، ده/دي/دول، اللي، بس، عشان،
// لازم، بيXXX/هيXXX/اتXXX، عايز/عاوز، خالص، أوي، كده، لسه، دلوقتي، النهارده،
// حصل (استخدم "حدث")، فيه (استخدم "يوجد/توجد" عند الإسناد الفعلي)، تاني
// (استخدم "مرة أخرى"). راجع الفصحى المقابلة قبل الحفظ.
//
// ---- مراجعة شاملة (Full Audit) — ملخص الأخطاء التي تم اكتشافها وإصلاحها ----
// 1) لوحة الرئيسية (loadDashboardStats): كانت الاستعلامات التلاتة الموازية
//    (السيارات/الوقود/المصروفات) من غير أي فحص لـ error — لو أي استعلام فشل
//    بصمت، كانت البطاقات تعرض "0" مضلّلًا يتعارض مع الأرقام الحقيقية في
//    الصفحات نفسها. أُصلح: أصبح هناك console.error + رسالة "تعذر التحميل"
//    واضحة بدل الصفر الصامت.
// 2) كل فورمات الحفظ وأزرار التأكيد (سيارة/وقود/صندوق/مصروف/موظف/إلغاء
//    (Void)/إغلاق صندوق/تغيير دور) كانت من غير try/catch — لو الإنترنت
//    انقطع أثناء الحفظ وحصل استثناء غير متوقع (وليس خطأ Supabase عاديًا)، كان
//    الزر يظل عالقًا على "جارٍ الحفظ..." للأبد. أُصلح: أصبحت كل هذه المعالجات
//    مغلّفة بـ try/catch/finally تضمن رجوع الزر للعمل دائمًا مع
//    رسالة خطأ واضحة.
// 3) زر تفعيل/تعطيل الموظف (toggleEmployeeActive) كان من غير تعطيل
//    للزر أثناء التنفيذ (Double-submit protection) — أُصلح بإضافة تعطيل
//    مؤقت + try/catch. (لاحقًا تم استبدال تدفق تغيير دور الحساب بنموذج
//    تعديل كامل — راجع قسم 13.1b.)
// 4) استعلامات صامتة الفشل من غير أي console.error (تقرير البيتي كاش،
//    تفاصيل الصندوق، فلاتر سجل العمليات، البحث الشامل، فتح سيارة من نتيجة
//    بحث) — أُضيف لها تسجيل الخطأ في الـ Console على الأقل حتى تبقى قابلة
//    للتشخيص، وبعضها بقى يعرض رسالة خطأ للمستخدم بدل نتيجة فارغة مضلّلة.
// 5) الصلاحيات (RLS + UI) رُوجعت بالكامل: كل زر إضافة/تعديل/إلغاء متأكد
//    إنه مربوط بـ RLS حقيقي في قاعدة البيانات (غير فقط إخفاء واجهة)، وصفحة
//    المستخدمين محمية على مستوى navigateTo() نفسه غير فقط إخفاء رابط
//    الـ Sidebar — لم يتم العثور على أي ثغرة صلاحيات.
// ----------------------------------------------------------------------------
// ============================================================================

// ----------------------------------------------------------------------------
// حالة عامة (Global State)
// ----------------------------------------------------------------------------
// نظام دخول مخصص بالكامل (RPC + JWT موقّع يدويًا — راجع القسم 10 في
// database/schema.sql)، غير Supabase Auth. currentAuthUser بشكل { id }
// بسيط فقط (بديل خفيف لكائن Supabase Auth القديم) حتى باقي الكود التي
// يُستخدم currentAuthUser.id (created_by/voided_by/assigned_by) يفضل شغّال
// من غير أي تغيير.
let currentAuthUser = null; // { id } فقط — هوية المستخدم الحالي
let currentProfile = null; // صف profiles الخاص بالمستخدم (full_name, role, is_active, ...)
let sessionToken = null; // توكن JWT الموقّع من login_attempt
let sessionExpiresAt = null; // Date.now() timestamp (ms) لانتهاء الجلسة
const SESSION_STORAGE_KEY = "aos_session_v1";

// ============================================================================
// 1. عناصر تسجيل الدخول / #app-shell
// ============================================================================

const loginPage = document.getElementById("login-page");
const appShell = document.getElementById("app-shell");

const loginForm = document.getElementById("login-form");
const loginButton = document.getElementById("login-button");
const errorBox = document.getElementById("login-error");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

const welcomeMessage = document.getElementById("welcome-message");
const welcomeAvatar = document.getElementById("welcome-avatar");
const logoutButton = document.getElementById("logout-button");
const pageTitleEl = document.getElementById("page-title");
const topbarUserName = document.getElementById("topbar-user-name");
const topbarUserRole = document.getElementById("topbar-user-role");
const topbarUserAvatar = document.getElementById("topbar-user-avatar");
const topbarUserTrigger = document.getElementById("topbar-user-trigger");
const topbarUserMenu = document.getElementById("topbar-user-menu");

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.textContent = "";
  errorBox.hidden = true;
}

function setLoading(isLoading) {
  loginButton.disabled = isLoading;
  loginButton.classList.toggle("is-loading", isLoading);
}

function roleLabel(role) {
  if (role === "super_admin") return "مدير النظام";
  if (role === "admin") return "أدمن";
  if (role === "it_support") return "دعم تقني";
  return "مدير";
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// ---------------------------------------------------------------------------
// مكتبة أيقونات SVG داخلية — بنفس أسلوب الأيقونات الموجودة أصلًا في
// السايدبار (Heroicons-style: viewBox 24×24، stroke-width 2، حواف
// مدوّرة)، بدل أي مكتبة خارجية عبر CDN — هكذا الشكل متسق 100% مع الأيقونات
// الموجودة، وما فيش أي طلب شبكة إضافي أو استدعاء init منفصل بعد كل تحديث
// ديناميكي للـ DOM (كما مكتبات الأيقونات الخارجية بتحتاج عادةً).
// ---------------------------------------------------------------------------
const ICON_PATHS = {
  car: '<path d="M3 13l1.6-4.5A2 2 0 0 1 6.5 7h11a2 2 0 0 1 1.9 1.5L21 13" /><rect x="3" y="13" width="18" height="5" rx="1.5" /><circle cx="7.5" cy="18.5" r="1.5" /><circle cx="16.5" cy="18.5" r="1.5" />',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" /><path d="M4 21h10" /><path d="M14 10h2.5A1.5 1.5 0 0 1 18 11.5V16a1.5 1.5 0 0 0 3 0V9l-2.5-2.5" /><path d="M7 8h4" />',
  wallet: '<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4" /><path d="M4 6v12a2 2 0 0 0 2 2h14v-4" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />',
  receipt: '<path d="M6 3h9l3 3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M9 9h6M9 13h6M9 17h4" />',
  hash: '<path d="M9 3 7 21M17 3l-2 18M4 8h17M3 16h17" />',
  chartBar: '<path d="M6 20V10M12 20V4M18 20v-6" />',
  pin: '<path d="M12 21s7-6.4 7-11.5A7 7 0 0 0 5 9.5C5 14.6 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.3" />',
  checkCircle: '<circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.3 2.3L16 10" />',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2Z" />',
  noEntry: '<circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" />',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" /><path d="M10 12h4" />',
  cash: '<rect x="2.5" y="6.5" width="19" height="11" rx="1.5" /><circle cx="12" cy="12" r="2.5" /><path d="M6 8v8M18 8v8" />',
  tag: '<path d="M20 12.5 12.5 20a1.5 1.5 0 0 1-2.1 0L4 13.6a1.5 1.5 0 0 1 0-2.1L11.5 4H18a2 2 0 0 1 2 2v6.5Z" /><circle cx="15" cy="8" r="1" />',
  clock: '<circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />',
  user: '<circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />',
  warningTriangle: '<path d="M12 3 2 20h20L12 3Z" /><path d="M12 9.5v4.5" /><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />',
  check: '<path d="m5 12 5 5 9-11" />',
  cross: '<path d="m6 6 12 12M18 6 6 18" />',
  download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 19h14" />',
  laptop: '<rect x="4" y="4" width="16" height="10" rx="1.2" /><path d="M2 18h20l-1.6-3H3.6L2 18Z" />',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" />',
  phone: '<rect x="7.5" y="2" width="9" height="20" rx="2" /><path d="M11 18.2h2" />',
  tablet: '<rect x="4.5" y="2.5" width="15" height="19" rx="2" /><path d="M11.2 18.5h1.6" />',
};

// يبني سترينج <svg> جاهز للحقن المباشر داخل أي HTML string حالي (بدل
// الإيموجي)، بحجم افتراضي 1em حتى يورث حجمه من font-size العنصر الأب
function icon(name, extraClass) {
  const paths = ICON_PATHS[name];
  if (!paths) return "";
  const cls = "icon-inline" + (extraClass ? " " + extraClass : "");
  return (
    '<svg class="' + cls + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + "</svg>"
  );
}

// ---------------------------------------------------------------------------
// تنبيه عابر (Toast) — تأكيد سريع لعملية ناجحة (تصدير ملف، نسخة احتياطية،
// إلخ) يختفي تلقائيًا من غير ما يحتاج أي تفاعل من المستخدم. مستقل تمامًا
// عن رسائل الخطأ الموجودة أصلًا داخل الفورمات (.error-message)، التي لا
// تزال تعمل بنفس الشكل ومكانها.
// ---------------------------------------------------------------------------
const toastContainer = document.getElementById("toast-container");
const TOAST_ICONS = { success: "check", error: "cross", info: "checkCircle" };

function showToast(message, type) {
  if (!toastContainer) return;
  const toastType = type || "success";
  const toastEl = document.createElement("div");
  toastEl.className = "toast toast-" + toastType;
  toastEl.setAttribute("role", "status");
  toastEl.innerHTML =
    icon(TOAST_ICONS[toastType] || "check", "toast-icon") +
    '<span class="toast-message">' + escapeHtml(message) + "</span>" +
    '<button type="button" class="toast-close" aria-label="إغلاق">' + icon("cross", "") + "</button>";
  toastContainer.appendChild(toastEl);

  const DURATION = 3200;
  let remaining = DURATION;
  let timerId = null;
  let startedAt = 0;

  const remove = () => {
    if (timerId) clearTimeout(timerId);
    toastEl.classList.add("is-leaving");
    setTimeout(() => toastEl.remove(), 200);
  };

  const startTimer = () => {
    startedAt = Date.now();
    timerId = setTimeout(remove, remaining);
  };

  const pauseTimer = () => {
    if (!timerId) return;
    clearTimeout(timerId);
    timerId = null;
    remaining -= Date.now() - startedAt;
  };

  toastEl.addEventListener("mouseenter", pauseTimer);
  toastEl.addEventListener("mouseleave", startTimer);
  toastEl.addEventListener("focusin", pauseTimer);
  toastEl.addEventListener("focusout", startTimer);

  const closeButton = toastEl.querySelector(".toast-close");
  if (closeButton) closeButton.addEventListener("click", remove);

  startTimer();
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// لحقول من نوع date فقط (مثل transaction_date) — من غير وقت، ومن غير انزياح
// بسبب المنطقة الزمنية (بنجبر الـ parsing يكون بتوقيت محلي منتصف الليل)
function formatDateOnly(value) {
  if (!value) return "—";
  const date = new Date(value + "T00:00:00");
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// لتاريخ معاملات الوقود فقط — بيتسجل بالشهر عمليًا غير بيوم محدد، فبنعرض
// الشهر والسنة فقط (مثلاً "مايو 2026") من غير رقم اليوم
function formatMonthOnly(value) {
  if (!value) return "—";
  const date = new Date(value + "T00:00:00");
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
  });
}

function formatNumber(value, decimals) {
  const num = Number(value || 0);
  const d = decimals == null ? 2 : decimals;
  return num.toLocaleString("ar-EG-u-nu-latn", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

// ----------------------------------------------------------------------------
// Skeleton Loading — مستطيلات رمادية نابضة بدل نص "جارٍ التحميل" العادي، في
// كل جداول/كروت النظام أثناء التحميل. تحسين بصري بحت في شكل حالة التحميل؛
// لا يغيّر أي استعلام أو منطق عمل — فقط يبدّل الـ HTML المؤقت التي بيظهر
// لحد ما البيانات الحقيقية توصل.
// ----------------------------------------------------------------------------

function skeletonRowsHtml(rowCount, colCount) {
  const cell = '<td><div class="skeleton-bar"></div></td>';
  return ('<tr class="skeleton-row">' + cell.repeat(colCount) + "</tr>").repeat(rowCount);
}

function renderTableSkeleton(tbody, rowCount, colCount) {
  tbody.innerHTML = skeletonRowsHtml(rowCount, colCount);
}

function skeletonBlockHtml(rowCount, colCount) {
  return (
    '<div class="table-scroll"><table class="data-table"><tbody>' +
    skeletonRowsHtml(rowCount, colCount) +
    "</tbody></table></div>"
  );
}

function skeletonCardsHtml(count, containerClass, cardClass) {
  let html = '<div class="' + containerClass + '">';
  for (let i = 0; i < count; i++) {
    html +=
      '<div class="' + cardClass + ' skeleton-card">' +
      '<div class="skeleton-bar skeleton-bar-label"></div>' +
      '<div class="skeleton-bar skeleton-bar-value"></div>' +
      "</div>";
  }
  return html + "</div>";
}

function skeletonActivityItemsHtml(count) {
  let html = "";
  for (let i = 0; i < count; i++) {
    html +=
      '<div class="activity-item skeleton-card">' +
      '<div class="skeleton-bar skeleton-bar-label"></div>' +
      '<div class="skeleton-bar skeleton-bar-meta"></div>' +
      "</div>";
  }
  return html;
}

function skeletonFundCardHtml() {
  return (
    '<div class="table-card"><div class="fund-card-body skeleton-card">' +
    '<div class="skeleton-bar skeleton-bar-label"></div>' +
    '<div class="skeleton-bar skeleton-bar-value"></div>' +
    '<div class="skeleton-bar"></div>' +
    "</div></div>"
  );
}

// حالة "فارغ تمامًا" مصمّمة بعناية (أيقونة كبيرة + عنوان + وصف + زر فعل
// اختياري) — تُستخدم في الجداول الرئيسية بدل نص عادي، وفقط عندما يكون الجدول فارغًا
// فعليًا من غير أي فلتر مطبّق (حالة الفلتر الفارغ تظل نصًا بسيطًا عاديًا)
function showRichEmptyState(box, icon, title, description, actionHtml) {
  box.hidden = false;
  box.classList.add("is-rich");
  box.innerHTML =
    '<div class="empty-state">' +
    '<span class="empty-state-icon" aria-hidden="true">' + icon + "</span>" +
    '<h3 class="empty-state-title">' + escapeHtml(title) + "</h3>" +
    '<p class="empty-state-desc">' + escapeHtml(description) + "</p>" +
    (actionHtml || "") +
    "</div>";
}

function showLoginPage() {
  appShell.hidden = true;
  loginPage.hidden = false;
}

// إعادة بناء supabaseClient بتوكن الجلسة المخصص كـ Authorization header —
// من هنا وبعد ذلك أي نداء (RPC أو جدول) يتحقق كـ "authenticated" تلقائيًا
// في نظر PostgREST، من غير أي اعتماد على Supabase Auth
function applyAuthToken(token) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: "Bearer " + token } },
  });
}

function clearAuthToken() {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function saveSession(token, expiresAt, profile) {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ token, expiresAt, profile }));
  } catch (storageError) {
    console.error("Error saving session:", storageError);
  }
}

function loadSavedSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (storageError) {
    return null;
  }
}

function clearSavedSession() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (storageError) {
    // تجاهل
  }
}

function showAppShell(profile) {
  loginPage.hidden = true;
  appShell.hidden = false;
  welcomeAvatar.textContent = (profile.full_name || "؟").trim().charAt(0);
  welcomeMessage.innerHTML =
    escapeHtml(profile.full_name) +
    '<span class="welcome-role-badge">' + escapeHtml(roleLabel(profile.role)) + "</span>";
  topbarUserName.textContent = profile.full_name;
  topbarUserRole.textContent = roleLabel(profile.role);
  if (topbarUserAvatar) {
    topbarUserAvatar.textContent = (profile.full_name || "؟").trim().charAt(0);
  }

  // إظهار/إخفاء عناصر مقصورة على Super Admin أو Admin العادي (الرفض
  // الفعلي يأتي من RLS في قاعدة البيانات نفسها — هذا فقط تحسين لتجربة
  // الاستخدام). يستطيع Admin العادي تعديل السيارات/الوقود/العهدة/المصروفات،
  // لكن ليس حسابات النظام ولا سجل العمليات.
  const isAdminOrAbove = profile.role === "super_admin" || profile.role === "admin";

  // أصول تقنية المعلومات بقى ليها صلاحية مستقلة: Super Admin أو IT Support
  // فقط هما القادران على الإضافة/التعديل/الاسترداد — أصبح الأدمن العادي يرى
  // الصفحة بالقراءة فقط (أزرار الإضافة/التعديل مختفية له)
  const isItAssetManager = profile.role === "super_admin" || profile.role === "it_support";

  addVehicleButton.hidden = !isAdminOrAbove;
  addFuelButton.hidden = !isAdminOrAbove;
  addFundButton.hidden = !isAdminOrAbove;
  addExpenseButton.hidden = !isAdminOrAbove;
  importVehiclesButton.hidden = !isAdminOrAbove;
  importFuelButton.hidden = !isAdminOrAbove;
  importExpensesButton.hidden = !isAdminOrAbove;
  fullBackupExportButton.hidden = !isAdminOrAbove;
  // تقرير المستلمين داخلي بالكامل — يعرض "الموظف اللي استلم المبلغ فعليًا"،
  // فمقصور على أدمن/مدير النظام فقط، نفس نطاق من يقدر يضيف مصروف أصلًا
  if (reportExpensesRecipientsExportButton) reportExpensesRecipientsExportButton.hidden = !isAdminOrAbove;
  addLaptopButton.hidden = !isItAssetManager;
  importLaptopsButton.hidden = !isItAssetManager;
  addEmailButton.hidden = !isItAssetManager;
  importEmailButton.hidden = !isItAssetManager;
  addSimButton.hidden = !isItAssetManager;
  importSimButton.hidden = !isItAssetManager;
  addTabletButton.hidden = !isItAssetManager;
  importTabletsButton.hidden = !isItAssetManager;
  addLaptopCatalogButton.hidden = !isItAssetManager;
  importLaptopCatalogButton.hidden = !isItAssetManager;

  // صفحات/عناصر مقصورة على Super Admin بالكامل (غير فقط زر داخل الصفحة)
  const auditLogNavItem = document.getElementById("audit-log-nav-item");
  const accountsNavItem = document.getElementById("accounts-nav-item");
  if (auditLogNavItem) auditLogNavItem.hidden = profile.role !== "super_admin";
  if (accountsNavItem) accountsNavItem.hidden = profile.role !== "super_admin";

  // دور "IT Support" مسؤول حصريًا عن أصول تقنية المعلومات — القائمة
  // الجانبية الخاصة به تقتصر على الرئيسية + أصول تقنية المعلومات فقط، وباقي
  // الصفحات التشغيلية (سيارات/وقود/عهدة/مصروفات/تقارير) بتتخفي له تمامًا
  const isItSupportOnly = profile.role === "it_support";
  const itSupportHiddenNavIds = ["vehicles-nav-item", "fuel-nav-item", "petty-cash-nav-item", "expenses-nav-item", "reports-nav-item"];
  itSupportHiddenNavIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.hidden = isItSupportOnly;
  });

  navigateTo("dashboard");
  runDailyAutoDownloads(profile);

  if (profile.must_change_password) {
    changePasswordForm.reset();
    changePasswordError.hidden = true;
    changePasswordSuccess.textContent = "كلمة المرور الحالية مؤقتة — يجب تغييرها الآن.";
    changePasswordSuccess.hidden = false;
    if (pendingLoginPassword) changePasswordCurrentInput.value = pendingLoginPassword;
    changePasswordModal.hidden = false;
  }
  pendingLoginPassword = null;
}

// بيتسجّل مؤقتًا وقت تسجيل الدخول بس، حتى لو الحساب محتاج تغيير كلمة مرور
// إجباري، نقدر نحط كلمة المرور المؤقتة تلقائيًا في حقل "كلمة المرور
// الحالية" بدل ما يكتبها تاني بنفسه (غير يُخزَّن في أي مكان دائم)
let pendingLoginPassword = null;

// ---------------------------------------------------------------------------
// تحميل تلقائي يومي حسب الدور — يعمل مرة واحدة فقط أول دخول في اليوم (سواء
// بتسجيل دخول جديد أو باستعادة جلسة محفوظة عند فتح الموقع مباشرة)، بدون أي
// تدخل من المستخدم:
//   - مدير النظام / أدمن: نسخة احتياطية كاملة + تقرير العهدة (MEEM) + تقرير
//     المستلمين الداخلي — كل ما يديره الأدمن، وعلى الأخص تقريري المصروفات
//   - دعم تقني: تقرير أصول تقنية المعلومات فقط (بدون أي بيانات بيتي كاش)
//   - مدير: لا شيء
// نتتبع آخر يوم تحميل بـ localStorage لكل مستخدم على حدة (بمعرّفه) حتى لا
// يتكرر التحميل لو فتح المستخدم الموقع أكثر من مرة في نفس اليوم
// ---------------------------------------------------------------------------
function autoDownloadStorageKey(userId) {
  return "autoDownloadDate_" + userId;
}

function hasRunAutoDownloadToday(userId) {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    return localStorage.getItem(autoDownloadStorageKey(userId)) === todayStr;
  } catch (storageError) {
    return false;
  }
}

function markAutoDownloadRanToday(userId) {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    localStorage.setItem(autoDownloadStorageKey(userId), todayStr);
  } catch (storageError) {
    // تجاهل — لو localStorage غير متاح، أقصى أثر إنه هيحاول التحميل تاني
    // المرة الجاية، مش خطأ حرج
  }
}

// فاصل زمني بسيط بين كل تحميل والتالي لتقليل احتمالية حجب المتصفح لعدة
// تنزيلات متتالية دفعة واحدة
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runDailyAutoDownloads(profile) {
  if (!profile || !profile.id) return;
  if (hasRunAutoDownloadToday(profile.id)) return;

  // نسجّل إنه اتشغّل النهارده فورًا (قبل انتظار نتيجة التحميلات) حتى لو
  // المستخدم قفل الصفحة بسرعة أو حصل خطأ في تحميل واحد، لا يتكرر المحاولة
  // الكاملة عدة مرات في نفس اليوم
  markAutoDownloadRanToday(profile.id);

  try {
    if (profile.role === "super_admin" || profile.role === "admin") {
      await exportFullBackupToExcel();
      await delay(700);
      await exportMeemPettyCashExcel();
      await delay(700);
      await exportExpenseRecipientsExcel();
    } else if (profile.role === "it_support") {
      await exportItAssetsExcel();
    }
    // "manager": لا شيء — لا تحميل تلقائي إطلاقًا لهذا الدور
  } catch (autoDownloadError) {
    console.error("Error running daily auto-downloads:", autoDownloadError);
  }
}

// استعادة جلسة محفوظة (بعد تحديث الصفحة) — بيعيد التحقق من الحساب حيًا من
// قاعدة البيانات (غير فقط يثق في البيانات المحفوظة محليًا) حتى أي تعطيل أو
// تغيير دور يتفعّل فورًا حتى لو التوكن القديم لا يزال صالح
async function restoreSessionAndEnter(saved) {
  applyAuthToken(saved.token);

  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("id, full_name, email, role, is_active, must_change_password")
    .eq("id", saved.profile.id)
    .single();

  if (error || !profile || !profile.is_active) {
    console.error("Session restore error:", error);
    clearSavedSession();
    clearAuthToken();
    showLoginPage();
    return;
  }

  currentAuthUser = { id: profile.id };
  currentProfile = profile;
  sessionToken = saved.token;
  sessionExpiresAt = saved.expiresAt;
  showAppShell(profile);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showError("من فضلك أدخل البريد الإلكتروني وكلمة المرور.");
    return;
  }

  setLoading(true);

  // كل الطلب اتغلف بـ try/catch حتى لو الاتصال بالإنترنت انقطع فجأة أو
  // حدث خطأ غير متوقع، يعود الزر للعمل ويظهر رسالة خطأ واضحة بدل ما
  // يفضل عالق على "جارٍ تسجيل الدخول..." للأبد
  try {
    // تسجيل الدخول عبر RPC مخصص (login_attempt) — يُرجع JWT موقّع لو
    // البيانات صحيحة، بديل كامل لـ Supabase Auth
    const { data, error } = await supabaseClient.rpc("login_attempt", {
      p_email: email,
      p_password: password,
    });

    if (error) {
      console.error("Login RPC error:", error);
      showError("تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.");
      return;
    }

    if (!data || !data.success) {
      showError((data && data.error) || "بيانات الدخول غير صحيحة.");
      return;
    }

    const expiresAt = Date.now() + 12 * 60 * 60 * 1000; // نفس مدة صلاحية التوكن في الدالة (12 ساعة)
    applyAuthToken(data.token);
    saveSession(data.token, expiresAt, data.profile);

    sessionToken = data.token;
    sessionExpiresAt = expiresAt;
    currentAuthUser = { id: data.profile.id };
    currentProfile = data.profile;
    pendingLoginPassword = password;

    console.log("تسجيل الدخول ناجح:", data.profile.full_name, "-", data.profile.role);
    showAppShell(data.profile);
  } catch (unexpectedError) {
    console.error("Unexpected login error:", unexpectedError);
    showError("تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.");
  } finally {
    setLoading(false);
  }
});

logoutButton.addEventListener("click", () => {
  clearSavedSession();
  clearAuthToken();
  currentAuthUser = null;
  currentProfile = null;
  sessionToken = null;
  sessionExpiresAt = null;
  fuelVehiclesCache = null;
  expenseCategoriesCache = null;
  currentActiveFund = null;
  loginForm.reset();
  clearError();
  showLoginPage();
});

// ---------------------------------------------------------------------------
// 1.0.1 الوضع الغامق/الفاتح — data-theme على <html>، محفوظ في localStorage.
// التطبيق الفوري عند التحميل (تفادي الوميض) يحدث في سكريبت صغير مستقل
// داخل index.html <head>؛ الكود هنا مسؤول فقط عن زر التبديل نفسه ومزامنة
// شكله (أيقونة + نص) مع الحالة الحالية.
// ---------------------------------------------------------------------------
const themeToggleButton = document.getElementById("theme-toggle-button");

function getEffectiveTheme() {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "dark" || explicit === "light") return explicit;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// الزر ثابت الشكل والاسم دائمًا "الوضع الداكن" (أيقونة هلال واحدة) — الحالة
// الحالية (مفعّل/غير مفعّل) بتتعرض بصريًا عبر aria-pressed فقط، من غير ما
// يتغيّر النص أو الأيقونة نفسها.
function syncThemeToggleUI() {
  const isDark = getEffectiveTheme() === "dark";
  themeToggleButton.setAttribute("aria-pressed", String(isDark));
}

themeToggleButton.addEventListener("click", () => {
  const nextTheme = getEffectiveTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", nextTheme);
  try {
    localStorage.setItem("theme", nextTheme);
  } catch (storageError) {
    // تجاهل (خصوصية متصفح تمنع localStorage)
  }
  syncThemeToggleUI();
});

syncThemeToggleUI();

// ---------------------------------------------------------------------------
// 1.1 تغيير كلمة المرور — متاح لأي مستخدم مسجّل دخول لحسابه الشخصي فقط، عبر
// RPC مخصص (change_own_password) يتحقق من كلمة المرور الحالية أولًا. لا
// يحتاج أي مفتاح إداري سري ولا صلاحيات إضافية.
// ---------------------------------------------------------------------------

const changePasswordButton = document.getElementById("change-password-button");
const changePasswordModal = document.getElementById("change-password-modal");
const changePasswordForm = document.getElementById("change-password-form");
const changePasswordCurrentInput = document.getElementById("change-password-current");
const changePasswordNewInput = document.getElementById("change-password-new");
const changePasswordConfirmInput = document.getElementById("change-password-confirm");
const changePasswordError = document.getElementById("change-password-error");
const changePasswordSuccess = document.getElementById("change-password-success");
const changePasswordSubmitButton = document.getElementById("change-password-submit");

changePasswordButton.addEventListener("click", () => {
  changePasswordForm.reset();
  changePasswordError.hidden = true;
  changePasswordError.textContent = "";
  changePasswordSuccess.hidden = true;
  changePasswordSuccess.textContent = "";
  changePasswordModal.hidden = false;
});

changePasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  changePasswordError.hidden = true;
  changePasswordError.textContent = "";
  changePasswordSuccess.hidden = true;
  changePasswordSuccess.textContent = "";

  const currentPassword = changePasswordCurrentInput.value;
  const newPassword = changePasswordNewInput.value;
  const confirmPassword = changePasswordConfirmInput.value;

  if (!currentPassword) {
    changePasswordError.textContent = "أدخل كلمة المرور الحالية.";
    changePasswordError.hidden = false;
    return;
  }
  if (!newPassword || newPassword.length < 6) {
    changePasswordError.textContent = "يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.";
    changePasswordError.hidden = false;
    return;
  }
  if (newPassword !== confirmPassword) {
    changePasswordError.textContent = "كلمتا المرور غير متطابقتين.";
    changePasswordError.hidden = false;
    return;
  }

  changePasswordSubmitButton.disabled = true;
  changePasswordSubmitButton.textContent = "جارٍ الحفظ...";

  try {
    const { data, error } = await supabaseClient.rpc("change_own_password", {
      p_current_password: currentPassword,
      p_new_password: newPassword,
    });

    if (error) {
      console.error("Error changing password:", error);
      changePasswordError.textContent = "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
      changePasswordError.hidden = false;
      return;
    }

    if (!data || !data.success) {
      changePasswordError.textContent = (data && data.error) || "تعذر تغيير كلمة المرور.";
      changePasswordError.hidden = false;
      return;
    }

    // تحديث الحالة المحلية + الجلسة المحفوظة حتى الرسالة الإجبارية متظهرش
    // تاني قبل ما تنتهي الجلسة الحالية
    if (currentProfile) currentProfile.must_change_password = false;
    const saved = loadSavedSession();
    if (saved) {
      saved.profile.must_change_password = false;
      saveSession(saved.token, saved.expiresAt, saved.profile);
    }

    changePasswordForm.reset();
    changePasswordSuccess.textContent = "تم تغيير كلمة المرور بنجاح.";
    changePasswordSuccess.hidden = false;
  } catch (unexpectedError) {
    console.error("Unexpected error changing password:", unexpectedError);
    changePasswordError.textContent = "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
    changePasswordError.hidden = false;
  } finally {
    changePasswordSubmitButton.disabled = false;
    changePasswordSubmitButton.textContent = "حفظ كلمة المرور";
  }
});

// ============================================================================
// 2. التنقل بين صفحات #app-shell (Client-side navigation، من غير routing)
// ============================================================================

const navItems = document.querySelectorAll(".sidebar-nav-item[data-page]");
const pageSections = document.querySelectorAll(".app-page");

const PAGE_TITLES = {
  dashboard: "الرئيسية",
  vehicles: "السيارات",
  fuel: "الوقود",
  "petty-cash": "العهدة النقدية",
  expenses: "المصروفات",
  "it-assets": "أصول تقنية المعلومات",
  reports: "التقارير",
  "audit-log": "سجل العمليات",
  accounts: "حسابات النظام",
};

// صفحات مقصورة على Super Admin بالكامل (حسابات النظام + سجل العمليات) —
// حماية إضافية على مستوى التنقل نفسه (بجانب إخفاء عنصر الـ Sidebar أصلًا).
// الرفض الحقيقي للبيانات دائمًا من RLS في قاعدة البيانات، هذا مجرد تحسين
// تجربة استخدام.
const SUPER_ADMIN_ONLY_PAGES = ["audit-log", "accounts"];

function navigateTo(pageName) {
  if (
    SUPER_ADMIN_ONLY_PAGES.includes(pageName) &&
    !(currentProfile && currentProfile.role === "super_admin")
  ) {
    pageName = "dashboard";
  }

  pageSections.forEach((section) => {
    section.hidden = section.id !== pageName + "-page";
  });

  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.page === pageName);
  });

  if (pageTitleEl) {
    pageTitleEl.textContent = PAGE_TITLES[pageName] || "";
  }

  if (pageName === "dashboard") {
    loadDashboardStats();
  }

  if (pageName === "vehicles") {
    loadVehicles();
  }

  if (pageName === "fuel") {
    loadFuelTransactions();
  }

  if (pageName === "petty-cash") {
    loadCurrentFund();
    loadFundingHistory();
  }

  if (pageName === "expenses") {
    loadExpenses();
  }

  if (pageName === "it-assets") {
    loadAssetTab(currentAssetTab);
  }

  if (pageName === "reports") {
    loadReportTab(currentReportTab);
  }

  if (pageName === "audit-log") {
    loadAuditLog();
  }

  if (pageName === "accounts") {
    loadAccountsList();
  }
}

navItems.forEach((item) => {
  item.addEventListener("click", (event) => {
    event.preventDefault();
    navigateTo(item.dataset.page);
  });
});

// ============================================================================
// 3. Modals — فتح/إغلاق عام
// ============================================================================

// معالج الاستيراد تحديدًا يتم منع إغلاقه أثناء تنفيذ الإدخال الفعلي
// (isProcessing) — إغلاقه في نص العملية غير هيوقف الإدخال (لا يزال شغّال في
// الخلفية)، فالأسلم منع الإغلاق العرضي لحد ما العملية تخلص
function isModalSafeToClose(modal) {
  if (modal && modal.id === "import-wizard-modal" && importWizardState.isProcessing) return false;
  return true;
}

// إغلاق موحّد لأي Modal — بيتعامل أيضًا مع حالة إلغاء "إضافة موظف سريعة"
// التي اتفتحت من فورم السيارة (يرجّع فورم السيارة يظهر تاني بدل ما يفضل
// مقفول من غير رجوع)
function closeModalIfSafe(modal) {
  if (!modal || !isModalSafeToClose(modal)) return;
  modal.hidden = true;
}

document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => {
    closeModalIfSafe(document.getElementById(button.dataset.closeModal));
  });
});

document.querySelectorAll(".modal-overlay").forEach((overlay) => {
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeModalIfSafe(overlay);
  });
});

// إغلاق أي Modal مفتوح بالضغط على مفتاح Escape — نفس قاعدة عدم الإغلاق
// أثناء تنفيذ الاستيراد الفعلي
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    if (!overlay.hidden) closeModalIfSafe(overlay);
  });
});

// ============================================================================
// 4. موديول السيارات (Vehicles) — Phase 2
// ============================================================================

const VEHICLES_PAGE_SIZE = 20;

const VEHICLE_STATUS_LABELS = {
  active: "نشطة",
  available: "متاحة",
  assigned: "مخصصة",
  under_maintenance: "تحت الصيانة",
  out_of_service: "خارج الخدمة",
  archived: "مؤرشفة",
};

// شارة "حالة التفويض": إذا لا يوجد تاريخ نهاية = "مستخدم فعلي" مستمر، إذا وُجد
// تاريخ وانقضى = "منتهٍ"، وإذا وُجد تاريخ ولا يزال ساريًا = "مفوَّض حتى" هذا التاريخ
function vehicleAuthorizationBadgeHtml(vehicle) {
  if (!vehicle.authorization_expiry_date) {
    return vehicle.actual_user_name
      ? '<span class="status-badge status-available">مستخدم فعلي</span>'
      : "—";
  }
  const expiryDate = new Date(vehicle.authorization_expiry_date + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expired = expiryDate < today;
  const label = (expired ? "منتهي — كان حتى " : "مفوَّض حتى ") + formatDateOnly(vehicle.authorization_expiry_date);
  return (
    '<span class="status-badge status-' +
    (expired ? "out_of_service" : "assigned") +
    '">' +
    escapeHtml(label) +
    "</span>"
  );
}

// عرض "المستخدم الفعلي" (اسم + رقم هوية بين قوسين لو موجود)
function vehicleActualUserDisplay(vehicle) {
  if (!vehicle.actual_user_name) return "—";
  return vehicle.actual_user_national_id
    ? vehicle.actual_user_name + " (" + vehicle.actual_user_national_id + ")"
    : vehicle.actual_user_name;
}

let vehiclesState = {
  page: 1,
  search: "",
  status: "",
  totalCount: 0,
  sortColumn: "updated_at",
  sortAscending: false,
};

// عناصر قائمة السيارات
const vehiclesTableBody = document.getElementById("vehicles-table-body");
const vehiclesStateBox = document.getElementById("vehicles-state");
const vehiclesSearchInput = document.getElementById("vehicles-search");
const vehiclesStatusFilter = document.getElementById("vehicles-status-filter");
const vehiclesPrevPageButton = document.getElementById("vehicles-prev-page");
const vehiclesNextPageButton = document.getElementById("vehicles-next-page");
const vehiclesPaginationInfo = document.getElementById("vehicles-pagination-info");
const addVehicleButton = document.getElementById("add-vehicle-button");

// نحتاج زر إضافة الوقود هنا لأن showAppShell() يتحكم في ظهوره حسب الدور
const addFuelButton = document.getElementById("add-fuel-button");

// نفس الفكرة لأزرار البيتي كاش والمصروفات — showAppShell() يتحكم فيهم حسب الدور
const addFundButton = document.getElementById("add-fund-button");
const addExpenseButton = document.getElementById("add-expense-button");

// عناصر Modal التفاصيل
const vehicleDetailsModal = document.getElementById("vehicle-details-modal");
const vehicleDetailsContent = document.getElementById("vehicle-details-content");
const vehicleDetailsEditButton = document.getElementById("vehicle-details-edit-button");

// عناصر Modal الإضافة/التعديل
const vehicleFormModal = document.getElementById("vehicle-form-modal");
const vehicleForm = document.getElementById("vehicle-form");
const vehicleFormTitle = document.getElementById("vehicle-form-title");
const vehicleFormIdInput = document.getElementById("vehicle-form-id");
const vehicleFormPlateInput = document.getElementById("vehicle-form-plate");
const vehicleFormMakeInput = document.getElementById("vehicle-form-make");
const vehicleFormYearInput = document.getElementById("vehicle-form-year");
const vehicleFormStatusSelect = document.getElementById("vehicle-form-status");
const vehicleFormActualUserNameInput = document.getElementById("vehicle-form-actual-user-name");
const vehicleFormActualUserNationalIdInput = document.getElementById("vehicle-form-actual-user-national-id");
const vehicleFormAuthorizationExpiryInput = document.getElementById("vehicle-form-authorization-expiry");
const vehicleFormError = document.getElementById("vehicle-form-error");
const vehicleFormSubmitButton = document.getElementById("vehicle-form-submit");

let vehicleBeingViewed = null;

// قائمة أسماء المستخدمين الفعليين الموجودة فعلًا على سيارات تانية — بتتعرض
// كاقتراحات (datalist) وقت كتابة اسم المستخدم الفعلي في فورم السيارة، حتى
// نقلل اختلاف كتابة نفس الاسم (مثل "محمد حسام" و"محمد حسام عثمان") التي بيبوّظ
// تقارير الاستهلاك حسب الشخص. السيارة تفضل هي الأساس والاسم مجرد حقل عليها
// — لا يوجد جدول "مستخدمين" منفصل ولا ربط رسمي، الاقتراح شكلي فقط
const actualUserNameOptionsList = document.getElementById("actual-user-name-options");
let actualUserNamesCache = null;

async function ensureActualUserNameOptions(forceRefresh) {
  if (actualUserNamesCache && !forceRefresh) return actualUserNamesCache;

  const { data, error } = await supabaseClient
    .from("vehicles")
    .select("actual_user_name")
    .not("actual_user_name", "is", null);

  if (error) {
    console.error("Error loading actual user name suggestions:", error);
    return actualUserNamesCache || [];
  }

  const names = [...new Set((data || []).map((v) => v.actual_user_name).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ar")
  );

  actualUserNamesCache = names;
  actualUserNameOptionsList.innerHTML = names
    .map((name) => '<option value="' + escapeHtml(name) + '"></option>')
    .join("");

  return actualUserNamesCache;
}

// ---------------------------------------------------------------------------
// 4.1 جلب وعرض القائمة (بحث + فلتر + Pagination فعليًا من Supabase)
// ---------------------------------------------------------------------------

function setVehiclesState(message) {
  vehiclesStateBox.classList.remove("is-rich");
  if (!message) {
    vehiclesStateBox.hidden = true;
    vehiclesStateBox.textContent = "";
    return;
  }
  vehiclesStateBox.hidden = false;
  vehiclesStateBox.textContent = message;
}

function renderVehiclesRows(vehicles) {
  vehiclesTableBody.innerHTML = "";

  vehicles.forEach((vehicle) => {
    const tr = document.createElement("tr");
    tr.className = "clickable-row";

    const statusLabel = VEHICLE_STATUS_LABELS[vehicle.status] || vehicle.status;

    tr.innerHTML =
      "<td>" + escapeHtml(vehicle.license_plate) + "</td>" +
      "<td>" + escapeHtml(vehicle.make || "—") + "</td>" +
      "<td>" + (vehicle.manufacturing_year || "—") + "</td>" +
      "<td>" + escapeHtml(vehicleActualUserDisplay(vehicle)) + "</td>" +
      "<td>" + vehicleAuthorizationBadgeHtml(vehicle) + "</td>" +
      "<td><span class=\"status-badge status-" + vehicle.status + "\">" + escapeHtml(statusLabel) + "</span></td>";

    tr.addEventListener("click", () => openVehicleDetails(vehicle));
    vehiclesTableBody.appendChild(tr);
  });
}

function updatePaginationControls() {
  const totalPages = Math.max(1, Math.ceil(vehiclesState.totalCount / VEHICLES_PAGE_SIZE));

  vehiclesPaginationInfo.textContent = vehiclesState.totalCount
    ? "صفحة " + vehiclesState.page + " من " + totalPages + " — إجمالي " + vehiclesState.totalCount + " سيارة"
    : "";

  vehiclesPrevPageButton.disabled = vehiclesState.page <= 1;
  vehiclesNextPageButton.disabled = vehiclesState.page >= totalPages;
}

async function loadVehicles() {
  renderTableSkeleton(vehiclesTableBody, 6, 7);
  setVehiclesState(null);
  vehiclesPrevPageButton.disabled = true;
  vehiclesNextPageButton.disabled = true;

  const from = (vehiclesState.page - 1) * VEHICLES_PAGE_SIZE;
  const to = from + VEHICLES_PAGE_SIZE - 1;

  let query = supabaseClient
    .from("vehicles")
    .select(
      "id, license_plate, make, manufacturing_year, " +
        "actual_user_name, actual_user_national_id, authorization_expiry_date, " +
        "status, created_at, updated_at, current_location_id, " +
        "current_location:locations ( name )",
      { count: "exact" }
    )
    .order(vehiclesState.sortColumn, { ascending: vehiclesState.sortAscending })
    .range(from, to);

  if (vehiclesState.search) {
    const term = "%" + vehiclesState.search + "%";
    query = query.or("license_plate.ilike." + term + ",actual_user_name.ilike." + term);
  }

  if (vehiclesState.status) {
    query = query.eq("status", vehiclesState.status);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("Error loading vehicles:", error);
    setVehiclesState("تعذر تحميل بيانات السيارات. يُرجى المحاولة مرة أخرى.");
    vehiclesPaginationInfo.textContent = "";
    return;
  }

  vehiclesState.totalCount = count || 0;

  if (!data || data.length === 0) {
    if (vehiclesState.search || vehiclesState.status) {
      showRichEmptyState(
        vehiclesStateBox,
        icon("car"),
        "لا توجد نتائج مطابقة",
        "لا توجد سيارة تطابق كلمة البحث أو الحالة المحددة حاليًا.",
        '<button type="button" class="btn-secondary btn-sm" id="vehicles-clear-filters-button">مسح الفلاتر</button>'
      );
      document.getElementById("vehicles-clear-filters-button").addEventListener("click", () => {
        vehiclesSearchInput.value = "";
        vehiclesStatusFilter.value = "";
        vehiclesState.search = "";
        vehiclesState.status = "";
        vehiclesState.page = 1;
        loadVehicles();
      });
    } else {
      const isSuperAdmin = !!(currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "admin"));
      showRichEmptyState(
        vehiclesStateBox,
        icon("car"),
        "لا توجد سيارات بعد",
        "لا توجد أي سيارة مسجّلة في النظام بعد. ابدأ بإضافة أول سيارة يدويًا أو استورد قائمة كاملة من Excel.",
        isSuperAdmin
          ? '<button type="button" class="btn-primary" id="empty-add-vehicle-button">+ إضافة أول سيارة</button>'
          : ""
      );
      if (isSuperAdmin) {
        document.getElementById("empty-add-vehicle-button").addEventListener("click", () => openVehicleForm(null));
      }
    }
  } else {
    setVehiclesState(null);
    renderVehiclesRows(data);
  }

  updatePaginationControls();
}

let vehiclesSearchDebounce;
vehiclesSearchInput.addEventListener("input", () => {
  clearTimeout(vehiclesSearchDebounce);
  vehiclesSearchDebounce = setTimeout(() => {
    vehiclesState.search = vehiclesSearchInput.value.trim();
    vehiclesState.page = 1;
    loadVehicles();
  }, 300);
});

vehiclesStatusFilter.addEventListener("change", () => {
  vehiclesState.status = vehiclesStatusFilter.value;
  vehiclesState.page = 1;
  loadVehicles();
});

// ترويسات الجدول القابلة للفرز (رقم اللوحة / الحالة / آخر تحديث)
function updateVehiclesSortIndicators() {
  document.querySelectorAll('#vehicles-page .sortable-th').forEach((th) => {
    const arrow = th.querySelector(".sort-arrow");
    if (!arrow) return;
    arrow.textContent = th.dataset.sort === vehiclesState.sortColumn ? (vehiclesState.sortAscending ? "▲" : "▼") : "";
  });
}

document.querySelectorAll('#vehicles-page .sortable-th').forEach((th) => {
  th.addEventListener("click", () => {
    const column = th.dataset.sort;
    if (vehiclesState.sortColumn === column) {
      vehiclesState.sortAscending = !vehiclesState.sortAscending;
    } else {
      vehiclesState.sortColumn = column;
      vehiclesState.sortAscending = true;
    }
    vehiclesState.page = 1;
    updateVehiclesSortIndicators();
    loadVehicles();
  });
});

updateVehiclesSortIndicators();

vehiclesPrevPageButton.addEventListener("click", () => {
  if (vehiclesState.page > 1) {
    vehiclesState.page -= 1;
    loadVehicles();
  }
});

vehiclesNextPageButton.addEventListener("click", () => {
  const totalPages = Math.max(1, Math.ceil(vehiclesState.totalCount / VEHICLES_PAGE_SIZE));
  if (vehiclesState.page < totalPages) {
    vehiclesState.page += 1;
    loadVehicles();
  }
});

// ---------------------------------------------------------------------------
// 4.2 تفاصيل السيارة (Modal بيانات أساسية فقط في هذه المرحلة)
// ---------------------------------------------------------------------------

const vehicleDetailsTitle = document.getElementById("vehicle-details-title");

function openVehicleDetails(vehicle) {
  vehicleBeingViewed = vehicle;

  if (vehicleDetailsTitle) {
    vehicleDetailsTitle.textContent = "ملف السيارة — " + vehicle.license_plate;
  }

  const statusLabel = VEHICLE_STATUS_LABELS[vehicle.status] || vehicle.status;
  const locationName = vehicle.current_location ? vehicle.current_location.name : null;

  vehicleDetailsContent.innerHTML =
    detailRow("رقم اللوحة", escapeHtml(vehicle.license_plate)) +
    detailRow("الماركة", escapeHtml(vehicle.make || "—")) +
    detailRow("سنة الصنع", vehicle.manufacturing_year || "—") +
    detailRow("المستخدم الفعلي", escapeHtml(vehicleActualUserDisplay(vehicle))) +
    detailRow("حالة التفويض", vehicleAuthorizationBadgeHtml(vehicle)) +
    detailRow("الموقع الحالي", escapeHtml(locationName || "—")) +
    detailRow("الحالة", "<span class=\"status-badge status-" + vehicle.status + "\">" + escapeHtml(statusLabel) + "</span>") +
    detailRow("تاريخ الإضافة", formatDateTime(vehicle.created_at)) +
    detailRow("آخر تحديث", formatDateTime(vehicle.updated_at));

  vehicleDetailsEditButton.hidden = !(currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "admin"));

  // تبويب "سجل العمليات" يعتمد على audit_logs، التي RLS الخاص به Super Admin
  // فقط — فبنخفي التبويب نفسه لو المستخدم Manager بدل ما يجرب ويتفاجئ برفض
  const auditTabButton = document.getElementById("vehicle-audit-tab-button");
  if (auditTabButton) {
    auditTabButton.hidden = !(currentProfile && currentProfile.role === "super_admin");
  }

  switchVehicleDetailsTab("basic");
  vehicleDetailsModal.hidden = false;
}

function detailRow(label, valueHtml) {
  return (
    '<div class="detail-row"><dt>' + label + "</dt><dd>" + valueHtml + "</dd></div>"
  );
}

vehicleDetailsEditButton.addEventListener("click", () => {
  vehicleDetailsModal.hidden = true;
  if (vehicleBeingViewed) openVehicleForm(vehicleBeingViewed);
});

// ---------------------------------------------------------------------------
// 4.2b تبويبات تفاصيل السيارة: ملخص الوقود / سجل العمليات
// ---------------------------------------------------------------------------

const vehicleDetailsTabsContainer = document.getElementById("vehicle-details-tabs");
const vehicleTabPanels = {
  basic: document.getElementById("vehicle-tab-basic"),
  fuel: document.getElementById("vehicle-tab-fuel"),
  audit: document.getElementById("vehicle-tab-audit"),
};
const vehicleFuelSummaryContent = document.getElementById("vehicle-fuel-summary-content");
const vehicleAuditContent = document.getElementById("vehicle-audit-content");

function switchVehicleDetailsTab(tabName) {
  Object.keys(vehicleTabPanels).forEach((key) => {
    vehicleTabPanels[key].hidden = key !== tabName;
  });

  vehicleDetailsTabsContainer.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  if (tabName === "fuel") loadVehicleFuelSummaryTab();
  if (tabName === "audit") loadVehicleAuditTab();
}

vehicleDetailsTabsContainer.querySelectorAll("[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.hidden) return;
    switchVehicleDetailsTab(btn.dataset.tab);
  });
});

async function loadVehicleFuelSummaryTab() {
  if (!vehicleBeingViewed) return;
  vehicleFuelSummaryContent.innerHTML = skeletonCardsHtml(4, "summary-cards", "summary-card");

  const { data, error } = await supabaseClient
    .from("vehicle_fuel_summary")
    .select("total_liters, total_cost, transaction_count, average_cost_per_transaction")
    .eq("vehicle_id", vehicleBeingViewed.id)
    .maybeSingle();

  if (error) {
    console.error("Error loading vehicle fuel summary:", error);
    vehicleFuelSummaryContent.innerHTML = '<div class="table-state">حدث خطأ أثناء تحميل ملخص الوقود.</div>';
    return;
  }

  if (!data || !data.transaction_count) {
    vehicleFuelSummaryContent.innerHTML = '<div class="table-state">لا توجد معاملات وقود مسجّلة لهذه السيارة بعد.</div>';
    return;
  }

  vehicleFuelSummaryContent.innerHTML =
    '<div class="summary-cards">' +
    '<div class="summary-card"><span class="card-icon" aria-hidden="true">' + icon("fuel") + '</span><span class="summary-card-label">إجمالي اللترات</span>' +
    '<span class="summary-card-value">' + formatNumber(data.total_liters, 2) + "</span></div>" +
    '<div class="summary-card"><span class="card-icon" aria-hidden="true">' + icon("wallet") + '</span><span class="summary-card-label">إجمالي التكلفة</span>' +
    '<span class="summary-card-value">' + formatNumber(data.total_cost, 2) + " ر.س</span></div>" +
    '<div class="summary-card"><span class="card-icon" aria-hidden="true">' + icon("hash") + '</span><span class="summary-card-label">عدد المعاملات</span>' +
    '<span class="summary-card-value">' + (data.transaction_count || 0) + "</span></div>" +
    '<div class="summary-card"><span class="card-icon" aria-hidden="true">' + icon("chartBar") + '</span><span class="summary-card-label">متوسط تكلفة المعاملة</span>' +
    '<span class="summary-card-value">' + formatNumber(data.average_cost_per_transaction, 2) + " ر.س</span></div>" +
    "</div>";
}

async function loadVehicleAuditTab() {
  if (!vehicleBeingViewed) return;
  vehicleAuditContent.innerHTML = skeletonBlockHtml(4, 3);

  const { data, error } = await supabaseClient
    .from("audit_logs")
    .select("id, action, created_at, user_id")
    .eq("entity_type", "vehicles")
    .eq("entity_id", vehicleBeingViewed.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Error loading vehicle audit log:", error);
    vehicleAuditContent.innerHTML = '<div class="table-state">حدث خطأ أثناء تحميل سجل العمليات.</div>';
    return;
  }

  if (!data || data.length === 0) {
    vehicleAuditContent.innerHTML = '<div class="table-state">لا يوجد سجل عمليات لهذه السيارة بعد.</div>';
    return;
  }

  const creatorMap = await fetchCreatorNames(data.map((d) => d.user_id));
  const rows = data
    .map(
      (row) =>
        "<tr><td>" + formatDateTime(row.created_at) + "</td>" +
        "<td>" + escapeHtml(creatorMap[row.user_id] || "—") + "</td>" +
        "<td>" + escapeHtml(AUDIT_ACTION_LABELS[row.action] || row.action) + "</td></tr>"
    )
    .join("");

  vehicleAuditContent.innerHTML =
    '<div class="table-scroll"><table class="data-table"><thead><tr>' +
    "<th>الوقت</th><th>المستخدم</th><th>العملية</th>" +
    "</tr></thead><tbody>" + rows + "</tbody></table></div>";
}

// ---------------------------------------------------------------------------
// 4.3 إضافة / تعديل سيارة — Super Admin فقط (والـ RLS هو الضامن الحقيقي)
// ---------------------------------------------------------------------------

async function openVehicleForm(vehicle) {
  vehicleFormError.hidden = true;
  vehicleFormError.textContent = "";

  vehicleFormTitle.textContent = vehicle ? "تعديل بيانات السيارة" : "إضافة سيارة جديدة";
  vehicleFormIdInput.value = vehicle ? vehicle.id : "";
  vehicleFormPlateInput.value = vehicle ? vehicle.license_plate : "";
  vehicleFormMakeInput.value = vehicle && vehicle.make ? vehicle.make : "";
  vehicleFormYearInput.value = vehicle && vehicle.manufacturing_year ? vehicle.manufacturing_year : "";
  vehicleFormStatusSelect.value = vehicle ? vehicle.status : "available";
  vehicleFormActualUserNameInput.value = vehicle && vehicle.actual_user_name ? vehicle.actual_user_name : "";
  vehicleFormActualUserNationalIdInput.value =
    vehicle && vehicle.actual_user_national_id ? vehicle.actual_user_national_id : "";
  vehicleFormAuthorizationExpiryInput.value =
    vehicle && vehicle.authorization_expiry_date ? vehicle.authorization_expiry_date : "";

  await ensureActualUserNameOptions();

  vehicleFormModal.hidden = false;
}

addVehicleButton.addEventListener("click", () => openVehicleForm(null));

vehicleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  vehicleFormError.hidden = true;
  vehicleFormError.textContent = "";

  const licensePlate = vehicleFormPlateInput.value.trim();

  if (!licensePlate) {
    vehicleFormError.textContent = "رقم اللوحة حقل مطلوب.";
    vehicleFormError.hidden = false;
    return;
  }

  // رقم الهوية الوطنية (للسعوديين) بيبدأ بـ 1، ورقم الإقامة (للمقيمين) بيبدأ
  // بـ 2 — في الحالتين 10 أرقام بالظبط. الحقل اختياري، فالفحص فقط لو اتكتب حاجة
  const actualUserNationalId = vehicleFormActualUserNationalIdInput.value.trim();
  if (actualUserNationalId && !/^[12]\d{9}$/.test(actualUserNationalId)) {
    vehicleFormError.textContent =
      "رقم الهوية/الإقامة يجب أن يكون 10 أرقام بالضبط، ويبدأ بـ 1 (هوية وطنية) أو 2 (إقامة).";
    vehicleFormError.hidden = false;
    return;
  }

  const payload = {
    license_plate: licensePlate,
    make: vehicleFormMakeInput.value.trim() || null,
    manufacturing_year: vehicleFormYearInput.value ? Number(vehicleFormYearInput.value) : null,
    status: vehicleFormStatusSelect.value,
    actual_user_name: vehicleFormActualUserNameInput.value.trim() || null,
    actual_user_national_id: actualUserNationalId || null,
    authorization_expiry_date: vehicleFormAuthorizationExpiryInput.value || null,
  };

  vehicleFormSubmitButton.disabled = true;
  vehicleFormSubmitButton.textContent = "جارٍ الحفظ...";

  try {
    const editingId = vehicleFormIdInput.value;
    let error;

    if (editingId) {
      ({ error } = await supabaseClient.from("vehicles").update(payload).eq("id", editingId));
    } else {
      payload.created_by = currentAuthUser ? currentAuthUser.id : null;
      const insertResult = await supabaseClient.from("vehicles").insert(payload).select().single();
      error = insertResult.error;
    }

    if (error) {
      console.error("Error saving vehicle:", error);

      if (error.code === "23505") {
        // Postgres unique_violation — رقم اللوحة مكرر
        vehicleFormError.textContent = "رقم اللوحة مستخدم بالفعل لسيارة أخرى.";
      } else if (
        error.code === "42501" ||
        (error.message && error.message.toLowerCase().includes("row-level security"))
      ) {
        // الرفض جاي من RLS في قاعدة البيانات نفسها، غير فقط من الواجهة
        vehicleFormError.textContent = "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك).";
      } else {
        vehicleFormError.textContent = "حدث خطأ أثناء الحفظ: " + error.message;
      }

      vehicleFormError.hidden = false;
      return;
    }

    actualUserNamesCache = null; // حتى الاسم الجديد يظهر كاقتراح من أول مرة
    vehicleFormModal.hidden = true;
    loadVehicles();
  } catch (unexpectedError) {
    console.error("Unexpected error saving vehicle:", unexpectedError);
    vehicleFormError.textContent = "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
    vehicleFormError.hidden = false;
  } finally {
    vehicleFormSubmitButton.disabled = false;
    vehicleFormSubmitButton.textContent = "حفظ";
  }
});

// ============================================================================
// 5. موديول الوقود (Fuel) — Phase 3
// ============================================================================

const FUEL_PAGE_SIZE = 20;

let fuelState = {
  page: 1,
  vehicleSearch: "",
  dateFrom: "",
  dateTo: "",
  showVoided: false,
  totalCount: 0,
};

let fuelVehiclesCache = null; // كاش لقائمة السيارات المستخدمة في dropdown الفورم

// عناصر قائمة الوقود
const fuelTableBody = document.getElementById("fuel-table-body");
const fuelStateBox = document.getElementById("fuel-state");
const fuelVehicleSearchInput = document.getElementById("fuel-vehicle-search");
const fuelDateFromInput = document.getElementById("fuel-date-from");
const fuelDateToInput = document.getElementById("fuel-date-to");
const fuelShowVoidedCheckbox = document.getElementById("fuel-show-voided");
const fuelPrevPageButton = document.getElementById("fuel-prev-page");
const fuelNextPageButton = document.getElementById("fuel-next-page");
const fuelPaginationInfo = document.getElementById("fuel-pagination-info");

// عناصر كروت الملخص
const fuelSummaryLiters = document.getElementById("fuel-summary-liters");
const fuelSummaryAmount = document.getElementById("fuel-summary-amount");
const fuelSummaryCount = document.getElementById("fuel-summary-count");
const fuelSummaryAverage = document.getElementById("fuel-summary-average");

// عناصر Modal الإضافة/التعديل
const fuelFormModal = document.getElementById("fuel-form-modal");
const fuelForm = document.getElementById("fuel-form");
const fuelFormTitle = document.getElementById("fuel-form-title");
const fuelFormIdInput = document.getElementById("fuel-form-id");
const fuelFormVehicleSelect = document.getElementById("fuel-form-vehicle");
const fuelFormDateInput = document.getElementById("fuel-form-date");
const fuelFormLitersInput = document.getElementById("fuel-form-liters");
const fuelFormAmountInput = document.getElementById("fuel-form-amount");
const fuelFormError = document.getElementById("fuel-form-error");
const fuelFormSubmitButton = document.getElementById("fuel-form-submit");

// عناصر Modal تأكيد الإلغاء (Void)
const fuelVoidModal = document.getElementById("fuel-void-modal");
const fuelVoidIdInput = document.getElementById("fuel-void-id");
const fuelVoidReasonInput = document.getElementById("fuel-void-reason");
const fuelVoidError = document.getElementById("fuel-void-error");
const fuelVoidConfirmButton = document.getElementById("fuel-void-confirm");

let fuelTransactionBeingVoided = null;

// ---------------------------------------------------------------------------
// 5.1 قائمة السيارات لاستخدامها في dropdown فورم الوقود (Cache بسيط)
// ---------------------------------------------------------------------------

async function ensureFuelVehicleOptions() {
  if (fuelVehiclesCache) return fuelVehiclesCache;

  const { data, error } = await supabaseClient
    .from("vehicles")
    .select("id, license_plate, actual_user_name")
    .order("license_plate", { ascending: true });

  if (error) {
    console.error("Error loading vehicles for fuel form:", error);
    fuelVehiclesCache = [];
    return fuelVehiclesCache;
  }

  fuelVehiclesCache = data || [];
  fuelFormVehicleSelect.innerHTML =
    '<option value="">اختر السيارة</option>' +
    fuelVehiclesCache
      .map((v) => {
        // بيظهر باسم المستخدم الفعلي مع رقم اللوحة حتى يكون سهل تعرف
        // السيارة الخاصة بـ مين وانت بتختار من القائمة، غير رقم اللوحة فقط
        const label = v.actual_user_name
          ? v.actual_user_name + " — " + v.license_plate
          : v.license_plate;
        return '<option value="' + v.id + '">' + escapeHtml(label) + "</option>";
      })
      .join("");

  return fuelVehiclesCache;
}

// ---------------------------------------------------------------------------
// 5.2 جلب وعرض القائمة (بحث بالسيارة + فلتر تاريخ + حالة + Pagination)
// ---------------------------------------------------------------------------

function setFuelState(message) {
  fuelStateBox.classList.remove("is-rich");
  if (!message) {
    fuelStateBox.hidden = true;
    fuelStateBox.textContent = "";
    return;
  }
  fuelStateBox.hidden = false;
  fuelStateBox.textContent = message;
}

function updateFuelSummary(rows) {
  const totalLiters = rows.reduce((sum, r) => sum + Number(r.liters || 0), 0);
  const totalAmount = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  fuelSummaryLiters.textContent = formatNumber(totalLiters, 2);
  fuelSummaryAmount.textContent = formatNumber(totalAmount, 2);
  fuelSummaryCount.textContent = String(rows.length);
  fuelSummaryAverage.textContent = rows.length ? formatNumber(totalAmount / rows.length, 2) : formatNumber(0, 2);
}

// بيجيب إجمالي كل المعاملات المطابقة للفلاتر الحالية (بحث/تاريخ/إظهار
// الملغاة)، غير فقط صفحة الجدول المعروضة — حتى كروت الملخص فوق تعكس
// الفلتر كله كما هو متوقع، غير الـ٢٠ صف فقط
async function fetchFuelSummaryTotals() {
  const buildQuery = () => {
    let q = supabaseClient
      .from("fuel_transactions")
      .select("liters, amount, vehicle:vehicles!inner ( license_plate, actual_user_name )");

    if (!fuelState.showVoided) {
      q = q.eq("status", "active");
    }
    if (fuelState.vehicleSearch) {
      const term = "%" + fuelState.vehicleSearch + "%";
      q = q.or("license_plate.ilike." + term + ",actual_user_name.ilike." + term, { foreignTable: "vehicle" });
    }
    if (fuelState.dateFrom) {
      q = q.gte("transaction_date", fuelState.dateFrom);
    }
    if (fuelState.dateTo) {
      q = q.lte("transaction_date", fuelState.dateTo);
    }
    return q;
  };

  return fetchAllRowsPaged(buildQuery);
}

function renderFuelRows(rows) {
  fuelTableBody.innerHTML = "";
  const isSuperAdmin = !!(currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "admin"));

  rows.forEach((tx) => {
    const tr = document.createElement("tr");
    if (tx.status === "voided") tr.classList.add("row-voided");

    const vehicleNumber = tx.vehicle ? tx.vehicle.license_plate : "—";
    const actualUserName = tx.vehicle && tx.vehicle.actual_user_name ? tx.vehicle.actual_user_name : "—";
    const isVoided = tx.status === "voided";
    const statusLabel = isVoided ? "ملغاة" : "نشطة";
    const statusClass = isVoided ? "status-voided" : "status-active";

    let actionsHtml = '<span class="text-muted">—</span>';
    if (isSuperAdmin && !isVoided) {
      actionsHtml =
        '<button type="button" class="btn-secondary btn-sm fuel-edit-btn">تعديل</button>' +
        '<button type="button" class="btn-danger btn-sm fuel-void-btn">إلغاء</button>';
    }

    tr.innerHTML =
      "<td>" + formatMonthOnly(tx.transaction_date) + "</td>" +
      "<td>" + escapeHtml(vehicleNumber) + "</td>" +
      "<td>" + escapeHtml(actualUserName) + "</td>" +
      "<td>" + formatNumber(tx.liters, 2) + "</td>" +
      "<td>" + formatNumber(tx.amount, 2) + " ر.س</td>" +
      '<td><span class="status-badge ' + statusClass + '">' + statusLabel + "</span></td>" +
      '<td class="actions-cell">' + actionsHtml + "</td>";

    if (isSuperAdmin && !isVoided) {
      tr.querySelector(".fuel-edit-btn").addEventListener("click", () => openFuelForm(tx));
      tr.querySelector(".fuel-void-btn").addEventListener("click", () => openFuelVoidConfirm(tx));
    }

    fuelTableBody.appendChild(tr);
  });
}

function updateFuelPaginationControls() {
  const totalPages = Math.max(1, Math.ceil(fuelState.totalCount / FUEL_PAGE_SIZE));

  fuelPaginationInfo.textContent = fuelState.totalCount
    ? "صفحة " + fuelState.page + " من " + totalPages + " — إجمالي " + fuelState.totalCount + " معاملة"
    : "";

  fuelPrevPageButton.disabled = fuelState.page <= 1;
  fuelNextPageButton.disabled = fuelState.page >= totalPages;
}

async function loadFuelTransactions() {
  renderTableSkeleton(fuelTableBody, 6, 8);
  setFuelState(null);
  fuelPrevPageButton.disabled = true;
  fuelNextPageButton.disabled = true;
  updateFuelSummary([]);

  const from = (fuelState.page - 1) * FUEL_PAGE_SIZE;
  const to = from + FUEL_PAGE_SIZE - 1;

  // vehicle_id مطلوب دائمًا (not null) فاستخدام !inner هنا آمن ولا يستبعد
  // أي صف فعلي، ويسمح لنا بالفلترة على vehicle.license_plate عند الحاجة
  let query = supabaseClient
    .from("fuel_transactions")
    .select(
      "id, transaction_date, liters, amount, status, created_by, created_at, vehicle_id, " +
        "vehicle:vehicles!inner ( license_plate, actual_user_name )",
      { count: "exact" }
    )
    .order("transaction_date", { ascending: false })
    .range(from, to);

  if (!fuelState.showVoided) {
    query = query.eq("status", "active");
  }

  if (fuelState.vehicleSearch) {
    const term = "%" + fuelState.vehicleSearch + "%";
    query = query.or("license_plate.ilike." + term + ",actual_user_name.ilike." + term, { foreignTable: "vehicle" });
  }

  if (fuelState.dateFrom) {
    query = query.gte("transaction_date", fuelState.dateFrom);
  }

  if (fuelState.dateTo) {
    query = query.lte("transaction_date", fuelState.dateTo);
  }

  const [{ data, error, count }, summaryResult] = await Promise.all([query, fetchFuelSummaryTotals()]);

  if (summaryResult.error) {
    console.error("Error loading fuel summary totals:", summaryResult.error);
  } else {
    updateFuelSummary(summaryResult.data || []);
  }

  if (error) {
    console.error("Error loading fuel transactions:", error);
    setFuelState("تعذر تحميل معاملات الوقود. يُرجى المحاولة مرة أخرى.");
    fuelPaginationInfo.textContent = "";
    if (summaryResult.error) updateFuelSummary([]);
    return;
  }

  fuelState.totalCount = count || 0;

  if (!data || data.length === 0) {
    if (fuelState.vehicleSearch || fuelState.dateFrom || fuelState.dateTo) {
      showRichEmptyState(
        fuelStateBox,
        icon("fuel"),
        "لا توجد نتائج مطابقة",
        "لا توجد معاملة وقود تطابق البحث أو الفترة الزمنية المحددة حاليًا.",
        '<button type="button" class="btn-secondary btn-sm" id="fuel-clear-filters-button">مسح الفلاتر</button>'
      );
      document.getElementById("fuel-clear-filters-button").addEventListener("click", () => {
        fuelVehicleSearchInput.value = "";
        fuelDateFromInput.value = "";
        fuelDateToInput.value = "";
        fuelState.vehicleSearch = "";
        fuelState.dateFrom = "";
        fuelState.dateTo = "";
        fuelState.page = 1;
        loadFuelTransactions();
      });
    } else {
      const isSuperAdmin = !!(currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "admin"));
      showRichEmptyState(
        fuelStateBox,
        icon("fuel"),
        "لا توجد معاملات وقود بعد",
        "لا توجد أي معاملة وقود مسجّلة بعد. سجّل أول معاملة يدويًا أو استورد دفعة كاملة من Excel.",
        isSuperAdmin
          ? '<button type="button" class="btn-primary" id="empty-add-fuel-button">+ إضافة أول معاملة وقود</button>'
          : ""
      );
      if (isSuperAdmin) {
        document.getElementById("empty-add-fuel-button").addEventListener("click", () => openFuelForm(null));
      }
    }
    updateFuelPaginationControls();
    return;
  }

  setFuelState(null);

  // اسم "المُدخل" اتشال من الجدول هذا — موجود بالتفصيل في سجل العمليات
  // (Audit Log) أصلًا، فلا داعي لتكراره هنا
  renderFuelRows(data);
  updateFuelPaginationControls();
}

let fuelSearchDebounce;
fuelVehicleSearchInput.addEventListener("input", () => {
  clearTimeout(fuelSearchDebounce);
  fuelSearchDebounce = setTimeout(() => {
    fuelState.vehicleSearch = fuelVehicleSearchInput.value.trim();
    fuelState.page = 1;
    loadFuelTransactions();
  }, 300);
});

// حقول الفلتر بقت من نوع "شهر" (نفس طبيعة عرض التاريخ في الجدول)، فبنحول
// قيمة "YYYY-MM" لأول/آخر يوم في الشهر حتى نستخدمها في فلترة عمود
// transaction_date التي لا يزال من نوع date في القاعدة
function monthValueToStartDate(monthValue) {
  return monthValue ? monthValue + "-01" : "";
}

function monthValueToEndDate(monthValue) {
  if (!monthValue) return "";
  const [year, month] = monthValue.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return monthValue + "-" + String(lastDay).padStart(2, "0");
}

fuelDateFromInput.addEventListener("change", () => {
  fuelState.dateFrom = monthValueToStartDate(fuelDateFromInput.value);
  fuelState.page = 1;
  loadFuelTransactions();
});

fuelDateToInput.addEventListener("change", () => {
  fuelState.dateTo = monthValueToEndDate(fuelDateToInput.value);
  fuelState.page = 1;
  loadFuelTransactions();
});

fuelShowVoidedCheckbox.addEventListener("change", () => {
  fuelState.showVoided = fuelShowVoidedCheckbox.checked;
  fuelState.page = 1;
  loadFuelTransactions();
});

fuelPrevPageButton.addEventListener("click", () => {
  if (fuelState.page > 1) {
    fuelState.page -= 1;
    loadFuelTransactions();
  }
});

fuelNextPageButton.addEventListener("click", () => {
  const totalPages = Math.max(1, Math.ceil(fuelState.totalCount / FUEL_PAGE_SIZE));
  if (fuelState.page < totalPages) {
    fuelState.page += 1;
    loadFuelTransactions();
  }
});

// ---------------------------------------------------------------------------
// 5.3 إضافة / تعديل معاملة وقود — Super Admin فقط (RLS هو الضامن الحقيقي)
// ---------------------------------------------------------------------------

async function openFuelForm(tx) {
  fuelFormError.hidden = true;
  fuelFormError.textContent = "";

  await ensureFuelVehicleOptions();

  fuelFormTitle.textContent = tx ? "تعديل معاملة وقود" : "إضافة معاملة وقود";
  fuelFormIdInput.value = tx ? tx.id : "";
  fuelFormVehicleSelect.value = tx ? tx.vehicle_id : "";
  fuelFormDateInput.value = tx ? tx.transaction_date : "";
  fuelFormLitersInput.value = tx ? tx.liters : "";
  fuelFormAmountInput.value = tx ? tx.amount : "";

  fuelFormModal.hidden = false;
}

addFuelButton.addEventListener("click", () => openFuelForm(null));

// ---------------------------------------------------------------------------
// تنبيه إذا كانت الكمية/التكلفة المدخلة أعلى بكثير من متوسط السيارة هذه — يرصد
// أخطاء الكتابة المبكرة (مثل زيادة صفر بالخطأ). تحذير فقط، وليس منعًا، والمستخدم
// يستطيع التأكيد والمتابعة بشكل طبيعي إذا كان الرقم صحيحًا فعلًا
// ---------------------------------------------------------------------------

const FUEL_ANOMALY_MULTIPLIER = 2.5;
const FUEL_ANOMALY_MIN_HISTORY = 3;

async function confirmFuelAmountIfAnomalous(vehicleId, liters, amount, excludeTransactionId) {
  const { data, error } = await supabaseClient
    .from("vehicle_fuel_summary")
    .select("total_liters, total_cost, transaction_count")
    .eq("vehicle_id", vehicleId)
    .maybeSingle();

  if (error || !data) return true;

  let count = data.transaction_count || 0;
  let totalLiters = Number(data.total_liters || 0);
  let totalCost = Number(data.total_cost || 0);

  // لو نعدّل معاملة موجودة، نشيلها من المتوسط حتى القيمة لا تُقارَن بنفسها
  if (excludeTransactionId) {
    const { data: existingTx } = await supabaseClient
      .from("fuel_transactions")
      .select("liters, amount, status")
      .eq("id", excludeTransactionId)
      .maybeSingle();

    if (existingTx && existingTx.status === "active") {
      count -= 1;
      totalLiters -= Number(existingTx.liters || 0);
      totalCost -= Number(existingTx.amount || 0);
    }
  }

  // لا يوجد تاريخ كفاية للسيارة هذه حتى نقارن بثقة
  if (count < FUEL_ANOMALY_MIN_HISTORY) return true;

  const avgLiters = totalLiters / count;
  const avgAmount = totalCost / count;

  const litersIsHigh = avgLiters > 0 && liters > avgLiters * FUEL_ANOMALY_MULTIPLIER;
  const amountIsHigh = avgAmount > 0 && amount > avgAmount * FUEL_ANOMALY_MULTIPLIER;

  if (!litersIsHigh && !amountIsHigh) return true;

  const lines = ["الرقم الذي أدخلته أعلى بكثير من المعتاد لنفس السيارة:"];
  if (litersIsHigh) {
    lines.push("• اللترات: " + formatNumber(liters, 2) + " مقابل متوسط " + formatNumber(avgLiters, 2) + " لتر.");
  }
  if (amountIsHigh) {
    lines.push("• التكلفة: " + formatNumber(amount, 2) + " ر.س مقابل متوسط " + formatNumber(avgAmount, 2) + " ر.س.");
  }
  lines.push("هل أنت متأكد من صحة الرقم وترغب في إتمام الحفظ؟");

  return window.confirm(lines.join("\n"));
}

fuelForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  fuelFormError.hidden = true;
  fuelFormError.textContent = "";

  const vehicleId = fuelFormVehicleSelect.value;
  const date = fuelFormDateInput.value;
  const litersRaw = fuelFormLitersInput.value;
  const amountRaw = fuelFormAmountInput.value;
  const liters = Number(litersRaw);
  const amount = Number(amountRaw);

  // ---- Validation (مطابق للبند 11 في متطلبات النظام) ----
  if (!vehicleId) {
    fuelFormError.textContent = "السيارة مطلوبة — من فضلك اختر سيارة موجودة فعليًا.";
    fuelFormError.hidden = false;
    return;
  }
  if (!date) {
    fuelFormError.textContent = "التاريخ مطلوب.";
    fuelFormError.hidden = false;
    return;
  }
  if (!litersRaw || Number.isNaN(liters) || liters <= 0) {
    fuelFormError.textContent = "اللترات يجب أن تكون رقمًا أكبر من صفر.";
    fuelFormError.hidden = false;
    return;
  }
  if (!amountRaw || Number.isNaN(amount) || amount < 0) {
    fuelFormError.textContent = "التكلفة يجب أن تكون رقمًا ولا تكون سالبة.";
    fuelFormError.hidden = false;
    return;
  }

  const editingIdForAnomalyCheck = fuelFormIdInput.value;
  const proceedDespiteAnomaly = await confirmFuelAmountIfAnomalous(
    vehicleId,
    liters,
    amount,
    editingIdForAnomalyCheck
  );
  if (!proceedDespiteAnomaly) return;

  const payload = {
    vehicle_id: vehicleId,
    transaction_date: date,
    liters: liters,
    amount: amount,
  };

  fuelFormSubmitButton.disabled = true;
  fuelFormSubmitButton.textContent = "جارٍ الحفظ...";

  try {
    const editingId = fuelFormIdInput.value;
    let error;

    if (editingId) {
      payload.updated_by = currentAuthUser ? currentAuthUser.id : null;
      ({ error } = await supabaseClient.from("fuel_transactions").update(payload).eq("id", editingId));
    } else {
      payload.created_by = currentAuthUser ? currentAuthUser.id : null;
      ({ error } = await supabaseClient.from("fuel_transactions").insert(payload));
    }

    if (error) {
      console.error("Error saving fuel transaction:", error);

      if (
        error.code === "42501" ||
        (error.message && error.message.toLowerCase().includes("row-level security"))
      ) {
        // الرفض جاي من RLS في قاعدة البيانات نفسها، غير فقط من الواجهة
        fuelFormError.textContent = "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك).";
      } else if (error.code === "23503") {
        fuelFormError.textContent = "السيارة المختارة غير موجودة فعليًا.";
      } else if (error.code === "23514") {
        fuelFormError.textContent = "البيانات المدخلة لا تحقق شروط الصحة (تأكد من اللترات والتكلفة).";
      } else {
        fuelFormError.textContent = "حدث خطأ أثناء الحفظ: " + error.message;
      }

      fuelFormError.hidden = false;
      return;
    }

    fuelFormModal.hidden = true;
    loadFuelTransactions();
  } catch (unexpectedError) {
    console.error("Unexpected error saving fuel transaction:", unexpectedError);
    fuelFormError.textContent = "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
    fuelFormError.hidden = false;
  } finally {
    fuelFormSubmitButton.disabled = false;
    fuelFormSubmitButton.textContent = "حفظ";
  }
});

// ---------------------------------------------------------------------------
// 5.4 إلغاء معاملة (Void) — بدل الحذف النهائي (مطابق للبند 22)
// ---------------------------------------------------------------------------

function openFuelVoidConfirm(tx) {
  fuelTransactionBeingVoided = tx;
  fuelVoidReasonInput.value = "";
  fuelVoidError.hidden = true;
  fuelVoidError.textContent = "";
  fuelVoidModal.hidden = false;
}

fuelVoidConfirmButton.addEventListener("click", async () => {
  if (!fuelTransactionBeingVoided) return;

  fuelVoidError.hidden = true;
  fuelVoidConfirmButton.disabled = true;
  fuelVoidConfirmButton.textContent = "جارٍ الإلغاء...";

  try {
    const { error } = await supabaseClient
      .from("fuel_transactions")
      .update({
        status: "voided",
        void_reason: fuelVoidReasonInput.value.trim() || null,
        voided_by: currentAuthUser ? currentAuthUser.id : null,
        voided_at: new Date().toISOString(),
      })
      .eq("id", fuelTransactionBeingVoided.id);

    if (error) {
      console.error("Error voiding fuel transaction:", error);
      fuelVoidError.textContent =
        error.code === "42501" ||
        (error.message && error.message.toLowerCase().includes("row-level security"))
          ? "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك)."
          : "حدث خطأ أثناء الإلغاء: " + error.message;
      fuelVoidError.hidden = false;
      return;
    }

    fuelVoidModal.hidden = true;
    fuelTransactionBeingVoided = null;
    loadFuelTransactions();
  } catch (unexpectedError) {
    console.error("Unexpected error voiding fuel transaction:", unexpectedError);
    fuelVoidError.textContent = "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
    fuelVoidError.hidden = false;
  } finally {
    fuelVoidConfirmButton.disabled = false;
    fuelVoidConfirmButton.textContent = "تأكيد الإلغاء";
  }
});

// ============================================================================
// 5b. عهدة اللابتوبات (IT Assets — Laptops) — Phase 3
// ============================================================================

const LAPTOP_PAGE_SIZE = 20;

let laptopState = {
  page: 1,
  search: "",
  showVoided: false,
  totalCount: 0,
};

// عناصر قائمة اللابتوبات
const laptopTableBody = document.getElementById("laptop-table-body");
const laptopStateBox = document.getElementById("laptop-state");
const laptopSearchInput = document.getElementById("laptop-search");
const laptopShowVoidedCheckbox = document.getElementById("laptop-show-voided");
const laptopPrevPageButton = document.getElementById("laptop-prev-page");
const laptopNextPageButton = document.getElementById("laptop-next-page");
const laptopPaginationInfo = document.getElementById("laptop-pagination-info");
const addLaptopButton = document.getElementById("add-laptop-button");
const importLaptopsButton = document.getElementById("import-laptops-button");

// عناصر Modal الإضافة/التعديل
const laptopFormModal = document.getElementById("laptop-form-modal");
const laptopForm = document.getElementById("laptop-form");
const laptopFormTitle = document.getElementById("laptop-form-title");
const laptopFormIdInput = document.getElementById("laptop-form-id");
const laptopFormStaffIdInput = document.getElementById("laptop-form-staff-id");
const laptopFormStaffNameInput = document.getElementById("laptop-form-staff-name");
const laptopFormSerialInput = document.getElementById("laptop-form-serial");
const laptopFormAssetTagInput = document.getElementById("laptop-form-asset-tag");
const laptopFormJobPositionInput = document.getElementById("laptop-form-job-position");
const laptopFormLocationInput = document.getElementById("laptop-form-location");
const laptopFormAntivirusInput = document.getElementById("laptop-form-antivirus");
const laptopFormError = document.getElementById("laptop-form-error");
const laptopFormSubmitButton = document.getElementById("laptop-form-submit");

// عناصر Modal تأكيد الاسترداد (Void)
const laptopVoidModal = document.getElementById("laptop-void-modal");
const laptopVoidReasonInput = document.getElementById("laptop-void-reason");
const laptopVoidError = document.getElementById("laptop-void-error");
const laptopVoidConfirmButton = document.getElementById("laptop-void-confirm");

let laptopAssignmentBeingVoided = null;

function setLaptopState(message) {
  laptopStateBox.classList.remove("is-rich");
  if (!message) {
    laptopStateBox.hidden = true;
    laptopStateBox.textContent = "";
    return;
  }
  laptopStateBox.hidden = false;
  laptopStateBox.textContent = message;
}

function renderLaptopRows(rows) {
  laptopTableBody.innerHTML = "";
  const isAdminOrAbove = !!(currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "it_support"));

  rows.forEach((asset) => {
    const tr = document.createElement("tr");
    if (asset.status === "voided") tr.classList.add("row-voided");

    const isVoided = asset.status === "voided";
    const statusLabel = isVoided ? "مستردة" : "نشطة";
    const statusClass = isVoided ? "status-voided" : "status-active";
    const antivirusLabel = asset.antivirus_licensed ? "مفعّل" : "غير مفعّل";
    const antivirusClass = asset.antivirus_licensed ? "status-active" : "status-voided";

    let actionsHtml = '<span class="text-muted">—</span>';
    if (isAdminOrAbove && !isVoided) {
      actionsHtml =
        '<button type="button" class="btn-secondary btn-sm laptop-edit-btn">تعديل</button>' +
        '<button type="button" class="btn-danger btn-sm laptop-void-btn">استرداد</button>';
    }

    tr.innerHTML =
      "<td>" + escapeHtml(asset.staff_id || "—") + "</td>" +
      "<td>" + escapeHtml(asset.staff_name) + "</td>" +
      "<td>" + escapeHtml(asset.serial_number) + "</td>" +
      "<td>" + escapeHtml(asset.asset_tag || "—") + "</td>" +
      '<td><span class="status-badge ' + antivirusClass + '">' + antivirusLabel + "</span></td>" +
      "<td>" + escapeHtml(asset.job_position || "—") + "</td>" +
      "<td>" + escapeHtml(asset.staff_location || "—") + "</td>" +
      '<td><span class="status-badge ' + statusClass + '">' + statusLabel + "</span></td>" +
      '<td class="actions-cell">' + actionsHtml + "</td>";

    if (isAdminOrAbove && !isVoided) {
      tr.querySelector(".laptop-edit-btn").addEventListener("click", () => openLaptopForm(asset));
      tr.querySelector(".laptop-void-btn").addEventListener("click", () => openLaptopVoidConfirm(asset));
    }

    laptopTableBody.appendChild(tr);
  });
}

function updateLaptopPaginationControls() {
  const totalPages = Math.max(1, Math.ceil(laptopState.totalCount / LAPTOP_PAGE_SIZE));

  laptopPaginationInfo.textContent = laptopState.totalCount
    ? "صفحة " + laptopState.page + " من " + totalPages + " — إجمالي " + laptopState.totalCount + " لابتوب"
    : "";

  laptopPrevPageButton.disabled = laptopState.page <= 1;
  laptopNextPageButton.disabled = laptopState.page >= totalPages;
}

async function loadLaptopAssignments() {
  loadItAssetsSummary();
  renderTableSkeleton(laptopTableBody, 6, 9);
  setLaptopState(null);
  laptopPrevPageButton.disabled = true;
  laptopNextPageButton.disabled = true;

  const from = (laptopState.page - 1) * LAPTOP_PAGE_SIZE;
  const to = from + LAPTOP_PAGE_SIZE - 1;

  let query = supabaseClient
    .from("it_laptop_assignments")
    .select(
      "id, staff_id, staff_name, serial_number, asset_tag, antivirus_licensed, job_position, staff_location, status",
      { count: "exact" }
    )
    .order("staff_name", { ascending: true })
    .range(from, to);

  if (!laptopState.showVoided) {
    query = query.eq("status", "active");
  }

  if (laptopState.search) {
    const term = "%" + laptopState.search + "%";
    query = query.or(
      "staff_name.ilike." + term + ",staff_id.ilike." + term + ",serial_number.ilike." + term + ",asset_tag.ilike." + term
    );
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("Error loading laptop assignments:", error);
    setLaptopState("تعذر تحميل قائمة اللابتوبات. يُرجى المحاولة مرة أخرى.");
    laptopPaginationInfo.textContent = "";
    return;
  }

  laptopState.totalCount = count || 0;

  if (!data || data.length === 0) {
    if (laptopState.search) {
      showRichEmptyState(
        laptopStateBox,
        icon("chartBar"),
        "لا توجد نتائج مطابقة",
        "لا توجد سجلات تطابق الفلاتر الحالية.",
        '<button type="button" class="btn-secondary btn-sm" id="laptop-clear-filters-button">مسح الفلاتر</button>'
      );
      document.getElementById("laptop-clear-filters-button").addEventListener("click", () => {
        laptopSearchInput.value = "";
        laptopState.search = "";
        laptopState.page = 1;
        loadLaptopAssignments();
      });
    } else {
      const isAdminOrAbove = !!(currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "it_support"));
      showRichEmptyState(
        laptopStateBox,
        icon("chartBar"),
        "لا توجد لابتوبات مسجّلة بعد",
        "لا توجد أي عهدة لابتوب مسجّلة بعد. سجّل أول عهدة يدويًا أو استورد دفعة كاملة من Excel.",
        isAdminOrAbove
          ? '<button type="button" class="btn-primary" id="empty-add-laptop-button">+ إضافة أول لابتوب</button>'
          : ""
      );
      if (isAdminOrAbove) {
        document.getElementById("empty-add-laptop-button").addEventListener("click", () => openLaptopForm(null));
      }
    }
    updateLaptopPaginationControls();
    return;
  }

  setLaptopState(null);
  renderLaptopRows(data);
  updateLaptopPaginationControls();
}

let laptopSearchDebounce;
laptopSearchInput.addEventListener("input", () => {
  clearTimeout(laptopSearchDebounce);
  laptopSearchDebounce = setTimeout(() => {
    laptopState.search = laptopSearchInput.value.trim();
    laptopState.page = 1;
    loadLaptopAssignments();
  }, 300);
});

laptopShowVoidedCheckbox.addEventListener("change", () => {
  laptopState.showVoided = laptopShowVoidedCheckbox.checked;
  laptopState.page = 1;
  loadLaptopAssignments();
});

laptopPrevPageButton.addEventListener("click", () => {
  if (laptopState.page > 1) {
    laptopState.page -= 1;
    loadLaptopAssignments();
  }
});

laptopNextPageButton.addEventListener("click", () => {
  const totalPages = Math.max(1, Math.ceil(laptopState.totalCount / LAPTOP_PAGE_SIZE));
  if (laptopState.page < totalPages) {
    laptopState.page += 1;
    loadLaptopAssignments();
  }
});

// ---------------------------------------------------------------------------
// إضافة / تعديل عهدة لابتوب — Admin أو Super Admin فقط (RLS هو الضامن الحقيقي)
// ---------------------------------------------------------------------------

function openLaptopForm(asset) {
  laptopFormError.hidden = true;
  laptopFormError.textContent = "";

  laptopFormTitle.textContent = asset ? "تعديل لابتوب" : "إضافة لابتوب";
  laptopFormIdInput.value = asset ? asset.id : "";
  laptopFormStaffIdInput.value = asset ? asset.staff_id || "" : "";
  laptopFormStaffNameInput.value = asset ? asset.staff_name || "" : "";
  laptopFormSerialInput.value = asset ? asset.serial_number || "" : "";
  laptopFormAssetTagInput.value = asset ? asset.asset_tag || "" : "";
  laptopFormJobPositionInput.value = asset ? asset.job_position || "" : "";
  laptopFormLocationInput.value = asset ? asset.staff_location || "" : "";
  laptopFormAntivirusInput.checked = asset ? !!asset.antivirus_licensed : false;

  laptopFormModal.hidden = false;
}

addLaptopButton.addEventListener("click", () => openLaptopForm(null));

laptopForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  laptopFormError.hidden = true;
  laptopFormError.textContent = "";

  const staffName = laptopFormStaffNameInput.value.trim();
  const serialNumber = laptopFormSerialInput.value.trim();

  if (!staffName) {
    laptopFormError.textContent = "اسم الموظف مطلوب.";
    laptopFormError.hidden = false;
    return;
  }
  if (!serialNumber) {
    laptopFormError.textContent = "الرقم التسلسلي مطلوب.";
    laptopFormError.hidden = false;
    return;
  }

  const payload = {
    staff_id: laptopFormStaffIdInput.value.trim() || null,
    staff_name: staffName,
    serial_number: serialNumber,
    asset_tag: laptopFormAssetTagInput.value.trim() || null,
    antivirus_licensed: laptopFormAntivirusInput.checked,
    job_position: laptopFormJobPositionInput.value.trim() || null,
    staff_location: laptopFormLocationInput.value.trim() || null,
  };

  laptopFormSubmitButton.disabled = true;
  laptopFormSubmitButton.textContent = "جارٍ الحفظ...";

  try {
    const editingId = laptopFormIdInput.value;
    let error;

    if (editingId) {
      payload.updated_by = currentAuthUser ? currentAuthUser.id : null;
      ({ error } = await supabaseClient.from("it_laptop_assignments").update(payload).eq("id", editingId));
    } else {
      payload.created_by = currentAuthUser ? currentAuthUser.id : null;
      ({ error } = await supabaseClient.from("it_laptop_assignments").insert(payload));
    }

    if (error) {
      console.error("Error saving laptop assignment:", error);

      if (
        error.code === "42501" ||
        (error.message && error.message.toLowerCase().includes("row-level security"))
      ) {
        laptopFormError.textContent = "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك).";
      } else if (error.code === "23505") {
        laptopFormError.textContent = "هذا الرقم التسلسلي مسجَّل بالفعل لجهاز نشط آخر.";
      } else {
        laptopFormError.textContent = "حدث خطأ أثناء الحفظ: " + error.message;
      }

      laptopFormError.hidden = false;
      return;
    }

    laptopFormModal.hidden = true;
    loadLaptopAssignments();
  } catch (unexpectedError) {
    console.error("Unexpected error saving laptop assignment:", unexpectedError);
    laptopFormError.textContent = "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
    laptopFormError.hidden = false;
  } finally {
    laptopFormSubmitButton.disabled = false;
    laptopFormSubmitButton.textContent = "حفظ";
  }
});

// ---------------------------------------------------------------------------
// إلغاء/استرداد عهدة (Void) — بدل الحذف النهائي
// ---------------------------------------------------------------------------

function openLaptopVoidConfirm(asset) {
  laptopAssignmentBeingVoided = asset;
  laptopVoidReasonInput.value = "";
  laptopVoidError.hidden = true;
  laptopVoidError.textContent = "";
  laptopVoidModal.hidden = false;
}

laptopVoidConfirmButton.addEventListener("click", async () => {
  if (!laptopAssignmentBeingVoided) return;

  laptopVoidError.hidden = true;
  laptopVoidConfirmButton.disabled = true;
  laptopVoidConfirmButton.textContent = "جارٍ الاسترداد...";

  try {
    const { error } = await supabaseClient
      .from("it_laptop_assignments")
      .update({
        status: "voided",
        void_reason: laptopVoidReasonInput.value.trim() || null,
        voided_by: currentAuthUser ? currentAuthUser.id : null,
        voided_at: new Date().toISOString(),
      })
      .eq("id", laptopAssignmentBeingVoided.id);

    if (error) {
      console.error("Error voiding laptop assignment:", error);
      laptopVoidError.textContent =
        error.code === "42501" ||
        (error.message && error.message.toLowerCase().includes("row-level security"))
          ? "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك)."
          : "حدث خطأ أثناء الاسترداد: " + error.message;
      laptopVoidError.hidden = false;
      return;
    }

    laptopVoidModal.hidden = true;
    laptopAssignmentBeingVoided = null;
    loadLaptopAssignments();
  } catch (unexpectedError) {
    console.error("Unexpected error voiding laptop assignment:", unexpectedError);
    laptopVoidError.textContent = "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
    laptopVoidError.hidden = false;
  } finally {
    laptopVoidConfirmButton.disabled = false;
    laptopVoidConfirmButton.textContent = "تأكيد الاسترداد";
  }
});

// ============================================================================
// 5c. عهدة البريد الإلكتروني (IT Assets — Email) — Phase 4
// ============================================================================

const EMAIL_PAGE_SIZE = 20;

let emailState = {
  page: 1,
  search: "",
  showVoided: false,
  totalCount: 0,
};

// عناصر قائمة البريد الإلكتروني
const emailTableBody = document.getElementById("email-table-body");
const emailStateBox = document.getElementById("email-state");
const emailSearchInput = document.getElementById("email-search");
const emailShowVoidedCheckbox = document.getElementById("email-show-voided");
const emailPrevPageButton = document.getElementById("email-prev-page");
const emailNextPageButton = document.getElementById("email-next-page");
const emailPaginationInfo = document.getElementById("email-pagination-info");
const addEmailButton = document.getElementById("add-email-button");
const importEmailButton = document.getElementById("import-email-button");

// عناصر Modal الإضافة/التعديل
const emailFormModal = document.getElementById("email-form-modal");
const emailForm = document.getElementById("email-form");
const emailFormTitle = document.getElementById("email-form-title");
const emailFormIdInput = document.getElementById("email-form-id");
const emailFormStaffIdInput = document.getElementById("email-form-staff-id");
const emailFormStaffNameInput = document.getElementById("email-form-staff-name");
const emailFormAddressInput = document.getElementById("email-form-address");
const emailFormJobPositionInput = document.getElementById("email-form-job-position");
const emailFormLocationInput = document.getElementById("email-form-location");
const emailFormError = document.getElementById("email-form-error");
const emailFormSubmitButton = document.getElementById("email-form-submit");

// عناصر Modal تأكيد الاسترداد (Void)
const emailVoidModal = document.getElementById("email-void-modal");
const emailVoidReasonInput = document.getElementById("email-void-reason");
const emailVoidError = document.getElementById("email-void-error");
const emailVoidConfirmButton = document.getElementById("email-void-confirm");

let emailAssignmentBeingVoided = null;

function setEmailState(message) {
  emailStateBox.classList.remove("is-rich");
  if (!message) {
    emailStateBox.hidden = true;
    emailStateBox.textContent = "";
    return;
  }
  emailStateBox.hidden = false;
  emailStateBox.textContent = message;
}

function renderEmailRows(rows) {
  emailTableBody.innerHTML = "";
  const isAdminOrAbove = !!(currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "it_support"));

  rows.forEach((asset) => {
    const tr = document.createElement("tr");
    if (asset.status === "voided") tr.classList.add("row-voided");

    const isVoided = asset.status === "voided";
    const statusLabel = isVoided ? "مستردة" : "نشطة";
    const statusClass = isVoided ? "status-voided" : "status-active";

    let actionsHtml = '<span class="text-muted">—</span>';
    if (isAdminOrAbove && !isVoided) {
      actionsHtml =
        '<button type="button" class="btn-secondary btn-sm email-edit-btn">تعديل</button>' +
        '<button type="button" class="btn-danger btn-sm email-void-btn">استرداد</button>';
    }

    tr.innerHTML =
      "<td>" + escapeHtml(asset.staff_id || "—") + "</td>" +
      "<td>" + escapeHtml(asset.staff_name) + "</td>" +
      "<td>" + escapeHtml(asset.email_address) + "</td>" +
      "<td>" + escapeHtml(asset.job_position || "—") + "</td>" +
      "<td>" + escapeHtml(asset.staff_location || "—") + "</td>" +
      '<td><span class="status-badge ' + statusClass + '">' + statusLabel + "</span></td>" +
      '<td class="actions-cell">' + actionsHtml + "</td>";

    if (isAdminOrAbove && !isVoided) {
      tr.querySelector(".email-edit-btn").addEventListener("click", () => openEmailForm(asset));
      tr.querySelector(".email-void-btn").addEventListener("click", () => openEmailVoidConfirm(asset));
    }

    emailTableBody.appendChild(tr);
  });
}

function updateEmailPaginationControls() {
  const totalPages = Math.max(1, Math.ceil(emailState.totalCount / EMAIL_PAGE_SIZE));

  emailPaginationInfo.textContent = emailState.totalCount
    ? "صفحة " + emailState.page + " من " + totalPages + " — إجمالي " + emailState.totalCount + " بريد إلكتروني"
    : "";

  emailPrevPageButton.disabled = emailState.page <= 1;
  emailNextPageButton.disabled = emailState.page >= totalPages;
}

async function loadEmailAssignments() {
  loadItAssetsSummary();
  renderTableSkeleton(emailTableBody, 6, 7);
  setEmailState(null);
  emailPrevPageButton.disabled = true;
  emailNextPageButton.disabled = true;

  const from = (emailState.page - 1) * EMAIL_PAGE_SIZE;
  const to = from + EMAIL_PAGE_SIZE - 1;

  let query = supabaseClient
    .from("it_email_assignments")
    .select("id, staff_id, staff_name, email_address, job_position, staff_location, status", { count: "exact" })
    .order("staff_name", { ascending: true })
    .range(from, to);

  if (!emailState.showVoided) {
    query = query.eq("status", "active");
  }

  if (emailState.search) {
    const term = "%" + emailState.search + "%";
    query = query.or("staff_name.ilike." + term + ",staff_id.ilike." + term + ",email_address.ilike." + term);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("Error loading email assignments:", error);
    setEmailState("تعذر تحميل قائمة البريد الإلكتروني. يُرجى المحاولة مرة أخرى.");
    emailPaginationInfo.textContent = "";
    return;
  }

  emailState.totalCount = count || 0;

  if (!data || data.length === 0) {
    if (emailState.search) {
      showRichEmptyState(
        emailStateBox,
        icon("chartBar"),
        "لا توجد نتائج مطابقة",
        "لا توجد سجلات تطابق الفلاتر الحالية.",
        '<button type="button" class="btn-secondary btn-sm" id="email-clear-filters-button">مسح الفلاتر</button>'
      );
      document.getElementById("email-clear-filters-button").addEventListener("click", () => {
        emailSearchInput.value = "";
        emailState.search = "";
        emailState.page = 1;
        loadEmailAssignments();
      });
    } else {
      const isAdminOrAbove = !!(currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "it_support"));
      showRichEmptyState(
        emailStateBox,
        icon("chartBar"),
        "لا توجد بريدات إلكترونية مسجّلة بعد",
        "لا توجد أي عهدة بريد إلكتروني مسجّلة بعد. سجّل أول عهدة يدويًا أو استورد دفعة كاملة من Excel.",
        isAdminOrAbove
          ? '<button type="button" class="btn-primary" id="empty-add-email-button">+ إضافة أول بريد إلكتروني</button>'
          : ""
      );
      if (isAdminOrAbove) {
        document.getElementById("empty-add-email-button").addEventListener("click", () => openEmailForm(null));
      }
    }
    updateEmailPaginationControls();
    return;
  }

  setEmailState(null);
  renderEmailRows(data);
  updateEmailPaginationControls();
}

let emailSearchDebounce;
emailSearchInput.addEventListener("input", () => {
  clearTimeout(emailSearchDebounce);
  emailSearchDebounce = setTimeout(() => {
    emailState.search = emailSearchInput.value.trim();
    emailState.page = 1;
    loadEmailAssignments();
  }, 300);
});

emailShowVoidedCheckbox.addEventListener("change", () => {
  emailState.showVoided = emailShowVoidedCheckbox.checked;
  emailState.page = 1;
  loadEmailAssignments();
});

emailPrevPageButton.addEventListener("click", () => {
  if (emailState.page > 1) {
    emailState.page -= 1;
    loadEmailAssignments();
  }
});

emailNextPageButton.addEventListener("click", () => {
  const totalPages = Math.max(1, Math.ceil(emailState.totalCount / EMAIL_PAGE_SIZE));
  if (emailState.page < totalPages) {
    emailState.page += 1;
    loadEmailAssignments();
  }
});

// ---------------------------------------------------------------------------
// إضافة / تعديل عهدة بريد إلكتروني — Admin أو Super Admin فقط (RLS هو الضامن)
// ---------------------------------------------------------------------------

function openEmailForm(asset) {
  emailFormError.hidden = true;
  emailFormError.textContent = "";

  emailFormTitle.textContent = asset ? "تعديل بريد إلكتروني" : "إضافة بريد إلكتروني";
  emailFormIdInput.value = asset ? asset.id : "";
  emailFormStaffIdInput.value = asset ? asset.staff_id || "" : "";
  emailFormStaffNameInput.value = asset ? asset.staff_name || "" : "";
  emailFormAddressInput.value = asset ? asset.email_address || "" : "";
  emailFormJobPositionInput.value = asset ? asset.job_position || "" : "";
  emailFormLocationInput.value = asset ? asset.staff_location || "" : "";

  emailFormModal.hidden = false;
}

addEmailButton.addEventListener("click", () => openEmailForm(null));

emailForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  emailFormError.hidden = true;
  emailFormError.textContent = "";

  const staffName = emailFormStaffNameInput.value.trim();
  const emailAddress = emailFormAddressInput.value.trim();

  if (!staffName) {
    emailFormError.textContent = "اسم الموظف مطلوب.";
    emailFormError.hidden = false;
    return;
  }
  if (!emailAddress) {
    emailFormError.textContent = "البريد الإلكتروني مطلوب.";
    emailFormError.hidden = false;
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress)) {
    emailFormError.textContent = "صيغة البريد الإلكتروني غير صحيحة.";
    emailFormError.hidden = false;
    return;
  }

  const payload = {
    staff_id: emailFormStaffIdInput.value.trim() || null,
    staff_name: staffName,
    email_address: emailAddress,
    job_position: emailFormJobPositionInput.value.trim() || null,
    staff_location: emailFormLocationInput.value.trim() || null,
  };

  emailFormSubmitButton.disabled = true;
  emailFormSubmitButton.textContent = "جارٍ الحفظ...";

  try {
    const editingId = emailFormIdInput.value;
    let error;

    if (editingId) {
      payload.updated_by = currentAuthUser ? currentAuthUser.id : null;
      ({ error } = await supabaseClient.from("it_email_assignments").update(payload).eq("id", editingId));
    } else {
      payload.created_by = currentAuthUser ? currentAuthUser.id : null;
      ({ error } = await supabaseClient.from("it_email_assignments").insert(payload));
    }

    if (error) {
      console.error("Error saving email assignment:", error);

      if (
        error.code === "42501" ||
        (error.message && error.message.toLowerCase().includes("row-level security"))
      ) {
        emailFormError.textContent = "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك).";
      } else if (error.code === "23505") {
        emailFormError.textContent = "هذا البريد الإلكتروني مسجَّل بالفعل لموظف نشط آخر.";
      } else {
        emailFormError.textContent = "حدث خطأ أثناء الحفظ: " + error.message;
      }

      emailFormError.hidden = false;
      return;
    }

    emailFormModal.hidden = true;
    loadEmailAssignments();
  } catch (unexpectedError) {
    console.error("Unexpected error saving email assignment:", unexpectedError);
    emailFormError.textContent = "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
    emailFormError.hidden = false;
  } finally {
    emailFormSubmitButton.disabled = false;
    emailFormSubmitButton.textContent = "حفظ";
  }
});

// ---------------------------------------------------------------------------
// إلغاء/استرداد عهدة (Void) — بدل الحذف النهائي
// ---------------------------------------------------------------------------

function openEmailVoidConfirm(asset) {
  emailAssignmentBeingVoided = asset;
  emailVoidReasonInput.value = "";
  emailVoidError.hidden = true;
  emailVoidError.textContent = "";
  emailVoidModal.hidden = false;
}

emailVoidConfirmButton.addEventListener("click", async () => {
  if (!emailAssignmentBeingVoided) return;

  emailVoidError.hidden = true;
  emailVoidConfirmButton.disabled = true;
  emailVoidConfirmButton.textContent = "جارٍ الاسترداد...";

  try {
    const { error } = await supabaseClient
      .from("it_email_assignments")
      .update({
        status: "voided",
        void_reason: emailVoidReasonInput.value.trim() || null,
        voided_by: currentAuthUser ? currentAuthUser.id : null,
        voided_at: new Date().toISOString(),
      })
      .eq("id", emailAssignmentBeingVoided.id);

    if (error) {
      console.error("Error voiding email assignment:", error);
      emailVoidError.textContent =
        error.code === "42501" ||
        (error.message && error.message.toLowerCase().includes("row-level security"))
          ? "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك)."
          : "حدث خطأ أثناء الاسترداد: " + error.message;
      emailVoidError.hidden = false;
      return;
    }

    emailVoidModal.hidden = true;
    emailAssignmentBeingVoided = null;
    loadEmailAssignments();
  } catch (unexpectedError) {
    console.error("Unexpected error voiding email assignment:", unexpectedError);
    emailVoidError.textContent = "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
    emailVoidError.hidden = false;
  } finally {
    emailVoidConfirmButton.disabled = false;
    emailVoidConfirmButton.textContent = "تأكيد الاسترداد";
  }
});

// ============================================================================
// 5d. عهدة أرقام الجوال (IT Assets — SIM) — Phase 5
// ============================================================================

const SIM_PAGE_SIZE = 20;

let simState = {
  page: 1,
  search: "",
  showVoided: false,
  totalCount: 0,
};

// عناصر قائمة أرقام الجوال
const simTableBody = document.getElementById("sim-table-body");
const simStateBox = document.getElementById("sim-state");
const simSearchInput = document.getElementById("sim-search");
const simShowVoidedCheckbox = document.getElementById("sim-show-voided");
const simPrevPageButton = document.getElementById("sim-prev-page");
const simNextPageButton = document.getElementById("sim-next-page");
const simPaginationInfo = document.getElementById("sim-pagination-info");
const addSimButton = document.getElementById("add-sim-button");
const importSimButton = document.getElementById("import-sim-button");

// عناصر Modal الإضافة/التعديل
const simFormModal = document.getElementById("sim-form-modal");
const simForm = document.getElementById("sim-form");
const simFormTitle = document.getElementById("sim-form-title");
const simFormIdInput = document.getElementById("sim-form-id");
const simFormStaffIdInput = document.getElementById("sim-form-staff-id");
const simFormStaffNameInput = document.getElementById("sim-form-staff-name");
const simFormNumberInput = document.getElementById("sim-form-number");
const simFormJobPositionInput = document.getElementById("sim-form-job-position");
const simFormLocationInput = document.getElementById("sim-form-location");
const simFormError = document.getElementById("sim-form-error");
const simFormSubmitButton = document.getElementById("sim-form-submit");

// عناصر Modal تأكيد الاسترداد (Void)
const simVoidModal = document.getElementById("sim-void-modal");
const simVoidReasonInput = document.getElementById("sim-void-reason");
const simVoidError = document.getElementById("sim-void-error");
const simVoidConfirmButton = document.getElementById("sim-void-confirm");

let simAssignmentBeingVoided = null;

function setSimState(message) {
  simStateBox.classList.remove("is-rich");
  if (!message) {
    simStateBox.hidden = true;
    simStateBox.textContent = "";
    return;
  }
  simStateBox.hidden = false;
  simStateBox.textContent = message;
}

function renderSimRows(rows) {
  simTableBody.innerHTML = "";
  const isAdminOrAbove = !!(currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "it_support"));

  rows.forEach((asset) => {
    const tr = document.createElement("tr");
    if (asset.status === "voided") tr.classList.add("row-voided");

    const isVoided = asset.status === "voided";
    const statusLabel = isVoided ? "مستردة" : "نشطة";
    const statusClass = isVoided ? "status-voided" : "status-active";

    let actionsHtml = '<span class="text-muted">—</span>';
    if (isAdminOrAbove && !isVoided) {
      actionsHtml =
        '<button type="button" class="btn-secondary btn-sm sim-edit-btn">تعديل</button>' +
        '<button type="button" class="btn-danger btn-sm sim-void-btn">استرداد</button>';
    }

    tr.innerHTML =
      "<td>" + escapeHtml(asset.staff_id || "—") + "</td>" +
      "<td>" + escapeHtml(asset.staff_name) + "</td>" +
      "<td>" + escapeHtml(asset.mobile_number) + "</td>" +
      "<td>" + escapeHtml(asset.job_position || "—") + "</td>" +
      "<td>" + escapeHtml(asset.staff_location || "—") + "</td>" +
      '<td><span class="status-badge ' + statusClass + '">' + statusLabel + "</span></td>" +
      '<td class="actions-cell">' + actionsHtml + "</td>";

    if (isAdminOrAbove && !isVoided) {
      tr.querySelector(".sim-edit-btn").addEventListener("click", () => openSimForm(asset));
      tr.querySelector(".sim-void-btn").addEventListener("click", () => openSimVoidConfirm(asset));
    }

    simTableBody.appendChild(tr);
  });
}

function updateSimPaginationControls() {
  const totalPages = Math.max(1, Math.ceil(simState.totalCount / SIM_PAGE_SIZE));

  simPaginationInfo.textContent = simState.totalCount
    ? "صفحة " + simState.page + " من " + totalPages + " — إجمالي " + simState.totalCount + " رقم جوال"
    : "";

  simPrevPageButton.disabled = simState.page <= 1;
  simNextPageButton.disabled = simState.page >= totalPages;
}

async function loadSimAssignments() {
  loadItAssetsSummary();
  renderTableSkeleton(simTableBody, 6, 7);
  setSimState(null);
  simPrevPageButton.disabled = true;
  simNextPageButton.disabled = true;

  const from = (simState.page - 1) * SIM_PAGE_SIZE;
  const to = from + SIM_PAGE_SIZE - 1;

  let query = supabaseClient
    .from("it_sim_assignments")
    .select("id, staff_id, staff_name, mobile_number, job_position, staff_location, status", { count: "exact" })
    .order("staff_name", { ascending: true })
    .range(from, to);

  if (!simState.showVoided) {
    query = query.eq("status", "active");
  }

  if (simState.search) {
    const term = "%" + simState.search + "%";
    query = query.or("staff_name.ilike." + term + ",staff_id.ilike." + term + ",mobile_number.ilike." + term);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("Error loading SIM assignments:", error);
    setSimState("تعذر تحميل قائمة أرقام الجوال. يُرجى المحاولة مرة أخرى.");
    simPaginationInfo.textContent = "";
    return;
  }

  simState.totalCount = count || 0;

  if (!data || data.length === 0) {
    if (simState.search) {
      showRichEmptyState(
        simStateBox,
        icon("chartBar"),
        "لا توجد نتائج مطابقة",
        "لا توجد سجلات تطابق الفلاتر الحالية.",
        '<button type="button" class="btn-secondary btn-sm" id="sim-clear-filters-button">مسح الفلاتر</button>'
      );
      document.getElementById("sim-clear-filters-button").addEventListener("click", () => {
        simSearchInput.value = "";
        simState.search = "";
        simState.page = 1;
        loadSimAssignments();
      });
    } else {
      const isAdminOrAbove = !!(currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "it_support"));
      showRichEmptyState(
        simStateBox,
        icon("chartBar"),
        "لا توجد أرقام جوال مسجّلة بعد",
        "لا توجد أي عهدة رقم جوال مسجّلة بعد. سجّل أول عهدة يدويًا أو استورد دفعة كاملة من Excel.",
        isAdminOrAbove
          ? '<button type="button" class="btn-primary" id="empty-add-sim-button">+ إضافة أول رقم جوال</button>'
          : ""
      );
      if (isAdminOrAbove) {
        document.getElementById("empty-add-sim-button").addEventListener("click", () => openSimForm(null));
      }
    }
    updateSimPaginationControls();
    return;
  }

  setSimState(null);
  renderSimRows(data);
  updateSimPaginationControls();
}

let simSearchDebounce;
simSearchInput.addEventListener("input", () => {
  clearTimeout(simSearchDebounce);
  simSearchDebounce = setTimeout(() => {
    simState.search = simSearchInput.value.trim();
    simState.page = 1;
    loadSimAssignments();
  }, 300);
});

simShowVoidedCheckbox.addEventListener("change", () => {
  simState.showVoided = simShowVoidedCheckbox.checked;
  simState.page = 1;
  loadSimAssignments();
});

simPrevPageButton.addEventListener("click", () => {
  if (simState.page > 1) {
    simState.page -= 1;
    loadSimAssignments();
  }
});

simNextPageButton.addEventListener("click", () => {
  const totalPages = Math.max(1, Math.ceil(simState.totalCount / SIM_PAGE_SIZE));
  if (simState.page < totalPages) {
    simState.page += 1;
    loadSimAssignments();
  }
});

// ---------------------------------------------------------------------------
// إضافة / تعديل عهدة رقم جوال — Admin أو Super Admin فقط (RLS هو الضامن)
// ---------------------------------------------------------------------------

function openSimForm(asset) {
  simFormError.hidden = true;
  simFormError.textContent = "";

  simFormTitle.textContent = asset ? "تعديل رقم جوال" : "إضافة رقم جوال";
  simFormIdInput.value = asset ? asset.id : "";
  simFormStaffIdInput.value = asset ? asset.staff_id || "" : "";
  simFormStaffNameInput.value = asset ? asset.staff_name || "" : "";
  simFormNumberInput.value = asset ? asset.mobile_number || "" : "";
  simFormJobPositionInput.value = asset ? asset.job_position || "" : "";
  simFormLocationInput.value = asset ? asset.staff_location || "" : "";

  simFormModal.hidden = false;
}

addSimButton.addEventListener("click", () => openSimForm(null));

simForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  simFormError.hidden = true;
  simFormError.textContent = "";

  const staffName = simFormStaffNameInput.value.trim();
  const mobileNumber = simFormNumberInput.value.trim();

  if (!staffName) {
    simFormError.textContent = "اسم الموظف مطلوب.";
    simFormError.hidden = false;
    return;
  }
  if (!mobileNumber) {
    simFormError.textContent = "رقم الجوال مطلوب.";
    simFormError.hidden = false;
    return;
  }

  const payload = {
    staff_id: simFormStaffIdInput.value.trim() || null,
    staff_name: staffName,
    mobile_number: mobileNumber,
    job_position: simFormJobPositionInput.value.trim() || null,
    staff_location: simFormLocationInput.value.trim() || null,
  };

  simFormSubmitButton.disabled = true;
  simFormSubmitButton.textContent = "جارٍ الحفظ...";

  try {
    const editingId = simFormIdInput.value;
    let error;

    if (editingId) {
      payload.updated_by = currentAuthUser ? currentAuthUser.id : null;
      ({ error } = await supabaseClient.from("it_sim_assignments").update(payload).eq("id", editingId));
    } else {
      payload.created_by = currentAuthUser ? currentAuthUser.id : null;
      ({ error } = await supabaseClient.from("it_sim_assignments").insert(payload));
    }

    if (error) {
      console.error("Error saving SIM assignment:", error);

      if (
        error.code === "42501" ||
        (error.message && error.message.toLowerCase().includes("row-level security"))
      ) {
        simFormError.textContent = "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك).";
      } else if (error.code === "23505") {
        simFormError.textContent = "هذا الرقم مسجَّل بالفعل لموظف نشط آخر.";
      } else {
        simFormError.textContent = "حدث خطأ أثناء الحفظ: " + error.message;
      }

      simFormError.hidden = false;
      return;
    }

    simFormModal.hidden = true;
    loadSimAssignments();
  } catch (unexpectedError) {
    console.error("Unexpected error saving SIM assignment:", unexpectedError);
    simFormError.textContent = "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
    simFormError.hidden = false;
  } finally {
    simFormSubmitButton.disabled = false;
    simFormSubmitButton.textContent = "حفظ";
  }
});

// ---------------------------------------------------------------------------
// إلغاء/استرداد عهدة (Void) — بدل الحذف النهائي
// ---------------------------------------------------------------------------

function openSimVoidConfirm(asset) {
  simAssignmentBeingVoided = asset;
  simVoidReasonInput.value = "";
  simVoidError.hidden = true;
  simVoidError.textContent = "";
  simVoidModal.hidden = false;
}

simVoidConfirmButton.addEventListener("click", async () => {
  if (!simAssignmentBeingVoided) return;

  simVoidError.hidden = true;
  simVoidConfirmButton.disabled = true;
  simVoidConfirmButton.textContent = "جارٍ الاسترداد...";

  try {
    const { error } = await supabaseClient
      .from("it_sim_assignments")
      .update({
        status: "voided",
        void_reason: simVoidReasonInput.value.trim() || null,
        voided_by: currentAuthUser ? currentAuthUser.id : null,
        voided_at: new Date().toISOString(),
      })
      .eq("id", simAssignmentBeingVoided.id);

    if (error) {
      console.error("Error voiding SIM assignment:", error);
      simVoidError.textContent =
        error.code === "42501" ||
        (error.message && error.message.toLowerCase().includes("row-level security"))
          ? "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك)."
          : "حدث خطأ أثناء الاسترداد: " + error.message;
      simVoidError.hidden = false;
      return;
    }

    simVoidModal.hidden = true;
    simAssignmentBeingVoided = null;
    loadSimAssignments();
  } catch (unexpectedError) {
    console.error("Unexpected error voiding SIM assignment:", unexpectedError);
    simVoidError.textContent = "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
    simVoidError.hidden = false;
  } finally {
    simVoidConfirmButton.disabled = false;
    simVoidConfirmButton.textContent = "تأكيد الاسترداد";
  }
});

// ============================================================================
// 5e. عهدة الأجهزة اللوحية (IT Assets — Tablets) — Phase 6
// ============================================================================

const TABLET_PAGE_SIZE = 20;

let tabletState = {
  page: 1,
  search: "",
  showVoided: false,
  totalCount: 0,
};

// عناصر قائمة الأجهزة اللوحية
const tabletTableBody = document.getElementById("tablet-table-body");
const tabletStateBox = document.getElementById("tablet-state");
const tabletSearchInput = document.getElementById("tablet-search");
const tabletShowVoidedCheckbox = document.getElementById("tablet-show-voided");
const tabletPrevPageButton = document.getElementById("tablet-prev-page");
const tabletNextPageButton = document.getElementById("tablet-next-page");
const tabletPaginationInfo = document.getElementById("tablet-pagination-info");
const addTabletButton = document.getElementById("add-tablet-button");
const importTabletsButton = document.getElementById("import-tablets-button");

// عناصر Modal الإضافة/التعديل
const tabletFormModal = document.getElementById("tablet-form-modal");
const tabletForm = document.getElementById("tablet-form");
const tabletFormTitle = document.getElementById("tablet-form-title");
const tabletFormIdInput = document.getElementById("tablet-form-id");
const tabletFormStaffIdInput = document.getElementById("tablet-form-staff-id");
const tabletFormStaffNameInput = document.getElementById("tablet-form-staff-name");
const tabletFormSerialInput = document.getElementById("tablet-form-serial");
const tabletFormLocationInput = document.getElementById("tablet-form-location");
const tabletFormError = document.getElementById("tablet-form-error");
const tabletFormSubmitButton = document.getElementById("tablet-form-submit");

// عناصر Modal تأكيد الاسترداد (Void)
const tabletVoidModal = document.getElementById("tablet-void-modal");
const tabletVoidReasonInput = document.getElementById("tablet-void-reason");
const tabletVoidError = document.getElementById("tablet-void-error");
const tabletVoidConfirmButton = document.getElementById("tablet-void-confirm");

let tabletAssignmentBeingVoided = null;

function setTabletState(message) {
  tabletStateBox.classList.remove("is-rich");
  if (!message) {
    tabletStateBox.hidden = true;
    tabletStateBox.textContent = "";
    return;
  }
  tabletStateBox.hidden = false;
  tabletStateBox.textContent = message;
}

function renderTabletRows(rows) {
  tabletTableBody.innerHTML = "";
  const isAdminOrAbove = !!(currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "it_support"));

  rows.forEach((asset) => {
    const tr = document.createElement("tr");
    if (asset.status === "voided") tr.classList.add("row-voided");

    const isVoided = asset.status === "voided";
    const statusLabel = isVoided ? "مستردة" : "نشطة";
    const statusClass = isVoided ? "status-voided" : "status-active";

    let actionsHtml = '<span class="text-muted">—</span>';
    if (isAdminOrAbove && !isVoided) {
      actionsHtml =
        '<button type="button" class="btn-secondary btn-sm tablet-edit-btn">تعديل</button>' +
        '<button type="button" class="btn-danger btn-sm tablet-void-btn">استرداد</button>';
    }

    tr.innerHTML =
      "<td>" + escapeHtml(asset.staff_id || "—") + "</td>" +
      "<td>" + escapeHtml(asset.staff_name) + "</td>" +
      "<td>" + escapeHtml(asset.serial_number) + "</td>" +
      "<td>" + escapeHtml(asset.staff_location || "—") + "</td>" +
      '<td><span class="status-badge ' + statusClass + '">' + statusLabel + "</span></td>" +
      '<td class="actions-cell">' + actionsHtml + "</td>";

    if (isAdminOrAbove && !isVoided) {
      tr.querySelector(".tablet-edit-btn").addEventListener("click", () => openTabletForm(asset));
      tr.querySelector(".tablet-void-btn").addEventListener("click", () => openTabletVoidConfirm(asset));
    }

    tabletTableBody.appendChild(tr);
  });
}

function updateTabletPaginationControls() {
  const totalPages = Math.max(1, Math.ceil(tabletState.totalCount / TABLET_PAGE_SIZE));

  tabletPaginationInfo.textContent = tabletState.totalCount
    ? "صفحة " + tabletState.page + " من " + totalPages + " — إجمالي " + tabletState.totalCount + " جهاز لوحي"
    : "";

  tabletPrevPageButton.disabled = tabletState.page <= 1;
  tabletNextPageButton.disabled = tabletState.page >= totalPages;
}

async function loadTabletAssignments() {
  loadItAssetsSummary();
  renderTableSkeleton(tabletTableBody, 6, 6);
  setTabletState(null);
  tabletPrevPageButton.disabled = true;
  tabletNextPageButton.disabled = true;

  const from = (tabletState.page - 1) * TABLET_PAGE_SIZE;
  const to = from + TABLET_PAGE_SIZE - 1;

  let query = supabaseClient
    .from("it_tablet_assignments")
    .select("id, staff_id, staff_name, serial_number, staff_location, status", { count: "exact" })
    .order("staff_name", { ascending: true })
    .range(from, to);

  if (!tabletState.showVoided) {
    query = query.eq("status", "active");
  }

  if (tabletState.search) {
    const term = "%" + tabletState.search + "%";
    query = query.or("staff_name.ilike." + term + ",staff_id.ilike." + term + ",serial_number.ilike." + term);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("Error loading tablet assignments:", error);
    setTabletState("تعذر تحميل قائمة الأجهزة اللوحية. يُرجى المحاولة مرة أخرى.");
    tabletPaginationInfo.textContent = "";
    return;
  }

  tabletState.totalCount = count || 0;

  if (!data || data.length === 0) {
    if (tabletState.search) {
      showRichEmptyState(
        tabletStateBox,
        icon("chartBar"),
        "لا توجد نتائج مطابقة",
        "لا توجد سجلات تطابق الفلاتر الحالية.",
        '<button type="button" class="btn-secondary btn-sm" id="tablet-clear-filters-button">مسح الفلاتر</button>'
      );
      document.getElementById("tablet-clear-filters-button").addEventListener("click", () => {
        tabletSearchInput.value = "";
        tabletState.search = "";
        tabletState.page = 1;
        loadTabletAssignments();
      });
    } else {
      const isAdminOrAbove = !!(currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "it_support"));
      showRichEmptyState(
        tabletStateBox,
        icon("chartBar"),
        "لا توجد أجهزة لوحية مسجّلة بعد",
        "لا توجد أي عهدة جهاز لوحي مسجّلة بعد. سجّل أول عهدة يدويًا أو استورد دفعة كاملة من Excel.",
        isAdminOrAbove
          ? '<button type="button" class="btn-primary" id="empty-add-tablet-button">+ إضافة أول جهاز لوحي</button>'
          : ""
      );
      if (isAdminOrAbove) {
        document.getElementById("empty-add-tablet-button").addEventListener("click", () => openTabletForm(null));
      }
    }
    updateTabletPaginationControls();
    return;
  }

  setTabletState(null);
  renderTabletRows(data);
  updateTabletPaginationControls();
}

let tabletSearchDebounce;
tabletSearchInput.addEventListener("input", () => {
  clearTimeout(tabletSearchDebounce);
  tabletSearchDebounce = setTimeout(() => {
    tabletState.search = tabletSearchInput.value.trim();
    tabletState.page = 1;
    loadTabletAssignments();
  }, 300);
});

tabletShowVoidedCheckbox.addEventListener("change", () => {
  tabletState.showVoided = tabletShowVoidedCheckbox.checked;
  tabletState.page = 1;
  loadTabletAssignments();
});

tabletPrevPageButton.addEventListener("click", () => {
  if (tabletState.page > 1) {
    tabletState.page -= 1;
    loadTabletAssignments();
  }
});

tabletNextPageButton.addEventListener("click", () => {
  const totalPages = Math.max(1, Math.ceil(tabletState.totalCount / TABLET_PAGE_SIZE));
  if (tabletState.page < totalPages) {
    tabletState.page += 1;
    loadTabletAssignments();
  }
});

// ---------------------------------------------------------------------------
// إضافة / تعديل عهدة جهاز لوحي — Admin أو Super Admin فقط (RLS هو الضامن)
// ---------------------------------------------------------------------------

function openTabletForm(asset) {
  tabletFormError.hidden = true;
  tabletFormError.textContent = "";

  tabletFormTitle.textContent = asset ? "تعديل جهاز لوحي" : "إضافة جهاز لوحي";
  tabletFormIdInput.value = asset ? asset.id : "";
  tabletFormStaffIdInput.value = asset ? asset.staff_id || "" : "";
  tabletFormStaffNameInput.value = asset ? asset.staff_name || "" : "";
  tabletFormSerialInput.value = asset ? asset.serial_number || "" : "";
  tabletFormLocationInput.value = asset ? asset.staff_location || "" : "";

  tabletFormModal.hidden = false;
}

addTabletButton.addEventListener("click", () => openTabletForm(null));

tabletForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  tabletFormError.hidden = true;
  tabletFormError.textContent = "";

  const staffName = tabletFormStaffNameInput.value.trim();
  const serialNumber = tabletFormSerialInput.value.trim();

  if (!staffName) {
    tabletFormError.textContent = "اسم الموظف مطلوب.";
    tabletFormError.hidden = false;
    return;
  }
  if (!serialNumber) {
    tabletFormError.textContent = "الرقم التسلسلي مطلوب.";
    tabletFormError.hidden = false;
    return;
  }

  const payload = {
    staff_id: tabletFormStaffIdInput.value.trim() || null,
    staff_name: staffName,
    serial_number: serialNumber,
    staff_location: tabletFormLocationInput.value.trim() || null,
  };

  tabletFormSubmitButton.disabled = true;
  tabletFormSubmitButton.textContent = "جارٍ الحفظ...";

  try {
    const editingId = tabletFormIdInput.value;
    let error;

    if (editingId) {
      payload.updated_by = currentAuthUser ? currentAuthUser.id : null;
      ({ error } = await supabaseClient.from("it_tablet_assignments").update(payload).eq("id", editingId));
    } else {
      payload.created_by = currentAuthUser ? currentAuthUser.id : null;
      ({ error } = await supabaseClient.from("it_tablet_assignments").insert(payload));
    }

    if (error) {
      console.error("Error saving tablet assignment:", error);

      if (
        error.code === "42501" ||
        (error.message && error.message.toLowerCase().includes("row-level security"))
      ) {
        tabletFormError.textContent = "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك).";
      } else if (error.code === "23505") {
        tabletFormError.textContent = "هذا الرقم التسلسلي مسجَّل بالفعل لجهاز نشط آخر.";
      } else {
        tabletFormError.textContent = "حدث خطأ أثناء الحفظ: " + error.message;
      }

      tabletFormError.hidden = false;
      return;
    }

    tabletFormModal.hidden = true;
    loadTabletAssignments();
  } catch (unexpectedError) {
    console.error("Unexpected error saving tablet assignment:", unexpectedError);
    tabletFormError.textContent = "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
    tabletFormError.hidden = false;
  } finally {
    tabletFormSubmitButton.disabled = false;
    tabletFormSubmitButton.textContent = "حفظ";
  }
});

// ---------------------------------------------------------------------------
// إلغاء/استرداد عهدة (Void) — بدل الحذف النهائي
// ---------------------------------------------------------------------------

function openTabletVoidConfirm(asset) {
  tabletAssignmentBeingVoided = asset;
  tabletVoidReasonInput.value = "";
  tabletVoidError.hidden = true;
  tabletVoidError.textContent = "";
  tabletVoidModal.hidden = false;
}

tabletVoidConfirmButton.addEventListener("click", async () => {
  if (!tabletAssignmentBeingVoided) return;

  tabletVoidError.hidden = true;
  tabletVoidConfirmButton.disabled = true;
  tabletVoidConfirmButton.textContent = "جارٍ الاسترداد...";

  try {
    const { error } = await supabaseClient
      .from("it_tablet_assignments")
      .update({
        status: "voided",
        void_reason: tabletVoidReasonInput.value.trim() || null,
        voided_by: currentAuthUser ? currentAuthUser.id : null,
        voided_at: new Date().toISOString(),
      })
      .eq("id", tabletAssignmentBeingVoided.id);

    if (error) {
      console.error("Error voiding tablet assignment:", error);
      tabletVoidError.textContent =
        error.code === "42501" ||
        (error.message && error.message.toLowerCase().includes("row-level security"))
          ? "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك)."
          : "حدث خطأ أثناء الاسترداد: " + error.message;
      tabletVoidError.hidden = false;
      return;
    }

    tabletVoidModal.hidden = true;
    tabletAssignmentBeingVoided = null;
    loadTabletAssignments();
  } catch (unexpectedError) {
    console.error("Unexpected error voiding tablet assignment:", unexpectedError);
    tabletVoidError.textContent = "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
    tabletVoidError.hidden = false;
  } finally {
    tabletVoidConfirmButton.disabled = false;
    tabletVoidConfirmButton.textContent = "تأكيد الاسترداد";
  }
});

// ============================================================================
// 5f. كتالوج اللابتوبات (IT Assets — Laptop Catalog) — Phase 7
// جدول مستقل تمامًا عن عهدة اللابتوبات (5b) — بدون أي بيانات موظفين،
// مجرد سجل بأنواع/أرقام تسلسلية اللابتوبات الموجودة فعليًا
// ============================================================================

const LAPTOP_CATALOG_PAGE_SIZE = 20;

let laptopCatalogState = {
  page: 1,
  search: "",
  showVoided: false,
  totalCount: 0,
};

// عناصر قائمة الكتالوج
const laptopCatalogTableBody = document.getElementById("laptop-catalog-table-body");
const laptopCatalogStateBox = document.getElementById("laptop-catalog-state");
const laptopCatalogSearchInput = document.getElementById("laptop-catalog-search");
const laptopCatalogShowVoidedCheckbox = document.getElementById("laptop-catalog-show-voided");
const laptopCatalogPrevPageButton = document.getElementById("laptop-catalog-prev-page");
const laptopCatalogNextPageButton = document.getElementById("laptop-catalog-next-page");
const laptopCatalogPaginationInfo = document.getElementById("laptop-catalog-pagination-info");
const addLaptopCatalogButton = document.getElementById("add-laptop-catalog-button");
const importLaptopCatalogButton = document.getElementById("import-laptop-catalog-button");

// عناصر Modal الإضافة/التعديل
const laptopCatalogFormModal = document.getElementById("laptop-catalog-form-modal");
const laptopCatalogForm = document.getElementById("laptop-catalog-form");
const laptopCatalogFormTitle = document.getElementById("laptop-catalog-form-title");
const laptopCatalogFormIdInput = document.getElementById("laptop-catalog-form-id");
const laptopCatalogFormSerialInput = document.getElementById("laptop-catalog-form-serial");
const laptopCatalogFormTypeInput = document.getElementById("laptop-catalog-form-type");
const laptopCatalogFormAssetTagInput = document.getElementById("laptop-catalog-form-asset-tag");
const laptopCatalogFormError = document.getElementById("laptop-catalog-form-error");
const laptopCatalogFormSubmitButton = document.getElementById("laptop-catalog-form-submit");

// عناصر Modal تأكيد الاستبعاد (Void)
const laptopCatalogVoidModal = document.getElementById("laptop-catalog-void-modal");
const laptopCatalogVoidReasonInput = document.getElementById("laptop-catalog-void-reason");
const laptopCatalogVoidError = document.getElementById("laptop-catalog-void-error");
const laptopCatalogVoidConfirmButton = document.getElementById("laptop-catalog-void-confirm");

let laptopCatalogEntryBeingVoided = null;

function setLaptopCatalogState(message) {
  laptopCatalogStateBox.classList.remove("is-rich");
  if (!message) {
    laptopCatalogStateBox.hidden = true;
    laptopCatalogStateBox.textContent = "";
    return;
  }
  laptopCatalogStateBox.hidden = false;
  laptopCatalogStateBox.textContent = message;
}

function renderLaptopCatalogRows(rows) {
  laptopCatalogTableBody.innerHTML = "";
  const isAdminOrAbove = !!(currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "it_support"));

  rows.forEach((entry) => {
    const tr = document.createElement("tr");
    if (entry.status === "voided") tr.classList.add("row-voided");

    const isVoided = entry.status === "voided";
    const statusLabel = isVoided ? "مستبعد" : "نشط";
    const statusClass = isVoided ? "status-voided" : "status-active";

    let actionsHtml = '<span class="text-muted">—</span>';
    if (isAdminOrAbove && !isVoided) {
      actionsHtml =
        '<button type="button" class="btn-secondary btn-sm laptop-catalog-edit-btn">تعديل</button>' +
        '<button type="button" class="btn-danger btn-sm laptop-catalog-void-btn">استبعاد</button>';
    }

    tr.innerHTML =
      "<td>" + escapeHtml(entry.serial_number) + "</td>" +
      "<td>" + escapeHtml(entry.laptop_type || "—") + "</td>" +
      "<td>" + escapeHtml(entry.asset_tag || "—") + "</td>" +
      '<td><span class="status-badge ' + statusClass + '">' + statusLabel + "</span></td>" +
      '<td class="actions-cell">' + actionsHtml + "</td>";

    if (isAdminOrAbove && !isVoided) {
      tr.querySelector(".laptop-catalog-edit-btn").addEventListener("click", () => openLaptopCatalogForm(entry));
      tr.querySelector(".laptop-catalog-void-btn").addEventListener("click", () => openLaptopCatalogVoidConfirm(entry));
    }

    laptopCatalogTableBody.appendChild(tr);
  });
}

function updateLaptopCatalogPaginationControls() {
  const totalPages = Math.max(1, Math.ceil(laptopCatalogState.totalCount / LAPTOP_CATALOG_PAGE_SIZE));

  laptopCatalogPaginationInfo.textContent = laptopCatalogState.totalCount
    ? "صفحة " + laptopCatalogState.page + " من " + totalPages + " — إجمالي " + laptopCatalogState.totalCount + " سجل"
    : "";

  laptopCatalogPrevPageButton.disabled = laptopCatalogState.page <= 1;
  laptopCatalogNextPageButton.disabled = laptopCatalogState.page >= totalPages;
}

async function loadLaptopCatalog() {
  loadItAssetsSummary();
  renderTableSkeleton(laptopCatalogTableBody, 6, 5);
  setLaptopCatalogState(null);
  laptopCatalogPrevPageButton.disabled = true;
  laptopCatalogNextPageButton.disabled = true;

  const from = (laptopCatalogState.page - 1) * LAPTOP_CATALOG_PAGE_SIZE;
  const to = from + LAPTOP_CATALOG_PAGE_SIZE - 1;

  let query = supabaseClient
    .from("it_laptop_catalog")
    .select("id, serial_number, laptop_type, asset_tag, status", { count: "exact" })
    .order("serial_number", { ascending: true })
    .range(from, to);

  if (!laptopCatalogState.showVoided) {
    query = query.eq("status", "active");
  }

  if (laptopCatalogState.search) {
    const term = "%" + laptopCatalogState.search + "%";
    query = query.or("serial_number.ilike." + term + ",laptop_type.ilike." + term + ",asset_tag.ilike." + term);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("Error loading laptop catalog:", error);
    setLaptopCatalogState("تعذر تحميل كتالوج اللابتوبات. يُرجى المحاولة مرة أخرى.");
    laptopCatalogPaginationInfo.textContent = "";
    return;
  }

  laptopCatalogState.totalCount = count || 0;

  if (!data || data.length === 0) {
    if (laptopCatalogState.search) {
      showRichEmptyState(
        laptopCatalogStateBox,
        icon("chartBar"),
        "لا توجد نتائج مطابقة",
        "لا توجد سجلات تطابق الفلاتر الحالية.",
        '<button type="button" class="btn-secondary btn-sm" id="laptop-catalog-clear-filters-button">مسح الفلاتر</button>'
      );
      document.getElementById("laptop-catalog-clear-filters-button").addEventListener("click", () => {
        laptopCatalogSearchInput.value = "";
        laptopCatalogState.search = "";
        laptopCatalogState.page = 1;
        loadLaptopCatalog();
      });
    } else {
      const isAdminOrAbove = !!(currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "it_support"));
      showRichEmptyState(
        laptopCatalogStateBox,
        icon("chartBar"),
        "لا توجد سجلات في الكتالوج بعد",
        "لا يوجد أي سجل في كتالوج اللابتوبات بعد. سجّل أول سجل يدويًا أو استورد دفعة كاملة من Excel.",
        isAdminOrAbove
          ? '<button type="button" class="btn-primary" id="empty-add-laptop-catalog-button">+ إضافة أول سجل</button>'
          : ""
      );
      if (isAdminOrAbove) {
        document
          .getElementById("empty-add-laptop-catalog-button")
          .addEventListener("click", () => openLaptopCatalogForm(null));
      }
    }
    updateLaptopCatalogPaginationControls();
    return;
  }

  setLaptopCatalogState(null);
  renderLaptopCatalogRows(data);
  updateLaptopCatalogPaginationControls();
}

let laptopCatalogSearchDebounce;
laptopCatalogSearchInput.addEventListener("input", () => {
  clearTimeout(laptopCatalogSearchDebounce);
  laptopCatalogSearchDebounce = setTimeout(() => {
    laptopCatalogState.search = laptopCatalogSearchInput.value.trim();
    laptopCatalogState.page = 1;
    loadLaptopCatalog();
  }, 300);
});

laptopCatalogShowVoidedCheckbox.addEventListener("change", () => {
  laptopCatalogState.showVoided = laptopCatalogShowVoidedCheckbox.checked;
  laptopCatalogState.page = 1;
  loadLaptopCatalog();
});

laptopCatalogPrevPageButton.addEventListener("click", () => {
  if (laptopCatalogState.page > 1) {
    laptopCatalogState.page -= 1;
    loadLaptopCatalog();
  }
});

laptopCatalogNextPageButton.addEventListener("click", () => {
  const totalPages = Math.max(1, Math.ceil(laptopCatalogState.totalCount / LAPTOP_CATALOG_PAGE_SIZE));
  if (laptopCatalogState.page < totalPages) {
    laptopCatalogState.page += 1;
    loadLaptopCatalog();
  }
});

// ---------------------------------------------------------------------------
// إضافة / تعديل سجل كتالوج — Admin أو Super Admin فقط (RLS هو الضامن)
// ---------------------------------------------------------------------------

function openLaptopCatalogForm(entry) {
  laptopCatalogFormError.hidden = true;
  laptopCatalogFormError.textContent = "";

  laptopCatalogFormTitle.textContent = entry ? "تعديل سجل الكتالوج" : "إضافة نوع لابتوب";
  laptopCatalogFormIdInput.value = entry ? entry.id : "";
  laptopCatalogFormSerialInput.value = entry ? entry.serial_number || "" : "";
  laptopCatalogFormTypeInput.value = entry ? entry.laptop_type || "" : "";
  laptopCatalogFormAssetTagInput.value = entry ? entry.asset_tag || "" : "";

  laptopCatalogFormModal.hidden = false;
}

addLaptopCatalogButton.addEventListener("click", () => openLaptopCatalogForm(null));

laptopCatalogForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  laptopCatalogFormError.hidden = true;
  laptopCatalogFormError.textContent = "";

  const serialNumber = laptopCatalogFormSerialInput.value.trim();

  if (!serialNumber) {
    laptopCatalogFormError.textContent = "الرقم التسلسلي مطلوب.";
    laptopCatalogFormError.hidden = false;
    return;
  }

  const payload = {
    serial_number: serialNumber,
    laptop_type: laptopCatalogFormTypeInput.value.trim() || null,
    asset_tag: laptopCatalogFormAssetTagInput.value.trim() || null,
  };

  laptopCatalogFormSubmitButton.disabled = true;
  laptopCatalogFormSubmitButton.textContent = "جارٍ الحفظ...";

  try {
    const editingId = laptopCatalogFormIdInput.value;
    let error;

    if (editingId) {
      payload.updated_by = currentAuthUser ? currentAuthUser.id : null;
      ({ error } = await supabaseClient.from("it_laptop_catalog").update(payload).eq("id", editingId));
    } else {
      payload.created_by = currentAuthUser ? currentAuthUser.id : null;
      ({ error } = await supabaseClient.from("it_laptop_catalog").insert(payload));
    }

    if (error) {
      console.error("Error saving laptop catalog entry:", error);

      if (
        error.code === "42501" ||
        (error.message && error.message.toLowerCase().includes("row-level security"))
      ) {
        laptopCatalogFormError.textContent = "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك).";
      } else if (error.code === "23505") {
        laptopCatalogFormError.textContent = "هذا الرقم التسلسلي مسجَّل بالفعل لسجل نشط آخر.";
      } else {
        laptopCatalogFormError.textContent = "حدث خطأ أثناء الحفظ: " + error.message;
      }

      laptopCatalogFormError.hidden = false;
      return;
    }

    laptopCatalogFormModal.hidden = true;
    loadLaptopCatalog();
  } catch (unexpectedError) {
    console.error("Unexpected error saving laptop catalog entry:", unexpectedError);
    laptopCatalogFormError.textContent = "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
    laptopCatalogFormError.hidden = false;
  } finally {
    laptopCatalogFormSubmitButton.disabled = false;
    laptopCatalogFormSubmitButton.textContent = "حفظ";
  }
});

// ---------------------------------------------------------------------------
// استبعاد سجل (Void) — بدل الحذف النهائي
// ---------------------------------------------------------------------------

function openLaptopCatalogVoidConfirm(entry) {
  laptopCatalogEntryBeingVoided = entry;
  laptopCatalogVoidReasonInput.value = "";
  laptopCatalogVoidError.hidden = true;
  laptopCatalogVoidError.textContent = "";
  laptopCatalogVoidModal.hidden = false;
}

laptopCatalogVoidConfirmButton.addEventListener("click", async () => {
  if (!laptopCatalogEntryBeingVoided) return;

  laptopCatalogVoidError.hidden = true;
  laptopCatalogVoidConfirmButton.disabled = true;
  laptopCatalogVoidConfirmButton.textContent = "جارٍ الاستبعاد...";

  try {
    const { error } = await supabaseClient
      .from("it_laptop_catalog")
      .update({
        status: "voided",
        void_reason: laptopCatalogVoidReasonInput.value.trim() || null,
        voided_by: currentAuthUser ? currentAuthUser.id : null,
        voided_at: new Date().toISOString(),
      })
      .eq("id", laptopCatalogEntryBeingVoided.id);

    if (error) {
      console.error("Error voiding laptop catalog entry:", error);
      laptopCatalogVoidError.textContent =
        error.code === "42501" ||
        (error.message && error.message.toLowerCase().includes("row-level security"))
          ? "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك)."
          : "حدث خطأ أثناء الاستبعاد: " + error.message;
      laptopCatalogVoidError.hidden = false;
      return;
    }

    laptopCatalogVoidModal.hidden = true;
    laptopCatalogEntryBeingVoided = null;
    loadLaptopCatalog();
  } catch (unexpectedError) {
    console.error("Unexpected error voiding laptop catalog entry:", unexpectedError);
    laptopCatalogVoidError.textContent = "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
    laptopCatalogVoidError.hidden = false;
  } finally {
    laptopCatalogVoidConfirmButton.disabled = false;
    laptopCatalogVoidConfirmButton.textContent = "تأكيد الاستبعاد";
  }
});

// ============================================================================
// 6. موديول البيتي كاش (Petty Cash) — Phase 4
// ============================================================================

let currentActiveFund = null; // آخر صندوق نشط (مع أرقام الرصيد من الـ view)

// عناصر كارت الصندوق الحالي وسجل الصناديق
const currentFundContainer = document.getElementById("current-fund-container");
const fundsTableBody = document.getElementById("funds-table-body");
const fundsStateBox = document.getElementById("funds-state");

// عناصر Modal إنشاء صندوق
const fundFormModal = document.getElementById("fund-form-modal");
const fundForm = document.getElementById("fund-form");
const fundFormAmountInput = document.getElementById("fund-form-amount");
const fundFormDateInput = document.getElementById("fund-form-date");
const fundFormError = document.getElementById("fund-form-error");
const fundFormSubmitButton = document.getElementById("fund-form-submit");

// عناصر Modal تأكيد إغلاق الصندوق
const closeFundModal = document.getElementById("close-fund-modal");
const closeFundConfirmButton = document.getElementById("close-fund-confirm");
const closeFundError = document.getElementById("close-fund-error");

// عناصر Modal تعزيز الرصيد
const topupFundModal = document.getElementById("topup-fund-modal");
const topupFundForm = document.getElementById("topup-fund-form");
const topupFundAmountInput = document.getElementById("topup-fund-amount");
const topupFundError = document.getElementById("topup-fund-error");
const topupFundSubmitButton = document.getElementById("topup-fund-submit");

// عناصر Modal تأكيد إلغاء العهدة
const cancelFundModal = document.getElementById("cancel-fund-modal");
const cancelFundConfirmButton = document.getElementById("cancel-fund-confirm");
const cancelFundError = document.getElementById("cancel-fund-error");

// عناصر Modal تفاصيل الصندوق
const fundDetailsModal = document.getElementById("fund-details-modal");
const fundDetailsSummary = document.getElementById("fund-details-summary");
const fundDetailsExpensesBody = document.getElementById("fund-details-expenses-body");
const fundDetailsExpensesState = document.getElementById("fund-details-expenses-state");

const FUND_STATUS_LABELS = {
  active: "نشط",
  exhausted: "مستنفد",
  closed: "مغلق",
  cancelled: "ملغاة",
};

const FUND_STATUS_CLASSES = {
  active: "status-active",
  exhausted: "status-exhausted",
  closed: "status-closed",
  cancelled: "status-voided",
};

// نسبة التنبيه المبكر لانخفاض رصيد العهدة (تنبيه قبل ما توصل صفر بالظبط) —
// عدّل الرقم هذا لو يريد نسبة تنبيه مختلفة
const PETTY_CASH_LOW_BALANCE_THRESHOLD = 0.15;

function generateFundCode(fundedAtDate) {
  const year = fundedAtDate
    ? new Date(fundedAtDate + "T00:00:00").getFullYear()
    : new Date().getFullYear();
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return "PCF-" + year + "-" + randomPart;
}

// ---------------------------------------------------------------------------
// 6.2 عرض الصندوق الحالي (من petty_cash_fund_balances view)
// ---------------------------------------------------------------------------

function renderNoActiveFundCard() {
  currentFundContainer.innerHTML =
    '<div class="table-card"><div class="table-state">لا توجد عهدة نقدية نشطة حاليًا.</div></div>';
}

// شريط بسيط يوضّح نسبة استخدام العهدة الحالية — محسوب فقط من الأرقام
// الحقيقية الموجودة أصلًا في الكارت (إجمالي المصروف / المبلغ الافتتاحي)
function fundUsageBarHtml(fund) {
  const opening = Number(fund.opening_amount || 0);
  if (opening <= 0) return "";
  const usagePercent = Math.min(100, Math.max(0, (Number(fund.total_expenses || 0) / opening) * 100));
  return (
    '<div class="category-breakdown-row fund-usage-row">' +
    '<div class="category-breakdown-labels">' +
    '<span class="category-breakdown-name">نسبة الاستخدام</span>' +
    '<span class="category-breakdown-value">' + formatNumber(usagePercent, 0) + "%</span>" +
    "</div>" +
    '<div class="category-breakdown-bar"><div class="category-breakdown-bar-fill" style="width: ' + usagePercent + '%"></div></div>' +
    "</div>"
  );
}

function renderCurrentFundCard(fund) {
  const isSuperAdmin = !!(currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "admin"));
  const isExhaustedByBalance = Number(fund.current_balance) <= 0;
  const opening = Number(fund.opening_amount || 0);
  const balanceRatio = opening > 0 ? Number(fund.current_balance) / opening : 1;
  const isLowBalance = !isExhaustedByBalance && balanceRatio <= PETTY_CASH_LOW_BALANCE_THRESHOLD;
  const canCancel = isSuperAdmin && Number(fund.expense_count || 0) === 0;
  const statusLabel = FUND_STATUS_LABELS[fund.status] || fund.status;
  const statusClass = FUND_STATUS_CLASSES[fund.status] || "status-active";

  let alertHtml = "";
  if (isExhaustedByBalance) {
    alertHtml = '<div class="alert-warning">وصل الرصيد إلى الصفر — العهدة الحالية مستنفدة. يُرجى إغلاق العهدة الحالية وإنشاء عهدة جديدة، أو تعزيز رصيدها لو محتاجة تكمّل.</div>';
  } else if (isLowBalance) {
    alertHtml =
      '<div class="alert-warning">رصيد العهدة الحالية قارب على النفاد (' +
      formatNumber(balanceRatio * 100, 0) +
      '% متبقّي) — فكّر في تعزيز الرصيد قبل ما يخلص.</div>';
  }

  const actionsHtml =
    isSuperAdmin
      ? '<div class="fund-card-actions">' +
        '<button type="button" id="topup-fund-button" class="btn-secondary">تعزيز الرصيد</button>' +
        (isExhaustedByBalance
          ? '<button type="button" id="close-fund-button" class="btn-danger">إغلاق العهدة كمستنفدة</button>'
          : "") +
        (canCancel
          ? '<button type="button" id="cancel-fund-button" class="btn-danger">إلغاء العهدة</button>'
          : "") +
        "</div>"
      : "";

  currentFundContainer.innerHTML =
    '<div class="table-card"><div class="fund-card-body">' +
    '<div class="fund-card-header">' +
    "<div>" +
    '<span class="card-icon" aria-hidden="true">' + icon("wallet") + '</span>' +
    '<span class="fund-card-code">' + escapeHtml(fund.fund_code) + "</span>" +
    '<h2 class="fund-card-title">العهدة الحالية</h2>' +
    "</div>" +
    '<span class="status-badge ' + statusClass + '">' + statusLabel + "</span>" +
    "</div>" +
    '<div class="summary-cards">' +
    '<div class="summary-card"><span class="summary-card-label">المبلغ الافتتاحي</span>' +
    '<span class="summary-card-value">' + formatNumber(fund.opening_amount, 2) + " ر.س</span></div>" +
    '<div class="summary-card"><span class="summary-card-label">إجمالي المصروف</span>' +
    '<span class="summary-card-value is-negative">' + formatNumber(fund.total_expenses, 2) + " ر.س</span></div>" +
    '<div class="summary-card"><span class="summary-card-label">الرصيد الحالي</span>' +
    '<span class="summary-card-value is-balance">' + formatNumber(fund.current_balance, 2) + " ر.س</span></div>" +
    "</div>" +
    fundUsageBarHtml(fund) +
    '<dl class="details-grid fund-card-meta">' +
    detailRow("تاريخ التمويل", formatDateOnly(fund.funded_at)) +
    detailRow("عدد المعاملات", String(fund.expense_count || 0)) +
    detailRow("آخر معاملة", fund.lastExpenseDate ? formatDateOnly(fund.lastExpenseDate) : "لا توجد معاملات بعد") +
    "</dl>" +
    alertHtml +
    actionsHtml +
    "</div></div>";

  if (isSuperAdmin) {
    const topupBtn = document.getElementById("topup-fund-button");
    if (topupBtn) {
      topupBtn.addEventListener("click", () => {
        topupFundError.hidden = true;
        topupFundError.textContent = "";
        topupFundForm.reset();
        topupFundModal.hidden = false;
      });
    }

    const closeBtn = document.getElementById("close-fund-button");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        closeFundError.hidden = true;
        closeFundError.textContent = "";
        closeFundModal.hidden = false;
      });
    }

    const cancelBtn = document.getElementById("cancel-fund-button");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        cancelFundError.hidden = true;
        cancelFundError.textContent = "";
        cancelFundModal.hidden = false;
      });
    }
  }
}

async function loadCurrentFund() {
  currentFundContainer.innerHTML = skeletonFundCardHtml();

  const { data: fund, error: fundError } = await supabaseClient
    .from("petty_cash_funds")
    .select("id, fund_code, opening_amount, funded_at, status")
    .eq("status", "active")
    .order("funded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fundError) {
    console.error("Error loading current fund:", fundError);
    currentFundContainer.innerHTML =
      '<div class="table-card"><div class="table-state">تعذر تحميل بيانات العهدة. يُرجى المحاولة مرة أخرى.</div></div>';
    currentActiveFund = null;
    return;
  }

  if (!fund) {
    currentActiveFund = null;
    renderNoActiveFundCard();
    return;
  }

  const { data: balance, error: balanceError } = await supabaseClient
    .from("petty_cash_fund_balances")
    .select("total_expenses, current_balance, expense_count")
    .eq("fund_id", fund.id)
    .single();

  if (balanceError) {
    console.error("Error loading fund balance:", balanceError);
    currentFundContainer.innerHTML =
      '<div class="table-card"><div class="table-state">تعذر تحميل رصيد العهدة. يُرجى المحاولة مرة أخرى.</div></div>';
    currentActiveFund = null;
    return;
  }

  const { data: lastExpense } = await supabaseClient
    .from("expenses")
    .select("expense_date")
    .eq("petty_cash_fund_id", fund.id)
    .eq("status", "active")
    .order("expense_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  currentActiveFund = {
    id: fund.id,
    fund_code: fund.fund_code,
    opening_amount: fund.opening_amount,
    funded_at: fund.funded_at,
    status: fund.status,
    total_expenses: balance.total_expenses,
    current_balance: balance.current_balance,
    expense_count: balance.expense_count,
    lastExpenseDate: lastExpense ? lastExpense.expense_date : null,
  };

  renderCurrentFundCard(currentActiveFund);
}

// ---------------------------------------------------------------------------
// 6.3 إنشاء صندوق جديد — Super Admin فقط (RLS هو الضامن الحقيقي)
// ---------------------------------------------------------------------------

addFundButton.addEventListener("click", () => {
  fundFormError.hidden = true;
  fundFormError.textContent = "";
  fundForm.reset();
  fundFormModal.hidden = false;
});

fundForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  fundFormError.hidden = true;
  fundFormError.textContent = "";

  const openingAmount = Number(fundFormAmountInput.value);
  const fundedAt = fundFormDateInput.value;

  if (!fundedAt) {
    fundFormError.textContent = "تاريخ التمويل مطلوب.";
    fundFormError.hidden = false;
    return;
  }
  if (!fundFormAmountInput.value || Number.isNaN(openingAmount) || openingAmount <= 0) {
    fundFormError.textContent = "المبلغ الافتتاحي يجب أن يكون رقمًا أكبر من صفر.";
    fundFormError.hidden = false;
    return;
  }

  fundFormSubmitButton.disabled = true;
  fundFormSubmitButton.textContent = "جارٍ الحفظ...";

  try {
    // تحقق مسبق (تجربة استخدام أفضل) — القيد الحقيقي المانع للتكرار موجود في
    // قاعدة البيانات (partial unique index: عهدة نشطة واحدة فقط للنظام كله)،
    // وهذا مجرد فحص استباقي للمستخدم
    const { data: existingActive, error: existingError } = await supabaseClient
      .from("petty_cash_funds")
      .select("id")
      .eq("status", "active")
      .maybeSingle();

    if (existingError) {
      console.error("Error checking existing active fund:", existingError);
    } else if (existingActive) {
      fundFormError.textContent = "توجد عهدة نشطة بالفعل. يجب إغلاقها أولًا (استنفادًا أو إغلاقًا) قبل إنشاء عهدة جديدة.";
      fundFormError.hidden = false;
      return;
    }

    const payload = {
      fund_code: generateFundCode(fundedAt),
      opening_amount: openingAmount,
      funded_at: fundedAt,
      status: "active",
      created_by: currentAuthUser ? currentAuthUser.id : null,
    };

    const { error } = await supabaseClient.from("petty_cash_funds").insert(payload);

    if (error) {
      console.error("Error creating fund:", error);

      if (error.code === "23505" && error.message && error.message.includes("one_active_global")) {
        // Race condition: أُنشئ عهدة نشطة بين الفحص المسبق والإدخال
        fundFormError.textContent = "توجد عهدة نشطة بالفعل. يجب إغلاقها أولًا قبل إنشاء عهدة جديدة.";
      } else if (error.code === "23505") {
        fundFormError.textContent = "حدث تعارض بسيط في البيانات. يُرجى المحاولة مرة أخرى.";
      } else if (
        error.code === "42501" ||
        (error.message && error.message.toLowerCase().includes("row-level security"))
      ) {
        fundFormError.textContent = "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك).";
      } else {
        fundFormError.textContent = "حدث خطأ أثناء الحفظ: " + error.message;
      }

      fundFormError.hidden = false;
      return;
    }

    fundFormModal.hidden = true;
    loadCurrentFund();
    loadFundingHistory();
  } catch (unexpectedError) {
    console.error("Unexpected error creating fund:", unexpectedError);
    fundFormError.textContent = "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
    fundFormError.hidden = false;
  } finally {
    fundFormSubmitButton.disabled = false;
    fundFormSubmitButton.textContent = "حفظ";
  }
});

// ---------------------------------------------------------------------------
// 6.4 إغلاق الصندوق كمستنفد — Super Admin فقط
// ---------------------------------------------------------------------------

closeFundConfirmButton.addEventListener("click", async () => {
  if (!currentActiveFund) return;

  closeFundError.hidden = true;
  closeFundConfirmButton.disabled = true;
  closeFundConfirmButton.textContent = "جارٍ الإغلاق...";

  try {
    const { error } = await supabaseClient
      .from("petty_cash_funds")
      .update({
        status: "exhausted",
        closed_at: new Date().toISOString().slice(0, 10),
      })
      .eq("id", currentActiveFund.id);

    if (error) {
      console.error("Error closing fund:", error);
      closeFundError.textContent =
        error.code === "42501" ||
        (error.message && error.message.toLowerCase().includes("row-level security"))
          ? "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك)."
          : "حدث خطأ أثناء الإغلاق: " + error.message;
      closeFundError.hidden = false;
      return;
    }

    closeFundModal.hidden = true;
    loadCurrentFund();
    loadFundingHistory();
  } catch (unexpectedError) {
    console.error("Unexpected error closing fund:", unexpectedError);
    closeFundError.textContent = "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
    closeFundError.hidden = false;
  } finally {
    closeFundConfirmButton.disabled = false;
    closeFundConfirmButton.textContent = "تأكيد الإغلاق";
  }
});

// ---------------------------------------------------------------------------
// 6.4b تعزيز رصيد العهدة الحالية — بيزوّد المبلغ الافتتاحي مباشرة (بيتسجّل
//      تلقائيًا في سجل العمليات كتعديل عادي على العهدة)
// ---------------------------------------------------------------------------

topupFundForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  topupFundError.hidden = true;
  topupFundError.textContent = "";

  if (!currentActiveFund) return;

  const addedAmount = Number(topupFundAmountInput.value);
  if (!topupFundAmountInput.value || Number.isNaN(addedAmount) || addedAmount <= 0) {
    topupFundError.textContent = "المبلغ المضاف يجب أن يكون رقمًا أكبر من صفر.";
    topupFundError.hidden = false;
    return;
  }

  topupFundSubmitButton.disabled = true;
  topupFundSubmitButton.textContent = "جارٍ الإضافة...";

  try {
    const newOpeningAmount = Number(currentActiveFund.opening_amount) + addedAmount;

    const { error } = await supabaseClient
      .from("petty_cash_funds")
      .update({ opening_amount: newOpeningAmount })
      .eq("id", currentActiveFund.id);

    if (error) {
      console.error("Error topping up fund:", error);
      topupFundError.textContent =
        error.code === "42501" ||
        (error.message && error.message.toLowerCase().includes("row-level security"))
          ? "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك)."
          : "حدث خطأ أثناء الإضافة: " + error.message;
      topupFundError.hidden = false;
      return;
    }

    topupFundModal.hidden = true;
    loadCurrentFund();
    loadFundingHistory();
  } catch (unexpectedError) {
    console.error("Unexpected error topping up fund:", unexpectedError);
    topupFundError.textContent = "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
    topupFundError.hidden = false;
  } finally {
    topupFundSubmitButton.disabled = false;
    topupFundSubmitButton.textContent = "تأكيد الإضافة";
  }
});

// ---------------------------------------------------------------------------
// 6.4c إلغاء عهدة أُنشئت بالخطأ — متاح فقط إذا لا توجد مصروفات مسجّلة عليها
//      (إذا وُجدت مصروفات، يجب استخدام "إغلاق" عادي بدل الإلغاء حتى نحافظ على السجل)
// ---------------------------------------------------------------------------

cancelFundConfirmButton.addEventListener("click", async () => {
  if (!currentActiveFund) return;

  cancelFundError.hidden = true;
  cancelFundConfirmButton.disabled = true;
  cancelFundConfirmButton.textContent = "جارٍ الإلغاء...";

  try {
    const { error } = await supabaseClient
      .from("petty_cash_funds")
      .update({
        status: "cancelled",
        closed_at: new Date().toISOString().slice(0, 10),
      })
      .eq("id", currentActiveFund.id);

    if (error) {
      console.error("Error cancelling fund:", error);
      cancelFundError.textContent =
        error.code === "22P02" || (error.message && error.message.toLowerCase().includes("invalid input value"))
          ? "قيمة الحالة 'ملغاة' لم تُضَف بعد إلى قاعدة البيانات — نفِّذ استعلام القسم 13 في schema.sql أولًا."
          : error.code === "42501" ||
            (error.message && error.message.toLowerCase().includes("row-level security"))
          ? "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك)."
          : "حدث خطأ أثناء الإلغاء: " + error.message;
      cancelFundError.hidden = false;
      return;
    }

    cancelFundModal.hidden = true;
    loadCurrentFund();
    loadFundingHistory();
  } catch (unexpectedError) {
    console.error("Unexpected error cancelling fund:", unexpectedError);
    cancelFundError.textContent = "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
    cancelFundError.hidden = false;
  } finally {
    cancelFundConfirmButton.disabled = false;
    cancelFundConfirmButton.textContent = "تأكيد الإلغاء";
  }
});

// ---------------------------------------------------------------------------
// 6.5 سجل الصناديق السابقة + تفاصيل الصندوق
// ---------------------------------------------------------------------------

function setFundsState(message) {
  fundsStateBox.classList.remove("is-rich");
  if (!message) {
    fundsStateBox.hidden = true;
    fundsStateBox.textContent = "";
    return;
  }
  fundsStateBox.hidden = false;
  fundsStateBox.textContent = message;
}

function renderFundsRows(funds) {
  fundsTableBody.innerHTML = "";

  funds.forEach((fund) => {
    const tr = document.createElement("tr");
    tr.className = "clickable-row";

    const statusLabel = FUND_STATUS_LABELS[fund.status] || fund.status;
    const statusClass = FUND_STATUS_CLASSES[fund.status] || "status-active";

    tr.innerHTML =
      "<td>" + escapeHtml(fund.fund_code) + "</td>" +
      "<td>" + formatNumber(fund.opening_amount, 2) + " ر.س</td>" +
      '<td><span class="status-badge ' + statusClass + '">' + statusLabel + "</span></td>" +
      "<td>" + formatDateOnly(fund.funded_at) + "</td>" +
      "<td>" + (fund.closed_at ? formatDateOnly(fund.closed_at) : "—") + "</td>";

    tr.addEventListener("click", () => openFundDetails(fund));
    fundsTableBody.appendChild(tr);
  });
}

async function loadFundingHistory() {
  renderTableSkeleton(fundsTableBody, 5, 6);
  setFundsState(null);

  const { data, error } = await supabaseClient
    .from("petty_cash_funds")
    .select("id, fund_code, opening_amount, status, funded_at, closed_at")
    .order("funded_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Error loading funding history:", error);
    setFundsState("تعذر تحميل سجل العهد. يُرجى المحاولة مرة أخرى.");
    return;
  }

  if (!data || data.length === 0) {
    const isSuperAdmin = !!(currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "admin"));
    showRichEmptyState(
      fundsStateBox,
      icon("wallet"),
      "لا توجد عهد نقدية بعد",
      "لا توجد أي عهدة نقدية مسجّلة بعد. أنشئ أول عهدة لتتمكن من تسجيل المصروفات عليها.",
      isSuperAdmin ? '<button type="button" class="btn-primary" id="empty-add-fund-button">+ إنشاء أول عهدة</button>' : ""
    );
    if (isSuperAdmin) {
      document.getElementById("empty-add-fund-button").addEventListener("click", () => addFundButton.click());
    }
    return;
  }

  setFundsState(null);
  renderFundsRows(data);
}

async function openFundDetails(fund) {
  fundDetailsSummary.innerHTML = "";
  fundDetailsExpensesBody.innerHTML = "";
  fundDetailsExpensesState.hidden = true;
  fundDetailsModal.hidden = false;

  const { data: balance, error: balanceError } = await supabaseClient
    .from("petty_cash_fund_balances")
    .select("total_expenses, current_balance, expense_count")
    .eq("fund_id", fund.id)
    .single();

  if (balanceError) console.error("Error loading fund balance details:", balanceError);

  const statusLabel = FUND_STATUS_LABELS[fund.status] || fund.status;
  const statusClass = FUND_STATUS_CLASSES[fund.status] || "status-active";

  fundDetailsSummary.innerHTML =
    detailRow("كود العهدة", escapeHtml(fund.fund_code)) +
    detailRow("الحالة", '<span class="status-badge ' + statusClass + '">' + statusLabel + "</span>") +
    detailRow("المبلغ الافتتاحي", formatNumber(fund.opening_amount, 2) + " ر.س") +
    detailRow("إجمالي المصروف", balanceError ? "—" : formatNumber(balance.total_expenses, 2) + " ر.س") +
    detailRow("الرصيد الحالي", balanceError ? "—" : formatNumber(balance.current_balance, 2) + " ر.س") +
    detailRow("تاريخ التمويل", formatDateOnly(fund.funded_at)) +
    detailRow("تاريخ الإغلاق", fund.closed_at ? formatDateOnly(fund.closed_at) : "—");

  renderTableSkeleton(fundDetailsExpensesBody, 4, 6);

  const { data: expenses, error: expensesError } = await supabaseClient
    .from("expenses")
    .select(
      "id, expense_date, amount, description, supplier_name, invoice_number, status, created_by, " +
        "category:expense_categories ( name, name_ar )"
    )
    .eq("petty_cash_fund_id", fund.id)
    .order("expense_date", { ascending: false })
    .limit(200);

  if (expensesError) {
    console.error("Error loading fund expenses:", expensesError);
    setFundDetailsExpensesState("تعذر تحميل مصروفات العهدة.");
    return;
  }

  const categoryBreakdownBox = document.getElementById("fund-details-category-breakdown");

  if (!expenses || expenses.length === 0) {
    categoryBreakdownBox.innerHTML = '<div class="table-state">لا توجد مصروفات بعد لعرض توزيعها.</div>';
    setFundDetailsExpensesState("لا توجد مصروفات مسجّلة على هذه العهدة بعد.");
    return;
  }

  // توزيع المصروفات حسب الفئة — محسوب من نفس النتائج التي جبناها فوق،
  // من غير أي استعلام إضافي على قاعدة البيانات
  const activeExpenses = expenses.filter((e) => e.status === "active");
  const categoryTotals = {};
  activeExpenses.forEach((e) => {
    const name = e.category ? e.category.name_ar || e.category.name : "غير مصنّف";
    if (!categoryTotals[name]) categoryTotals[name] = { total: 0, count: 0 };
    categoryTotals[name].total += Number(e.amount || 0);
    categoryTotals[name].count += 1;
  });

  const totalActive = activeExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1].total - a[1].total);

  if (sortedCategories.length === 0) {
    categoryBreakdownBox.innerHTML = '<div class="table-state">لا توجد مصروفات نشطة بعد لعرض توزيعها.</div>';
  } else {
    categoryBreakdownBox.innerHTML = sortedCategories
      .map(([name, stats]) => {
        const pct = totalActive ? (stats.total / totalActive) * 100 : 0;
        return (
          '<div class="category-breakdown-row">' +
          '<div class="category-breakdown-labels">' +
          '<span class="category-breakdown-name">' + escapeHtml(name) + "</span>" +
          '<span class="category-breakdown-value">' + formatNumber(stats.total, 2) + " ر.س (" + formatNumber(pct, 1) + "%)</span>" +
          "</div>" +
          '<div class="category-breakdown-bar"><div class="category-breakdown-bar-fill" style="width:' + pct.toFixed(1) + '%"></div></div>' +
          "</div>"
        );
      })
      .join("");
  }

  setFundDetailsExpensesState(null);

  const creatorMap = await fetchCreatorNames(expenses.map((e) => e.created_by));
  renderExpenseRows(fundDetailsExpensesBody, expenses, creatorMap, { showFund: false, showActions: false });
}

function setFundDetailsExpensesState(message) {
  if (!message) {
    fundDetailsExpensesState.hidden = true;
    fundDetailsExpensesState.textContent = "";
    return;
  }
  fundDetailsExpensesState.hidden = false;
  fundDetailsExpensesState.textContent = message;
}

// ============================================================================
// 7. موديول المصروفات (Expenses) — Phase 4
// ============================================================================

const EXPENSES_PAGE_SIZE = 20;

let expensesState = {
  page: 1,
  categoryId: "",
  dateFrom: "",
  dateTo: "",
  status: "active",
  totalCount: 0,
};

let expenseCategoriesCache = null; // كاش لفئات المصروفات (للفلتر وفورم الإضافة)

// عناصر قائمة المصروفات
const expensesTableBody = document.getElementById("expenses-table-body");
const expensesStateBox = document.getElementById("expenses-state");
const expensesCategoryFilter = document.getElementById("expenses-category-filter");
const expensesDateFromInput = document.getElementById("expenses-date-from");
const expensesDateToInput = document.getElementById("expenses-date-to");
const expensesStatusFilter = document.getElementById("expenses-status-filter");
const expensesPrevPageButton = document.getElementById("expenses-prev-page");
const expensesNextPageButton = document.getElementById("expenses-next-page");
const expensesPaginationInfo = document.getElementById("expenses-pagination-info");

// عناصر Modal إضافة مصروف
const expenseFormModal = document.getElementById("expense-form-modal");
const expenseForm = document.getElementById("expense-form");
const expenseFormTitle = document.getElementById("expense-form-title");
const expenseFormFundInfo = document.getElementById("expense-form-fund-info");
const expenseFormFundSelect = document.getElementById("expense-form-fund");
let expenseFormFundsList = []; // كل العهدات (نشطة/مستنفدة/مغلقة) مع أرصدتها — لاختيار العهدة يدويًا وقت تسجيل مصروف
const expenseFormCategorySelect = document.getElementById("expense-form-category");
const expenseCategoryCombo = document.getElementById("expense-category-combo");
const expenseCategoryDropdown = document.getElementById("expense-category-dropdown");
let expenseCategoryNameToId = {}; // اسم فئة مُطبَّع (lowercase/trim) → id — يُبنى في ensureExpenseCategories
let expenseCategoryActiveList = []; // قائمة الفئات الفعّالة (id + الاسم المعروض) لبناء القائمة المنسدلة
let expenseCategorySelectedId = null; // id الفئة المختارة فعليًا من القائمة (يُصفَّر عند الكتابة)
let expenseCategoryHighlightIndex = -1; // مؤشر العنصر المُظلَّل حاليًا للتنقل بلوحة المفاتيح
let expenseOtherCategoryId = null; // id فئة "أخرى" — لو اتخيّرت يظهر حقل اسم فئة جديد
const expenseFormNewCategoryField = document.getElementById("expense-form-new-category-field");
const expenseFormNewCategoryInput = document.getElementById("expense-form-new-category");
const expenseFormAmountInput = document.getElementById("expense-form-amount");
const expenseFormDateInput = document.getElementById("expense-form-date");
const expenseFormSupplierInput = document.getElementById("expense-form-supplier");
const expenseFormInvoiceInput = document.getElementById("expense-form-invoice");
const expenseFormRecipientInput = document.getElementById("expense-form-recipient");
const expenseRecipientOptionsList = document.getElementById("expense-recipient-options");
const expenseFormDescriptionInput = document.getElementById("expense-form-description");
const expenseFormError = document.getElementById("expense-form-error");
const expenseFormSubmitButton = document.getElementById("expense-form-submit");

// عناصر Modal تأكيد إلغاء مصروف
const expenseVoidModal = document.getElementById("expense-void-modal");
const expenseVoidReasonInput = document.getElementById("expense-void-reason");
const expenseVoidError = document.getElementById("expense-void-error");
const expenseVoidConfirmButton = document.getElementById("expense-void-confirm");

let expenseBeingVoided = null;
let expenseBeingEdited = null; // المصروف الجاري تعديله فعليًا (null يعني الفورم في وضع "إضافة") — يشمل البيانات الكاملة بما فيها الموظف المستلم
let expenseFormActiveFund = null; // العهدة المختارة فعليًا داخل فورم إضافة المصروف (مش بالضرورة العهدة النشطة — ممكن يختار المستخدم عهدة قديمة مغلقة لتسجيل مصروف قديم عليها)

// اقتراحات "الموظف المستلم للمبلغ" — نفس منطق اقتراح اسم المستخدم الفعلي
// بالسيارات: قيم سابقة فعلية فقط، بلا جدول موظفين رسمي ولا ربط. الحقل داخلي
// بالكامل (أدمن فقط)، فالاستعلام هنا يقرأ عمود recipient_employee_name الذي
// لا يظهر في أي مكان آخر بالواجهة
let expenseRecipientNamesCache = null;

async function ensureExpenseRecipientOptions(forceRefresh) {
  if (expenseRecipientNamesCache && !forceRefresh) return expenseRecipientNamesCache;

  const { data, error } = await supabaseClient
    .from("expenses")
    .select("recipient_employee_name")
    .not("recipient_employee_name", "is", null);

  if (error) {
    console.error("Error loading expense recipient suggestions:", error);
    return expenseRecipientNamesCache || [];
  }

  const names = [...new Set((data || []).map((e) => e.recipient_employee_name).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ar")
  );

  expenseRecipientNamesCache = names;
  expenseRecipientOptionsList.innerHTML = names
    .map((name) => '<option value="' + escapeHtml(name) + '"></option>')
    .join("");

  return expenseRecipientNamesCache;
}

// ---------------------------------------------------------------------------
// 7.1 دالة مشتركة: جلب أسماء "من أدخل" عبر profile_public (متاحة لكل الأدوار)
// ---------------------------------------------------------------------------

async function fetchCreatorNames(ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const map = {};
  if (!uniqueIds.length) return map;

  const { data, error } = await supabaseClient
    .from("profile_public")
    .select("id, full_name")
    .in("id", uniqueIds);

  if (error) {
    console.error("Error loading creator names:", error);
    return map;
  }

  (data || []).forEach((c) => {
    map[c.id] = c.full_name;
  });

  return map;
}

// ---------------------------------------------------------------------------
// 7.2 فئات المصروفات — لفلتر القائمة وفورم الإضافة (Cache بسيط)
// ---------------------------------------------------------------------------

async function ensureExpenseCategories() {
  if (expenseCategoriesCache) return expenseCategoriesCache;

  const { data, error } = await supabaseClient
    .from("expense_categories")
    .select("id, name, name_ar, is_active")
    .order("name", { ascending: true });

  if (error) {
    console.error("Error loading expense categories:", error);
    expenseCategoriesCache = [];
    return expenseCategoriesCache;
  }

  expenseCategoriesCache = data || [];

  const filterOptions = expenseCategoriesCache
    .map((c) => '<option value="' + c.id + '">' + escapeHtml(c.name_ar || c.name) + "</option>")
    .join("");
  expensesCategoryFilter.innerHTML = '<option value="">كل الفئات</option>' + filterOptions;

  // حقل الفئة في فورم الإضافة بقى قائمة منسدلة مخصّصة (Combobox) تعرض كل
  // الفئات فور الفتح وتفلتر أثناء الكتابة — أوثق من datalist المتصفح
  // الافتراضية اللي سلوكها بيختلف بين المتصفحات. نبني هنا القائمة الأساسية
  // وخريطة (اسم مُطبَّع → id) لحلّ القيمة المكتوبة فعليًا وقت الحفظ
  const activeCategories = expenseCategoriesCache.filter((c) => c.is_active);
  expenseCategoryActiveList = activeCategories.map((c) => ({
    id: c.id,
    label: c.name_ar || c.name,
  }));

  expenseCategoryNameToId = {};
  activeCategories.forEach((c) => {
    if (c.name_ar) expenseCategoryNameToId[normalizeImportKey(c.name_ar)] = c.id;
    if (c.name) expenseCategoryNameToId[normalizeImportKey(c.name)] = c.id;
  });

  // فئة "أخرى" — لو المستخدم اختارها لازم يكتب اسم فئة فعلي بدالها بدل
  // ما تفضل مصروفات كتير متجمّعة تحت اسم عام مالوش معنى
  const otherCategory = activeCategories.find(
    (c) => normalizeImportKey(c.name) === "other" || normalizeImportKey(c.name_ar || "") === normalizeImportKey("أخرى")
  );
  expenseOtherCategoryId = otherCategory ? otherCategory.id : null;

  return expenseCategoriesCache;
}

// ---------------------------------------------------------------------------
// 7.2ب Combobox الفئة — يعرض كل الفئات عند الفتح، ويفلتر أثناء الكتابة
// ---------------------------------------------------------------------------

function renderExpenseCategoryDropdown(filterText) {
  const normalizedFilter = normalizeImportKey(filterText || "");
  const matches = normalizedFilter
    ? expenseCategoryActiveList.filter((c) => normalizeImportKey(c.label).includes(normalizedFilter))
    : expenseCategoryActiveList;

  expenseCategoryHighlightIndex = -1;

  if (matches.length === 0) {
    expenseCategoryDropdown.innerHTML = '<li class="combo-option-empty">لا توجد فئة مطابقة</li>';
  } else {
    expenseCategoryDropdown.innerHTML = matches
      .map(
        (c) =>
          '<li class="combo-option" role="option" data-id="' +
          c.id +
          '" data-label="' +
          escapeHtml(c.label) +
          '">' +
          escapeHtml(c.label) +
          "</li>"
      )
      .join("");
  }

  expenseCategoryDropdown.hidden = false;
}

function openExpenseCategoryDropdown() {
  renderExpenseCategoryDropdown(expenseFormCategorySelect.value);
}

function closeExpenseCategoryDropdown() {
  expenseCategoryDropdown.hidden = true;
  expenseCategoryHighlightIndex = -1;
}

function highlightExpenseCategoryOption(index) {
  const options = expenseCategoryDropdown.querySelectorAll(".combo-option");
  options.forEach((el) => el.classList.remove("combo-option-active"));
  if (index >= 0 && index < options.length) {
    options[index].classList.add("combo-option-active");
    options[index].scrollIntoView({ block: "nearest" });
  }
  expenseCategoryHighlightIndex = index;
}

function selectExpenseCategoryOption(id, label) {
  expenseFormCategorySelect.value = label;
  expenseCategorySelectedId = id;
  closeExpenseCategoryDropdown();
  updateExpenseNewCategoryFieldVisibility();
}

// لازم تكون في فئة فعلية دايمًا؛ لو المُختارة هي "أخرى" نظهر حقل لكتابة
// اسم الفئة الجديدة الفعلي (هيتحوّل لفئة حقيقية جديدة وقت الحفظ)
function updateExpenseNewCategoryFieldVisibility() {
  const resolvedId = expenseCategorySelectedId || expenseCategoryNameToId[normalizeImportKey(expenseFormCategorySelect.value.trim())];
  const isOther = Boolean(expenseOtherCategoryId) && resolvedId === expenseOtherCategoryId;
  expenseFormNewCategoryField.hidden = !isOther;
  if (!isOther) expenseFormNewCategoryInput.value = "";
}

expenseFormCategorySelect.addEventListener("focus", openExpenseCategoryDropdown);
expenseFormCategorySelect.addEventListener("click", openExpenseCategoryDropdown);

expenseFormCategorySelect.addEventListener("input", () => {
  expenseCategorySelectedId = null; // الكتابة اليدوية تُلغي أي اختيار سابق لحد ما يتطابق نص جديد
  renderExpenseCategoryDropdown(expenseFormCategorySelect.value);
  updateExpenseNewCategoryFieldVisibility();
});

expenseFormCategorySelect.addEventListener("keydown", (event) => {
  const options = expenseCategoryDropdown.querySelectorAll(".combo-option");

  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (expenseCategoryDropdown.hidden) {
      openExpenseCategoryDropdown();
      return;
    }
    if (options.length === 0) return;
    highlightExpenseCategoryOption((expenseCategoryHighlightIndex + 1) % options.length);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    if (options.length === 0) return;
    highlightExpenseCategoryOption((expenseCategoryHighlightIndex - 1 + options.length) % options.length);
  } else if (event.key === "Enter") {
    if (!expenseCategoryDropdown.hidden && expenseCategoryHighlightIndex >= 0 && options[expenseCategoryHighlightIndex]) {
      event.preventDefault();
      const el = options[expenseCategoryHighlightIndex];
      selectExpenseCategoryOption(el.dataset.id, el.dataset.label);
    }
  } else if (event.key === "Escape") {
    closeExpenseCategoryDropdown();
  }
});

expenseCategoryDropdown.addEventListener("click", (event) => {
  const option = event.target.closest(".combo-option");
  if (!option || !option.dataset.id) return;
  selectExpenseCategoryOption(option.dataset.id, option.dataset.label);
});

document.addEventListener("click", (event) => {
  if (!expenseCategoryCombo.contains(event.target)) {
    closeExpenseCategoryDropdown();
  }
});

// ---------------------------------------------------------------------------
// 7.3 عرض صفوف المصروفات — دالة مشتركة بين قائمة المصروفات الرئيسية
//     وقائمة مصروفات الصندوق داخل Modal التفاصيل
// ---------------------------------------------------------------------------

function renderExpenseRows(tbody, rows, creatorMap, options) {
  const opts = options || {};
  const showFund = opts.showFund !== false;
  const showActions = opts.showActions !== false;
  const isSuperAdmin = !!(currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "admin"));

  tbody.innerHTML = "";

  rows.forEach((expense) => {
    const tr = document.createElement("tr");
    const isVoided = expense.status === "voided";
    if (isVoided) tr.classList.add("row-voided");

    const categoryName = expense.category
      ? expense.category.name_ar || expense.category.name
      : "—";
    const fundCode = expense.fund ? expense.fund.fund_code : "—";
    const creatorName = creatorMap[expense.created_by] || "—";
    const statusLabel = isVoided ? "ملغى" : "نشط";
    const statusClass = isVoided ? "status-voided" : "status-active";

    let cells =
      "<td>" + formatDateOnly(expense.expense_date) + "</td>" +
      "<td>" + formatNumber(expense.amount, 2) + " ر.س</td>" +
      "<td>" + escapeHtml(categoryName) + "</td>" +
      "<td>" + escapeHtml(expense.supplier_name || "—") + "</td>" +
      "<td>" + escapeHtml(expense.description || "—") + "</td>" +
      "<td>" + escapeHtml(expense.invoice_number || "—") + "</td>";

    if (showFund) {
      cells += "<td>" + escapeHtml(fundCode) + "</td>";
    }

    cells +=
      "<td>" + escapeHtml(creatorName) + "</td>" +
      '<td><span class="status-badge ' + statusClass + '">' + statusLabel + "</span></td>";

    if (showActions) {
      let actionsHtml = '<span class="text-muted">—</span>';
      if (isSuperAdmin && !isVoided) {
        actionsHtml =
          '<button type="button" class="btn-secondary btn-sm expense-edit-btn">تعديل</button> ' +
          '<button type="button" class="btn-danger btn-sm expense-void-btn">إلغاء</button>';
      }
      cells += '<td class="actions-cell">' + actionsHtml + "</td>";
    }

    tr.innerHTML = cells;

    if (showActions && isSuperAdmin && !isVoided) {
      tr.querySelector(".expense-edit-btn").addEventListener("click", () => openExpenseEditForm(expense));
      tr.querySelector(".expense-void-btn").addEventListener("click", () => openExpenseVoidConfirm(expense));
    }

    tbody.appendChild(tr);
  });
}

// ---------------------------------------------------------------------------
// 7.4 قائمة المصروفات الرئيسية (بحث بفلاتر + Pagination)
// ---------------------------------------------------------------------------

function setExpensesState(message) {
  expensesStateBox.classList.remove("is-rich");
  if (!message) {
    expensesStateBox.hidden = true;
    expensesStateBox.textContent = "";
    return;
  }
  expensesStateBox.hidden = false;
  expensesStateBox.textContent = message;
}

function updateExpensesPaginationControls() {
  const totalPages = Math.max(1, Math.ceil(expensesState.totalCount / EXPENSES_PAGE_SIZE));

  expensesPaginationInfo.textContent = expensesState.totalCount
    ? "صفحة " + expensesState.page + " من " + totalPages + " — إجمالي " + expensesState.totalCount + " مصروف"
    : "";

  expensesPrevPageButton.disabled = expensesState.page <= 1;
  expensesNextPageButton.disabled = expensesState.page >= totalPages;
}

async function loadExpenses() {
  await ensureExpenseCategories();

  renderTableSkeleton(expensesTableBody, 6, 8);
  setExpensesState(null);
  expensesPrevPageButton.disabled = true;
  expensesNextPageButton.disabled = true;

  const from = (expensesState.page - 1) * EXPENSES_PAGE_SIZE;
  const to = from + EXPENSES_PAGE_SIZE - 1;

  let query = supabaseClient
    .from("expenses")
    .select(
      "id, expense_date, amount, description, supplier_name, invoice_number, status, created_by, category_id, petty_cash_fund_id, " +
        "category:expense_categories ( name, name_ar ), fund:petty_cash_funds ( fund_code )",
      { count: "exact" }
    )
    .order("expense_date", { ascending: false })
    .range(from, to);

  if (expensesState.status) {
    query = query.eq("status", expensesState.status);
  }
  if (expensesState.categoryId) {
    query = query.eq("category_id", expensesState.categoryId);
  }
  if (expensesState.dateFrom) {
    query = query.gte("expense_date", expensesState.dateFrom);
  }
  if (expensesState.dateTo) {
    query = query.lte("expense_date", expensesState.dateTo);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("Error loading expenses:", error);
    setExpensesState("تعذر تحميل المصروفات. يُرجى المحاولة مرة أخرى.");
    expensesPaginationInfo.textContent = "";
    return;
  }

  expensesState.totalCount = count || 0;

  if (!data || data.length === 0) {
    if (expensesState.categoryId || expensesState.dateFrom || expensesState.dateTo || expensesState.status !== "active") {
      showRichEmptyState(
        expensesStateBox,
        icon("receipt"),
        "لا توجد نتائج مطابقة",
        "لا توجد سجلات تطابق الفلاتر الحالية.",
        '<button type="button" class="btn-secondary btn-sm" id="expenses-clear-filters-button">مسح الفلاتر</button>'
      );
      document.getElementById("expenses-clear-filters-button").addEventListener("click", () => {
        expensesCategoryFilter.value = "";
        expensesDateFromInput.value = "";
        expensesDateToInput.value = "";
        expensesStatusFilter.value = "active";
        expensesState.categoryId = "";
        expensesState.dateFrom = "";
        expensesState.dateTo = "";
        expensesState.status = "active";
        expensesState.page = 1;
        loadExpenses();
      });
    } else {
      const isSuperAdmin = !!(currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "admin"));
      showRichEmptyState(
        expensesStateBox,
        icon("receipt"),
        "لا توجد مصروفات بعد",
        "لا توجد أي مصروفات مسجّلة بعد. سجّل أول مصروف على العهدة النشطة الحالية أو استورد دفعة كاملة من Excel.",
        isSuperAdmin
          ? '<button type="button" class="btn-primary" id="empty-add-expense-button">+ إضافة أول مصروف</button>'
          : ""
      );
      if (isSuperAdmin) {
        document.getElementById("empty-add-expense-button").addEventListener("click", () => addExpenseButton.click());
      }
    }
    updateExpensesPaginationControls();
    return;
  }

  setExpensesState(null);
  const creatorMap = await fetchCreatorNames(data.map((e) => e.created_by));
  renderExpenseRows(expensesTableBody, data, creatorMap, { showFund: true, showActions: true });
  updateExpensesPaginationControls();
}

expensesCategoryFilter.addEventListener("change", () => {
  expensesState.categoryId = expensesCategoryFilter.value;
  expensesState.page = 1;
  loadExpenses();
});

expensesDateFromInput.addEventListener("change", () => {
  expensesState.dateFrom = expensesDateFromInput.value;
  expensesState.page = 1;
  loadExpenses();
});

expensesDateToInput.addEventListener("change", () => {
  expensesState.dateTo = expensesDateToInput.value;
  expensesState.page = 1;
  loadExpenses();
});

expensesStatusFilter.addEventListener("change", () => {
  expensesState.status = expensesStatusFilter.value;
  expensesState.page = 1;
  loadExpenses();
});

expensesPrevPageButton.addEventListener("click", () => {
  if (expensesState.page > 1) {
    expensesState.page -= 1;
    loadExpenses();
  }
});

expensesNextPageButton.addEventListener("click", () => {
  const totalPages = Math.max(1, Math.ceil(expensesState.totalCount / EXPENSES_PAGE_SIZE));
  if (expensesState.page < totalPages) {
    expensesState.page += 1;
    loadExpenses();
  }
});

// ---------------------------------------------------------------------------
// 7.5 إضافة مصروف — Super Admin/Admin؛ العهدة تُختار يدويًا من كل العهدات
// (نشطة/مستنفدة/مغلقة) بدل الربط التلقائي بالعهدة النشطة فقط — عشان لو في
// مصروف قديم لازم يتخصم من عهدة قديمة بعينها بدل ما يتحط غلط على العهدة
// الحالية، وبتفتراضيًا بتختار العهدة النشطة لو موجودة توفيرًا للوقت
// ---------------------------------------------------------------------------

// يجيب كل العهدات مع أرصدتها الحقيقية (view واحد يغطي الكل) ويملأ القائمة
// المنسدلة؛ بيرجع العهدة اللي المفروض تتحدد افتراضيًا (النشطة لو موجودة،
// وإلا أحدث عهدة موجودة أصلًا)
async function loadExpenseFormFundsOptions() {
  expenseFormFundSelect.innerHTML = '<option value="">جارٍ التحميل...</option>';
  expenseFormFundSelect.disabled = true;

  const { data, error } = await supabaseClient
    .from("petty_cash_fund_balances")
    .select("fund_id, fund_code, status, opening_amount, current_balance, funded_at")
    .order("funded_at", { ascending: false });

  if (error) {
    console.error("Error loading funds for expense form:", error);
    expenseFormFundsList = [];
    expenseFormFundSelect.innerHTML = '<option value="">تعذر تحميل العهدات</option>';
    expenseFormFundSelect.disabled = true;
    return null;
  }

  expenseFormFundsList = data || [];

  if (expenseFormFundsList.length === 0) {
    expenseFormFundSelect.innerHTML = '<option value="">لا توجد أي عهدة نقدية بعد</option>';
    expenseFormFundSelect.disabled = true;
    return null;
  }

  expenseFormFundSelect.disabled = false;
  expenseFormFundSelect.innerHTML = expenseFormFundsList
    .map((f) => {
      const statusLabel = FUND_STATUS_LABELS[f.status] || f.status;
      return (
        '<option value="' +
        f.fund_id +
        '">' +
        escapeHtml(f.fund_code) +
        " — " +
        statusLabel +
        " (الرصيد: " +
        formatNumber(f.current_balance, 2) +
        " ر.س)</option>"
      );
    })
    .join("");

  const defaultFund = expenseFormFundsList.find((f) => f.status === "active") || expenseFormFundsList[0];
  expenseFormFundSelect.value = defaultFund.fund_id;
  return defaultFund;
}

function getSelectedExpenseFormFund() {
  return expenseFormFundsList.find((f) => f.fund_id === expenseFormFundSelect.value) || null;
}

function updateExpenseFormForSelectedFund() {
  const selectedFund = getSelectedExpenseFormFund();
  expenseFormActiveFund = selectedFund
    ? {
        id: selectedFund.fund_id,
        fund_code: selectedFund.fund_code,
        status: selectedFund.status,
        opening_amount: selectedFund.opening_amount,
        current_balance: selectedFund.current_balance,
      }
    : null;

  if (!expenseFormActiveFund) {
    expenseFormFundInfo.hidden = true;
    expenseFormSubmitButton.disabled = true;
    return;
  }

  expenseFormFundInfo.hidden = false;
  expenseFormSubmitButton.disabled = false;
  updateExpenseBalancePreview();
}

expenseFormFundSelect.addEventListener("change", updateExpenseFormForSelectedFund);

addExpenseButton.addEventListener("click", async () => {
  expenseBeingEdited = null; // وضع "إضافة" صريح — أي جلسة تعديل سابقة اتلغت
  expenseFormTitle.textContent = "إضافة مصروف";
  expenseFormSubmitButton.textContent = "حفظ";
  expenseFormError.hidden = true;
  expenseFormError.textContent = "";
  expenseForm.reset();
  expenseCategorySelectedId = null;
  closeExpenseCategoryDropdown();
  expenseFormNewCategoryField.hidden = true;
  expenseFormNewCategoryInput.value = "";

  await ensureExpenseCategories();
  ensureExpenseRecipientOptions();

  // نجيب كل العهدات بأرصدتها الحقيقية (غير من الكاش القديم) ونحدد افتراضيًا
  // العهدة النشطة لو موجودة، مع إتاحة اختيار عهدة تانية يدويًا
  const defaultFund = await loadExpenseFormFundsOptions();

  if (!defaultFund) {
    expenseFormFundInfo.textContent = "";
    expenseFormFundInfo.hidden = true;
    expenseFormError.textContent = "لا توجد أي عهدة نقدية لتسجيل مصروف عليها.";
    expenseFormError.hidden = false;
    expenseFormSubmitButton.disabled = true;
  } else {
    updateExpenseFormForSelectedFund();
  }

  expenseFormModal.hidden = false;
});

// ---------------------------------------------------------------------------
// 7.5ب تعديل مصروف موجود — بيفتح نفس الفورم في وضع "تعديل"، معبّأ بالبيانات
// الحالية كاملة (بما فيها الموظف المستلم الداخلي)، ومحدّد عليه العهدة
// الأصلية للمصروف (حتى لو مش نشطة حاليًا) قابلة للتغيير لو لزم الأمر
// ---------------------------------------------------------------------------

async function openExpenseEditForm(expenseRow) {
  expenseFormError.hidden = true;
  expenseFormError.textContent = "";
  expenseForm.reset();
  expenseCategorySelectedId = null;
  closeExpenseCategoryDropdown();
  expenseFormNewCategoryField.hidden = true;
  expenseFormNewCategoryInput.value = "";
  expenseFormSubmitButton.disabled = true;
  expenseFormModal.hidden = false;
  expenseFormTitle.textContent = "جارٍ التحميل...";

  // نجيب أحدث نسخة من الصف كامل (بما فيه الموظف المستلم اللي متعمّد إخفاؤه
  // من استعلام القائمة الرئيسية) — تجنّبًا لتعديل ببيانات قديمة
  const { data: freshExpense, error } = await supabaseClient
    .from("expenses")
    .select("id, category_id, amount, expense_date, description, supplier_name, invoice_number, recipient_employee_name, petty_cash_fund_id")
    .eq("id", expenseRow.id)
    .single();

  if (error || !freshExpense) {
    console.error("Error loading expense for edit:", error);
    expenseFormModal.hidden = true;
    showToast("تعذر تحميل بيانات المصروف للتعديل. حاول مرة أخرى.", "error");
    return;
  }

  expenseBeingEdited = freshExpense;
  expenseFormTitle.textContent = "تعديل مصروف";
  expenseFormSubmitButton.textContent = "حفظ التعديلات";

  await ensureExpenseCategories();
  ensureExpenseRecipientOptions();

  const categoryObj = expenseCategoriesCache.find((c) => c.id === freshExpense.category_id);
  if (categoryObj) {
    expenseFormCategorySelect.value = categoryObj.name_ar || categoryObj.name;
    expenseCategorySelectedId = categoryObj.id;
  }
  updateExpenseNewCategoryFieldVisibility();

  expenseFormAmountInput.value = freshExpense.amount;
  expenseFormDateInput.value = freshExpense.expense_date;
  expenseFormSupplierInput.value = freshExpense.supplier_name || "";
  expenseFormInvoiceInput.value = freshExpense.invoice_number || "";
  expenseFormRecipientInput.value = freshExpense.recipient_employee_name || "";
  expenseFormDescriptionInput.value = freshExpense.description || "";

  // نجيب كل العهدات ونحدد العهدة الأصلية بتاعة المصروف ده تحديدًا (حتى لو
  // مغلقة/مستنفدة حاليًا)، مع إتاحة تغييرها يدويًا لو المستخدم عايز ينقل
  // المصروف لعهدة تانية
  await loadExpenseFormFundsOptions();
  if (expenseFormFundsList.some((f) => f.fund_id === freshExpense.petty_cash_fund_id)) {
    expenseFormFundSelect.value = freshExpense.petty_cash_fund_id;
  }
  updateExpenseFormForSelectedFund();
}

// معاينة حيّة للرصيد قبل/بعد العملية أثناء كتابة المبلغ — بيانات حقيقية
// فقط من رصيد العهدة النشطة المحمّل أصلًا عند فتح الفورم؛ لا يستبدل الفحص
// النهائي للرصيد وقت الحفظ الفعلي (freshBalance)، وهو مجرد معاينة فورية
function updateExpenseBalancePreview() {
  if (!expenseFormActiveFund) return;

  const currentBalance = Number(expenseFormActiveFund.current_balance || 0);
  const amountRaw = expenseFormAmountInput.value;
  const amount = Number(amountRaw);
  const hasValidAmount = amountRaw !== "" && !Number.isNaN(amount) && amount > 0;
  const afterBalance = hasValidAmount ? currentBalance - amount : currentBalance;
  const isInsufficient = hasValidAmount && afterBalance < 0;

  const isInactiveFund = expenseFormActiveFund.status && expenseFormActiveFund.status !== "active";

  expenseFormFundInfo.innerHTML =
    '<span>سيتم تسجيل هذا المصروف على العهدة: <strong>' + escapeHtml(expenseFormActiveFund.fund_code) + "</strong></span><br>" +
    '<span>الرصيد الحالي: ' + formatNumber(currentBalance, 2) + " ر.س</span>" +
    (hasValidAmount
      ? "<br><span>المصروف: " + formatNumber(amount, 2) + " ر.س</span>" +
        '<br><span' + (isInsufficient ? ' style="color: var(--color-danger-text); font-weight: 700;"' : "") + '>الرصيد بعد العملية: ' +
        formatNumber(afterBalance, 2) + " ر.س</span>"
      : "") +
    (isInactiveFund
      ? '<br><span style="color: var(--color-warning-text); font-weight: 700;">تنبيه: هذه العهدة ' +
        (FUND_STATUS_LABELS[expenseFormActiveFund.status] || expenseFormActiveFund.status) +
        " حاليًا وليست نشطة — تأكد إنك اخترتها عن قصد (مثلًا لتسجيل مصروف قديم فاتك تسجيله وقتها).</span>"
      : "");
}

expenseFormAmountInput.addEventListener("input", updateExpenseBalancePreview);

expenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  expenseFormError.hidden = true;
  expenseFormError.textContent = "";

  if (!expenseFormActiveFund) {
    expenseFormError.textContent = "اختر العهدة المطلوب تسجيل المصروف عليها.";
    expenseFormError.hidden = false;
    return;
  }

  // حقل الفئة بقى Combobox مخصّص (مش Select عادي)؛ لو المستخدم اختار من
  // القائمة بيبقى عندنا id جاهز (expenseCategorySelectedId)، وإلا بنحاول
  // نحل النص المكتوب يدويًا عبر خريطة الأسماء المبنية في ensureExpenseCategories
  const categoryText = expenseFormCategorySelect.value.trim();
  const categoryId = expenseCategorySelectedId || expenseCategoryNameToId[normalizeImportKey(categoryText)];
  const amount = Number(expenseFormAmountInput.value);
  const date = expenseFormDateInput.value;
  const description = expenseFormDescriptionInput.value.trim();

  if (!categoryText) {
    expenseFormError.textContent = "الفئة مطلوبة.";
    expenseFormError.hidden = false;
    return;
  }
  if (!categoryId) {
    expenseFormError.textContent = 'الفئة "' + categoryText + '" غير موجودة — اختر فئة من القائمة المقترحة.';
    expenseFormError.hidden = false;
    return;
  }
  // لازم تكون في فئة فعلية دايمًا؛ لو الفئة المختارة هي "أخرى" فحقل اسم
  // الفئة الجديدة إجباري — هيتحوّل لفئة حقيقية جديدة بدل "أخرى" وقت الحفظ
  const isOtherCategory = Boolean(expenseOtherCategoryId) && categoryId === expenseOtherCategoryId;
  const newCategoryName = expenseFormNewCategoryInput.value.trim();
  if (isOtherCategory && !newCategoryName) {
    expenseFormError.textContent = 'اكتب اسم الفئة الجديدة بدل "أخرى" — لازم يكون في فئة محدّدة.';
    expenseFormError.hidden = false;
    return;
  }
  if (!expenseFormAmountInput.value || Number.isNaN(amount) || amount <= 0) {
    expenseFormError.textContent = "يجب أن يكون المبلغ رقمًا أكبر من صفر.";
    expenseFormError.hidden = false;
    return;
  }
  if (!date) {
    expenseFormError.textContent = "التاريخ مطلوب.";
    expenseFormError.hidden = false;
    return;
  }

  expenseFormSubmitButton.disabled = true;
  expenseFormSubmitButton.textContent = "جارٍ الحفظ...";

  try {
    // تحقق أخير من كفاية الرصيد بأرقام حديثة قبل الإرسال مباشرة (تقليل فرصة
    // الرصيد يبقى سالب في حالة تعديلات متزامنة). في وضع التعديل: لو العهدة
    // المختارة هي نفس العهدة الأصلية للمصروف، لازم نرجّع مبلغه القديم للرصيد
    // المتاح الأول (لأن current_balance أصلًا مخصوم منه المبلغ القديم ده)،
    // وإلا (نقل لعهدة تانية) الرصيد المتاح يفضل زي ما هو من غير أي تعديل
    const { data: freshBalance, error: freshBalanceError } = await supabaseClient
      .from("petty_cash_fund_balances")
      .select("current_balance")
      .eq("fund_id", expenseFormActiveFund.id)
      .single();

    if (freshBalanceError) {
      console.error("Error re-checking fund balance:", freshBalanceError);
    } else {
      let availableBalance = Number(freshBalance.current_balance);
      if (expenseBeingEdited && expenseBeingEdited.petty_cash_fund_id === expenseFormActiveFund.id) {
        availableBalance += Number(expenseBeingEdited.amount);
      }
      if (amount > availableBalance) {
        expenseFormError.textContent =
          "المبلغ المطلوب أكبر من الرصيد المتاح في العهدة (" +
          formatNumber(availableBalance, 2) +
          " ر.س). لا يمكن أن يكون الرصيد الناتج سالبًا.";
        expenseFormError.hidden = false;
        return;
      }
    }

    // لو المستخدم اختار "أخرى" وكتب اسم فئة جديد، نتأكد الأول إن مفيش فئة
    // بنفس الاسم أصلًا (تجنّبًا لتكرارها)، وإلا ننشئها فعليًا ونستخدم id
    // بتاعها بدل "أخرى" — كل مصروف لازم مربوط بفئة حقيقية ومحدّدة
    let finalCategoryId = categoryId;
    if (isOtherCategory) {
      const existingId = expenseCategoryNameToId[normalizeImportKey(newCategoryName)];
      if (existingId) {
        finalCategoryId = existingId;
      } else {
        const { data: newCategoryRow, error: newCategoryError } = await supabaseClient
          .from("expense_categories")
          .insert({ name: newCategoryName, name_ar: newCategoryName, is_active: true })
          .select("id")
          .single();

        if (newCategoryError) {
          console.error("Error creating new expense category:", newCategoryError);
          expenseFormError.textContent =
            newCategoryError.code === "23505"
              ? 'يوجد فئة بنفس الاسم "' + newCategoryName + '" بالفعل — جرّب تبحث عنها في حقل الفئة.'
              : "تعذّر إنشاء الفئة الجديدة: " + newCategoryError.message;
          expenseFormError.hidden = false;
          return;
        }

        finalCategoryId = newCategoryRow.id;
        expenseCategoriesCache = null; // نفضّي الكاش عشان الفئة الجديدة تظهر في القائمة من المرة الجاية
      }
    }

    const payload = {
      petty_cash_fund_id: expenseFormActiveFund.id,
      category_id: finalCategoryId,
      amount: amount,
      expense_date: date,
      description: description || null,
      supplier_name: expenseFormSupplierInput.value.trim() || null,
      invoice_number: expenseFormInvoiceInput.value.trim() || null,
      recipient_employee_name: expenseFormRecipientInput.value.trim() || null,
    };

    let saveError;
    if (expenseBeingEdited) {
      // تعديل: منسيبش created_by و created_at زي ما هما، ومنلمسش حالة
      // المصروف (نشط/ملغى) — التعديل ده لتصحيح بيانات مصروف موجود بس
      const { error } = await supabaseClient.from("expenses").update(payload).eq("id", expenseBeingEdited.id);
      saveError = error;
    } else {
      payload.created_by = currentAuthUser ? currentAuthUser.id : null;
      const { error } = await supabaseClient.from("expenses").insert(payload);
      saveError = error;
    }

    if (saveError) {
      console.error("Error saving expense:", saveError);

      if (
        saveError.code === "42501" ||
        (saveError.message && saveError.message.toLowerCase().includes("row-level security"))
      ) {
        expenseFormError.textContent = "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك).";
      } else if (saveError.code === "23503") {
        expenseFormError.textContent = "الفئة أو العهدة المرتبطة غير موجودة فعليًا.";
      } else if (saveError.code === "23514") {
        expenseFormError.textContent = "البيانات المدخلة لا تحقق شروط الصحة (تأكد من المبلغ).";
      } else {
        expenseFormError.textContent = "حدث خطأ أثناء الحفظ: " + saveError.message;
      }

      expenseFormError.hidden = false;
      return;
    }

    expenseFormModal.hidden = true;
    expenseBeingEdited = null;
    loadExpenses();
    loadCurrentFund();
  } catch (unexpectedError) {
    console.error("Unexpected error saving expense:", unexpectedError);
    expenseFormError.textContent = "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
    expenseFormError.hidden = false;
  } finally {
    expenseFormSubmitButton.disabled = false;
    expenseFormSubmitButton.textContent = expenseBeingEdited ? "حفظ التعديلات" : "حفظ";
  }
});

// ---------------------------------------------------------------------------
// 7.6 إلغاء مصروف (Void) — بدل الحذف النهائي، بنفس منطق إلغاء الوقود
// ---------------------------------------------------------------------------

function openExpenseVoidConfirm(expense) {
  expenseBeingVoided = expense;
  expenseVoidReasonInput.value = "";
  expenseVoidError.hidden = true;
  expenseVoidError.textContent = "";
  expenseVoidModal.hidden = false;
}

expenseVoidConfirmButton.addEventListener("click", async () => {
  if (!expenseBeingVoided) return;

  expenseVoidError.hidden = true;
  expenseVoidConfirmButton.disabled = true;
  expenseVoidConfirmButton.textContent = "جارٍ الإلغاء...";

  try {
    const { error } = await supabaseClient
      .from("expenses")
      .update({
        status: "voided",
        void_reason: expenseVoidReasonInput.value.trim() || null,
        voided_by: currentAuthUser ? currentAuthUser.id : null,
        voided_at: new Date().toISOString(),
      })
      .eq("id", expenseBeingVoided.id);

    if (error) {
      console.error("Error voiding expense:", error);
      expenseVoidError.textContent =
        error.code === "42501" ||
        (error.message && error.message.toLowerCase().includes("row-level security"))
          ? "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك)."
          : "حدث خطأ أثناء الإلغاء: " + error.message;
      expenseVoidError.hidden = false;
      return;
    }

    expenseVoidModal.hidden = true;
    expenseBeingVoided = null;
    loadExpenses();
    loadCurrentFund();
  } catch (unexpectedError) {
    console.error("Unexpected error voiding expense:", unexpectedError);
    expenseVoidError.textContent = "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
    expenseVoidError.hidden = false;
  } finally {
    expenseVoidConfirmButton.disabled = false;
    expenseVoidConfirmButton.textContent = "تأكيد الإلغاء";
  }
});

// ============================================================================
// 8. أداة تصدير CSV عامة (مستخدمة في مركز التقارير) — Phase 5
// ============================================================================

function exportRowsToCSV(filename, headers, rows) {
  const escapeCsvCell = (value) => {
    if (value === null || value === undefined) value = "";
    const str = String(value).replace(/"/g, '""');
    return /[",\n]/.test(str) ? '"' + str + '"' : str;
  };

  const lines = [headers.map(escapeCsvCell).join(",")];
  rows.forEach((row) => lines.push(row.map(escapeCsvCell).join(",")));

  // ﻿ (BOM) يضمن ظهور النصوص العربية صح لما الملف يتفتح في Excel
  const csvContent = "﻿" + lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast("تم تنزيل الملف بنجاح.", "success");
}

// ============================================================================
// 8b. أداة رسم بياني — Chart.js (بدل الرسم اليدوي بـ Canvas API القديم).
//     نفس أسماء وتوقيعات الدوال (drawLineChart/drawBarChart/drawDonutChart)
//     محفوظة كما هي، فكل نداءاتها في التقارير ولوحة الرئيسية شغالة من غير
//     أي تعديل — التغيير في التنفيذ الداخلي فقط. تعطي حركة دخول أنعم وtooltip
//     جاهز من غير منطق hover يدوي. هذا كود عرض بصري بحت (Presentation) ولا
//     يغيّر أي منطق أعمال — البيانات المُغذّية له من نفس الاستعلامات الموجودة.
// ============================================================================

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#000000";
}

// بيحوّل لون hex لنفس اللون بشفافية (لتعبئة متدرجة تحت خط الرسم) — بيدعم
// صيغة #rrggbb فقط (وهو الشكل التي كل ألوان النظام معرّفة بيه في :root)
function hexWithAlpha(hex, alphaHex) {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex + alphaHex : hex;
}

// لو الكانفاس هذا كان عليه Chart.js instance قديم (إعادة تحميل نفس التقرير)،
// يجب أن نتخلص منه الأول قبل ما ننشئ واحد جديد على نفس العنصر
function destroyExistingChart(canvas) {
  if (typeof Chart === "undefined") return;
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
}

// ---------------------------------------------------------------------------
// زرّ تحميل الرسم البياني كصورة PNG — يُضاف تلقائيًا بجانب عنوان كل بطاقة
// ---------------------------------------------------------------------------
function injectChartDownloadBtn(canvas) {
  if (!canvas) return;
  var card = canvas.closest(".chart-card");
  if (!card) return;
  if (card.querySelector(".chart-download-btn")) return;
  var titleEl = card.querySelector(".chart-card-title");
  if (!titleEl) return;

  var header = card.querySelector(".chart-card-header");
  if (!header) {
    header = document.createElement("div");
    header.className = "chart-card-header";
    titleEl.parentNode.insertBefore(header, titleEl);
    header.appendChild(titleEl);
  }

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "chart-download-btn";
  btn.title = "تحميل كصورة";
  btn.setAttribute("aria-label", "تحميل الرسم البياني كصورة");
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  btn.addEventListener("click", function () {
    downloadChartAsPNG(canvas, titleEl.textContent.trim());
  });
  header.appendChild(btn);
}

function downloadChartAsPNG(canvas, title) {
  if (!canvas) return;
  try {
    var link = document.createElement("a");
    link.download = (title || "chart").replace(/[^a-zA-Z0-9؀-ۿ _-]/g, "") + ".png";
    link.href = canvas.toDataURL("image/png", 1.0);
    link.click();
  } catch (e) {
    console.warn("Chart download failed:", e);
  }
}

const ENGLISH_MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// تجميع مجموع قيمة (مثل liters/amount) حسب الشهر من صفوف فيها حقل تاريخ —
// مستخدمة في رسوم اتجاه الوقود والمصروفات الشهرية. تُرجع مصفوفتين متوازيتين
// (تسميات + قيم) مرتبة زمنيًا تصاعديًا، من غير أي بيانات وهمية — لو لا يوجد
// صفوف، تُرجع مصفوفات فارغة والدالة المستدعية تتعامل مع الحالة هذه.
function groupSumByMonth(rows, dateField, valueField) {
  const totals = {};
  rows.forEach((r) => {
    const raw = r[dateField];
    if (!raw) return;
    const key = String(raw).slice(0, 7); // "YYYY-MM"
    totals[key] = (totals[key] || 0) + Number(r[valueField] || 0);
  });
  const keys = Object.keys(totals).sort();
  const labels = keys.map((k) => {
    const [y, m] = k.split("-");
    return ENGLISH_MONTHS_SHORT[Number(m) - 1] + " " + y.slice(2);
  });
  const values = keys.map((k) => totals[k]);
  return { labels, values };
}

// ---------------------------------------------------------------------------
// جلب كل الصفوف المطابقة لاستعلام مهما كان عددها، بدل الاكتفاء بأول 1000
// صف (الحد الافتراضي لـ PostgREST). لذا يجب تمرير دالة تبني استعلامًا جديدًا في كل
// مرة (بدون .range()) لأن نفس الـ query object لا يمكن إعادة استخدامه.
// ---------------------------------------------------------------------------

async function fetchAllRowsPaged(buildQuery, pageSize) {
  pageSize = pageSize || 1000;
  let allRows = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) return { data: null, error };
    const rows = data || [];
    allRows = allRows.concat(rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return { data: allRows, error: null };
}

// دالة (غير const ثابت) حتى تتقرأ من جديد كل مرة الرسم يترسم — لو كانت
// const عادي، الألوان كانت هتتجمد على أول ثيم كان شغال وقت تحميل الصفحة،
// ولن تتحدث عندما يبدّل المستخدم الوضع الغامق/الفاتح دون تحديث الصفحة
function getChartPalette() {
  return [
    cssVar("--color-primary"),
    cssVar("--color-accent"),
    cssVar("--color-success-text"),
    cssVar("--color-warning-text"),
    cssVar("--color-danger-text"),
    cssVar("--color-neutral-text"),
    cssVar("--color-primary-dark"),
  ];
}

// ---------------------------------------------------------------------------
// رسم خطي (Line Chart) — للاتجاهات الزمنية، ويُستخدم كذلك كـ Sparkline
// مصغّر عند تمرير sparkline:true (بدون شبكة/تسميات/حواف)
// ---------------------------------------------------------------------------
function drawLineChart(canvas, values, labels, options) {
  if (!canvas || typeof Chart === "undefined") return;
  const opts = options || {};
  const sparkline = !!opts.sparkline;
  const formatValue = opts.formatValue || ((v) => formatNumber(v, 1));
  const color = opts.color || cssVar("--color-primary");

  destroyExistingChart(canvas);
  if (!values.length) return;

  // إضافة مكوّن رسم تسميات البيانات فوق النقاط عند الطلب
  var showLabels = !sparkline && !!opts.showDataLabels;
  var dataLabelsPlugin = showLabels
    ? {
        id: "inlineDataLabels",
        afterDatasetsDraw: function (chart) {
          var ctx2 = chart.ctx;
          chart.data.datasets.forEach(function (dataset, di) {
            var meta = chart.getDatasetMeta(di);
            meta.data.forEach(function (point, idx) {
              var val = dataset.data[idx];
              if (val == null) return;
              ctx2.save();
              ctx2.font = "600 10px " + cssVar("--font-body");
              ctx2.fillStyle = cssVar("--color-text");
              ctx2.textAlign = "center";
              ctx2.textBaseline = "bottom";
              ctx2.fillText(formatNumber(val, opts.labelDecimals != null ? opts.labelDecimals : 0) + (opts.labelSuffix || ""), point.x, point.y - 6);
              ctx2.restore();
            });
          });
        },
      }
    : null;

  new Chart(canvas, {
    type: "line",
    data: {
      labels: labels || values.map((_, i) => i),
      datasets: [
        {
          data: values,
          borderColor: color,
          backgroundColor: (context) => {
            const { ctx, chartArea } = context.chart;
            if (!chartArea) return hexWithAlpha(color, "22");
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, hexWithAlpha(color, "3d"));
            gradient.addColorStop(1, hexWithAlpha(color, "00"));
            return gradient;
          },
          borderWidth: sparkline ? 1.5 : 2,
          pointRadius: sparkline ? 0 : 3,
          pointHoverRadius: sparkline ? 3 : 5,
          pointBackgroundColor: color,
          pointHoverBackgroundColor: color,
          tension: 0.3,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 650, easing: "easeOutQuart" },
      interaction: { intersect: false, mode: "index" },
      scales: sparkline
        ? { x: { display: false }, y: { display: false } }
        : {
            x: {
              grid: { display: false },
              ticks: { color: cssVar("--color-text-muted"), font: { size: 11 } },
            },
            y: {
              beginAtZero: true,
              grid: { color: cssVar("--color-border") },
              ticks: { color: cssVar("--color-text-muted"), font: { size: 11 }, callback: (v) => formatNumber(v, 0) },
            },
          },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          displayColors: false,
          callbacks: { label: (ctx) => formatValue(ctx.parsed.y) },
        },
      },
    },
    plugins: dataLabelsPlugin ? [dataLabelsPlugin] : [],
  });
  if (!sparkline) injectChartDownloadBtn(canvas);
}

// ---------------------------------------------------------------------------
// رسم أعمدة (Bar Chart) — رأسي أو أفقي عبر options.horizontal
// ---------------------------------------------------------------------------
function drawBarChart(canvas, values, labels, options) {
  if (!canvas || typeof Chart === "undefined") return;
  const opts = options || {};
  const horizontal = !!opts.horizontal;
  const formatValue = opts.formatValue || ((v) => formatNumber(v, 1));
  const color = cssVar("--color-primary");
  const hoverColor = cssVar("--color-primary-hover");

  destroyExistingChart(canvas);
  if (!values.length) return;

  const valueAxis = {
    beginAtZero: true,
    grid: { color: cssVar("--color-border") },
    ticks: { color: cssVar("--color-text-muted"), font: { size: 11 }, callback: (v) => formatNumber(v, 0) },
  };
  const labelAxis = {
    grid: { display: false },
    ticks: {
      color: cssVar("--color-text-muted"),
      font: { size: horizontal ? 12 : 11, weight: horizontal ? "600" : "400" },
      padding: horizontal ? 8 : 4,
      callback: function (value) {
        const label = this.getLabelForValue(value);
        // للأسماء (رسوم أفقية) بنسمح بطول أكبر قبل الاختصار، وللتسميات
        // القصيرة مثل الشهور (رسوم رأسية) لا يوجد داعي للاختصار أصلًا
        const maxLen = horizontal ? 22 : 14;
        return label && label.length > maxLen ? label.slice(0, maxLen - 1) + "…" : label;
      },
    },
  };

  new Chart(canvas, {
    type: "bar",
    data: {
      labels: labels || [],
      datasets: [
        {
          data: values,
          backgroundColor: hexWithAlpha(color, "e6"),
          hoverBackgroundColor: hoverColor,
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: horizontal ? 22 : 40,
        },
      ],
    },
    options: {
      indexAxis: horizontal ? "y" : "x",
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 650, easing: "easeOutQuart" },
      scales: horizontal ? { x: valueAxis, y: labelAxis } : { x: labelAxis, y: valueAxis },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          displayColors: false,
          callbacks: {
            title: (items) => (items[0] ? items[0].label : ""),
            label: (ctx) => formatValue(horizontal ? ctx.parsed.x : ctx.parsed.y),
          },
        },
      },
    },
  });
  injectChartDownloadBtn(canvas);
}

// ---------------------------------------------------------------------------
// رسم خطّي مزدوج المحاور — محور أيسر (اللترات) + محور أيمن (التكلفة)
// يُستخدم لعرض اتجاه استهلاك الوقود الشهري بالوحدتين معًا
// ---------------------------------------------------------------------------
function drawDualLineChart(canvas, litersData, costData) {
  if (!canvas || typeof Chart === "undefined") return;
  destroyExistingChart(canvas);
  if (!litersData.values.length) return;

  var literColor = cssVar("--color-turquoise");
  var costColor = cssVar("--color-rose");

  new Chart(canvas, {
    type: "line",
    data: {
      labels: litersData.labels,
      datasets: [
        {
          label: "اللترات",
          data: litersData.values,
          borderColor: literColor,
          backgroundColor: hexWithAlpha(literColor, "18"),
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: literColor,
          tension: 0.3,
          fill: true,
          yAxisID: "yLiters",
        },
        {
          label: "التكلفة (ر.س)",
          data: costData.values,
          borderColor: costColor,
          backgroundColor: hexWithAlpha(costColor, "18"),
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: costColor,
          tension: 0.3,
          fill: true,
          yAxisID: "yCost",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 650, easing: "easeOutQuart" },
      interaction: { intersect: false, mode: "index" },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: cssVar("--color-text-muted"), font: { size: 11 } },
        },
        yLiters: {
          position: "right",
          beginAtZero: true,
          grid: { color: cssVar("--color-border") },
          ticks: {
            color: literColor,
            font: { size: 11 },
            callback: function (v) { return formatNumber(v, 0) + " لتر"; },
          },
        },
        yCost: {
          position: "left",
          beginAtZero: true,
          grid: { display: false },
          ticks: {
            color: costColor,
            font: { size: 11 },
            callback: function (v) { return formatNumber(v, 0) + " ر.س"; },
          },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: "top",
          align: "start",
          labels: {
            color: cssVar("--color-text"),
            font: { size: 12, weight: "600" },
            usePointStyle: true,
            pointStyle: "circle",
            padding: 16,
          },
        },
        tooltip: {
          enabled: true,
          displayColors: true,
          callbacks: {
            label: function (ctx) {
              if (ctx.datasetIndex === 0)
                return "اللترات: " + formatNumber(ctx.parsed.y, 1) + " لتر";
              return "التكلفة: " + formatNumber(ctx.parsed.y, 2) + " ر.س";
            },
          },
        },
      },
    },
  });
  injectChartDownloadBtn(canvas);
}

// ---------------------------------------------------------------------------
// رسم دائري/Donut — لأكثر من قطاع (توزيع فئات) أو قطاعين فقط (نسبة صرف)
// segments: [{ label, value, color? }]
// ---------------------------------------------------------------------------
function drawDonutChart(canvas, segments, options) {
  if (!canvas || typeof Chart === "undefined") return;
  const opts = options || {};
  const formatValue = opts.formatValue || ((v) => formatNumber(v, 1));

  destroyExistingChart(canvas);
  const total = segments.reduce((sum, s) => sum + Math.max(s.value, 0), 0);
  if (!total) return;

  const chartPalette = getChartPalette();
  const colors = segments.map((seg, i) => seg.color || chartPalette[i % chartPalette.length]);

  new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: segments.map((s) => s.label),
      datasets: [
        {
          data: segments.map((s) => Math.max(s.value, 0)),
          backgroundColor: colors,
          hoverBackgroundColor: colors,
          borderColor: cssVar("--color-surface"),
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      cutout: (opts.thickness || 0.62) * 100 + "%",
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 650, easing: "easeOutQuart" },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          displayColors: true,
          callbacks: { label: (ctx) => ctx.label + ": " + formatValue(ctx.parsed) },
        },
      },
    },
  });
  injectChartDownloadBtn(canvas);
}

function renderChartLegend(container, items) {
  if (!container) return;
  container.innerHTML = items
    .map(
      (item) =>
        '<span class="chart-legend-item"><span class="chart-legend-dot" style="background:' +
        item.color +
        '"></span>' +
        escapeHtml(item.label) +
        "</span>"
    )
    .join("");
}

// ============================================================================
// 9. لوحة الرئيسية (Dashboard) — بيانات حقيقية من Supabase — Phase 5
// ============================================================================

const dashboardStatsContainer = document.getElementById("dashboard-stats");
const dashboardAttentionContainer = document.getElementById("dashboard-attention");
const dashboardOverviewGrid = document.getElementById("dashboard-overview-grid");

// الانتقال لصفحة السيارات مع تطبيق فلتر حالة معيّن مباشرة — تُستخدم من
// أزرار "الأشياء التي تحتاج الانتباه" في لوحة الرئيسية
function goToVehiclesWithStatusFilter(status) {
  navigateTo("vehicles");
  vehiclesStatusFilter.value = status;
  vehiclesState.status = status;
  vehiclesState.page = 1;
  loadVehicles();
}

// variant اختياري بيضيف لون/تدرج مخصص للكارت (primary/fuel/fund/expense) —
// من غير ما نبعته يظل الشكل الافتراضي القديم كما هو (مستخدم برضو في
// بطاقات الملخص الخاصة بالتقارير والصفحات الأخرى، وليس فقط Dashboard)
function statCardHtml(icon, label, value, hint, extraHtml, variant) {
  const variantClass = variant ? " stat-card-" + variant : "";
  // القيمة عادة رقم قصير (مثل "150" أو "22,889.2 لتر")، لكن أحيانًا بتكون
  // رسالة نصية كاملة لما لا يوجد بيانات (مثل "لا توجد عهدة نشطة") — في الحالة
  // هذه بنستخدم خط أصغر بدل ما نفرض نفس حجم الأرقام الكبير على جملة كاملة
  const plainValueLength = String(value).replace(/<[^>]*>/g, "").trim().length;
  const valueClass = "stat-card-value" + (plainValueLength > 14 ? " is-compact" : "");
  return (
    '<div class="stat-card' + variantClass + '">' +
    (icon ? '<span class="card-icon" aria-hidden="true">' + icon + "</span>" : "") +
    '<span class="stat-card-label">' + escapeHtml(label) + "</span>" +
    '<span class="' + valueClass + '">' + value + "</span>" +
    (hint ? '<span class="stat-card-hint">' + escapeHtml(hint) + "</span>" : "") +
    (extraHtml || "") +
    "</div>"
  );
}

// مؤشر اتجاه بسيط (▲/▼) بمقارنة القيمة الحالية بالشهر السابق — بيانات
// حقيقية فقط من قاعدة البيانات؛ لو لا يوجد بيانات كافية للشهر السابق
// (صفر أو غير موجودة)، يتم تجاهل المؤشر تمامًا بدل اختلاق نسبة
function trendBadgeHtml(current, previous, previousMonthLabel) {
  if (!previous || previous <= 0) return "";
  const monthSuffix = previousMonthLabel ? " عن " + previousMonthLabel : " عن الشهر السابق";
  const change = ((current - previous) / previous) * 100;

  if (Math.abs(change) < 0.5) {
    return '<span class="trend-badge trend-flat">≈ بدون تغيير' + monthSuffix + "</span>";
  }

  const isUp = change > 0;
  const cls = isUp ? "trend-up" : "trend-down";
  const arrow = isUp ? "▲" : "▼";

  // لو الشهر السابق بيانته قليلة جدًا، النسبة المئوية بتطلع رقم ضخم ومضلل
  // (مثل 30,688%) — بدل ما نعرضه كرقم، بنوضح إن المقارنة غير دقيقة بسبب قلة
  // بيانات الشهر السابق نفسه، غير خطأ في الحساب
  if (Math.abs(change) > 300) {
    return (
      '<span class="trend-badge ' + cls + '">' + arrow + " " +
      (isUp ? "ارتفاع كبير" : "انخفاض كبير") +
      monthSuffix + " (بيانات الشهر السابق قليلة، فالمقارنة تقريبية)</span>"
    );
  }

  return (
    '<span class="trend-badge ' + cls + '">' + arrow + " " + formatNumber(Math.abs(change), 0) + "%" + monthSuffix + "</span>"
  );
}

// خط اتجاه مصغّر (Sparkline) لآخر 7 أيام — بيانات حقيقية فقط، ولو لا يوجد أي
// نشاط فعلي خلال الفترة يتم إخفاء الـ Sparkline بدل رسم خط مسطح على صفر
async function loadDashboardSparklines() {
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);
  const fromDate = sevenDaysAgo.toISOString().slice(0, 10);

  const [fuelRes, expensesRes] = await Promise.all([
    supabaseClient
      .from("fuel_transactions")
      .select("transaction_date, liters")
      .eq("status", "active")
      .gte("transaction_date", fromDate),
    supabaseClient
      .from("expenses")
      .select("expense_date, amount")
      .eq("status", "active")
      .gte("expense_date", fromDate),
  ]);

  if (fuelRes.error) console.error("Error loading fuel sparkline:", fuelRes.error);
  if (expensesRes.error) console.error("Error loading expenses sparkline:", expensesRes.error);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sevenDaysAgo);
    d.setDate(sevenDaysAgo.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }

  const fuelByDay = {};
  (fuelRes.data || []).forEach((r) => {
    fuelByDay[r.transaction_date] = (fuelByDay[r.transaction_date] || 0) + Number(r.liters || 0);
  });
  const fuelValues = days.map((d) => fuelByDay[d] || 0);

  const expByDay = {};
  (expensesRes.data || []).forEach((r) => {
    expByDay[r.expense_date] = (expByDay[r.expense_date] || 0) + Number(r.amount || 0);
  });
  const expValues = days.map((d) => expByDay[d] || 0);

  const fuelCanvas = document.getElementById("dashboard-fuel-sparkline");
  const expCanvas = document.getElementById("dashboard-expenses-sparkline");

  if (fuelCanvas) {
    if (fuelValues.some((v) => v > 0)) {
      drawLineChart(fuelCanvas, fuelValues, null, {
        sparkline: true,
        color: "#d97706",
        formatValue: (v) => formatNumber(v, 1) + " لتر",
      });
    } else {
      fuelCanvas.closest(".sparkline-wrapper").hidden = true;
    }
  }

  if (expCanvas) {
    if (expValues.some((v) => v > 0)) {
      drawLineChart(expCanvas, expValues, null, {
        sparkline: true,
        color: "#a24462",
        formatValue: (v) => formatNumber(v, 2) + " ر.س",
      });
    } else {
      expCanvas.closest(".sparkline-wrapper").hidden = true;
    }
  }
}

function currentMonthStartDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return year + "-" + month + "-01";
}

// يبني حدود الشهر (بداية + بداية الشهر الذي يليه كـ"سقف مستبعد") من أي
// تاريخ داخل الشهر ده، وبيرجع كمان تاريخ "أول يوم في الشهر" كـ Date حتى
// نقدر نجيب اسم الشهر بـ formatMonthOnly لما نحتاج نعرضه في عنوان الكارت
function monthRangeFromDateString(dateStr) {
  const [year, month] = dateStr.slice(0, 7).split("-").map(Number);
  const start = year + "-" + String(month).padStart(2, "0") + "-01";
  const endYear = month === 12 ? year + 1 : year;
  const endMonth = month === 12 ? 1 : month + 1;
  const endExclusive = endYear + "-" + String(endMonth).padStart(2, "0") + "-01";
  return { start, endExclusive, year, month };
}

function monthRangeBefore(range) {
  const prevMonth = range.month === 1 ? 12 : range.month - 1;
  const prevYear = range.month === 1 ? range.year - 1 : range.year;
  return monthRangeFromDateString(prevYear + "-" + String(prevMonth).padStart(2, "0") + "-01");
}

// الوقود والمصروفات عادةً تُسجَّل دفعة واحدة شهريًا (بيان من الشركة/المورّد)
// وليس يوميًا، فإذا استخدمنا "الشهر الحالي بالتقويم" حرفيًا، ستظل البطاقة
// تعرض صفرًا إلى أن يصل بيان الشهر هذا ويُسجَّل حتى لو البيانات كلها سليمة. الحل:
// نحضر آخر شهر توجد فيه بيانات فعليًا لكل جدول على حدة، ونستخدمه بدل الشهر الحالي
// حرفيًا — وإذا لم توجد بيانات إطلاقًا، نعود إلى الشهر الحالي بالتقويم كافتراضي
async function latestMonthWithData(tableName, dateColumn) {
  const { data, error } = await supabaseClient
    .from(tableName)
    .select(dateColumn)
    .eq("status", "active")
    .order(dateColumn, { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data || !data[dateColumn]) return null;
  return monthRangeFromDateString(data[dateColumn]);
}

// ---------------------------------------------------------------------------
// 9.0 نسخة مخصّصة من لوحة الرئيسية لدور "دعم تقني" — لا تستعلم إطلاقًا عن
// السيارات/الوقود/العهدة النقدية/المصروفات (بيتي كاش)، فلا تظهر بياناتها
// أبدًا لهذا الدور، لا في الكروت العلوية ولا في قسم "نظرة عامة"
// ---------------------------------------------------------------------------
async function loadDashboardStatsForItSupport() {
  dashboardStatsContainer.innerHTML = skeletonCardsHtml(1, "stat-cards-grid", "stat-card");
  dashboardAttentionContainer.hidden = true;

  const [itLaptopsCountRes, itEmailCountRes, itSimCountRes, itTabletsCountRes] = await Promise.all([
    supabaseClient.from("it_laptop_assignments").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabaseClient.from("it_email_assignments").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabaseClient.from("it_sim_assignments").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabaseClient.from("it_tablet_assignments").select("id", { count: "exact", head: true }).eq("status", "active"),
  ]);

  if (itLaptopsCountRes.error) console.error("Error loading laptops count:", itLaptopsCountRes.error);
  if (itEmailCountRes.error) console.error("Error loading email count:", itEmailCountRes.error);
  if (itSimCountRes.error) console.error("Error loading SIM count:", itSimCountRes.error);
  if (itTabletsCountRes.error) console.error("Error loading tablets count:", itTabletsCountRes.error);

  const itAssetsHasError =
    itLaptopsCountRes.error || itEmailCountRes.error || itSimCountRes.error || itTabletsCountRes.error;
  const itLaptopsCount = itLaptopsCountRes.count || 0;
  const itEmailCount = itEmailCountRes.count || 0;
  const itSimCount = itSimCountRes.count || 0;
  const itTabletsCount = itTabletsCountRes.count || 0;
  const itAssetsTotalCount = itLaptopsCount + itEmailCount + itSimCount + itTabletsCount;

  dashboardStatsContainer.innerHTML = statCardHtml(
    icon("chartBar"),
    "أصول تقنية المعلومات",
    itAssetsHasError ? "—" : String(itAssetsTotalCount),
    itAssetsHasError
      ? "تعذر تحميل بيانات الأصول، حاول تحديث الصفحة"
      : "لابتوب " + itLaptopsCount + " • إيميل " + itEmailCount + " • سيم " + itSimCount + " • تابلت " + itTabletsCount,
    "",
    "assets"
  );

  renderDashboardOverview({
    itLaptopsCount,
    itEmailCount,
    itSimCount,
    itTabletsCount,
    itAssetsOk: !itAssetsHasError,
    itOnly: true,
  });
}

async function loadDashboardStats() {
  if (currentProfile && currentProfile.role === "it_support") {
    await loadDashboardStatsForItSupport();
    return;
  }

  dashboardStatsContainer.innerHTML = skeletonCardsHtml(5, "stat-cards-grid", "stat-card");

  const currentCalendarMonthStart = currentMonthStartDate();

  const [latestFuelMonth, latestExpenseMonth] = await Promise.all([
    latestMonthWithData("fuel_transactions", "transaction_date"),
    latestMonthWithData("expenses", "expense_date"),
  ]);

  const fuelMonthRange = latestFuelMonth || monthRangeFromDateString(currentCalendarMonthStart);
  const expenseMonthRange = latestExpenseMonth || monthRangeFromDateString(currentCalendarMonthStart);
  const prevFuelMonthRange = monthRangeBefore(fuelMonthRange);
  const prevExpenseMonthRange = monthRangeBefore(expenseMonthRange);

  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const thirtyDaysFromNowStr = thirtyDaysFromNow.toISOString().slice(0, 10);

  const dashboardStatsResults = await Promise.all([
    supabaseClient.from("vehicles").select("status"),
    supabaseClient
      .from("fuel_transactions")
      .select("liters, amount, vehicle:vehicles ( license_plate )")
      .eq("status", "active")
      .gte("transaction_date", fuelMonthRange.start)
      .lt("transaction_date", fuelMonthRange.endExclusive),
    supabaseClient
      .from("expenses")
      .select("amount, category:expense_categories ( name, name_ar )")
      .eq("status", "active")
      .gte("expense_date", expenseMonthRange.start)
      .lt("expense_date", expenseMonthRange.endExclusive),
    // بيانات الشهر التي قبل الشهر المعروض (غير بالضرورة الشهر الحالي
    // بالتقويم) — تُستخدم فقط لحساب مؤشر الاتجاه (▲/▼)، ولو فشل الاستعلام
    // أو كانت النتيجة صفر يتم تجاهل المؤشر تمامًا
    supabaseClient
      .from("fuel_transactions")
      .select("amount")
      .eq("status", "active")
      .gte("transaction_date", prevFuelMonthRange.start)
      .lt("transaction_date", prevFuelMonthRange.endExclusive),
    supabaseClient
      .from("expenses")
      .select("amount")
      .eq("status", "active")
      .gte("expense_date", prevExpenseMonthRange.start)
      .lt("expense_date", prevExpenseMonthRange.endExclusive),
    // سيارات عليها تفويض قيادة منتهٍ أو سينتهي خلال 30 يومًا — لعرضها في
    // "الأشياء التي تحتاج الانتباه" تحت
    supabaseClient
      .from("vehicles")
      .select("id, license_plate, authorization_expiry_date")
      .not("authorization_expiry_date", "is", null)
      .lte("authorization_expiry_date", thirtyDaysFromNowStr),
    // إجمالي أصول تقنية المعلومات النشطة (بيانات فعلية، غير مجرد عدد الصفوف
    // الكلي — الأصول المستردة/الملغاة متتحسبش هنا)
    supabaseClient.from("it_laptop_assignments").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabaseClient.from("it_email_assignments").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabaseClient.from("it_sim_assignments").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabaseClient.from("it_tablet_assignments").select("id", { count: "exact", head: true }).eq("status", "active"),
  ]);

  const [
    vehiclesRes,
    fuelRes,
    expensesRes,
    prevFuelRes,
    prevExpensesRes,
    authExpiryRes,
    itLaptopsCountRes,
    itEmailCountRes,
    itSimCountRes,
    itTabletsCountRes,
  ] = dashboardStatsResults;

  // يجب أن نسجّل ونعرض أي خطأ هنا بوضوح — لولا ذلك لو استعلام فشل بصمت
  // كان سيظهر "0 سيارات" أو رقم غلط يتعارض مع الرقم الحقيقي في صفحة
  // السيارات نفسها، دون أن يعرف المستخدم أن هناك مشكلة أصلًا
  if (vehiclesRes.error) console.error("Error loading vehicles stats:", vehiclesRes.error);
  if (fuelRes.error) console.error("Error loading fuel stats:", fuelRes.error);
  if (expensesRes.error) console.error("Error loading expenses stats:", expensesRes.error);
  if (prevFuelRes.error) console.error("Error loading previous month fuel stats:", prevFuelRes.error);
  if (prevExpensesRes.error) console.error("Error loading previous month expenses stats:", prevExpensesRes.error);
  if (authExpiryRes.error) console.error("Error loading vehicle authorization expiry stats:", authExpiryRes.error);
  if (itLaptopsCountRes.error) console.error("Error loading laptops count:", itLaptopsCountRes.error);
  if (itEmailCountRes.error) console.error("Error loading email count:", itEmailCountRes.error);
  if (itSimCountRes.error) console.error("Error loading SIM count:", itSimCountRes.error);
  if (itTabletsCountRes.error) console.error("Error loading tablets count:", itTabletsCountRes.error);

  const itAssetsHasError =
    itLaptopsCountRes.error || itEmailCountRes.error || itSimCountRes.error || itTabletsCountRes.error;
  const itLaptopsCount = itLaptopsCountRes.count || 0;
  const itEmailCount = itEmailCountRes.count || 0;
  const itSimCount = itSimCountRes.count || 0;
  const itTabletsCount = itTabletsCountRes.count || 0;
  const itAssetsTotalCount = itLaptopsCount + itEmailCount + itSimCount + itTabletsCount;

  const prevMonthFuelCost = prevFuelRes.error
    ? 0
    : (prevFuelRes.data || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const prevMonthExpenseTotal = prevExpensesRes.error
    ? 0
    : (prevExpensesRes.data || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);

  await loadCurrentFund(); // بيحدّث currentActiveFund العام

  const vehicles = vehiclesRes.data || [];
  const totalVehicles = vehicles.length;
  const assignedCount = vehicles.filter((v) => v.status === "assigned").length;
  const maintenanceCount = vehicles.filter((v) => v.status === "under_maintenance").length;

  // تفويض القيادة: منتهٍ فعلاً (قبل اليوم) مقابل سينتهي خلال 30 يومًا
  const todayStr = new Date().toISOString().slice(0, 10);
  const authExpiryRows = authExpiryRes.data || [];
  const expiredAuthVehicles = authExpiryRows.filter((v) => v.authorization_expiry_date < todayStr);
  const expiringSoonAuthVehicles = authExpiryRows.filter((v) => v.authorization_expiry_date >= todayStr);

  const fuelRows = fuelRes.data || [];
  const monthLiters = fuelRows.reduce((sum, r) => sum + Number(r.liters || 0), 0);
  const monthFuelCost = fuelRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);

  // أعلى سيارة تكلفة وقود هذا الشهر — بيانات حقيقية فقط من المعاملات
  // المحمّلة أصلًا لبطاقات لوحة الرئيسية، دون أي استعلام إضافي
  const vehicleFuelTotals = {};
  fuelRows.forEach((r) => {
    const number = r.vehicle ? r.vehicle.license_plate : null;
    if (!number) return;
    vehicleFuelTotals[number] = (vehicleFuelTotals[number] || 0) + Number(r.amount || 0);
  });
  const topVehicleFuelEntry = Object.entries(vehicleFuelTotals).sort((a, b) => b[1] - a[1])[0];

  const expenseRows = expensesRes.data || [];
  const monthExpenseTotal = expenseRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const categoryTotals = {};
  expenseRows.forEach((r) => {
    const name = r.category ? r.category.name_ar || r.category.name : "غير مصنّف";
    categoryTotals[name] = (categoryTotals[name] || 0) + Number(r.amount || 0);
  });
  const topCategoryEntry = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];

  // عنوان البطاقة يظل "هذا الشهر" طالما الشهر المعروض هو فعلاً الشهر
  // الحالي بالتقويم. إذا عدنا لآخر شهر توجد فيه بيانات (لأن بيانات الشهر
  // الحالي لم تصل/تُسجَّل بعد)، نوضح اسم الشهر المعروض صراحةً حتى لا
  // نوهم بأن هذا هو "الشهر الحالي" وهو ليس كذلك
  const fuelCardTitle =
    fuelMonthRange.start === currentCalendarMonthStart
      ? "الوقود هذا الشهر"
      : "الوقود — " + formatMonthOnly(fuelMonthRange.start);
  const expenseCardTitle =
    expenseMonthRange.start === currentCalendarMonthStart
      ? "مصروفات هذا الشهر"
      : "مصروفات — " + formatMonthOnly(expenseMonthRange.start);

  dashboardStatsContainer.innerHTML =
    statCardHtml(
      icon("car"),
      "السيارات",
      vehiclesRes.error ? "—" : String(totalVehicles),
      vehiclesRes.error
        ? "تعذر تحميل بيانات السيارات، حاول تحديث الصفحة"
        : totalVehicles
        ? assignedCount + " مخصصة — " + maintenanceCount + " تحت الصيانة"
        : "لا توجد سيارات مضافة بعد",
      "",
      "primary"
    ) +
    statCardHtml(
      icon("fuel"),
      fuelCardTitle,
      fuelRes.error ? "—" : formatNumber(monthLiters, 1) + " لتر",
      fuelRes.error ? "تعذر تحميل بيانات الوقود، حاول تحديث الصفحة" : "التكلفة: " + formatNumber(monthFuelCost, 2) + " ر.س",
      (fuelRes.error ? "" : trendBadgeHtml(monthFuelCost, prevMonthFuelCost, formatMonthOnly(prevFuelMonthRange.start))) +
        (fuelRes.error ? "" : '<div class="sparkline-wrapper"><canvas id="dashboard-fuel-sparkline"></canvas></div>'),
      "fuel"
    ) +
    statCardHtml(
      icon("wallet"),
      "رصيد العهدة النشطة",
      currentActiveFund ? formatNumber(currentActiveFund.current_balance, 2) + " ر.س" : "لا توجد عهدة نشطة",
      currentActiveFund ? "العهدة: " + currentActiveFund.fund_code : "",
      "",
      "fund"
    ) +
    statCardHtml(
      icon("receipt"),
      expenseCardTitle,
      expensesRes.error ? "—" : formatNumber(monthExpenseTotal, 2) + " ر.س",
      expensesRes.error
        ? "تعذر تحميل بيانات المصروفات، حاول تحديث الصفحة"
        : topCategoryEntry
        ? "أعلى فئة: " + topCategoryEntry[0]
        : "لا توجد مصروفات بعد",
      (expensesRes.error
        ? ""
        : trendBadgeHtml(monthExpenseTotal, prevMonthExpenseTotal, formatMonthOnly(prevExpenseMonthRange.start))) +
        (expensesRes.error ? "" : '<div class="sparkline-wrapper"><canvas id="dashboard-expenses-sparkline"></canvas></div>'),
      "expense"
    ) +
    statCardHtml(
      icon("chartBar"),
      "أصول تقنية المعلومات",
      itAssetsHasError ? "—" : String(itAssetsTotalCount),
      itAssetsHasError
        ? "تعذر تحميل بيانات الأصول، حاول تحديث الصفحة"
        : "لابتوب " + itLaptopsCount + " • إيميل " + itEmailCount + " • سيم " + itSimCount + " • تابلت " + itTabletsCount,
      "",
      "assets"
    );

  if (!fuelRes.error || !expensesRes.error) loadDashboardSparklines();

  renderDashboardAttention({
    maintenanceCount,
    vehiclesOk: !vehiclesRes.error,
    expiredAuthVehicles,
    expiringSoonAuthVehicles,
    authExpiryOk: !authExpiryRes.error,
  });

  renderDashboardOverview({
    vehicles,
    vehiclesOk: !vehiclesRes.error,
    assignedCount,
    maintenanceCount,
    monthLiters,
    monthFuelCost,
    fuelTxCount: fuelRows.length,
    fuelOk: !fuelRes.error,
    fuelMonthLabel:
      fuelMonthRange.start === currentCalendarMonthStart ? "هذا الشهر" : formatMonthOnly(fuelMonthRange.start),
    monthExpenseTotal,
    expenseTxCount: expenseRows.length,
    topCategoryEntry,
    expensesOk: !expensesRes.error,
    expenseMonthLabel:
      expenseMonthRange.start === currentCalendarMonthStart ? "هذا الشهر" : formatMonthOnly(expenseMonthRange.start),
    fundOk: !!currentActiveFund,
    fundBalance: currentActiveFund ? Number(currentActiveFund.current_balance || 0) : 0,
    fundCode: currentActiveFund ? currentActiveFund.fund_code : "",
    fundUsagePercent: currentActiveFund && currentActiveFund.opening_amount > 0
      ? (Number(currentActiveFund.total_expenses || 0) / Number(currentActiveFund.opening_amount)) * 100
      : 0,
    itLaptopsCount,
    itEmailCount,
    itSimCount,
    itTabletsCount,
    itAssetsOk: !itAssetsHasError,
  });
}

// ---------------------------------------------------------------------------
// 9.1 الأشياء التي تحتاج الانتباه — تُبنى فقط من حالات حقيقية محسوبة من
// البيانات المحمّلة أصلًا لهذه الصفحة؛ لو لا يوجد أي حالة تستدعي انتباهًا
// بيُعرض تأكيد إيجابي بسيط بدل اختلاق مؤشر
// ---------------------------------------------------------------------------
function renderDashboardAttention({
  maintenanceCount,
  vehiclesOk,
  expiredAuthVehicles,
  expiringSoonAuthVehicles,
  authExpiryOk,
}) {
  const items = [];

  if (vehiclesOk && maintenanceCount > 0) {
    items.push({
      type: "warning",
      text:
        maintenanceCount === 1
          ? "توجد سيارة واحدة تحت الصيانة حاليًا."
          : "توجد " + maintenanceCount + " سيارات تحت الصيانة حاليًا.",
      actionLabel: "عرض السيارات تحت الصيانة",
      action: () => goToVehiclesWithStatusFilter("under_maintenance"),
    });
  }

  if (authExpiryOk && expiredAuthVehicles && expiredAuthVehicles.length > 0) {
    items.push({
      type: "warning",
      text:
        expiredAuthVehicles.length === 1
          ? "تفويض قيادة سيارة واحدة (" + expiredAuthVehicles[0].license_plate + ") منتهي بالفعل."
          : "تفويض قيادة " + expiredAuthVehicles.length + " سيارات منتهي بالفعل.",
      actionLabel: "عرض السيارات",
      action: () => navigateTo("vehicles"),
    });
  }

  if (authExpiryOk && expiringSoonAuthVehicles && expiringSoonAuthVehicles.length > 0) {
    items.push({
      type: "info",
      text:
        expiringSoonAuthVehicles.length === 1
          ? "تفويض قيادة سيارة واحدة (" + expiringSoonAuthVehicles[0].license_plate + ") سينتهي خلال 30 يومًا."
          : "تفويض قيادة " + expiringSoonAuthVehicles.length + " سيارات سينتهي خلال 30 يومًا.",
      actionLabel: "عرض السيارات",
      action: () => navigateTo("vehicles"),
    });
  }

  if (!currentActiveFund) {
    items.push({
      type: "info",
      text: "لا توجد عهدة نقدية نشطة حاليًا.",
      actionLabel: "الذهاب إلى العهدة النقدية",
      action: () => navigateTo("petty-cash"),
    });
  } else if (currentActiveFund.status === "exhausted") {
    items.push({
      type: "warning",
      text: "العهدة الحالية (" + currentActiveFund.fund_code + ") مستنفدة بالكامل.",
      actionLabel: "عرض العهدة الحالية",
      action: () => navigateTo("petty-cash"),
    });
  } else if (currentActiveFund.opening_amount > 0) {
    const usageRatio = Number(currentActiveFund.total_expenses || 0) / Number(currentActiveFund.opening_amount);
    if (usageRatio >= 0.85) {
      items.push({
        type: "warning",
        text:
          "العهدة الحالية (" + currentActiveFund.fund_code + ") قاربت على النفاد — تبقّى " +
          formatNumber(currentActiveFund.current_balance, 2) + " ر.س فقط من أصل " +
          formatNumber(currentActiveFund.opening_amount, 2) + " ر.س.",
        actionLabel: "عرض العهدة الحالية",
        action: () => navigateTo("petty-cash"),
      });
    }
  }

  if (items.length === 0) {
    items.push({ type: "ok", text: "لا توجد عناصر تحتاج انتباهك الآن.", actionLabel: null, action: null });
  }

  dashboardAttentionContainer.hidden = false;
  dashboardAttentionContainer.innerHTML = items
    .map(
      (item, index) =>
        '<div class="attention-item is-' + item.type + '">' +
        '<span class="attention-item-text">' + escapeHtml(item.text) + "</span>" +
        (item.actionLabel
          ? '<button type="button" class="btn-secondary btn-sm attention-item-action" data-attention-index="' + index + '">' +
            escapeHtml(item.actionLabel) + "</button>"
          : "") +
        "</div>"
    )
    .join("");

  dashboardAttentionContainer.querySelectorAll(".attention-item-action").forEach((button) => {
    const index = Number(button.getAttribute("data-attention-index"));
    button.addEventListener("click", () => {
      if (items[index] && items[index].action) items[index].action();
    });
  });
}

// ---------------------------------------------------------------------------
// 9.2 نظرة عامة شاملة — كروت مختصرة لكل أقسام النظام تُعرض في الرئيسية
// بدلاً من الملخص الذكي وآخر العمليات. كل كرت يحوي عنوان القسم، أرقام
// أساسية، وزر سريع للانتقال إلى الصفحة المعنية
// ---------------------------------------------------------------------------
function overviewCardHtml(iconSvg, title, rows, navTarget, accent) {
  return (
    '<div class="overview-card overview-accent-' + (accent || "primary") + '" role="region" aria-label="' + escapeHtml(title) + '">' +
    '<div class="overview-card-head">' +
    '<span class="overview-card-icon" aria-hidden="true">' + iconSvg + "</span>" +
    '<span class="overview-card-title">' + escapeHtml(title) + "</span>" +
    "</div>" +
    '<div class="overview-card-body">' +
    rows.map(function (r) {
      return '<div class="overview-row">' +
        '<span class="overview-row-label">' + escapeHtml(r.label) + "</span>" +
        '<span class="overview-row-value">' + escapeHtml(r.value) + "</span>" +
        "</div>";
    }).join("") +
    "</div>" +
    '<button type="button" class="overview-card-action" data-nav="' + navTarget + '">عرض التفاصيل</button>' +
    "</div>"
  );
}

function renderDashboardOverview(d) {
  var cards = [];

  // دعم تقني لا يجب أن يرى أي بيانات متعلقة بالسيارات/الوقود/العهدة
  // النقدية/المصروفات (بيتي كاش) — لا في الرئيسية ولا في أي مكان آخر،
  // فبنقتصر له على كارت الأصول التقنية فقط
  if (!d.itOnly) {
    // 1 — السيارات
    cards.push(overviewCardHtml(
      icon("car"),
      "السيارات",
      d.vehiclesOk
        ? [
            { label: "الإجمالي", value: String(d.vehicles.length) },
            { label: "مخصصة", value: String(d.assignedCount) },
            { label: "تحت الصيانة", value: String(d.maintenanceCount) },
          ]
        : [{ label: "الحالة", value: "تعذر التحميل" }],
      "vehicles",
      "primary"
    ));

    // 2 — الوقود
    cards.push(overviewCardHtml(
      icon("fuel"),
      "الوقود — " + (d.fuelMonthLabel || "هذا الشهر"),
      d.fuelOk
        ? [
            { label: "اللترات", value: formatNumber(d.monthLiters, 1) },
            { label: "التكلفة", value: formatNumber(d.monthFuelCost, 2) + " ر.س" },
            { label: "المعاملات", value: String(d.fuelTxCount) },
          ]
        : [{ label: "الحالة", value: "تعذر التحميل" }],
      "fuel",
      "fuel"
    ));

    // 3 — العهدة النقدية
    cards.push(overviewCardHtml(
      icon("wallet"),
      "العهدة النقدية",
      d.fundOk
        ? [
            { label: "العهدة", value: d.fundCode },
            { label: "الرصيد", value: formatNumber(d.fundBalance, 2) + " ر.س" },
            { label: "نسبة الاستخدام", value: formatNumber(d.fundUsagePercent, 0) + "%" },
          ]
        : [{ label: "الحالة", value: "لا توجد عهدة نشطة" }],
      "petty-cash",
      "fund"
    ));

    // 4 — المصروفات
    cards.push(overviewCardHtml(
      icon("receipt"),
      "المصروفات — " + (d.expenseMonthLabel || "هذا الشهر"),
      d.expensesOk
        ? [
            { label: "الإجمالي", value: formatNumber(d.monthExpenseTotal, 2) + " ر.س" },
            { label: "المعاملات", value: String(d.expenseTxCount) },
            { label: "أعلى فئة", value: d.topCategoryEntry ? d.topCategoryEntry[0] : "—" },
          ]
        : [{ label: "الحالة", value: "تعذر التحميل" }],
      "expenses",
      "expense"
    ));
  }

  // 5 — أصول تقنية المعلومات
  var itTotal = d.itLaptopsCount + d.itEmailCount + d.itSimCount + d.itTabletsCount;
  cards.push(overviewCardHtml(
    icon("chartBar"),
    "الأصول التقنية",
    d.itAssetsOk
      ? [
          { label: "الإجمالي", value: String(itTotal) },
          { label: "حواسيب", value: String(d.itLaptopsCount) },
          { label: "بريد", value: String(d.itEmailCount) },
          { label: "شرائح", value: String(d.itSimCount) },
          { label: "أجهزة لوحية", value: String(d.itTabletsCount) },
        ]
      : [{ label: "الحالة", value: "تعذر التحميل" }],
    "it-assets",
    "assets"
  ));

  dashboardOverviewGrid.innerHTML = cards.join("");

  // ربط أزرار "عرض التفاصيل" بالتنقل
  dashboardOverviewGrid.querySelectorAll(".overview-card-action").forEach(function (btn) {
    btn.addEventListener("click", function () {
      navigateTo(btn.getAttribute("data-nav"));
    });
  });
}

// ============================================================================
// 9b. أصول تقنية المعلومات (IT Assets) — مرحلة 2: تبديل التبويبات فقط
// (نفس آلية تبويبات مركز التقارير بالظبط). كل تبويب هيتفعّل بمنطقه ببيانات
// حقيقية في مرحلة لاحقة — loadAssetTab حاليًا مجرد "مفتاح توجيه" فارغ.
// ============================================================================

// ---------------------------------------------------------------------------
// شريط ملخص ثابت فوق التبويبات — يعرض إجمالي كل نوع أصل (نشط فقط) بغض
// النظر عن التبويب المفتوح حاليًا. بيتحدّث كل ما أي تبويب يعمل تحميل
// (فتح الصفحة / تبديل تبويب / بعد أي إضافة أو تعديل أو استرداد)
// ---------------------------------------------------------------------------

const itAssetsSummaryContainer = document.getElementById("it-assets-summary");

async function loadItAssetsSummary() {
  const [laptopsRes, emailRes, simRes, tabletsRes, catalogRes] = await Promise.all([
    supabaseClient.from("it_laptop_assignments").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabaseClient.from("it_email_assignments").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabaseClient.from("it_sim_assignments").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabaseClient.from("it_tablet_assignments").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabaseClient.from("it_laptop_catalog").select("id", { count: "exact", head: true }).eq("status", "active"),
  ]);

  [laptopsRes, emailRes, simRes, tabletsRes, catalogRes].forEach((res, i) => {
    if (res.error) console.error("Error loading IT assets summary (" + i + "):", res.error);
  });

  itAssetsSummaryContainer.innerHTML =
    '<div class="summary-card"><span class="card-icon" aria-hidden="true">' +
    icon("laptop") +
    '</span><span class="summary-card-label">اللابتوبات</span><span class="summary-card-value">' +
    (laptopsRes.error ? "—" : laptopsRes.count || 0) +
    "</span></div>" +
    '<div class="summary-card"><span class="card-icon" aria-hidden="true">' +
    icon("mail") +
    '</span><span class="summary-card-label">البريد الإلكتروني</span><span class="summary-card-value">' +
    (emailRes.error ? "—" : emailRes.count || 0) +
    "</span></div>" +
    '<div class="summary-card"><span class="card-icon" aria-hidden="true">' +
    icon("phone") +
    '</span><span class="summary-card-label">أرقام الجوال</span><span class="summary-card-value">' +
    (simRes.error ? "—" : simRes.count || 0) +
    "</span></div>" +
    '<div class="summary-card"><span class="card-icon" aria-hidden="true">' +
    icon("tablet") +
    '</span><span class="summary-card-label">الأجهزة اللوحية</span><span class="summary-card-value">' +
    (tabletsRes.error ? "—" : tabletsRes.count || 0) +
    "</span></div>" +
    '<div class="summary-card"><span class="card-icon" aria-hidden="true">' +
    icon("archive") +
    '</span><span class="summary-card-label">كتالوج اللابتوبات</span><span class="summary-card-value">' +
    (catalogRes.error ? "—" : catalogRes.count || 0) +
    "</span></div>";
}

const assetTabsContainer = document.getElementById("it-assets-tabs");
const assetPanels = {
  laptops: document.getElementById("asset-panel-laptops"),
  email: document.getElementById("asset-panel-email"),
  sim: document.getElementById("asset-panel-sim"),
  tablets: document.getElementById("asset-panel-tablets"),
  "laptop-catalog": document.getElementById("asset-panel-laptop-catalog"),
};

let currentAssetTab = "laptops";

assetTabsContainer.querySelectorAll("[data-asset-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentAssetTab = btn.dataset.assetTab;
    assetTabsContainer.querySelectorAll("[data-asset-tab]").forEach((b) => {
      b.classList.toggle("active", b === btn);
    });
    Object.keys(assetPanels).forEach((key) => {
      assetPanels[key].hidden = key !== currentAssetTab;
    });
    loadAssetTab(currentAssetTab);
  });
});

// كل حالة هتتحوّل من "// TODO" لاستدعاء دالة تحميل حقيقية أول ما نبني
// تبويبها (بالترتيب: لابتوب ثم إيميل ثم سيم ثم تابلت ثم كتالوج اللابتوبات)
function loadAssetTab(tab) {
  if (tab === "laptops") {
    loadLaptopAssignments();
    return;
  }
  if (tab === "email") {
    loadEmailAssignments();
    return;
  }
  if (tab === "sim") {
    loadSimAssignments();
    return;
  }
  if (tab === "tablets") {
    loadTabletAssignments();
    return;
  }
  if (tab === "laptop-catalog") {
    loadLaptopCatalog();
    return;
  }
}

// ============================================================================
// 10. مركز التقارير (Reports Center) — Phase 5
// ============================================================================

const reportsTabsContainer = document.getElementById("reports-tabs");
const reportPanels = {
  vehicles: document.getElementById("report-panel-vehicles"),
  fuel: document.getElementById("report-panel-fuel"),
  "petty-cash": document.getElementById("report-panel-petty-cash"),
  expenses: document.getElementById("report-panel-expenses"),
  "it-assets": document.getElementById("report-panel-it-assets"),
};

let currentReportTab = "vehicles";
let reportVehiclesRows = [];
let reportFuelRows = [];
let reportPettyCashRows = [];
let reportExpensesRows = [];

reportsTabsContainer.querySelectorAll("[data-report-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentReportTab = btn.dataset.reportTab;
    reportsTabsContainer.querySelectorAll("[data-report-tab]").forEach((b) => {
      b.classList.toggle("active", b === btn);
    });
    Object.keys(reportPanels).forEach((key) => {
      reportPanels[key].hidden = key !== currentReportTab;
    });
    loadReportTab(currentReportTab);
  });
});

function loadReportTab(tab) {
  if (tab === "vehicles") loadVehiclesReport();
  else if (tab === "fuel") loadFuelReport();
  else if (tab === "petty-cash") loadPettyCashReport();
  else if (tab === "expenses") loadExpensesReport();
  else if (tab === "it-assets") loadItAssetsReportSubtab(currentItAssetsReportSubtab);
}

function setReportState(el, message) {
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

// ---------------------------------------------------------------------------
// 10.1 تقرير السيارات
// ---------------------------------------------------------------------------

const reportVehiclesDateFrom = document.getElementById("report-vehicles-date-from");
const reportVehiclesDateTo = document.getElementById("report-vehicles-date-to");
const reportVehiclesSummary = document.getElementById("report-vehicles-summary");
const reportVehiclesTableBody = document.getElementById("report-vehicles-table-body");
const reportVehiclesState = document.getElementById("report-vehicles-state");
const reportVehiclesExportButton = document.getElementById("report-vehicles-export");

async function loadVehiclesReport() {
  renderTableSkeleton(reportVehiclesTableBody, 5, 4);
  setReportState(reportVehiclesState, null);

  let query = supabaseClient
    .from("vehicles")
    .select("id, license_plate, status, created_at")
    .order("created_at", { ascending: false });

  if (reportVehiclesDateFrom.value) query = query.gte("created_at", reportVehiclesDateFrom.value + "T00:00:00");
  if (reportVehiclesDateTo.value) query = query.lte("created_at", reportVehiclesDateTo.value + "T23:59:59");

  const { data, error } = await query;

  if (error) {
    console.error("Error loading vehicles report:", error);
    setReportState(reportVehiclesState, "حدث خطأ أثناء تحميل التقرير.");
    reportVehiclesSummary.innerHTML = "";
    return;
  }

  reportVehiclesRows = data || [];

  const counts = {
    active: 0, available: 0, assigned: 0, under_maintenance: 0, out_of_service: 0, archived: 0,
  };
  reportVehiclesRows.forEach((v) => {
    counts[v.status] = (counts[v.status] || 0) + 1;
  });

  reportVehiclesSummary.innerHTML =
    statCardHtml(icon("car"), "إجمالي السيارات", String(reportVehiclesRows.length), "") +
    statCardHtml(icon("pin"), "مخصصة", String(counts.assigned), "") +
    statCardHtml(icon("checkCircle"), "متاحة", String(counts.available), "") +
    statCardHtml(icon("wrench"), "تحت الصيانة", String(counts.under_maintenance), "") +
    statCardHtml(icon("noEntry"), "خارج الخدمة", String(counts.out_of_service), "") +
    statCardHtml(icon("archive"), "مؤرشفة", String(counts.archived), "");

  if (reportVehiclesRows.length === 0) {
    setReportState(reportVehiclesState, "لا توجد سيارات مطابقة للفلتر المحدد.");
    return;
  }

  setReportState(reportVehiclesState, null);
  reportVehiclesTableBody.innerHTML = reportVehiclesRows
    .map((v) => {
      const statusLabel = VEHICLE_STATUS_LABELS[v.status] || v.status;
      return (
        "<tr><td>" + escapeHtml(v.license_plate) + "</td>" +
        '<td><span class="status-badge status-' + v.status + '">' + escapeHtml(statusLabel) + "</span></td>" +
        "<td>" + formatDateTime(v.created_at) + "</td></tr>"
      );
    })
    .join("");
}

reportVehiclesDateFrom.addEventListener("change", loadVehiclesReport);
reportVehiclesDateTo.addEventListener("change", loadVehiclesReport);

reportVehiclesExportButton.addEventListener("click", () => {
  exportRowsToCSV(
    "vehicles-report.csv",
    ["رقم اللوحة", "الحالة", "تاريخ الإضافة"],
    reportVehiclesRows.map((v) => [
      v.license_plate,
      VEHICLE_STATUS_LABELS[v.status] || v.status,
      formatDateTime(v.created_at),
    ])
  );
});

// ---------------------------------------------------------------------------
// 10.2 تقرير الوقود
// ---------------------------------------------------------------------------

const reportFuelDateFrom = document.getElementById("report-fuel-date-from");
const reportFuelDateTo = document.getElementById("report-fuel-date-to");
const reportFuelSummary = document.getElementById("report-fuel-summary");
const reportFuelTableBody = document.getElementById("report-fuel-table-body");
const reportFuelState = document.getElementById("report-fuel-state");
const reportFuelExportButton = document.getElementById("report-fuel-export");
const reportFuelTrendLitersChart = document.getElementById("report-fuel-trend-liters-chart");
const reportFuelTrendLitersState = document.getElementById("report-fuel-trend-liters-state");
const reportFuelTrendCostChart = document.getElementById("report-fuel-trend-cost-chart");
const reportFuelTrendCostState = document.getElementById("report-fuel-trend-cost-state");
const reportFuelTopVehiclesChart = document.getElementById("report-fuel-top-vehicles-chart");
const reportFuelTopVehiclesState = document.getElementById("report-fuel-top-vehicles-state");
const reportFuelTopUsersChart = document.getElementById("report-fuel-top-users-chart");
const reportFuelTopUsersState = document.getElementById("report-fuel-top-users-state");
const reportFuelByUserTableBody = document.getElementById("report-fuel-by-user-table-body");
const reportFuelByUserState = document.getElementById("report-fuel-by-user-state");

async function loadFuelReport() {
  renderTableSkeleton(reportFuelTableBody, 5, 5);
  setReportState(reportFuelState, null);

  const buildTxQuery = () => {
    let q = supabaseClient
      .from("fuel_transactions")
      .select("liters, amount, transaction_date, vehicle:vehicles ( actual_user_name )")
      .eq("status", "active");
    if (reportFuelDateFrom.value) q = q.gte("transaction_date", reportFuelDateFrom.value);
    if (reportFuelDateTo.value) q = q.lte("transaction_date", reportFuelDateTo.value);
    return q;
  };

  const { data: txRows, error: txError } = await fetchAllRowsPaged(buildTxQuery);

  if (txError) {
    console.error("Error loading fuel report summary:", txError);
    reportFuelSummary.innerHTML = "";
    setReportState(reportFuelTrendLitersState, "تعذر تحميل بيانات اتجاه الاستهلاك.");
    setReportState(reportFuelTrendCostState, "تعذر تحميل بيانات اتجاه التكلفة.");
    setReportState(reportFuelTopUsersState, "تعذر تحميل بيانات الاستهلاك حسب المستخدم الفعلي.");
    setReportState(reportFuelByUserState, "تعذر تحميل بيانات الاستهلاك حسب المستخدم الفعلي.");
  } else {
    const rows = txRows || [];
    const totalLiters = rows.reduce((sum, r) => sum + Number(r.liters || 0), 0);
    const totalCost = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    reportFuelSummary.innerHTML =
      statCardHtml(icon("fuel"), "إجمالي اللترات (للفترة)", formatNumber(totalLiters, 2), "") +
      statCardHtml(icon("wallet"), "إجمالي التكلفة (للفترة)", formatNumber(totalCost, 2) + " ر.س", "") +
      statCardHtml(icon("hash"), "عدد المعاملات (للفترة)", String(rows.length), "");

    const monthlyLiters = groupSumByMonth(rows, "transaction_date", "liters");
    const monthlyCost = groupSumByMonth(rows, "transaction_date", "amount");
    if (monthlyLiters.values.length < 2) {
      setReportState(reportFuelTrendLitersState, "البيانات غير كافية لعرض اتجاه شهري (يلزم شهرين على الأقل).");
      setReportState(reportFuelTrendCostState, "البيانات غير كافية لعرض اتجاه شهري (يلزم شهرين على الأقل).");
    } else {
      setReportState(reportFuelTrendLitersState, null);
      setReportState(reportFuelTrendCostState, null);
      drawLineChart(reportFuelTrendLitersChart, monthlyLiters.values, monthlyLiters.labels, {
        showDataLabels: true,
        labelDecimals: 0,
        labelSuffix: "",
        color: cssVar("--color-turquoise"),
      });
      drawLineChart(reportFuelTrendCostChart, monthlyCost.values, monthlyCost.labels, {
        showDataLabels: true,
        labelDecimals: 0,
        labelSuffix: "",
        color: cssVar("--color-rose"),
      });
    }

    // الاستهلاك حسب "المستخدم الفعلي" — مبني من نفس صفوف الفترة المحددة
    // أعلاه، من غير أي استعلام إضافي. السيارات من غير مستخدم فعلي بتتجمع
    // تحت "بدون مستخدم فعلي" بدل ما تتجاهل بصمت
    const userTotals = {};
    rows.forEach((r) => {
      const name = r.vehicle && r.vehicle.actual_user_name ? r.vehicle.actual_user_name : "بدون مستخدم فعلي";
      if (!userTotals[name]) userTotals[name] = { liters: 0, cost: 0, count: 0 };
      userTotals[name].liters += Number(r.liters || 0);
      userTotals[name].cost += Number(r.amount || 0);
      userTotals[name].count += 1;
    });
    const userRows = Object.entries(userTotals)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.liters - a.liters);

    if (userRows.length === 0) {
      setReportState(reportFuelTopUsersState, "لا توجد بيانات وقود مسجّلة للفترة المحددة.");
      setReportState(reportFuelByUserState, "لا توجد بيانات وقود مسجّلة للفترة المحددة.");
      reportFuelByUserTableBody.innerHTML = "";
    } else {
      const topUsers = userRows.slice(0, 5);
      setReportState(reportFuelTopUsersState, null);
      drawBarChart(
        reportFuelTopUsersChart,
        topUsers.map((u) => u.liters),
        topUsers.map((u) => u.name),
        { horizontal: true, formatValue: (v) => formatNumber(v, 1) + " لتر" }
      );

      setReportState(reportFuelByUserState, null);
      reportFuelByUserTableBody.innerHTML = userRows
        .map(
          (u) =>
            "<tr><td>" + escapeHtml(u.name) + "</td>" +
            "<td>" + formatNumber(u.liters, 2) + "</td>" +
            "<td>" + formatNumber(u.cost, 2) + " ر.س</td>" +
            "<td>" + u.count + "</td></tr>"
        )
        .join("");
    }
  }

  const { data: summaryRows, error: summaryError } = await supabaseClient
    .from("vehicle_fuel_summary")
    .select(
      "vehicle_id, license_plate, actual_user_name, total_liters, total_cost, transaction_count, average_cost_per_transaction"
    )
    .order("total_cost", { ascending: false });

  if (summaryError) {
    console.error("Error loading vehicle_fuel_summary:", summaryError);
    setReportState(reportFuelState, "حدث خطأ أثناء تحميل جدول الوقود.");
    setReportState(reportFuelTopVehiclesState, "تعذر تحميل بيانات أعلى السيارات استهلاكًا.");
    return;
  }

  reportFuelRows = (summaryRows || []).filter((r) => r.transaction_count > 0);

  if (reportFuelRows.length === 0) {
    setReportState(reportFuelState, "لا توجد بيانات وقود مسجّلة بعد.");
    setReportState(reportFuelTopVehiclesState, "لا توجد بيانات وقود مسجّلة بعد.");
    return;
  }

  const topVehicles = [...reportFuelRows].sort((a, b) => b.total_liters - a.total_liters).slice(0, 5);
  setReportState(reportFuelTopVehiclesState, null);
  drawBarChart(
    reportFuelTopVehiclesChart,
    topVehicles.map((v) => Number(v.total_liters)),
    topVehicles.map((v) => v.license_plate),
    { horizontal: true, formatValue: (v) => formatNumber(v, 1) + " لتر" }
  );

  setReportState(reportFuelState, null);
  reportFuelTableBody.innerHTML = reportFuelRows
    .map(
      (r) =>
        "<tr><td>" + escapeHtml(r.license_plate) + "</td>" +
        "<td>" + escapeHtml(r.actual_user_name || "—") + "</td>" +
        "<td>" + formatNumber(r.total_liters, 2) + "</td>" +
        "<td>" + formatNumber(r.total_cost, 2) + " ر.س</td>" +
        "<td>" + (r.transaction_count || 0) + "</td>" +
        "<td>" + formatNumber(r.average_cost_per_transaction, 2) + " ر.س</td></tr>"
    )
    .join("");
}

reportFuelDateFrom.addEventListener("change", loadFuelReport);
reportFuelDateTo.addEventListener("change", loadFuelReport);

reportFuelExportButton.addEventListener("click", () => {
  exportRowsToCSV(
    "fuel-report.csv",
    ["رقم اللوحة", "المستخدم الفعلي", "إجمالي اللترات", "إجمالي التكلفة", "عدد المعاملات", "متوسط التكلفة"],
    reportFuelRows.map((r) => [
      r.license_plate,
      r.actual_user_name || "—",
      formatNumber(r.total_liters, 2),
      formatNumber(r.total_cost, 2),
      r.transaction_count || 0,
      formatNumber(r.average_cost_per_transaction, 2),
    ])
  );
});

// ---------------------------------------------------------------------------
// 10.3 تقرير البيتي كاش
// ---------------------------------------------------------------------------

const reportPettyCashDateFrom = document.getElementById("report-petty-cash-date-from");
const reportPettyCashDateTo = document.getElementById("report-petty-cash-date-to");
const reportPettyCashSummary = document.getElementById("report-petty-cash-summary");
const reportPettyCashTableBody = document.getElementById("report-petty-cash-table-body");
const reportPettyCashState = document.getElementById("report-petty-cash-state");
const reportPettyCashExportButton = document.getElementById("report-petty-cash-export");
const reportPettyCashChartsContainer = document.getElementById("report-petty-cash-charts");
const reportPettyCashChartsState = document.getElementById("report-petty-cash-charts-state");

// رسم دائري صغير لكل صندوق يوضح نسبة المصروف من الرصيد الافتتاحي — بيانات
// حقيقية بالكامل من petty_cash_fund_balances، من غير أي نسب وهمية
function renderPettyCashCharts(rows) {
  if (!rows.length) {
    reportPettyCashChartsContainer.innerHTML = "";
    setReportState(reportPettyCashChartsState, "لا توجد عهد لعرض نسبة صرفها.");
    return;
  }

  setReportState(reportPettyCashChartsState, null);
  reportPettyCashChartsContainer.innerHTML = rows
    .map((f) => {
      const opening = Math.max(Number(f.opening_amount) || 0, 0);
      const spent = Math.max(Number(f.total_expenses) || 0, 0);
      const pct = opening ? (spent / opening) * 100 : 0;
      return (
        '<div class="chart-card">' +
        '<h3 class="chart-card-title">' + escapeHtml(f.fund_code) + "</h3>" +
        '<div class="chart-canvas-wrapper">' +
        '<canvas id="pc-donut-' + f.id + '"></canvas>' +
        '<div class="chart-donut-center-label">' +
        '<span class="chart-donut-center-value">' + formatNumber(pct, 0) + "%</span>" +
        '<span class="chart-donut-center-caption">مصروف</span>' +
        "</div></div></div>"
      );
    })
    .join("");

  rows.forEach((f) => {
    const canvas = document.getElementById("pc-donut-" + f.id);
    if (!canvas) return;
    const opening = Math.max(Number(f.opening_amount) || 0, 0);
    const spent = Math.max(Number(f.total_expenses) || 0, 0);
    const remaining = Math.max(opening - spent, 0);
    drawDonutChart(
      canvas,
      [
        { label: "مصروف", value: spent, color: cssVar("--color-danger-text") },
        { label: "متبقٍ", value: remaining, color: cssVar("--color-success-text") },
      ],
      { formatValue: (v) => formatNumber(v, 2) + " ر.س", thickness: 0.68 }
    );
  });
}

async function loadPettyCashReport() {
  renderTableSkeleton(reportPettyCashTableBody, 5, 6);
  setReportState(reportPettyCashState, null);

  let query = supabaseClient
    .from("petty_cash_funds")
    .select("id, fund_code, opening_amount, status, funded_at")
    .order("funded_at", { ascending: false });

  if (reportPettyCashDateFrom.value) query = query.gte("funded_at", reportPettyCashDateFrom.value);
  if (reportPettyCashDateTo.value) query = query.lte("funded_at", reportPettyCashDateTo.value);

  const { data: funds, error } = await query;

  if (error) {
    console.error("Error loading petty cash report:", error);
    setReportState(reportPettyCashState, "حدث خطأ أثناء تحميل التقرير.");
    reportPettyCashSummary.innerHTML = "";
    return;
  }

  if (!funds || funds.length === 0) {
    reportPettyCashSummary.innerHTML = "";
    reportPettyCashRows = [];
    setReportState(reportPettyCashState, "لا توجد عهد مطابقة للفلتر المحدد.");
    renderPettyCashCharts([]);
    return;
  }

  const fundIds = funds.map((f) => f.id);
  const { data: balances, error: balancesError } = await supabaseClient
    .from("petty_cash_fund_balances")
    .select("fund_id, total_expenses, current_balance")
    .in("fund_id", fundIds);

  const balanceMap = {};
  if (balancesError) {
    console.error("Error loading fund balances for report:", balancesError);
  } else {
    (balances || []).forEach((b) => {
      balanceMap[b.fund_id] = b;
    });
  }

  reportPettyCashRows = funds.map((f) => ({
    ...f,
    total_expenses: balanceMap[f.id] ? balanceMap[f.id].total_expenses : 0,
    current_balance: balanceMap[f.id] ? balanceMap[f.id].current_balance : f.opening_amount,
  }));

  renderPettyCashCharts(reportPettyCashRows);

  const totalFunded = reportPettyCashRows.reduce((sum, f) => sum + Number(f.opening_amount || 0), 0);
  const totalSpent = reportPettyCashRows.reduce((sum, f) => sum + Number(f.total_expenses || 0), 0);
  const totalBalance = reportPettyCashRows.reduce((sum, f) => sum + Number(f.current_balance || 0), 0);

  reportPettyCashSummary.innerHTML =
    statCardHtml(icon("cash"), "إجمالي التمويل", formatNumber(totalFunded, 2) + " ر.س", "") +
    statCardHtml(icon("receipt"), "إجمالي المصروف", formatNumber(totalSpent, 2) + " ر.س", "") +
    statCardHtml(icon("wallet"), "إجمالي الرصيد المتبقي", formatNumber(totalBalance, 2) + " ر.س", "");

  setReportState(reportPettyCashState, null);
  reportPettyCashTableBody.innerHTML = reportPettyCashRows
    .map((f) => {
      const statusLabel = FUND_STATUS_LABELS[f.status] || f.status;
      const statusClass = FUND_STATUS_CLASSES[f.status] || "status-active";
      return (
        "<tr><td>" + escapeHtml(f.fund_code) + "</td>" +
        "<td>" + formatNumber(f.opening_amount, 2) + " ر.س</td>" +
        "<td>" + formatNumber(f.total_expenses, 2) + " ر.س</td>" +
        "<td>" + formatNumber(f.current_balance, 2) + " ر.س</td>" +
        '<td><span class="status-badge ' + statusClass + '">' + statusLabel + "</span></td></tr>"
      );
    })
    .join("");
}

reportPettyCashDateFrom.addEventListener("change", loadPettyCashReport);
reportPettyCashDateTo.addEventListener("change", loadPettyCashReport);

reportPettyCashExportButton.addEventListener("click", () => {
  exportRowsToCSV(
    "petty-cash-report.csv",
    ["كود العهدة", "المبلغ الافتتاحي", "إجمالي المصروف", "الرصيد الحالي", "الحالة"],
    reportPettyCashRows.map((f) => [
      f.fund_code,
      formatNumber(f.opening_amount, 2),
      formatNumber(f.total_expenses, 2),
      formatNumber(f.current_balance, 2),
      FUND_STATUS_LABELS[f.status] || f.status,
    ])
  );
});

// ---------------------------------------------------------------------------
// 10.4 تقرير المصروفات (توزيع حسب الفئة)
// ---------------------------------------------------------------------------

const reportExpensesDateFrom = document.getElementById("report-expenses-date-from");
const reportExpensesDateTo = document.getElementById("report-expenses-date-to");
const reportExpensesSummary = document.getElementById("report-expenses-summary");
const reportExpensesTableBody = document.getElementById("report-expenses-table-body");
const reportExpensesState = document.getElementById("report-expenses-state");
const reportExpensesExportButton = document.getElementById("report-expenses-export");
const reportExpensesCategoryChart = document.getElementById("report-expenses-category-chart");
const reportExpensesCategoryLegend = document.getElementById("report-expenses-category-legend");
const reportExpensesCategoryState = document.getElementById("report-expenses-category-state");
const reportExpensesTrendChart = document.getElementById("report-expenses-trend-chart");
const reportExpensesTrendState = document.getElementById("report-expenses-trend-state");

async function loadExpensesReport() {
  renderTableSkeleton(reportExpensesTableBody, 5, 4);
  setReportState(reportExpensesState, null);

  const buildQuery = () => {
    let q = supabaseClient
      .from("expenses")
      .select("amount, expense_date, category:expense_categories ( name, name_ar )")
      .eq("status", "active");
    if (reportExpensesDateFrom.value) q = q.gte("expense_date", reportExpensesDateFrom.value);
    if (reportExpensesDateTo.value) q = q.lte("expense_date", reportExpensesDateTo.value);
    return q;
  };

  const { data, error } = await fetchAllRowsPaged(buildQuery);

  if (error) {
    console.error("Error loading expenses report:", error);
    setReportState(reportExpensesState, "حدث خطأ أثناء تحميل التقرير.");
    reportExpensesSummary.innerHTML = "";
    setReportState(reportExpensesCategoryState, "تعذر تحميل بيانات التوزيع.");
    setReportState(reportExpensesTrendState, "تعذر تحميل بيانات الاتجاه.");
    return;
  }

  const rows = data || [];

  if (rows.length === 0) {
    reportExpensesSummary.innerHTML = "";
    reportExpensesRows = [];
    setReportState(reportExpensesState, "لا توجد مصروفات مطابقة للفلتر المحدد.");
    setReportState(reportExpensesCategoryState, "لا توجد مصروفات لعرض توزيعها.");
    setReportState(reportExpensesTrendState, "لا توجد مصروفات لعرض اتجاهها.");
    return;
  }

  const categoryTotals = {};
  rows.forEach((r) => {
    const name = r.category ? r.category.name_ar || r.category.name : "غير مصنّف";
    if (!categoryTotals[name]) categoryTotals[name] = { total: 0, count: 0 };
    categoryTotals[name].total += Number(r.amount || 0);
    categoryTotals[name].count += 1;
  });

  const totalSpending = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1].total - a[1].total);
  reportExpensesRows = sortedCategories.map(([name, stats]) => ({
    name,
    total: stats.total,
    count: stats.count,
    percentage: totalSpending ? (stats.total / totalSpending) * 100 : 0,
  }));

  setReportState(reportExpensesCategoryState, null);
  const expensesChartPalette = getChartPalette();
  drawDonutChart(
    reportExpensesCategoryChart,
    reportExpensesRows.map((c, i) => ({ label: c.name, value: c.total, color: expensesChartPalette[i % expensesChartPalette.length] })),
    { formatValue: (v) => formatNumber(v, 2) + " ر.س" }
  );
  renderChartLegend(reportExpensesCategoryLegend, reportExpensesRows.map((c, i) => ({
    label: c.name,
    color: expensesChartPalette[i % expensesChartPalette.length],
  })));

  const monthlyExpenses = groupSumByMonth(rows, "expense_date", "amount");
  if (monthlyExpenses.values.length < 2) {
    setReportState(reportExpensesTrendState, "البيانات غير كافية لعرض اتجاه شهري (يلزم شهرين على الأقل).");
  } else {
    setReportState(reportExpensesTrendState, null);
    drawBarChart(reportExpensesTrendChart, monthlyExpenses.values, monthlyExpenses.labels, {
      formatValue: (v) => formatNumber(v, 2) + " ر.س",
    });
  }

  reportExpensesSummary.innerHTML =
    statCardHtml(icon("receipt"), "إجمالي الإنفاق", formatNumber(totalSpending, 2) + " ر.س", "") +
    statCardHtml(icon("hash"), "عدد المصروفات", String(rows.length), "") +
    statCardHtml(icon("tag"), "أعلى فئة إنفاقًا", reportExpensesRows[0] ? reportExpensesRows[0].name : "—", "");

  setReportState(reportExpensesState, null);
  reportExpensesTableBody.innerHTML = reportExpensesRows
    .map(
      (c) =>
        "<tr><td>" + escapeHtml(c.name) + "</td>" +
        "<td>" + formatNumber(c.total, 2) + " ر.س</td>" +
        "<td>" + c.count + "</td>" +
        "<td>" + formatNumber(c.percentage, 1) + "%</td></tr>"
    )
    .join("");
}

reportExpensesDateFrom.addEventListener("change", loadExpensesReport);
reportExpensesDateTo.addEventListener("change", loadExpensesReport);

reportExpensesExportButton.addEventListener("click", () => {
  exportRowsToCSV(
    "expenses-report.csv",
    ["الفئة", "إجمالي المبلغ", "عدد المصروفات", "النسبة %"],
    reportExpensesRows.map((c) => [c.name, formatNumber(c.total, 2), c.count, formatNumber(c.percentage, 1)])
  );
});

// ---------------------------------------------------------------------------
// 10.4a تصدير "تقرير العهدة" بصيغة Excel — نفس قالب MEEM-FIN-F003 المستخدم
// فعليًا لرفع تقارير عهدة النثرية للشركة الأم (SR. No / Date / Supplier
// Name / Particulars / Invoice No. / Other Expenses / GRAND TOTAL)، مع شيت
// إضافي "ملخص الأصناف" يجمع المصروفات حسب الفئة الفعلية المُختارة وقت
// الإدخال (بمعادلات SUMIF/COUNTIF مربوطة مباشرة بشيت التفاصيل، وليست أرقامًا
// جاهزة) — بحيث الملف الناتج قابل لإعادة الحساب تلقائيًا لو تغيّرت بياناته
// ---------------------------------------------------------------------------

const reportExpensesMeemExportButton = document.getElementById("report-expenses-meem-export");
const reportExpensesRecipientsExportButton = document.getElementById("report-expenses-recipients-export");

async function exportMeemPettyCashExcel() {
  reportExpensesMeemExportButton.disabled = true;
  const originalLabel = reportExpensesMeemExportButton.textContent;
  reportExpensesMeemExportButton.textContent = "جارٍ التجهيز...";

  try {
    const buildQuery = () => {
      let q = supabaseClient
        .from("expenses")
        .select(
          "expense_date, amount, description, supplier_name, invoice_number, " +
            "category:expense_categories ( name, name_ar ), fund:petty_cash_funds ( fund_code )"
        )
        .eq("status", "active")
        .order("expense_date", { ascending: true });
      if (reportExpensesDateFrom.value) q = q.gte("expense_date", reportExpensesDateFrom.value);
      if (reportExpensesDateTo.value) q = q.lte("expense_date", reportExpensesDateTo.value);
      return q;
    };

    const { data, error } = await fetchAllRowsPaged(buildQuery);

    if (error) {
      console.error("Error exporting MEEM petty cash report:", error);
      alert("حدث خطأ أثناء تجهيز التقرير. حاول مرة أخرى.");
      return;
    }

    const rows = data || [];
    if (!rows.length) {
      alert("لا توجد مصروفات نشطة مطابقة للفترة المحددة لتصديرها.");
      return;
    }

    const workbook = new ExcelJS.Workbook();

    // ننشئ شيت "ملخص الأصناف" أولًا حتى يظهر كأول تبويب عند فتح الملف —
    // ترتيب استدعاء addWorksheet هو ما يحدد ترتيب التبويبات في إكسل، لذا
    // يُنشأ هنا فارغًا ويُملأ بالبيانات لاحقًا بعد شيت التفاصيل (لأن معادلات
    // الملخص تحتاج معرفة عدد صفوف التفاصيل أولًا)
    const summary = workbook.addWorksheet("ملخص الأصناف", { views: [{ rightToLeft: true }] });

    // ---- شيت التفاصيل (نفس قالب MEEM-FIN-F003 حرفيًا) ----
    const detail = workbook.addWorksheet("MEEM-FIN-F003", { views: [{ rightToLeft: true }] });
    detail.mergeCells("A1:A3");
    detail.mergeCells("B1:B3");
    detail.mergeCells("C1:C3");
    detail.mergeCells("D1:D3");
    detail.mergeCells("E1:E3");
    detail.mergeCells("F1:F3");
    detail.mergeCells("G1:G3");
    detail.mergeCells("H1:H3");

    const headerRow = detail.getRow(1);
    const headerValues = ["SR. No.", "Date", "Supplier Name ", "Particulars", "Invoice No.", "Other Expenses", "GRAND TOTAL", "الفئة"];
    headerValues.forEach((text, idx) => {
      const cell = detail.getCell(1, idx + 1);
      cell.value = text;
      cell.font = { name: "Calibri", size: 9, bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "medium" }, right: { style: "medium" } };
    });

    detail.columns = [
      { width: 6 },
      { width: 13 },
      { width: 42 },
      { width: 46 },
      { width: 24 },
      { width: 15 },
      { width: 13 },
      { width: 34 },
    ];

    let r = 4;
    rows.forEach((exp, idx) => {
      const categoryName = exp.category ? exp.category.name_ar || exp.category.name : "غير مصنّف";
      detail.getCell(r, 1).value = idx + 1;
      detail.getCell(r, 2).value = exp.expense_date ? new Date(exp.expense_date) : null;
      detail.getCell(r, 2).numFmt = "yyyy-mm-dd";
      detail.getCell(r, 3).value = exp.supplier_name || "";
      detail.getCell(r, 4).value = exp.description || "";
      detail.getCell(r, 5).value = exp.invoice_number || "";
      detail.getCell(r, 6).value = Number(exp.amount || 0);
      detail.getCell(r, 6).numFmt = "#,##0.00";
      detail.getCell(r, 7).value = { formula: "SUM(F" + r + ":F" + r + ")" };
      detail.getCell(r, 7).numFmt = "#,##0.00";
      detail.getCell(r, 8).value = categoryName;

      for (let col = 1; col <= 8; col++) {
        const cell = detail.getCell(r, col);
        cell.font = { name: "Calibri", size: 11 };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin", color: { argb: "FFB7B7B7" } },
          bottom: { style: "thin", color: { argb: "FFB7B7B7" } },
          left: { style: "thin", color: { argb: "FFB7B7B7" } },
          right: { style: "thin", color: { argb: "FFB7B7B7" } },
        };
      }
      r += 1;
    });

    const totalRow = r;
    const firstDataRow = 4;
    const lastDataRow = totalRow - 1;
    detail.getCell(totalRow, 6).value = { formula: "SUM(F" + firstDataRow + ":F" + lastDataRow + ")" };
    detail.getCell(totalRow, 6).numFmt = "#,##0.00";
    detail.getCell(totalRow, 7).value = { formula: "SUM(F" + totalRow + ":F" + totalRow + ")" };
    detail.getCell(totalRow, 7).numFmt = "#,##0.00";
    for (let col = 1; col <= 8; col++) {
      const cell = detail.getCell(totalRow, col);
      cell.font = { name: "Calibri", size: 13, bold: true };
    }

    // ---- ملء بيانات شيت ملخص الأصناف (أُنشئ فارغًا أعلاه كأول تبويب) ----
    summary.mergeCells("A1:D1");
    const titleCell = summary.getCell("A1");
    titleCell.value = "ملخص المصروفات حسب الصنف — عهدة MEEM (نموذج MEEM-FIN-F003)";
    titleCell.font = { name: "Calibri", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    summary.getRow(1).height = 28;

    summary.mergeCells("A2:D2");
    const subCell = summary.getCell("A2");
    const fromLabel = reportExpensesDateFrom.value || "بداية البيانات";
    const toLabel = reportExpensesDateTo.value || "اليوم";
    subCell.value = "الفترة المشمولة: " + fromLabel + " إلى " + toLabel;
    subCell.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF595959" } };
    subCell.alignment = { horizontal: "center", vertical: "middle" };

    const headers = ["الصنف الرئيسي", "عدد العمليات", "الإجمالي (ر.س)", "النسبة من الإجمالي"];
    headers.forEach((text, idx) => {
      const cell = summary.getCell(4, idx + 1);
      cell.value = text;
      cell.font = { name: "Calibri", size: 11, bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E2F3" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "medium" }, right: { style: "medium" } };
    });
    summary.getRow(4).height = 22;

    // ترتيب الفئات تنازليًا حسب الإجمالي الفعلي (للعرض فقط؛ القيم بالجدول formulas حية)
    const catTotalsForSort = {};
    rows.forEach((exp) => {
      const name = exp.category ? exp.category.name_ar || exp.category.name : "غير مصنّف";
      catTotalsForSort[name] = (catTotalsForSort[name] || 0) + Number(exp.amount || 0);
    });
    const orderedCats = Object.keys(catTotalsForSort).sort((a, b) => catTotalsForSort[b] - catTotalsForSort[a]);

    const startRow = 5;
    const detailCatRange = "'MEEM-FIN-F003'!$H$" + firstDataRow + ":$H$" + lastDataRow;
    const detailAmtRange = "'MEEM-FIN-F003'!$F$" + firstDataRow + ":$F$" + lastDataRow;
    const grandRow = startRow + orderedCats.length;

    orderedCats.forEach((cat, idx) => {
      const row = startRow + idx;
      const nameCell = summary.getCell(row, 1);
      nameCell.value = cat;
      nameCell.alignment = { horizontal: "right", vertical: "middle" };

      const countCell = summary.getCell(row, 2);
      countCell.value = { formula: "COUNTIF(" + detailCatRange + ",A" + row + ")" };
      countCell.alignment = { horizontal: "center", vertical: "middle" };

      const totalCell = summary.getCell(row, 3);
      totalCell.value = { formula: "SUMIF(" + detailCatRange + ",A" + row + "," + detailAmtRange + ")" };
      totalCell.numFmt = "#,##0.00";
      totalCell.alignment = { horizontal: "center", vertical: "middle" };

      const pctCell = summary.getCell(row, 4);
      pctCell.value = { formula: "C" + row + "/$C$" + grandRow };
      pctCell.numFmt = "0.0%";
      pctCell.alignment = { horizontal: "center", vertical: "middle" };

      for (let col = 1; col <= 4; col++) {
        summary.getCell(row, col).font = { name: "Calibri", size: 11 };
        summary.getCell(row, col).border = {
          top: { style: "thin", color: { argb: "FFB7B7B7" } },
          bottom: { style: "thin", color: { argb: "FFB7B7B7" } },
          left: { style: "thin", color: { argb: "FFB7B7B7" } },
          right: { style: "thin", color: { argb: "FFB7B7B7" } },
        };
      }
    });

    const grandLabelCell = summary.getCell(grandRow, 1);
    grandLabelCell.value = "الإجمالي الكلي";
    grandLabelCell.alignment = { horizontal: "right", vertical: "middle" };
    const grandCountCell = summary.getCell(grandRow, 2);
    grandCountCell.value = { formula: "SUM(B" + startRow + ":B" + (grandRow - 1) + ")" };
    const grandTotalCell = summary.getCell(grandRow, 3);
    grandTotalCell.value = { formula: "SUM(C" + startRow + ":C" + (grandRow - 1) + ")" };
    grandTotalCell.numFmt = "#,##0.00";
    const grandPctCell = summary.getCell(grandRow, 4);
    grandPctCell.value = { formula: "SUM(D" + startRow + ":D" + (grandRow - 1) + ")" };
    grandPctCell.numFmt = "0.0%";
    for (let col = 1; col <= 4; col++) {
      const cell = summary.getCell(grandRow, col);
      cell.font = { name: "Calibri", size: 11, bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
      cell.border = { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "medium" }, right: { style: "medium" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    }
    grandLabelCell.alignment = { horizontal: "right", vertical: "middle" }; // يلغي المحاذاة الوسطى المطبّقة أعلاه لعمود التسمية تحديدًا

    const checkRow = grandRow + 2;
    summary.mergeCells("A" + checkRow + ":B" + checkRow);
    const checkLabel = summary.getCell(checkRow, 1);
    checkLabel.value = "إجمالي شيت التفاصيل (للتحقق):";
    checkLabel.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF595959" } };
    checkLabel.alignment = { horizontal: "right", vertical: "middle" };
    const checkVal = summary.getCell(checkRow, 3);
    checkVal.value = { formula: "'MEEM-FIN-F003'!G" + totalRow };
    checkVal.numFmt = "#,##0.00";
    checkVal.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF595959" } };
    checkVal.alignment = { horizontal: "center", vertical: "middle" };

    const noteRow = checkRow + 2;
    summary.mergeCells("A" + noteRow + ":D" + noteRow);
    const noteCell = summary.getCell(noteRow, 1);
    noteCell.value =
      "ملاحظة: التصنيف مبني على الفئة الفعلية المُختارة عند إدخال كل مصروف (عمود \"الفئة\" في شيت " +
      "التفاصيل MEEM-FIN-F003، العمود H)، وجميع الأرقام أعلاه محسوبة بمعادلات SUMIF/COUNTIF مرتبطة مباشرة بشيت التفاصيل.";
    noteCell.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF808080" } };
    noteCell.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
    summary.getRow(noteRow).height = 30;

    summary.columns = [{ width: 42 }, { width: 16 }, { width: 18 }, { width: 20 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = "MEEM_Petty_Cash_" + today + ".xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("تم إنشاء تقرير العهدة وتنزيله بنجاح.", "success");
    URL.revokeObjectURL(url);
  } catch (unexpectedError) {
    console.error("Unexpected error exporting MEEM petty cash report:", unexpectedError);
    alert("حدث خطأ أثناء تجهيز التقرير. حاول مرة أخرى.");
  } finally {
    reportExpensesMeemExportButton.disabled = false;
    reportExpensesMeemExportButton.textContent = originalLabel;
  }
}

reportExpensesMeemExportButton.addEventListener("click", exportMeemPettyCashExcel);

// ---------------------------------------------------------------------------
// 10.4a2 تصدير "تقرير المستلمين" — ملف Excel داخلي منفصل تمامًا عن تقرير
// العهدة (MEEM)، يعرض فقط اسم الموظف الذي استلم المبلغ فعليًا. هذا التقرير
// لا يُشارك خارجيًا أبدًا، ومقصور على أدمن/مدير النظام فقط (نفس الأزرار
// التي تُخفى فعليًا عن المدير ودعم تقني)
// ---------------------------------------------------------------------------

async function exportExpenseRecipientsExcel() {
  if (!reportExpensesRecipientsExportButton) return;
  reportExpensesRecipientsExportButton.disabled = true;
  const originalLabel = reportExpensesRecipientsExportButton.textContent;
  reportExpensesRecipientsExportButton.textContent = "جارٍ التجهيز...";

  try {
    const buildQuery = () => {
      let q = supabaseClient
        .from("expenses")
        .select("expense_date, amount, description, recipient_employee_name, category:expense_categories ( name, name_ar )")
        .eq("status", "active")
        .order("expense_date", { ascending: true });
      if (reportExpensesDateFrom.value) q = q.gte("expense_date", reportExpensesDateFrom.value);
      if (reportExpensesDateTo.value) q = q.lte("expense_date", reportExpensesDateTo.value);
      return q;
    };

    const { data, error } = await fetchAllRowsPaged(buildQuery);

    if (error) {
      console.error("Error exporting expense recipients report:", error);
      alert("حدث خطأ أثناء تجهيز تقرير المستلمين. حاول مرة أخرى.");
      return;
    }

    const rows = (data || []).filter((e) => e.recipient_employee_name);
    if (!rows.length) {
      alert("لا توجد مصروفات مسجّل عليها اسم موظف مستلم ضمن الفترة المحددة.");
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("تقرير المستلمين (داخلي)", { views: [{ rightToLeft: true }] });

    sheet.mergeCells("A1:E1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "تقرير داخلي — الموظفون المستلمون لمبالغ العهدة النقدية (لا يُشارك خارجيًا)";
    titleCell.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92400E" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 24;

    const headers = ["التاريخ", "المبلغ (ر.س)", "الفئة", "الموظف المستلم", "الوصف (البيان)"];
    headers.forEach((text, idx) => {
      const cell = sheet.getCell(3, idx + 1);
      cell.value = text;
      cell.font = { name: "Calibri", size: 11, bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE68A" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "medium" }, right: { style: "medium" } };
    });

    let r = 4;
    rows.forEach((exp) => {
      const categoryName = exp.category ? exp.category.name_ar || exp.category.name : "غير مصنّف";
      sheet.getCell(r, 1).value = exp.expense_date ? new Date(exp.expense_date) : null;
      sheet.getCell(r, 1).numFmt = "yyyy-mm-dd";
      sheet.getCell(r, 2).value = Number(exp.amount || 0);
      sheet.getCell(r, 2).numFmt = "#,##0.00";
      sheet.getCell(r, 3).value = categoryName;
      sheet.getCell(r, 4).value = exp.recipient_employee_name || "";
      sheet.getCell(r, 5).value = exp.description || "";
      for (let col = 1; col <= 5; col++) {
        const cell = sheet.getCell(r, col);
        cell.font = { name: "Calibri", size: 11 };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin", color: { argb: "FFB7B7B7" } },
          bottom: { style: "thin", color: { argb: "FFB7B7B7" } },
          left: { style: "thin", color: { argb: "FFB7B7B7" } },
          right: { style: "thin", color: { argb: "FFB7B7B7" } },
        };
      }
      r += 1;
    });

    const totalRow = r;
    sheet.getCell(totalRow, 1).value = "الإجمالي";
    sheet.getCell(totalRow, 2).value = { formula: "SUM(B4:B" + (totalRow - 1) + ")" };
    sheet.getCell(totalRow, 2).numFmt = "#,##0.00";
    for (let col = 1; col <= 5; col++) {
      sheet.getCell(totalRow, col).font = { name: "Calibri", size: 11, bold: true };
      sheet.getCell(totalRow, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
    }

    sheet.columns = [{ width: 14 }, { width: 16 }, { width: 34 }, { width: 26 }, { width: 46 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = "تقرير-المستلمين-داخلي-" + today + ".xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("تم إنشاء تقرير المستلمين وتنزيله بنجاح.", "success");
    URL.revokeObjectURL(url);
  } catch (unexpectedError) {
    console.error("Unexpected error exporting expense recipients report:", unexpectedError);
    alert("حدث خطأ أثناء تجهيز تقرير المستلمين. حاول مرة أخرى.");
  } finally {
    reportExpensesRecipientsExportButton.disabled = false;
    reportExpensesRecipientsExportButton.textContent = originalLabel;
  }
}

if (reportExpensesRecipientsExportButton) {
  reportExpensesRecipientsExportButton.addEventListener("click", exportExpenseRecipientsExcel);
}

// ---------------------------------------------------------------------------
// 10.4b تقرير أصول تقنية المعلومات — توزيع حسب النوع (رسم دائري) والموقع
//       (رسم أعمدة + جدول تفصيلي)، مع فلتر موقع اختياري. كتالوج اللابتوبات
//       مُستبعد من التوزيع (مفيهوش staff_location أصلًا)، وبيتعرض كارت
//       ملخص مستقل فقط كما هو موضّح في ملاحظة الصفحة نفسها
// ---------------------------------------------------------------------------

const reportItAssetsLocationFilter = document.getElementById("report-it-assets-location-filter");
const reportItAssetsExportButton = document.getElementById("report-it-assets-export");
const reportItAssetsSummary = document.getElementById("report-it-assets-summary");
const reportItAssetsTypeChart = document.getElementById("report-it-assets-type-chart");
const reportItAssetsTypeState = document.getElementById("report-it-assets-type-state");
const reportItAssetsLocationChart = document.getElementById("report-it-assets-location-chart");
const reportItAssetsLocationState = document.getElementById("report-it-assets-location-state");
const reportItAssetsTableBody = document.getElementById("report-it-assets-table-body");
const reportItAssetsState = document.getElementById("report-it-assets-state");

let reportItAssetsLocationRows = []; // آخر جدول توزيع اتحسب — مستخدم في تصدير CSV
let reportItAssetsLocationOptionsBuilt = false;

const IT_ASSETS_TYPE_LABELS = {
  laptops: "اللابتوبات",
  email: "البريد الإلكتروني",
  sim: "أرقام الجوال",
  tablets: "الأجهزة اللوحية",
};

async function loadItAssetsReport() {
  renderTableSkeleton(reportItAssetsTableBody, 5, 6);
  setReportState(reportItAssetsState, null);
  reportItAssetsSummary.innerHTML = "";

  const [laptopsRes, emailRes, simRes, tabletsRes, catalogCountRes] = await Promise.all([
    supabaseClient.from("it_laptop_assignments").select("staff_location").eq("status", "active"),
    supabaseClient.from("it_email_assignments").select("staff_location").eq("status", "active"),
    supabaseClient.from("it_sim_assignments").select("staff_location").eq("status", "active"),
    supabaseClient.from("it_tablet_assignments").select("staff_location").eq("status", "active"),
    supabaseClient.from("it_laptop_catalog").select("id", { count: "exact", head: true }).eq("status", "active"),
  ]);

  const anyError = laptopsRes.error || emailRes.error || simRes.error || tabletsRes.error || catalogCountRes.error;
  if (anyError) {
    console.error("Error loading IT assets report:", {
      laptops: laptopsRes.error,
      email: emailRes.error,
      sim: simRes.error,
      tablets: tabletsRes.error,
      catalog: catalogCountRes.error,
    });
    setReportState(reportItAssetsState, "حدث خطأ أثناء تحميل التقرير.");
    return;
  }

  const byType = {
    laptops: laptopsRes.data || [],
    email: emailRes.data || [],
    sim: simRes.data || [],
    tablets: tabletsRes.data || [],
  };
  const catalogCount = catalogCountRes.count || 0;

  // فلتر الموقع (اختياري) — بيتطبّق على كل الأنواع الأربعة قبل أي تجميع
  const locationFilter = reportItAssetsLocationFilter.value;
  if (locationFilter) {
    Object.keys(byType).forEach((key) => {
      byType[key] = byType[key].filter((r) => (r.staff_location || "غير محدد") === locationFilter);
    });
  }

  // بناء قائمة المواقع في الفلتر مرة واحدة فقط من كل البيانات الحقيقية (قبل
  // أي فلترة)، حتى القائمة تفضل ثابتة وميتقلبش مع تغيير الاختيار
  if (!reportItAssetsLocationOptionsBuilt) {
    const allLocations = new Set();
    [laptopsRes.data || [], emailRes.data || [], simRes.data || [], tabletsRes.data || []].forEach((rows) => {
      rows.forEach((r) => allLocations.add(r.staff_location || "غير محدد"));
    });
    const sortedLocations = Array.from(allLocations).sort((a, b) => a.localeCompare(b, "ar"));
    reportItAssetsLocationFilter.innerHTML =
      '<option value="">كل المواقع</option>' +
      sortedLocations.map((loc) => '<option value="' + escapeHtml(loc) + '">' + escapeHtml(loc) + "</option>").join("");
    reportItAssetsLocationFilter.value = locationFilter;
    reportItAssetsLocationOptionsBuilt = true;
  }

  const typeCounts = {
    laptops: byType.laptops.length,
    email: byType.email.length,
    sim: byType.sim.length,
    tablets: byType.tablets.length,
  };
  const totalIssued = typeCounts.laptops + typeCounts.email + typeCounts.sim + typeCounts.tablets;

  reportItAssetsSummary.innerHTML =
    statCardHtml(icon("laptop"), "اللابتوبات", String(typeCounts.laptops), "") +
    statCardHtml(icon("mail"), "البريد الإلكتروني", String(typeCounts.email), "") +
    statCardHtml(icon("phone"), "أرقام الجوال", String(typeCounts.sim), "") +
    statCardHtml(icon("tablet"), "الأجهزة اللوحية", String(typeCounts.tablets), "") +
    statCardHtml(icon("archive"), "كتالوج اللابتوبات", String(catalogCount), "غير مرتبط بموقع");

  // ---- رسم دائري: توزيع الأصول الموزّعة حسب النوع ----
  if (totalIssued === 0) {
    setReportState(reportItAssetsTypeState, "لا توجد بيانات لعرضها.");
    destroyExistingChart(reportItAssetsTypeChart);
  } else {
    setReportState(reportItAssetsTypeState, null);
    drawDonutChart(
      reportItAssetsTypeChart,
      Object.keys(typeCounts).map((key) => ({ label: IT_ASSETS_TYPE_LABELS[key], value: typeCounts[key] })),
      { formatValue: (v) => formatNumber(v, 0) }
    );
  }

  // ---- تجميع حسب الموقع (لكل الأنواع الأربعة) ----
  const locationMap = {};
  Object.keys(byType).forEach((typeKey) => {
    byType[typeKey].forEach((r) => {
      const loc = r.staff_location || "غير محدد";
      if (!locationMap[loc]) locationMap[loc] = { location: loc, laptops: 0, email: 0, sim: 0, tablets: 0 };
      locationMap[loc][typeKey] += 1;
    });
  });

  const locationRows = Object.values(locationMap)
    .map((row) => ({ ...row, total: row.laptops + row.email + row.sim + row.tablets }))
    .sort((a, b) => b.total - a.total);

  reportItAssetsLocationRows = locationRows;

  // ---- رسم أعمدة أفقي: أعلى 10 مواقع حسب الإجمالي ----
  const topLocations = locationRows.slice(0, 10);
  if (!topLocations.length) {
    setReportState(reportItAssetsLocationState, "لا توجد بيانات لعرضها.");
    destroyExistingChart(reportItAssetsLocationChart);
  } else {
    setReportState(reportItAssetsLocationState, null);
    drawBarChart(
      reportItAssetsLocationChart,
      topLocations.map((r) => r.total),
      topLocations.map((r) => r.location),
      { horizontal: true, formatValue: (v) => formatNumber(v, 0) }
    );
  }

  // ---- الجدول التفصيلي ----
  if (!locationRows.length) {
    setReportState(reportItAssetsState, "لا توجد بيانات مطابقة للفلتر المحدد.");
    reportItAssetsTableBody.innerHTML = "";
    return;
  }

  setReportState(reportItAssetsState, null);
  reportItAssetsTableBody.innerHTML = locationRows
    .map(
      (r) =>
        "<tr><td>" + escapeHtml(r.location) + "</td>" +
        "<td>" + r.laptops + "</td>" +
        "<td>" + r.email + "</td>" +
        "<td>" + r.sim + "</td>" +
        "<td>" + r.tablets + "</td>" +
        "<td><strong>" + r.total + "</strong></td></tr>"
    )
    .join("");
}

reportItAssetsLocationFilter.addEventListener("change", () => loadItAssetsReport());

reportItAssetsExportButton.addEventListener("click", () => {
  exportRowsToCSV(
    "it-assets-report.csv",
    ["الموقع", "اللابتوبات", "البريد الإلكتروني", "أرقام الجوال", "الأجهزة اللوحية", "الإجمالي"],
    reportItAssetsLocationRows.map((r) => [r.location, r.laptops, r.email, r.sim, r.tablets, r.total])
  );
});

// ---------------------------------------------------------------------------
// 10.4c تبويبات مستقلة لكل نوع أصل داخل تقرير أصول تقنية المعلومات — كل
//       تبويب بيوضّح إجمالي النوع هذا وحده، وعدد النشط/المتاح مقابل
//       المسترد/المستبعد، مع توزيع حسب الموقع (أو نوع اللابتوب لكتالوج
//       اللابتوبات تحديدًا لأنه غير مرتبط بموقع أصلًا)
// ---------------------------------------------------------------------------

const itAssetsReportSubtabsContainer = document.getElementById("it-assets-report-subtabs");
const itAssetsReportSubpanels = {
  overview: document.getElementById("it-assets-report-panel-overview"),
  laptops: document.getElementById("it-assets-report-panel-laptops"),
  email: document.getElementById("it-assets-report-panel-email"),
  sim: document.getElementById("it-assets-report-panel-sim"),
  tablets: document.getElementById("it-assets-report-panel-tablets"),
  "laptop-catalog": document.getElementById("it-assets-report-panel-laptop-catalog"),
};

let currentItAssetsReportSubtab = "overview";

const IT_ASSET_REPORT_TYPES = [
  {
    key: "laptops",
    table: "it_laptop_assignments",
    icon: "laptop",
    activeLabel: "نشطة",
    inactiveLabel: "مستردة",
    groupField: "staff_location",
    groupHeader: "الموقع",
    groupFallback: "غير محدد",
  },
  {
    key: "email",
    table: "it_email_assignments",
    icon: "mail",
    activeLabel: "نشطة",
    inactiveLabel: "مستردة",
    groupField: "staff_location",
    groupHeader: "الموقع",
    groupFallback: "غير محدد",
  },
  {
    key: "sim",
    table: "it_sim_assignments",
    icon: "phone",
    activeLabel: "نشطة",
    inactiveLabel: "مستردة",
    groupField: "staff_location",
    groupHeader: "الموقع",
    groupFallback: "غير محدد",
  },
  {
    key: "tablets",
    table: "it_tablet_assignments",
    icon: "tablet",
    activeLabel: "نشطة",
    inactiveLabel: "مستردة",
    groupField: "staff_location",
    groupHeader: "الموقع",
    groupFallback: "غير محدد",
  },
  {
    key: "laptop-catalog",
    table: "it_laptop_catalog",
    icon: "archive",
    activeLabel: "نشط",
    inactiveLabel: "مستبعد",
    groupField: "laptop_type",
    groupHeader: "نوع اللابتوب",
    groupFallback: "غير محدد",
  },
];

// آخر جدول توزيع اتحسب لكل نوع — مستخدم في تصدير CSV الخاص بتبويبه
const itAssetTypeReportRowsCache = {};

itAssetsReportSubtabsContainer.querySelectorAll("[data-it-report-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentItAssetsReportSubtab = btn.dataset.itReportTab;
    itAssetsReportSubtabsContainer.querySelectorAll("[data-it-report-tab]").forEach((b) => {
      b.classList.toggle("active", b === btn);
    });
    Object.keys(itAssetsReportSubpanels).forEach((key) => {
      itAssetsReportSubpanels[key].hidden = key !== currentItAssetsReportSubtab;
    });
    loadItAssetsReportSubtab(currentItAssetsReportSubtab);
  });
});

function loadItAssetsReportSubtab(tab) {
  if (tab === "overview") {
    loadItAssetsReport();
    return;
  }
  const cfg = IT_ASSET_REPORT_TYPES.find((t) => t.key === tab);
  if (cfg) loadItAssetTypeReport(cfg);
}

async function loadItAssetTypeReport(cfg) {
  const summaryEl = document.getElementById("report-it-assets-" + cfg.key + "-summary");
  const statusChartCanvas = document.getElementById("report-it-assets-" + cfg.key + "-status-chart");
  const statusStateEl = document.getElementById("report-it-assets-" + cfg.key + "-status-state");
  const groupChartCanvas = document.getElementById("report-it-assets-" + cfg.key + "-group-chart");
  const groupStateEl = document.getElementById("report-it-assets-" + cfg.key + "-group-state");
  const tableBody = document.getElementById("report-it-assets-" + cfg.key + "-table-body");
  const stateEl = document.getElementById("report-it-assets-" + cfg.key + "-state");

  renderTableSkeleton(tableBody, 5, 4);
  setReportState(stateEl, null);
  summaryEl.innerHTML = "";

  const { data, error } = await supabaseClient.from(cfg.table).select("status, " + cfg.groupField);
  if (error) {
    console.error("Error loading IT asset type report (" + cfg.key + "):", error);
    setReportState(stateEl, "حدث خطأ أثناء تحميل التقرير.");
    return;
  }

  const rows = data || [];
  const activeCount = rows.filter((r) => r.status === "active").length;
  const inactiveCount = rows.length - activeCount;

  summaryEl.innerHTML =
    statCardHtml(icon(cfg.icon), "الإجمالي", String(rows.length), "") +
    statCardHtml(icon("checkCircle"), cfg.activeLabel, String(activeCount), "") +
    statCardHtml(icon("noEntry"), cfg.inactiveLabel, String(inactiveCount), "");

  // ---- رسم دائري: الحالة (نشط/متاح مقابل مسترد/مستبعد) ----
  if (!rows.length) {
    setReportState(statusStateEl, "لا توجد بيانات لعرضها.");
    destroyExistingChart(statusChartCanvas);
  } else {
    setReportState(statusStateEl, null);
    drawDonutChart(
      statusChartCanvas,
      [
        { label: cfg.activeLabel, value: activeCount },
        { label: cfg.inactiveLabel, value: inactiveCount },
      ],
      { formatValue: (v) => formatNumber(v, 0) }
    );
  }

  // ---- تجميع حسب الموقع (أو نوع اللابتوب لكتالوج اللابتوبات) ----
  const groupMap = {};
  rows.forEach((r) => {
    const key = r[cfg.groupField] || cfg.groupFallback;
    if (!groupMap[key]) groupMap[key] = { group: key, active: 0, inactive: 0 };
    if (r.status === "active") groupMap[key].active += 1;
    else groupMap[key].inactive += 1;
  });
  const groupRows = Object.values(groupMap)
    .map((r) => ({ ...r, total: r.active + r.inactive }))
    .sort((a, b) => b.total - a.total);

  itAssetTypeReportRowsCache[cfg.key] = groupRows;

  const topGroups = groupRows.slice(0, 10);
  if (!topGroups.length) {
    setReportState(groupStateEl, "لا توجد بيانات لعرضها.");
    destroyExistingChart(groupChartCanvas);
  } else {
    setReportState(groupStateEl, null);
    drawBarChart(
      groupChartCanvas,
      topGroups.map((r) => r.total),
      topGroups.map((r) => r.group),
      { horizontal: true, formatValue: (v) => formatNumber(v, 0) }
    );
  }

  if (!groupRows.length) {
    setReportState(stateEl, "لا توجد بيانات لعرضها.");
    tableBody.innerHTML = "";
    return;
  }

  setReportState(stateEl, null);
  tableBody.innerHTML = groupRows
    .map(
      (r) =>
        "<tr><td>" +
        escapeHtml(r.group) +
        "</td><td>" +
        r.active +
        "</td><td>" +
        r.inactive +
        "</td><td><strong>" +
        r.total +
        "</strong></td></tr>"
    )
    .join("");
}

document.querySelectorAll("[data-it-report-export]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.itReportExport;
    const cfg = IT_ASSET_REPORT_TYPES.find((t) => t.key === key);
    if (!cfg) return;
    const rows = itAssetTypeReportRowsCache[key] || [];
    exportRowsToCSV(
      "it-assets-" + key + "-report.csv",
      [cfg.groupHeader, cfg.activeLabel, cfg.inactiveLabel, "الإجمالي"],
      rows.map((r) => [r.group, r.active, r.inactive, r.total])
    );
  });
});

// ---------------------------------------------------------------------------
// 10.5 نسخة احتياطية كاملة (Excel) — كل الجداول الأساسية في ملف واحد بعدة
// شيتات، مستقلة عن أي فلتر تاريخ في التبويبات فوق. تُستخدم fetchAllRowsPaged
// حتى لا أحد جدول يتقطع عند أول 1000 صف كما حصل سابقًا في التقارير
// ---------------------------------------------------------------------------

const fullBackupExportButton = document.getElementById("full-backup-export-button");

function addBackupSheet(workbook, sheetName, headers, rows) {
  const worksheet = workbook.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });
  worksheet.addRow(headers);
  worksheet.getRow(1).font = { bold: true };
  worksheet.columns = headers.map((h) => ({ width: Math.max(16, h.length + 4) }));
  rows.forEach((r) => worksheet.addRow(r));
}

// ---------------------------------------------------------------------------
// دالة مشتركة: تجيب بيانات الأصول التقنية الخمسة وتحقنها كشيتات في أي
// Workbook مُمرَّر لها — تُستخدم من كل من "النسخة الاحتياطية الكاملة" (كل
// الأدوار المخوّلة) و"تصدير أصول تقنية IT" المستقل (خاص بدور دعم تقني، لا
// يحتوي على أي بيانات سيارات/وقود/عهدة نقدية/مصروفات إطلاقًا)
// ---------------------------------------------------------------------------
async function fetchAndAddItAssetsSheets(workbook) {
  const [laptopsRes, emailsRes, simsRes, tabletsRes, laptopCatalogRes] = await Promise.all([
    fetchAllRowsPaged(() =>
      supabaseClient
        .from("it_laptop_assignments")
        .select("staff_id, staff_name, serial_number, asset_tag, antivirus_licensed, job_position, staff_location, status")
        .order("staff_name", { ascending: true })
    ),
    fetchAllRowsPaged(() =>
      supabaseClient
        .from("it_email_assignments")
        .select("staff_id, staff_name, email_address, job_position, staff_location, status")
        .order("staff_name", { ascending: true })
    ),
    fetchAllRowsPaged(() =>
      supabaseClient
        .from("it_sim_assignments")
        .select("staff_id, staff_name, mobile_number, job_position, staff_location, status")
        .order("staff_name", { ascending: true })
    ),
    fetchAllRowsPaged(() =>
      supabaseClient
        .from("it_tablet_assignments")
        .select("staff_id, staff_name, serial_number, staff_location, status")
        .order("staff_name", { ascending: true })
    ),
    fetchAllRowsPaged(() =>
      supabaseClient
        .from("it_laptop_catalog")
        .select("serial_number, laptop_type, asset_tag, status")
        .order("serial_number", { ascending: true })
    ),
  ]);

  const results = { laptops: laptopsRes, emails: emailsRes, sims: simsRes, tablets: tabletsRes, laptopCatalog: laptopCatalogRes };
  var hasError = false;
  for (var rk in results) { if (results[rk].error) { hasError = true; break; } }
  if (hasError) {
    console.error("Error fetching IT assets sheets:", results);
    return { error: results };
  }

  addBackupSheet(
    workbook,
    "أجهزة الحاسب",
    ["رقم الموظف", "اسم الموظف", "الرقم التسلسلي", "رقم الأصل", "مكافح الفيروسات", "المسمى الوظيفي", "الموقع", "الحالة"],
    (laptopsRes.data || []).map((r) => [
      r.staff_id || "",
      r.staff_name || "",
      r.serial_number || "",
      r.asset_tag || "",
      r.antivirus_licensed ? "نعم" : "لا",
      r.job_position || "",
      r.staff_location || "",
      r.status === "recovered" ? "مستردّ" : "نشط",
    ])
  );

  addBackupSheet(
    workbook,
    "حسابات البريد",
    ["رقم الموظف", "اسم الموظف", "البريد الإلكتروني", "المسمى الوظيفي", "الموقع", "الحالة"],
    (emailsRes.data || []).map((r) => [
      r.staff_id || "",
      r.staff_name || "",
      r.email_address || "",
      r.job_position || "",
      r.staff_location || "",
      r.status === "recovered" ? "مستردّ" : "نشط",
    ])
  );

  addBackupSheet(
    workbook,
    "شرائح الاتصال",
    ["رقم الموظف", "اسم الموظف", "رقم الجوال", "المسمى الوظيفي", "الموقع", "الحالة"],
    (simsRes.data || []).map((r) => [
      r.staff_id || "",
      r.staff_name || "",
      r.mobile_number || "",
      r.job_position || "",
      r.staff_location || "",
      r.status === "recovered" ? "مستردّ" : "نشط",
    ])
  );

  addBackupSheet(
    workbook,
    "الأجهزة اللوحية",
    ["رقم الموظف", "اسم الموظف", "الرقم التسلسلي", "الموقع", "الحالة"],
    (tabletsRes.data || []).map((r) => [
      r.staff_id || "",
      r.staff_name || "",
      r.serial_number || "",
      r.staff_location || "",
      r.status === "recovered" ? "مستردّ" : "نشط",
    ])
  );

  addBackupSheet(
    workbook,
    "كتالوج الحواسيب",
    ["الرقم التسلسلي", "النوع", "رقم الأصل", "الحالة"],
    (laptopCatalogRes.data || []).map((r) => [
      r.serial_number || "",
      r.laptop_type || "",
      r.asset_tag || "",
      r.status === "excluded" ? "مستبعد" : "نشط",
    ])
  );

  return { error: null };
}

// ---------------------------------------------------------------------------
// تصدير أصول تقنية المعلومات فقط — Excel بـ5 شيتات (بدون أي بيانات
// سيارات/وقود/عهدة نقدية/مصروفات إطلاقًا). يُستخدم مباشرة من التحميل
// التلقائي اليومي لدور "دعم تقني"
// ---------------------------------------------------------------------------
async function exportItAssetsExcel() {
  const workbook = new ExcelJS.Workbook();
  const { error } = await fetchAndAddItAssetsSheets(workbook);
  if (error) {
    console.error("Error exporting IT assets report:", error);
    return false;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const today = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = "أصول-تقنية-المعلومات-" + today + ".xlsx";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}

async function exportFullBackupToExcel() {
  fullBackupExportButton.disabled = true;
  const originalLabel = fullBackupExportButton.textContent;
  fullBackupExportButton.textContent = "جارٍ التجهيز...";

  try {
    const [vehiclesRes, fuelRes, fundsRes, expensesRes] = await Promise.all([
      fetchAllRowsPaged(() =>
        supabaseClient
          .from("vehicles")
          .select(
            "license_plate, make, manufacturing_year, status, actual_user_name, actual_user_national_id, authorization_expiry_date, created_at"
          )
          .order("license_plate", { ascending: true })
      ),
      fetchAllRowsPaged(() =>
        supabaseClient
          .from("fuel_transactions")
          .select("transaction_date, liters, amount, status, vehicle:vehicles ( license_plate, actual_user_name )")
          .order("transaction_date", { ascending: false })
      ),
      fetchAllRowsPaged(() =>
        supabaseClient
          .from("petty_cash_funds")
          .select("fund_code, opening_amount, status, funded_at, closed_at")
          .order("funded_at", { ascending: false })
      ),
      fetchAllRowsPaged(() =>
        supabaseClient
          .from("expenses")
          .select(
            "amount, expense_date, description, status, fund:petty_cash_funds ( fund_code ), category:expense_categories ( name, name_ar )"
          )
          .order("expense_date", { ascending: false })
      ),
    ]);

    const allResults = { vehicles: vehiclesRes, fuel: fuelRes, funds: fundsRes, expenses: expensesRes };
    var hasError = false;
    for (var rk in allResults) { if (allResults[rk].error) { hasError = true; break; } }
    if (hasError) {
      console.error("Error exporting full backup:", allResults);
      alert("حدث خطأ أثناء تجهيز النسخة الاحتياطية. حاول مرة أخرى.");
      return;
    }

    const workbook = new ExcelJS.Workbook();

    addBackupSheet(
      workbook,
      "السيارات",
      ["رقم اللوحة", "الماركة", "سنة الصنع", "الحالة", "المستخدم الفعلي", "رقم الهوية/الإقامة", "تفويض حتى", "تاريخ الإضافة"],
      (vehiclesRes.data || []).map((v) => [
        v.license_plate,
        v.make || "",
        v.manufacturing_year || "",
        VEHICLE_STATUS_LABELS[v.status] || v.status,
        v.actual_user_name || "",
        v.actual_user_national_id || "",
        v.authorization_expiry_date || "",
        v.created_at ? v.created_at.slice(0, 10) : "",
      ])
    );

    addBackupSheet(
      workbook,
      "الوقود",
      ["رقم اللوحة", "المستخدم الفعلي", "التاريخ", "اللترات", "التكلفة", "الحالة"],
      (fuelRes.data || []).map((f) => [
        f.vehicle ? f.vehicle.license_plate : "",
        f.vehicle && f.vehicle.actual_user_name ? f.vehicle.actual_user_name : "",
        f.transaction_date,
        Number(f.liters || 0),
        Number(f.amount || 0),
        f.status === "voided" ? "ملغاة" : "نشطة",
      ])
    );

    addBackupSheet(
      workbook,
      "العهدة النقدية",
      ["كود العهدة", "المبلغ الافتتاحي", "الحالة", "تاريخ التمويل", "تاريخ الإغلاق"],
      (fundsRes.data || []).map((f) => [
        f.fund_code,
        Number(f.opening_amount || 0),
        FUND_STATUS_LABELS[f.status] || f.status,
        f.funded_at,
        f.closed_at || "",
      ])
    );

    addBackupSheet(
      workbook,
      "المصروفات",
      ["كود العهدة", "الفئة", "المبلغ", "التاريخ", "الوصف", "الحالة"],
      (expensesRes.data || []).map((e) => [
        e.fund ? e.fund.fund_code : "",
        e.category ? e.category.name_ar || e.category.name : "",
        Number(e.amount || 0),
        e.expense_date,
        e.description || "",
        e.status === "voided" ? "ملغاة" : "نشطة",
      ])
    );

    // --- الأصول التقنية (IT Assets) — عبر الدالة المشتركة ---
    const itSheetsResult = await fetchAndAddItAssetsSheets(workbook);
    if (itSheetsResult.error) {
      alert("حدث خطأ أثناء تجهيز شيتات الأصول التقنية بالنسخة الاحتياطية. حاول مرة أخرى.");
      return;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = "نسخة-احتياطية-" + today + ".xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("تم إنشاء النسخة الاحتياطية وتنزيلها بنجاح.", "success");
    URL.revokeObjectURL(url);
  } catch (unexpectedError) {
    console.error("Unexpected error exporting full backup:", unexpectedError);
    alert("حدث خطأ أثناء تجهيز النسخة الاحتياطية. حاول مرة أخرى.");
  } finally {
    fullBackupExportButton.disabled = false;
    fullBackupExportButton.textContent = originalLabel;
  }
}

fullBackupExportButton.addEventListener("click", exportFullBackupToExcel);

// ============================================================================
// 11. سجل العمليات (Audit Log) — Super Admin فقط — Phase 5
// ============================================================================

const AUDIT_ENTITY_LABELS = {
  vehicles: "السيارات",
  fuel_transactions: "الوقود",
  petty_cash_funds: "العهدة النقدية",
  expenses: "المصروفات",
};

const AUDIT_ACTION_LABELS = {
  "vehicles.created": "إنشاء سيارة",
  "vehicles.updated": "تعديل سيارة",
  "vehicles.status_changed": "تغيير حالة سيارة",
  "fuel_transactions.created": "إضافة معاملة وقود",
  "fuel_transactions.updated": "تعديل معاملة وقود",
  "fuel_transactions.voided": "إلغاء معاملة وقود",
  "petty_cash_funds.created": "إنشاء عهدة نقدية",
  "petty_cash_funds.updated": "تعديل عهدة",
  "petty_cash_funds.exhausted": "إغلاق عهدة (مستنفدة)",
  "petty_cash_funds.closed": "إغلاق عهدة",
  "petty_cash_funds.cancelled": "إلغاء عهدة",
  "expenses.created": "إضافة مصروف",
  "expenses.voided": "إلغاء مصروف",
};

const AUDIT_PAGE_SIZE = 20;
let auditState = { page: 1, action: "", userId: "", dateFrom: "", dateTo: "", totalCount: 0 };
let auditFilterOptionsLoaded = false;

const auditTableBody = document.getElementById("audit-table-body");
const auditStateBox = document.getElementById("audit-state");
const auditActionFilter = document.getElementById("audit-action-filter");
const auditUserFilter = document.getElementById("audit-user-filter");
const auditDateFromInput = document.getElementById("audit-date-from");
const auditDateToInput = document.getElementById("audit-date-to");
const auditPrevPageButton = document.getElementById("audit-prev-page");
const auditNextPageButton = document.getElementById("audit-next-page");
const auditPaginationInfo = document.getElementById("audit-pagination-info");

const auditDetailsModal = document.getElementById("audit-details-modal");
const auditDetailsSummary = document.getElementById("audit-details-summary");
const auditDetailsOld = document.getElementById("audit-details-old");
const auditDetailsNew = document.getElementById("audit-details-new");

async function ensureAuditFilterOptions() {
  if (auditFilterOptionsLoaded) return;
  auditFilterOptionsLoaded = true;

  auditActionFilter.innerHTML =
    '<option value="">كل العمليات</option>' +
    Object.entries(AUDIT_ACTION_LABELS)
      .map(([value, label]) => '<option value="' + value + '">' + escapeHtml(label) + "</option>")
      .join("");

  const { data, error } = await supabaseClient.from("profile_public").select("id, full_name").order("full_name");
  if (error) {
    console.error("Error loading users for audit filter:", error);
  } else if (data) {
    auditUserFilter.innerHTML =
      '<option value="">كل المستخدمين</option>' +
      data.map((u) => '<option value="' + u.id + '">' + escapeHtml(u.full_name) + "</option>").join("");
  }
}

function setAuditState(message) {
  auditStateBox.classList.remove("is-rich");
  if (!message) {
    auditStateBox.hidden = true;
    auditStateBox.textContent = "";
    return;
  }
  auditStateBox.hidden = false;
  auditStateBox.textContent = message;
}

function updateAuditPaginationControls() {
  const totalPages = Math.max(1, Math.ceil(auditState.totalCount / AUDIT_PAGE_SIZE));
  auditPaginationInfo.textContent = auditState.totalCount
    ? "صفحة " + auditState.page + " من " + totalPages + " — إجمالي " + auditState.totalCount + " عملية"
    : "";
  auditPrevPageButton.disabled = auditState.page <= 1;
  auditNextPageButton.disabled = auditState.page >= totalPages;
}

async function loadAuditLog() {
  await ensureAuditFilterOptions();

  renderTableSkeleton(auditTableBody, 6, 5);
  setAuditState(null);
  auditPrevPageButton.disabled = true;
  auditNextPageButton.disabled = true;

  const from = (auditState.page - 1) * AUDIT_PAGE_SIZE;
  const to = from + AUDIT_PAGE_SIZE - 1;

  let query = supabaseClient
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, old_data, new_data, created_at, user_id", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (auditState.action) query = query.eq("action", auditState.action);
  if (auditState.userId) query = query.eq("user_id", auditState.userId);
  if (auditState.dateFrom) query = query.gte("created_at", auditState.dateFrom + "T00:00:00");
  if (auditState.dateTo) query = query.lte("created_at", auditState.dateTo + "T23:59:59");

  const { data, error, count } = await query;

  if (error) {
    console.error("Error loading audit log:", error);
    setAuditState("تعذر تحميل سجل العمليات. يُرجى المحاولة مرة أخرى.");
    auditPaginationInfo.textContent = "";
    return;
  }

  auditState.totalCount = count || 0;

  if (!data || data.length === 0) {
    if (auditState.action || auditState.userId || auditState.dateFrom || auditState.dateTo) {
      showRichEmptyState(
        auditStateBox,
        icon("clock"),
        "لا توجد نتائج مطابقة",
        "لا توجد سجلات تطابق الفلاتر الحالية.",
        '<button type="button" class="btn-secondary btn-sm" id="audit-clear-filters-button">مسح الفلاتر</button>'
      );
      document.getElementById("audit-clear-filters-button").addEventListener("click", () => {
        auditActionFilter.value = "";
        auditUserFilter.value = "";
        auditDateFromInput.value = "";
        auditDateToInput.value = "";
        auditState.action = "";
        auditState.userId = "";
        auditState.dateFrom = "";
        auditState.dateTo = "";
        auditState.page = 1;
        loadAuditLog();
      });
    } else {
      showRichEmptyState(
        auditStateBox,
        icon("clock"),
        "لا توجد عمليات مسجّلة بعد",
        "يُعبَّأ سجل العمليات تلقائيًا فور حدوث أي إنشاء أو تعديل أو إلغاء في السيارات، الوقود، العهدة النقدية، أو المصروفات.",
        ""
      );
    }
    updateAuditPaginationControls();
    return;
  }

  setAuditState(null);
  const creatorMap = await fetchCreatorNames(data.map((d) => d.user_id));

  auditTableBody.innerHTML = data
    .map((row) => {
      const actionLabel = AUDIT_ACTION_LABELS[row.action] || row.action;
      const entityLabel = AUDIT_ENTITY_LABELS[row.entity_type] || row.entity_type;
      return (
        "<tr class=\"clickable-row\" data-audit-id=\"" + row.id + "\">" +
        "<td>" + formatDateTime(row.created_at) + "</td>" +
        "<td>" + escapeHtml(creatorMap[row.user_id] || "—") + "</td>" +
        "<td>" + escapeHtml(actionLabel) + "</td>" +
        "<td>" + escapeHtml(entityLabel) + "</td>" +
        '<td><button type="button" class="btn-secondary btn-sm audit-view-btn">عرض</button></td></tr>'
      );
    })
    .join("");

  auditTableBody.querySelectorAll("tr[data-audit-id]").forEach((tr) => {
    const row = data.find((d) => d.id === tr.dataset.auditId);
    tr.addEventListener("click", () => openAuditDetails(row, creatorMap));
  });

  updateAuditPaginationControls();
}

function openAuditDetails(row, creatorMap) {
  auditDetailsSummary.innerHTML =
    detailRow("الوقت", formatDateTime(row.created_at)) +
    detailRow("المستخدم", escapeHtml(creatorMap[row.user_id] || "—")) +
    detailRow("العملية", escapeHtml(AUDIT_ACTION_LABELS[row.action] || row.action)) +
    detailRow("الكيان", escapeHtml(AUDIT_ENTITY_LABELS[row.entity_type] || row.entity_type)) +
    detailRow("معرّف السجل", escapeHtml(row.entity_id || "—"));

  auditDetailsOld.textContent = row.old_data ? JSON.stringify(row.old_data, null, 2) : "لا توجد قيمة سابقة (عملية إنشاء).";
  auditDetailsNew.textContent = row.new_data ? JSON.stringify(row.new_data, null, 2) : "—";

  auditDetailsModal.hidden = false;
}

auditActionFilter.addEventListener("change", () => {
  auditState.action = auditActionFilter.value;
  auditState.page = 1;
  loadAuditLog();
});

auditUserFilter.addEventListener("change", () => {
  auditState.userId = auditUserFilter.value;
  auditState.page = 1;
  loadAuditLog();
});

auditDateFromInput.addEventListener("change", () => {
  auditState.dateFrom = auditDateFromInput.value;
  auditState.page = 1;
  loadAuditLog();
});

auditDateToInput.addEventListener("change", () => {
  auditState.dateTo = auditDateToInput.value;
  auditState.page = 1;
  loadAuditLog();
});

auditPrevPageButton.addEventListener("click", () => {
  if (auditState.page > 1) {
    auditState.page -= 1;
    loadAuditLog();
  }
});

auditNextPageButton.addEventListener("click", () => {
  const totalPages = Math.max(1, Math.ceil(auditState.totalCount / AUDIT_PAGE_SIZE));
  if (auditState.page < totalPages) {
    auditState.page += 1;
    loadAuditLog();
  }
});

// ============================================================================
// 12. البحث الشامل (Global Search) — Phase 5
// ============================================================================

const globalSearchInput = document.getElementById("global-search-input");
const globalSearchResults = document.getElementById("global-search-results");
let globalSearchDebounce;

globalSearchInput.addEventListener("input", () => {
  clearTimeout(globalSearchDebounce);
  const term = globalSearchInput.value.trim();

  if (term.length < 2) {
    globalSearchResults.hidden = true;
    globalSearchResults.innerHTML = "";
    return;
  }

  globalSearchDebounce = setTimeout(() => runGlobalSearch(term), 300);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".global-search")) {
    globalSearchResults.hidden = true;
  }
});

// ---- قائمة المستخدم المنسدلة في الشريط العلوي ----

function closeTopbarUserMenu() {
  topbarUserMenu.hidden = true;
  topbarUserTrigger.setAttribute("aria-expanded", "false");
}

function toggleTopbarUserMenu() {
  const isOpen = !topbarUserMenu.hidden;
  topbarUserMenu.hidden = isOpen;
  topbarUserTrigger.setAttribute("aria-expanded", String(!isOpen));
}

topbarUserTrigger.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleTopbarUserMenu();
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".topbar-user-menu-wrapper")) {
    closeTopbarUserMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeTopbarUserMenu();
  }
});

topbarUserMenu.addEventListener("click", (event) => {
  if (event.target.closest("#theme-toggle-button, #change-password-button, #logout-button")) {
    closeTopbarUserMenu();
  }
});

// ---- القائمة الجانبية على الموبايل (Drawer عائم + غطاء خلفي) ----

const appSidebar = document.getElementById("app-sidebar");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const sidebarOpenButton = document.getElementById("sidebar-open-button");
const sidebarCloseButton = document.getElementById("sidebar-close-button");

function openMobileSidebar() {
  appSidebar.classList.add("is-open");
  sidebarBackdrop.classList.add("is-visible");
}

function closeMobileSidebar() {
  appSidebar.classList.remove("is-open");
  sidebarBackdrop.classList.remove("is-visible");
}

sidebarOpenButton.addEventListener("click", openMobileSidebar);
sidebarCloseButton.addEventListener("click", closeMobileSidebar);
sidebarBackdrop.addEventListener("click", closeMobileSidebar);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMobileSidebar();
  }
});

// إغلاق القائمة تلقائيًا بعد اختيار صفحة على الموبايل (تجربة استخدام
// طبيعية — لا داعي أن تبقى القائمة مفتوحة فوق المحتوى بعد اختيار الوجهة)
appSidebar.addEventListener("click", (event) => {
  if (event.target.closest(".sidebar-nav-item")) {
    closeMobileSidebar();
  }
});

async function runGlobalSearch(term) {
  globalSearchResults.hidden = false;
  globalSearchResults.innerHTML = '<div class="search-results-state">جارٍ البحث...</div>';

  const likeTerm = "%" + term + "%";

  const [vehiclesRes, locationsRes] = await Promise.all([
    supabaseClient
      .from("vehicles")
      .select("id, license_plate, make, actual_user_name")
      .or("license_plate.ilike." + likeTerm + ",actual_user_name.ilike." + likeTerm)
      .limit(5),
    supabaseClient.from("locations").select("id, name").ilike("name", likeTerm).limit(5),
  ]);

  if (vehiclesRes.error) console.error("Error searching vehicles:", vehiclesRes.error);
  if (locationsRes.error) console.error("Error searching locations:", locationsRes.error);

  const vehicles = vehiclesRes.data || [];
  const locations = locationsRes.data || [];

  if (!vehicles.length && !locations.length) {
    const hadError = vehiclesRes.error || locationsRes.error;
    globalSearchResults.innerHTML =
      '<div class="search-results-state">' +
      (hadError ? "تعذر إتمام البحث. يُرجى المحاولة مرة أخرى." : "لا توجد نتائج مطابقة.") +
      "</div>";
    return;
  }

  let html = "";

  if (vehicles.length) {
    html +=
      '<div class="search-results-group"><span class="search-results-group-title">السيارات</span>' +
      vehicles
        .map((v) => {
          const sub = v.actual_user_name ? "المستخدم الفعلي: " + v.actual_user_name : v.make || "—";
          return (
            '<button type="button" class="search-result-item" data-search-type="vehicle" data-search-id="' + v.id + '">' +
            "<span>" + escapeHtml(v.license_plate) + "</span>" +
            '<span class="search-result-sub">' + escapeHtml(sub) + "</span></button>"
          );
        })
        .join("") +
      "</div>";
  }

  if (locations.length) {
    html +=
      '<div class="search-results-group"><span class="search-results-group-title">المواقع</span>' +
      locations
        .map(
          (l) =>
            '<button type="button" class="search-result-item" data-search-type="location" data-search-id="' + l.id + '">' +
            "<span>" + escapeHtml(l.name) + "</span></button>"
        )
        .join("") +
      "</div>";
  }

  globalSearchResults.innerHTML = html;

  globalSearchResults.querySelectorAll(".search-result-item").forEach((btn) => {
    btn.addEventListener("click", () => handleSearchResultClick(btn.dataset.searchType, btn.dataset.searchId));
  });
}

async function handleSearchResultClick(type, id) {
  globalSearchResults.hidden = true;
  globalSearchInput.value = "";

  if (type === "vehicle") {
    navigateTo("vehicles");
    const { data, error } = await supabaseClient
      .from("vehicles")
      .select(
        "id, license_plate, make, manufacturing_year, " +
          "actual_user_name, actual_user_national_id, authorization_expiry_date, status, created_at, updated_at, " +
          "current_location_id, current_location:locations ( name )"
      )
      .eq("id", id)
      .single();
    if (error) {
      console.error("Error opening vehicle from search:", error);
      alert("تعذر فتح تفاصيل السيارة. يُرجى المحاولة مرة أخرى.");
      return;
    }
    if (data) openVehicleDetails(data);
    return;
  }

  // لا توجد صفحة مخصصة للمواقع بعد، فأقرب سياق فعلي لها هو صفحة السيارات
  navigateTo("vehicles");
}

// ============================================================================
// 13. حسابات النظام (Accounts) — Phase 6 — Super Admin فقط
// ============================================================================

// ---------------------------------------------------------------------------
// 13.1 حسابات النظام (profiles) — عرض، تعطيل/تفعيل، تغيير دور
// ---------------------------------------------------------------------------

const accountsTableBody = document.getElementById("accounts-table-body");
const accountsStateBox = document.getElementById("accounts-state");

const accountFormModal = document.getElementById("account-form-modal");
const accountForm = document.getElementById("account-form");
const accountFormIdInput = document.getElementById("account-form-id");
const accountFormNameInput = document.getElementById("account-form-name");
const accountFormEmailInput = document.getElementById("account-form-email");
const accountFormRoleSelect = document.getElementById("account-form-role");
const accountFormActiveSelect = document.getElementById("account-form-active");
const accountFormError = document.getElementById("account-form-error");
const accountFormSubmitButton = document.getElementById("account-form-submit");
const accountFormSelfHint = document.getElementById("account-form-self-hint");

const addAccountButton = document.getElementById("add-account-button");

const accountCreateModal = document.getElementById("account-create-modal");
const accountCreateForm = document.getElementById("account-create-form");
const accountCreateNameInput = document.getElementById("account-create-name");
const accountCreateEmailInput = document.getElementById("account-create-email");
const accountCreatePasswordInput = document.getElementById("account-create-password");
const accountCreateGeneratePasswordButton = document.getElementById("account-create-generate-password");
const accountCreateRoleSelect = document.getElementById("account-create-role");
const accountCreateError = document.getElementById("account-create-error");
const accountCreateSubmitButton = document.getElementById("account-create-submit");

const accountDeleteModal = document.getElementById("account-delete-modal");
const accountDeleteNameEl = document.getElementById("account-delete-name");
const accountDeleteIdInput = document.getElementById("account-delete-id");
const accountDeleteError = document.getElementById("account-delete-error");
const accountDeleteConfirmButton = document.getElementById("account-delete-confirm");

const accountResetPasswordModal = document.getElementById("account-reset-password-modal");
const accountResetPasswordNameEl = document.getElementById("account-reset-password-name");
const accountResetPasswordIdInput = document.getElementById("account-reset-password-id");
const accountResetPasswordError = document.getElementById("account-reset-password-error");
const accountResetPasswordConfirmButton = document.getElementById("account-reset-password-confirm");

const accountCredentialsModal = document.getElementById("account-credentials-modal");
const accountCredentialsMessageEl = document.getElementById("account-credentials-message");
const accountCredentialsValueInput = document.getElementById("account-credentials-value");
const accountCredentialsCopyButton = document.getElementById("account-credentials-copy");

// استدعاء موحّد لـ RPC functions إدارة الحسابات (admin_create_account /
// admin_update_account / admin_reset_password / admin_delete_account) —
// يرجع دائمًا { success, error? , ...data } سواء نجحت العملية أو لأ، حتى
// الاستدعاءات تتعامل مع الأخطاء بنفس الطريقة في كل مكان. كل دالة من هؤلاء
// بتتحقق من إن المستخدم الحالي Super Admin بنفسها جوا قاعدة البيانات — غير
// فقط اعتمادًا على إخفاء الزر في الواجهة.
async function callAccountRpc(fnName, params) {
  try {
    const { data, error } = await supabaseClient.rpc(fnName, params);

    if (error) {
      console.error(fnName + " RPC error:", error);
      return { success: false, error: "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى." };
    }

    if (!data || data.success !== true) {
      return { success: false, error: (data && data.error) || "تعذر تنفيذ العملية." };
    }

    return data;
  } catch (unexpectedError) {
    console.error(fnName + " unexpected error:", unexpectedError);
    return { success: false, error: "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى." };
  }
}

function openAccountCredentialsModal(message, password) {
  accountCredentialsMessageEl.textContent = message;
  accountCredentialsValueInput.value = password;
  accountCredentialsModal.hidden = false;
}

accountCredentialsCopyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(accountCredentialsValueInput.value);
    accountCredentialsCopyButton.innerHTML = "اتنسخت " + icon("check");
    setTimeout(() => {
      accountCredentialsCopyButton.textContent = "نسخ";
    }, 1500);
  } catch (copyError) {
    accountCredentialsValueInput.select();
  }
});

function setAccountsState(message) {
  accountsStateBox.classList.remove("is-rich");
  if (!message) {
    accountsStateBox.hidden = true;
    accountsStateBox.textContent = "";
    return;
  }
  accountsStateBox.hidden = false;
  accountsStateBox.textContent = message;
}

async function loadAccountsList() {
  renderTableSkeleton(accountsTableBody, 5, 6);
  setAccountsState(null);

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, full_name, email, role, is_active, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading accounts:", error);
    setAccountsState("تعذر تحميل الحسابات. يُرجى المحاولة مرة أخرى.");
    return;
  }

  if (!data || data.length === 0) {
    showRichEmptyState(
      accountsStateBox,
      icon("users"),
      "لا توجد حسابات بعد",
      "الحساب الحالي من المفترض أن يكون موجودًا دائمًا هنا — إذا كان الجدول فارغًا فعليًا، جرّب تحديث الصفحة.",
      ""
    );
    return;
  }

  setAccountsState(null);

  accountsTableBody.innerHTML = data
    .map((u) => {
      const roleLabelText = roleLabel(u.role);
      const statusBadge = u.is_active
        ? '<span class="status-badge status-active">مفعّل</span>'
        : '<span class="status-badge status-voided">معطّل</span>';
      const isSelf = currentAuthUser && u.id === currentAuthUser.id;

      const actionsHtml =
        '<button type="button" class="btn-secondary btn-sm account-edit-btn">تعديل</button> ' +
        '<button type="button" class="btn-secondary btn-sm account-reset-password-btn">توليد باسورد</button> ' +
        (isSelf
          ? '<span class="text-muted">(حسابك الحالي)</span>'
          : '<button type="button" class="btn-danger btn-sm account-delete-btn">حذف</button>');

      return (
        "<tr data-account-id=\"" + u.id + "\">" +
        "<td>" + escapeHtml(u.full_name) + "</td>" +
        "<td>" + escapeHtml(u.email) + "</td>" +
        "<td>" + escapeHtml(roleLabelText) + "</td>" +
        "<td>" + statusBadge + "</td>" +
        "<td>" + formatDateTime(u.created_at) + "</td>" +
        '<td class="actions-cell">' + actionsHtml + "</td></tr>"
      );
    })
    .join("");

  accountsTableBody.querySelectorAll(".account-edit-btn").forEach((btn) => {
    const tr = btn.closest("tr");
    const account = data.find((u) => u.id === tr.dataset.accountId);
    const isSelf = currentAuthUser && account.id === currentAuthUser.id;
    btn.addEventListener("click", () => openAccountForm(account, isSelf));
  });

  accountsTableBody.querySelectorAll(".account-reset-password-btn").forEach((btn) => {
    const tr = btn.closest("tr");
    const account = data.find((u) => u.id === tr.dataset.accountId);
    btn.addEventListener("click", () => {
      accountResetPasswordError.hidden = true;
      accountResetPasswordIdInput.value = account.id;
      accountResetPasswordNameEl.textContent = account.full_name;
      accountResetPasswordModal.hidden = false;
    });
  });

  accountsTableBody.querySelectorAll(".account-delete-btn").forEach((btn) => {
    const tr = btn.closest("tr");
    const account = data.find((u) => u.id === tr.dataset.accountId);
    btn.addEventListener("click", () => {
      accountDeleteError.hidden = true;
      accountDeleteIdInput.value = account.id;
      accountDeleteNameEl.textContent = account.full_name;
      accountDeleteModal.hidden = false;
    });
  });
}

// ---------------------------------------------------------------------------
// 13.1b تعديل بيانات الحساب (الاسم / الدور / الحالة) — Super Admin فقط
// الإيميل للقراءة فقط: تعديله من الواجهة يحتاج Admin API غير متاح بأمان
// بالـ anon key، فمُقصود إن هذا غير قابل للتعديل من هنا نهائيًا
// ---------------------------------------------------------------------------

function openAccountForm(account, isSelf) {
  accountFormError.hidden = true;
  accountFormError.textContent = "";

  accountFormIdInput.value = account.id;
  accountFormNameInput.value = account.full_name;
  accountFormEmailInput.value = account.email;
  accountFormRoleSelect.value = account.role;
  accountFormActiveSelect.value = String(account.is_active);

  // تعديل حسابك الشخصي: الاسم فقط قابل للتعديل — الدور والحالة مقفولان
  // لمنع تنزيل صلاحيتك أو تعطيل نفسك بالخطأ (لا يوجد رجوع من الواجهة لو
  // حصل، خصوصًا لو كنت مدير النظام الوحيد في النظام)
  accountFormRoleSelect.disabled = !!isSelf;
  accountFormActiveSelect.disabled = !!isSelf;
  accountFormSelfHint.hidden = !isSelf;

  accountFormModal.hidden = false;
}

accountForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  accountFormError.hidden = true;
  accountFormError.textContent = "";

  const fullName = accountFormNameInput.value.trim();
  const newEmail = accountFormEmailInput.value.trim();
  if (!fullName) {
    accountFormError.textContent = "الاسم الكامل مطلوب.";
    accountFormError.hidden = false;
    return;
  }
  if (!newEmail) {
    accountFormError.textContent = "البريد الإلكتروني مطلوب.";
    accountFormError.hidden = false;
    return;
  }

  accountFormSubmitButton.disabled = true;
  accountFormSubmitButton.textContent = "جارٍ الحفظ...";

  try {
    const result = await callAccountRpc("admin_update_account", {
      p_target_id: accountFormIdInput.value,
      p_full_name: fullName,
      p_email: newEmail,
      p_role: accountFormRoleSelect.value,
      p_is_active: accountFormActiveSelect.value === "true",
    });

    if (!result.success) {
      accountFormError.textContent = result.error;
      accountFormError.hidden = false;
      return;
    }

    accountFormModal.hidden = true;
    loadAccountsList();
  } finally {
    accountFormSubmitButton.disabled = false;
    accountFormSubmitButton.textContent = "حفظ";
  }
});

// ---------------------------------------------------------------------------
// 13.1c إضافة حساب جديد — Super Admin فقط، عبر RPC (admin_create_account)
// ---------------------------------------------------------------------------

addAccountButton.addEventListener("click", () => {
  accountCreateError.hidden = true;
  accountCreateForm.reset();
  accountCreateModal.hidden = false;
});

accountCreateGeneratePasswordButton.addEventListener("click", () => {
  accountCreatePasswordInput.value = generateClientSidePassword(12);
});

function generateClientSidePassword(length) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

accountCreateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  accountCreateError.hidden = true;
  accountCreateError.textContent = "";

  const fullName = accountCreateNameInput.value.trim();
  const email = accountCreateEmailInput.value.trim();
  const password = accountCreatePasswordInput.value;
  const role = accountCreateRoleSelect.value;

  if (!fullName || !email || !password) {
    accountCreateError.textContent = "يجب ملء كل الحقول المطلوبة.";
    accountCreateError.hidden = false;
    return;
  }
  if (password.length < 6) {
    accountCreateError.textContent = "كلمة المرور يجب ألا تقل عن 6 أحرف.";
    accountCreateError.hidden = false;
    return;
  }

  accountCreateSubmitButton.disabled = true;
  accountCreateSubmitButton.textContent = "جارٍ الإنشاء...";

  try {
    const result = await callAccountRpc("admin_create_account", {
      p_full_name: fullName,
      p_email: email,
      p_password: password,
      p_role: role,
    });

    if (!result.success) {
      accountCreateError.textContent = result.error;
      accountCreateError.hidden = false;
      return;
    }

    accountCreateModal.hidden = true;
    loadAccountsList();
    openAccountCredentialsModal(
      "تم إنشاء حساب «" + fullName + "» (" + email + ") بنجاح. يُرجى إبلاغ صاحب الحساب بكلمة المرور هذه بنفسك:",
      password
    );
  } finally {
    accountCreateSubmitButton.disabled = false;
    accountCreateSubmitButton.textContent = "إنشاء الحساب";
  }
});

// ---------------------------------------------------------------------------
// 13.1d حذف حساب نهائيًا — Super Admin فقط، عبر RPC (admin_delete_account)
// ---------------------------------------------------------------------------

accountDeleteConfirmButton.addEventListener("click", async () => {
  accountDeleteError.hidden = true;
  accountDeleteConfirmButton.disabled = true;
  accountDeleteConfirmButton.textContent = "جارٍ الحذف...";

  try {
    const result = await callAccountRpc("admin_delete_account", { p_target_id: accountDeleteIdInput.value });

    if (!result.success) {
      accountDeleteError.textContent = result.error;
      accountDeleteError.hidden = false;
      return;
    }

    accountDeleteModal.hidden = true;
    loadAccountsList();
  } finally {
    accountDeleteConfirmButton.disabled = false;
    accountDeleteConfirmButton.textContent = "تأكيد الحذف";
  }
});

// ---------------------------------------------------------------------------
// 13.1e توليد كلمة مرور جديدة لحساب — Super Admin فقط، عبر RPC
// (admin_reset_password) — التوليد نفسه يحدث جوا قاعدة البيانات، غير هنا
// ---------------------------------------------------------------------------

accountResetPasswordConfirmButton.addEventListener("click", async () => {
  accountResetPasswordError.hidden = true;
  accountResetPasswordConfirmButton.disabled = true;
  accountResetPasswordConfirmButton.textContent = "جارٍ التوليد...";

  try {
    const result = await callAccountRpc("admin_reset_password", { p_target_id: accountResetPasswordIdInput.value });

    if (!result.success) {
      accountResetPasswordError.textContent = result.error;
      accountResetPasswordError.hidden = false;
      return;
    }

    accountResetPasswordModal.hidden = true;
    openAccountCredentialsModal(
      "تم توليد كلمة مرور جديدة لحساب «" + accountResetPasswordNameEl.textContent + "». بلّغ صاحب الحساب بيها بنفسك:",
      result.new_password
    );
  } finally {
    accountResetPasswordConfirmButton.disabled = false;
    accountResetPasswordConfirmButton.textContent = "توليد كلمة مرور جديدة";
  }
});


// ============================================================================
// 14. معالج استيراد Excel (Import Wizard) — مشترك بين السيارات/الوقود/
//     المصروفات. قراءة الملف المرفوع بـ SheetJS، وإنشاء القالب القابل
//     للتحميل بـ ExcelJS (حتى يدعم Data Validation/دروب داون ليست حقيقية
//     داخل الخلية، ميزة غير متاحة في SheetJS المجاني). كل كيان (Entity)
//     بيضيف تعريفه في IMPORT_CONFIGS (قالب + تحقق + إدخال)، والمعالج نفسه
//     (الخطوات الثلاث/المعاينة/التقرير) كود مشترك واحد.
// ============================================================================

const IMPORT_CONFIGS = {};

let importWizardState = {
  entity: null,
  step: 1,
  validatedRows: [],
  rejectedForReport: [],
  isProcessing: false,
  importDone: false,
};

const importWizardModal = document.getElementById("import-wizard-modal");
const importWizardTitle = document.getElementById("import-wizard-title");
const importStep1Desc = document.getElementById("import-step1-desc");
const importDownloadTemplateButton = document.getElementById("import-download-template");
const importFileInput = document.getElementById("import-file-input");
const importPreviewSummary = document.getElementById("import-preview-summary");
const importPreviewTableWrapper = document.getElementById("import-preview-table-wrapper");
const importPreviewThead = document.getElementById("import-preview-thead");
const importPreviewTbody = document.getElementById("import-preview-tbody");
const importPreviewState = document.getElementById("import-preview-state");
const importConfirmSummary = document.getElementById("import-confirm-summary");
const importConfirmError = document.getElementById("import-confirm-error");
const importResultSummary = document.getElementById("import-result-summary");
const importBackButton = document.getElementById("import-back-button");
const importNextButton = document.getElementById("import-next-button");
const importConfirmButton = document.getElementById("import-confirm-button");
const importDoneButton = document.getElementById("import-done-button");
const importDownloadRejectedButton = document.getElementById("import-download-rejected");
const importStepPanels = {
  1: document.getElementById("import-step-1"),
  2: document.getElementById("import-step-2"),
  3: document.getElementById("import-step-3"),
};
const importStepIndicators = importWizardModal.querySelectorAll("[data-wizard-step]");

function normalizeImportKey(value) {
  return String(value || "").trim().toLowerCase();
}

// قراءة ملف Excel المرفوع كمصفوفة كائنات (كل صف = كائن بمفاتيح = رؤوس
// الأعمدة)، مع تحويل خلايا التاريخ تلقائيًا لكائنات Date حقيقية
function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          resolve([]);
          return;
        }
        const sheet = workbook.Sheets[firstSheetName];
        resolve(XLSX.utils.sheet_to_json(sheet, { defval: "" }));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error || new Error("تعذرت قراءة الملف."));
    reader.readAsArrayBuffer(file);
  });
}

// إنشاء قالب Excel بـ ExcelJS (بدل SheetJS) حتى نقدر نضيف Data Validation
// حقيقية (دروب داون ليست فعلي داخل الخلية) — ميزة غير متاحة في SheetJS
// المجاني. columnValidations اختياري: { "اسم العمود": ["قيمة1", "قيمة2", ...] }
async function downloadExcelTemplate(headers, filename, columnValidations) {
  columnValidations = columnValidations || {};

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Template", { views: [{ rightToLeft: true }] });

  worksheet.addRow(headers);
  worksheet.getRow(1).font = { bold: true };
  worksheet.columns = headers.map((h) => ({ width: Math.max(18, h.length + 4) }));

  const TEMPLATE_DATA_ROWS = 500; // نطاق كافٍ لأي استيراد عملي

  headers.forEach((header, index) => {
    const options = columnValidations[header];
    if (!options) return;

    const colLetter = worksheet.getColumn(index + 1).letter;
    let validation = null;

    if (Array.isArray(options)) {
      // دروب داون ليست (قائمة قيم مسموحة، مثل "الحالة" أو "الفئة")
      if (!options.length) return;
      validation = {
        type: "list",
        allowBlank: true,
        formulae: ['"' + options.join(",") + '"'],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "قيمة غير موجودة في القائمة",
        error: "يُفضَّل اختيار قيمة من القائمة المنسدلة لضمان قبول الصف أثناء الاستيراد.",
      };
    } else if (options.type === "date") {
      // خلية تاريخ: تنسيق عرض بصيغة تاريخ + تحقق إن القيمة تاريخ صحيح
      // (اختياري تمامًا، لا يوجد رفض لو الخلية فارغة)
      worksheet.getColumn(index + 1).numFmt = "yyyy-mm-dd";
      validation = {
        type: "date",
        operator: "between",
        allowBlank: true,
        formulae: [new Date(2000, 0, 1), new Date(2100, 11, 31)],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "تاريخ غير صالح",
        error: "من فضلك أدخل تاريخًا صحيحًا، أو اترك الخلية فارغة (هذا الحقل اختياري).",
      };
    }

    if (!validation) return;

    for (let rowNum = 2; rowNum <= TEMPLATE_DATA_ROWS + 1; rowNum++) {
      worksheet.getCell(colLetter + rowNum).dataValidation = validation;
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast("تم تنزيل القالب بنجاح.", "success");
}

// تحويل قيمة تاريخ (Date حقيقي من Excel، أو نص) لصيغة YYYY-MM-DD المطلوبة
// لأعمدة date في قاعدة البيانات — تُرجع "" لو التاريخ غير قابل للتحويل
function excelDateToIsoString(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return "";
}

function openImportWizard(entityKey) {
  const config = IMPORT_CONFIGS[entityKey];
  if (!config) return;

  importWizardState = {
    entity: entityKey,
    step: 1,
    validatedRows: [],
    rejectedForReport: [],
    isProcessing: false,
    importDone: false,
  };

  importWizardTitle.textContent = config.title;
  importStep1Desc.textContent = config.step1Desc;

  importFileInput.value = "";
  importPreviewSummary.hidden = true;
  importPreviewSummary.innerHTML = "";
  importPreviewTableWrapper.hidden = true;
  importPreviewThead.innerHTML = "";
  importPreviewTbody.innerHTML = "";
  importPreviewState.hidden = true;
  importConfirmSummary.innerHTML = "";
  importConfirmError.hidden = true;
  importConfirmError.textContent = "";
  importConfirmButton.textContent = "تأكيد الاستيراد";
  importConfirmButton.disabled = false;
  importResultSummary.hidden = true;
  importResultSummary.innerHTML = "";
  importDownloadRejectedButton.hidden = true;
  importDoneButton.hidden = true;

  showImportWizardStep(1);
  importWizardModal.hidden = false;
}

function showImportWizardStep(step) {
  importWizardState.step = step;

  Object.keys(importStepPanels).forEach((key) => {
    importStepPanels[key].hidden = Number(key) !== step;
  });

  importStepIndicators.forEach((el) => {
    const n = Number(el.dataset.wizardStep);
    el.classList.toggle("active", n === step);
    el.classList.toggle("completed", n < step);
  });

  importBackButton.hidden = step === 1 || importWizardState.importDone;
  importNextButton.hidden = step === 3;

  if (step === 2) {
    const validCount = importWizardState.validatedRows.filter((r) => r.status === "valid").length;
    importNextButton.disabled = validCount === 0;
  } else {
    importNextButton.disabled = false;
  }

  if (step === 3 && !importWizardState.importDone) {
    renderImportConfirmSummary();
  }
}

importDownloadTemplateButton.addEventListener("click", async () => {
  const config = IMPORT_CONFIGS[importWizardState.entity];
  if (!config) return;

  importDownloadTemplateButton.disabled = true;
  const originalLabel = importDownloadTemplateButton.textContent;
  importDownloadTemplateButton.textContent = "جارٍ التحضير...";

  try {
    const validations =
      typeof config.templateColumnValidations === "function"
        ? await config.templateColumnValidations()
        : config.templateColumnValidations || {};
    await downloadExcelTemplate(config.templateHeaders, config.templateFilename, validations);
  } catch (err) {
    console.error("Error generating template:", err);
    alert("تعذر إنشاء القالب. يُرجى المحاولة مرة أخرى.");
  } finally {
    importDownloadTemplateButton.disabled = false;
    importDownloadTemplateButton.textContent = originalLabel;
  }
});

importFileInput.addEventListener("change", async () => {
  const file = importFileInput.files[0];
  if (!file) return;

  const config = IMPORT_CONFIGS[importWizardState.entity];
  importPreviewSummary.hidden = true;
  importPreviewTableWrapper.hidden = true;
  importPreviewState.hidden = false;
  importPreviewState.textContent = "جارٍ قراءة الملف والتحقق من البيانات...";
  importNextButton.disabled = true;

  try {
    const rawRows = await parseExcelFile(file);

    if (!rawRows.length) {
      importPreviewState.textContent = "الملف فارغ أو لا يحتوي على أي صفوف بيانات. تأكد من تعبئة القالب بشكل صحيح.";
      importWizardState.validatedRows = [];
      return;
    }

    const firstRowKeys = Object.keys(rawRows[0] || {});
    const missingHeaders = config.templateHeaders.filter((h) => !firstRowKeys.includes(h));
    if (missingHeaders.length > 0) {
      importPreviewState.textContent =
        "الملف المرفوع لا يطابق صيغة القالب. الأعمدة الناقصة: " + missingHeaders.join("، ") + " — يُرجى تحميل القالب من الخطوة الأولى واستخدامه.";
      importWizardState.validatedRows = [];
      return;
    }

    const validatedRows = await config.validate(rawRows);
    importWizardState.validatedRows = validatedRows;
    renderImportPreview(config, validatedRows);
  } catch (err) {
    console.error("Error parsing/validating import file:", err);
    importPreviewState.hidden = false;
    importPreviewState.textContent =
      err && err.message ? err.message : "حدث خطأ أثناء قراءة الملف. تأكد إنه ملف Excel صالح (.xlsx/.xls).";
    importWizardState.validatedRows = [];
  }
});

function renderImportPreview(config, validatedRows) {
  const validCount = validatedRows.filter((r) => r.status === "valid").length;
  const duplicateCount = validatedRows.filter((r) => r.status === "duplicate").length;
  const errorCount = validatedRows.filter((r) => r.status === "error").length;

  importPreviewState.hidden = true;
  importPreviewSummary.hidden = false;
  importPreviewSummary.innerHTML =
    '<span class="import-preview-summary-item is-valid">' + icon("check") + " " + validCount + " صف صالح</span>" +
    '<span class="import-preview-summary-item is-duplicate">' + icon("warningTriangle") + " " + duplicateCount + " صف مكرر</span>" +
    '<span class="import-preview-summary-item is-error">' + icon("cross") + " " + errorCount + " صف به أخطاء</span>";

  importPreviewTableWrapper.hidden = false;
  importPreviewThead.innerHTML =
    "<tr>" + config.templateHeaders.map((h) => "<th>" + escapeHtml(h) + "</th>").join("") + "<th>الحالة</th></tr>";

  importPreviewTbody.innerHTML = validatedRows
    .map((row) => {
      const rowClass =
        row.status === "valid" ? "import-row-valid" : row.status === "duplicate" ? "import-row-duplicate" : "import-row-error";
      const badgeClass =
        row.status === "valid" ? "status-active" : row.status === "duplicate" ? "status-exhausted" : "status-out_of_service";
      const badgeLabel = row.status === "valid" ? "صالح" : row.status === "duplicate" ? "مكرر" : "به خطأ";

      const cells = config.templateHeaders
        .map((h) => {
          const v = row.raw[h];
          return "<td>" + escapeHtml(v !== undefined && v !== null ? String(v) : "") + "</td>";
        })
        .join("");

      const statusCell =
        '<td><span class="status-badge ' + badgeClass + '">' + badgeLabel + "</span>" +
        (row.reason ? '<div class="import-row-reason">' + escapeHtml(row.reason) + "</div>" : "") +
        "</td>";

      return '<tr class="' + rowClass + '">' + cells + statusCell + "</tr>";
    })
    .join("");

  importNextButton.disabled = validCount === 0;
}

async function renderImportConfirmSummary() {
  const config = IMPORT_CONFIGS[importWizardState.entity];
  const validRows = importWizardState.validatedRows.filter((r) => r.status === "valid");
  const duplicateCount = importWizardState.validatedRows.filter((r) => r.status === "duplicate").length;
  const errorCount = importWizardState.validatedRows.filter((r) => r.status === "error").length;

  importConfirmSummary.textContent =
    "سيتم إدخال " + validRows.length + " صف صالح كـ" + config.entityLabelPlural + " جديدة." +
    (duplicateCount || errorCount
      ? " (" + duplicateCount + " مكرر، " + errorCount + " به أخطاء — سيتم تجاهلها، ويمكنك تحميل تقرير بها بعد الاستيراد.)"
      : "");

  importConfirmError.hidden = true;
  importConfirmError.textContent = "";
  importConfirmButton.hidden = false;
  importConfirmButton.disabled = validRows.length === 0;

  if (config.preConfirmCheck) {
    const check = await config.preConfirmCheck(validRows);
    if (!check.ok) {
      importConfirmButton.hidden = true;
      importConfirmButton.disabled = true;
      importConfirmError.textContent = check.message;
      importConfirmError.hidden = false;
    }
  }
}

importConfirmButton.addEventListener("click", async () => {
  const config = IMPORT_CONFIGS[importWizardState.entity];
  const validRows = importWizardState.validatedRows.filter((r) => r.status === "valid");
  if (!validRows.length || importWizardState.isProcessing) return;

  importWizardState.isProcessing = true;
  importConfirmButton.disabled = true;
  importConfirmButton.textContent = "جارٍ الإدخال...";
  importConfirmError.hidden = true;

  let successCount = 0;
  const failedRows = [];

  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i];
    importConfirmSummary.textContent = "جارٍ إدخال الصف " + (i + 1) + " من " + validRows.length + "...";
    try {
      const { error } = await config.insertOne(row.payload);
      if (error) {
        console.error("Import row insert error:", error);
        failedRows.push({ ...row, status: "error", reason: "فشل الإدخال: " + error.message });
      } else {
        successCount++;
      }
    } catch (unexpectedError) {
      console.error("Unexpected import row insert error:", unexpectedError);
      failedRows.push({ ...row, status: "error", reason: "تعذر الاتصال بالخادم أثناء إدخال هذا الصف." });
    }
  }

  importWizardState.isProcessing = false;
  importWizardState.importDone = true;

  const preExistingRejected = importWizardState.validatedRows.filter((r) => r.status !== "valid");
  importWizardState.rejectedForReport = [...preExistingRejected, ...failedRows];

  importConfirmButton.hidden = true;
  importBackButton.hidden = true;
  importDoneButton.hidden = false;
  importConfirmSummary.textContent = "";
  importResultSummary.hidden = false;
  importResultSummary.innerHTML =
    '<div class="import-result-summary">' +
    '<span class="import-preview-summary-item is-valid">' + icon("check") + " تم إدخال " + successCount + " بنجاح</span>" +
    (failedRows.length
      ? '<span class="import-preview-summary-item is-error">' + icon("cross") + " فشل إدخال " + failedRows.length + " صف أثناء الحفظ</span>"
      : "") +
    "</div>";

  if (importWizardState.rejectedForReport.length) {
    importDownloadRejectedButton.hidden = false;
  }

  if (config.afterImport) config.afterImport(successCount);
});

importNextButton.addEventListener("click", () => {
  if (importWizardState.step < 3) showImportWizardStep(importWizardState.step + 1);
});

importBackButton.addEventListener("click", () => {
  if (importWizardState.step > 1) showImportWizardStep(importWizardState.step - 1);
});

importDoneButton.addEventListener("click", () => {
  importWizardModal.hidden = true;
});

importDownloadRejectedButton.addEventListener("click", () => {
  const config = IMPORT_CONFIGS[importWizardState.entity];
  const rejected = importWizardState.rejectedForReport.length
    ? importWizardState.rejectedForReport
    : importWizardState.validatedRows.filter((r) => r.status !== "valid");
  if (!rejected.length) return;

  const headers = [...config.templateHeaders, "سبب الرفض"];
  const rows = rejected.map((r) => [
    ...config.templateHeaders.map((h) => (r.raw[h] !== undefined && r.raw[h] !== null ? r.raw[h] : "")),
    r.reason,
  ]);
  exportRowsToCSV(config.rejectedReportFilename, headers, rows);
});

// ---------------------------------------------------------------------------
// 15.1 استيراد السيارات — تحقق من التكرار (داخل الملف وضد قاعدة البيانات)
//      وصحة سنة الصنع/الحالة، مطابق تمامًا لقواعد نموذج الإضافة اليدوية
// ---------------------------------------------------------------------------

async function validateVehiclesImportRows(rawRows) {
  const { data: existing, error } = await supabaseClient.from("vehicles").select("license_plate");
  if (error) {
    console.error("Error loading existing vehicles for import validation:", error);
    throw new Error("تعذر التحقق من السيارات الموجودة حاليًا في النظام. يُرجى المحاولة مرة أخرى.");
  }

  const existingPlates = new Set((existing || []).map((v) => normalizeImportKey(v.license_plate)));
  const seenPlatesInFile = new Set();

  const statusLabelToKey = {};
  Object.entries(VEHICLE_STATUS_LABELS).forEach(([key, label]) => {
    statusLabelToKey[label] = key;
  });

  return rawRows.map((raw, index) => {
    const rowNumber = index + 2; // +2: الصف 1 في Excel هو رأس الأعمدة
    const licensePlate = String(raw["رقم اللوحة"] || "").trim();
    const make = String(raw["الماركة"] || "").trim();
    const yearRaw = raw["سنة الصنع"];
    const actualUserNationalId = String(raw["رقم هوية المستخدم الفعلي"] || "").trim();
    const actualUserName = String(raw["اسم المستخدم الفعلي"] || "").trim();
    const authorizationExpiryRaw = raw["تفويض حتى (اختياري)"];
    const statusLabelRaw = String(raw["الحالة"] || "").trim();

    if (!licensePlate) {
      return { rowNumber, raw, status: "error", reason: "رقم اللوحة حقل مطلوب." };
    }

    const plateKey = normalizeImportKey(licensePlate);

    if (existingPlates.has(plateKey)) {
      return { rowNumber, raw, status: "duplicate", reason: "رقم اللوحة موجود بالفعل في النظام." };
    }
    if (seenPlatesInFile.has(plateKey)) {
      return { rowNumber, raw, status: "duplicate", reason: "رقم اللوحة مكرر داخل الملف نفسه." };
    }

    let manufacturingYear = null;
    if (yearRaw !== undefined && yearRaw !== "" && yearRaw !== null) {
      manufacturingYear = Number(yearRaw);
      const maxYear = new Date().getFullYear() + 1;
      if (Number.isNaN(manufacturingYear) || manufacturingYear < 1950 || manufacturingYear > maxYear) {
        return { rowNumber, raw, status: "error", reason: "سنة الصنع غير صالحة (يجب أن تكون بين 1950 و" + maxYear + ")." };
      }
    }

    // رقم الهوية الوطنية (يبدأ بـ 1) أو الإقامة (يبدأ بـ 2) — 10 أرقام بالظبط
    if (actualUserNationalId && !/^[12]\d{9}$/.test(actualUserNationalId)) {
      return {
        rowNumber,
        raw,
        status: "error",
        reason: "رقم هوية المستخدم الفعلي يجب أن يكون 10 أرقام بالضبط ويبدأ بـ 1 أو 2.",
      };
    }

    // إذا لم تكن "الحالة" محددة صراحةً: إذا وُجد اسم مستخدم فعلي، فمن الواضح
    // أن السيارة مستخدمة فعليًا فمنطقيًا ليست "متاحة" — يصبح الافتراضي "نشطة" بدل
    // "متاحة". إذا لم يوجد اسم أصلاً، تظل "متاحة" كما كانت (بدون تغيير)
    let status = actualUserName ? "active" : "available";
    if (statusLabelRaw) {
      const mapped =
        statusLabelToKey[statusLabelRaw] ||
        (Object.prototype.hasOwnProperty.call(VEHICLE_STATUS_LABELS, statusLabelRaw) ? statusLabelRaw : null);
      if (!mapped) {
        return { rowNumber, raw, status: "error", reason: 'قيمة الحالة غير معروفة ("' + statusLabelRaw + '").' };
      }
      status = mapped;
    }

    // تاريخ التفويض اختياري تمامًا — لو فارغ أو غير قابل للفهم بيتسجل
    // "بدون تاريخ محدد" (يعني مستخدم فعلي مستمر)، من غير ما يرفض الصف
    const authorizationExpiryDate = excelDateToIsoString(authorizationExpiryRaw) || null;

    seenPlatesInFile.add(plateKey);

    return {
      rowNumber,
      raw,
      status: "valid",
      reason: "",
      payload: {
        license_plate: licensePlate,
        make: make || null,
        manufacturing_year: manufacturingYear,
        actual_user_name: actualUserName || null,
        actual_user_national_id: actualUserNationalId || null,
        authorization_expiry_date: authorizationExpiryDate,
        status,
        created_by: currentAuthUser ? currentAuthUser.id : null,
      },
    };
  });
}

IMPORT_CONFIGS.vehicles = {
  title: "استيراد السيارات من Excel",
  entityLabelPlural: "سيارة",
  templateHeaders: [
    "رقم اللوحة",
    "الماركة",
    "سنة الصنع",
    "رقم هوية المستخدم الفعلي",
    "اسم المستخدم الفعلي",
    "تفويض حتى (اختياري)",
    "الحالة",
  ],
  templateFilename: "قالب-استيراد-السيارات.xlsx",
  rejectedReportFilename: "صفوف-مرفوضة-السيارات.csv",
  step1Desc:
    "حمِّل القالب واملأه ببيانات السيارات المطلوب إضافتها (رقم اللوحة مطلوب، والباقي اختياري). يحتوي عمود \"الحالة\" على قائمة منسدلة بالقيم المسموح بها — اختر منها بدلًا من كتابتها يدويًا. اترك عمود \"تفويض حتى\" فارغًا إذا لم يوجد تاريخ نهاية محدد للتفويض (سيُسجَّل تلقائيًا \"مستخدم فعلي\" مستمر)، ثم ارفع الملف في الخطوة التالية.",
  templateColumnValidations: {
    "الحالة": Object.values(VEHICLE_STATUS_LABELS),
    "تفويض حتى (اختياري)": { type: "date" },
  },
  validate: validateVehiclesImportRows,
  insertOne: (payload) => supabaseClient.from("vehicles").insert(payload),
  afterImport: () => loadVehicles(),
};

const importVehiclesButton = document.getElementById("import-vehicles-button");
importVehiclesButton.addEventListener("click", () => openImportWizard("vehicles"));

// ---------------------------------------------------------------------------
// 14.2 استيراد الوقود — تحقق من وجود رقم اللوحة فعليًا في النظام، وصحة
//      اللترات/التكلفة/التاريخ، مطابق تمامًا لقواعد نموذج الإضافة اليدوية
// ---------------------------------------------------------------------------

async function validateFuelImportRows(rawRows) {
  const { data: vehicles, error } = await supabaseClient.from("vehicles").select("id, license_plate");
  if (error) {
    console.error("Error loading vehicles for fuel import validation:", error);
    throw new Error("تعذر التحقق من السيارات الموجودة حاليًا في النظام. يُرجى المحاولة مرة أخرى.");
  }

  const vehicleMap = {};
  (vehicles || []).forEach((v) => {
    vehicleMap[normalizeImportKey(v.license_plate)] = v.id;
  });

  return rawRows.map((raw, index) => {
    const rowNumber = index + 2;
    const licensePlate = String(raw["رقم اللوحة"] || "").trim();
    const dateRaw = raw["التاريخ"];
    const litersRaw = raw["اللترات"];
    const amountRaw = raw["التكلفة (SAR)"];

    if (!licensePlate) {
      return { rowNumber, raw, status: "error", reason: "رقم اللوحة مطلوب." };
    }

    const vehicleId = vehicleMap[normalizeImportKey(licensePlate)];
    if (!vehicleId) {
      return { rowNumber, raw, status: "error", reason: "رقم لوحة غير موجود في النظام." };
    }

    const transactionDate = excelDateToIsoString(dateRaw);
    if (!transactionDate) {
      return { rowNumber, raw, status: "error", reason: "التاريخ غير صالح." };
    }

    const liters = Number(litersRaw);
    if (litersRaw === "" || litersRaw === null || litersRaw === undefined || Number.isNaN(liters) || liters <= 0) {
      return { rowNumber, raw, status: "error", reason: "اللترات يجب أن تكون رقمًا أكبر من صفر." };
    }

    const amount = Number(amountRaw);
    if (amountRaw === "" || amountRaw === null || amountRaw === undefined || Number.isNaN(amount) || amount < 0) {
      return { rowNumber, raw, status: "error", reason: "التكلفة يجب أن تكون رقمًا ولا تكون سالبة." };
    }

    return {
      rowNumber,
      raw,
      status: "valid",
      reason: "",
      payload: {
        vehicle_id: vehicleId,
        transaction_date: transactionDate,
        liters,
        amount,
        created_by: currentAuthUser ? currentAuthUser.id : null,
      },
    };
  });
}

IMPORT_CONFIGS.fuel = {
  title: "استيراد معاملات الوقود من Excel",
  entityLabelPlural: "معاملة وقود",
  templateHeaders: ["رقم اللوحة", "التاريخ", "اللترات", "التكلفة (SAR)"],
  templateFilename: "قالب-استيراد-الوقود.xlsx",
  rejectedReportFilename: "صفوف-مرفوضة-الوقود.csv",
  step1Desc:
    "حمِّل القالب واملأه ببيانات معاملات الوقود المطلوب إضافتها (رقم اللوحة، التاريخ، اللترات، التكلفة). يجب أن يكون رقم اللوحة موجودًا بالفعل في النظام، ثم ارفع الملف في الخطوة التالية.",
  validate: validateFuelImportRows,
  insertOne: (payload) => supabaseClient.from("fuel_transactions").insert(payload),
  afterImport: () => loadFuelTransactions(),
};

const importFuelButton = document.getElementById("import-fuel-button");
importFuelButton.addEventListener("click", () => openImportWizard("fuel"));

// ---------------------------------------------------------------------------
// 14.1b استيراد اللابتوبات — تحقق من عدم تكرار الرقم التسلسلي (داخل الملف
//       وضد قاعدة البيانات)، مطابق تمامًا لقواعد نموذج الإضافة اليدوية
// ---------------------------------------------------------------------------

const YES_LABEL_VALUES = ["نعم", "yes", "y", "1", "true"];

function parseYesNoValue(raw) {
  const normalized = String(raw || "").trim().toLowerCase();
  return YES_LABEL_VALUES.includes(normalized);
}

async function validateLaptopImportRows(rawRows) {
  const { data: existing, error } = await supabaseClient
    .from("it_laptop_assignments")
    .select("serial_number")
    .eq("status", "active");
  if (error) {
    console.error("Error loading existing laptops for import validation:", error);
    throw new Error("تعذر التحقق من اللابتوبات الموجودة حاليًا في النظام. يُرجى المحاولة مرة أخرى.");
  }

  const existingSerials = new Set((existing || []).map((a) => normalizeImportKey(a.serial_number)));
  const seenSerialsInFile = new Set();

  return rawRows.map((raw, index) => {
    const rowNumber = index + 2; // +2: الصف 1 في Excel هو رأس الأعمدة
    const staffId = String(raw["الرقم الوظيفي"] || "").trim();
    const staffName = String(raw["اسم الموظف"] || "").trim();
    const serialNumber = String(raw["الرقم التسلسلي"] || "").trim();
    const assetTag = String(raw["رقم العهدة"] || "").trim();
    const antivirusRaw = raw["مضاد الفيروسات (نعم/لا)"];
    const jobPosition = String(raw["المسمى الوظيفي"] || "").trim();
    const staffLocation = String(raw["الموقع"] || "").trim();

    if (!staffName) {
      return { rowNumber, raw, status: "error", reason: "اسم الموظف حقل مطلوب." };
    }
    if (!serialNumber) {
      return { rowNumber, raw, status: "error", reason: "الرقم التسلسلي حقل مطلوب." };
    }

    const serialKey = normalizeImportKey(serialNumber);

    if (existingSerials.has(serialKey)) {
      return { rowNumber, raw, status: "duplicate", reason: "الرقم التسلسلي موجود بالفعل في النظام." };
    }
    if (seenSerialsInFile.has(serialKey)) {
      return { rowNumber, raw, status: "duplicate", reason: "الرقم التسلسلي مكرر داخل الملف نفسه." };
    }

    seenSerialsInFile.add(serialKey);

    return {
      rowNumber,
      raw,
      status: "valid",
      reason: "",
      payload: {
        staff_id: staffId || null,
        staff_name: staffName,
        serial_number: serialNumber,
        asset_tag: assetTag || null,
        antivirus_licensed: parseYesNoValue(antivirusRaw),
        job_position: jobPosition || null,
        staff_location: staffLocation || null,
        created_by: currentAuthUser ? currentAuthUser.id : null,
      },
    };
  });
}

IMPORT_CONFIGS.laptops = {
  title: "استيراد اللابتوبات من Excel",
  entityLabelPlural: "لابتوب",
  templateHeaders: [
    "الرقم الوظيفي",
    "اسم الموظف",
    "الرقم التسلسلي",
    "رقم العهدة",
    "مضاد الفيروسات (نعم/لا)",
    "المسمى الوظيفي",
    "الموقع",
  ],
  templateFilename: "قالب-استيراد-اللابتوبات.xlsx",
  rejectedReportFilename: "صفوف-مرفوضة-اللابتوبات.csv",
  step1Desc:
    "حمِّل القالب واملأه ببيانات اللابتوبات المطلوب إضافتها (اسم الموظف والرقم التسلسلي مطلوبان، والباقي اختياري). يحتوي عمود \"مضاد الفيروسات\" على قائمة منسدلة (نعم/لا) — اختر منها بدلًا من كتابتها يدويًا، ثم ارفع الملف في الخطوة التالية.",
  templateColumnValidations: {
    "مضاد الفيروسات (نعم/لا)": ["نعم", "لا"],
  },
  validate: validateLaptopImportRows,
  insertOne: (payload) => supabaseClient.from("it_laptop_assignments").insert(payload),
  afterImport: () => loadLaptopAssignments(),
};

importLaptopsButton.addEventListener("click", () => openImportWizard("laptops"));

// ---------------------------------------------------------------------------
// 14.1c استيراد البريد الإلكتروني — تحقق من عدم تكرار العنوان (داخل الملف
//       وضد قاعدة البيانات) وصحة صيغته، مطابق تمامًا لقواعد نموذج الإضافة اليدوية
// ---------------------------------------------------------------------------

const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function validateEmailImportRows(rawRows) {
  const { data: existing, error } = await supabaseClient
    .from("it_email_assignments")
    .select("email_address")
    .eq("status", "active");
  if (error) {
    console.error("Error loading existing email assignments for import validation:", error);
    throw new Error("تعذر التحقق من البريدات الإلكترونية الموجودة حاليًا في النظام. يُرجى المحاولة مرة أخرى.");
  }

  const existingEmails = new Set((existing || []).map((a) => normalizeImportKey(a.email_address)));
  const seenEmailsInFile = new Set();

  return rawRows.map((raw, index) => {
    const rowNumber = index + 2; // +2: الصف 1 في Excel هو رأس الأعمدة
    const staffId = String(raw["الرقم الوظيفي"] || "").trim();
    const staffName = String(raw["اسم الموظف"] || "").trim();
    const emailAddress = String(raw["البريد الإلكتروني"] || "").trim();
    const jobPosition = String(raw["المسمى الوظيفي"] || "").trim();
    const staffLocation = String(raw["الموقع"] || "").trim();

    if (!staffName) {
      return { rowNumber, raw, status: "error", reason: "اسم الموظف حقل مطلوب." };
    }
    if (!emailAddress) {
      return { rowNumber, raw, status: "error", reason: "البريد الإلكتروني حقل مطلوب." };
    }
    if (!EMAIL_FORMAT_REGEX.test(emailAddress)) {
      return { rowNumber, raw, status: "error", reason: "صيغة البريد الإلكتروني غير صحيحة." };
    }

    const emailKey = normalizeImportKey(emailAddress);

    if (existingEmails.has(emailKey)) {
      return { rowNumber, raw, status: "duplicate", reason: "البريد الإلكتروني موجود بالفعل في النظام." };
    }
    if (seenEmailsInFile.has(emailKey)) {
      return { rowNumber, raw, status: "duplicate", reason: "البريد الإلكتروني مكرر داخل الملف نفسه." };
    }

    seenEmailsInFile.add(emailKey);

    return {
      rowNumber,
      raw,
      status: "valid",
      reason: "",
      payload: {
        staff_id: staffId || null,
        staff_name: staffName,
        email_address: emailAddress,
        job_position: jobPosition || null,
        staff_location: staffLocation || null,
        created_by: currentAuthUser ? currentAuthUser.id : null,
      },
    };
  });
}

IMPORT_CONFIGS.email = {
  title: "استيراد البريد الإلكتروني من Excel",
  entityLabelPlural: "بريد إلكتروني",
  templateHeaders: ["الرقم الوظيفي", "اسم الموظف", "البريد الإلكتروني", "المسمى الوظيفي", "الموقع"],
  templateFilename: "قالب-استيراد-البريد-الإلكتروني.xlsx",
  rejectedReportFilename: "صفوف-مرفوضة-البريد-الإلكتروني.csv",
  step1Desc:
    "حمِّل القالب واملأه ببيانات البريد الإلكتروني المطلوب إضافتها (اسم الموظف والبريد الإلكتروني مطلوبان، والباقي اختياري)، ثم ارفع الملف في الخطوة التالية.",
  validate: validateEmailImportRows,
  insertOne: (payload) => supabaseClient.from("it_email_assignments").insert(payload),
  afterImport: () => loadEmailAssignments(),
};

importEmailButton.addEventListener("click", () => openImportWizard("email"));

// ---------------------------------------------------------------------------
// 14.1d استيراد أرقام الجوال — تحقق من عدم تكرار الرقم (داخل الملف وضد قاعدة
//       البيانات)، مطابق تمامًا لقواعد نموذج الإضافة اليدوية. ملحوظة: إكسل
//       بيخزّن رقم الجوال كرقم فبيشيل الصفر الأول (مثلاً 0557215469 بتتسجل
//       557215469) — فبنرجّعه تلقائيًا لو الرقم طلع 9 خانات بالظبط
// ---------------------------------------------------------------------------

function normalizeSaudiMobileNumber(raw) {
  let digits = String(raw || "").trim();
  // إكسل يُرجع الأرقام كـ float أحيانًا (مثلاً "557215469.0")
  digits = digits.replace(/\.0$/, "").replace(/\D/g, "");
  if (digits.length === 9 && digits[0] !== "0") {
    digits = "0" + digits;
  }
  return digits;
}

async function validateSimImportRows(rawRows) {
  const { data: existing, error } = await supabaseClient
    .from("it_sim_assignments")
    .select("mobile_number")
    .eq("status", "active");
  if (error) {
    console.error("Error loading existing SIM assignments for import validation:", error);
    throw new Error("تعذر التحقق من أرقام الجوال الموجودة حاليًا في النظام. يُرجى المحاولة مرة أخرى.");
  }

  const existingNumbers = new Set((existing || []).map((a) => normalizeImportKey(a.mobile_number)));
  const seenNumbersInFile = new Set();

  return rawRows.map((raw, index) => {
    const rowNumber = index + 2; // +2: الصف 1 في Excel هو رأس الأعمدة
    const staffId = String(raw["الرقم الوظيفي"] || "").trim();
    const staffName = String(raw["اسم الموظف"] || "").trim();
    const mobileNumber = normalizeSaudiMobileNumber(raw["رقم الجوال"]);
    const jobPosition = String(raw["المسمى الوظيفي"] || "").trim();
    const staffLocation = String(raw["الموقع"] || "").trim();

    if (!staffName) {
      return { rowNumber, raw, status: "error", reason: "اسم الموظف حقل مطلوب." };
    }
    if (!mobileNumber) {
      return { rowNumber, raw, status: "error", reason: "رقم الجوال حقل مطلوب." };
    }

    const numberKey = normalizeImportKey(mobileNumber);

    if (existingNumbers.has(numberKey)) {
      return { rowNumber, raw, status: "duplicate", reason: "رقم الجوال موجود بالفعل في النظام." };
    }
    if (seenNumbersInFile.has(numberKey)) {
      return { rowNumber, raw, status: "duplicate", reason: "رقم الجوال مكرر داخل الملف نفسه." };
    }

    seenNumbersInFile.add(numberKey);

    return {
      rowNumber,
      raw,
      status: "valid",
      reason: "",
      payload: {
        staff_id: staffId || null,
        staff_name: staffName,
        mobile_number: mobileNumber,
        job_position: jobPosition || null,
        staff_location: staffLocation || null,
        created_by: currentAuthUser ? currentAuthUser.id : null,
      },
    };
  });
}

IMPORT_CONFIGS.sim = {
  title: "استيراد أرقام الجوال من Excel",
  entityLabelPlural: "رقم جوال",
  templateHeaders: ["الرقم الوظيفي", "اسم الموظف", "رقم الجوال", "المسمى الوظيفي", "الموقع"],
  templateFilename: "قالب-استيراد-أرقام-الجوال.xlsx",
  rejectedReportFilename: "صفوف-مرفوضة-أرقام-الجوال.csv",
  step1Desc:
    "حمِّل القالب واملأه ببيانات أرقام الجوال المطلوب إضافتها (اسم الموظف ورقم الجوال مطلوبان، والباقي اختياري)، ثم ارفع الملف في الخطوة التالية.",
  validate: validateSimImportRows,
  insertOne: (payload) => supabaseClient.from("it_sim_assignments").insert(payload),
  afterImport: () => loadSimAssignments(),
};

importSimButton.addEventListener("click", () => openImportWizard("sim"));

// ---------------------------------------------------------------------------
// 14.1e استيراد الأجهزة اللوحية — تحقق من عدم تكرار الرقم التسلسلي (داخل
//       الملف وضد قاعدة البيانات)، مطابق تمامًا لقواعد نموذج الإضافة اليدوية
// ---------------------------------------------------------------------------

async function validateTabletImportRows(rawRows) {
  const { data: existing, error } = await supabaseClient
    .from("it_tablet_assignments")
    .select("serial_number")
    .eq("status", "active");
  if (error) {
    console.error("Error loading existing tablets for import validation:", error);
    throw new Error("تعذر التحقق من الأجهزة اللوحية الموجودة حاليًا في النظام. يُرجى المحاولة مرة أخرى.");
  }

  const existingSerials = new Set((existing || []).map((a) => normalizeImportKey(a.serial_number)));
  const seenSerialsInFile = new Set();

  return rawRows.map((raw, index) => {
    const rowNumber = index + 2; // +2: الصف 1 في Excel هو رأس الأعمدة
    const staffId = String(raw["الرقم الوظيفي"] || "").trim();
    const staffName = String(raw["اسم الموظف"] || "").trim();
    const serialNumber = String(raw["الرقم التسلسلي"] || "").trim();
    const staffLocation = String(raw["الموقع"] || "").trim();

    if (!staffName) {
      return { rowNumber, raw, status: "error", reason: "اسم الموظف حقل مطلوب." };
    }
    if (!serialNumber) {
      return { rowNumber, raw, status: "error", reason: "الرقم التسلسلي حقل مطلوب." };
    }

    const serialKey = normalizeImportKey(serialNumber);

    if (existingSerials.has(serialKey)) {
      return { rowNumber, raw, status: "duplicate", reason: "الرقم التسلسلي موجود بالفعل في النظام." };
    }
    if (seenSerialsInFile.has(serialKey)) {
      return { rowNumber, raw, status: "duplicate", reason: "الرقم التسلسلي مكرر داخل الملف نفسه." };
    }

    seenSerialsInFile.add(serialKey);

    return {
      rowNumber,
      raw,
      status: "valid",
      reason: "",
      payload: {
        staff_id: staffId || null,
        staff_name: staffName,
        serial_number: serialNumber,
        staff_location: staffLocation || null,
        created_by: currentAuthUser ? currentAuthUser.id : null,
      },
    };
  });
}

IMPORT_CONFIGS.tablets = {
  title: "استيراد الأجهزة اللوحية من Excel",
  entityLabelPlural: "جهاز لوحي",
  templateHeaders: ["الرقم الوظيفي", "اسم الموظف", "الرقم التسلسلي", "الموقع"],
  templateFilename: "قالب-استيراد-الأجهزة-اللوحية.xlsx",
  rejectedReportFilename: "صفوف-مرفوضة-الأجهزة-اللوحية.csv",
  step1Desc:
    "حمِّل القالب واملأه ببيانات الأجهزة اللوحية المطلوب إضافتها (اسم الموظف والرقم التسلسلي مطلوبان، والباقي اختياري)، ثم ارفع الملف في الخطوة التالية.",
  validate: validateTabletImportRows,
  insertOne: (payload) => supabaseClient.from("it_tablet_assignments").insert(payload),
  afterImport: () => loadTabletAssignments(),
};

importTabletsButton.addEventListener("click", () => openImportWizard("tablets"));

// ---------------------------------------------------------------------------
// 14.1f استيراد كتالوج اللابتوبات — تحقق من عدم تكرار الرقم التسلسلي (داخل
//       الملف وضد قاعدة البيانات)، مطابق تمامًا لقواعد نموذج الإضافة اليدوية
// ---------------------------------------------------------------------------

async function validateLaptopCatalogImportRows(rawRows) {
  const { data: existing, error } = await supabaseClient
    .from("it_laptop_catalog")
    .select("serial_number")
    .eq("status", "active");
  if (error) {
    console.error("Error loading existing laptop catalog entries for import validation:", error);
    throw new Error("تعذر التحقق من سجلات الكتالوج الموجودة حاليًا في النظام. يُرجى المحاولة مرة أخرى.");
  }

  const existingSerials = new Set((existing || []).map((a) => normalizeImportKey(a.serial_number)));
  const seenSerialsInFile = new Set();

  return rawRows.map((raw, index) => {
    const rowNumber = index + 2; // +2: الصف 1 في Excel هو رأس الأعمدة
    const serialNumber = String(raw["الرقم التسلسلي"] || "").trim();
    const laptopType = String(raw["نوع اللابتوب"] || "").trim();
    const assetTag = String(raw["رقم العهدة"] || "").trim();

    if (!serialNumber) {
      return { rowNumber, raw, status: "error", reason: "الرقم التسلسلي حقل مطلوب." };
    }

    const serialKey = normalizeImportKey(serialNumber);

    if (existingSerials.has(serialKey)) {
      return { rowNumber, raw, status: "duplicate", reason: "الرقم التسلسلي موجود بالفعل في النظام." };
    }
    if (seenSerialsInFile.has(serialKey)) {
      return { rowNumber, raw, status: "duplicate", reason: "الرقم التسلسلي مكرر داخل الملف نفسه." };
    }

    seenSerialsInFile.add(serialKey);

    return {
      rowNumber,
      raw,
      status: "valid",
      reason: "",
      payload: {
        serial_number: serialNumber,
        laptop_type: laptopType || null,
        asset_tag: assetTag || null,
        created_by: currentAuthUser ? currentAuthUser.id : null,
      },
    };
  });
}

IMPORT_CONFIGS["laptop-catalog"] = {
  title: "استيراد كتالوج اللابتوبات من Excel",
  entityLabelPlural: "سجل",
  templateHeaders: ["الرقم التسلسلي", "نوع اللابتوب", "رقم العهدة"],
  templateFilename: "قالب-استيراد-كتالوج-اللابتوبات.xlsx",
  rejectedReportFilename: "صفوف-مرفوضة-كتالوج-اللابتوبات.csv",
  step1Desc:
    "حمِّل القالب واملأه بسجلات كتالوج اللابتوبات المطلوب إضافتها (الرقم التسلسلي مطلوب، والباقي اختياري)، ثم ارفع الملف في الخطوة التالية.",
  validate: validateLaptopCatalogImportRows,
  insertOne: (payload) => supabaseClient.from("it_laptop_catalog").insert(payload),
  afterImport: () => loadLaptopCatalog(),
};

importLaptopCatalogButton.addEventListener("click", () => openImportWizard("laptop-catalog"));

// ---------------------------------------------------------------------------
// 14.3 استيراد المصروفات — تحقق من مطابقة اسم الفئة، وصحة المبلغ/التاريخ،
//      بالإضافة لفحص حرج: إجمالي الصفوف الصالحة يجب أن لا يتجاوز الرصيد
//      المتاح في الصندوق النشط الحالي — نفس قاعدة نموذج الإضافة اليدوية
//      التي بترفض أي رصيد سالب تمامًا (لا يوجد إدخال جزئي يكسر القاعدة هذه)
// ---------------------------------------------------------------------------

async function validateExpensesImportRows(rawRows) {
  const { data: categories, error } = await supabaseClient.from("expense_categories").select("id, name, name_ar");
  if (error) {
    console.error("Error loading expense categories for import validation:", error);
    throw new Error("تعذر تحميل فئات المصروفات. يُرجى المحاولة مرة أخرى.");
  }

  const categoryMap = {};
  (categories || []).forEach((c) => {
    categoryMap[normalizeImportKey(c.name)] = c.id;
    if (c.name_ar) categoryMap[normalizeImportKey(c.name_ar)] = c.id;
  });

  return rawRows.map((raw, index) => {
    const rowNumber = index + 2;
    const amountRaw = raw["المبلغ"];
    const categoryRaw = String(raw["الفئة"] || "").trim();
    const dateRaw = raw["التاريخ"];
    const description = String(raw["الوصف"] || "").trim();
    const supplierName = String(raw["اسم المورد"] || "").trim();
    const invoiceNumber = String(raw["رقم الفاتورة"] || "").trim();
    // عمود داخلي بالكامل — الموظف اللي استلم المبلغ فعليًا، لمعرفة الأدمن
    // فقط، ولا يظهر أبدًا في أي تقرير خارجي (نفس قاعدة فورم الإضافة اليدوية)
    const recipientEmployeeName = String(raw["الموظف المستلم للمبلغ (داخلي)"] || "").trim();
    // كود العهدة اختياري — لو فاضي هيتحدد تلقائيًا على العهدة النشطة وقت
    // التأكيد؛ مفيد لتسجيل مصروف قديم على عهدة قديمة بعينها بدل الحالية
    const fundCodeRaw = String(raw["كود العهدة (اختياري)"] || "").trim();

    const categoryId = categoryMap[normalizeImportKey(categoryRaw)];
    if (!categoryRaw || !categoryId) {
      return { rowNumber, raw, status: "error", reason: 'فئة غير معروفة ("' + (categoryRaw || "فارغة") + '").' };
    }

    const amount = Number(amountRaw);
    if (amountRaw === "" || amountRaw === null || amountRaw === undefined || Number.isNaN(amount) || amount <= 0) {
      return { rowNumber, raw, status: "error", reason: "المبلغ يجب أن يكون رقمًا أكبر من صفر." };
    }

    const expenseDate = excelDateToIsoString(dateRaw);
    if (!expenseDate) {
      return { rowNumber, raw, status: "error", reason: "التاريخ غير صالح." };
    }

    return {
      rowNumber,
      raw,
      status: "valid",
      reason: "",
      fundCodeRaw, // يُستخدم في preConfirmCheck لتحديد العهدة المطلوبة لكل صف
      payload: {
        category_id: categoryId,
        amount,
        expense_date: expenseDate,
        description: description || null,
        supplier_name: supplierName || null,
        invoice_number: invoiceNumber || null,
        recipient_employee_name: recipientEmployeeName || null,
        created_by: currentAuthUser ? currentAuthUser.id : null,
        // petty_cash_fund_id بيتحدد في preConfirmCheck تحت وقت التأكيد
        // الفعلي — إما العهدة المحدّدة صراحةً بعمود "كود العهدة"، وإلا
        // العهدة النشطة وقت التأكيد
      },
    };
  });
}

// فحص قبل التأكيد النهائي: بيحدد لكل صف العهدة المطلوبة (المحدّدة صراحةً
// بكود العهدة، أو العهدة النشطة افتراضيًا)، وبيتأكد إن إجمالي كل عهدة على
// حدة ميتجاوزش رصيدها الحالي — نفس قاعدة "بدون رصيد سالب" لكن مطبّقة لكل
// عهدة بمفردها، لأن الملف ممكن يحتوي مصروفات موزّعة على أكتر من عهدة
async function expensesImportPreConfirmCheck(validRows) {
  const { data: funds, error: fundsError } = await supabaseClient
    .from("petty_cash_fund_balances")
    .select("fund_id, fund_code, status, current_balance");

  if (fundsError) {
    console.error("Error loading funds for expenses import:", fundsError);
    return { ok: false, message: "تعذر تحميل العهدات. يُرجى المحاولة مرة أخرى." };
  }

  const fundsList = funds || [];
  const fundCodeMap = {};
  fundsList.forEach((f) => {
    fundCodeMap[normalizeImportKey(f.fund_code)] = f;
  });
  const activeFund = fundsList.find((f) => f.status === "active") || null;

  // نحدد العهدة الفعلية لكل صف، ونرصد أي صف بكود عهدة غير معروف
  const unknownFundCodes = new Set();
  const rowsWithNoActiveFund = [];

  validRows.forEach((r) => {
    let resolvedFund = null;
    if (r.fundCodeRaw) {
      resolvedFund = fundCodeMap[normalizeImportKey(r.fundCodeRaw)] || null;
      if (!resolvedFund) unknownFundCodes.add(r.fundCodeRaw);
    } else {
      resolvedFund = activeFund;
      if (!resolvedFund) rowsWithNoActiveFund.push(r.rowNumber);
    }
    r._resolvedFund = resolvedFund;
  });

  if (unknownFundCodes.size > 0) {
    return {
      ok: false,
      message: 'كود عهدة غير معروف في الملف: "' + Array.from(unknownFundCodes).join('"، "') + '". تأكد من كتابة كود العهدة بالضبط كما هو مسجّل في النظام، أو اتركه فارغًا ليُستخدم العهدة النشطة تلقائيًا.',
    };
  }
  if (rowsWithNoActiveFund.length > 0) {
    return {
      ok: false,
      message: "لا توجد عهدة نقدية نشطة حاليًا، وبعض الصفوف (رقم " + rowsWithNoActiveFund.join("، ") + ") لم تحدد كود عهدة صراحةً. حدد كود عهدة لهذه الصفوف أو أنشئ عهدة نشطة أولًا.",
    };
  }

  // نجمّع إجمالي المطلوب لكل عهدة على حدة، ونقارنه برصيدها الحالي
  const totalsByFund = {};
  validRows.forEach((r) => {
    const fundId = r._resolvedFund.fund_id;
    totalsByFund[fundId] = (totalsByFund[fundId] || 0) + Number(r.payload.amount || 0);
  });

  const insufficientFunds = Object.entries(totalsByFund)
    .map(([fundId, total]) => {
      const fund = fundsList.find((f) => f.fund_id === fundId);
      const currentBalance = Number(fund.current_balance);
      return total > currentBalance
        ? { fund_code: fund.fund_code, total, currentBalance, diff: total - currentBalance }
        : null;
    })
    .filter(Boolean);

  if (insufficientFunds.length > 0) {
    const details = insufficientFunds
      .map(
        (f) =>
          'العهدة "' + f.fund_code + '": المطلوب ' + formatNumber(f.total, 2) + " ر.س، المتاح " +
          formatNumber(f.currentBalance, 2) + " ر.س (ناقص " + formatNumber(f.diff, 2) + " ر.س)"
      )
      .join(" — ");
    return {
      ok: false,
      message:
        "إجمالي المصروفات المطلوبة يتجاوز الرصيد المتاح في بعض العهدات: " + details +
        ". يجب تقليل المبالغ أو حذف بعض الصفوف قبل التأكيد — لا يسمح النظام برصيد سالب، ولا يُتاح إدخال جزئي.",
    };
  }

  // ربط كل صف صالح بالعهدة المحلولة فعليًا وقت التأكيد
  validRows.forEach((r) => {
    r.payload.petty_cash_fund_id = r._resolvedFund.fund_id;
  });

  return { ok: true };
}

IMPORT_CONFIGS.expenses = {
  title: "استيراد المصروفات من Excel",
  entityLabelPlural: "مصروف",
  templateHeaders: [
    "المبلغ",
    "الفئة",
    "التاريخ",
    "الوصف",
    "اسم المورد",
    "رقم الفاتورة",
    "الموظف المستلم للمبلغ (داخلي)",
    "كود العهدة (اختياري)",
  ],
  templateFilename: "قالب-استيراد-المصروفات.xlsx",
  rejectedReportFilename: "صفوف-مرفوضة-المصروفات.csv",
  step1Desc:
    "حمِّل القالب وأدخل بيانات المصروفات المطلوب إضافتها. الأعمدة (المبلغ، الفئة، التاريخ) مطلوبة، والباقي اختياري. " +
    "يحتوي عمود \"الفئة\" على قائمة منسدلة بالفئات الموجودة فعليًا في النظام — اختر منها بدلًا من كتابتها يدويًا. " +
    "عمود \"الموظف المستلم للمبلغ (داخلي)\" معلومة داخلية للأدمن فقط ولا تظهر أبدًا في تقرير العهدة (MEEM) المُصدَّر للشركة الأم. " +
    "عمود \"كود العهدة (اختياري)\" يحدد أي عهدة يُخصم منها هذا الصف بالتحديد (مفيد لمصروف قديم يجب خصمه من عهدة قديمة بعينها) — لو تركته فارغًا هيتم ربط الصف تلقائيًا بالعهدة النشطة الحالية.",
  templateColumnValidations: async () => {
    const categories = await ensureExpenseCategories();
    const { data: fundsForValidation } = await supabaseClient
      .from("petty_cash_funds")
      .select("fund_code")
      .order("funded_at", { ascending: false });
    return {
      "الفئة": categories.map((c) => c.name_ar || c.name),
      "كود العهدة (اختياري)": (fundsForValidation || []).map((f) => f.fund_code),
    };
  },
  validate: validateExpensesImportRows,
  preConfirmCheck: expensesImportPreConfirmCheck,
  insertOne: (payload) => supabaseClient.from("expenses").insert(payload),
  afterImport: () => {
    loadExpenses();
    loadCurrentFund();
  },
};

const importExpensesButton = document.getElementById("import-expenses-button");
importExpensesButton.addEventListener("click", () => openImportWizard("expenses"));

// ============================================================================
// 15. استعادة الجلسة عند فتح الصفحة (Session persistence)
// ============================================================================
// #login-page و #app-shell كلاهما يبدآن hidden في الـ HTML؛ الكود هذا هو
// الذي يقرر إظهار أيهما فور تحميل الصفحة، دون أن تومض صفحة الدخول إذا كان
// المستخدم أصلاً لديه جلسة سليمة.

(async function init() {
  const saved = loadSavedSession();

  if (saved && saved.token && saved.expiresAt && saved.expiresAt > Date.now()) {
    console.log("توجد جلسة دخول سابقة لـ:", saved.profile && saved.profile.email);
    await restoreSessionAndEnter(saved);
  } else {
    if (saved) clearSavedSession();
    showLoginPage();
  }
})();

// ============================================================================
// 16. شريط تنقّل يمين/يسار فوق كل الجداول (لما الجدول يبقى أعرض من الشاشة)
// ============================================================================
// بيتحط تلقائيًا فوق كل .table-scroll في الصفحة، وبيظهر فقط لما الجدول فعلًا
// قابل للتمرير أفقيًا (يتابع الحجم بـ ResizeObserver حتى يتحدّث الظهور
// والتعطيل تلقائيًا حتى لو الصفوف اتغيرت بعدين — فلترة، صفحات، إلخ)

function initTableScrollControls() {
  document.querySelectorAll(".table-scroll").forEach((scrollEl) => {
    const card = scrollEl.closest(".table-card");
    if (!card || card.querySelector(".table-scroll-controls")) return;

    const controls = document.createElement("div");
    controls.className = "table-scroll-controls";
    controls.innerHTML =
      '<button type="button" class="table-scroll-btn table-scroll-btn-right">يمين ›</button>' +
      '<button type="button" class="table-scroll-btn table-scroll-btn-left">‹ يسار</button>';

    card.insertBefore(controls, card.firstChild);

    const rightBtn = controls.querySelector(".table-scroll-btn-right");
    const leftBtn = controls.querySelector(".table-scroll-btn-left");
    const SCROLL_STEP = 220;

    rightBtn.addEventListener("click", () => {
      scrollEl.scrollBy({ left: SCROLL_STEP, behavior: "smooth" });
    });

    leftBtn.addEventListener("click", () => {
      scrollEl.scrollBy({ left: -SCROLL_STEP, behavior: "smooth" });
    });

    const updateControls = () => {
      const isScrollable = scrollEl.scrollWidth > scrollEl.clientWidth + 1;
      card.classList.toggle("is-h-scrollable", isScrollable);
      if (!isScrollable) return;

      // في المتصفحات الحديثة، scrollLeft في RTL بيبدأ من 0 (بداية المحتوى
      // على اليمين) ويوصل لأقصى قيمة سالبة عند آخر المحتوى (على الشمال)
      const maxScroll = scrollEl.scrollWidth - scrollEl.clientWidth;
      rightBtn.disabled = scrollEl.scrollLeft >= -1;
      leftBtn.disabled = Math.abs(scrollEl.scrollLeft) >= maxScroll - 1;
    };

    scrollEl.addEventListener("scroll", updateControls);
    new ResizeObserver(updateControls).observe(scrollEl);
    updateControls();
  });
}

initTableScrollControls();
