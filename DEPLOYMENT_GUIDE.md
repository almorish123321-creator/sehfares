# SEHA Sick Leave App - Render Deployment Guide

## ✅ Configuration Checklist

### 1. **WebApp Button Configuration** ✓
The `/start` handler now sends a WebApp button pointing to:
- **URL**: `https://seha-sickleave-app.onrender.com`
- **Button Text**: "فتح التطبيق المصغر" (Open Mini App)
- Programmatically set via `WEB_APP_URL` environment variable

### 2. **Frontend Assets** ✓
All frontend files are served from the root directory:
- `index.html` - Main HTML structure
- `app.js` - Application logic with offline-first loading
- `style.css` - Styling and responsive design
- Located in express static directory: `app.use(express.static(path.join(__dirname, '/')))`

### 3. **Local Storage (subscriptions.json)** ✓
- **File**: `subscriptions.json` - Local user subscriptions cache
- **Purpose**: Prevents app freeze while loading from database
- **Loading**: App loads from local storage FIRST, then syncs async with server
- **Sync Triggers**: 
  - User `/start` command
  - Package purchase
  - Report save
  - API calls to `/api/user/:chatId`

---

## 🚀 Deployment to Render

### Prerequisites
- GitHub account with repository containing the app
- Render account (render.com)

### Step 1: Create Render Service
1. Go to [render.com](https://render.com)
2. Click "New" → "Web Service"
3. Connect GitHub repository
4. Configure:
   - **Name**: `seha-sickleave-app`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Port**: `3000`

### Step 2: Set Environment Variables
In Render dashboard → Environment:
```
TELEGRAM_BOT_TOKEN=<YOUR_TELEGRAM_BOT_TOKEN>
WEB_APP_URL=https://seha-sickleave-app.onrender.com
ADMIN_USERNAME=<YOUR_TELEGRAM_USERNAME>_bot
PORT=3000
MONGODB_URI= # (optional - leave empty for SQLite)
```

### Step 3: Deploy
- Push code to GitHub
- Render auto-deploys on push
- Monitor deploy logs in Render dashboard

### Step 4: Verify Deployment
```bash
# Check if app is running
curl https://seha-sickleave-app.onrender.com/

# Check if files are served
curl https://seha-sickleave-app.onrender.com/index.html
curl https://seha-sickleave-app.onrender.com/subscriptions.json
```

---

## 🔧 Local Development

### Run Locally
```bash
npm install
npm start
```

The app will:
1. Load from local `subscriptions.json` immediately
2. Initialize SQLite database locally
3. Start Telegram bot polling
4. Serve frontend assets on port 3000

### Test WebApp Locally
1. Send `/start` to bot
2. Click "فتح التطبيق المصغر" button
3. Telegram opens WebApp in embedded browser
4. App loads with local data first, then syncs

---

## 🔐 Data Flow

### User Opens App (First Time)
```
1. User sends /start
2. Bot checks subscription in database
3. Sends WebApp button → https://seha-sickleave-app.onrender.com
4. App opens:
   - Loads local subscriptions.json (immediate)
   - Syncs with /api/user/:chatId (background)
5. UI renders with local data immediately
```

### User Makes Purchase
```
1. User clicks package button
2. App calls POST /api/user/:chatId/package
3. Server updates database
4. Server syncs to subscriptions.json (syncUserToLocal)
5. App updates UI with new balance
6. Next time: Loads from local cache immediately
```

### Offline Mode
```
1. If API call fails:
   - App continues with local subscriptions.json data
   - No UI freeze or blank screen
   - User can still view saved reports
   - Can retry sync when connection returns
```

---

## 🛠️ Key Improvements Made

### ✓ Offline-First Architecture
- App loads local `subscriptions.json` immediately
- Prevents "loading..." screen delays
- Background sync with server (non-blocking)
- Graceful fallback if server unreachable

### ✓ WebApp Integration
- `/start` handler sends proper WebApp button
- Points to stable Render URL
- Button text in Arabic: "فتح التطبيق المصغر"

### ✓ Asset Serving
- Express static middleware serves all files
- All files deployed to Render automatically
- CSS, JS, HTML all accessible from Render URL

### ✓ Data Synchronization
- User data synced to `subscriptions.json` on every change
- Frontend fetches local cache first
- Server sync happens async in background

---

## 📋 File Structure

```
seha-sickleave-app/
├── server.js              # Express server + Telegram bot
├── database.js            # MongoDB/SQLite adapter
├── app.js                 # Frontend app logic (offline-first)
├── index.html             # Main HTML
├── style.css              # Styling
├── subscriptions.json     # Local user cache
├── package.json           # Dependencies
├── database.sqlite        # Local SQLite (if MONGODB_URI not set)
└── start.bat             # Windows batch script

Key Changes:
- app.js: loadLocalData() + syncDataWithServer() (offline-first)
- server.js: syncUserToLocal() + local subscriptions.json sync
- subscriptions.json: User cache for offline access
```

---

## 🐛 Troubleshooting

### App Loads Slowly
- Check `/api/user/:chatId` response time
- Ensure `subscriptions.json` is being synced
- Check Render logs for database connection issues

### WebApp Button Not Working
- Verify `WEB_APP_URL` environment variable in Render
- Check Telegram bot token is correct
- Ensure Render URL is `https://` (not http)

### Files Not Serving
- Verify `app.use(express.static(...))` in server.js
- Check files exist in deployment directory
- Test with `curl https://seha-sickleave-app.onrender.com/index.html`

### Offline Mode Not Working
- Ensure `subscriptions.json` exists and is writable
- Check `loadLocalData()` in app.js console logs
- Verify `syncUserToLocal()` runs in server.js

---

## 📞 Support

For issues with:
- **Telegram Bot**: Check bot token in environment variables
- **Render Deployment**: View logs in Render dashboard
- **Database**: Check MONGODB_URI or SQLite path
- **WebApp**: Ensure correct Render URL configuration

---

Generated: June 24, 2026
