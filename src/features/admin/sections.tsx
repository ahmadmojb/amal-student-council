/**
 * Admin screens built on CollectionManager: announcements, program notices,
 * Bagrut, benefits, services and activities.
 */
import { todayInSchool, formatDateOnly } from '../../../shared/dates';
import { EXAM_TYPE_LABEL, TRACK_LABEL } from '../../../shared/bagrut';
import { EXAM_TRACKS, EXAM_TYPES, GRADES, type Activity, type Announcement, type Benefit, type Exam, type Service } from '../../../shared/schemas';
import { AnnouncementItem, PRIORITY_LABEL } from '../home/Announcements';
import { BenefitCard, BenefitDetails } from '../benefits/BenefitCard';
import { CertaintyBadge, ExamRow } from '../bagrut/ExamRow';
import { CollectionManager } from './CollectionManager';
import type { FieldDef, FormValues } from './FormFields';

const now = () => Date.now();
const asRecord = <T,>(v: FormValues, id = 'preview'): T => ({ ...v, id, createdAt: now(), updatedAt: now() }) as T;

// ───────── Announcements ─────────
const announcementFields: FieldDef[] = [
  { kind: 'text', name: 'title', label: 'العنوان', required: true },
  { kind: 'textarea', name: 'body', label: 'نص الإعلان', required: true, rows: 6 },
  {
    kind: 'select',
    name: 'priority',
    label: 'الأولوية',
    options: [
      { value: 'normal', label: 'عادي' },
      { value: 'important', label: 'مهم' },
      { value: 'urgent', label: 'عاجل' },
    ],
  },
  { kind: 'date', name: 'publishDate', label: 'تاريخ النشر', hint: 'لا يظهر الإعلان قبل هذا التاريخ.' },
  { kind: 'date', name: 'expiresOn', label: 'تاريخ الانتهاء (اختياري)', hint: 'يختفي الإعلان تلقائيًا بعد هذا اليوم.' },
  { kind: 'checkbox', name: 'showOnDisplay', label: 'اعرضه أيضًا على شاشة الممرّ', hint: 'الإعلانات العاجلة تُعرض على الشاشة دائمًا.' },
  { kind: 'media', name: 'imageUrl', label: 'صورة (اختياري، صورة معتمدة فقط)' },
  { kind: 'text', name: 'imageAlt', label: 'وصف الصورة' },
];

export function AnnouncementsAdmin() {
  return (
    <CollectionManager<'announcements'>
      collection="announcements"
      title="إعلانات الصفحة الرئيسية"
      singular="إعلان"
      description="الإعلانات المنشورة تظهر في الصفحة الرئيسية حسب الأولوية. المنتهية تختفي تلقائيًا."
      fields={announcementFields}
      defaults={() => ({ title: '', body: '', priority: 'normal', imageUrl: '', imageAlt: '', publishDate: todayInSchool(), expiresOn: '', showOnDisplay: false, visibility: 'draft' })}
      searchText={(r) => `${r.title} ${r.body}`}
      columns={[
        { label: 'العنوان', render: (r) => <strong>{r.title}</strong> },
        { label: 'الأولوية', render: (r) => PRIORITY_LABEL[r.priority] },
        { label: 'النشر', render: (r) => <span className="xsmall">{formatDateOnly(r.publishDate, { weekday: false })}{r.expiresOn ? ` حتى ${formatDateOnly(r.expiresOn, { weekday: false })}` : ''}</span> },
      ]}
      preview={(v) => <AnnouncementItem a={asRecord<Announcement>(v)} />}
    />
  );
}

