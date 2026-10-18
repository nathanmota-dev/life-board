// Root keys per module. Mutations invalidate whole roots so every list and
// summary built on that data (dashboard, activity, tags) refreshes together.
export const queryKeys = {
  tasks: ["tasks"],
  thoughts: ["thoughts"],
  links: ["links"],
  goals: ["goals"],
  calendar: ["calendar"],
  mood: ["mood"],
  habits: ["habits"],
  stats: ["stats"],
  github: ["github"],
  fileBoards: ["file-boards"],
  projects: ["projects"],
} as const

export type QueryRoot = (typeof queryKeys)[keyof typeof queryKeys]
