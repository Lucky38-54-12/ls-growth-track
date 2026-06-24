const { google } = require('googleapis');
const fs = require('fs');

const KEY = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

async function listSheets() {
  const auth = new google.auth.JWT({
    email: KEY.client_email,
    key: KEY.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const drive = google.drive({ version: 'v3', auth });
  const response = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    spaces: 'drive',
    fields: 'files(id, name)',
    pageSize: 100,
  });

  const trades = response.data.files.map(f => f.name);
  console.log('TRADES FOUND:', trades.join('\n'));
}

listSheets().catch(console.error);