// ───────── Program notices ─────────
export function ScheduleNoticesAdmin({ nested = false }: { nested?: boolean }) {
  return (
    <CollectionManager<'scheduleNotices'>
      collection="scheduleNotices"
      nested={nested}
      title="ملاحظات المجلس حول برنامج اليوم"
      singular="ملاحظة"
      description="تظهر بجانب البرنامج الرسمي وعلى شاشة الممرّ. هي ملاحظات من المجلس، وليست تعديلًا على البرنامج الرسمي."
      fields={[
        { kind: 'text', name: 'title', label: 'العنوان', required: true },
        { kind: 'textarea', name: 'body', label: 'التفاصيل', rows: 3 },
        { kind: 'date', name: 'activeOn', label: 'تبدأ في (اختياري)' },
        { kind: 'date', name: 'expiresOn', label: 'تنتهي بعد (اختياري)' },
        { kind: 'number', name: 'order', label: 'الترتيب', min: 0, max: 999 },
      ]}
      defaults={() => ({ title: '', body: '', activeOn: todayInSchool(), expiresOn: todayInSchool(), order: 0, visibility: 'draft' })}
      searchText={(r) => `${r.title} ${r.body}`}
      columns={[
        { label: 'العنوان', render: (r) => <strong>{r.title}</strong> },
        { label: 'المدة', render: (r) => <span className="xsmall">{r.activeOn ? formatDateOnly(r.activeOn, { weekday: false }) : 'فورًا'} — {r.expiresOn ? formatDateOnly(r.expiresOn, { weekday: false }) : 'بلا انتهاء'}</span> },
      ]}
    />
  );
}

// ───────── Bagrut ─────────
const examFields: FieldDef[] = [
  { kind: 'section', label: 'الامتحان' },
  { kind: 'text', name: 'nameAr', label: 'الاسم المعروض بالعربية', required: true },
  { kind: 'text', name: 'subjectKey', label: 'معرّف الموضوع', required: true, hint: 'نفس المعرّف لكل مواعيد الموضوع نفسه (مثال: math). يُستخدم للتصفية.', ltr: true },
  { kind: 'text', name: 'officialName', label: 'اسم الموضوع بالعبرية (כפי שמופיע בלוח המשרד)', placeholder: 'מתמטיקה' },
  {
    kind: 'tags',
    name: 'questionnaireNumbers',
    label: 'מספר שאלון — أرقام الاستمارات',
    placeholder: 'مثال: 035481',
    hint: 'أدخل الرقم كما هو في لوح الوزارة (مع الأصفار في البداية). يمكن إضافة أكثر من رقم لمستويات/مسارات مختلفة. اتركه فارغًا إن لم يُتحقَّق منه.',
  },
  { kind: 'text', name: 'season', label: 'الموسم', required: true },
  { kind: 'select', name: 'examType', label: 'نوع الامتحان', options: EXAM_TYPES.map((t) => ({ value: t, label: EXAM_TYPE_LABEL[t] })) },
  {
    kind: 'select',
    name: 'dateMode',
    label: 'نوع التاريخ',
    options: [
      { value: 'single', label: 'يوم امتحان' },
      { value: 'window', label: 'نافذة امتحان (عدة أيام، المدرسة تحدّد موعد كل طالب)' },
    ],
  },
  { kind: 'dates', name: 'dates', label: 'التواريخ', hint: 'مواعيد منفصلة للموضوع نفسه تُضاف كسجلّات منفصلة إن كانت امتحانات مختلفة.' },
  { kind: 'time', name: 'verifiedTime', label: 'الوقت المؤكَّد (اختياري)', hint: 'أدخله فقط بعد التحقّق من المصدر الرسمي.' },
  { kind: 'section', label: 'لمن الامتحان' },
  { kind: 'multi', name: 'grades', label: 'الصفوف', numeric: true, options: GRADES.map((g) => ({ value: g, label: `الصف ${g}` })), hint: 'اتركها فارغة إذا لم تكن مؤكّدة.' },
  { kind: 'tags', name: 'classes', label: 'الشعب (اختياري)', placeholder: 'مثال: 11/2، 11/3' },
  { kind: 'multi', name: 'tracks', label: 'المسار', options: EXAM_TRACKS.map((t) => ({ value: t, label: TRACK_LABEL[t] })) },
  { kind: 'checkbox', name: 'eligibilityConfirmed', label: 'الأهلية مؤكّدة من المدرسة' },
  { kind: 'textarea', name: 'eligibilityNote', label: 'ملاحظة الأهلية', rows: 2 },
  { kind: 'section', label: 'التحقّق والمصدر' },
  {
    kind: 'select',
    name: 'certainty',
    label: 'درجة التأكيد',
    options: [
      { value: 'provisional', label: 'مؤقّت — غير نهائي' },
      { value: 'final', label: 'نهائي (تمت مطابقته مع لوح الوزارة)' },
    ],
  },
  { kind: 'url', name: 'sourceUrl', label: 'رابط المصدر' },
  { kind: 'text', name: 'sourceNote', label: 'وصف المصدر' },
  { kind: 'date', name: 'lastVerifiedOn', label: 'تاريخ آخر تحقّق' },
  { kind: 'textarea', name: 'adminNotes', label: 'ملاحظات داخلية (لا تُنشر)', rows: 2 },
];

