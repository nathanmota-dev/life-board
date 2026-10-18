import {
  Activity,
  CalendarDays,
  FolderKanban,
  GitPullRequest,
  Inbox,
  Lightbulb,
  ListChecks,
  ListTodo,
  Smile,
  Tags,
  Target,
} from "lucide-react"
import { ActivityPage } from "@/routes/activity"
import { CalendarPage } from "@/routes/calendar"
import { FileBoardPage } from "@/routes/file-board"
import { GitHubPage } from "@/routes/github"
import { GoalsPage } from "@/routes/goals"
import { HabitsPage } from "@/routes/habits"
import { InboxPage } from "@/routes/inbox"
import { MoodPage } from "@/routes/mood"
import { TagsPage } from "@/routes/tags"
import { TasksPage } from "@/routes/tasks"
import { ThoughtsPage } from "@/routes/thoughts"

export const workspacePages = [
  { path: "inbox", title: "Inbox", icon: Inbox, component: InboxPage },
  { path: "activity", title: "Activity", icon: Activity, component: ActivityPage },
  { path: "tags", title: "Tags", icon: Tags, component: TagsPage },
  { path: "thoughts", title: "Thoughts", icon: Lightbulb, component: ThoughtsPage },
  { path: "tasks", title: "Tasks", icon: ListTodo, component: TasksPage },
  { path: "calendar", title: "Calendar", icon: CalendarDays, component: CalendarPage },
  { path: "goals", title: "Goals", icon: Target, component: GoalsPage },
  { path: "habits", title: "Habits", icon: ListChecks, component: HabitsPage },
  { path: "github", title: "GitHub", icon: GitPullRequest, component: GitHubPage },
  { path: "file-board", title: "File Board", icon: FolderKanban, component: FileBoardPage },
  { path: "mood", title: "Mood", icon: Smile, component: MoodPage },
] as const
