// ============================================================================
// Supabase Configuration — Admin Operations Management System
// ============================================================================
// This project uses the Supabase JS SDK via CDN directly in index.html
// (no npm / no build tools). Load order in index.html must be:
//   1. <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//   2. <script src="config.js"></script>
//   3. <script src="script.js"></script>
//
// نظام الدخول مخصص بالكامل (RPC + JWT موقّع يدويًا، راجع القسم 10 في
// database/schema.sql) — مش Supabase Auth. عشان كده `supabaseClient` هنا
// `let` مش `const`: بعد تسجيل الدخول بنجاح، script.js بيعيد إنشاءه بنفس
// الرابط والمفتاح لكن مع إضافة التوكن المخصص كـ Authorization header، عشان
// كل نداء بعد كده (RPC أو جدول) يتحقق كـ "authenticated" تلقائيًا.
// ============================================================================

const SUPABASE_URL = 'https://pgrsiitgwggnerpfrovz.supabase.co';

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBncnNpaXRnd2dnbmVycGZyb3Z6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyNTM0NDQsImV4cCI6MjEwMTgyOTQ0NH0.YQLUgmV7oFcxJ5o47mu_NLnqWHLX9FO8fYq4bsyp0AQ';

// عميل Supabase — متاح عالميًا كـ `supabaseClient` لباقي ملفات الـ JS (زي script.js)
let supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
