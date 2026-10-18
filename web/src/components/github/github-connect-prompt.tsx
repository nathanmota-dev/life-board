import { useTranslation } from "react-i18next"
import { Link } from "@tanstack/react-router"
import { GitPullRequest } from "lucide-react"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { PageSection } from "@/components/workspace-ui"

export function GithubConnectPrompt() {
  const { t } = useTranslation()
  return (
    <PageSection>
      <EmptyState
        icon={GitPullRequest}
        title={t("github.connectAccount")}
        description={t("github.connectDescription")}
        action={
          <Button size="sm" asChild>
            <Link to="/settings">{t("common.openSettings")}</Link>
          </Button>
        }
      />
    </PageSection>
  )
}
