import { spawnSync } from 'node:child_process'

export const MOODLE_USERNAME_OP_REF = 'op://Personal/FHGR/username'
export const MOODLE_PASSWORD_OP_REF = ['op://Personal/FHGR', 'password'].join('/')

export function readOnePasswordReference(reference) {
  const result = spawnSync('op', ['read', reference], {
    encoding: 'utf8',
  })

  if (result.error) {
    return {
      ok: false,
      error: `Failed to execute op CLI for ${reference}: ${result.error.message}`,
      value: null,
    }
  }

  if (result.status !== 0) {
    return {
      ok: false,
      error: `op read failed for ${reference}: ${result.stderr.trim() || result.stdout.trim()}`,
      value: null,
    }
  }

  return {
    ok: true,
    error: null,
    value: result.stdout.trim(),
  }
}

export function readMoodleCredentials() {
  const usernameResult = readOnePasswordReference(MOODLE_USERNAME_OP_REF)
  if (!usernameResult.ok) {
    return {
      ok: false,
      error: usernameResult.error,
      username: null,
      password: null,
    }
  }

  const passwordResult = readOnePasswordReference(MOODLE_PASSWORD_OP_REF)
  if (!passwordResult.ok) {
    return {
      ok: false,
      error: passwordResult.error,
      username: null,
      password: null,
    }
  }

  return {
    ok: true,
    error: null,
    username: usernameResult.value,
    password: passwordResult.value,
  }
}
