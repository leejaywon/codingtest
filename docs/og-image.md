# Open Graph images

When someone pastes your site URL in Discord, KakaoTalk, Slack, Facebook, or X, that app fetches a preview card (title, description, image). This note is the checklist for making that **image** show up on a new site.

You add a few `<meta>` tags and one public image. You do not need a special SDK.

## What to put in the HTML

Chat apps download the HTML file. They do not open a browser and wait for React. If `og:image` is only added after the app starts, they never see it.

Put the tags in `index.html`, or in Next.js `metadata`:

```html
<meta property="og:title" content="Site">
<meta property="og:description" content="One sentence.">
<meta property="og:url" content="https://example.com/">
<meta property="og:image" content="https://example.com/og.jpg">
<meta name="twitter:card" content="summary_large_image">
```

`og:url` and `og:image` must be absolute `https://` links. Use the same origin people will paste. That page and the image must return **200** — not a redirect to `www` or `/login`.

The image file must be public. `Content-Type` must be `image/jpeg` or `image/png`. **JPG and PNG both work.**

## Image size

Make **one** file at **1200×630** (ratio 1.91:1, almost 2:1). That is the large-card size for Discord, Facebook, and X. KakaoTalk’s link preview is 2:1 and smart-crops to 800×400, so this file is scaled, not cut into a different shape.

| Platform | Size / crop |
|---|---|
| **Facebook** ([docs](https://developers.facebook.com/docs/sharing/webmasters/images/)) | Below **200×200**: rejected. **600×315+**: large card. Smaller than that: small thumbnail. **1200×630**: large card, no crop. |
| **X** (`summary_large_image`) | Large card at ~1.91:1. **1200×630** fits. Other ratios: cropped. |
| **Discord** | Uses `og:image`. **1200×630** is the usual size. Other ratios: scaled or cropped. |
| **KakaoTalk** ([DevTalk](https://devtalk.kakao.com/t/og-image-og/139618)) | Preview is fixed **2:1**, smart-crop to **800×400**. Not 2:1: cropped. Faces can move the crop. 200×200 is the Kakao *message template* minimum, not “anything larger shows uncropped.” |

## After you deploy

| You do | Preview works on |
|---|---|
| Tags + image 200 on the URL you paste | Discord, Slack, iMessage, Telegram, LinkedIn, Facebook, X |
| Then [Kakao debugger](https://developers.kakao.com/tool/debugger/sharing) → Debug → reset cache → **new chat** with `https://…` | KakaoTalk |

Old messages keep the old card until that app recaches.
