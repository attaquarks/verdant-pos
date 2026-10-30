import type { Locale } from "./preferences";

/** Explicitly authored Urdu catalogue; no runtime machine translation. English source keys are intentional and checked by TypeScript.
 * Never apply this catalogue to user-entered product names, notes, or ledger data.
 */
export const ur = {
  "Sign in to continue.": "جاری رکھنے کے لیے سائن اِن کریں۔",
  "Authentication is temporarily unavailable.":
    "سائن اِن کا نظام ابھی دستیاب نہیں۔ کچھ دیر بعد کوشش کریں۔",
  "Supabase is not configured.": "Supabase کی ترتیبات ابھی مکمل نہیں۔",
  "Something went wrong. Please try again; unchanged retries are safe.":
    "مسئلہ پیش آیا۔ تفصیل بدلے بغیر دوبارہ کوشش کرنا محفوظ ہے۔",
  "This request did not come from the application. Reload the page and try again.":
    "یہ درخواست ایپ سے نہیں آئی۔ صفحہ تازہ کر کے دوبارہ کوشش کریں۔",
  "This request is too large.": "یہ درخواست حد سے بڑی ہے۔",
  "Invalid product reference.": "چیز کا حوالہ درست نہیں۔",
  "Invalid sale reference.": "فروخت کا حوالہ درست نہیں۔",
  "Import at most {v0} products at a time.":
    "ایک بار میں زیادہ سے زیادہ {v0} چیزیں فائل سے شامل کریں۔",
  "Malformed CSV: quotes must enclose an entire field.":
    "CSV درست نہیں: اقتباس کے نشان پورے خانے کے گرد ہونے چاہییں۔",
  "Malformed CSV: unexpected text after a closing quote.":
    "CSV درست نہیں: بند اقتباس کے بعد غیر متوقع عبارت ہے۔",
  "Malformed CSV: a quoted field was not closed.":
    "CSV درست نہیں: ایک خانے کے اقتباس کے نشان بند نہیں ہوئے۔",
  "Add a header and at least one product row.":
    "کالم کے نام اور کم از کم ایک چیز کی سطر شامل کریں۔",
  "CSV headers cannot repeat.": "CSV کالم کے نام دوبارہ نہیں آ سکتے۔",
  "Unknown column: {v0}. Download the product template for supported columns.":
    "کالم {v0} منظور شدہ نہیں۔ درست کالم کے لیے نمونہ فائل ڈاؤن لوڈ کریں۔",
  "Use category or category_name, not both.":
    "category یا category_name میں سے ایک کالم رکھیں، دونوں نہیں۔",
  "Missing required column: {v0}.": "ضروری کالم {v0} موجود نہیں۔",
  "Row {v0}: expected {v1} columns, found {v2}.": "سطر {v0}: {v1} کالم ہونے چاہییں، {v2} ملے۔",
  "Row {v0}: is_active must be true or false.": "سطر {v0}: is_active میں true یا false لکھیں۔",
  "Row {v0}, {v1}: {v2}": "سطر {v0}، کالم {v1}: {v2}",

  "Complete this field.": "یہ خانہ مکمل کریں۔",
  "Enter a valid email address.": "درست ای میل پتہ لکھیں۔",
  "Enter a valid value.": "درست تفصیل لکھیں۔",
  "Use {v0} or less.": "{v0} یا اس سے کم لکھیں۔",
  "Use {v0} or more.": "{v0} یا اس سے زیادہ لکھیں۔",
  "Use at least {v0} characters.": "کم از کم {v0} حروف لکھیں۔",
  "Use no more than {v0} characters.": "زیادہ سے زیادہ {v0} حروف لکھیں۔",
  "Follow the format shown for this field.": "اس خانے کے لیے دکھایا گیا طریقہ استعمال کریں۔",
  "Use an allowed quantity or amount.": "اجازت دی گئی مقدار یا رقم لکھیں۔",
  "Enter a number.": "عدد لکھیں۔",

  Receive: "وصول کریں",
  Menu: "مینو",
  Navigation: "صفحات",
  "Quick tasks": "روز کے کام",
  Home: "خلاصہ",
  Udhaar: "ادھار",
  to: "سے نقل کر کے",
  "variable.": "متغیر میں۔",
  records: "اندراجات",

  "Couldn’t sign out. Please try again.": "سائن آؤٹ نہیں ہو سکا۔ دوبارہ کوشش کریں۔",
  "PROTECTED SHOP ACCESS": "دکان تک محفوظ رسائی",
  "Access revoked": "دکان کی رسائی ختم ہو گئی",
  "Your account is signed in, but its access to this shop has been removed. Contact the shop owner if you believe this is a mistake.":
    "آپ سائن اِن ہیں، مگر اس دکان تک آپ کی رسائی ختم کر دی گئی ہے۔ غلطی لگے تو دکان کے مالک سے رابطہ کریں۔",
  "Signed in as": "اس اکاؤنٹ سے سائن اِن ہیں:",
  ". Shop records are no longer accessible. Historical transactions have been preserved.":
    "۔ دکان کا ریکارڈ اب نہیں کھل سکتا۔ پرانا لین دین محفوظ ہے۔",
  "Sign out": "سائن آؤٹ",
  "Couldn’t sign out. Try again.": "سائن آؤٹ نہیں ہو سکا۔ دوبارہ کوشش کریں۔",
  "Main navigation": "اہم صفحات",
  "{v0} low-stock products": "{v0} چیزوں کا مال کم ہے",
  "Skip to main content": "اصل صفحے پر جائیں",
  "Verdant POS dashboard": "verdant POS — آج کا خلاصہ",
  "Shop workspace": "دکان کا حساب",
  WORKSPACE: "دکان کے کام",
  "A clear view of your business.": "اپنی دکان کا حساب صاف رکھیں۔",
  "Data & support": "ریکارڈ اور مدد",
  "Verdant POS · Retail essentials": "ورڈنٹ POS · دکان کے ضروری کام",
  "Open navigation": "صفحات کی فہرست کھولیں",
  "Search inventory": "مال تلاش کریں",
  "Search your inventory…": "اپنے مال میں تلاش کریں…",
  "{v0} low-stock products. View inventory alerts": "{v0} چیزوں کا مال کم ہے۔ تفصیل دیکھیں",
  "View inventory alerts": "کم مال کی اطلاع دیکھیں",
  "Low-stock alerts": "کم مال کی اطلاع",
  "Account menu for {v0}": "{v0} کا اکاؤنٹ مینو",
  "Signing out…": "سائن آؤٹ ہو رہا ہے…",
  "Your workspace": "آپ کی دکان",
  "New sale": "نئی فروخت",
  "New sale (Alt+N)": "نئی فروخت (Alt+N)",
  "Alt N": "Alt N",
  "A little more clarity.": "دکان کا حساب آسان۔",
  "A better day in store.": "ہر دن کا کام واضح۔",
  "Your products, sales, and money in one considered workspace. Built for the work you do every day.":
    "مال، فروخت اور پیسوں کا حساب ایک جگہ۔ آپ کی دکان کے روزمرہ کاموں کے لیے۔",
  "Know what’s on the shelf": "جانیں کتنا مال موجود ہے",
  "Stock, deliveries, and alerts that stay in sync.":
    "موجودہ مال، نیا آیا مال اور کمی کی اطلاع ایک ساتھ۔",
  "Keep a proper record": "لین دین کا پکا ریکارڈ",
  "Sales, credit, and returns with a clear history.":
    "فروخت، ادھار اور واپس آئے مال کی پوری تفصیل۔",
  "Understand your numbers": "اپنا حساب سمجھیں",
  "Revenue, profit, and cash, clearly separated.":
    "فروخت، منافع اور نقد رقم الگ الگ دکھائی جاتی ہے۔",
  "Less busywork. More business.": "حساب کی فکر کم، دکان پر توجہ زیادہ۔",
  "Verdant POS": "ورڈنٹ POS",
  "Retail essentials, thoughtfully connected.": "دکان کے ضروری کام، ایک جگہ۔",
  "That confirmation or recovery link is invalid or has expired. Sign in, or request a new password-reset link.":
    "یہ تصدیقی یا پاس ورڈ کا لنک درست نہیں یا ختم ہو چکا ہے۔ سائن اِن کریں یا نیا لنک منگوائیں۔",
  "This reset link is missing or has expired. Request a fresh link below.":
    "یہ لنک موجود نہیں یا ختم ہو چکا ہے۔ نیچے سے نیا لنک منگوائیں۔",
  "Couldn’t verify this reset link. Request a fresh link below.":
    "اس لنک کی تصدیق نہیں ہوئی۔ نیچے سے نیا لنک منگوائیں۔",
  "Authentication is not configured.": "سائن اِن کا نظام ابھی تیار نہیں ہے۔",
  "Use a password with at least 8 characters.": "کم از کم 8 حروف کا پاس ورڈ رکھیں۔",
  "The passwords don’t match. Please enter them again.":
    "دونوں پاس ورڈ ایک جیسے نہیں۔ دوبارہ لکھیں۔",
  "Check your inbox for a confirmation link. Confirm your email to continue to your shop setup.":
    "تصدیقی لنک کے لیے اپنی ای میل دیکھیں۔ دکان بنانے کے لیے ای میل کی تصدیق کریں۔",
  "If an account exists for this email, a password-reset link is on its way. Check your inbox and spam folder.":
    "اگر اس ای میل پر اکاؤنٹ ہے تو پاس ورڈ بدلنے کا لنک بھیج دیا جائے گا۔ ان باکس اور اسپیم فولڈر دیکھیں۔",
  "Authentication failed. Please try again.": "سائن اِن نہیں ہو سکا۔ دوبارہ کوشش کریں۔",
  "YOUR SHOP, IN FOCUS": "اپنی دکان کا حساب",
  "You’re all set": "کام مکمل ہو گیا",
  "Your password has been updated securely.": "آپ کا نیا پاس ورڈ محفوظ ہو گیا ہے۔",
  "Go to your workspace": "اپنی دکان کھولیں",
  "Account access": "اکاؤنٹ میں داخلہ",
  "Sign in": "سائن اِن",
  "Create account": "نیا اکاؤنٹ بنائیں",
  "Confirm your email": "ای میل کی تصدیق کریں",
  "Check your inbox": "اپنی ای میل دیکھیں",
  "Email address": "ای میل پتہ",
  "New password": "نیا پاس ورڈ",
  Password: "پاس ورڈ",
  "Your password": "اپنا پاس ورڈ",
  "At least 8 characters": "کم از کم 8 حروف",
  "Hide password": "پاس ورڈ چھپائیں",
  "Show password": "پاس ورڈ دکھائیں",
  "Confirm new password": "نیا پاس ورڈ دوبارہ لکھیں",
  "Forgot password?": "پاس ورڈ بھول گئے؟",
  "Send reset link": "پاس ورڈ بدلنے کا لنک بھیجیں",
  "Verifying link…": "لنک کی تصدیق ہو رہی ہے…",
  "Update password": "نیا پاس ورڈ محفوظ کریں",
  "Your account is protected by Supabase authentication. Email confirmation may be required.":
    "آپ کا اکاؤنٹ Supabase کے محفوظ سائن اِن نظام میں ہے۔ ای میل کی تصدیق ضروری ہو سکتی ہے۔",
  "Back to sign in": "واپس سائن اِن پر جائیں",
  "Request a new reset link": "نیا پاس ورڈ لنک منگوائیں",
  Cashbook: "پیسوں کا حساب",
  "A chronological record of money in and out. Not the same thing as profit.":
    "آئے اور گئے پیسوں کا تاریخ وار حساب۔ یہ منافع کا حساب نہیں ہے۔",
  Export: "فائل ڈاؤن لوڈ کریں",
  "Record movement": "پیسوں کا لین دین لکھیں",
  "Money in": "رقم آئی",
  "Sales, collections, and owner deposits": "فروخت، ادھار کی وصولی اور مالک کی ڈالی رقم",
  "Money out": "رقم گئی",
  "Refunds, expenses, and payments": "واپس کی رقم، خرچے اور ادائیگیاں",
  "Net movement": "آنے جانے کا فرق",
  "Cash and digital combined, not profit": "نقد اور ڈیجیٹل ملا کر؛ منافع نہیں",
  "Money ledger": "پیسوں کا کھاتا",
  "· Most recent first": "· نیا ریکارڈ پہلے",
  entries: "اندراجات",
  "No money movements in this period": "ان تاریخوں میں پیسوں کا لین دین نہیں",
  "Sales receipts, credit collections, refunds, and expenses appear automatically. Record an owner movement or supplier payment here.":
    "فروخت کی رقم، ادھار کی وصولی، واپسی اور خرچے خود یہاں آتے ہیں۔ مالک کی رقم یا سپلائر کی ادائیگی یہاں لکھیں۔",
  "Record a movement": "پیسوں کا لین دین لکھیں",
  "Cashbook ledger for": "پیسوں کا حساب برائے",
  ", newest first": "، نیا ریکارڈ پہلے",
  "Date & time": "تاریخ اور وقت",
  Movement: "لین دین",
  Description: "تفصیل",
  Method: "طریقہ",
  Ref: "حوالہ",
  "Credit sales do not appear until collected. Purchases and owner movements affect money, not sales revenue. This ledger does not assert a physical cash-drawer balance.":
    "ادھار کی رقم وصول ہونے پر یہاں آتی ہے۔ خریداری اور مالک کی رقم فروخت میں شامل نہیں۔ یہ کھاتا دراز میں موجود نقد رقم کی گنتی نہیں ہے۔",
  "Record money movement": "پیسوں کا لین دین لکھیں",
  "For manual supplier payments and money the owner puts in or takes out.":
    "سپلائر کو الگ دی گئی رقم، یا مالک کی ڈالی اور نکالی گئی رقم کے لیے۔",
  "Money movement recorded in your cashbook.": "پیسوں کا لین دین کھاتے میں محفوظ ہو گیا۔",
  "Movement type": "کس قسم کا لین دین؟",
  "Supplier payment — money out": "سپلائر کو ادائیگی — رقم گئی",
  "Owner withdrawal — money out": "مالک نے رقم نکالی — رقم گئی",
  "Owner deposit — money in": "مالک نے رقم ڈالی — رقم آئی",
  "Supplier name and invoice reference": "سپلائر کا نام اور بل کا حوالہ",
  "Reason for adding money": "رقم ڈالنے کی وجہ",
  "Reason for taking money out": "رقم نکالنے کی وجہ",
  "Amount ·": "رقم ·",
  "Payment method": "ادائیگی کا طریقہ",
  Cash: "نقد",
  Digital: "ڈیجیٹل / بینک",
  "Movement date": "لین دین کی تاریخ",
  "Calendar date in": "تاریخ اس وقت کے مطابق:",
  "Use this only for a payment not already recorded with a stock receipt. It does not receive inventory or create an operating expense.":
    "صرف وہ ادائیگی یہاں لکھیں جو مال وصول کرتے وقت نہیں لکھی۔ اس سے مال نہیں بڑھتا اور دکان کا خرچہ نہیں بنتا۔",
  "Owner movements change available money. They are not sales revenue or operating expenses.":
    "مالک کی ڈالی یا نکالی رقم دستیاب پیسے بدلتی ہے۔ یہ فروخت یا دکان کا خرچہ نہیں۔",
  "No revenue in this period": "ان تاریخوں میں فروخت کی آمدن نہیں",
  "Posted sales and return adjustments will appear here.":
    "محفوظ فروخت اور واپسی کا حساب یہاں دکھے گا۔",
  "Net revenue over time, {v0}": "وقت کے ساتھ خالص فروخت، {v0}",
  ". Returns reduce revenue on the day recorded.":
    "۔ واپسی جس دن لکھی جائے اسی دن کی فروخت سے کم ہوتی ہے۔",
  "{v0} · {v1}": "{v0} · {v1}",
  "No category revenue yet": "ابھی کسی قسم کے مال کی آمدن نہیں",
  "Category performance will follow your recorded sales.":
    "فروخت لکھنے کے بعد مال کی قسم کے حساب سے نتیجہ دکھے گا۔",
  "Net revenue by category, {v0}": "مال کی قسم کے مطابق خالص فروخت، {v0}",
  "{v0}: {v1}": "{v0}: {v1}",
  Dashboard: "آج کا خلاصہ",
  "A clear view of your shop. Every number comes from your recorded activity.":
    "روز کا حساب ایک نظر میں۔ ہر رقم آپ کے محفوظ لین دین سے آتی ہے۔",
  "Manage inventory": "مال کا حساب دیکھیں",
  "AT A GLANCE": "ایک نظر میں",
  TODAY: "آج",
  "· Shop timezone:": "· دکان کا وقت:",
  "Today’s revenue": "آج کی خالص فروخت",
  "Sales less returns recorded today": "آج کی فروخت میں سے آج کی واپسی کم",
  "Units sold today": "آج بکی مقدار",
  "{v0} recorded sales · net of returns": "{v0} فروخت · واپسی کم کر کے",
  "Weekly revenue": "اس ہفتے کی خالص فروخت",
  "Monday through today · net of returns": "پیر سے آج تک · واپسی کم کر کے",
  "Low-stock products": "کم رہ گیا مال",
  "Active products needing attention": "فروخت کے لیے موجود چیزیں جن پر توجہ چاہیے",
  "Revenue over time": "فروخت کا اتار چڑھاؤ",
  "Net sales in": "خالص فروخت:",
  "Net revenue": "خالص فروخت",
  "Period revenue": "ان تاریخوں کی خالص فروخت",
  "View report": "تفصیلی حساب دیکھیں",
  "Today’s payments": "آج کی وصولیاں",
  "Money movement, separate from revenue": "پیسوں کا لین دین، فروخت سے الگ",
  "Cash received": "نقد وصول ہوا",
  "Digital received": "ڈیجیٹل رقم وصول ہوئی",
  "Credit sales": "ادھار فروخت",
  "Refunds issued": "واپس کی گئی رقم",
  "Credit is revenue, not cash. Collections appear in money received, not in sales again.":
    "ادھار فروخت ہے، نقد نہیں۔ ادھار کی وصولی رقم میں دکھتی ہے، دوبارہ فروخت نہیں بنتی۔",
  "Open cashbook": "پیسوں کا کھاتا کھولیں",
  "Best sellers": "زیادہ بکنے والا مال",
  "By net revenue ·": "خالص فروخت کے لحاظ سے ·",
  "All products": "سارا مال",
  "Your best sellers will appear here": "زیادہ بکنے والا مال یہاں دکھے گا",
  "Record your first sales to see what’s moving.":
    "پہلی فروخت لکھیں، پھر دیکھیں کون سا مال بک رہا ہے۔",
  "Best-selling products for": "زیادہ بکنے والا مال برائے",
  Product: "چیز",
  "Net units": "خالص مقدار",
  Uncategorized: "بغیر قسم",
  "Stock needs attention": "اس مال پر توجہ دیں",
  "Active products at or below their alert level": "جن چیزوں کی مقدار مقررہ حد تک یا اس سے کم ہے",
  Inventory: "مال / اسٹاک",
  "No low-stock alerts": "کسی مال کی کمی کی اطلاع نہیں",
  "Your active inventory has no products at or below their configured alert levels.":
    "فروخت کے لیے موجود مال کی مقدار مقررہ حد سے کم نہیں ہے۔",
  "Alert at": "اس مقدار پر اطلاع:",
  "Out of stock": "مال ختم",
  "Low stock": "مال کم ہے",
  "Recent sales": "تازہ فروخت",
  "The latest transactions in your shop": "دکان کا تازہ لین دین",
  "View all sales": "ساری فروخت دیکھیں",
  "Ready for your first sale": "پہلی فروخت لکھیں",
  "Choose a product, select a payment method, and record your first transaction.":
    "چیز چنیں، ادائیگی کا طریقہ چنیں، پھر فروخت محفوظ کریں۔",
  Reference: "حوالہ نمبر",
  Customer: "گاہک",
  Payment: "ادائیگی",
  "Net amount": "خالص رقم",
  Status: "حالت",
  "View sale": "فروخت دیکھیں",
  Sale: "فروخت",
  "Walk-in": "عام گاہک",
  "View sale {v0}": "فروخت {v0} دیکھیں",
  "This week:": "اس ہفتے:",
  "net revenue across": "خالص فروخت، کل",
  "recorded sales. Revenue and cash are deliberately reported separately.":
    "محفوظ فروخت۔ فروخت اور نقد رقم الگ الگ دکھائی جاتی ہیں۔",
  Expenses: "خرچے",
  "Keep daily operating costs out of your head and in your books.":
    "روزمرہ کے خرچے یاد رکھنے کے بجائے یہاں لکھیں۔",
  "Add expense": "خرچہ لکھیں",
  "Total operating expenses": "دکان کے کل خرچے",
  expense: "خرچہ",
  expenses: "خرچے",
  "Expense ledger": "خرچوں کا کھاتا",
  "Saved expenses automatically create cashbook outflows.":
    "محفوظ خرچے خود پیسوں کے کھاتے میں رقم کی ادائیگی بن جاتے ہیں۔",
  "Most recent first": "نیا ریکارڈ پہلے",
  "No expenses in this period": "ان تاریخوں میں کوئی خرچہ نہیں",
  "Record rent, utilities, transport, or other operating costs to keep your profit estimate useful.":
    "کرایہ، بجلی، ٹرانسپورٹ اور دوسرے خرچے لکھیں تاکہ منافع کا اندازہ درست رہے۔",
  "Add your first expense": "پہلا خرچہ لکھیں",
  "Operating expenses for": "دکان کے خرچے برائے",
  Date: "تاریخ",
  Category: "قسم",
  "Paid with": "ادائیگی کا طریقہ",
  Amount: "رقم",
  "Inventory purchases belong in Receive stock, not operating expenses. Owner withdrawals are recorded in the cashbook and do not reduce profit.":
    "مال کی خریداری «مال وصول کریں» میں لکھیں، خرچوں میں نہیں۔ مالک کی نکالی رقم پیسوں کے کھاتے میں لکھی جاتی ہے اور منافع کم نہیں کرتی۔",
  "Add an expense": "خرچہ لکھیں",
  "Record an operating cost that has been paid.": "دکان کا وہ خرچہ لکھیں جس کی ادائیگی ہو چکی ہے۔",
  "Save expense": "خرچہ محفوظ کریں",
  "What was it for?": "خرچہ کس لیے ہوا؟",
  "A short, useful description": "مختصر اور واضح تفصیل",
  "Expense category": "خرچے کی قسم",
  "e.g. Rent, utilities, transport": "مثلاً کرایہ، بجلی، ٹرانسپورٹ",
  "Expense date": "خرچے کی تاریخ",
  "Recorded in": "اس وقت کے مطابق:",
  "Saved expenses are permanent ledger records. Check the amount and date before posting.":
    "محفوظ خرچہ مستقل ریکارڈ ہے۔ محفوظ کرنے سے پہلے رقم اور تاریخ دیکھ لیں۔",
  "{v0} updated.": "{v0} کی تفصیل بدل دی گئی۔",
  "{v0} added to inventory.": "{v0} مال کی فہرست میں شامل ہو گیا۔",
  "Edit product": "چیز کی تفصیل بدلیں",
  "Add a product": "نئی چیز شامل کریں",
  "Catalog changes apply to future sales. Historical sales stay unchanged.":
    "بدلی ہوئی تفصیل آئندہ فروخت پر لاگو ہو گی۔ پرانی فروخت نہیں بدلے گی۔",
  "Create a product and set its opening stock.":
    "نئی چیز شامل کریں اور شروع کی موجودہ مقدار لکھیں۔",
  "Save changes": "تبدیلی محفوظ کریں",
  "Add product": "نئی چیز شامل کریں",
  "Product name": "چیز کا نام",
  "e.g. Product name": "مثلاً چاول",
  SKU: "چیز کا کوڈ (SKU)",
  "Your product code": "آپ کا رکھا ہوا کوڈ",
  Barcode: "بارکوڈ",
  "Scan or type a barcode": "بارکوڈ اسکین کریں یا لکھیں",
  Unit: "اکائی",
  "e.g. piece, kg, litre": "مثلاً عدد، کلو، لیٹر",
  "Pricing ·": "قیمت ·",
  "Selling price": "بیچنے کی قیمت",
  "Unit cost": "فی اکائی لاگت",
  "Leave blank if unknown": "معلوم نہ ہو تو خالی چھوڑیں",
  "Unknown cost is never treated as zero profit.":
    "لاگت معلوم نہ ہو تو منافع صفر فرض نہیں کیا جاتا۔",
  Stock: "مال",
  "Current stock": "موجودہ مقدار",
  "Use Receive or Adjust to change stock.":
    "مقدار بدلنے کے لیے «مال وصول کریں» یا «مقدار درست کریں» استعمال کریں۔",
  "Opening stock": "شروع کی موجودہ مقدار",
  "Low-stock alert at": "اس مقدار پر کمی کی اطلاع دیں",
  "Alerts when available stock reaches this level.": "مال اس مقدار تک پہنچنے پر اطلاع ملے گی۔",
  "Active product": "فروخت کے لیے دستیاب",
  "Available for new sales. Inactive products keep all history.":
    "نئی فروخت میں شامل ہو سکتی ہے۔ بند کی گئی چیز کا پرانا ریکارڈ محفوظ رہتا ہے۔",
  "New category": "نئی قسم بنائیں",
  "Organize your catalog for faster searching and useful reports.":
    "مال کو قسموں میں رکھیں تاکہ تلاش اور حساب آسان ہو۔",
  "Create category": "قسم محفوظ کریں",
  "Category name": "قسم کا نام",
  "Name your category": "مثلاً راشن، مشروبات",
  "Deactivate product?": "اس چیز کی فروخت بند کریں؟",
  "This product will no longer be available for new sales.":
    "یہ چیز نئی فروخت میں شامل نہیں ہو سکے گی۔",
  "Keep active": "فروخت جاری رکھیں",
  "Deactivate product": "فروخت بند کریں",
  "No SKU": "کوڈ نہیں دیا",
  "in stock": "موجود ہے",
  "Sales, stock movements, and reports stay intact. You can reactivate the product from the inactive inventory filter.":
    "فروخت، مال کا لین دین اور حساب محفوظ رہیں گے۔ بند مال کے فلٹر سے یہ چیز دوبارہ کھول سکتے ہیں۔",
  "Receive stock": "نیا مال وصول کریں",
  "Add a delivery to {v0}.": "{v0} کا نیا آیا مال شامل کریں۔",
  "Quantity received": "کتنی مقدار آئی؟",
  "Unit cost ·": "فی اکائی لاگت ·",
  Supplier: "سپلائر",
  "Supplier name": "سپلائر کا نام",
  "Delivery payment": "آئے مال کی ادائیگی",
  "Paid in cash": "نقد ادا کر دیا",
  "Paid digitally": "ڈیجیٹل ادا کر دیا",
  "Unpaid / pay supplier later": "ابھی ادا نہیں کیا / بعد میں دیں گے",
  "Paid deliveries post a supplier payment to the cashbook. Unpaid deliveries do not create cash movement.":
    "ادا شدہ مال کی رقم پیسوں کے کھاتے میں سپلائر کی ادائیگی بنے گی۔ غیر ادا شدہ مال سے رقم کا لین دین نہیں بنتا۔",
  "Delivery note": "آئے مال کا نوٹ",
  "Invoice reference or delivery details": "بل نمبر یا مال کی تفصیل",
  "Delivery cost": "آئے مال کی کل لاگت",
  "Receipt cost updates weighted-average product cost when the previous cost is known. It does not rewrite historical sales.":
    "پہلی لاگت معلوم ہو تو نئے مال کے ساتھ اوسط لاگت بدلتی ہے۔ پرانی فروخت نہیں بدلتی۔",
  "Adjust stock": "مال کی مقدار درست کریں",
  "Record a counted correction, damage, or missing stock for {v0}.":
    "{v0} کی گنتی کا فرق، خراب یا گم مال لکھیں۔",
  "Record adjustment": "درستی محفوظ کریں",
  "For deliveries use Receive stock. For customer transactions use a sale or return.":
    "نیا مال آئے تو «مال وصول کریں» استعمال کریں۔ گاہک کے لیے فروخت یا واپسی لکھیں۔",
  "This adjustment would make stock negative. Check the quantity.":
    "اس تبدیلی سے مال صفر سے کم ہو جائے گا۔ مقدار دوبارہ دیکھیں۔",
  "Adjustment type": "درستی کی قسم",
  "Stock correction — counted difference": "گنتی درست کرنا — مقدار کا فرق",
  "Damaged stock — remove": "خراب مال — کم کریں",
  "Missing stock — remove": "گم مال — کم کریں",
  "Correction direction": "مقدار بڑھانی ہے یا گھٹانی؟",
  "Remove from stock": "مال کم کریں",
  "Add to stock": "مال بڑھائیں",
  "Quantity to remove": "کتنی مقدار کم کرنی ہے؟",
  "Quantity to add": "کتنی مقدار بڑھانی ہے؟",
  Reason: "وجہ",
  "What was damaged and why?": "کیا خراب ہوا اور کیوں؟",
  "Describe the missing stock": "گم مال کی تفصیل لکھیں",
  "Explain the counted difference": "گنتی کے فرق کی وجہ لکھیں",
  Current: "ابھی",
  "After adjustment": "درستی کے بعد",
  "{v0} {v1}": "{v0} {v1}",
  "This creates a permanent, timestamped movement. It does not record revenue or a payment.":
    "یہ وقت کے ساتھ مستقل ریکارڈ بناتا ہے۔ اس سے فروخت یا ادائیگی نہیں بنتی۔",
  "Stock movements": "مال کا لین دین",
  "{v0} · All movements are retained for audit.": "{v0} · جانچ کے لیے سارا لین دین محفوظ ہے۔",
  "Showing the latest 200 movements at most.": "زیادہ سے زیادہ تازہ 200 اندراجات دکھائے گئے ہیں۔",
  Close: "بند کریں",
  "Loading stock history…": "مال کا پرانا حساب کھل رہا ہے…",
  "Try again": "دوبارہ کوشش کریں",
  "No movements yet": "ابھی مال کا لین دین نہیں",
  "Receiving, sales, and adjustments will be recorded here.":
    "آیا مال، فروخت اور درستی یہاں دکھے گی۔",
  "Stock movements for": "مال کا لین دین برائے",
  Change: "فرق",
  "Stock after": "بعد کی مقدار",
  "Note / reference": "نوٹ / حوالہ",
  Cost: "لاگت",
  "Import products": "فائل سے مال شامل کریں",
  "Add up to 500 products in one validated, atomic import.":
    "ایک بار میں زیادہ سے زیادہ 500 چیزیں شامل کریں۔ سب درست ہوں گی تو ہی محفوظ ہوں گی۔",
  Cancel: "واپس جائیں",
  "Start with the template": "نمونے کی فائل سے شروع کریں",
  "Use its exact column names. Category names are created as needed.":
    "کالم کے نام وہی رکھیں۔ مال کی نئی قسمیں ضرورت کے مطابق بن جائیں گی۔",
  "Download CSV template": "CSV نمونہ ڈاؤن لوڈ کریں",
  "Choose your CSV file": "اپنی CSV فائل چنیں",
  "UTF-8 CSV, 500 KB maximum, no more than 500 product rows. SKUs and barcodes must be unique.":
    "UTF-8 CSV فائل، زیادہ سے زیادہ 500 KB اور 500 چیزیں۔ ہر کوڈ اور بارکوڈ الگ ہونا چاہیے۔",
  "Products imported successfully. Your inventory is up to date.":
    "فائل کا مال شامل ہو گیا۔ مال کی فہرست تازہ ہے۔",
  "Select a CSV file": "CSV فائل چنیں",
  "Reading your file…": "فائل پڑھی جا رہی ہے…",
  "Choose file to browse": "فائل چننے کے لیے دبائیں",
  "Choose a CSV no larger than 500 KB and no more than 500 product rows.":
    "500 KB سے چھوٹی CSV فائل چنیں جس میں زیادہ سے زیادہ 500 چیزیں ہوں۔",
  "Couldn’t read that file. Save it as a UTF-8 CSV and try again.":
    "فائل نہیں پڑھی جا سکی۔ اسے UTF-8 CSV میں محفوظ کر کے دوبارہ کوشش کریں۔",
  "FILE PREVIEW · FIRST LINES": "فائل کی ابتدائی سطریں",
  "Import adds new products; it does not overwrite existing ones. If any row fails validation, nothing is imported.":
    "فائل سے صرف نئی چیزیں شامل ہوتی ہیں، پہلے سے موجود مال نہیں بدلتا۔ ایک سطر بھی غلط ہو تو کچھ محفوظ نہیں ہو گا۔",
  Inactive: "فروخت بند",
  "In stock": "مال موجود",
  "Your products, stock levels, and everyday stock movements.":
    "اپنا مال، موجودہ مقدار اور روز کا آیا گیا مال دیکھیں۔",
  Import: "فائل سے شامل کریں",
  "Inventory summary": "مال کا خلاصہ",
  "Active products": "دستیاب چیزیں",
  "Product catalog": "مال کی فہرست",
  "Search products": "چیز تلاش کریں",
  "Search name, SKU, barcode…": "نام، کوڈ یا بارکوڈ سے تلاش کریں…",
  "Category filter": "قسم کا فلٹر",
  "Filter by category": "قسم کے مطابق دیکھیں",
  "All categories": "ساری قسمیں",
  "Stock filter": "مقدار کا فلٹر",
  "Filter by stock status": "مقدار کے مطابق دیکھیں",
  "All stock levels": "سارا مال",
  "Needs attention": "توجہ چاہیے",
  "Product visibility": "مال دکھانا",
  "Filter active products": "دستیاب یا بند چیزیں دیکھیں",
  "Inactive products": "بند کی گئی چیزیں",
  product: "چیز",
  products: "چیزیں",
  "matching filters": "فلٹر کے مطابق",
  "in your catalog": "آپ کی فہرست میں",
  "Clear filters": "فلٹر ہٹائیں",
  "Sort:": "ترتیب:",
  "Sort products": "مال کی ترتیب چنیں",
  "Name A–Z": "نام کے لحاظ سے",
  "Stock: low to high": "مقدار: کم سے زیادہ",
  "Price: low to high": "قیمت: کم سے زیادہ",
  "Newest first": "نیا مال پہلے",
  "No products match these filters": "ان فلٹرز میں کوئی چیز نہیں ملی",
  "A well-stocked shop starts here": "اپنا مال یہاں شامل کریں",
  "Try a different search or clear the filters to see more products.":
    "دوسرا نام تلاش کریں یا فلٹر ہٹا کر سارا مال دیکھیں۔",
  "Add your first product or import a CSV to start tracking inventory and recording sales.":
    "پہلی چیز شامل کریں یا CSV فائل لائیں، پھر مال کا حساب اور فروخت شروع کریں۔",
  "Add your first product": "پہلی چیز شامل کریں",
  "Import CSV": "CSV فائل سے شامل کریں",
  "Product inventory, prices and stock levels": "مال، قیمت اور موجودہ مقدار",
  "Stock on hand": "موجودہ مال",
  Actions: "کام",
  "SKU {v0}": "کوڈ {v0}",
  "Barcode {v0}": "بارکوڈ {v0}",
  "Cost has not been provided": "لاگت نہیں لکھی گئی",
  Unknown: "معلوم نہیں",
  Sell: "بیچیں",
  "Receive {v0}": "{v0} وصول کریں",
  "More actions for {v0}": "{v0} کے مزید کام",
  "Stock is updated only after a delivery, sale, return, or adjustment is successfully recorded.":
    "آیا مال، فروخت، واپسی یا درستی محفوظ ہونے کے بعد ہی مقدار بدلتی ہے۔",
  "LET’S SET THE FOUNDATIONS": "دکان شروع کریں",
  "One-time shop setup": "دکان کی ایک بار کی تیاری",
  "Make it your shop.": "اپنی دکان بنائیں۔",
  "A few essentials, and you’re ready to add products and record your first sale.":
    "یہ بنیادی تفصیل لکھیں، پھر مال اور پہلی فروخت شامل کر سکیں گے۔",
  "Shop details": "دکان کی تفصیل",
  "Ready to trade": "کام شروع کریں",
  "Your shop was created. Opening your workspace…": "دکان بن گئی۔ آپ کا حساب کھل رہا ہے…",
  "Choose a valid IANA timezone, such as Europe/London.":
    "درست وقت کا علاقہ چنیں، مثلاً Asia/Karachi۔",
  "Shop name": "دکان کا نام",
  "The name above your door": "دکان کے بورڈ والا نام",
  "Trading currency": "دکان کی کرنسی",
  "Three-letter ISO currency code, such as USD, GBP, or INR":
    "تین حرفی کرنسی کوڈ، مثلاً PKR، USD یا GBP",
  "Three-letter code, e.g. USD": "تین حرفی کوڈ، مثلاً PKR",
  "Single currency, two decimal places. It cannot change after your first product or financial activity.":
    "ایک دکان کی ایک کرنسی ہے، رقم کے دو اعشاری ہندسے ہیں۔ پہلی چیز یا لین دین کے بعد کرنسی نہیں بدل سکتی۔",
  "Create my shop": "میری دکان بنائیں",
  "Your catalog starts empty. No demo records or invented business figures.":
    "فہرست خالی شروع ہو گی۔ کوئی فرضی مال یا رقم شامل نہیں ہے۔",
  Reports: "تفصیلی حساب",
  "Sales performance, costs, and cash — with the distinctions that matter.":
    "فروخت، لاگت اور پیسوں کا الگ الگ حساب۔",
  "Export report": "حساب کی فائل ڈاؤن لوڈ کریں",
  sale: "فروخت",
  "line has": "سطر کی",
  "lines have": "سطروں کی",
  "unknown historical cost. Gross and net profit are unavailable for this period; known costs below are not complete costs.":
    "پرانی لاگت معلوم نہیں۔ ان تاریخوں کا مجموعی اور خالص منافع نہیں بتایا جا سکتا۔ نیچے صرف معلوم لاگت ہے، پوری لاگت نہیں۔",
  "{v0} sales · {v1} net units": "{v0} فروخت · {v1} خالص مقدار",
  "Gross profit": "مجموعی منافع",
  Unavailable: "دستیاب نہیں",
  "Historical cost is missing": "پرانی لاگت موجود نہیں",
  "Net revenue less cost of goods": "خالص فروخت میں سے مال کی لاگت کم",
  "Operating expenses": "دکان کے خرچے",
  "Recorded expenses in this period": "ان تاریخوں میں لکھے گئے خرچے",
  "Estimated net profit": "اندازاً خالص منافع",
  "Gross profit less recorded expenses": "مجموعی منافع میں سے محفوظ خرچے کم",
  "Revenue trend": "فروخت کا رجحان",
  "· Returns on the date recorded": "· واپسی اسی تاریخ پر جب لکھی گئی",
  "Revenue by category": "قسم کے مطابق فروخت",
  "Top categories ·": "زیادہ بکنے والی قسمیں ·",
  "Profit breakdown": "منافع کی تفصیل",
  "Recognized sales, not money collected": "فروخت کا حساب، وصول شدہ پیسوں کا نہیں",
  "Net sales revenue": "خالص فروخت کی آمدن",
  "Known cost of goods only": "صرف معلوم لاگت",
  "Cost of goods sold": "بکے ہوئے مال کی لاگت",
  "Known-cost gross profit:": "معلوم لاگت کا مجموعی منافع:",
  ". This is partial information, not the shop’s total profit.":
    "۔ یہ ادھوری معلومات ہے، دکان کا کل منافع نہیں۔",
  "Receipts & credit": "وصولیاں اور ادھار",
  "Collections are cash movement, not new revenue":
    "ادھار وصولی پیسوں کا لین دین ہے، نئی فروخت نہیں",
  "(not cash)": "(نقد نہیں)",
  "Refunds paid": "واپس کی گئی رقم",
  "Net money movement": "رقم کے آنے جانے کا خالص فرق",
  "(all methods)": "(سب طریقے)",
  "Money movement includes supplier payments, expenses, and owner deposits / withdrawals. It is not profit.":
    "پیسوں میں سپلائر کی ادائیگی، خرچے اور مالک کی ڈالی یا نکالی رقم شامل ہے۔ یہ منافع نہیں ہے۔",
  "Product performance": "مال کی فروخت کا حساب",
  "Original sale snapshots, net of return adjustments · sorted by net revenue":
    "اصل فروخت، واپسی کم کر کے · خالص فروخت کی ترتیب سے",
  "No product activity in this period": "ان تاریخوں میں مال کی فروخت یا واپسی نہیں",
  "Sales and returns will build this report. Try a different date range.":
    "فروخت اور واپسی کے بعد حساب بنے گا۔ دوسری تاریخیں چن کر دیکھیں۔",
  "Product performance for": "مال کی فروخت کا حساب برائے",
  "Cost of goods": "مال کی لاگت",
  "{v0} lines have unknown cost": "{v0} سطروں کی لاگت معلوم نہیں",
  Incomplete: "نامکمل",
  "Cashbook by payment method": "ادائیگی کے طریقے کے مطابق پیسوں کا حساب",
  "All receipts and outflows for the selected dates":
    "چنی ہوئی تاریخوں کی ساری وصولیاں اور ادائیگیاں",
  "No cash or digital movements": "نقد یا ڈیجیٹل لین دین نہیں",
  "Recorded receipts, refunds, and payments will appear here.":
    "محفوظ وصولیاں، واپس کی رقم اور ادائیگیاں یہاں دکھیں گی۔",
  "Money movement by payment method": "ادائیگی کے طریقے کے مطابق لین دین",
  "Dates use": "تاریخوں کا وقت:",
  ". Weeks start on Monday. Credit sales create receivables; their collections never count as revenue again. Estimated net profit excludes any costs not recorded in this app.":
    "۔ ہفتہ پیر سے شروع ہوتا ہے۔ ادھار فروخت کی وصولی دوبارہ آمدن نہیں بنتی۔ جو لاگت یہاں نہیں لکھی، وہ اندازاً خالص منافع میں شامل نہیں۔",
  Credit: "ادھار",
  "Sale {v0}": "فروخت {v0}",
  "Sale details": "فروخت کی تفصیل",
  "Loading the original sale and its audit history.":
    "اصل فروخت اور اس کا پرانا ریکارڈ کھل رہا ہے۔",
  "Posted records are never deleted.": "محفوظ لین دین کبھی حذف نہیں ہوتا۔",
  "Loading sale details…": "فروخت کی تفصیل کھل رہی ہے…",
  "Walk-in customer": "عام گاہک",
  "Original sale item snapshots. Catalog changes do not affect these amounts.":
    "فروخت کے وقت کی اصل تفصیل۔ مال کی فہرست بدلنے سے یہ رقمیں نہیں بدلتیں۔",
  "Original product": "اصل چیز",
  Quantity: "مقدار",
  "Unit price": "فی اکائی قیمت",
  Discount: "رعایت",
  "Line total": "اس چیز کی کل رقم",
  "Original cost": "اصل لاگت",
  returned: "واپس ہوئی",
  "Sale note": "فروخت کا نوٹ",
  "Prices, discounts, and costs above are the original historical snapshots. Unknown costs remain unavailable.":
    "اوپر اصل وقت کی قیمت، رعایت اور لاگت ہیں۔ نامعلوم لاگت اب بھی دستیاب نہیں۔",
  "Original subtotal": "رعایت سے پہلے کی اصل رقم",
  "Line discounts": "چیزوں پر رعایت",
  "Original sale total": "اصل فروخت کی کل رقم",
  "Returns / reversal": "واپسی / فروخت کی منسوخی",
  "Net sale value": "خالص فروخت کی رقم",
  "Net payments collected": "خالص وصول شدہ رقم",
  "Balance due": "باقی ادھار",
  "Collect payment": "ادھار وصول کریں",
  "Return items": "مال واپس لیں",
  "Reverse entire sale": "پوری فروخت منسوخ کریں",
  "Payment history": "ادائیگیوں کا ریکارڈ",
  "No money has been collected.": "ابھی کوئی رقم وصول نہیں ہوئی۔",
  "Credit collection": "ادھار کی وصولی",
  Refund: "رقم کی واپسی",
  "Sale payment": "فروخت کی ادائیگی",
  "Adjustment history": "تبدیلیوں کا ریکارڈ",
  "No returns or reversals recorded.": "کوئی واپسی یا منسوخی نہیں لکھی گئی۔",
  "Sale reversed": "فروخت منسوخ ہوئی",
  "Items returned": "مال واپس آیا",
  "Sale unavailable": "فروخت دستیاب نہیں",
  "This sale may not belong to your shop.": "ممکن ہے یہ فروخت آپ کی دکان کی نہ ہو۔",
  "Collect credit payment": "ادھار کی رقم وصول کریں",
  "Record money received for sale {v0}.": "فروخت {v0} کی وصول شدہ رقم لکھیں۔",
  "Record collection": "وصولی محفوظ کریں",
  "Outstanding balance": "باقی واجب الادا رقم",
  "Payment collected and added to the cashbook.":
    "وصولی محفوظ ہو گئی اور پیسوں کے کھاتے میں شامل ہے۔",
  "Amount received ·": "وصول شدہ رقم ·",
  "Collection note": "وصولی کا نوٹ",
  "Collections reduce the outstanding balance and create a receipt. They do not create additional sales revenue.":
    "وصولی سے ادھار کم ہوتا ہے اور وصولی کا ریکارڈ بنتا ہے۔ اس سے نئی فروخت نہیں بنتی۔",
  "Choose the items and quantities from sale {v0}.":
    "فروخت {v0} میں سے واپس آنے والی چیزیں اور مقدار چنیں۔",
  "Record return": "واپسی محفوظ کریں",
  "Select at least one item to return.": "واپسی کے لیے کم از کم ایک چیز چنیں۔",
  "Return quantities must be greater than zero and cannot exceed the remaining quantity.":
    "واپسی کی مقدار صفر سے زیادہ اور باقی مقدار سے کم یا برابر ہونی چاہیے۔",
  "Return recorded. Sale balance, stock, and any refund have been updated.":
    "واپسی محفوظ ہو گئی۔ فروخت کی باقی رقم، مال اور واپس کی رقم درست کر دی گئی ہے۔",
  "returnable · Original line": "واپس ہو سکتی ہے · اصل رقم",
  "Return quantity": "واپس آنے والی مقدار",
  "Return quantity for {v0}": "{v0} کی واپس آنے والی مقدار",
  Restock: "دوبارہ مال میں شامل کریں",
  "Uncheck Restock for damaged or unsellable items. All selected quantities still reduce the net sale.":
    "خراب یا نہ بک سکنے والی چیز کو دوبارہ مال میں شامل نہ کریں۔ چنی ہوئی پوری مقدار خالص فروخت سے کم ہو گی۔",
  "Return reason": "واپسی کی وجہ",
  "Why are these items being returned?": "یہ مال واپس کیوں آ رہا ہے؟",
  "Refund method, if money is owed": "اگر رقم واپس دینی ہو تو طریقہ",
  "Selected items": "چنی ہوئی چیزیں",
  "The server prorates the original discounts and costs exactly. Unpaid credit is reduced first; a refund is issued only for money paid beyond the remaining sale value. The adjustment is dated today.":
    "اصل رعایت اور لاگت تناسب سے درست حساب ہوتی ہے۔ پہلے باقی ادھار کم ہوتا ہے؛ رقم صرف تب واپس ہوتی ہے جب وصول شدہ رقم باقی فروخت سے زیادہ ہو۔ تبدیلی آج کی تاریخ میں ہو گی۔",
  "Reverse the entire sale?": "پوری فروخت منسوخ کریں؟",
  "Sale {v0} · {v1}": "فروخت {v0} · {v1}",
  "Keep sale": "فروخت برقرار رکھیں",
  "Reverse sale": "فروخت منسوخ کریں",
  "This posts a permanent reversal, restocks every original item, and refunds any money due. The original sale stays visible. This cannot be undone.":
    "یہ مستقل منسوخی ہو گی، سارا اصل مال واپس اسٹاک میں جائے گا اور واجب رقم واپس ہو گی۔ اصل فروخت نظر آتی رہے گی۔ یہ عمل واپس نہیں ہو سکتا۔",
  "Reason for full reversal": "پوری فروخت منسوخ کرنے کی وجہ",
  "Explain why this whole sale must be reversed": "بتائیں پوری فروخت کیوں منسوخ کرنی ہے",
  "Unpaid credit is cancelled without creating a cash refund. For a sale with earlier returns, return the remaining items instead.":
    "باقی ادھار نقد رقم واپس کیے بغیر ختم ہوتا ہے۔ اگر پہلے کچھ مال واپس ہو چکا ہے تو صرف باقی مال کی واپسی لکھیں۔",
  "I understand this reverses the whole sale and returns all items to stock.":
    "میں سمجھتا ہوں کہ پوری فروخت منسوخ ہو گی اور سارا مال اسٹاک میں واپس جائے گا۔",
  "A sale can contain at most 100 different products.":
    "ایک فروخت میں زیادہ سے زیادہ 100 الگ چیزیں ہو سکتی ہیں۔",
  "Add at least one product to this sale.": "فروخت میں کم از کم ایک چیز شامل کریں۔",
  "Check quantities, prices, and discounts. A line discount cannot exceed its value.":
    "مقدار، قیمت اور رعایت دیکھیں۔ رعایت اس چیز کی کل رقم سے زیادہ نہیں ہو سکتی۔",
  "A quantity is higher than the available stock. Reduce the quantity and try again.":
    "مقدار موجودہ مال سے زیادہ ہے۔ مقدار کم کر کے دوبارہ کوشش کریں۔",
  "Add the customer’s name to record a credit sale.": "ادھار لکھنے کے لیے گاہک کا نام ضروری ہے۔",
  "Sale {v0} recorded successfully.": "فروخت {v0} محفوظ ہو گئی۔",
  "Sale recorded successfully.": "فروخت محفوظ ہو گئی۔",
  "Build the sale, choose payment, and record it once.":
    "چیزیں شامل کریں، ادائیگی چنیں اور ایک بار محفوظ کریں۔",
  Total: "کل رقم",
  "Check amounts": "رقم درست کریں",
  "Recording…": "محفوظ ہو رہا ہے…",
  "Record credit sale": "ادھار فروخت محفوظ کریں",
  "Record sale": "فروخت محفوظ کریں",
  "A previously submitted sale was restored.": "پہلے بھیجی گئی فروخت دوبارہ کھول دی گئی ہے۔",
  "It may already have been saved. Retry this unchanged form to recover the original result safely. Before changing it or starting a different sale,":
    "یہ شاید پہلے ہی محفوظ ہو چکی ہو۔ اسی تفصیل کو بدلے بغیر دوبارہ بھیجیں تاکہ اصل نتیجہ ملے۔ بدلنے یا نئی فروخت شروع کرنے سے پہلے",
  "review Sales": "فروخت کی فہرست دیکھیں",
  "Add products": "چیزیں شامل کریں",
  "Search by product name, SKU, or barcode": "چیز کے نام، کوڈ یا بارکوڈ سے تلاش کریں",
  "Finding products…": "مال تلاش ہو رہا ہے…",
  Retry: "دوبارہ کوشش کریں",
  "No matching active products. Try a name, SKU, or barcode.":
    "کوئی دستیاب چیز نہیں ملی۔ نام، کوڈ یا بارکوڈ سے تلاش کریں۔",
  "No active products yet. Add products from Inventory first.":
    "ابھی کوئی چیز دستیاب نہیں۔ پہلے مال کی فہرست میں چیزیں شامل کریں۔",
  "Matching products": "ملنے والی چیزیں",
  available: "دستیاب",
  Out: "ختم",
  "Sale items": "فروخت کی چیزیں",
  "Discounts are flat amounts per line": "ہر چیز کی رعایت رقم میں ہے، فیصد میں نہیں",
  "Your sale is empty": "ابھی فروخت میں کوئی چیز نہیں",
  "Choose a product above to get started.": "اوپر سے چیز چن کر شروع کریں۔",
  "Quantity for {v0}": "{v0} کی مقدار",
  "Unit price for {v0}, {v1}": "{v0} کی فی اکائی قیمت، {v1}",
  "Line discount for {v0}, {v1}": "{v0} پر رعایت، {v1}",
  "Invalid amount": "رقم درست نہیں",
  "Remove {v0}": "{v0} ہٹائیں",
  Only: "صرف",
  "Line discounts included": "شامل رعایت",
  "Creates an outstanding balance, not a cash receipt. Collect payment from Sales when it is received.":
    "اس سے ادھار بنتا ہے، نقد وصولی نہیں۔ پیسے ملیں تو فروخت کی فہرست سے وصولی لکھیں۔",
  "Customer name": "گاہک کا نام",
  "Required for credit sales": "ادھار کے لیے ضروری",
  Contact: "رابطہ",
  "Phone number or email": "فون نمبر یا ای میل",
  "Anything worth keeping with this sale": "اس فروخت کے بارے میں ضروری بات",
  "Stock and totals are checked again when you record the sale. The sale is saved only after the server confirms it.":
    "محفوظ کرتے وقت مال اور رقم دوبارہ جانچے جاتے ہیں۔ سرور کی تصدیق کے بعد ہی فروخت محفوظ ہوتی ہے۔",
  Sales: "فروخت",
  "Every sale, payment, and return. A complete record, not a running estimate.":
    "ہر فروخت، ادائیگی اور واپسی کا مکمل ریکارڈ؛ اندازہ نہیں۔",
  "Dates in": "تاریخوں کا وقت:",
  "Search sales": "فروخت تلاش کریں",
  "Search reference, customer, or product…": "حوالہ نمبر، گاہک یا چیز تلاش کریں…",
  "Payment method filter": "ادائیگی کا فلٹر",
  "Filter sales by payment method": "ادائیگی کے مطابق فروخت دیکھیں",
  "All payment methods": "ادائیگی کے سب طریقے",
  sales: "فروخت",
  "No matching sales": "کوئی فروخت نہیں ملی",
  "No sales in this period": "ان تاریخوں میں فروخت نہیں",
  "Try a different reference, customer, product, or payment filter.":
    "دوسرا حوالہ، گاہک، چیز یا ادائیگی کا فلٹر آزمائیں۔",
  "Record a sale or choose a different date range. Sales appear here only after they are saved.":
    "فروخت لکھیں یا دوسری تاریخیں چنیں۔ فروخت محفوظ ہونے کے بعد ہی یہاں دکھتی ہے۔",
  "Record a sale": "فروخت لکھیں",
  "Sales for": "فروخت برائے",
  "Sale / products": "فروخت / چیزیں",
  "Sale amount": "فروخت کی رقم",
  Details: "تفصیل",
  due: "باقی",
  Net: "خالص",
  View: "دیکھیں",
  "Original sales remain in their original period. Returns and reversals are adjustments dated when recorded.":
    "اصل فروخت اپنی اصل تاریخ پر رہتی ہے۔ واپسی اور منسوخی اسی تاریخ میں آتی ہے جب لکھی جائے۔",
  "Shop timezone": "دکان کا وقت",
  "Area/City": "علاقہ/شہر",
  "Use an IANA timezone, such as Europe/London. Determines reporting-day boundaries.":
    "IANA وقت کا علاقہ استعمال کریں، مثلاً Asia/Karachi۔ اسی کے مطابق روز کا حساب بنتا ہے۔",
  Settings: "ترتیبات",
  "Shop details, reporting preferences, and taking care of your data.":
    "دکان کی تفصیل، حساب کا وقت اور اپنا ریکارڈ محفوظ رکھنا۔",
  "Shop profile": "دکان کی پہچان",
  "The details used throughout your shop’s workspace and exports.":
    "یہ تفصیل دکان کے صفحات اور ڈاؤن لوڈ فائلوں میں آتی ہے۔",
  "Owner access": "مالک کی رسائی",
  "Staff access": "عملے کی رسائی",
  "Business details": "کاروبار کی تفصیل",
  Created: "بنائی گئی:",
  "Enter a valid IANA timezone, such as Europe/London.":
    "درست وقت کا علاقہ لکھیں، مثلاً Asia/Karachi۔",
  "Only the shop owner can change these settings. You can still export operational data below.":
    "صرف دکان کا مالک یہ ترتیبات بدل سکتا ہے۔ آپ نیچے سے ریکارڈ کی فائل لے سکتے ہیں۔",
  "Shop settings saved.": "دکان کی ترتیبات محفوظ ہو گئیں۔",
  Currency: "کرنسی",
  "Locked after the first product or financial activity. Amounts have two decimal places.":
    "پہلی چیز یا لین دین کے بعد کرنسی نہیں بدلے گی۔ رقم کے دو اعشاری ہندسے ہیں۔",
  "Changing timezone changes calendar grouping, not the original timestamps. Historical sale snapshots remain unchanged.":
    "وقت کا علاقہ بدلنے سے روزانہ کی ترتیب بدلتی ہے، اصل وقت نہیں۔ پرانی فروخت کی تفصیل وہی رہتی ہے۔",
  "Changes apply to your whole shop.": "تبدیلی پوری دکان پر لاگو ہو گی۔",
  "Read-only for staff.": "عملہ صرف دیکھ سکتا ہے۔",
  "Your data": "آپ کا ریکارڈ",
  "Portable records and a clear plan for backups. Your shop data stays yours.":
    "ریکارڈ کی فائل اور محفوظ نقل کا بندوبست۔ دکان کا ریکارڈ آپ کا ہے۔",
  "Exports & backups": "فائلیں اور محفوظ نقلیں",
  "CSV exports are useful. They are not a full database backup.":
    "CSV فائل مفید ہے، مگر پورے ڈیٹابیس کی محفوظ نقل نہیں۔",
  "Download operational data": "دکان کا ریکارڈ ڈاؤن لوڈ کریں",
  "Use the date controls on Sales, Reports, Cashbook, and Expenses before exporting. The full product catalog can be downloaded here.":
    "فروخت، تفصیلی حساب، پیسوں اور خرچوں کے صفحات پر پہلے تاریخیں چنیں، پھر فائل لیں۔ مال کی پوری فہرست یہاں سے لے سکتے ہیں۔",
  "Export inventory": "مال کی فائل ڈاؤن لوڈ کریں",
  "Product CSV template": "مال کی CSV نمونہ فائل",
  "Back up the complete ledger": "پورے کھاتے کی محفوظ نقل بنائیں",
  "Use your Supabase project’s database backup tools.":
    "اپنے Supabase پروجیکٹ کے ڈیٹابیس بیک اپ اوزار استعمال کریں۔",
  "Availability and retention depend on your Supabase plan. For self-managed backups, take a PostgreSQL dump using your project’s documented connection settings.":
    "بیک اپ کی دستیابی اور مدت Supabase پلان پر منحصر ہے۔ اپنی نقل بنانے کے لیے پروجیکٹ کی ہدایات کے مطابق PostgreSQL dump لیں۔",
  "Keep backups private and encrypted.": "محفوظ نقلیں نجی اور رمز بند رکھیں۔",
  "Back up schema, data, functions, and access policies. Keep authentication recovery, project configuration, and environment secrets in a separate secure recovery plan.":
    "اسکیما، ڈیٹا، فنکشن اور رسائی کی پالیسیوں کی نقل رکھیں۔ سائن اِن بحالی، پروجیکٹ ترتیبات اور خفیہ معلومات کا الگ محفوظ بندوبست رکھیں۔",
  "Test a restore before you need it.": "ضرورت سے پہلے بحالی آزما لیں۔",
  "Restore into an isolated project, confirm its migration version, and verify memberships, stock, sale balances, ledger totals, and row-level security before reconnecting an application.":
    "الگ پروجیکٹ میں نقل بحال کریں۔ ایپ جوڑنے سے پہلے مائیگریشن ورژن، رکنیت، مال، فروخت کی باقی رقم، کھاتے کے کل اور رسائی کی حفاظت جانچیں۔",
  "Product CSV import adds catalog records only. It does not restore sales, stock history, payments, authentication, or shop membership. Do not treat an export as a restorable backup.":
    "CSV صرف مال کی فہرست شامل کرتی ہے۔ یہ فروخت، مال کا پرانا حساب، ادائیگیاں، اکاؤنٹ یا رکنیت بحال نہیں کرتی۔ ڈاؤن لوڈ فائل کو پورا بیک اپ نہ سمجھیں۔",
  "MVP boundaries": "اس ایپ کی حدود",
  "A focused, single-shop retail system.": "ایک دکان کے ضروری حساب کا نظام۔",
  "Single currency per shop": "ہر دکان کی ایک کرنسی",
  Access: "رسائی",
  "Authenticated shop membership": "سائن اِن اور دکان کی رکنیت ضروری",
  History: "پرانا ریکارڈ",
  "Append-only financial and stock events": "رقم اور مال کے واقعات صرف شامل ہوتے ہیں، مٹتے نہیں",
  "Not included": "شامل نہیں",
  "Tax engine, branches, invitations, or payment processing":
    "ٹیکس کا نظام، برانچیں، دعوتیں یا اصل رقم کی منتقلی",
  "Selecting Digital records how money was received. Verdant does not charge a card or connect to a payment terminal.":
    "ڈیجیٹل چننے سے صرف ادائیگی کا طریقہ لکھا جاتا ہے۔ ورڈنٹ کارڈ سے رقم نہیں لیتا اور ادائیگی کی مشین سے نہیں جڑتا۔",
  "Configuration required": "نظام کی تیاری ضروری ہے",
  "WELCOME TO VERDANT POS": "ورڈنٹ POS میں خوش آمدید",
  "A considered workspace.": "دکان کا حساب تیار ہے۔",
  "A real connection first.": "پہلے ڈیٹابیس جوڑیں۔",
  "Your retail console is ready to configure. Connect a Supabase project to enable secure accounts, inventory, and the financial ledger.":
    "محفوظ اکاؤنٹ، مال اور پیسوں کا کھاتا چلانے کے لیے Supabase پروجیکٹ جوڑیں۔",
  "No database is connected yet. This screen does not represent a live shop or production activity.":
    "ابھی ڈیٹابیس نہیں جڑا۔ یہ کسی چلتی دکان کا اصل لین دین نہیں ہے۔",
  "Get your workspace running": "نظام چلانے کے مراحل",
  "For the person setting up this installation": "یہ ہدایات نظام تیار کرنے والے کے لیے ہیں",
  "Create and prepare a database": "ڈیٹابیس بنائیں اور تیار کریں",
  "Create a Supabase project. Apply the migrations in":
    "Supabase پروجیکٹ بنائیں۔ یہاں کی مائیگریشن چلائیں:",
  "to create shop-scoped tables, access policies, and atomic posting functions.":
    "تاکہ دکان کی جدولیں، رسائی کی پالیسیاں اور محفوظ لین دین کے فنکشن بنیں۔",
  "Add your project configuration": "پروجیکٹ کی ترتیبات شامل کریں",
  Copy: "نقل کریں:",
  ". Set the public project URL and publishable key, plus this application’s canonical URL.":
    "۔ عوامی پروجیکٹ URL، قابل اشاعت کلید اور اس ایپ کا اصل URL لکھیں۔",
  "Never put a service-role key, database password, or secret key in a":
    "سروس رول کلید، ڈیٹابیس پاس ورڈ یا خفیہ کلید کبھی اس میں نہ رکھیں:",
  "Configure authentication": "سائن اِن کا نظام تیار کریں",
  "Enable email authentication. Add your application URL and":
    "ای میل سائن اِن کھولیں۔ اپنی ایپ کا URL اور",
  "to Supabase’s allowed redirect URLs. Password recovery returns through that callback to":
    "کو Supabase کے منظور شدہ واپسی URLs میں شامل کریں۔ پاس ورڈ کی بحالی اس راستے سے واپس آتی ہے:",
  "Restart and create your shop": "دوبارہ چلائیں اور دکان بنائیں",
  "Restart the Next.js server after changing environment variables. Create an account, confirm your email if required, and complete the one-time shop setup.":
    "ماحولیاتی ترتیبات بدلنے کے بعد Next.js سرور دوبارہ چلائیں۔ اکاؤنٹ بنائیں، ضرورت ہو تو ای میل کی تصدیق کریں اور دکان کی تفصیل مکمل کریں۔",
  "Continue to sign in": "سائن اِن پر جائیں",
  "Real authentication": "اصل محفوظ سائن اِن",
  "Atomic stock & money records": "مال اور پیسوں کا یکجا محفوظ ریکارڈ",
  "No demo business data": "کوئی فرضی کاروباری ڈیٹا نہیں",
  "A connected project, applied migrations, and a production deployment still need to be verified in your environment. See the project README and docs for setup, backups, and verification.":
    "اپنے نظام میں جڑے پروجیکٹ، مائیگریشن اور اصل تنصیب کی جانچ ضروری ہے۔ تیاری، بیک اپ اور جانچ کے لیے README اور ہدایات دیکھیں۔",
  "Built for the business of every day.": "دکان کے ہر دن کے لیے۔",
  POS: "POS",
  "Dismiss message": "پیغام ہٹائیں",
  "Something didn’t load": "یہ حصہ نہیں کھل سکا",
  "Back to overview": "خلاصے پر واپس جائیں",
  "Close dialog": "کھڑکی بند کریں",
  Page: "صفحہ",
  "Previous page": "پچھلا صفحہ",
  "Next page": "اگلا صفحہ",
  "Reporting date range": "حساب کی تاریخیں",
  "Date preset": "تاریخوں کا انتخاب",
  Today: "آج",
  "This week": "اس ہفتے",
  "This month": "اس مہینے",
  "Custom dates": "اپنی تاریخیں چنیں",
  "From date": "شروع کی تاریخ",
  "To date, inclusive": "آخری تاریخ، اس دن سمیت",
  Apply: "لاگو کریں",
  "Saving…": "محفوظ ہو رہا ہے…",
  "VERDANT POS": "ورڈنٹ POS",
  "This page isn’t here.": "یہ صفحہ موجود نہیں۔",
  "Return to your workspace to continue managing your shop.":
    "اپنی دکان کا حساب جاری رکھنے کے لیے واپس جائیں۔",
  "Back to dashboard →": "خلاصے پر واپس جائیں ←",
  "The workspace is temporarily unavailable. Check your connection and database setup, then retry. Your saved records have not been changed.":
    "دکان کا صفحہ ابھی نہیں کھل سکتا۔ انٹرنیٹ اور ڈیٹابیس کی تیاری دیکھ کر دوبارہ کوشش کریں۔ محفوظ ریکارڈ نہیں بدلا۔",
  "We couldn’t load your shop records. Check your connection and confirm the Supabase migrations have been applied. No figures have been substituted.":
    "دکان کا ریکارڈ نہیں کھل سکا۔ انٹرنیٹ اور Supabase مائیگریشن کی جانچ کریں۔ کوئی فرضی رقم نہیں دکھائی گئی۔",
  "RETAIL, WITHOUT THE FRICTION": "روزمرہ دکان داری، آسان حساب",
  "Welcome back": "خوش آمدید",
  "Start with a fresh outlook": "اپنی دکان کا حساب شروع کریں",
  "Forgot your password?": "پاس ورڈ بھول گئے؟",
  "Choose a new password": "نیا پاس ورڈ چنیں",
  "Sign in to your shop’s workspace.": "اپنی دکان کا حساب کھولنے کے لیے سائن اِن کریں۔",
  "Create your account. Set up your shop next.": "پہلے اکاؤنٹ بنائیں، پھر دکان کی تفصیل لکھیں۔",
  "We’ll email you a secure link to reset it.":
    "ہم آپ کو پاس ورڈ بدلنے کا محفوظ لنک ای میل کریں گے۔",
  "Use a strong password you haven’t used elsewhere.":
    "مضبوط پاس ورڈ رکھیں جو کہیں اور استعمال نہ کیا ہو۔",
  Workspace: "دکان کا حساب",
  "Shop settings": "دکان کی ترتیبات",
  "Sale receipt": "فروخت کی وصولی",
  "Customer refund": "گاہک کو رقم واپس",
  "Supplier payment": "سپلائر کو ادائیگی",
  Expense: "خرچہ",
  "Owner withdrawal": "مالک نے رقم نکالی",
  "Owner deposit": "مالک نے رقم ڈالی",
  "Expense saved and added to the cashbook.": "خرچہ محفوظ ہو گیا اور پیسوں کے کھاتے میں شامل ہے۔",
  "Category “{v0}” created.": "«{v0}» قسم بن گئی۔",
  "{v0} deactivated. Its history is preserved.":
    "{v0} کی فروخت بند کر دی گئی۔ پرانا ریکارڈ محفوظ ہے۔",
  "{v0} {v1} received for {v2}.": "{v2} کا {v0} {v1} مال وصول ہو گیا۔",
  "Stock adjustment recorded for {v0}.": "{v0} کی مقدار کی درستی محفوظ ہو گئی۔",
  "Sale {v0} reversed. The original record has been preserved.":
    "فروخت {v0} منسوخ ہو گئی۔ اصل ریکارڈ محفوظ ہے۔",
  Reversed: "منسوخ",
  Returned: "واپس ہوئی",
  "Partial return": "کچھ مال واپس",
  Unpaid: "ادا نہیں ہوا",
  "Part paid": "کچھ رقم وصول",
  Paid: "ادا ہو گیا",
  "Credit / pay later": "ادھار / بعد میں دیں گے",
  "Loading your workspace…": "دکان کا حساب کھل رہا ہے…",
  "We couldn’t load this page. Your saved records are safe. Please try again.":
    "یہ صفحہ نہیں کھل سکا۔ آپ کا ریکارڈ محفوظ ہے۔ دوبارہ کوشش کریں۔",
  "More actions": "مزید کام",
  "(optional)": "(ضروری نہیں)",
  "Custom period": "چنی ہوئی تاریخیں",
  "Focus quantity for": "مقدار بدلیں:",
  "Focus quantity for {v0}": "{v0} کی مقدار بدلیں",
  "Add {v0}": "{v0} شامل کریں",
  Add: "شامل کریں",
  "{v0} {v1} product": "{v0} {v1} چیز",
  "Daily hisaab": "روز کا حساب",
  "What do you need to do?": "کیا کام کرنا ہے؟",
  "Choose a task. Your saved records stay safe.": "کام چنیں۔ آپ کا محفوظ ریکارڈ اپنی جگہ رہے گا۔",
  "Sell to a customer": "گاہک کو مال بیچیں",
  "Choose maal, then cash, digital or udhaar.": "مال چنیں، پھر نقد، ڈیجیٹل یا ادھار لکھیں۔",
  "Check stock / maal": "مال کی مقدار دیکھیں",
  "See what is left. Receive new deliveries here.": "باقی مال دیکھیں۔ نیا آیا مال بھی یہیں لکھیں۔",
  "Collect udhaar": "ادھار وصول کریں",
  "Open a credit sale and record the money received.":
    "ادھار والی فروخت کھول کر ملی ہوئی رقم لکھیں۔",
  "Record a daily expense": "روز کا خرچہ لکھیں",
  "Rent, electricity or transport — keep a clear record.":
    "کرایہ، بجلی یا ٹرانسپورٹ — صاف حساب رکھیں۔",
  "Credit means udhaar: payment will be collected later.": "ادھار یعنی رقم بعد میں وصول ہو گی۔",
  "Digital means a payment already received, e.g. bank or mobile wallet. No money is transferred by this app.":
    "ڈیجیٹل یعنی رقم پہلے وصول ہو چکی ہے، مثلاً بینک یا موبائل والٹ سے۔ یہ ایپ رقم منتقل نہیں کرتی۔",
  "New shops start with PKR and Pakistan time. You can edit these before creating the shop.":
    "نئی دکان کے لیے PKR اور پاکستان کا وقت رکھا گیا ہے۔ دکان بنانے سے پہلے بدل سکتے ہیں۔",
  "Three-letter code, e.g. PKR": "تین حرفی کوڈ، مثلاً PKR",
  "Three-letter ISO currency code, such as PKR, USD, or GBP":
    "تین حرفی کرنسی کوڈ، مثلاً PKR، USD یا GBP",
  "Use an IANA timezone, such as Asia/Karachi. Determines reporting-day boundaries.":
    "وقت کا درست علاقہ لکھیں، مثلاً Asia/Karachi۔ روز کا حساب اسی وقت کے مطابق بنتا ہے۔",
  "Language & appearance": "زبان اور رنگ",
  "Choose Urdu or English and a comfortable screen colour. This device preference does not change shop records.":
    "اردو یا انگریزی اور آسانی سے نظر آنے والا رنگ چنیں۔ اس آلے کی یہ پسند دکان کا ریکارڈ نہیں بدلتی۔",
  "Step 1 · Choose products": "پہلا قدم · چیزیں چنیں",
  "Step 2 · Payment and customer": "دوسرا قدم · ادائیگی اور گاہک",
  "Step 3 · Check total, then record": "تیسرا قدم · کل رقم دیکھ کر محفوظ کریں",
  "{v0}–{v1} of {v2} {v3}": "{v2} {v3} میں سے {v0}–{v1}",
  "Page {v0} of {v1}": "صفحہ {v0}، کل {v1}",
  "Only {v0} {v1} available.": "صرف {v0} {v1} دستیاب ہے۔",
  "{v0} of {v1}": "{v1} میں سے {v0}",
  opening: "شروع کی مقدار",
  receive: "آیا مال",
  return: "واپسی",
  reversal: "منسوخی",
  correction: "گنتی کی درستی",
  damage: "خراب مال",
  missing: "گم مال",
  cash: "نقد",
  digital: "ڈیجیٹل / بینک",
  credit: "ادھار",
  "Something went wrong. Please try again.": "مسئلہ پیش آیا۔ دوبارہ کوشش کریں۔",
  "We couldn’t load this information.": "یہ معلومات نہیں کھل سکیں۔",
  "Couldn’t search products.": "مال تلاش نہیں ہو سکا۔",
  "The server returned an unreadable response. Retry without changing the form to avoid duplicates.":
    "سرور کا جواب سمجھ نہیں آیا۔ دوہرا اندراج نہ ہو، اس لیے فارم بدلے بغیر دوبارہ بھیجیں۔",
  "The request could not be completed.": "درخواست مکمل نہیں ہو سکی۔",
  "Connection interrupted. Your sale may have been saved. Retry this unchanged form to safely recover the original result.":
    "رابطہ ٹوٹ گیا۔ فروخت شاید محفوظ ہو چکی ہو۔ اصل نتیجہ لینے کے لیے فارم بدلے بغیر دوبارہ بھیجیں۔",
  "Invalid login credentials": "ای میل یا پاس ورڈ درست نہیں۔ دوبارہ دیکھیں۔",
  "Email not confirmed": "پہلے اپنی ای میل کی تصدیق کریں۔",
  "User already registered": "اس ای میل پر اکاؤنٹ موجود ہے۔ سائن اِن کریں۔",
  "Email rate limit exceeded": "ای میل کی حد پوری ہو گئی۔ کچھ دیر بعد دوبارہ کوشش کریں۔",
  "Failed to fetch": "انٹرنیٹ رابطہ نہیں ہو سکا۔ اپنا کنکشن دیکھیں۔",
  "You do not have permission to perform this action.": "آپ کو یہ کام کرنے کی اجازت نہیں ہے۔",
  "This request was already recorded in the shop by another signed-in user. Review the transaction history before starting a new request.":
    "یہ درخواست دکان میں دوسرے صارف سے محفوظ ہو چکی ہے۔ نئی درخواست سے پہلے لین دین دیکھیں۔",
  "This request key was already used for different values. Review the saved transaction before starting a new request.":
    "یہ درخواست نمبر مختلف تفصیل کے لیے استعمال ہو چکا ہے۔ نئی درخواست سے پہلے محفوظ لین دین دیکھیں۔",
  "This SKU, barcode, category, or request already exists. Check the values and try again.":
    "یہ کوڈ، بارکوڈ، قسم یا درخواست پہلے سے موجود ہے۔ تفصیل دیکھ کر دوبارہ کوشش کریں۔",
  "A linked record is unavailable or belongs to another shop.":
    "جڑا ہوا ریکارڈ دستیاب نہیں یا دوسری دکان کا ہے۔",
  "An amount exceeds the supported range.": "رقم اجازت دی گئی حد سے زیادہ ہے۔",
  "Database setup is incomplete. Apply the Supabase migrations, then try again.":
    "ڈیٹابیس کی تیاری نامکمل ہے۔ منتظم سے Supabase مائیگریشن چلوا کر دوبارہ کوشش کریں۔",
  "The database could not complete this request. Please try again; unchanged retries are safe.":
    "ڈیٹابیس درخواست مکمل نہیں کر سکا۔ تفصیل بدلے بغیر دوبارہ کوشش کرنا محفوظ ہے۔",
  "Enter an amount greater than zero within the supported range.":
    "صفر سے زیادہ اور اجازت دی گئی حد کے اندر رقم لکھیں۔",
  "This number is outside the supported range.": "یہ عدد اجازت دی گئی حد سے باہر ہے۔",
  "The stock change cannot be zero.": "مال کی تبدیلی صفر نہیں ہو سکتی۔",
  "Add a short reason for the audit history.": "ریکارڈ کے لیے مختصر وجہ لکھیں۔",
  "Choose a valid calendar date.": "درست تاریخ چنیں۔",
  "Product name is required.": "چیز کا نام ضروری ہے۔",
  "Use Receive Stock or Adjust Stock to change an existing product's quantity.":
    "موجودہ چیز کی مقدار بدلنے کے لیے مال وصول کریں یا مقدار درست کریں۔",
  "Refresh inventory before editing this product so newer changes are not overwritten.":
    "تفصیل بدلنے سے پہلے مال کی فہرست تازہ کریں تاکہ نئی تبدیلی ضائع نہ ہو۔",
  "Category name is required.": "قسم کا نام ضروری ہے۔",
  "Add at least one product.": "کم از کم ایک چیز شامل کریں۔",
  "Customer name is required for credit sales.": "ادھار فروخت کے لیے گاہک کا نام ضروری ہے۔",
  "Each product can appear only once. Increase its quantity instead.":
    "ایک چیز صرف ایک بار شامل ہو سکتی ہے۔ اسی کی مقدار بڑھائیں۔",
  "The discount cannot exceed the line subtotal.": "رعایت اس چیز کی کل رقم سے زیادہ نہیں ہو سکتی۔",
  "Damaged or missing stock must be a negative change.": "خراب یا گم مال کی مقدار کم ہونی چاہیے۔",
  "Each sale item can be returned only once per request.":
    "ایک درخواست میں ہر چیز کی واپسی صرف ایک بار لکھیں۔",
  "Choose a three-letter ISO currency code.": "تین حرفی کرنسی کوڈ چنیں۔",
  "Choose a supported ISO currency code.": "منظور شدہ کرنسی کوڈ چنیں۔",
  "Choose a valid IANA timezone, such as Asia/Karachi.":
    "درست وقت کا علاقہ چنیں، مثلاً Asia/Karachi۔",
  "Import files must be 500 KB or smaller.": "فائل 500 KB یا اس سے چھوٹی ہونی چاہیے۔",
  "Check the form values.": "فارم کی تفصیل درست کریں۔",
  "Create a shop first.": "پہلے دکان بنائیں۔",
  "Cash movements and expenses cannot be dated in the future.":
    "پیسوں کا لین دین اور خرچہ آنے والی تاریخ پر نہیں لکھ سکتے۔",
  "Create your shop before changing its settings.": "ترتیبات بدلنے سے پہلے اپنی دکان بنائیں۔",
  "Your shop is unavailable. Contact the shop owner.": "دکان دستیاب نہیں۔ مالک سے رابطہ کریں۔",
  "Your access to this shop has been revoked. Contact the shop owner.":
    "اس دکان تک آپ کی رسائی ختم کر دی گئی ہے۔ مالک سے رابطہ کریں۔",
  "Create your shop before recording transactions.": "لین دین لکھنے سے پہلے اپنی دکان بنائیں۔",
  "Invalid payment method": "ادائیگی کا طریقہ درست نہیں۔",
  "Invalid currency": "کرنسی درست نہیں۔",
  "Invalid time zone": "وقت کا علاقہ درست نہیں۔",
  "Currency cannot change after financial activity": "لین دین کے بعد کرنسی نہیں بدل سکتی۔",
  "Currency cannot change after products or financial activity exist":
    "مال یا لین دین شامل ہونے کے بعد کرنسی نہیں بدل سکتی۔",
  "Category not found in this shop": "اس دکان میں یہ قسم نہیں ملی۔",
  "Product not found in this shop": "اس دکان میں یہ چیز نہیں ملی۔",
  "Invalid stock adjustment": "مال کی درستی درست نہیں۔",
  "Credit requires customer name": "ادھار کے لیے گاہک کا نام ضروری ہے۔",
  "Duplicate product in sale": "یہ چیز فروخت میں دوبارہ شامل ہے۔ مقدار بڑھائیں۔",
  "Active product not found in this shop": "اس دکان میں یہ چیز فروخت کے لیے دستیاب نہیں۔",
  "Insufficient stock for {v0}": "{v0} کا مال کافی نہیں۔ مقدار کم کریں۔",
  "Discount exceeds line subtotal": "رعایت اس چیز کی کل رقم سے زیادہ ہے۔",
  "Collectable credit sale not found": "قابل وصول ادھار فروخت نہیں ملی۔",
  "Amount exceeds balance due": "رقم باقی ادھار سے زیادہ ہے۔",
  "Returnable sale not found": "قابل واپسی فروخت نہیں ملی۔",
  "A sale with prior returns cannot be reversed; return remaining items":
    "پہلے واپسی ہو چکی ہے، پوری فروخت منسوخ نہیں ہو سکتی۔ باقی مال واپس لیں۔",
  "Duplicate item in return": "ایک چیز واپسی میں دو بار شامل ہے۔",
  "Sale item not found in this sale and shop": "یہ چیز اس فروخت اور دکان میں نہیں ملی۔",
  "Return exceeds remaining quantity": "واپسی باقی مقدار سے زیادہ ہے۔",
  "Future-dated cash movements and expenses are not supported":
    "پیسوں کا لین دین اور خرچہ آنے والی تاریخ پر نہیں لکھ سکتے۔",
  "This product changed since the form was opened. Close it, refresh inventory, and try again; no changes were saved":
    "فارم کھولنے کے بعد اس چیز کی تفصیل بدل گئی ہے۔ فارم بند کریں، فہرست تازہ کریں اور دوبارہ کوشش کریں۔ کوئی تبدیلی محفوظ نہیں ہوئی۔",
  "Enter a non-negative number with at most {v0} decimal places.":
    "صفر یا اس سے زیادہ عدد لکھیں، زیادہ سے زیادہ {v0} اعشاری ہندسوں کے ساتھ۔",
  "Enter a valid number with at most {v0} decimal places.":
    "درست عدد لکھیں، زیادہ سے زیادہ {v0} اعشاری ہندسوں کے ساتھ۔",
  " matching filters": "فلٹر کے مطابق",
  " in your catalog": "آپ کی فہرست میں",
} as const;
export type MessageKey = keyof typeof ur;
export function translate(
  locale: Locale,
  key: MessageKey,
  values: Record<string, string | number> = {},
): string {
  const template = locale === "ur" ? ur[key] : key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (!(name in values)) return match;
    const value = String(values[name]);
    // Isolate references, names, and Latin numerals inside RTL sentences.
    return locale === "ur" ? `\u2068${value}\u2069` : value;
  });
}
/** Keep status/error state in source language so an open notice follows later locale switches. */
export function message(key: MessageKey, values?: Record<string, string | number>): string {
  return translate("en", key, values);
}
const patterns = (Object.keys(ur) as MessageKey[])
  .filter((key) => key.includes("{v") && /[a-zA-Z]/.test(key.replace(/\{v\d+\}/g, "")))
  .sort((a, b) => b.replace(/\{v\d+\}/g, "").length - a.replace(/\{v\d+\}/g, "").length)
  .map((key) => {
    const names: string[] = [];
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = escaped.replace(/\\\{(v\d+)\\\}/g, (_match, name: string) => {
      names.push(name);
      return "(.+?)";
    });
    return { key, names, regex: new RegExp(`^${pattern}$`) };
  });
/** Explicit message boundary for known API/validation responses and display enums only.
 * Unknown provider/database messages are preserved, not silently hidden or mistranslated.
 */
export function translateMessage(locale: Locale, message: string): string {
  if (locale === "en") return message;
  if (Object.hasOwn(ur, message)) return translate(locale, message as MessageKey);
  // CSV keeps its documented English column identifiers, while row guidance is localized.
  const csvIssue = message.match(/^Row (\d+), ([\w.]+): (.+)$/);
  if (csvIssue)
    return translate(locale, "Row {v0}, {v1}: {v2}", {
      v0: csvIssue[1],
      v1: csvIssue[2],
      v2: translateMessage(locale, csvIssue[3]),
    });
  for (const { key, names, regex } of patterns) {
    const match = message.match(regex);
    if (match)
      return translate(
        locale,
        key,
        Object.fromEntries(names.map((name, index) => [name, match[index + 1]])),
      );
  }
  return message;
}
