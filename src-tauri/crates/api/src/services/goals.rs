mod types;
pub use types::*;
mod progress;
pub use progress::*;
mod store;
use store::*;

use crate::clock;

use rusqlite::types::Value;

use crate::db::Db;
use crate::db::columns::{Timestamp, new_id};
use crate::db::schema::goals::{
    Goal, GoalMilestone, GoalStatus, NewGoal, NewGoalMilestone, insert_goal, insert_milestone,
};
use crate::dto::goals::{CreateGoalBody, CreateMilestoneBody, GoalProgressQuery, UpdateGoalBody, UpdateMilestoneBody};
use crate::error::ApiResult;
use crate::services::query::{Assignments, enum_value, list_value, query_all, query_first, time_opt, time_value};

#[derive(Clone)]
pub struct GoalsService {
    db: Db,
}

impl GoalsService {
    pub fn new(db: Db) -> Self {
        Self { db }
    }

    /// Newest first, summarized (which records today's snapshot when progress moved).
    pub async fn list(&self, now: Timestamp) -> ApiResult<Vec<GoalSummary>> {
        Ok(self
            .db
            .call(move |conn| {
                let rows = query_all(
                    conn,
                    "SELECT * FROM goals WHERE deleted_at IS NULL ORDER BY created_at DESC",
                    &[],
                    Goal::from_row,
                )?;
                summarize(conn, rows, now)
            })
            .await?)
    }

    pub async fn create(&self, input: CreateGoalBody) -> ApiResult<CreatedGoal> {
        self.db
            .call(move |conn| {
                let goal_id = new_id();
                let milestones = input.milestones.unwrap_or_default();
                let milestones_created = milestones.len() as i64;
                let tx = conn.transaction()?;
                let goal = insert_goal(
                    &tx,
                    NewGoal {
                        id: goal_id.clone(),
                        title: input.title,
                        why: input.why.flatten(),
                        domain: input.domain,
                        start_at: input.start_at.flatten(),
                        target_at: input.target_at.flatten(),
                        color: input.color,
                        progress_mode: input.progress_mode,
                        linked_task_ids: input.linked_task_ids,
                        linked_thought_ids: input.linked_thought_ids,
                        linked_habit_ids: input.linked_habit_ids,
                        ..Default::default()
                    },
                )?;
                for (order, milestone) in (0_i64..).zip(milestones) {
                    insert_milestone(
                        &tx,
                        NewGoalMilestone {
                            id: new_id(),
                            goal_id: goal_id.clone(),
                            title: milestone.title,
                            due_at: milestone.due_at.flatten(),
                            order: Some(order),
                            ..Default::default()
                        },
                    )?;
                }
                tx.commit()?;
                let summary = summarize_one(conn, goal, clock::now())?;
                Ok(summary.map(|goal| CreatedGoal { goal, milestones_created }).ok_or_else(not_found))
            })
            .await?
    }

    pub async fn get(&self, id: &str, now: Timestamp) -> ApiResult<GoalDetail> {
        let id = id.to_owned();
        self.db
            .call(move |conn| {
                let Some(goal) = find_goal(conn, &id)? else { return Ok(Err(not_found())) };
                let Some(goal) = summarize_one(conn, goal, now)? else { return Ok(Err(not_found())) };
                let milestones = milestones_of(conn, &id)?;
                Ok(Ok(GoalDetail { goal, milestones }))
            })
            .await?
    }

    /// Completing stamps `completedAt`; any other status clears it.
    pub async fn update(&self, id: &str, input: UpdateGoalBody) -> ApiResult<GoalSummary> {
        let mut completed_at = input.completed_at;
        match input.status {
            Some(GoalStatus::Completed) if completed_at.is_none() => completed_at = Some(Some(clock::now())),
            Some(status) if status != GoalStatus::Completed => completed_at = Some(None),
            _ => {}
        }
        let mut set = Assignments::new();
        set.maybe("title", input.title)
            .maybe("why", input.why)
            .maybe("domain", input.domain.map(enum_value))
            .maybe("start_at", input.start_at.map(time_opt))
            .maybe("target_at", input.target_at.map(time_opt))
            .maybe("color", input.color)
            .maybe("linked_task_ids", input.linked_task_ids.as_deref().map(list_value))
            .maybe("linked_thought_ids", input.linked_thought_ids.as_deref().map(list_value))
            .maybe("linked_habit_ids", input.linked_habit_ids.as_deref().map(list_value))
            .maybe("progress_mode", input.progress_mode.map(enum_value))
            .maybe("status", input.status.map(enum_value))
            .maybe("completed_at", completed_at.map(time_opt))
            .maybe("progress", input.progress)
            .set("updated_at", time_value(clock::now()));
        let set = set.into_fragment();
        let mut params = set.params;
        params.push(Value::Text(id.to_owned()));
        self.db
            .call(move |conn| {
                let row = query_first(
                    conn,
                    &format!("UPDATE goals SET {} WHERE id = ? AND deleted_at IS NULL RETURNING *", set.sql),
                    &params,
                    Goal::from_row,
                )?;
                let Some(row) = row else { return Ok(Err(not_found())) };
                Ok(summarize_one(conn, row, clock::now())?.ok_or_else(not_found))
            })
            .await?
    }

