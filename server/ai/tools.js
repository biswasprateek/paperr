const TOOL_DEFINITIONS = [
  {
    type: 'function',
    readOnly: true,
    function: {
      name: 'resolveDate',
      description: 'Convert a relative or ambiguous date/time expression into an absolute date (and time, if given). Always call this before passing a date to any other tool when the user says things like "today", "tomorrow", "day after tomorrow", "next Monday", "last Friday", "in 3 days", "a couple weeks from now", "next Friday at 5:30pm", "tuesday 530pm", "noon", etc. A trailing time-of-day (including "noon"/"midnight") is parsed too, so never ask the user to confirm a date just because a bare weekday or a time like "530pm" was given — pass the whole expression here instead.',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: 'The date (and optional time) expression to resolve. Examples: "today", "next monday", "last friday", "in 3 days", "a couple of weeks from now", "end of month", "start of month", "next weekend", "next friday at 5:30pm", "tuesday 530pm", "eod", "noon"',
          },
        },
        required: ['expression'],
      },
    },
  },
  {
    type: 'function',
    readOnly: true,
    function: {
      name: 'getTasks',
      description: 'Query tasks. Use this to look up tasks before referencing their IDs.',
      parameters: {
        type: 'object',
        properties: {
          projectId:    { type: 'integer', description: 'Filter by project ID' },
          assignedTo:   { type: 'integer', description: 'Filter by user ID' },
          status:       { type: 'string', enum: ['todo', 'in_progress', 'done', 'blocked'] },
          priority:     { type: 'string', enum: ['low', 'medium', 'high'], description: 'Filter by priority' },
          areaId:       { type: 'integer', description: 'Filter by area/room ID' },
          parentTaskId: { type: 'integer', description: 'Filter to subtasks of this parent task ID' },
          tag:          { type: 'string', description: 'Filter by tag name' },
          dueFrom:      { type: 'string', description: 'ISO date — tasks due on or after this date' },
          dueTo:        { type: 'string', description: 'ISO date — tasks due on or before this date' },
          search:       { type: 'string', description: 'Full-text search in task title/description' },
          isCompleted:  { type: 'boolean', description: 'Include completed tasks (default false)' },
          limit:        { type: 'integer', description: 'Max tasks to return (default 50)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createTask',
      description: 'Create a task. Only title is required. To break a goal into steps, pass a subtasks array — they are nested under the new task.',
      parameters: {
        type: 'object',
        properties: {
          title:       { type: 'string', description: 'Task title' },
          projectId:   { type: 'integer', description: 'ID of the project' },
          phaseId:     { type: 'integer', description: 'ID of the project phase' },
          areaId:      { type: 'integer', description: 'ID of the area/room' },
          assignedTo:  { type: 'integer', description: 'User ID to assign the task to (subtasks inherit this if not overridden)' },
          dueDate:     { type: 'string', description: 'Deadline (date only, YYYY-MM-DD) — shown as an all-day event' },
          startAt:     { type: 'string', description: 'Optional schedule start (YYYY-MM-DDTHH:MM) — appears as a calendar time block' },
          endAt:       { type: 'string', description: 'Optional schedule end (YYYY-MM-DDTHH:MM)' },
          priority:    { type: 'string', enum: ['low', 'medium', 'high'], description: 'Defaults to medium' },
          description: { type: 'string' },
          tags:        { type: 'array', items: { type: 'string' }, description: 'Tag names' },
          recur:       { type: 'string', enum: ['daily', 'weekly', 'weekdays', 'monthly', 'yearly'], description: 'Recurrence cadence; repeats until the deadline. Map "every day"→daily, "every week" or "every <weekday>" (e.g. "every monday")→weekly (resolve dueDate/startAt to that weekday first, via resolveDate), "every month"→monthly, "every year"/"annually"→yearly, "every weekday"→weekdays with recurDays [1,2,3,4,5]. Use "weekdays" with recurDays for specific days, e.g. "every Monday and Wednesday".' },
          recurDays:   { type: 'array', items: { type: 'integer' }, description: 'Weekday numbers (0=Sun … 6=Sat) — only when recur is "weekdays"' },
          subtasks: {
            type: 'array',
            description: 'Optional subtasks nested under this task. Subtasks have no deadline — schedule them with startAt/endAt only. Aim for 3–8 covering the goal end-to-end.',
            items: {
              type: 'object',
              properties: {
                title:       { type: 'string' },
                description: { type: 'string' },
                startAt:     { type: 'string',  description: 'Optional schedule start (YYYY-MM-DDTHH:MM)' },
                endAt:       { type: 'string',  description: 'Optional schedule end (YYYY-MM-DDTHH:MM)' },
                priority:    { type: 'string',  enum: ['low', 'medium', 'high'] },
                assignedTo:  { type: 'integer', description: 'Override assignee for this subtask' },
              },
              required: ['title'],
            },
          },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createEvent',
      description: 'Create a calendar event — something to attend at a scheduled time (appointment, class, meeting), as opposed to a to-do. Use this instead of createTask when the user says "event", "appointment", "class", "meeting", or similar. If it is unclear whether they want a task or an event, ask the user before calling either tool.',
      parameters: {
        type: 'object',
        properties: {
          title:         { type: 'string', description: 'Event title' },
          startDatetime: { type: 'string', description: 'Start date/time (YYYY-MM-DD or YYYY-MM-DDTHH:MM)' },
          endDatetime:   { type: 'string', description: 'Optional end date/time' },
          allDay:        { type: 'boolean', description: 'True for an all-day event' },
          location:      { type: 'string' },
          description:   { type: 'string' },
          projectId:     { type: 'integer', description: 'ID of the project' },
          attendeeIds:   { type: 'array', items: { type: 'integer' }, description: 'User IDs to invite (creator is always included)' },
          recur:         { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly'], description: 'Recurrence cadence. Map "every day"→daily, "every week" or "every <weekday>" (e.g. "every monday")→weekly (resolve startDatetime to that weekday first, via resolveDate), "every month"→monthly, "every year"/"annually"→yearly.' },
          recurEndDate:  { type: 'string', description: 'Last date the recurrence repeats until' },
        },
        required: ['title', 'startDatetime'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updateTask',
      description: 'Update one or more fields on an existing task.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'integer', description: 'ID of the task to update' },
          fields: {
            type: 'object',
            description: 'Fields to update — include only the ones you want to change',
            properties: {
              title:       { type: 'string' },
              description: { type: 'string' },
              dueDate:     { type: 'string', description: 'Deadline (date only, YYYY-MM-DD); ignored for subtasks' },
              startAt:     { type: 'string', description: 'Schedule start (YYYY-MM-DDTHH:MM) — calendar time block' },
              endAt:       { type: 'string', description: 'Schedule end (YYYY-MM-DDTHH:MM)' },
              priority:    { type: 'string', enum: ['low', 'medium', 'high'] },
              status:      { type: 'string', enum: ['todo', 'in_progress', 'done', 'blocked'] },
              assignedTo:  { type: 'integer' },
              projectId:   { type: 'integer', description: 'Move the task to this project (or null to remove)' },
              phaseId:     { type: 'integer', description: 'Move the task to this project phase' },
              areaId:      { type: 'integer' },
              tags:        { type: 'array', items: { type: 'string' }, description: 'Replaces all existing tags' },
            },
          },
        },
        required: ['taskId', 'fields'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'completeTask',
      description: 'Mark one or more tasks as completed. Pass taskId for one, or taskIds for several.',
      parameters: {
        type: 'object',
        properties: {
          taskId:  { type: 'integer', description: 'ID of a single task to complete' },
          taskIds: { type: 'array', items: { type: 'integer' }, description: 'IDs of multiple tasks to complete' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deleteTask',
      description: 'Permanently delete a task.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'integer', description: 'ID of the task to delete' },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rescheduleTasks',
      description: 'Move the due date on one or more tasks.',
      parameters: {
        type: 'object',
        properties: {
          taskIds:    { type: 'array', items: { type: 'integer' } },
          newDueDate: { type: 'string', description: 'New due date in YYYY-MM-DD format' },
        },
        required: ['taskIds', 'newDueDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createList',
      description: 'Create a new task list.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          icon: { type: 'string', description: 'Material Symbol icon name' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createProject',
      description: 'Create a new household project.',
      parameters: {
        type: 'object',
        properties: {
          name:        { type: 'string' },
          description: { type: 'string' },
          startDate:   { type: 'string', description: 'YYYY-MM-DD' },
          endDate:     { type: 'string', description: 'YYYY-MM-DD' },
          memberIds:   { type: 'array', items: { type: 'integer' }, description: 'User IDs to add as members' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updateProject',
      description: 'Update fields on an existing project.',
      parameters: {
        type: 'object',
        properties: {
          projectId: { type: 'integer' },
          fields: {
            type: 'object',
            description: 'Fields to update — include only the ones you want to change',
            properties: {
              name:        { type: 'string' },
              description: { type: 'string' },
              status:      { type: 'string', enum: ['draft', 'active', 'on_hold', 'completed', 'archived'] },
              endDate:     { type: 'string', description: 'YYYY-MM-DD' },
            },
          },
        },
        required: ['projectId', 'fields'],
      },
    },
  },
  {
    type: 'function',
    readOnly: true,
    function: {
      name: 'getSummary',
      description: 'Summary of activity for a period. scope "household" = tasks completed/created/overdue; scope "project" = progress %, done/total, overdue, blocked and in-progress counts.',
      parameters: {
        type: 'object',
        properties: {
          scope:     { type: 'string', enum: ['household', 'project'] },
          projectId: { type: 'integer', description: 'Required when scope is "project"' },
          period:    { type: 'string', enum: ['today', 'week', 'month'] },
        },
        required: ['scope', 'period'],
      },
    },
  },
  // ── List Item Tools ────────────────────────────────────────────────────────────
  {
    type: 'function',
    readOnly: true,
    function: {
      name: 'getListItems',
      description: 'Get all items in a specific list, including shopping lists.',
      parameters: {
        type: 'object',
        properties: {
          listId:           { type: 'integer', description: 'ID of the list' },
          includeCompleted: { type: 'boolean', description: 'Include completed items (default false)' },
        },
        required: ['listId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createListItem',
      description: 'Add an item to a list. Use this for shopping list items, checklists, or any list entry. Optionally link to a task or project.',
      parameters: {
        type: 'object',
        properties: {
          listId:    { type: 'integer', description: 'ID of the list to add the item to' },
          title:     { type: 'string',  description: 'Item title or name' },
          notes:     { type: 'string',  description: 'Optional notes (e.g. quantity, brand, store)' },
          taskId:    { type: 'integer', description: 'Optional: link to an existing task — project is inherited automatically' },
          projectId: { type: 'integer', description: 'Optional: link directly to a project' },
        },
        required: ['listId', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'completeListItem',
      description: 'Mark a list item as complete or incomplete.',
      parameters: {
        type: 'object',
        properties: {
          itemId:    { type: 'integer', description: 'ID of the list item' },
          completed: { type: 'boolean', description: 'true = mark complete, false = mark incomplete' },
        },
        required: ['itemId', 'completed'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deleteListItem',
      description: 'Permanently delete a list item.',
      parameters: {
        type: 'object',
        properties: {
          itemId: { type: 'integer', description: 'ID of the list item to delete' },
        },
        required: ['itemId'],
      },
    },
  },
];

// Single source of truth for read/write classification: the `readOnly` flag on each
// definition. Anything not flagged is a write (fail-safe — an unclassified new tool
// requires confirmation rather than executing silently).
const READ_ONLY_TOOLS = new Set(
  TOOL_DEFINITIONS.filter(t => t.readOnly).map(t => t.function.name)
);

// Wire copy for the LLM: OpenAI-compatible endpoints expect only { type, function },
// so drop our internal `readOnly` marker before sending.
const LLM_TOOLS = TOOL_DEFINITIONS.map(({ readOnly, ...t }) => t);

module.exports = { TOOL_DEFINITIONS, LLM_TOOLS, READ_ONLY_TOOLS };
