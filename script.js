// ============================================================================
// Admin Operations Management System — script.js
// Phase 1: Login + App Shell (نظام دخول مخصص عبر RPC + JWT — راجع القسم 10 في database/schema.sql)
// Phase 2: Vehicles Module (list, search/filter/pagination, details, add/edit)
// لا يوجد أي بيانات وهمية أو مستخدمين تجريبيين في أي جزء من هذا الملف.
//
// ---- مراجعة شاملة (Full Audit) — ملخص الأخطاء اللي تم اكتشافها وإصلاحها ----
// 1) لوحة الرئيسية (loadDashboardStats): كانت الاستعلامات التلاتة الموازية
//    (السيارات/الوقود/المصروفات) من غير أي فحص لـ error — لو أي استعلام فشل
//    بصمت، كانت الكروت بتعرض "0" مضلّل بيتعارض مع الأرقام الحقيقية في
//    الصفحات نفسها. اتصلح: بقى فيه console.error + رسالة "تعذر التحميل"
//    واضحة بدل الصفر الصامت.
// 2) كل فورمات الحفظ وأزرار التأكيد (سيارة/وقود/صندوق/مصروف/موظف/إلغاء
//    (Void)/إغلاق صندوق/تغيير دور) كانت من غير try/catch — لو الإنترنت
//    انقطع أثناء الحفظ وحصل استثناء غير متوقع (مش خطأ Supabase عادي)، كان
//    الزرار هيفضل عالق على "جارٍ الحفظ..." للأبد. اتصلح: كل الهاندلرز دي
//    بقت متغلفة بـ try/catch/finally بتضمن رجوع الزرار شغّال دايمًا مع
//    رسالة خطأ واضحة.
// 3) زرار تفعيل/تعطيل الموظف (toggleEmployeeActive) كان من غير تعطيل
//    للزرار أثناء التنفيذ (Double-submit protection) — اتصلح بإضافة تعطيل
//    مؤقت + try/catch. (لاحقًا تم استبدال تدفق تغيير دور الحساب بنموذج
//    تعديل كامل — راجع قسم 13.1b.)
// 4) استعلامات صامتة الفشل من غير أي console.error (تقرير البيتي كاش،
//    تفاصيل الصندوق، فلاتر سجل العمليات، البحث الشامل، فتح سيارة من نتيجة
//    بحث) — اتضاف لها تسجيل الخطأ في الـ Console على الأقل عشان تبقى قابلة
//    للتشخيص، وبعضها بقى بيعرض رسالة خطأ للمستخدم بدل نتيجة فاضية مضلّلة.
// 5) الصلاحيات (RLS + UI) اتراجعت بالكامل: كل زرار إضافة/تعديل/إلغاء متأكد
//    إنه مربوط بـ RLS حقيقي في قاعدة البيانات (مش بس إخفاء واجهة)، وصفحة
//    المستخدمين محمية على مستوى navigateTo() نفسه مش بس إخفاء رابط
//    الـ Sidebar — لم يتم العثور على أي ثغرة صلاحيات.
// ----------------------------------------------------------------------------
// ============================================================================

// ----------------------------------------------------------------------------
// حالة عامة (Global State)
// ----------------------------------------------------------------------------
// نظام دخول مخصص بالكامل (RPC + JWT موقّع يدويًا — راجع القسم 10 في
// database/schema.sql)، مش Supabase Auth. currentAuthUser بشكل { id }
// بسيط بس (بديل خفيف لكائن Supabase Auth القديم) عشان باقي الكود اللي
// بيستخدم currentAuthUser.id (created_by/voided_by/assigned_by) يفضل شغّال
// من غير أي تغيير.
let currentAuthUser = null; // { id } بس — هوية المستخدم الحالي
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
const logoutButton = document.getElementById("logout-button");
const pageTitleEl = document.getElementById("page-title");
const topbarUserName = document.getElementById("topbar-user-name");
const topbarUserRole = document.getElementById("topbar-user-role");

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
  loginButton.textContent = isLoading ? "جارٍ تسجيل الدخول..." : "دخول";
}

function roleLabel(role) {
  if (role === "super_admin") return "مدير النظام";
  if (role === "admin") return "أدمن";
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

// لحقول من نوع date بس (زي transaction_date) — من غير وقت، ومن غير انزياح
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

// لتاريخ معاملات الوقود بس — بيتسجل بالشهر عمليًا مش بيوم محدد، فبنعرض
// الشهر والسنة بس (مثلاً "مايو 2026") من غير رقم اليوم
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
// لا يغيّر أي استعلام أو منطق عمل — بس بيبدّل الـ HTML المؤقت اللي بيظهر
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

// حالة "فارغ تمامًا" مصمّمة بعناية (أيقونة كبيرة + عنوان + وصف + زرار فعل
// اختياري) — بتستخدم في الجداول الرئيسية بدل نص عادي، وبس لما الجدول فاضي
// فعليًا من غير أي فلتر مطبّق (حالة الفلتر الفاضي بتفضل نص بسيط عادي)
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
// من هنا وبعد كده أي نداء (RPC أو جدول) بيتحقق كـ "authenticated" تلقائيًا
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
  welcomeMessage.textContent =
    "مرحبًا " + profile.full_name + " — دورك: " + roleLabel(profile.role);
  topbarUserName.textContent = profile.full_name;
  topbarUserRole.textContent = roleLabel(profile.role);

  // إظهار/إخفاء عناصر مقصورة على Super Admin أو Admin العادي (الرفض
  // الفعلي بييجي من RLS في قاعدة البيانات نفسها — ده بس تحسين لتجربة
  // الاستخدام). Admin العادي يقدر يعدّل السيارات/الوقود/العهدة/المصروفات/
  // الموظفين، لكن مش حسابات النظام ولا سجل العمليات.
  const isAdminOrAbove = profile.role === "super_admin" || profile.role === "admin";

  addVehicleButton.hidden = !isAdminOrAbove;
  addFuelButton.hidden = !isAdminOrAbove;
  addFundButton.hidden = !isAdminOrAbove;
  addExpenseButton.hidden = !isAdminOrAbove;
  importVehiclesButton.hidden = !isAdminOrAbove;
  importFuelButton.hidden = !isAdminOrAbove;
  importExpensesButton.hidden = !isAdminOrAbove;
  addEmployeeButton.hidden = !isAdminOrAbove;
  fullBackupExportButton.hidden = !isAdminOrAbove;

  // صفحات/عناصر مقصورة على Super Admin بالكامل (مش بس زرار داخل الصفحة)
  const auditLogNavItem = document.getElementById("audit-log-nav-item");
  const accountsNavItem = document.getElementById("accounts-nav-item");
  const employeesNavItem = document.getElementById("employees-nav-item");
  if (auditLogNavItem) auditLogNavItem.hidden = profile.role !== "super_admin";
  if (accountsNavItem) accountsNavItem.hidden = profile.role !== "super_admin";
  if (employeesNavItem) employeesNavItem.hidden = !isAdminOrAbove;

  navigateTo("dashboard");

  if (profile.must_change_password) {
    changePasswordForm.reset();
    changePasswordError.hidden = true;
    changePasswordSuccess.textContent = "كلمة المرور الحالية مؤقتة — لازم تغيّرها الآن.";
    changePasswordSuccess.hidden = false;
    if (pendingLoginPassword) changePasswordCurrentInput.value = pendingLoginPassword;
    changePasswordModal.hidden = false;
  }
  pendingLoginPassword = null;
}

// بيتسجّل مؤقتًا وقت تسجيل الدخول بس، عشان لو الحساب محتاج تغيير كلمة مرور
// إجباري، نقدر نحط كلمة المرور المؤقتة تلقائيًا في حقل "كلمة المرور
// الحالية" بدل ما يكتبها تاني بنفسه (مش بيتخزن في أي مكان دائم)
let pendingLoginPassword = null;

// استعادة جلسة محفوظة (بعد تحديث الصفحة) — بيعيد التحقق من الحساب حيًا من
// قاعدة البيانات (مش بس بيثق في البيانات المحفوظة محليًا) عشان أي تعطيل أو
// تغيير دور يتفعّل فورًا حتى لو التوكن القديم لسه صالح
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

  // كل الطلب اتغلف بـ try/catch عشان لو الاتصال بالإنترنت انقطع فجأة أو
  // حصل خطأ غير متوقع، الزرار يرجع شغّال ويظهر رسالة خطأ واضحة بدل ما
  // يفضل عالق على "جارٍ تسجيل الدخول..." للأبد
  try {
    // تسجيل الدخول عبر RPC مخصص (login_attempt) — بيرجّع JWT موقّع لو
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
  vehicleFormEmployeesCache = null;
  currentActiveFund = null;
  loginForm.reset();
  clearError();
  showLoginPage();
});

// ---------------------------------------------------------------------------
// 1.1 تغيير كلمة المرور — متاح لأي مستخدم مسجّل دخول لحسابه الشخصي فقط، عبر
// RPC مخصص (change_own_password) بيتحقق من كلمة المرور الحالية أولًا. لا
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

    // تحديث الحالة المحلية + الجلسة المحفوظة عشان الرسالة الإجبارية متظهرش
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
  reports: "التقارير",
  "audit-log": "سجل العمليات",
  accounts: "حسابات النظام",
  employees: "الموظفون",
};

