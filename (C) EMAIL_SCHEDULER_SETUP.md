# Automated Email Scheduler Setup

**This system auto-sends follow-up emails to all your leads on a schedule — no manual work needed.**

## How It Works

1. **Reads all leads from Google Sheets** (all sheets with your standard columns)
2. **Tracks when each lead was called** (Date Called column)
3. **Auto-sends emails on schedule:**
   - Day 0: Initial email (when they're added)
   - Day 3: Follow-up 1
   - Day 7: Follow-up 2
   - Day 14: Follow-up 3
   - Day 21: Breakup email
4. **Logs all sends** back to Sheets
5. **Runs daily at 9am** automatically

## Setup Steps

### 1. Get Resend API Key
- Go to https://resend.com
- Sign up for free (free tier includes 100 emails/day)
- Get your API key from the dashboard
- Add to `.env.local`:
  ```
  RESEND_API_KEY=re_xxxxx
  ```

### 2. Add Google Service Account Credentials
- You already created the service account and downloaded the JSON key
- Convert the JSON to a single-line string (all on one line, no newlines)
- Add to `.env.local`:
  ```
  GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"ls-growth",...}'
  ```

### 3. Configure Your Master Spreadsheet
- Add the Spreadsheet ID to `.env.local`:
  ```
  GOOGLE_MASTER_SPREADSHEET_ID=YOUR_SPREADSHEET_ID
  ```
- The system will auto-discover all sheets in that spreadsheet
- Make sure all sheets have these columns (exact names or similar):
  - Business Name
  - Email
  - Phone Number
  - Website
  - Facebook Page
  - Date Called (when the lead was added/contacted)
  - Outcome
  - Call Back
  - Notes

### 4. Set Up Cron Job (Vercel)
- This system has an endpoint: `/api/email/schedule`
- Call it daily with a bearer token
- **For Vercel deployments**, use Vercel Cron:
  ```bash
  # Add to vercel.json:
  {
    "crons": [{
      "path": "/api/email/schedule",
      "schedule": "0 9 * * *"
    }]
  }
  ```
- Set `CRON_SECRET` env var to a random string:
  ```
  CRON_SECRET=your_random_secret_here
  ```

### 5. Test It Locally (Optional)
```bash
# Start the dev server
npm run dev

# Call the endpoint with curl
curl -X POST http://localhost:3005/api/email/schedule \
  -H "Authorization: Bearer your_random_secret_here"
```

## Column Mapping

The system is **smart about column names**. These variations are all recognized:
- Business Name: "business name", "company", "company name"
- Email: "email", "email address"
- Phone: "phone", "phone number", "number", "mobile"
- Website: "website", "web", "website url"
- Facebook: "facebook", "facebook page", "fb"
- Date Called: "date called", "date contacted", "contact date"
- Outcome: "outcome", "result", "status"
- Call Back: "call back", "callback", "follow up"
- Notes: "notes", "note", "comments"

## What Happens on Each Run

1. **Connects to your Google Sheets**
2. **Reads all leads from all sheets**
3. **For each lead:**
   - Checks when they were called (Date Called)
   - Figures out which email step they're due for
   - Generates the email from the template
   - Sends via Resend
   - Logs the send to a "Send Log" sheet
4. **Returns summary** of how many emails were sent

## Monitoring

Check the Vercel logs to see:
- How many sheets were processed
- How many leads were found
- How many emails were sent
- Any errors that occurred

---

## Environment Variables Summary

```
# Resend email sending
RESEND_API_KEY=re_xxxxx

# Google Sheets access (convert JSON to single line)
GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'

# Your master spreadsheet ID
GOOGLE_MASTER_SPREADSHEET_ID=spreadsheet_id_here

# Cron security
CRON_SECRET=random_secret_here
```

---

## Next Steps

1. ✅ Get Resend API key
2. ✅ Add env vars to `.env.local` and Vercel project settings
3. ✅ Deploy to Vercel
4. ✅ Set up Vercel Cron in `vercel.json`
5. ✅ Test with a curl request
6. ✅ Watch it work — emails auto-send daily

**That's it. Lucky just cold calls, the system handles the follow-ups.**
