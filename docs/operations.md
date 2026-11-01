# Operating the site

## Corridor TVs (`/display`)
1. On the TV's browser open `https://<domain>/display` and press F11 (full screen).
   For kiosk PCs: `chrome --kiosk https://<domain>/display`.
2. Optional: install as an app (PWA) from the browser menu.
3. The page keeps the screen awake where supported, shows Jerusalem time, a connection
   status, the daily schedule video uploaded by the council (admin → البرنامج اليومي), and rotating council notices (urgent
   announcements, announcements marked "اعرضه على شاشة الممرّ", and program notes).
   Rotation speed: admin → الإعدادات.
4. New site versions are applied automatically on TVs (other visitors get a prompt).
5. The video plays muted and loops; if the TV blocks autoplay, tap «تشغيل البرنامج» once.
   It disappears automatically at midnight (see `schedule-video.md`).

## Admin
* `/admin`, shared PIN. Sessions expire after `SESSION_TTL_MINUTES`.
* Everything is saved as a draft until published. Expired items disappear by themselves.
* Change the PIN by changing `ADMIN_PIN` and restarting/redeploying (all sessions stay
  valid until expiry; rotate `SESSION_SECRET` too to end them immediately).

## Certificates
Admin → الشهادات: fill name + activity, check the preview, "إصدار الشهادة", then
"طباعة / حفظ PDF" (choose *Save as PDF*, A4 landscape, background graphics on).
The verification code is shown only once — print or save it immediately.
Revoke from the list if needed.

## Branding / logo
The logo is a clearly-marked text placeholder (`src/components/layout/SchoolMark.tsx`,
`public/icons/*`). Upload the approved logo in admin → الإعدادات → الشعار; replace the
PWA icons in `public/icons/` with the approved artwork before launch.
Colours: `src/styles/tokens.css` (#5CBFE8 blue, #BECC32 lime, darker partners for text).