export function BagrutAdmin() {
  const today = todayInSchool();
  return (
    <CollectionManager<'exams'>
      collection="exams"
      title="امتحانات البجروت"
      singular="امتحان"
      description="لا تُدخل أوقاتًا أو أرقام استمارات غير مؤكّدة. اعتمد الموعد نهائيًا فقط بعد مطابقته مع لوح وزارة التربية."
      fields={examFields}
      defaults={() => ({
        season: 'شتاء 2027',
        subjectKey: '',
        nameAr: '',
        officialName: '',
        questionnaireNumbers: [],
        dateMode: 'single',
        dates: [''],
        examType: 'written',
        grades: [],
        classes: [],
        tracks: [],
        eligibilityConfirmed: false,
        eligibilityNote: '',
        verifiedTime: '',
        sourceUrl: 'https://parents.education.gov.il/gov-education/school/matriculation/dates',
        sourceNote: '',
        lastVerifiedOn: '',
        certainty: 'provisional',
        adminNotes: '',
        visibility: 'draft',
      })}
      searchText={(r) => `${r.nameAr} ${r.subjectKey} ${r.officialName} ${(r.questionnaireNumbers ?? []).join(' ')}`}
      sort={(a, b) => (a.dates[0] ?? '').localeCompare(b.dates[0] ?? '')}
      columns={[
        {
          label: 'الامتحان',
          render: (r) => (
            <span>
              <strong>{r.nameAr}</strong>
              {r.officialName ? (
                <span className="xsmall muted" lang="he" dir="rtl" style={{ display: 'block' }}>
                  {r.officialName}
                </span>
              ) : null}
            </span>
          ),
        },
        {
          label: 'מספר שאלון',
          render: (r) => (r.questionnaireNumbers?.length ? <span className="num" dir="ltr">{r.questionnaireNumbers.join(', ')}</span> : <span className="xsmall muted">بانتظار التحقّق</span>),
        },
        { label: 'التاريخ', render: (r) => <span className="xsmall">{r.dates.map((d) => formatDateOnly(d, { weekday: false })).join('، ')}</span> },
        { label: 'النوع', render: (r) => EXAM_TYPE_LABEL[r.examType] },
        { label: 'التأكيد', render: (r) => <CertaintyBadge certainty={r.certainty} /> },
      ]}
      preview={(v) => {
        const exam = asRecord<Exam>(v);
        const date = exam.dates.find(Boolean) ?? today;
        return <ExamRow occ={{ key: 'p', exam, date, index: 1, total: exam.dates.length }} today={today} detailed />;
      }}
    />
  );
}

