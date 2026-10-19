# Felani4F — دامنه

## وضعیت نهایی (انجام شد)

```
https://felani4f.github.io/
```

- مخزن: `felani4f/felani4f.github.io` (سازمان: `felani4f`)
- آدرس قدیمی `https://drserver2350.github.io/felani4f/` → **۴۰۴**؛ دیگر استفاده نکن.
- همه‌ی آدرس‌های سئو به دامنه‌ی جدید تغییر کرده‌اند: `canonical`، `og:url`، `og:image`، `twitter:image`، JSON-LD، `sitemap.xml`، `robots.txt`، `credits.html`، README، SEO و `CFG.repo` در `assets/js/api.js`.
- GitHub Pages روی `main /` فعال است و آخرین build سالم است.
- سایت‌مپ برای هاست جدید به IndexNow (بینگ/یاندکس) ارسال شد.

## چرا Organization؟

آدرس ریشه‌ی `*.github.io` فقط وقتی در دسترس است که نام حساب/سازمان با نام دامنه یکی باشد. با سازمان `felani4f` و مخزن `felani4f.github.io`، سایت روی ریشه سرو می‌شود و نام کاربری شخصی (Drserver2350) هم دست‌نخورده می‌ماند.

## نکات مهم برای آینده

1. **توکن پنل مدیریت**: `localStorage` به دامنه گره خورده است، پس بعد از تغییر دامنه توکن قبلی در سایت جدید وجود ندارد. یک‌بار در سایت جدید → پنل مدیریت → تب «انتشار فایل» توکن تازه را ذخیره کن (با Resource owner = `felani4f` و `Contents: Read and write`).
2. **GitHub Actions**: توکن فعلی scope `workflow` ندارد؛ اگر روزی خواستی workflow اضافه کنی، توکن را با دسترسی `Workflows` بساز.
3. **Search Console**: در [Search Console](https://search.google.com/search-console) یک property جدید با `https://felani4f.github.io/` بساز و سایت‌مپ را همان‌جا ثبت کن. برای property قبلی، آدرس جدید را به‌عنوان «Address change» معرفی کن تا انتقال سریع‌تر دیده شود.
4. لینک‌های قدیمی در شبکه‌های اجتماعی/پروفایل‌ها را به آدرس جدید تغییر بده.

## ابزارها

- `tools/set-domain.py` — بازنویسی یکجای همه‌ی آدرس‌ها (با `--dry` برای پیش‌نمایش).
- `tools/migrate-to-org.py` — انتقال مخزن به سازمان (تاریخچه‌ی این مهاجرت).
- `tools/finish-domain.py` — چک‌لیست خودکار: پیدا کردن مخزن، بررسی Pages، بازنویسی آدرس‌ها، پوش، صبر برای build و تست لینک‌ها.
