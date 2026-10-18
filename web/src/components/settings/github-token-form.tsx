import { useState } from "react"
import { KeyRound } from "lucide-react"
import { FormField } from "@/components/shared/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useConnectGithub } from "@/hooks/queries/use-github"
import { errorMessage } from "@/lib/format"

export function GithubTokenForm() {
  const [token, setToken] = useState("")
  const [orgFilter, setOrgFilter] = useState("")
  const connect = useConnectGithub()

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        connect.mutate({ token: token.trim(), orgFilter: orgFilter.trim() || null }, { onSuccess: () => setToken("") })
      }}
    >
      <p className="text-sm text-muted-foreground">
        Paste a GitHub personal access token (classic) with the <code className="rounded bg-muted px-1">repo</code> and{" "}
        <code className="rounded bg-muted px-1">read:user</code> scopes. It is encrypted and stored only on this computer.
      </p>
      <FormField label="Personal access token" htmlFor="github-token">
        <Input
          id="github-token"
          type="password"
          autoComplete="off"
          placeholder="ghp_…"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
      </FormField>
      <FormField label="Only this owner or organization (optional)" htmlFor="github-org">
        <Input id="github-org" placeholder="my-company" value={orgFilter} onChange={(event) => setOrgFilter(event.target.value)} />
      </FormField>
      {connect.error ? <p className="text-sm text-destructive">{errorMessage(connect.error)}</p> : null}
      <div>
        <Button type="submit" disabled={token.trim().length < 20 || connect.isPending}>
          <KeyRound />
          {connect.isPending ? "Checking token…" : "Connect GitHub"}
        </Button>
      </div>
    </form>
  )
}
