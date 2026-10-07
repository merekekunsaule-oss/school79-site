# 79-р сургуулийн сайт + CMS

## Ажиллуулах
```
python3 server.py
```
- Сайт: http://localhost:8000/
- Админ: http://localhost:8000/admin.html  (анхны нэвтрэлт `admin` / `admin79` — заавал солино уу)

Порт солих: `PORT=8080 python3 server.py`. Нэмэлт сан суулгах шаардлагагүй (Python 3.8+).

## Өгөгдөл
- Бүх өгөгдөл `data/school79.db` (SQLite) файлд хадгалагдана. Нөөцлөх бол энэ файлыг хуулна.
- Анх ажиллахад `seed.json`-оос анхны контент үүснэ. Бүгдийг анхны байдалд оруулах бол серверийг зогсоогоод `data/school79.db`-г устгана.
- Хүснэгтүүд: `kv` (контент — түлхүүр/JSON), `users` (нууц үг PBKDF2 hash), `sessions`.

## Файлууд
- `server.py` — HTTP сервер, API (`/api/all`, `/api/login`, `/api/logout`, `/api/data/<key>`, `/api/append/<key>`)
- `cms-data.js` — сайт болон админ хоёрын хамтын өгөгдлийн давхарга
- `index.html` — нийтийн сайт, `admin.html` — CMS
