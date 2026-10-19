import {
  Activity,
  CalendarDays,
  FolderKanban,
  GitPullRequest,
  Inbox,
  Lightbulb,
  ListChecks,
  ListTodo,
  Rocket,
  Smile,
  Tags,
  Target,
  Timer,
} from "lucide-react"
import { ActivityPage } from "@/routes/activity"
import { CalendarPage } from "@/routes/calendar"
import { FileBoardPage } from "@/routes/file-board"
import { GitHubPage } from "@/routes/github"
import { GoalsPage } from "@/routes/goals"
import { HabitsPage } from "@/routes/habits"
import { InboxPage } from "@/routes/inbox"
import { MoodPage } from "@/routes/mood"
import { PomodoroPage } from "@/routes/pomodoro"
import { ProjectsPage } from "@/routes/projects"
import { TagsPage } from "@/routes/tags"
import { TasksPage } from "@/routes/tasks"
import { ThoughtsPage } from "@/routes/thoughts"

export const workspacePages = [
  { path: "inbox", titleKey: "navigation.inbox", icon: Inbox, component: InboxPage },
  { path: "activity", titleKey: "navigation.activity", icon: Activity, component: ActivityPage },
  { path: "tags", titleKey: "navigation.tags", icon: Tags, component: TagsPage },
  { path: "thoughts", titleKey: "navigation.thoughts", icon: Lightbulb, component: ThoughtsPage },
  { path: "tasks", titleKey: "navigation.tasks", icon: ListTodo, component: TasksPage },
  { path: "calendar", titleKey: "navigation.calendar", icon: CalendarDays, component: CalendarPage },
  { path: "goals", titleKey: "navigation.goals", icon: Target, component: GoalsPage },
  { path: "projects", titleKey: "navigation.projects", icon: Rocket, component: ProjectsPage },
  { path: "habits", titleKey: "navigation.habits", icon: ListChecks, component: HabitsPage },
  { path: "pomodoro", titleKey: "navigation.pomodoro", icon: Timer, component: PomodoroPage },
  { path: "github", titleKey: "navigation.github", icon: GitPullRequest, component: GitHubPage },
  { path: "file-board", titleKey: "navigation.file-board", icon: FolderKanban, component: FileBoardPage },
  { path: "mood", titleKey: "navigation.mood", icon: Smile, component: MoodPage },
] as const