// صفحات مقصورة على Super Admin بالكامل (حسابات النظام + سجل العمليات) —
// حماية إضافية على مستوى التنقل نفسه (بجانب إخفاء عنصر الـ Sidebar أصلًا).
// الرفض الحقيقي للبيانات دايمًا من RLS في قاعدة البيانات، ده مجرد تحسين
// تجربة استخدام. صفحة "الموظفون" متاحة لـ Admin العادي كمان (مرتبطة بشغله
// في السيارات/العهدة)، فمش من ضمن القيود دي.
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

  if (pageName === "reports") {
    loadReportTab(currentReportTab);
  }

  if (pageName === "audit-log") {
    loadAuditLog();
  }

  if (pageName === "accounts") {
    loadAccountsList();
  }

  if (pageName === "employees") {
    loadEmployeesList();
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

// معالج الاستيراد تحديدًا بيتم منع إغلاقه أثناء تنفيذ الإدخال الفعلي
// (isProcessing) — إغلاقه في نص العملية مش هيوقف الإدخال (لسه شغّال في
// الخلفية)، فالأسلم منع الإغلاق العرضي لحد ما العملية تخلص
function isModalSafeToClose(modal) {
  if (modal && modal.id === "import-wizard-modal" && importWizardState.isProcessing) return false;
  return true;
}

// إغلاق موحّد لأي Modal — بيتعامل أيضًا مع حالة إلغاء "إضافة موظف سريعة"
// اللي اتفتحت من فورم السيارة (يرجّع فورم السيارة يظهر تاني بدل ما يفضل
// مقفول من غير رجوع)
function closeModalIfSafe(modal) {
  if (!modal || !isModalSafeToClose(modal)) return;
  modal.hidden = true;
  if (modal.id === "employee-form-modal" && employeeQuickAddCallback) {
    employeeQuickAddCallback = null;
    vehicleFormModal.hidden = false;
  }
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

// شارة "حالة التفويض": لو مفيش تاريخ نهاية = "مستخدم فعلي" مستمر، لو فيه
// تاريخ وعدّى = "منتهي"، لو فيه تاريخ ولسه ساري = "مفوَّض حتى" التاريخ ده
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

// نحتاج زرار إضافة الوقود هنا لأن showAppShell() بيتحكم في ظهوره حسب الدور
const addFuelButton = document.getElementById("add-fuel-button");

// نفس الفكرة لزراري البيتي كاش والمصروفات — showAppShell() بيتحكم فيهم حسب الدور
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
const vehicleFormEmployeeSelect = document.getElementById("vehicle-form-employee");
const vehicleFormAddEmployeeButton = document.getElementById("vehicle-form-add-employee-button");
const vehicleFormError = document.getElementById("vehicle-form-error");
const vehicleFormSubmitButton = document.getElementById("vehicle-form-submit");

let vehicleBeingViewed = null;
let vehicleFormOriginalEmployeeId = null; // لمقارنة الموظف قبل/بعد الحفظ (لتسجيل تغيير التعيين)
let vehicleFormEmployeesCache = null;

// قائمة أسماء المستخدمين الفعليين الموجودة فعلًا على سيارات تانية — بتتعرض
// كاقتراحات (datalist) وقت كتابة اسم المستخدم الفعلي في فورم السيارة، عشان
// نقلل اختلاف كتابة نفس الاسم (زي "محمد حسام" و"محمد حسام عثمان") اللي بيبوّظ
// تقارير الاستهلاك حسب الشخص. السيارة تفضل هي الأساس والاسم مجرد حقل عليها
// — مفيش جدول "مستخدمين" منفصل ولا ربط رسمي، الاقتراح شكلي بس
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

// قائمة الموظفين النشطين لاستخدامها في select "الموظف الحالي" داخل فورم
// السيارة — كاش بسيط زي باقي الكاشات المشابهة في النظام
async function ensureVehicleFormEmployeeOptions(forceRefresh) {
  if (vehicleFormEmployeesCache && !forceRefresh) return vehicleFormEmployeesCache;

  const { data, error } = await supabaseClient
    .from("employees")
    .select("id, full_name")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) {
    console.error("Error loading employees for vehicle form:", error);
    vehicleFormEmployeesCache = [];
  } else {
    vehicleFormEmployeesCache = data || [];
  }

  vehicleFormEmployeeSelect.innerHTML =
    '<option value="">بدون موظف</option>' +
    vehicleFormEmployeesCache
      .map((e) => '<option value="' + e.id + '">' + escapeHtml(e.full_name) + "</option>")
      .join("");

  return vehicleFormEmployeesCache;
}

// إضافة موظف جديد بسرعة من داخل فورم السيارة نفسه، من غير الحاجة للذهاب
// لصفحة "المستخدمون" — بيفتح نفس Modal إضافة الموظف الموجود، وبيرجّع
// المُعرَّف الجديد عشان يتحط تلقائيًا في select السيارة بعد الحفظ
vehicleFormAddEmployeeButton.addEventListener("click", () => {
  vehicleFormModal.hidden = true;
  openEmployeeForm(null, (newEmployee) => {
    ensureVehicleFormEmployeeOptions(true).then(() => {
      vehicleFormEmployeeSelect.value = newEmployee.id;
      vehicleFormModal.hidden = false;
    });
  });
});

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
    const employeeName = vehicle.current_employee ? vehicle.current_employee.full_name : null;

    tr.innerHTML =
      "<td>" + escapeHtml(vehicle.license_plate) + "</td>" +
      "<td>" + escapeHtml(vehicle.make || "—") + "</td>" +
      "<td>" + (vehicle.manufacturing_year || "—") + "</td>" +
      "<td>" + escapeHtml(vehicleActualUserDisplay(vehicle)) + "</td>" +
      "<td>" + vehicleAuthorizationBadgeHtml(vehicle) + "</td>" +
      "<td>" + escapeHtml(employeeName || "—") + "</td>" +
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
        "status, created_at, updated_at, current_employee_id, current_location_id, " +
        "current_employee:employees ( full_name ), current_location:locations ( name )",
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
      setVehiclesState("لا توجد نتائج مطابقة لبحثك أو الفلتر المحدد.");
    } else {
      const isSuperAdmin = !!(currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "admin"));
      showRichEmptyState(
        vehiclesStateBox,
        "🚗",
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
  const employeeName = vehicle.current_employee ? vehicle.current_employee.full_name : null;
  const locationName = vehicle.current_location ? vehicle.current_location.name : null;

  vehicleDetailsContent.innerHTML =
    detailRow("رقم اللوحة", escapeHtml(vehicle.license_plate)) +
    detailRow("الماركة", escapeHtml(vehicle.make || "—")) +
    detailRow("سنة الصنع", vehicle.manufacturing_year || "—") +
    detailRow("المستخدم الفعلي", escapeHtml(vehicleActualUserDisplay(vehicle))) +
    detailRow("حالة التفويض", vehicleAuthorizationBadgeHtml(vehicle)) +
    detailRow("التخصيص الرسمي (موظف)", escapeHtml(employeeName || "—")) +
    detailRow("الموقع الحالي", escapeHtml(locationName || "—")) +
    detailRow("الحالة", "<span class=\"status-badge status-" + vehicle.status + "\">" + escapeHtml(statusLabel) + "</span>") +
    detailRow("تاريخ الإضافة", formatDateTime(vehicle.created_at)) +
    detailRow("آخر تحديث", formatDateTime(vehicle.updated_at));

  vehicleDetailsEditButton.hidden = !(currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "admin"));

  // تبويب "سجل العمليات" يعتمد على audit_logs، اللي RLS بتاعه Super Admin
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
// 4.2b تبويبات تفاصيل السيارة: ملخص الوقود / تاريخ التنقلات / سجل العمليات
// ---------------------------------------------------------------------------

const vehicleDetailsTabsContainer = document.getElementById("vehicle-details-tabs");
const vehicleTabPanels = {
  basic: document.getElementById("vehicle-tab-basic"),
  fuel: document.getElementById("vehicle-tab-fuel"),
  assignments: document.getElementById("vehicle-tab-assignments"),
  audit: document.getElementById("vehicle-tab-audit"),
};
const vehicleFuelSummaryContent = document.getElementById("vehicle-fuel-summary-content");
const vehicleAssignmentsContent = document.getElementById("vehicle-assignments-content");
const vehicleAuditContent = document.getElementById("vehicle-audit-content");

function switchVehicleDetailsTab(tabName) {
  Object.keys(vehicleTabPanels).forEach((key) => {
    vehicleTabPanels[key].hidden = key !== tabName;
  });

  vehicleDetailsTabsContainer.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  if (tabName === "fuel") loadVehicleFuelSummaryTab();
  if (tabName === "assignments") loadVehicleAssignmentsTab();
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
    vehicleFuelSummaryContent.innerHTML = '<div class="table-state">حصل خطأ أثناء تحميل ملخص الوقود.</div>';
    return;
  }

  if (!data || !data.transaction_count) {
    vehicleFuelSummaryContent.innerHTML = '<div class="table-state">لا توجد معاملات وقود مسجّلة لهذه السيارة بعد.</div>';
    return;
  }

  vehicleFuelSummaryContent.innerHTML =
    '<div class="summary-cards">' +
    '<div class="summary-card"><span class="card-icon" aria-hidden="true">⛽</span><span class="summary-card-label">إجمالي اللترات</span>' +
    '<span class="summary-card-value">' + formatNumber(data.total_liters, 2) + "</span></div>" +
    '<div class="summary-card"><span class="card-icon" aria-hidden="true">💰</span><span class="summary-card-label">إجمالي التكلفة</span>' +
    '<span class="summary-card-value">' + formatNumber(data.total_cost, 2) + " ر.س</span></div>" +
    '<div class="summary-card"><span class="card-icon" aria-hidden="true">🔢</span><span class="summary-card-label">عدد المعاملات</span>' +
    '<span class="summary-card-value">' + (data.transaction_count || 0) + "</span></div>" +
    '<div class="summary-card"><span class="card-icon" aria-hidden="true">📊</span><span class="summary-card-label">متوسط تكلفة المعاملة</span>' +
    '<span class="summary-card-value">' + formatNumber(data.average_cost_per_transaction, 2) + " ر.س</span></div>" +
    "</div>";
}

async function loadVehicleAssignmentsTab() {
  if (!vehicleBeingViewed) return;
  vehicleAssignmentsContent.innerHTML = skeletonBlockHtml(3, 5);

  const { data, error } = await supabaseClient
    .from("vehicle_assignments")
    .select(
      "id, start_date, end_date, notes, " +
        "employee:employees!employee_id ( full_name ), " +
        "location:locations!location_id ( name )"
    )
    .eq("vehicle_id", vehicleBeingViewed.id)
    .order("start_date", { ascending: false });

  if (error) {
    console.error("Error loading vehicle assignments:", error);
    vehicleAssignmentsContent.innerHTML = '<div class="table-state">حصل خطأ أثناء تحميل تاريخ التنقلات.</div>';
    return;
  }

  if (!data || data.length === 0) {
    vehicleAssignmentsContent.innerHTML =
      '<div class="table-state">لا يوجد سجل تنقلات لهذه السيارة بعد. (موديول تغيير التخصيص هيتضاف في مرحلة قادمة)</div>';
    return;
  }

  const rows = data
    .map((a) => {
      const employeeName = a.employee ? a.employee.full_name : "—";
      const locationName = a.location ? a.location.name : "—";
      return (
        "<tr><td>" + formatDateOnly(a.start_date) + "</td>" +
        "<td>" + (a.end_date ? formatDateOnly(a.end_date) : "حتى الآن") + "</td>" +
        "<td>" + escapeHtml(employeeName) + "</td>" +
        "<td>" + escapeHtml(locationName) + "</td>" +
        "<td>" + escapeHtml(a.notes || "—") + "</td></tr>"
      );
    })
    .join("");

  vehicleAssignmentsContent.innerHTML =
    '<div class="table-scroll"><table class="data-table"><thead><tr>' +
    "<th>من تاريخ</th><th>إلى تاريخ</th><th>الموظف</th><th>الموقع</th><th>ملاحظات</th>" +
    "</tr></thead><tbody>" + rows + "</tbody></table></div>";
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
    vehicleAuditContent.innerHTML = '<div class="table-state">حصل خطأ أثناء تحميل سجل العمليات.</div>';
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

  await ensureVehicleFormEmployeeOptions();
  await ensureActualUserNameOptions();
  vehicleFormOriginalEmployeeId = vehicle && vehicle.current_employee_id ? vehicle.current_employee_id : null;

  // لو الموظف الحالي للسيارة معطّل (مش موجود في قائمة النشطين)، لازم يفضل
  // ظاهر ومحدد في الفورم برضو — عشان الحفظ العادي (تعديل حاجة تانية في
  // السيارة) ميمسحش تعيينه بالغلط من غير ما الأدمن ياخد قرار واعي بكده
  if (
    vehicleFormOriginalEmployeeId &&
    !vehicleFormEmployeesCache.some((e) => e.id === vehicleFormOriginalEmployeeId)
  ) {
    const currentName = vehicle.current_employee ? vehicle.current_employee.full_name : "موظف معطّل";
    vehicleFormEmployeeSelect.insertAdjacentHTML(
      "beforeend",
      '<option value="' + vehicleFormOriginalEmployeeId + '">' + escapeHtml(currentName) + " (معطّل)</option>"
    );
  }

  vehicleFormEmployeeSelect.value = vehicleFormOriginalEmployeeId || "";

  vehicleFormModal.hidden = false;
}

addVehicleButton.addEventListener("click", () => openVehicleForm(null));

