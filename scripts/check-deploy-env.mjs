const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'];
const missing = required.filter((key) => !process.env[key]?.trim() || process.env[key].includes('YOUR_'));
if (missing.length) {
  console.error(`Missing GitHub repository variables: ${missing.join(', ')}. Configure these under Settings → Secrets and variables → Actions → Variables.`);
  process.exitCode = 1;
} else if (process.env.VITE_USE_EMULATORS === 'true') {
  console.error('Emulator mode must never be deployed to GitHub Pages.');
  process.exitCode = 1;
} else {
  console.log('Required public Firebase web configuration is present.');
}
