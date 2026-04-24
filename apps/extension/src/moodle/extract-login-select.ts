import { normalizeWhitespace } from '@/lib/utils'

export type HiddenFormField = {
  name: string
  value: string
}

export type LoginSelectData = {
  shibbolethUrl: string | null
  wayfAction: string | null
  manualAction: string
  manualHiddenFields: HiddenFormField[]
  forgotPasswordUrl: string | null
}

export function extractLoginSelectData(doc: Document = document): LoginSelectData | null {
  const shibbolethLink = doc.querySelector<HTMLAnchorElement>(
    '.login-identityprovider-btn',
  )
  const wayfForm = doc.querySelector<HTMLFormElement>('form#IdPList')
  const manualForm = doc.querySelector<HTMLFormElement>('form.login-form#login')

  if (!manualForm?.action || (!shibbolethLink?.href && !wayfForm?.action)) {
    return null
  }

  const hiddenFields = Array.from(
    manualForm.querySelectorAll<HTMLInputElement>('input[type="hidden"][name]'),
  ).map((field) => ({
    name: normalizeWhitespace(field.name),
    value: field.value,
  }))

  return {
    shibbolethUrl: shibbolethLink?.href ?? null,
    wayfAction: wayfForm?.action ?? null,
    manualAction: manualForm.action,
    manualHiddenFields: hiddenFields,
    forgotPasswordUrl:
      doc.querySelector<HTMLAnchorElement>('.login-form-forgotpassword a')?.href ?? null,
  }
}
