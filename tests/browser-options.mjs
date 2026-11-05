import { existsSync } from 'node:fs';
import path from 'node:path';
const local = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') : '';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (local && existsSync(local) ? local : undefined);
export const browserOptions = { headless: true, ...(executablePath ? { executablePath } : {}) };
