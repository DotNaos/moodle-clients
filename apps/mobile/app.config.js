const { execFileSync } = require('node:child_process');

const staticConfig = require('./app.json');

function readGitCommitHash() {
  if (process.env.EXPO_PUBLIC_MOODLE_CLIENT_COMMIT_HASH) {
    return process.env.EXPO_PUBLIC_MOODLE_CLIENT_COMMIT_HASH;
  }

  if (process.env.EAS_BUILD_GIT_COMMIT_HASH) {
    return process.env.EAS_BUILD_GIT_COMMIT_HASH;
  }

  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function readBuildDate() {
  return (
    process.env.EXPO_PUBLIC_MOODLE_CLIENT_BUILD_DATE ||
    process.env.MOODLE_CLIENT_BUILD_DATE ||
    new Date().toISOString()
  );
}

module.exports = () => {
  const expo = staticConfig.expo;

  return {
    expo: {
      ...expo,
      extra: {
        ...expo.extra,
        buildDate: readBuildDate(),
        commitHash: readGitCommitHash(),
      },
    },
  };
};
