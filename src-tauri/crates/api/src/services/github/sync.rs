use super::*;
use crate::clock;
use crate::db::columns::to_millis;
use crate::db::schema::github::{GithubKind, GithubSettings, NewGithubPr, upsert_issue, upsert_pr};

impl GithubService {
    /// The fallible part of a sync: `(PRs stored, issues stored)`.
    pub(super) async fn run_sync(&self, settings: &GithubSettings) -> Result<(i64, i64), SyncError> {
        let token = self.open_token(settings)?;
        let org_filter = settings.org_filter.as_deref();
        let buckets = self.collect_pulls(&token, &settings.login, org_filter).await?;
        let count = self.store(&token, buckets).await?;
        let issues = self.sync_issues(&token, &settings.login, org_filter).await?;
        self.db
            .call(|conn| {
                let now = to_millis(clock::now());
                conn.execute(
                    "UPDATE github_settings SET last_sync_at = ?1, last_sync_error = NULL, updated_at = ?1 WHERE id = ?2",
                    rusqlite::params![now, SETTINGS_ID],
                )
            })
            .await?;
        Ok((count, issues))
    }

    /// Union of open PRs that involve the user, one per `owner/repo#number`.
    async fn collect_pulls(
        &self,
        token: &str,
        login: &str,
        org_filter: Option<&str>,
    ) -> Result<Vec<Bucket>, SyncError> {
        let mut buckets = Vec::new();

        for (kind, qualifier) in SEARCHES {
            let query = format!("is:pr {qualifier}:{login} is:open sort:updated-desc");
            match self.client.search_issues(token, &query).await {
                Ok(items) => {
                    for item in items {
                        let Some(repo) = repo_from_url(&item.repository_url) else { continue };
                        let triggered_by_login = item.user.as_ref().map(|user| user.login.clone());
                        let id = row_id(&repo, item.number);
                        add_to_buckets(&mut buckets, Bucket { id, kind, triggered_by_login, hit: item.into(), repo });
                    }
                }
                // One failing category (bad query, secondary rate limit) shouldn't stop the sync.
                Err(error) => self.logger.warn(&format!("[github] search failed ({kind}): {error}")),
            }
        }

        // Open PRs in the 50 repos the user pushed to most recently.
        for repo in self.client.list_owned_repos(token, login, 50).await? {
            match self.client.list_open_pulls(token, &repo).await {
                Ok(pulls) => {
                    for pull in pulls {
                        let bucket = Bucket {
                            id: row_id(&repo, pull.number),
                            kind: GithubKind::InMyRepos,
                            triggered_by_login: pull.user.as_ref().map(|user| user.login.clone()),
                            hit: pull.into(),
                            repo: repo.clone(),
                        };
                        add_to_buckets(&mut buckets, bucket);
                    }
                }
                Err(error) => self.logger.warn(&format!("[github] skipping {}/{}: {error}", repo.owner, repo.name)),
            }
        }

        buckets.retain(|bucket| in_org(&bucket.repo, org_filter));
        Ok(buckets)
    }

    /// Upserts the most recently updated PRs and drops cached ones that no longer match.
    async fn store(&self, token: &str, mut buckets: Vec<Bucket>) -> Result<i64, SyncError> {
        newest_first(&mut buckets, |bucket| &bucket.hit.updated_at);
        buckets.truncate(MAX_SYNCED_PRS);

        // An empty result almost always means a token or permission problem;
        // keep the last known cache instead of wiping it.
        if buckets.is_empty() {
            return Ok(0);
        }

        let mut rows = Vec::with_capacity(buckets.len());
        for bucket in buckets {
            rows.push(self.to_row(token, bucket).await?);
        }

        let count = to_i64(rows.len());
        self.db
            .call(move |conn| {
                let tx = conn.transaction()?;
                let ids: Vec<String> = rows.iter().map(|row| row.id.clone()).collect();
                delete_other_rows(&tx, "github_prs", &ids)?;
                for row in rows {
                    upsert_pr(&tx, row)?;
                }
                tx.commit()
            })
            .await?;
        Ok(count)
    }

    async fn to_row(&self, token: &str, bucket: Bucket) -> Result<NewGithubPr, SyncError> {
        let Bucket { id, kind, triggered_by_login, hit, repo } = bucket;
        let pull = match hit.pull {
            Some(pull) => Some(pull),
            // Search hits don't carry branches or diff stats; fetch the PR once.
            None => self.client.get_pull(token, &repo, hit.number).await.ok(),
        };
        let merged_at = pull.as_ref().map_or(hit.search_merged_at, |pull| pull.merged_at.clone());
        let (author_login, author_avatar_url) = author(hit.user);

        Ok(NewGithubPr {
            id,
            number: hit.number,
            title: hit.title,
            state: if merged_at.is_some() { "merged".to_owned() } else { hit.state },
            draft: Some(hit.draft),
            repo_owner: repo.owner,
            repo_name: repo.name,
            author_login,
            author_avatar_url,
            url: hit.html_url,
            base_branch: pull.as_ref().map(|pull| pull.base.name.clone()),
            head_branch: pull.as_ref().map(|pull| pull.head.name.clone()),
            kind,
            triggered_by_login,
            additions: Some(pull.as_ref().and_then(|pull| pull.additions).unwrap_or(0)),
            deletions: Some(pull.as_ref().and_then(|pull| pull.deletions).unwrap_or(0)),
            changed_files: Some(pull.as_ref().and_then(|pull| pull.changed_files).unwrap_or(0)),
            created_at: parse_date(&hit.created_at)?,
            updated_at: parse_date(&hit.updated_at)?,
            synced_at: None,
        })
    }

    /// Replaces the cached open issues that involve the user, unless every search failed.
    async fn sync_issues(&self, token: &str, login: &str, org_filter: Option<&str>) -> Result<i64, SyncError> {
        let mut buckets: Vec<IssueBucket> = Vec::new();
        let mut failures = 0;

        for (kind, qualifier) in ISSUE_SEARCHES {
            let query = format!("is:issue {qualifier}:{login} is:open sort:updated-desc");
            match self.client.search_issues(token, &query).await {
                Ok(items) => {
                    for item in items {
                        let Some(repo) = repo_from_url(&item.repository_url).filter(|repo| in_org(repo, org_filter))
                        else {
                            continue;
                        };
                        let incoming = IssueBucket { id: row_id(&repo, item.number), kind, item, repo };
                        match buckets.iter_mut().find(|bucket| bucket.id == incoming.id) {
                            None => buckets.push(incoming),
                            Some(existing) if issue_priority(kind) > issue_priority(existing.kind) => {
                                *existing = incoming;
                            }
                            Some(_) => {}
                        }
                    }
                }
                Err(error) => {
                    failures += 1;
                    self.logger.warn(&format!("[github] issue search failed ({kind}): {error}"));
                }
            }
        }
        // With no answer at all from GitHub, keep the last known cache.
        if failures == ISSUE_SEARCHES.len() {
            return Ok(0);
        }

        newest_first(&mut buckets, |bucket| &bucket.item.updated_at);
        buckets.truncate(MAX_SYNCED_ISSUES);
        let rows = buckets.into_iter().map(to_issue_row).collect::<Result<Vec<_>, _>>()?;

        let count = to_i64(rows.len());
        self.db
            .call(move |conn| {
                let tx = conn.transaction()?;
                let ids: Vec<String> = rows.iter().map(|row| row.id.clone()).collect();
                delete_other_rows(&tx, "github_issues", &ids)?;
                for row in rows {
                    upsert_issue(&tx, row)?;
                }
                tx.commit()
            })
            .await?;
        Ok(count)
    }
}
