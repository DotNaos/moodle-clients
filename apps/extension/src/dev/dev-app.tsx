import { useState } from 'react'
import { CustomNavbar } from '@/components/navbar'
import {
  OverviewPageApp,
  LoginSelectApp,
  AaiLoginApp,
} from '@/components/page-apps'
import {
  CourseHeroApp,
  CourseTimelineApp,
  CourseMainContentApp,
} from '@/components/course-page'
import {
  mockNavbarData,
  mockCourses,
  mockCoursePageData,
  mockLoginSelectData,
  mockAaiLoginData,
} from './mock-data'

type PageKey = 'overview' | 'course' | 'login-select' | 'aai-login'

const PAGES: { key: PageKey; label: string }[] = [
  { key: 'overview', label: 'Kursübersicht' },
  { key: 'course', label: 'Kursseite' },
  { key: 'login-select', label: 'Login Auswahl' },
  { key: 'aai-login', label: 'AAI Login' },
]

function PageSwitcher({
  current,
  onChange,
}: {
  current: PageKey
  onChange: (key: PageKey) => void
}) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        gap: '0.25rem',
        padding: '0.25rem',
        borderRadius: '0.75rem',
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.24)',
      }}
    >
      {PAGES.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 600,
            fontFamily: 'var(--font-sans)',
            transition: 'all 150ms ease',
            background: current === key ? 'rgba(255,255,255,0.15)' : 'transparent',
            color: current === key ? '#fff' : 'rgba(255,255,255,0.55)',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function OverviewPage() {
  return (
    <>
      <CustomNavbar data={mockNavbarData} />
      <div style={{ paddingTop: '4rem' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 2rem' }}>
          <OverviewPageApp title="Meine Kurse" courses={mockCourses} />
        </div>
      </div>
    </>
  )
}

function CoursePage() {
  return (
    <>
      <CustomNavbar data={mockNavbarData} />
      <div style={{ paddingTop: '4rem' }}>
        <CourseHeroApp
          title={mockCoursePageData.title}
          heroImageUrl={mockCoursePageData.heroImageUrl}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '2.5rem',
            padding: '1.5rem 2rem',
            maxWidth: '1360px',
            margin: '0 auto',
          }}
        >
          <div
            style={{
              width: '240px',
              minWidth: '240px',
              flexShrink: 0,
              position: 'sticky',
              top: '4.5rem',
              maxHeight: 'calc(100dvh - 5.5rem)',
              overflowY: 'auto',
              paddingRight: '1rem',
            }}
          >
            <CourseTimelineApp
              title={mockCoursePageData.title}
              sections={mockCoursePageData.sections}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <CourseMainContentApp sections={mockCoursePageData.sections} />
          </div>
        </div>
      </div>
    </>
  )
}

function LoginSelectPage() {
  return (
    <LoginSelectApp
      shibbolethUrl={mockLoginSelectData.shibbolethUrl}
      wayfAction={mockLoginSelectData.wayfAction}
    />
  )
}

function AaiLoginPage() {
  return (
    <AaiLoginApp
      action={mockAaiLoginData.action}
      hiddenFields={mockAaiLoginData.hiddenFields}
      usernamePlaceholder={mockAaiLoginData.usernamePlaceholder}
      passwordPlaceholder={mockAaiLoginData.passwordPlaceholder}
      supportUrl={mockAaiLoginData.supportUrl}
      revokeConsentLabel={mockAaiLoginData.revokeConsentLabel}
      revokeConsentChecked={mockAaiLoginData.revokeConsentChecked}
    />
  )
}

export function DevApp() {
  const [currentPage, setCurrentPage] = useState<PageKey>('overview')

  return (
    <>
      {currentPage === 'overview' && <OverviewPage />}
      {currentPage === 'course' && <CoursePage />}
      {currentPage === 'login-select' && <LoginSelectPage />}
      {currentPage === 'aai-login' && <AaiLoginPage />}
      <PageSwitcher current={currentPage} onChange={setCurrentPage} />
    </>
  )
}