// تسجيل تغيير تعيين السيارة (موظف جديد/إزالة الموظف) في vehicle_assignments
// — بيقفل أي فترة تعيين مفتوحة حاليًا لنفس السيارة، وبيفتح فترة جديدة لو
// فيه موظف جديد متحدد. عملية Best-effort غير حرجة (راجع نداءها بالأعلى)
async function logVehicleAssignmentChange(vehicleId, previousEmployeeId, newEmployeeId) {
  const today = new Date().toISOString().slice(0, 10);

  const { error: closeError } = await supabaseClient
    .from("vehicle_assignments")
    .update({ end_date: today })
    .eq("vehicle_id", vehicleId)
    .is("end_date", null);

  if (closeError) console.error("Error closing previous vehicle assignment:", closeError);

  if (!newEmployeeId) return; // إزالة الموظف بس — من غير فترة تعيين جديدة

  const { error: insertError } = await supabaseClient.from("vehicle_assignments").insert({
    vehicle_id: vehicleId,
    employee_id: newEmployeeId,
    previous_employee_id: previousEmployeeId,
    start_date: today,
    assigned_by: currentAuthUser ? currentAuthUser.id : null,
  });

  if (insertError) console.error("Error logging new vehicle assignment:", insertError);
}

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
  // بـ 2 — في الحالتين 10 أرقام بالظبط. الحقل اختياري، فالفحص بس لو اتكتب حاجة
  const actualUserNationalId = vehicleFormActualUserNationalIdInput.value.trim();
  if (actualUserNationalId && !/^[12]\d{9}$/.test(actualUserNationalId)) {
    vehicleFormError.textContent =
      "رقم الهوية/الإقامة لازم يكون 10 أرقام بالظبط، ويبدأ بـ 1 (هوية وطنية) أو 2 (إقامة).";
    vehicleFormError.hidden = false;
    return;
  }

  const newEmployeeId = vehicleFormEmployeeSelect.value || null;

  const payload = {
    license_plate: licensePlate,
    make: vehicleFormMakeInput.value.trim() || null,
    manufacturing_year: vehicleFormYearInput.value ? Number(vehicleFormYearInput.value) : null,
    status: vehicleFormStatusSelect.value,
    actual_user_name: vehicleFormActualUserNameInput.value.trim() || null,
    actual_user_national_id: actualUserNationalId || null,
    authorization_expiry_date: vehicleFormAuthorizationExpiryInput.value || null,
    current_employee_id: newEmployeeId,
  };

  vehicleFormSubmitButton.disabled = true;
  vehicleFormSubmitButton.textContent = "جارٍ الحفظ...";

  try {
    const editingId = vehicleFormIdInput.value;
    let error;
    let savedVehicleId = editingId || null;

    if (editingId) {
      ({ error } = await supabaseClient.from("vehicles").update(payload).eq("id", editingId));
    } else {
      payload.created_by = currentAuthUser ? currentAuthUser.id : null;
      const insertResult = await supabaseClient.from("vehicles").insert(payload).select().single();
      error = insertResult.error;
      if (!error && insertResult.data) savedVehicleId = insertResult.data.id;
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
        // الرفض جاي من RLS في قاعدة البيانات نفسها، مش بس من الواجهة
        vehicleFormError.textContent = "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك).";
      } else {
        vehicleFormError.textContent = "حصل خطأ أثناء الحفظ: " + error.message;
      }

      vehicleFormError.hidden = false;
      return;
    }

    // تسجيل تغيير التعيين في سجل "تاريخ التنقلات" — عملية ثانوية غير حرجة؛
    // فشلها (لو حصل) بيتسجل في الـ Console بس ومش بيوقف حفظ السيارة نفسها
    // اللي خلص بنجاح أصلًا
    if (savedVehicleId && newEmployeeId !== vehicleFormOriginalEmployeeId) {
      try {
        await logVehicleAssignmentChange(savedVehicleId, vehicleFormOriginalEmployeeId, newEmployeeId);
      } catch (assignmentError) {
        console.error("Unexpected error logging vehicle assignment:", assignmentError);
      }
    }

    actualUserNamesCache = null; // عشان الاسم الجديد يظهر كاقتراح من أول مرة
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
        // بيظهر باسم المستخدم الفعلي مع رقم اللوحة عشان يكون سهل تعرف
        // السيارة بتاعت مين وانت بتختار من القائمة، مش رقم اللوحة بس
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
// الملغاة)، مش بس صفحة الجدول المعروضة — عشان كروت الملخص فوق تعكس
// الفلتر كله زي ما هو متوقع، مش الـ٢٠ صف بس
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

  // vehicle_id مطلوب دائمًا (not null) فاستخدام !inner هنا آمن ومش بيستبعد
  // أي صف فعلي، وبيسمح لنا نفلتر على vehicle.license_plate لما نحتاج
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
      setFuelState("لا توجد نتائج مطابقة للفلاتر المحددة.");
    } else {
      const isSuperAdmin = !!(currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "admin"));
      showRichEmptyState(
        fuelStateBox,
        "⛽",
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

  // اسم "المُدخل" اتشال من الجدول ده — موجود بالتفصيل في سجل العمليات
  // (Audit Log) أصلًا، فمفيش داعي نكرره هنا
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
// قيمة "YYYY-MM" لأول/آخر يوم في الشهر عشان نستخدمها في فلترة عمود
// transaction_date اللي لسه من نوع date في القاعدة
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
// تنبيه لو الكمية/التكلفة المدخلة أعلى بكتير من متوسط السيارة دي — بيمسك
// أخطاء الكتابة بدري (زي زيادة صفر بالغلط). تحذير بس، مش منع، والمستخدم
// يقدر يأكّد ويكمل عادي لو الرقم صح فعلًا
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

  // لو بنعدّل معاملة موجودة، نشيلها من المتوسط عشان القيمة ميتقارنش بنفسها
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

  // مفيش تاريخ كفاية للسيارة دي عشان نقارن بثقة
  if (count < FUEL_ANOMALY_MIN_HISTORY) return true;

  const avgLiters = totalLiters / count;
  const avgAmount = totalCost / count;

  const litersIsHigh = avgLiters > 0 && liters > avgLiters * FUEL_ANOMALY_MULTIPLIER;
  const amountIsHigh = avgAmount > 0 && amount > avgAmount * FUEL_ANOMALY_MULTIPLIER;

  if (!litersIsHigh && !amountIsHigh) return true;

  const lines = ["الرقم اللي دخلته أعلى بكتير من المعتاد لنفس السيارة:"];
  if (litersIsHigh) {
    lines.push("• اللترات: " + formatNumber(liters, 2) + " مقابل متوسط " + formatNumber(avgLiters, 2) + " لتر.");
  }
  if (amountIsHigh) {
    lines.push("• التكلفة: " + formatNumber(amount, 2) + " ر.س مقابل متوسط " + formatNumber(avgAmount, 2) + " ر.س.");
  }
  lines.push("متأكد إن الرقم صح وعاوز تكمل الحفظ؟");

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
    fuelFormError.textContent = "اللترات لازم تكون رقم أكبر من صفر.";
    fuelFormError.hidden = false;
    return;
  }
  if (!amountRaw || Number.isNaN(amount) || amount < 0) {
    fuelFormError.textContent = "التكلفة لازم تكون رقم ولا تكون سالبة.";
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
        // الرفض جاي من RLS في قاعدة البيانات نفسها، مش بس من الواجهة
        fuelFormError.textContent = "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك).";
      } else if (error.code === "23503") {
        fuelFormError.textContent = "السيارة المختارة غير موجودة فعليًا.";
      } else if (error.code === "23514") {
        fuelFormError.textContent = "البيانات المدخلة لا تحقق شروط الصحة (تأكد من اللترات والتكلفة).";
      } else {
        fuelFormError.textContent = "حصل خطأ أثناء الحفظ: " + error.message;
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
          : "حصل خطأ أثناء الإلغاء: " + error.message;
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
// عدّل الرقم ده لو عاوز نسبة تنبيه مختلفة
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
    '<span class="card-icon" aria-hidden="true">💰</span>' +
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
    fundFormError.textContent = "المبلغ الافتتاحي لازم يكون رقم أكبر من صفر.";
    fundFormError.hidden = false;
    return;
  }

  fundFormSubmitButton.disabled = true;
  fundFormSubmitButton.textContent = "جارٍ الحفظ...";

  try {
    // تحقق مسبق (تجربة استخدام أفضل) — القيد الحقيقي المانع للتكرار موجود في
    // قاعدة البيانات (partial unique index: عهدة نشطة واحدة بس للنظام كله)،
    // وده مجرد فحص استباقي للمستخدم
    const { data: existingActive, error: existingError } = await supabaseClient
      .from("petty_cash_funds")
      .select("id")
      .eq("status", "active")
      .maybeSingle();

    if (existingError) {
      console.error("Error checking existing active fund:", existingError);
    } else if (existingActive) {
      fundFormError.textContent = "فيه عهدة نشطة بالفعل. يجب إغلاقها أولًا (استنفادًا أو إغلاقًا) قبل إنشاء عهدة جديدة.";
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
        // Race condition: اتعمل عهدة نشطة بين الفحص المسبق والإدخال
        fundFormError.textContent = "فيه عهدة نشطة بالفعل. يجب إغلاقها أولًا قبل إنشاء عهدة جديدة.";
      } else if (error.code === "23505") {
        fundFormError.textContent = "حدث تعارض بسيط في البيانات. يُرجى المحاولة مرة أخرى.";
      } else if (
        error.code === "42501" ||
        (error.message && error.message.toLowerCase().includes("row-level security"))
      ) {
        fundFormError.textContent = "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك).";
      } else {
        fundFormError.textContent = "حصل خطأ أثناء الحفظ: " + error.message;
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
          : "حصل خطأ أثناء الإغلاق: " + error.message;
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
    topupFundError.textContent = "المبلغ المضاف لازم يكون رقم أكبر من صفر.";
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
          : "حصل خطأ أثناء الإضافة: " + error.message;
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
// 6.4c إلغاء عهدة اتعملت بالغلط — متاح بس لو مفيش مصروفات مسجّلة عليها
//      (لو فيه مصروفات، لازم "إغلاق" عادي بدل الإلغاء عشان نحافظ على السجل)
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
          ? "قيمة الحالة 'ملغاة' لسه مش مضافة في قاعدة البيانات — شغّل استعلام القسم 13 في schema.sql الأول."
          : error.code === "42501" ||
            (error.message && error.message.toLowerCase().includes("row-level security"))
          ? "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك)."
          : "حصل خطأ أثناء الإلغاء: " + error.message;
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
      "💰",
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
      "id, expense_date, amount, description, status, created_by, " +
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

  // توزيع المصروفات حسب الفئة — محسوب من نفس النتائج اللي جبناها فوق،
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
const expenseFormFundInfo = document.getElementById("expense-form-fund-info");
const expenseFormCategorySelect = document.getElementById("expense-form-category");
const expenseFormAmountInput = document.getElementById("expense-form-amount");
const expenseFormDateInput = document.getElementById("expense-form-date");
const expenseFormDescriptionInput = document.getElementById("expense-form-description");
const expenseFormError = document.getElementById("expense-form-error");
const expenseFormSubmitButton = document.getElementById("expense-form-submit");

// عناصر Modal تأكيد إلغاء مصروف
const expenseVoidModal = document.getElementById("expense-void-modal");
const expenseVoidReasonInput = document.getElementById("expense-void-reason");
const expenseVoidError = document.getElementById("expense-void-error");
const expenseVoidConfirmButton = document.getElementById("expense-void-confirm");

let expenseBeingVoided = null;
let expenseFormActiveFund = null; // الصندوق النشط وقت فتح فورم إضافة المصروف

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

  const activeOptions = expenseCategoriesCache
    .filter((c) => c.is_active)
    .map((c) => '<option value="' + c.id + '">' + escapeHtml(c.name_ar || c.name) + "</option>")
    .join("");
  expenseFormCategorySelect.innerHTML = '<option value="">اختر الفئة</option>' + activeOptions;

  return expenseCategoriesCache;
}

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
      "<td>" + escapeHtml(expense.description || "—") + "</td>";

    if (showFund) {
      cells += "<td>" + escapeHtml(fundCode) + "</td>";
    }

    cells +=
      "<td>" + escapeHtml(creatorName) + "</td>" +
      '<td><span class="status-badge ' + statusClass + '">' + statusLabel + "</span></td>";

    if (showActions) {
      let actionsHtml = '<span class="text-muted">—</span>';
      if (isSuperAdmin && !isVoided) {
        actionsHtml = '<button type="button" class="btn-danger btn-sm expense-void-btn">إلغاء</button>';
      }
      cells += '<td class="actions-cell">' + actionsHtml + "</td>";
    }

    tr.innerHTML = cells;

    if (showActions && isSuperAdmin && !isVoided) {
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
      "id, expense_date, amount, description, status, created_by, category_id, petty_cash_fund_id, " +
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
      setExpensesState("لا توجد نتائج مطابقة للفلاتر المحددة.");
    } else {
      const isSuperAdmin = !!(currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "admin"));
      showRichEmptyState(
        expensesStateBox,
        "🧾",
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
// 7.5 إضافة مصروف — Super Admin فقط، مربوط تلقائيًا بالصندوق النشط الحالي
// ---------------------------------------------------------------------------

addExpenseButton.addEventListener("click", async () => {
  expenseFormError.hidden = true;
  expenseFormError.textContent = "";
  expenseForm.reset();

  await ensureExpenseCategories();

  // نجيب أحدث بيانات للصندوق النشط وقت فتح الفورم (مش من الكاش القديم)
  await loadCurrentFund();
  expenseFormActiveFund = currentActiveFund;

  if (!expenseFormActiveFund) {
    expenseFormFundInfo.textContent = "";
    expenseFormFundInfo.hidden = true;
    expenseFormError.textContent = "لا توجد عهدة نقدية نشطة لتسجيل مصروف عليها.";
    expenseFormError.hidden = false;
    expenseFormSubmitButton.disabled = true;
  } else {
    expenseFormFundInfo.hidden = false;
    expenseFormSubmitButton.disabled = false;
    updateExpenseBalancePreview();
  }

  expenseFormModal.hidden = false;
});

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

  expenseFormFundInfo.innerHTML =
    '<span>سيتم تسجيل هذا المصروف على العهدة: <strong>' + escapeHtml(expenseFormActiveFund.fund_code) + "</strong></span><br>" +
    '<span>الرصيد الحالي: ' + formatNumber(currentBalance, 2) + " ر.س</span>" +
    (hasValidAmount
      ? "<br><span>المصروف: " + formatNumber(amount, 2) + " ر.س</span>" +
        '<br><span' + (isInsufficient ? ' style="color: var(--color-danger-text); font-weight: 700;"' : "") + '>الرصيد بعد العملية: ' +
        formatNumber(afterBalance, 2) + " ر.س</span>"
      : "");
}

expenseFormAmountInput.addEventListener("input", updateExpenseBalancePreview);

expenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  expenseFormError.hidden = true;
  expenseFormError.textContent = "";

  if (!expenseFormActiveFund) {
    expenseFormError.textContent = "لا توجد عهدة نقدية نشطة لتسجيل مصروف عليها.";
    expenseFormError.hidden = false;
    return;
  }

  const categoryId = expenseFormCategorySelect.value;
  const amount = Number(expenseFormAmountInput.value);
  const date = expenseFormDateInput.value;
  const description = expenseFormDescriptionInput.value.trim();

  if (!categoryId) {
    expenseFormError.textContent = "الفئة مطلوبة.";
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
    // الرصيد يبقى سالب في حالة تعديلات متزامنة)
    const { data: freshBalance, error: freshBalanceError } = await supabaseClient
      .from("petty_cash_fund_balances")
      .select("current_balance")
      .eq("fund_id", expenseFormActiveFund.id)
      .single();

    if (freshBalanceError) {
      console.error("Error re-checking fund balance:", freshBalanceError);
    } else if (amount > Number(freshBalance.current_balance)) {
      expenseFormError.textContent =
        "المبلغ المطلوب أكبر من الرصيد المتاح في العهدة (" +
        formatNumber(freshBalance.current_balance, 2) +
        " ر.س). لا يمكن أن يكون الرصيد الناتج سالبًا.";
      expenseFormError.hidden = false;
      return;
    }

    const payload = {
      petty_cash_fund_id: expenseFormActiveFund.id,
      category_id: categoryId,
      amount: amount,
      expense_date: date,
      description: description || null,
      created_by: currentAuthUser ? currentAuthUser.id : null,
    };

    const { error } = await supabaseClient.from("expenses").insert(payload);

    if (error) {
      console.error("Error saving expense:", error);

      if (
        error.code === "42501" ||
        (error.message && error.message.toLowerCase().includes("row-level security"))
      ) {
        expenseFormError.textContent = "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك).";
      } else if (error.code === "23503") {
        expenseFormError.textContent = "الفئة أو العهدة المرتبطة غير موجودة فعليًا.";
      } else if (error.code === "23514") {
        expenseFormError.textContent = "البيانات المدخلة لا تحقق شروط الصحة (تأكد من المبلغ).";
      } else {
        expenseFormError.textContent = "حصل خطأ أثناء الحفظ: " + error.message;
      }

      expenseFormError.hidden = false;
      return;
    }

    expenseFormModal.hidden = true;
    loadExpenses();
    loadCurrentFund();
  } catch (unexpectedError) {
    console.error("Unexpected error saving expense:", unexpectedError);
    expenseFormError.textContent = "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
    expenseFormError.hidden = false;
  } finally {
    expenseFormSubmitButton.disabled = false;
    expenseFormSubmitButton.textContent = "حفظ";
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
          : "حصل خطأ أثناء الإلغاء: " + error.message;
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
}

// ============================================================================
// 8b. أداة رسم بياني بسيطة بـ Canvas API — بدون أي مكتبة خارجية عبر CDN،
//     حفاظًا على بساطة المشروع. تستخدم ألوان النظام الحالية (CSS variables)،
//     تدعم tooltip عند hover، وتعيد رسم نفسها تلقائيًا عند تغيير حجم الشاشة.
//     هذا كود عرض بصري بحت (Presentation) ولا يغيّر أي منطق أعمال — البيانات
//     المُغذّية له بتيجي من نفس الاستعلامات الموجودة بالفعل في كل تقرير.
// ============================================================================

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#000000";
}

