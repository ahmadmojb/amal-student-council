# Bagrut calendar — data source and verification

Official reference: https://parents.education.gov.il/gov-education/school/matriculation/dates

## Status at build time (31 October 2026)

* The Ministry page still lists the Winter 2027 (חורף תשפ"ז) timetable as
  **"טיוטת לוח בחינות"** (draft):
  `https://meyda.education.gov.il/files/Exams/LuachWinExams2027Tyota.pdf`
  plus a draft hours sheet `LuachWinExams2027HOURS.xlsx`.
* The oral/Avatar windows in the seed **matched** the Ministry file
  `DatesAvatarExams2027.pdf` (updated 29/7/2026):
  English oral 24/11, 25/11, 1/12, 2/12, 14/12/2026; Hebrew oral for Arabic speakers
  1/12, 2/12, 14/12/2026. `lastVerifiedOn` = 2026-10-31 for those two records.
* The written-exam dates supplied by the council could **not** be confirmed: an automated
  text extraction of the draft PDF (whose header read "12/07/2026: טיוטה") was scrambled
  and appeared to group subjects into different weeks than the seed. Because that
  extraction was unreliable, the seed dates were kept as supplied, marked provisional and
  "not yet verified". **A council member must open the PDF and check each written date
  manually.**

## Seed (all `certainty: provisional`, no times)

| Record | Date(s) | Track |
|---|---|---|
| اللغة العبرية للطلاب العرب | 2027-01-04 | arab |
| الرياضيات | 2027-01-11, 2027-01-12 (two records) | unconfirmed |
| اللغة الإنجليزية | 2027-01-18, 2027-01-19 (two records) | unconfirmed |
| المواطنة | 2027-01-21 | general |
| التراث والدين الإسلامي | 2027-01-25 | islamic_heritage |
| اللغة والتعبير العربي | 2027-01-28 | arab |
| التاريخ | 2027-02-01 | general |
| الأدب العربي | 2027-02-04 | arab |
| English oral / Avatar (window) | 5 dates above | unconfirmed |
| Hebrew oral (window) | 3 dates above | arab |

Excluded by design: Tanakh/Bible, Christian heritage, Hebrew for Jewish students, other
communities' tracks. The Ministry timetable separates Arab and Druze tracks — never assign
students to the Druze track records.

## Verifying a record (admin → البجروت)
1. Open the official PDF and find the subject and questionnaire for the Arab track.
2. Correct the date(s) if needed; add the time only if the official hours sheet states it.
3. Set grades/classes if the school confirmed them; tick "الأهلية مؤكّدة".
4. Set **درجة التأكيد → نهائي**, update **تاريخ آخر تحقّق** and the source link.

Never enter questionnaire numbers, times or individual oral appointments that the
Ministry or school have not published.
