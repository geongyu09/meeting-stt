import RecorderSection from '@renderer/modules/widgets/recording/RecorderSection'
import TopBar from '@renderer/shared/components/primitives/layout/TopBar'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

export default function Record() {
  const { t } = useLocale()

  return (
    <>
      <TopBar title={t.recording.page.title} />
      <RecorderSection />
    </>
  )
}
