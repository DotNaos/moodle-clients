import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Custom Moodle UI',
  description: 'Custom UI layer for FHGR Moodle overview, login, and course pages.',
  version: '0.1.0',
  action: {
    default_title: 'Custom Moodle UI',
  },
  content_scripts: [
    {
      matches: [
        'https://moodle.fhgr.ch/my/*',
        'https://moodle.fhgr.ch/login/index.php*',
        'https://moodle.fhgr.ch/course/view.php*',
        'https://aai-login.fhgr.ch/idp/profile/SAML2/Redirect/SSO*',
      ],
      js: ['src/content/index.tsx'],
      run_at: 'document_idle',
    },
  ],
  web_accessible_resources: [
    {
      resources: ['fhgr-logo.png'],
      matches: ['https://*.fhgr.ch/*'],
    },
  ],
})