const chartRegistry = [];

function registerChart(canvas, drawFn) {
  // لو نفس الـ canvas اتسجل قبل كده (إعادة تحميل نفس التقرير)، نستبدل
  // دالة الرسم القديمة بدل ما نكدّس listeners/إدخالات من غير داعي
  const existing = chartRegistry.find((c) => c.canvas === canvas);
  if (existing) {
    existing.draw = drawFn;
  } else {
    chartRegistry.push({ canvas, draw: drawFn });
  }
  drawFn();
}

let chartResizeDebounce;
window.addEventListener("resize", () => {
  clearTimeout(chartResizeDebounce);
  chartResizeDebounce = setTimeout(() => {
    chartRegistry.forEach((c) => {
      if (c.canvas.isConnected) c.draw();
    });
  }, 150);
});

function setupCanvasSize(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const width = Math.max(rect.width, 40);
  const height = Math.max(rect.height, 40);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

function chartTooltipEl() {
  let el = document.getElementById("chart-tooltip");
  if (!el) {
    el = document.createElement("div");
    el.id = "chart-tooltip";
    el.className = "chart-tooltip";
    el.hidden = true;
    document.body.appendChild(el);
  }
  return el;
}

function showChartTooltip(clientX, clientY, text) {
  const el = chartTooltipEl();
  el.textContent = text;
  el.style.left = clientX + 14 + "px";
  el.style.top = clientY + 14 + "px";
  el.hidden = false;
}

function hideChartTooltip() {
  chartTooltipEl().hidden = true;
}

const ARABIC_MONTHS_SHORT = ["ينا", "فبر", "مار", "أبر", "ماي", "يون", "يول", "أغس", "سبت", "أكت", "نوف", "ديس"];

// تجميع مجموع قيمة (زي liters/amount) حسب الشهر من صفوف فيها حقل تاريخ —
// مستخدمة في رسوم اتجاه الوقود والمصروفات الشهرية. بترجع مصفوفتين متوازيتين
// (تسميات + قيم) مرتبة زمنيًا تصاعديًا، من غير أي بيانات وهمية — لو مفيش
// صفوف، بترجع مصفوفات فاضية والدالة المستدعية بتتعامل مع الحالة دي.
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
    return ARABIC_MONTHS_SHORT[Number(m) - 1] + " " + y.slice(2);
  });
  const values = keys.map((k) => totals[k]);
  return { labels, values };
}

// ---------------------------------------------------------------------------
// جلب كل الصفوف المطابقة لاستعلام مهما كان عددها، بدل الاكتفاء بأول 1000
// صف (الحد الافتراضي لـ PostgREST). لازم ندي دالة بتبني استعلام جديد في كل
// مرة (من غير .range()) لأن نفس الـ query object مايتعادش استخدامه.
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

const CHART_PALETTE = [
  cssVar("--color-primary"),
  cssVar("--color-accent"),
  cssVar("--color-success-text"),
  cssVar("--color-warning-text"),
  cssVar("--color-danger-text"),
  cssVar("--color-neutral-text"),
  cssVar("--color-primary-dark"),
];

// ---------------------------------------------------------------------------
// رسم خطي (Line Chart) — للاتجاهات الزمنية، وبيُستخدم كذلك كـ Sparkline
// مصغّر عند تمرير sparkline:true (بدون شبكة/تسميات/حواف)
// ---------------------------------------------------------------------------
function drawLineChart(canvas, values, labels, options) {
  const opts = options || {};

  const draw = () => {
    const { ctx, width, height } = setupCanvasSize(canvas);
    if (!values.length) return;

    const sparkline = !!opts.sparkline;
    const padding = sparkline
      ? { top: 2, right: 2, bottom: 2, left: 2 }
      : { top: 12, right: 12, bottom: 26, left: 46 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const maxVal = Math.max(...values, 1);
    const minVal = Math.min(0, ...values);
    const range = maxVal - minVal || 1;

    const stepX = values.length > 1 ? chartW / (values.length - 1) : 0;
    const points = values.map((v, i) => ({
      x: padding.left + i * stepX,
      y: padding.top + chartH - ((v - minVal) / range) * chartH,
      value: v,
    }));

    if (!sparkline) {
      ctx.strokeStyle = cssVar("--color-border");
      ctx.lineWidth = 1;
      const gridLines = 3;
      ctx.fillStyle = cssVar("--color-text-muted");
      ctx.font = "11px " + cssVar("--font-body");
      ctx.textAlign = "left";
      for (let i = 0; i <= gridLines; i++) {
        const y = padding.top + (chartH / gridLines) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
        const labelVal = maxVal - (range / gridLines) * i;
        ctx.fillText(formatNumber(labelVal, 0), 2, y + 3);
      }
    }

    // تعبئة متدرجة تحت الخط
    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    gradient.addColorStop(0, cssVar("--color-primary-light"));
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
    ctx.lineTo(points[0].x, padding.top + chartH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // الخط نفسه
    ctx.strokeStyle = cssVar("--color-primary");
    ctx.lineWidth = sparkline ? 1.5 : 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    if (!sparkline) {
      ctx.fillStyle = cssVar("--color-primary");
      points.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      if (labels && labels.length === values.length) {
        ctx.fillStyle = cssVar("--color-text-muted");
        ctx.font = "11px " + cssVar("--font-body");
        ctx.textAlign = "center";
        points.forEach((p, i) => {
          ctx.fillText(labels[i], p.x, height - 8);
        });
      }
    }

    canvas._chartPoints = points;
    canvas._chartLabels = labels || [];
    canvas._chartFormat = opts.formatValue || ((v) => formatNumber(v, 1));
  };

  registerChart(canvas, draw);

  if (!opts.sparkline && !canvas._hasHoverHandler) {
    canvas._hasHoverHandler = true;
    canvas.addEventListener("mousemove", (event) => {
      const points = canvas._chartPoints;
      if (!points || !points.length) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      let nearestIndex = 0;
      let minDist = Infinity;
      points.forEach((p, i) => {
        const dist = Math.abs(p.x - mouseX);
        if (dist < minDist) {
          minDist = dist;
          nearestIndex = i;
        }
      });
      const label = canvas._chartLabels[nearestIndex] || "";
      const text = (label ? label + ": " : "") + canvas._chartFormat(points[nearestIndex].value);
      showChartTooltip(event.clientX, event.clientY, text);
    });
    canvas.addEventListener("mouseleave", hideChartTooltip);
  }
}

// ---------------------------------------------------------------------------
// رسم أعمدة (Bar Chart) — رأسي أو أفقي عبر options.horizontal
// ---------------------------------------------------------------------------
function drawBarChart(canvas, values, labels, options) {
  const opts = options || {};
  const horizontal = !!opts.horizontal;

  const draw = () => {
    const { ctx, width, height } = setupCanvasSize(canvas);
    if (!values.length) return;

    const maxVal = Math.max(...values, 1);
    const bars = [];

    if (horizontal) {
      const padding = { top: 8, right: 50, bottom: 8, left: 90 };
      const chartW = width - padding.left - padding.right;
      const chartH = height - padding.top - padding.bottom;
      const barGap = 8;
      const barH = Math.max(6, chartH / values.length - barGap);

      ctx.font = "11px " + cssVar("--font-body");
      values.forEach((v, i) => {
        const barW = (v / maxVal) * chartW;
        const y = padding.top + i * (barH + barGap);
        const x = padding.left;

        ctx.fillStyle = cssVar("--color-text-muted");
        ctx.textAlign = "right";
        const label = (labels && labels[i]) || "";
        ctx.fillText(label.length > 12 ? label.slice(0, 11) + "…" : label, padding.left - 8, y + barH / 2 + 4);

        ctx.fillStyle = cssVar("--color-primary");
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x, y, Math.max(barW, 2), barH, 4) : ctx.rect(x, y, Math.max(barW, 2), barH);
        ctx.fill();

        ctx.fillStyle = cssVar("--color-text");
        ctx.textAlign = "left";
        ctx.fillText(formatNumber(v, 1), x + barW + 6, y + barH / 2 + 4);

        bars.push({ x, y, w: barW, h: barH, value: v, label });
      });
    } else {
      const padding = { top: 12, right: 12, bottom: 26, left: 46 };
      const chartW = width - padding.left - padding.right;
      const chartH = height - padding.top - padding.bottom;
      const barGap = 10;
      const barW = Math.max(6, chartW / values.length - barGap);

      ctx.strokeStyle = cssVar("--color-border");
      ctx.lineWidth = 1;
      ctx.fillStyle = cssVar("--color-text-muted");
      ctx.font = "11px " + cssVar("--font-body");
      ctx.textAlign = "left";
      const gridLines = 3;
      for (let i = 0; i <= gridLines; i++) {
        const y = padding.top + (chartH / gridLines) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
        ctx.fillText(formatNumber(maxVal - (maxVal / gridLines) * i, 0), 2, y + 3);
      }

      values.forEach((v, i) => {
        const barH = (v / maxVal) * chartH;
        const x = padding.left + i * (barW + barGap) + barGap / 2;
        const y = padding.top + chartH - barH;

        ctx.fillStyle = cssVar("--color-primary");
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x, y, barW, Math.max(barH, 2), 4) : ctx.rect(x, y, barW, Math.max(barH, 2));
        ctx.fill();

        if (labels && labels[i]) {
          ctx.fillStyle = cssVar("--color-text-muted");
          ctx.textAlign = "center";
          ctx.font = "11px " + cssVar("--font-body");
          ctx.fillText(labels[i], x + barW / 2, height - 8);
        }

        bars.push({ x, y, w: barW, h: barH, value: v, label: (labels && labels[i]) || "" });
      });
    }

    canvas._chartBars = bars;
    canvas._chartFormat = opts.formatValue || ((v) => formatNumber(v, 1));
  };

  registerChart(canvas, draw);

  if (!canvas._hasHoverHandler) {
    canvas._hasHoverHandler = true;
    canvas.addEventListener("mousemove", (event) => {
      const bars = canvas._chartBars;
      if (!bars || !bars.length) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const hit = bars.find((b) => mouseX >= b.x && mouseX <= b.x + b.w && mouseY >= b.y && mouseY <= b.y + b.h);
      if (!hit) {
        hideChartTooltip();
        return;
      }
      const text = (hit.label ? hit.label + ": " : "") + canvas._chartFormat(hit.value);
      showChartTooltip(event.clientX, event.clientY, text);
    });
    canvas.addEventListener("mouseleave", hideChartTooltip);
  }
}

