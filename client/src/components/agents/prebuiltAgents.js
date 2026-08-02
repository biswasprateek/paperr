// Metadata for the six built-in agents. These run as hardcoded server logic
// (server/ai/agents/*.js), not data-driven rows, so there's nothing in the
// DB to "edit" directly — "Duplicate" instead pre-fills the custom agent
// form with an equivalent natural-language instruction the user can then
// tweak and own as a real custom_agents row.
export const PREBUILT_AGENTS = [
  {
    id: 'morning_brief',
    icon: '🌅',
    materialIcon: 'wb_sunny',
    title: 'Morning Brief',
    description: "Summarizes today's due tasks, overdue items, and calendar events every morning.",
    schedule: 'Daily at 08:00',
    duplicate: {
      name: 'Morning Brief (copy)',
      instructions: "Summarize today's due tasks, any overdue tasks, and today's calendar events in a short, friendly paragraph.",
      schedule_cron: '0 8 * * *',
    },
  },
  {
    id: 'reschedule',
    icon: '📅',
    materialIcon: 'event_repeat',
    title: 'Reschedule Advisor',
    description: "Suggests new dates for overdue tasks based on the coming week's workload.",
    schedule: 'Daily at 09:00',
    duplicate: {
      name: 'Reschedule Advisor (copy)',
      instructions: 'List my overdue tasks and suggest a lighter day in the next 7 days to move each one to.',
      schedule_cron: '0 9 * * *',
    },
  },
  {
    id: 'priority',
    icon: '🚩',
    materialIcon: 'flag',
    title: 'Priority Focus',
    description: 'Ranks high-priority tasks into a focus order when a day gets stacked with 5 or more.',
    schedule: 'Triggered — when a 5th high-priority task lands on one day',
    duplicate: {
      name: 'Priority Focus (copy)',
      instructions: 'List my high-priority tasks due today and suggest a focus order, with a one-line reason for each.',
      schedule_cron: '0 7 * * *',
    },
  },
  {
    id: 'workload',
    icon: '⚖️',
    materialIcon: 'balance',
    title: 'Workload Spread',
    description: 'Flags overloaded days in the next week and proposes redistributing tasks evenly.',
    schedule: 'Weekly, Sunday at 18:00',
    duplicate: {
      name: 'Workload Spread (copy)',
      instructions: "Look at my incomplete tasks due in the next 7 days grouped by day. Flag any day with much more than the average load, and suggest which tasks to move to lighter days.",
      schedule_cron: '0 18 * * 0',
    },
  },
  {
    id: 'bulletin_board',
    icon: '📣',
    materialIcon: 'campaign',
    title: 'Bulletin Board',
    description: 'A shared household digest of completed tasks, habits, and list activity — space-wide, not per-user.',
    schedule: 'Daily at 07:30, plus a weekly roll-up Monday',
    duplicate: {
      name: 'Bulletin Board (copy)',
      instructions: "Summarize completed tasks and habit check-ins for the household over the last day, highlighting each person's wins.",
      schedule_cron: '30 7 * * *',
    },
  },
];
