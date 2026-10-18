import { InboxTaskRow } from "@/components/inbox/inbox-task-row"
import type { InboxTaskListProps } from "@/types/inbox"

export function InboxTaskList({ tasks }: InboxTaskListProps) {
  return (
    <ul className="divide-y rounded-xl border">
      {tasks.map((task) => (
        <InboxTaskRow key={task.id} task={task} />
      ))}
    </ul>
  )
}