// ---------------------------------------------------------------------------
// رسم دائري/Donut — لأكثر من قطاع (توزيع فئات) أو قطاعين بس (نسبة صرف)
// segments: [{ label, value, color? }]
// ---------------------------------------------------------------------------
function drawDonutChart(canvas, segments, options) {
  const opts = options || {};

  const draw = () => {
    const { ctx, width, height } = setupCanvasSize(canvas);
    const total = segments.reduce((sum, s) => sum + Math.max(s.value, 0), 0);
    if (!total) return;

    const cx = width / 2;
    const cy = height / 2;
    const outerR = Math.min(width, height) / 2 - 4;
    const innerR = outerR * (opts.thickness || 0.62);

    let startAngle = -Math.PI / 2;
    const arcs = [];

    segments.forEach((seg, i) => {
      const sliceAngle = (Math.max(seg.value, 0) / total) * Math.PI * 2;
      const endAngle = startAngle + sliceAngle;
      const color = seg.color || CHART_PALETTE[i % CHART_PALETTE.length];

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerR, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      arcs.push({ start: startAngle, end: endAngle, label: seg.label, value: seg.value, color });
      startAngle = endAngle;
    });

    // فتحة Donut في المنتصف بلون الخلفية
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = cssVar("--color-surface");
    ctx.fill();

    canvas._chartArcs = arcs;
    canvas._chartCenter = { cx, cy, innerR, outerR };
    canvas._chartFormat = opts.formatValue || ((v) => formatNumber(v, 1));
  };

  registerChart(canvas, draw);

  if (!canvas._hasHoverHandler) {
    canvas._hasHoverHandler = true;
    canvas.addEventListener("mousemove", (event) => {
      const arcs = canvas._chartArcs;
      const center = canvas._chartCenter;
      if (!arcs || !center) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left - center.cx;
      const mouseY = event.clientY - rect.top - center.cy;
      const dist = Math.sqrt(mouseX * mouseX + mouseY * mouseY);
      if (dist < center.innerR || dist > center.outerR) {
        hideChartTooltip();
        return;
      }
      let angle = Math.atan2(mouseY, mouseX);
      if (angle < -Math.PI / 2) angle += Math.PI * 2;
      const hit = arcs.find((a) => angle >= a.start && angle <= a.end);
      if (!hit) {
        hideChartTooltip();
        return;
      }
      const text = hit.label + ": " + canvas._chartFormat(hit.value);
      showChartTooltip(event.clientX, event.clientY, text);
    });
    canvas.addEventListener("mouseleave", hideChartTooltip);
  }
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
const dashboardActivityList = document.getElementById("dashboard-activity-list");
const dashboardActivityState = document.getElementById("dashboard-activity-state");
const dashboardAttentionContainer = document.getElementById("dashboard-attention");
const dashboardSmartSummaryList = document.getElementById("dashboard-smart-summary");

// الانتقال لصفحة السيارات مع تطبيق فلتر حالة معيّن مباشرة — تُستخدم من
// أزرار "الأشياء التي تحتاج الانتباه" في لوحة الرئيسية
function goToVehiclesWithStatusFilter(status) {
  navigateTo("vehicles");
  vehiclesStatusFilter.value = status;
  vehiclesState.status = status;
  vehiclesState.page = 1;
  loadVehicles();
}

function statCardHtml(icon, label, value, hint, extraHtml) {
  return (
    '<div class="stat-card">' +
    (icon ? '<span class="card-icon" aria-hidden="true">' + icon + "</span>" : "") +
    '<span class="stat-card-label">' + escapeHtml(label) + "</span>" +
    '<span class="stat-card-value">' + value + "</span>" +
    (hint ? '<span class="stat-card-hint">' + escapeHtml(hint) + "</span>" : "") +
    (extraHtml || "") +
    "</div>"
  );
}

// مؤشر اتجاه بسيط (▲/▼) بمقارنة القيمة الحالية بالشهر السابق — بيانات
// حقيقية فقط من قاعدة البيانات؛ لو مفيش بيانات كافية للشهر السابق
// (صفر أو غير موجودة)، بيتم تجاهل المؤشر تمامًا بدل اختلاق نسبة
function trendBadgeHtml(current, previous) {
  if (!previous || previous <= 0) return "";
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 0.5) {
    return '<span class="trend-badge trend-flat">≈ بدون تغيير عن الشهر السابق</span>';
  }
  const isUp = change > 0;
  const cls = isUp ? "trend-up" : "trend-down";
  const arrow = isUp ? "▲" : "▼";
  return (
    '<span class="trend-badge ' + cls + '">' + arrow + " " + formatNumber(Math.abs(change), 0) + "% عن الشهر السابق</span>"
  );
}

function previousMonthRange() {
  const now = new Date();
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const start = prevMonthDate.getFullYear() + "-" + String(prevMonthDate.getMonth() + 1).padStart(2, "0") + "-01";
  return { start, endExclusive: currentMonthStartDate() };
}

