import RecorderSection from '@renderer/modules/widgets/recording/RecorderSection'
import TopBar from '@renderer/shared/components/primitives/layout/TopBar'

export default function Record() {
  return (
    <>
      <TopBar title="새 회의 녹음" />
      <RecorderSection />
    </>
  )
}
