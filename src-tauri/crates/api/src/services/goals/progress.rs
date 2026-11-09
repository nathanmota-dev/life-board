use super::*;
use crate::db::columns::{Timestamp, to_millis};
use crate::db::schema::goals::{Goal, GoalStatus};
use crate::services::date::{from_day_key, to_day_key};

/// `Math.round`: halves go up.
fn js_round(value: f64) -> i64 {
    let floor = value.floor();
    (if value - floor >= 0.5 { floor + 1.0 } else { floor }) as i64
}

fn ratio(part: &ProgressPart) -> f64 {
    if part.total == 0 { 0.0 } else { part.done as f64 / part.total as f64 }
}

/// Mean of the parts the goal has, rounded; a goal without parts sits at 0%.
pub fn auto_progress(breakdown: &GoalBreakdown) -> i64 {
    let parts: Vec<&ProgressPart> =
        [&breakdown.milestones, &breakdown.tasks, &breakdown.habits].into_iter().flatten().collect();
    if parts.is_empty() {
        return 0;
    }
    let sum = parts.iter().fold(0.0, |sum, part| sum + ratio(part));
    js_round((sum / parts.len() as f64) * 100.0)
}

/// The day habit tracking counts from: the goal's start (or creation), never before the habit existed.
fn habit_start_day(goal: &Goal, habit: &HabitRow) -> String {
    let goal_start = to_day_key(goal.start_at.unwrap_or(goal.created_at));
    let created = to_day_key(habit.created_at);
    if goal_start > created { goal_start } else { created }
}

fn day_millis(day: &str) -> f64 {
    from_day_key(day).map_or(0.0, |date| to_millis(date) as f64)
}

/// Days the daily goal was met over the days since the start; today only counts once it's met.
pub fn habits_part(goal: &Goal, linked: &[HabitRow], logs: &[LogRow], today: Timestamp) -> ProgressPart {
    let today_key = to_day_key(today);
    linked.iter().fold(ProgressPart { done: 0, total: 0 }, |part, habit| {
        let from = habit_start_day(goal, habit);
        if from > today_key {
            return part;
        }
        let past_days = js_round((day_millis(&today_key) - day_millis(&from)) / DAY_MS as f64);
        let met: Vec<&LogRow> = logs
            .iter()
            .filter(|log| {
                let target = if log.day == today_key { habit.target } else { log.target.unwrap_or(habit.target) };
                log.habit_id == habit.id && log.day >= from && log.day <= today_key && log.count >= target
            })
            .collect();
        let met_today = met.iter().any(|log| log.day == today_key);
        ProgressPart { done: part.done + met.len() as i64, total: part.total + past_days + i64::from(met_today) }
    })
}

pub fn goal_breakdown(goal: &Goal, parts: &GoalParts, today: Timestamp) -> GoalBreakdown {
    let milestones: Vec<&MilestoneRow> = parts.milestones.iter().filter(|item| item.goal_id == goal.id).collect();
    let tasks: Vec<&TaskRow> = parts.tasks.iter().filter(|task| goal.linked_task_ids.contains(&task.id)).collect();
    let habits: Vec<HabitRow> =
        parts.habits.iter().filter(|habit| goal.linked_habit_ids.contains(&habit.id)).cloned().collect();
    GoalBreakdown {
        milestones: (!milestones.is_empty()).then(|| ProgressPart {
            done: milestones.iter().filter(|item| item.completed_at.is_some()).count() as i64,
            total: milestones.len() as i64,
        }),
        tasks: (!tasks.is_empty()).then(|| ProgressPart {
            done: tasks.iter().filter(|task| task.status == "done").count() as i64,
            total: tasks.len() as i64,
        }),
        habits: (!habits.is_empty()).then(|| habits_part(goal, &habits, &parts.logs, today)),
    }
}

/// Expected progress is the elapsed share of the time between start (or creation) and target.
pub fn goal_risk(goal: &Goal, progress: i64, now: Timestamp) -> RiskInfo {
    let Some(target_at) = goal.target_at else { return RiskInfo { expected_progress: None, risk: None } };
    let start = to_millis(goal.start_at.unwrap_or(goal.created_at));
    let (now_ms, target_ms) = (to_millis(now), to_millis(target_at));
    let span = target_ms - start;
    let elapsed = if span > 0 { (now_ms - start) as f64 / span as f64 } else { 1.0 };
    let expected = js_round(elapsed.clamp(0.0, 1.0) * 100.0);
    let risk = if goal.status == GoalStatus::Active && progress < 100 {
        if now_ms > target_ms {
            Some(GoalRisk::Overdue)
        } else if progress < expected - RISK_MARGIN {
            Some(GoalRisk::AtRisk)
        } else {
            None
        }
    } else {
        None
    };
    RiskInfo { expected_progress: Some(expected), risk }
}
