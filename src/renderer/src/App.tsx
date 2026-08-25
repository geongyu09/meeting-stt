import { RouterProvider } from 'react-router'
import { router } from '@renderer/shared/routes'

export default function App() {
  return <RouterProvider router={router} />
}