// خط اتجاه مصغّر (Sparkline) لآخر 7 أيام — بيانات حقيقية فقط، ولو مفيش أي
// نشاط فعلي خلال الفترة بيتم إخفاء الـ Sparkline بدل رسم خط مسطح على صفر
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
      drawLineChart(fuelCanvas, fuelValues, days, { sparkline: true });
    } else {
      fuelCanvas.closest(".sparkline-wrapper").hidden = true;
    }
  }

  if (expCanvas) {
    if (expValues.some((v) => v > 0)) {
      drawLineChart(expCanvas, expValues, days, { sparkline: true });
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

async function loadDashboardStats() {
  dashboardStatsContainer.innerHTML = skeletonCardsHtml(4, "stat-cards-grid", "stat-card");

  const monthStart = currentMonthStartDate();
  const { start: prevMonthStart, endExclusive: prevMonthEnd } = previousMonthRange();

  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const thirtyDaysFromNowStr = thirtyDaysFromNow.toISOString().slice(0, 10);

  const [vehiclesRes, fuelRes, expensesRes, prevFuelRes, prevExpensesRes, authExpiryRes] = await Promise.all([
    supabaseClient.from("vehicles").select("status"),
    supabaseClient
      .from("fuel_transactions")
      .select("liters, amount, vehicle:vehicles ( license_plate )")
      .eq("status", "active")
      .gte("transaction_date", monthStart),
    supabaseClient
      .from("expenses")
      .select("amount, category:expense_categories ( name, name_ar )")
      .eq("status", "active")
      .gte("expense_date", monthStart),
    // بيانات الشهر السابق — تُستخدم فقط لحساب مؤشر الاتجاه (▲/▼)، ولو
    // فشل الاستعلام أو كانت النتيجة صفر بيتم تجاهل المؤشر تمامًا
    supabaseClient
      .from("fuel_transactions")
      .select("amount")
      .eq("status", "active")
      .gte("transaction_date", prevMonthStart)
      .lt("transaction_date", prevMonthEnd),
    supabaseClient
      .from("expenses")
      .select("amount")
      .eq("status", "active")
      .gte("expense_date", prevMonthStart)
      .lt("expense_date", prevMonthEnd),
    // سيارات عليها تفويض قيادة منتهي أو هينتهي خلال 30 يوم — لعرضها في
    // "الأشياء التي تحتاج الانتباه" تحت
    supabaseClient
      .from("vehicles")
      .select("id, license_plate, authorization_expiry_date")
      .not("authorization_expiry_date", "is", null)
      .lte("authorization_expiry_date", thirtyDaysFromNowStr),
  ]);

  // لازم نسجّل ونعرض أي خطأ هنا بوضوح — من غير كده لو استعلام فشل بصمت
  // كان هيظهر "0 سيارات" أو رقم غلط يتعارض مع الرقم الحقيقي في صفحة
  // السيارات نفسها، من غير ما المستخدم يعرف إن فيه مشكلة أصلًا
  if (vehiclesRes.error) console.error("Error loading vehicles stats:", vehiclesRes.error);
  if (fuelRes.error) console.error("Error loading fuel stats:", fuelRes.error);
  if (expensesRes.error) console.error("Error loading expenses stats:", expensesRes.error);
  if (prevFuelRes.error) console.error("Error loading previous month fuel stats:", prevFuelRes.error);
  if (prevExpensesRes.error) console.error("Error loading previous month expenses stats:", prevExpensesRes.error);
  if (authExpiryRes.error) console.error("Error loading vehicle authorization expiry stats:", authExpiryRes.error);

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

  // تفويض القيادة: منتهي فعلاً (قبل النهارده) مقابل هينتهي خلال 30 يوم
  const todayStr = new Date().toISOString().slice(0, 10);
  const authExpiryRows = authExpiryRes.data || [];
  const expiredAuthVehicles = authExpiryRows.filter((v) => v.authorization_expiry_date < todayStr);
  const expiringSoonAuthVehicles = authExpiryRows.filter((v) => v.authorization_expiry_date >= todayStr);

  const fuelRows = fuelRes.data || [];
  const monthLiters = fuelRows.reduce((sum, r) => sum + Number(r.liters || 0), 0);
  const monthFuelCost = fuelRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);

  // أعلى سيارة تكلفة وقود هذا الشهر — بيانات حقيقية فقط من المعاملات
  // المحمّلة أصلًا لكروت لوحة الرئيسية، من غير أي استعلام إضافي
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

  dashboardStatsContainer.innerHTML =
    statCardHtml(
      "🚗",
      "السيارات",
      vehiclesRes.error ? "—" : String(totalVehicles),
      vehiclesRes.error
        ? "تعذر تحميل بيانات السيارات، حاول تحديث الصفحة"
        : totalVehicles
        ? assignedCount + " مخصصة — " + maintenanceCount + " تحت الصيانة"
        : "لا توجد سيارات مضافة بعد"
    ) +
    statCardHtml(
      "⛽",
      "الوقود هذا الشهر",
      fuelRes.error ? "—" : formatNumber(monthLiters, 1) + " لتر",
      fuelRes.error ? "تعذر تحميل بيانات الوقود، حاول تحديث الصفحة" : "التكلفة: " + formatNumber(monthFuelCost, 2) + " ر.س",
      (fuelRes.error ? "" : trendBadgeHtml(monthFuelCost, prevMonthFuelCost)) +
        (fuelRes.error ? "" : '<div class="sparkline-wrapper"><canvas id="dashboard-fuel-sparkline"></canvas></div>')
    ) +
    statCardHtml(
      "💰",
      "رصيد العهدة النشطة",
      currentActiveFund ? formatNumber(currentActiveFund.current_balance, 2) + " ر.س" : "لا توجد عهدة نشطة",
      currentActiveFund ? "العهدة: " + currentActiveFund.fund_code : ""
    ) +
    statCardHtml(
      "🧾",
      "مصروفات هذا الشهر",
      expensesRes.error ? "—" : formatNumber(monthExpenseTotal, 2) + " ر.س",
      expensesRes.error
        ? "تعذر تحميل بيانات المصروفات، حاول تحديث الصفحة"
        : topCategoryEntry
        ? "أعلى فئة: " + topCategoryEntry[0]
        : "لا توجد مصروفات بعد",
      (expensesRes.error ? "" : trendBadgeHtml(monthExpenseTotal, prevMonthExpenseTotal)) +
        (expensesRes.error ? "" : '<div class="sparkline-wrapper"><canvas id="dashboard-expenses-sparkline"></canvas></div>')
    );

  if (!fuelRes.error || !expensesRes.error) loadDashboardSparklines();

  renderDashboardAttention({
    maintenanceCount,
    vehiclesOk: !vehiclesRes.error,
    expiredAuthVehicles,
    expiringSoonAuthVehicles,
    authExpiryOk: !authExpiryRes.error,
  });

  renderDashboardSmartSummary({
    expensesOk: !expensesRes.error,
    monthExpenseTotal,
    prevMonthExpenseTotal,
    topVehicleFuelEntry,
    fuelOk: !fuelRes.error,
  });

  loadDashboardActivity();
}

// ---------------------------------------------------------------------------
// 9.1 الأشياء التي تحتاج الانتباه — تُبنى فقط من حالات حقيقية محسوبة من
// البيانات المحمّلة أصلًا لهذه الصفحة؛ لو مفيش أي حالة تستدعي انتباهًا
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
          ? "تفويض قيادة سيارة واحدة (" + expiringSoonAuthVehicles[0].license_plate + ") هينتهي خلال 30 يوم."
          : "تفويض قيادة " + expiringSoonAuthVehicles.length + " سيارات هينتهي خلال 30 يوم.",
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
// 9.2 ملخص ذكي — جمل نصية مبنية فقط على بيانات حقيقية محمّلة أصلًا؛ أي
// مؤشر غير متوفر بيانات كافية له بيُعرض بنص صريح بدل رقم مختلق
// ---------------------------------------------------------------------------
function renderDashboardSmartSummary({ expensesOk, monthExpenseTotal, prevMonthExpenseTotal, topVehicleFuelEntry, fuelOk }) {
  const lines = [];

  lines.push(
    expensesOk
      ? monthExpenseTotal > 0
        ? "بلغ إجمالي المصروفات هذا الشهر " + formatNumber(monthExpenseTotal, 2) + " ر.س."
        : "لم تُسجَّل أي مصروفات هذا الشهر بعد."
      : "لا تتوفر بيانات كافية لإنتاج هذا المؤشر."
  );

  if (fuelOk && topVehicleFuelEntry) {
    lines.push(
      "سجلت السيارة " + topVehicleFuelEntry[0] + " أعلى تكلفة وقود هذا الشهر بقيمة " +
        formatNumber(topVehicleFuelEntry[1], 2) + " ر.س."
    );
  } else {
    lines.push("لا تتوفر بيانات كافية لإنتاج هذا المؤشر.");
  }

  if (expensesOk && prevMonthExpenseTotal > 0) {
    const change = ((monthExpenseTotal - prevMonthExpenseTotal) / prevMonthExpenseTotal) * 100;
    if (Math.abs(change) < 0.5) {
      lines.push("استقر الإنفاق هذا الشهر مقارنة بالشهر السابق تقريبًا.");
    } else {
      lines.push(
        (change > 0 ? "ارتفع" : "انخفض") + " الإنفاق بنسبة " + formatNumber(Math.abs(change), 0) +
          "% مقارنة بالشهر السابق."
      );
    }
  } else {
    lines.push("لا تتوفر بيانات كافية لإنتاج هذا المؤشر.");
  }

  if (currentActiveFund && currentActiveFund.opening_amount > 0) {
    const usagePercent = (Number(currentActiveFund.total_expenses || 0) / Number(currentActiveFund.opening_amount)) * 100;
    lines.push(
      "بلغت نسبة استخدام العهدة الحالية (" + currentActiveFund.fund_code + ") " +
        formatNumber(usagePercent, 0) + "%."
    );
  } else {
    lines.push("لا تتوفر بيانات كافية لإنتاج هذا المؤشر.");
  }

  dashboardSmartSummaryList.innerHTML = lines
    .map(
      (line) =>
        '<li class="smart-summary-item' + (line.startsWith("لا تتوفر") ? " is-empty" : "") + '">' +
        escapeHtml(line) +
        "</li>"
    )
    .join("");
}

// العنصر المرتبط بعملية سجل العمليات — مبني فقط على الحقول الموجودة
// فعليًا داخل بيانات الصف نفسه (new_data أولاً، وإلا old_data)، من غير أي
// استعلام إضافي أو بيانات مختلقة؛ لو الحقل غير متوفر بيرجّع فاضي
function dashboardActivityRelatedLabel(row) {
  const data = row.new_data || row.old_data;
  if (!data) return "";
  switch (row.entity_type) {
    case "vehicles":
      return data.license_plate ? "السيارة " + data.license_plate : "";
    case "fuel_transactions":
      return data.liters ? formatNumber(data.liters, 1) + " لتر" : "";
    case "petty_cash_funds":
      return data.fund_code || "";
    case "expenses":
      return data.amount ? formatNumber(data.amount, 2) + " ر.س" : "";
    default:
      return "";
  }
}

async function loadDashboardActivity() {
  dashboardActivityList.innerHTML = skeletonActivityItemsHtml(4);
  dashboardActivityState.hidden = true;

  const isSuperAdmin = !!(currentProfile && currentProfile.role === "super_admin");

  if (isSuperAdmin) {
    const { data, error } = await supabaseClient
      .from("audit_logs")
      .select("id, action, entity_type, new_data, old_data, created_at, user_id")
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) {
      console.error("Error loading dashboard activity:", error);
      dashboardActivityState.textContent = "حصل خطأ أثناء تحميل آخر العمليات.";
      return;
    }

    if (!data || data.length === 0) {
      dashboardActivityState.textContent = "لا توجد عمليات مسجّلة بعد.";
      return;
    }

    const creatorMap = await fetchCreatorNames(data.map((d) => d.user_id));
    dashboardActivityState.hidden = true;
    dashboardActivityList.innerHTML = data
      .map((row) => {
        const relatedLabel = dashboardActivityRelatedLabel(row);
        return (
          '<div class="activity-item">' +
          '<span class="activity-item-title">' + escapeHtml(AUDIT_ACTION_LABELS[row.action] || row.action) +
          (relatedLabel ? " — " + escapeHtml(relatedLabel) : "") + "</span>" +
          '<span class="activity-item-meta">' + escapeHtml(creatorMap[row.user_id] || "—") + " — " + formatDateTime(row.created_at) + "</span>" +
          "</div>"
        );
      })
      .join("");
    return;
  }

  // Manager: مفيش صلاحية على audit_logs، فبنعرض ملخص عام من بيانات هو
  // أصلاً مصرّح له يشوفها (آخر معاملات وقود ومصروفات)
  const [fuelRes, expensesRes] = await Promise.all([
    supabaseClient
      .from("fuel_transactions")
      .select("id, amount, created_at")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(4),
    supabaseClient
      .from("expenses")
      .select("id, amount, created_at")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const items = [
    ...(fuelRes.data || []).map((r) => ({
      title: "معاملة وقود بقيمة " + formatNumber(r.amount, 2) + " ر.س",
      time: r.created_at,
    })),
    ...(expensesRes.data || []).map((r) => ({
      title: "مصروف بقيمة " + formatNumber(r.amount, 2) + " ر.س",
      time: r.created_at,
    })),
  ]
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, 8);

  if (!items.length) {
    dashboardActivityState.textContent = "لا توجد أنشطة حديثة.";
    return;
  }

  dashboardActivityState.hidden = true;
  dashboardActivityList.innerHTML = items
    .map(
      (item) =>
        '<div class="activity-item">' +
        '<span class="activity-item-title">' + escapeHtml(item.title) + "</span>" +
        '<span class="activity-item-meta">' + formatDateTime(item.time) + "</span>" +
        "</div>"
    )
    .join("");
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
    setReportState(reportVehiclesState, "حصل خطأ أثناء تحميل التقرير.");
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
    statCardHtml("🚗", "إجمالي السيارات", String(reportVehiclesRows.length), "") +
    statCardHtml("📍", "مخصصة", String(counts.assigned), "") +
    statCardHtml("✅", "متاحة", String(counts.available), "") +
    statCardHtml("🔧", "تحت الصيانة", String(counts.under_maintenance), "") +
    statCardHtml("⛔", "خارج الخدمة", String(counts.out_of_service), "") +
    statCardHtml("📦", "مؤرشفة", String(counts.archived), "");

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
const reportFuelTrendChart = document.getElementById("report-fuel-trend-chart");
const reportFuelTrendState = document.getElementById("report-fuel-trend-state");
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
    setReportState(reportFuelTrendState, "تعذر تحميل بيانات اتجاه الاستهلاك.");
    setReportState(reportFuelTopUsersState, "تعذر تحميل بيانات الاستهلاك حسب المستخدم الفعلي.");
    setReportState(reportFuelByUserState, "تعذر تحميل بيانات الاستهلاك حسب المستخدم الفعلي.");
  } else {
    const rows = txRows || [];
    const totalLiters = rows.reduce((sum, r) => sum + Number(r.liters || 0), 0);
    const totalCost = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    reportFuelSummary.innerHTML =
      statCardHtml("⛽", "إجمالي اللترات (للفترة)", formatNumber(totalLiters, 2), "") +
      statCardHtml("💰", "إجمالي التكلفة (للفترة)", formatNumber(totalCost, 2) + " ر.س", "") +
      statCardHtml("🔢", "عدد المعاملات (للفترة)", String(rows.length), "");

    const monthly = groupSumByMonth(rows, "transaction_date", "liters");
    if (monthly.values.length < 2) {
      setReportState(reportFuelTrendState, "البيانات غير كافية لعرض اتجاه شهري (يلزم شهرين على الأقل).");
    } else {
      setReportState(reportFuelTrendState, null);
      drawLineChart(reportFuelTrendChart, monthly.values, monthly.labels, {
        formatValue: (v) => formatNumber(v, 1) + " لتر",
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
    setReportState(reportFuelState, "حصل خطأ أثناء تحميل جدول الوقود.");
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
    setReportState(reportPettyCashState, "حصل خطأ أثناء تحميل التقرير.");
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
    statCardHtml("💵", "إجمالي التمويل", formatNumber(totalFunded, 2) + " ر.س", "") +
    statCardHtml("🧾", "إجمالي المصروف", formatNumber(totalSpent, 2) + " ر.س", "") +
    statCardHtml("💰", "إجمالي الرصيد المتبقي", formatNumber(totalBalance, 2) + " ر.س", "");

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
    setReportState(reportExpensesState, "حصل خطأ أثناء تحميل التقرير.");
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
  drawDonutChart(
    reportExpensesCategoryChart,
    reportExpensesRows.map((c, i) => ({ label: c.name, value: c.total, color: CHART_PALETTE[i % CHART_PALETTE.length] })),
    { formatValue: (v) => formatNumber(v, 2) + " ر.س" }
  );
  renderChartLegend(reportExpensesCategoryLegend, reportExpensesRows.map((c, i) => ({
    label: c.name,
    color: CHART_PALETTE[i % CHART_PALETTE.length],
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
    statCardHtml("🧾", "إجمالي الإنفاق", formatNumber(totalSpending, 2) + " ر.س", "") +
    statCardHtml("🔢", "عدد المصروفات", String(rows.length), "") +
    statCardHtml("🏷️", "أعلى فئة إنفاقًا", reportExpensesRows[0] ? reportExpensesRows[0].name : "—", "");

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
// 10.5 نسخة احتياطية كاملة (Excel) — كل الجداول الأساسية في ملف واحد بعدة
// شيتات، مستقلة عن أي فلتر تاريخ في التبويبات فوق. بتستخدم fetchAllRowsPaged
// عشان محدش جدول يتقطع عند أول 1000 صف زي ما حصل قبل كده في التقارير
// ---------------------------------------------------------------------------

const fullBackupExportButton = document.getElementById("full-backup-export-button");

function addBackupSheet(workbook, sheetName, headers, rows) {
  const worksheet = workbook.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });
  worksheet.addRow(headers);
  worksheet.getRow(1).font = { bold: true };
  worksheet.columns = headers.map((h) => ({ width: Math.max(16, h.length + 4) }));
  rows.forEach((r) => worksheet.addRow(r));
}

async function exportFullBackupToExcel() {
  fullBackupExportButton.disabled = true;
  const originalLabel = fullBackupExportButton.textContent;
  fullBackupExportButton.textContent = "جارٍ التجهيز...";

  try {
    const [vehiclesRes, fuelRes, fundsRes, expensesRes, employeesRes] = await Promise.all([
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
      fetchAllRowsPaged(() =>
        supabaseClient
          .from("employees")
          .select("full_name, employee_code, phone, is_active")
          .order("full_name", { ascending: true })
      ),
    ]);

    if (
      vehiclesRes.error ||
      fuelRes.error ||
      fundsRes.error ||
      expensesRes.error ||
      employeesRes.error
    ) {
      console.error("Error exporting full backup:", {
        vehicles: vehiclesRes.error,
        fuel: fuelRes.error,
        funds: fundsRes.error,
        expenses: expensesRes.error,
        employees: employeesRes.error,
      });
      alert("حصل خطأ أثناء تجهيز النسخة الاحتياطية. حاول تاني.");
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

    addBackupSheet(
      workbook,
      "الموظفون",
      ["الاسم", "الرقم الوظيفي", "الهاتف", "نشط؟"],
      (employeesRes.data || []).map((emp) => [
        emp.full_name,
        emp.employee_code || "",
        emp.phone || "",
        emp.is_active ? "نعم" : "لا",
      ])
    );

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
    URL.revokeObjectURL(url);
  } catch (unexpectedError) {
    console.error("Unexpected error exporting full backup:", unexpectedError);
    alert("حصل خطأ أثناء تجهيز النسخة الاحتياطية. حاول تاني.");
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
      setAuditState("لا توجد نتائج مطابقة للفلاتر المحددة.");
    } else {
      showRichEmptyState(
        auditStateBox,
        "📜",
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

async function runGlobalSearch(term) {
  globalSearchResults.hidden = false;
  globalSearchResults.innerHTML = '<div class="search-results-state">جارٍ البحث...</div>';

  const likeTerm = "%" + term + "%";

  const [vehiclesRes, employeesRes, locationsRes] = await Promise.all([
    supabaseClient
      .from("vehicles")
      .select("id, license_plate, make, actual_user_name")
      .or("license_plate.ilike." + likeTerm + ",actual_user_name.ilike." + likeTerm)
      .limit(5),
    supabaseClient.from("employees").select("id, full_name").ilike("full_name", likeTerm).limit(5),
    supabaseClient.from("locations").select("id, name").ilike("name", likeTerm).limit(5),
  ]);

  if (vehiclesRes.error) console.error("Error searching vehicles:", vehiclesRes.error);
  if (employeesRes.error) console.error("Error searching employees:", employeesRes.error);
  if (locationsRes.error) console.error("Error searching locations:", locationsRes.error);

  const vehicles = vehiclesRes.data || [];
  const employees = employeesRes.data || [];
  const locations = locationsRes.data || [];

  if (!vehicles.length && !employees.length && !locations.length) {
    const hadError = vehiclesRes.error || employeesRes.error || locationsRes.error;
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

  if (employees.length) {
    html +=
      '<div class="search-results-group"><span class="search-results-group-title">الموظفون/السائقون</span>' +
      employees
        .map(
          (e) =>
            '<button type="button" class="search-result-item" data-search-type="employee" data-search-id="' + e.id + '">' +
            "<span>" + escapeHtml(e.full_name) + "</span></button>"
        )
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
          "current_employee_id, current_location_id, current_employee:employees ( full_name ), current_location:locations ( name )"
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

  if (type === "employee") {
    navigateTo("employees");
    return;
  }

  // المواقع مش عندها صفحة مخصصة لسه، فأقرب سياق فعلي ليها هو صفحة السيارات
  navigateTo("vehicles");
}

// ============================================================================
// 13. المستخدمون والموظفون (Users & Employees) — Phase 6 — Super Admin فقط
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
// بيرجع دايمًا { success, error? , ...data } سواء نجحت العملية أو لأ، عشان
// الاستدعاءات تتعامل مع الأخطاء بنفس الطريقة في كل مكان. كل دالة من دول
// بتتحقق من إن المستخدم الحالي Super Admin بنفسها جوا قاعدة البيانات — مش
// بس اعتمادًا على إخفاء الزرار في الواجهة.
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
    accountCredentialsCopyButton.textContent = "اتنسخت ✓";
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
      "👥",
      "لا توجد حسابات بعد",
      "الحساب الحالي المفروض يكون موجود دايمًا هنا — لو الجدول فاضي فعليًا، جرّب تحديث الصفحة.",
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
// بالـ anon key، فمُقصود إن ده مش قابل للتعديل من هنا نهائيًا
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
    accountCreateError.textContent = "كل الحقول المطلوبة لازم تتملى.";
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
      "تم إنشاء حساب «" + fullName + "» (" + email + ") بنجاح. بلّغ صاحب الحساب بكلمة المرور دي بنفسك:",
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
// (admin_reset_password) — التوليد نفسه بيحصل جوا قاعدة البيانات، مش هنا
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

// ---------------------------------------------------------------------------
// 13.2 الموظفون (employees) — عرض، إضافة/تعديل، تعطيل/تفعيل
// ---------------------------------------------------------------------------

let employeesListState = { search: "" };

const employeesTableBody = document.getElementById("employees-table-body");
const employeesStateBox = document.getElementById("employees-state");
const employeesSearchInput = document.getElementById("employees-search");
const addEmployeeButton = document.getElementById("add-employee-button");

const employeeFormModal = document.getElementById("employee-form-modal");
const employeeForm = document.getElementById("employee-form");
const employeeFormTitle = document.getElementById("employee-form-title");
const employeeFormIdInput = document.getElementById("employee-form-id");
const employeeFormNameInput = document.getElementById("employee-form-name");
const employeeFormCodeInput = document.getElementById("employee-form-code");
const employeeFormPhoneInput = document.getElementById("employee-form-phone");
const employeeFormActiveSelect = document.getElementById("employee-form-active");
const employeeFormError = document.getElementById("employee-form-error");
const employeeFormSubmitButton = document.getElementById("employee-form-submit");

function setEmployeesState(message) {
  employeesStateBox.classList.remove("is-rich");
  if (!message) {
    employeesStateBox.hidden = true;
    employeesStateBox.textContent = "";
    return;
  }
  employeesStateBox.hidden = false;
  employeesStateBox.textContent = message;
}

async function loadEmployeesList() {
  renderTableSkeleton(employeesTableBody, 5, 5);
  setEmployeesState(null);

  let query = supabaseClient
    .from("employees")
    .select("id, full_name, employee_code, phone, is_active")
    .order("full_name", { ascending: true });

  if (employeesListState.search) {
    query = query.ilike("full_name", "%" + employeesListState.search + "%");
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error loading employees:", error);
    setEmployeesState("تعذر تحميل الموظفين. يُرجى المحاولة مرة أخرى.");
    return;
  }

  if (!data || data.length === 0) {
    if (employeesListState.search) {
      setEmployeesState("لا توجد نتائج مطابقة.");
    } else {
      showRichEmptyState(
        employeesStateBox,
        "👤",
        "لا يوجد موظفون بعد",
        "لا يوجد أي موظف مسجّل بعد. أضف أول موظف لتتمكن من ربطه بسيارات أو عهد نقدية.",
        '<button type="button" class="btn-primary" id="empty-add-employee-button">+ إضافة أول موظف</button>'
      );
      document.getElementById("empty-add-employee-button").addEventListener("click", () => addEmployeeButton.click());
    }
    return;
  }

  setEmployeesState(null);

  employeesTableBody.innerHTML = data
    .map((emp) => {
      const statusBadge = emp.is_active
        ? '<span class="status-badge status-active">مفعّل</span>'
        : '<span class="status-badge status-voided">معطّل</span>';
      const toggleLabel = emp.is_active ? "تعطيل" : "تفعيل";
      const toggleClass = emp.is_active ? "btn-danger btn-sm" : "btn-secondary btn-sm";

      const actionsHtml = currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "admin")
        ? '<button type="button" class="btn-secondary btn-sm employee-edit-btn">تعديل</button> ' +
          '<button type="button" class="' + toggleClass + ' employee-toggle-btn">' + toggleLabel + "</button>"
        : '<span class="text-muted">—</span>';

      return (
        "<tr data-employee-id=\"" + emp.id + "\">" +
        "<td>" + escapeHtml(emp.full_name) + "</td>" +
        "<td>" + escapeHtml(emp.employee_code || "—") + "</td>" +
        "<td>" + escapeHtml(emp.phone || "—") + "</td>" +
        "<td>" + statusBadge + "</td>" +
        '<td class="actions-cell">' + actionsHtml + "</td></tr>"
      );
    })
    .join("");

  if (currentProfile && (currentProfile.role === "super_admin" || currentProfile.role === "admin")) {
    employeesTableBody.querySelectorAll(".employee-edit-btn").forEach((btn) => {
      const tr = btn.closest("tr");
      const emp = data.find((e) => e.id === tr.dataset.employeeId);
      btn.addEventListener("click", () => openEmployeeForm(emp));
    });

    employeesTableBody.querySelectorAll(".employee-toggle-btn").forEach((btn) => {
      const tr = btn.closest("tr");
      const emp = data.find((e) => e.id === tr.dataset.employeeId);
      btn.addEventListener("click", () => toggleEmployeeActive(emp, btn));
    });
  }
}

let employeesSearchDebounce;
employeesSearchInput.addEventListener("input", () => {
  clearTimeout(employeesSearchDebounce);
  employeesSearchDebounce = setTimeout(() => {
    employeesListState.search = employeesSearchInput.value.trim();
    loadEmployeesList();
  }, 300);
});

// employeeQuickAddCallback: لو اتحددت، معناها إن فورم الموظف اتفتح كـ
// "إضافة سريعة" من مكان تاني (زي فورم السيارة) — بعد الحفظ الناجح بيتنادى
// بالموظف الجديد بدل الرجوع لصفحة "المستخدمون" العادية
let employeeQuickAddCallback = null;

function openEmployeeForm(employee, onCreated) {
  employeeFormError.hidden = true;
  employeeFormError.textContent = "";
  employeeQuickAddCallback = onCreated || null;

  employeeFormTitle.textContent = employee ? "تعديل بيانات موظف" : "إضافة موظف";
  employeeFormIdInput.value = employee ? employee.id : "";
  employeeFormNameInput.value = employee ? employee.full_name : "";
  employeeFormCodeInput.value = employee && employee.employee_code ? employee.employee_code : "";
  employeeFormPhoneInput.value = employee && employee.phone ? employee.phone : "";
  employeeFormActiveSelect.value = employee ? String(employee.is_active) : "true";

  employeeFormModal.hidden = false;
}

addEmployeeButton.addEventListener("click", () => openEmployeeForm(null));

employeeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  employeeFormError.hidden = true;
  employeeFormError.textContent = "";

  const fullName = employeeFormNameInput.value.trim();
  if (!fullName) {
    employeeFormError.textContent = "اسم الموظف مطلوب.";
    employeeFormError.hidden = false;
    return;
  }

  const payload = {
    full_name: fullName,
    employee_code: employeeFormCodeInput.value.trim() || null,
    phone: employeeFormPhoneInput.value.trim() || null,
    is_active: employeeFormActiveSelect.value === "true",
  };

  employeeFormSubmitButton.disabled = true;
  employeeFormSubmitButton.textContent = "جارٍ الحفظ...";

  try {
    const editingId = employeeFormIdInput.value;
    let error;
    let savedEmployee = null;

    if (editingId) {
      ({ error } = await supabaseClient.from("employees").update(payload).eq("id", editingId));
    } else {
      payload.created_by = currentAuthUser ? currentAuthUser.id : null;
      const insertResult = await supabaseClient.from("employees").insert(payload).select().single();
      error = insertResult.error;
      savedEmployee = insertResult.data;
    }

    if (error) {
      console.error("Error saving employee:", error);

      if (error.code === "23505") {
        employeeFormError.textContent = "الكود الوظيفي مستخدم بالفعل لموظف آخر.";
      } else if (
        error.code === "42501" ||
        (error.message && error.message.toLowerCase().includes("row-level security"))
      ) {
        employeeFormError.textContent = "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك).";
      } else {
        employeeFormError.textContent = "حصل خطأ أثناء الحفظ: " + error.message;
      }

      employeeFormError.hidden = false;
      return;
    }

    employeeFormModal.hidden = true;
    vehicleFormEmployeesCache = null;

    if (employeeQuickAddCallback && savedEmployee) {
      const callback = employeeQuickAddCallback;
      employeeQuickAddCallback = null;
      callback(savedEmployee);
    } else {
      employeeQuickAddCallback = null;
      loadEmployeesList();
    }
  } catch (unexpectedError) {
    console.error("Unexpected error saving employee:", unexpectedError);
    employeeFormError.textContent = "تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
    employeeFormError.hidden = false;
  } finally {
    employeeFormSubmitButton.disabled = false;
    employeeFormSubmitButton.textContent = "حفظ";
  }
});

async function toggleEmployeeActive(employee, triggerButton) {
  const newState = !employee.is_active;
  if (triggerButton) triggerButton.disabled = true;

  try {
    const { error } = await supabaseClient.from("employees").update({ is_active: newState }).eq("id", employee.id);

    if (error) {
      console.error("Error toggling employee state:", error);
      alert(
        error.code === "42501" || (error.message && error.message.toLowerCase().includes("row-level security"))
          ? "غير مسموح لك بتنفيذ هذا الإجراء (صلاحياتك الحالية لا تسمح بذلك)."
          : "حصل خطأ أثناء تحديث حالة الموظف: " + error.message
      );
      return;
    }

    vehicleFormEmployeesCache = null;
    loadEmployeesList();
  } catch (unexpectedError) {
    console.error("Unexpected error toggling employee state:", unexpectedError);
    alert("تعذر الاتصال بالخادم. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.");
  } finally {
    if (triggerButton) triggerButton.disabled = false;
  }
}

// ============================================================================
// 14. معالج استيراد Excel (Import Wizard) — مشترك بين السيارات/الوقود/
//     المصروفات. قراءة الملف المرفوع بـ SheetJS، وإنشاء القالب القابل
//     للتحميل بـ ExcelJS (عشان يدعم Data Validation/دروب داون ليست حقيقية
//     جوه الخلية، ميزة مش متاحة في SheetJS المجاني). كل كيان (Entity)
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

// إنشاء قالب Excel بـ ExcelJS (بدل SheetJS) عشان نقدر نضيف Data Validation
// حقيقية (دروب داون ليست فعلي جوه الخلية) — ميزة مش متاحة في SheetJS
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
      // دروب داون ليست (قائمة قيم مسموحة، زي "الحالة" أو "الفئة")
      if (!options.length) return;
      validation = {
        type: "list",
        allowBlank: true,
        formulae: ['"' + options.join(",") + '"'],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "قيمة غير موجودة في القائمة",
        error: "يُفضّل اختيار قيمة من القائمة المنسدلة عشان الاستيراد يعدّي من غير رفض.",
      };
    } else if (options.type === "date") {
      // خلية تاريخ: تنسيق عرض بصيغة تاريخ + تحقق إن القيمة تاريخ صحيح
      // (اختياري تمامًا، مفيش رفض لو الخلية فاضية)
      worksheet.getColumn(index + 1).numFmt = "yyyy-mm-dd";
      validation = {
        type: "date",
        operator: "between",
        allowBlank: true,
        formulae: [new Date(2000, 0, 1), new Date(2100, 11, 31)],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "تاريخ غير صالح",
        error: "من فضلك أدخل تاريخ صحيح، أو اسيب الخلية فاضية (الحقل ده اختياري).",
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
}

// تحويل قيمة تاريخ (Date حقيقي من Excel، أو نص) لصيغة YYYY-MM-DD المطلوبة
// لأعمدة date في قاعدة البيانات — بترجع "" لو التاريخ مش قابل للتحويل
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
        "الملف المرفوع مش بنفس صيغة القالب. الأعمدة الناقصة: " + missingHeaders.join("، ") + " — حمّل القالب من الخطوة الأولى واستخدمه.";
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
      err && err.message ? err.message : "حصل خطأ أثناء قراءة الملف. تأكد إنه ملف Excel صالح (.xlsx/.xls).";
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
    '<span class="import-preview-summary-item is-valid">✓ ' + validCount + " صف صالح</span>" +
    '<span class="import-preview-summary-item is-duplicate">⚠ ' + duplicateCount + " صف مكرر</span>" +
    '<span class="import-preview-summary-item is-error">✕ ' + errorCount + " صف به أخطاء</span>";

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
    '<span class="import-preview-summary-item is-valid">✓ تم إدخال ' + successCount + " بنجاح</span>" +
    (failedRows.length
      ? '<span class="import-preview-summary-item is-error">✕ فشل إدخال ' + failedRows.length + " صف أثناء الحفظ</span>"
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
        return { rowNumber, raw, status: "error", reason: "سنة الصنع غير صالحة (لازم تكون بين 1950 و" + maxYear + ")." };
      }
    }

    // رقم الهوية الوطنية (يبدأ بـ 1) أو الإقامة (يبدأ بـ 2) — 10 أرقام بالظبط
    if (actualUserNationalId && !/^[12]\d{9}$/.test(actualUserNationalId)) {
      return {
        rowNumber,
        raw,
        status: "error",
        reason: "رقم هوية المستخدم الفعلي لازم يكون 10 أرقام بالظبط ويبدأ بـ 1 أو 2.",
      };
    }

    // لو مفيش "الحالة" متحددة صراحةً: لو فيه اسم مستخدم فعلي، السيارة واضح
    // إنها مستخدمة فعليًا فمنطقيًا مش "متاحة" — الافتراضي بقى "نشطة" بدل
    // "متاحة". لو مفيش اسم أصلاً، تفضل "متاحة" زي ما كانت (بدون حد عليها)
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

    // تاريخ التفويض اختياري تمامًا — لو فاضي أو غير قابل للفهم بيتسجل
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
    "حمّل القالب وعبّي بياناته بالسيارات المطلوب إضافتها (رقم اللوحة مطلوب، والباقي اختياري). عمود \"الحالة\" فيه دروب داون ليست بالقيم المسموحة — اختَر منها بدل ما تكتبها يدويًا. عمود \"تفويض حتى\" اتركه فاضي لو مفيش تاريخ نهاية محدد للتفويض (هيتسجل تلقائيًا \"مستخدم فعلي\" مستمر)، وارفع الملف في الخطوة التالية.",
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
      return { rowNumber, raw, status: "error", reason: "اللترات لازم تكون رقم أكبر من صفر." };
    }

    const amount = Number(amountRaw);
    if (amountRaw === "" || amountRaw === null || amountRaw === undefined || Number.isNaN(amount) || amount < 0) {
      return { rowNumber, raw, status: "error", reason: "التكلفة لازم تكون رقم ولا تكون سالبة." };
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
    "حمّل القالب وعبّي بياناته بمعاملات الوقود المطلوب إضافتها (رقم اللوحة، التاريخ، اللترات، التكلفة). رقم اللوحة لازم يكون موجود بالفعل في النظام، وارفع الملف في الخطوة التالية.",
  validate: validateFuelImportRows,
  insertOne: (payload) => supabaseClient.from("fuel_transactions").insert(payload),
  afterImport: () => loadFuelTransactions(),
};

const importFuelButton = document.getElementById("import-fuel-button");
importFuelButton.addEventListener("click", () => openImportWizard("fuel"));

// ---------------------------------------------------------------------------
// 14.3 استيراد المصروفات — تحقق من مطابقة اسم الفئة، وصحة المبلغ/التاريخ،
//      بالإضافة لفحص حرج: إجمالي الصفوف الصالحة لازم لا يتجاوز الرصيد
//      المتاح في الصندوق النشط الحالي — نفس قاعدة نموذج الإضافة اليدوية
//      اللي بترفض أي رصيد سالب تمامًا (مفيش إدخال جزئي يكسر القاعدة دي)
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

    const categoryId = categoryMap[normalizeImportKey(categoryRaw)];
    if (!categoryRaw || !categoryId) {
      return { rowNumber, raw, status: "error", reason: 'فئة غير معروفة ("' + (categoryRaw || "فارغة") + '").' };
    }

    const amount = Number(amountRaw);
    if (amountRaw === "" || amountRaw === null || amountRaw === undefined || Number.isNaN(amount) || amount <= 0) {
      return { rowNumber, raw, status: "error", reason: "المبلغ لازم يكون رقم أكبر من صفر." };
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
      payload: {
        category_id: categoryId,
        amount,
        expense_date: expenseDate,
        description: description || null,
        created_by: currentAuthUser ? currentAuthUser.id : null,
        // petty_cash_fund_id بيتحدد في preConfirmCheck تحت وقت التأكيد
        // الفعلي، عشان نستخدم أحدث صندوق نشط وأحدث رصيد وقت الحفظ فعليًا
      },
    };
  });
}

async function expensesImportPreConfirmCheck(validRows) {
  const { data: fund, error: fundError } = await supabaseClient
    .from("petty_cash_funds")
    .select("id, fund_code")
    .eq("status", "active")
    .order("funded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fundError) {
    console.error("Error checking active fund for expenses import:", fundError);
    return { ok: false, message: "تعذر التحقق من العهدة النشطة الحالية. يُرجى المحاولة مرة أخرى." };
  }
  if (!fund) {
    return { ok: false, message: "لا توجد عهدة نقدية نشطة لتسجيل مصروف عليها." };
  }

  const { data: balance, error: balanceError } = await supabaseClient
    .from("petty_cash_fund_balances")
    .select("current_balance")
    .eq("fund_id", fund.id)
    .single();

  if (balanceError) {
    console.error("Error checking fund balance for expenses import:", balanceError);
    return { ok: false, message: "تعذر التحقق من رصيد العهدة الحالية. يُرجى المحاولة مرة أخرى." };
  }

  const totalRequested = validRows.reduce((sum, r) => sum + Number(r.payload.amount || 0), 0);
  const currentBalance = Number(balance.current_balance);

  if (totalRequested > currentBalance) {
    const diff = totalRequested - currentBalance;
    return {
      ok: false,
      message:
        "إجمالي المصروفات الصالحة في الملف (" + formatNumber(totalRequested, 2) + " ر.س) أكبر من الرصيد المتاح في العهدة الحالية (" +
        formatNumber(currentBalance, 2) + " ر.س) بمقدار " + formatNumber(diff, 2) +
        " ر.س. يجب تقليل المبالغ أو حذف بعض الصفوف من الملف قبل التأكيد — لا يسمح النظام برصيد سالب، ولا يُتاح إدخال جزئي.",
    };
  }

  // ربط كل صف صالح بالصندوق النشط الحالي فعليًا وقت التأكيد
  validRows.forEach((r) => {
    r.payload.petty_cash_fund_id = fund.id;
  });

  return { ok: true };
}

IMPORT_CONFIGS.expenses = {
  title: "استيراد المصروفات من Excel",
  entityLabelPlural: "مصروف",
  templateHeaders: ["المبلغ", "الفئة", "التاريخ", "الوصف"],
  templateFilename: "قالب-استيراد-المصروفات.xlsx",
  rejectedReportFilename: "صفوف-مرفوضة-المصروفات.csv",
  step1Desc:
    "حمّل القالب وأدخل بياناته بالمصروفات المطلوب إضافتها (المبلغ، الفئة، التاريخ، الوصف). عمود \"الفئة\" فيه دروب داون ليست بالفئات الموجودة فعليًا في النظام — اختَر منها بدل ما تكتبها يدويًا. وسيتم ربط كل الصفوف بالعهدة النشطة الحالية تلقائيًا وقت التأكيد.",
  templateColumnValidations: async () => {
    const categories = await ensureExpenseCategories();
    return {
      "الفئة": categories.map((c) => c.name_ar || c.name),
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
// #login-page و #app-shell الاتنين بيبدأوا hidden في الـ HTML؛ الكود ده هو
// اللي بيقرر يظهر أيهما فور تحميل الصفحة، من غير ما تفلاش صفحة الدخول لو
// المستخدم أصلاً عنده جلسة سليمة.

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
// بيتحط تلقائيًا فوق كل .table-scroll في الصفحة، وبيظهر بس لما الجدول فعلًا
// قابل للتمرير أفقيًا (بيتابع الحجم بـ ResizeObserver عشان يتحدّث الظهور
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
