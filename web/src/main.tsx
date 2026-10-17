import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"
import { MainLayout } from "@/layout/main-layout"
import { createAppRouter } from "@/router"
import "./index.css"

const router = createAppRouter(MainLayout)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