// ───────── Benefits ─────────
const benefitFields: FieldDef[] = [
  { kind: 'section', label: 'الجهة' },
  { kind: 'text', name: 'businessName', label: 'اسم المحلّ/الجهة', required: true },
  { kind: 'text', name: 'category', label: 'الفئة', required: true, placeholder: 'مثال: مطاعم، قرطاسية، رياضة' },
  { kind: 'media', name: 'logoUrl', label: 'الشعار (بموافقة الجهة)' },
  { kind: 'text', name: 'branch', label: 'الفرع' },
  { kind: 'text', name: 'location', label: 'العنوان' },
  { kind: 'url', name: 'directionsUrl', label: 'رابط الاتجاهات (خرائط)' },
  { kind: 'url', name: 'officialUrl', label: 'الموقع الرسمي' },
  { kind: 'section', label: 'العرض' },
  { kind: 'text', name: 'title', label: 'عنوان العرض', required: true },
  { kind: 'textarea', name: 'description', label: 'الوصف', required: true },
  {
    kind: 'select',
    name: 'discountKind',
    label: 'نوع الخصم',
    options: [
      { value: 'percent', label: 'نسبة مئوية' },
      { value: 'fixed', label: 'مبلغ ثابت (₪)' },
      { value: 'other', label: 'ميزة أخرى' },
    ],
  },
  { kind: 'number', name: 'discountValue', label: 'قيمة الخصم', nullable: true, min: 0 },
  { kind: 'number', name: 'originalPrice', label: 'السعر الأصلي (مؤكّد فقط)', nullable: true, min: 0, step: 0.5 },
  { kind: 'number', name: 'discountedPrice', label: 'السعر بعد الخصم (مؤكّد فقط)', nullable: true, min: 0, step: 0.5 },
  { kind: 'textarea', name: 'redemption', label: 'طريقة الاستفادة', rows: 2 },
  { kind: 'text', name: 'couponCode', label: 'رمز الخصم (اختياري)', ltr: true },
  { kind: 'media', name: 'qrImageUrl', label: 'صورة رمز QR (اختياري)' },
  { kind: 'textarea', name: 'terms', label: 'الشروط', rows: 3 },
  { kind: 'section', label: 'المدة والتحقّق' },
  { kind: 'date', name: 'startsOn', label: 'يبدأ في' },
  { kind: 'date', name: 'expiresOn', label: 'ينتهي في', hint: 'بعد هذا اليوم يختفي العرض تلقائيًا من الموقع.' },
  { kind: 'date', name: 'verifiedOn', label: 'تاريخ تحقّق المجلس' },
  { kind: 'checkbox', name: 'temporarilyUnavailable', label: 'غير متاح مؤقتًا' },
];

export function BenefitsAdmin() {
  return (
    <CollectionManager<'benefits'>
      collection="benefits"
      title="الخصومات والمزايا"
      singular="عرض"
      description="انشر فقط عروضًا متّفقًا عليها ومُتحقَّقًا منها. لا تُدخل أسعارًا أو رموزًا غير مؤكّدة."
      fields={benefitFields}
      defaults={() => ({
        businessName: '',
        category: '',
        logoUrl: '',
        title: '',
        description: '',
        discountKind: 'percent',
        discountValue: null,
        originalPrice: null,
        discountedPrice: null,
        branch: '',
        location: '',
        directionsUrl: '',
        officialUrl: '',
        terms: '',
        startsOn: todayInSchool(),
        expiresOn: '',
        redemption: '',
        couponCode: '',
        qrImageUrl: '',
        verifiedOn: todayInSchool(),
        temporarilyUnavailable: false,
        visibility: 'draft',
      })}
      searchText={(r) => `${r.businessName} ${r.title} ${r.category}`}
      columns={[
        { label: 'الجهة', render: (r) => <strong>{r.businessName}</strong> },
        { label: 'العرض', render: (r) => r.title },
        { label: 'ينتهي', render: (r) => (r.expiresOn ? <span className={r.expiresOn < todayInSchool() ? 'badge badge-danger' : 'xsmall'}>{r.expiresOn < todayInSchool() ? 'منتهٍ' : formatDateOnly(r.expiresOn, { weekday: false })}</span> : '—') },
      ]}
      preview={(v) => {
        const b = asRecord<Benefit>(v);
        return (
          <div className="stack">
            <BenefitCard b={b} state="active" />
            <BenefitDetails b={b} />
          </div>
        );
      }}
    />
  );
}