    /// Soft deletes the goal and drops its snapshots.
    pub async fn remove(&self, id: &str) -> ApiResult<()> {
        let id = id.to_owned();
        self.db
            .call(move |conn| {
                let row = query_first(
                    conn,
                    "UPDATE goals SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL RETURNING id",
                    &[time_value(clock::now()), Value::Text(id.clone())],
                    |row| row.get::<_, String>(0),
                )?;
                if row.is_none() {
                    return Ok(Err(not_found()));
                }
                // Goals are soft-deleted, so the cascade never fires; drop the history here.
                conn.execute("DELETE FROM goal_progress_snapshots WHERE goal_id = ?", [id])?;
                Ok(Ok(()))
            })
            .await?
    }

    pub async fn progress_history(&self, id: &str, query: GoalProgressQuery) -> ApiResult<ProgressHistory> {
        let id = id.to_owned();
        self.db
            .call(move |conn| {
                if find_goal(conn, &id)?.is_none() {
                    return Ok(Err(not_found()));
                }
                // Day keys are zero-padded, so string comparison is chronological.
                let mut sql = "SELECT day, progress FROM goal_progress_snapshots WHERE goal_id = ?".to_owned();
                let mut params = vec![Value::Text(id.clone())];
                if let Some(from) = query.from.as_ref().filter(|from| !from.is_empty()) {
                    sql.push_str(" AND day >= ?");
                    params.push(Value::Text(from.clone()));
                }
                if let Some(to) = query.to.as_ref().filter(|to| !to.is_empty()) {
                    sql.push_str(" AND day <= ?");
                    params.push(Value::Text(to.clone()));
                }
                sql.push_str(" ORDER BY day ASC");
                let items = query_all(conn, &sql, &params, |row| {
                    Ok(ProgressPoint { day: row.get(0)?, progress: row.get(1)? })
                })?;
                // The value carried into the range, for charts that start before the first snapshot in it.
                let starting_progress = match query.from.filter(|from| !from.is_empty()) {
                    Some(from) => query_first(
                        conn,
                        "SELECT progress FROM goal_progress_snapshots WHERE goal_id = ? AND day < ? ORDER BY day DESC LIMIT 1",
                        &[Value::Text(id), Value::Text(from)],
                        |row| row.get::<_, i64>(0),
                    )?,
                    None => None,
                };
                Ok(Ok(ProgressHistory { items, starting_progress }))
            })
            .await?
    }

    /// Appends the milestone at the end of the goal's list.
    pub async fn add_milestone(&self, goal_id: &str, input: CreateMilestoneBody) -> ApiResult<GoalMilestone> {
        let goal_id = goal_id.to_owned();
        self.db
            .call(move |conn| {
                let Some(goal) = find_goal(conn, &goal_id)? else { return Ok(Err(not_found())) };
                let total = query_first(
                    conn,
                    "SELECT count(*) FROM goal_milestones WHERE goal_id = ? AND deleted_at IS NULL",
                    &[Value::Text(goal_id.clone())],
                    |row| row.get::<_, i64>(0),
                )?
                .unwrap_or(0);
                let row = insert_milestone(
                    conn,
                    NewGoalMilestone {
                        id: new_id(),
                        goal_id,
                        title: input.title,
                        due_at: input.due_at.flatten(),
                        order: Some(total),
                        ..Default::default()
                    },
                )?;
                summarize(conn, vec![goal], clock::now())?;
                Ok(Ok(row))
            })
            .await?
    }

    pub async fn update_milestone(
        &self,
        goal_id: &str,
        milestone_id: &str,
        input: UpdateMilestoneBody,
    ) -> ApiResult<GoalMilestone> {
        let mut set = Assignments::new();
        set.maybe("title", input.title)
            .maybe("due_at", input.due_at.map(time_opt))
            .maybe("completed_at", input.completed_at.map(time_opt))
            .set("updated_at", time_value(clock::now()));
        let set = set.into_fragment();
        let mut params = set.params;
        params.push(Value::Text(milestone_id.to_owned()));
        params.push(Value::Text(goal_id.to_owned()));
        let goal_id = goal_id.to_owned();
        self.db
            .call(move |conn| {
                let row = query_first(
                    conn,
                    &format!("UPDATE goal_milestones SET {} WHERE {MILESTONE_WHERE} RETURNING *", set.sql),
                    &params,
                    GoalMilestone::from_row,
                )?;
                let Some(row) = row else { return Ok(Err(milestone_not_found())) };
                let Some(goal) = find_goal(conn, &goal_id)? else { return Ok(Err(not_found())) };
                summarize(conn, vec![goal], clock::now())?;
                Ok(Ok(row))
            })
            .await?
    }

    pub async fn remove_milestone(&self, goal_id: &str, milestone_id: &str) -> ApiResult<()> {
        let params =
            vec![time_value(clock::now()), Value::Text(milestone_id.to_owned()), Value::Text(goal_id.to_owned())];
        let goal_id = goal_id.to_owned();
        self.db
            .call(move |conn| {
                let row = query_first(
                    conn,
                    &format!("UPDATE goal_milestones SET deleted_at = ? WHERE {MILESTONE_WHERE} RETURNING id"),
                    &params,
                    |row| row.get::<_, String>(0),
                )?;
                if row.is_none() {
                    return Ok(Err(milestone_not_found()));
                }
                let Some(goal) = find_goal(conn, &goal_id)? else { return Ok(Err(not_found())) };
                summarize(conn, vec![goal], clock::now())?;
                Ok(Ok(()))
            })
            .await?
    }
}
