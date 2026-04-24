import { normalizeWhitespace } from '@/lib/utils'
import { type HiddenFormField } from './extract-login-select'

export type AaiLoginData = {
  action: string
  hiddenFields: HiddenFormField[]
  usernamePlaceholder: string
  passwordPlaceholder: string
  supportUrl: string | null
  revokeConsentLabel: string | null
  revokeConsentChecked: boolean
}

export function extractAaiLoginData(doc: Document = document): AaiLoginData | null {
  const form = doc.querySelector<HTMLFormElement>('.aai_login_field form')

  if (!form?.action) {
    return null
  }

  const revokeConsentInput = form.querySelector<HTMLInputElement>(
    'input[name="_shib_idp_revokeConsent"]',
  )
  const revokeConsentLabel = normalizeWhitespace(
    revokeConsentInput?.closest('label')?.textContent ??
      revokeConsentInput?.parentElement?.textContent ??
      '',
  )

  return {
    action: form.action,
    hiddenFields: Array.from(
      form.querySelectorAll<HTMLInputElement>('input[type="hidden"][name]'),
    ).map((field) => ({
      name: normalizeWhitespace(field.name),
      value: field.value,
    })),
    usernamePlaceholder:
      form.querySelector<HTMLInputElement>('input[name="j_username"]')?.placeholder ??
      'Username',
    passwordPlaceholder:
      form.querySelector<HTMLInputElement>('input[name="j_password"]')?.placeholder ??
      'Password',
    supportUrl: doc.querySelector<HTMLAnchorElement>('a[href*="support"]')?.href ?? null,
    revokeConsentLabel: revokeConsentLabel || null,
    revokeConsentChecked: revokeConsentInput?.checked ?? false,
  }
}