// ───────── Services ─────────
export function ServicesAdmin() {
  return (
    <CollectionManager<'services'>
      collection="services"
      title="دليل خدمات المدرسة"
      singular="خدمة"
      description="كل حقول الموقع والأوقات والتواصل اختيارية — أدخلها فقط بعد تأكيدها من إدارة المدرسة."
      fields={[
        { kind: 'text', name: 'name', label: 'اسم الخدمة', required: true },
        { kind: 'text', name: 'category', label: 'الفئة', required: true, placeholder: 'مثال: الإدارة، الإرشاد، المرافق' },
        { kind: 'textarea', name: 'description', label: 'الوصف', rows: 3 },
        { kind: 'section', label: 'الموقع' },
        { kind: 'text', name: 'building', label: 'المبنى' },
        { kind: 'text', name: 'floor', label: 'الطابق' },
        { kind: 'text', name: 'room', label: 'رقم الغرفة' },
        { kind: 'textarea', name: 'locationNote', label: 'كيف تصل', rows: 2 },
        { kind: 'url', name: 'mapUrl', label: 'رابط خريطة' },
        { kind: 'media', name: 'floorPlanUrl', label: 'مخطّط الطابق (صورة أو PDF)', accept: 'attachment' },
        { kind: 'section', label: 'الأوقات والتواصل' },
        { kind: 'text', name: 'hours', label: 'ساعات العمل' },
        { kind: 'text', name: 'availability', label: 'التوفّر' },
        { kind: 'text', name: 'contact', label: 'طريقة التواصل الرسمية' },
        { kind: 'textarea', name: 'accessibility', label: 'معلومات إمكانية الوصول', rows: 2 },
        { kind: 'number', name: 'order', label: 'الترتيب في القائمة', min: 0, max: 999 },
      ]}
      defaults={() => ({ name: '', description: '', category: '', building: '', floor: '', room: '', locationNote: '', availability: '', hours: '', contact: '', mapUrl: '', floorPlanUrl: '', accessibility: '', order: 0, visibility: 'draft' })}
      searchText={(r: Service) => `${r.name} ${r.category}`}
      sort={(a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ar')}
      columns={[
        { label: 'الترتيب', render: (r) => <span className="num">{r.order}</span> },
        { label: 'الخدمة', render: (r) => <strong>{r.name}</strong> },
        { label: 'الفئة', render: (r) => r.category },
        { label: 'الموقع', render: (r) => [r.building, r.floor, r.room].filter(Boolean).join(' / ') || '—' },
      ]}
    />
  );
}

// ───────── Activities ─────────
export function ActivitiesAdmin() {
  return (
    <CollectionManager<'activities'>
      collection="activities"
      title="أرشيف النشاطات"
      singular="نشاط"
      description="لا تنشر صورًا يظهر فيها طلاب يمكن التعرّف عليهم إلا بموافقة المدرسة. كل صورة تحتاج تأكيد الموافقة."
      fields={[
        { kind: 'text', name: 'title', label: 'العنوان', required: true },
        { kind: 'textarea', name: 'description', label: 'الوصف', required: true, rows: 6 },
        { kind: 'date', name: 'date', label: 'تاريخ النشاط' },
        { kind: 'text', name: 'category', label: 'الفئة', required: true, placeholder: 'مثال: رياضة، تطوّع، ثقافة' },
        { kind: 'text', name: 'gradeOrClass', label: 'الصف/الشعبة (اختياري)' },
        { kind: 'text', name: 'relatedEvent', label: 'الحدث أو البطولة المرتبطة' },
        { kind: 'textarea', name: 'achievements', label: 'النتائج والإنجازات', rows: 3 },
        { kind: 'photos', name: 'photos', label: 'الصور المعتمدة', hint: 'تُحوَّل الصور تلقائيًا إلى WebP وتُزال منها البيانات الوصفية (مثل الموقع الجغرافي).' },
        { kind: 'url', name: 'videoUrl', label: 'رابط فيديو (اختياري)' },
        { kind: 'media', name: 'attachmentUrl', label: 'مرفق (PDF أو صورة)', accept: 'attachment' },
        { kind: 'text', name: 'attachmentName', label: 'اسم المرفق' },
        { kind: 'checkbox', name: 'featured', label: 'نشاط مميّز (يظهر أولًا في الصفحة الرئيسية)' },
      ]}
      defaults={() => ({ title: '', description: '', date: todayInSchool(), category: '', photos: [], videoUrl: '', gradeOrClass: '', achievements: '', relatedEvent: '', attachmentUrl: '', attachmentName: '', featured: false, visibility: 'draft' })}
      searchText={(r: Activity) => `${r.title} ${r.category}`}
      sort={(a, b) => b.date.localeCompare(a.date)}
      columns={[
        { label: 'النشاط', render: (r) => <strong>{r.title}</strong> },
        { label: 'التاريخ', render: (r) => <span className="xsmall">{formatDateOnly(r.date, { weekday: false })}</span> },
        { label: 'الصور', render: (r) => <span className="num">{r.photos.length}</span> },
      ]}
    />
  );
}
