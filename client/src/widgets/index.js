import {
  TodayAgendaWidget, OverdueWidget, MyTasksWidget, UpcomingTasksWidget, StatsWidget,
} from './taskWidgets';
import {
  WelcomeWidget, ActivityWidget, ProjectsWidget, RoutinesWidget, EventsWidget, NotesWidget,
} from './otherWidgets';
import { ClockWidget } from './clockWidgets';
import { TimeProgressWidget } from './timeProgressWidget';
import { CalendarWidget, ScheduleWidget } from './calendarWidgets';
import WeatherWidget from './WeatherWidget';
import {
  PomodoroWidget, StopwatchWidget, TimerWidget,
  BreatheWidget, MeditateWidget, AmbientWidget,
} from './focusWidgets';
import FrameWidget from './FrameWidget';
import GoodThoughtsWidget from './GoodThoughtsWidget';
import { AgentInsightsWidget } from './agentWidgets';
import {
  SharedCalendarWidget, ListWidget, SpaceRoutinesWidget, StickyPadsWidget, DeepWorkWidget,
} from './sharedWidgets';
import {
  MoodWidget, PomodoroStreakWidget, FocusBreakdownWidget, StreaksWidget, SpacePulseWidget,
} from './analyticsWidgets';
import { AIServerWidget } from './aiServerWidget';

// Widget catalog. Each entry: display metadata, the source page its header
// links to, default + minimum grid spans (in cells), and the component.
// `group` is the source page used to organise the Add-widget drawer.
// `boards` lists which board types (personal Home, shared Hub) the widget is
// eligible for — defaults to both. Widgets whose content is viewer-relative
// (My Tasks, the Welcome greeting) are Home-only, since the Hub shows every
// member the same board.
export const WIDGETS = {
  'stats':         { title: 'Tasks At a Glance',     icon: 'insights',          group: 'Tasks',     source: '/tasks',     defaultSize: { w: 2, h: 1 }, minSize: { w: 2, h: 1 }, Component: StatsWidget,   description: 'Due, overdue and open task counts' },
  'today-agenda':  { title: 'Today',           icon: 'today',             group: 'Calendar',  source: '/calendar',  defaultSize: { w: 1, h: 2 }, minSize: { w: 1, h: 1 }, Component: TodayAgendaWidget,   description: 'Events, tasks and habits for today' },
  'overdue':       { title: 'Overdue',         icon: 'warning',           group: 'Tasks',     source: '/tasks',     defaultSize: { w: 1, h: 1 }, minSize: { w: 1, h: 1 }, Component: OverdueWidget,       description: 'Everything past its due date' },
  'my-tasks':      { title: 'My Tasks',        icon: 'assignment',        group: 'Tasks',     source: '/tasks',     defaultSize: { w: 1, h: 2 }, minSize: { w: 1, h: 1 }, Component: MyTasksWidget,       description: 'Open tasks assigned to you', boards: ['home'] },
  'upcoming-tasks':{ title: 'Upcoming',        icon: 'event_upcoming',    group: 'Tasks',     source: '/tasks',     defaultSize: { w: 1, h: 1 }, minSize: { w: 1, h: 1 }, Component: UpcomingTasksWidget, description: 'Tasks due in the next 7 days' },
  'events':        { title: 'Upcoming Events', icon: 'calendar_today',    group: 'Calendar',  source: '/calendar',  defaultSize: { w: 1, h: 2 }, minSize: { w: 1, h: 1 }, Component: EventsWidget,        description: 'Calendar, next 14 days' },
  'calendar':      { title: 'Calendar',        icon: 'calendar_month',    group: 'Calendar',  source: '/calendar',  defaultSize: { w: 2, h: 2 }, minSize: { w: 1, h: 1 }, Component: CalendarWidget,      description: 'Day, week or month view — sized to fit' },
  'schedule':      { title: 'Schedule',        icon: 'calendar_view_day', group: 'Calendar',  source: '/calendar',  defaultSize: { w: 1, h: 3 }, minSize: { w: 1, h: 2 }, Component: ScheduleWidget,      description: "Today's hour-by-hour timeline with habits" },
  'projects':      { title: 'Projects',        icon: 'folder_copy',       group: 'Projects',  source: '/projects',  defaultSize: { w: 1, h: 2 }, minSize: { w: 1, h: 1 }, Component: ProjectsWidget,      description: 'Active projects with progress' },
  'routines':      { title: 'Routines',        icon: 'repeat',            group: 'Routines',  source: '/routines',  defaultSize: { w: 1, h: 2 }, minSize: { w: 1, h: 1 }, Component: RoutinesWidget,      description: "Today's habits by time of day" },
  'notes':         { title: 'Notebooks',       icon: 'menu_book',         group: 'Notebooks', source: '/notebooks', defaultSize: { w: 1, h: 1 }, minSize: { w: 1, h: 1 }, Component: NotesWidget,         description: 'Recently edited notes' },
  'welcome':       { title: 'Welcome',         icon: 'waving_hand',       group: 'General',   source: null,         defaultSize: { w: 2, h: 1 }, minSize: { w: 2, h: 1 }, Component: WelcomeWidget,       description: 'Greeting and today summary', boards: ['home'] },
  'activity':      { title: 'Activity',        icon: 'bolt',              group: 'General',   source: null,         defaultSize: { w: 1, h: 2 }, minSize: { w: 1, h: 1 }, Component: ActivityWidget,      description: 'Recent actions across the space' },
  'clock':         { title: 'Clock',           icon: 'schedule',          group: 'General',   source: '/apps',      defaultSize: { w: 1, h: 1 }, minSize: { w: 1, h: 1 }, Component: ClockWidget,         description: 'Flip clock with alarms' },
  'time-progress': { title: 'Time Progress',   icon: 'percent',           group: 'General',   source: null,         defaultSize: { w: 1, h: 1 }, minSize: { w: 1, h: 1 }, Component: TimeProgressWidget,  description: 'How much of today, this month and this year has passed' },
  'weather':       { title: 'Weather',         icon: 'partly_cloudy_day', group: 'General',   source: null,         defaultSize: { w: 2, h: 2 }, minSize: { w: 1, h: 1 }, Component: WeatherWidget,       description: 'Local conditions and forecast' },
  'ai-agent':      { title: 'AI Agent',        icon: 'smart_toy',        group: 'General',   source: '/agents',    defaultSize: { w: 1, h: 2 }, minSize: { w: 1, h: 1 }, Component: AgentInsightsWidget, description: 'Insights from one agent of your choice' },
  // Admin-only: controls + credentials for the household's AI provider, not
  // something a non-admin member should see or touch. boards: ['home'] since
  // the Hub shows every member the same board and this is viewer-relative
  // (an admin's board, specifically) rather than space-shared.
  'ai-server':     { title: 'Ai Manager',      icon: 'dns',               group: 'General',   source: '/settings',  defaultSize: { w: 2, h: 2 }, minSize: { w: 1, h: 1 }, Component: AIServerWidget,      description: 'Power, memory, connection and models for the bundled AI server', boards: ['home'], adminOnly: true },
  'pomodoro':      { title: 'Pomodoro',        icon: 'timer',             group: 'Focus',     source: '/apps',      defaultSize: { w: 1, h: 2 }, minSize: { w: 1, h: 1 }, Component: PomodoroWidget,      description: 'Focus timer with work and break cycles' },
  'stopwatch':     { title: 'Stopwatch',       icon: 'timer',             group: 'Focus',     source: '/apps',      defaultSize: { w: 1, h: 1 }, minSize: { w: 1, h: 1 }, Component: StopwatchWidget,     description: 'Simple elapsed-time counter' },
  'timer':         { title: 'Timer',           icon: 'hourglass_top',     group: 'Focus',     source: '/apps',      defaultSize: { w: 1, h: 1 }, minSize: { w: 1, h: 1 }, Component: TimerWidget,         description: 'Countdown timer' },
  'breathe':       { title: 'Breathe',         icon: 'air',               group: 'Focus',     source: '/apps',      defaultSize: { w: 1, h: 2 }, minSize: { w: 1, h: 1 }, Component: BreatheWidget,       description: 'Guided breathing exercise' },
  'meditate':      { title: 'Meditate',        icon: 'self_improvement',  group: 'Focus',     source: '/apps',      defaultSize: { w: 1, h: 2 }, minSize: { w: 1, h: 1 }, Component: MeditateWidget,      description: 'Timed meditation sessions' },
  'ambient':       { title: 'Ambient',         icon: 'graphic_eq',        group: 'Focus',     source: '/apps',      defaultSize: { w: 1, h: 2 }, minSize: { w: 1, h: 1 }, Component: AmbientWidget,       description: 'Background soundscapes' },
  // Home-only: mood/meditation data never appears anywhere space-shared,
  // widgets included (Analytics spec §07/§08) — not offered on the Hub at all.
  'mood':          { title: 'Mood',            icon: 'mood',              group: 'Focus',     source: '/analytics', defaultSize: { w: 1, h: 2 }, minSize: { w: 1, h: 1 }, Component: MoodWidget,          description: 'Quick 5-point mood check-in + 7-day trend', boards: ['home'] },
  'frame':         { title: 'Frame',           icon: 'wallpaper',         group: 'Frame',     source: '/frame',     defaultSize: { w: 1, h: 2 }, minSize: { w: 1, h: 1 }, Component: FrameWidget,         description: 'Photo slideshow from your library' },
  'good-thoughts': { title: 'Good Thoughts',   icon: 'format_quote',      group: 'General',   source: '/apps',      defaultSize: { w: 2, h: 1 }, minSize: { w: 1, h: 1 }, Component: GoodThoughtsWidget,  description: 'Cycles affirmations, quotes and more' },
  'pomodoro-heatmap': { title: 'Pomodoro Streak', icon: 'calendar_view_month', group: 'Analytics', source: '/analytics', defaultSize: { w: 2, h: 1 }, minSize: { w: 1, h: 1 }, Component: PomodoroStreakWidget, description: '14-week Pomodoro contribution strip' },
  'focus-breakdown':  { title: 'Focus Breakdown', icon: 'donut_small',        group: 'Analytics', source: '/analytics', defaultSize: { w: 1, h: 1 }, minSize: { w: 1, h: 1 }, Component: FocusBreakdownWidget, description: "Today's minutes by app" },
  // Home-only: content is viewer-relative, same reason my-tasks/welcome already are.
  'streaks':          { title: 'Streaks',        icon: 'local_fire_department', group: 'Analytics', source: '/analytics', defaultSize: { w: 1, h: 1 }, minSize: { w: 1, h: 1 }, Component: StreaksWidget,      description: 'Current Pomodoro + top Routines streaks', boards: ['home'] },

  // Collaborative widgets — show every member's contribution at once
  // (colour dots, per-person columns), rather than one signed-in user's
  // view of space-wide data. Available on both Home and the Hub.
  'shared-calendar':{ title: 'Our Calendar',    icon: 'calendar_month',   group: 'Shared',    source: '/calendar',  defaultSize: { w: 2, h: 2 }, minSize: { w: 1, h: 1 }, Component: SharedCalendarWidget, description: 'Everyone’s events, one column per person' },
  'shared-list':    { title: 'List',            icon: 'checklist',        group: 'Shared',    source: '/lists',     defaultSize: { w: 1, h: 2 }, minSize: { w: 1, h: 1 }, Component: ListWidget,           description: 'A personal or shared list, checked off by anyone' },
  'space-routines': { title: 'Our Routines',    icon: 'groups',           group: 'Shared',    source: '/routines',  defaultSize: { w: 2, h: 2 }, minSize: { w: 1, h: 1 }, Component: SpaceRoutinesWidget,  description: 'Shared habits with everyone’s progress' },
  'sticky-pads':    { title: 'Sticky Pads',     icon: 'sticky_note_2',    group: 'Shared',    source: null,         defaultSize: { w: 2, h: 2 }, minSize: { w: 1, h: 1 }, Component: StickyPadsWidget,     description: 'Notes members leave for each other' },
  'deep-work':      { title: 'Deep Work',       icon: 'center_focus_strong', group: 'Shared', source: '/tasks',     defaultSize: { w: 1, h: 1 }, minSize: { w: 1, h: 1 }, Component: DeepWorkWidget,       description: 'Who’s heads-down right now' },
  'space-pulse':    { title: 'Space Pulse',     icon: 'groups',           group: 'Shared',    source: '/analytics', defaultSize: { w: 2, h: 1 }, minSize: { w: 1, h: 1 }, Component: SpacePulseWidget,     description: "This week's combined tasks, deep work & habit totals" },
};

export function getWidget(type) {
  return WIDGETS[type] || null;
}

// Board types a widget is eligible for — 'home' (personal) and/or 'hub'
// (shared). Absent `boards` on an entry means both.
export function widgetBoards(type) {
  return getWidget(type)?.boards || ['home', 'hub'];
}

// Size presets a widget cycles through when its resize handle is tapped.
// Clamped against the widget's minSize when applied.
export const SIZE_PRESETS = [
  { w: 1, h: 1 },
  { w: 1, h: 2 },
  { w: 2, h: 1 },
  { w: 2, h: 2 },
  { w: 1, h: 3 },
  { w: 2, h: 3 },
];

let _seq = 0;
export function newWidgetId() {
  _seq += 1;
  return `w-${Date.now().toString(36)}-${_seq}`;
}

// Default board for users who have never customised their Home — mirrors the
// "Test Home" reference space's board (all its pages) so new members land on
// a fully populated Home instead of an empty screen. The Admin page controls
// the shared AI server (its widgets are already adminOnly in WIDGETS), so it's
// only included for admins — a non-admin's board would render broken widgets
// otherwise, since nothing else strips adminOnly widgets from a saved board.
export function defaultBoard(isAdmin = false) {
  const pages = [
    {
      id: 'p-home',
      name: 'Home',
      widgets: [
        { id: newWidgetId(), type: 'ai-agent',      w: 1, h: 2, props: { agent: 'morning_brief', agentName: 'Morning Brief', agentIcon: null } },
        { id: newWidgetId(), type: 'clock',         w: 1, h: 2, props: {} },
        { id: newWidgetId(), type: 'weather',       w: 1, h: 3, props: {} },
        { id: newWidgetId(), type: 'frame',         w: 1, h: 2, props: {} },
        { id: newWidgetId(), type: 'good-thoughts', w: 2, h: 1, props: {} },
        { id: newWidgetId(), type: 'routines',      w: 1, h: 3, props: {} },
        { id: newWidgetId(), type: 'my-tasks',      w: 1, h: 2, props: {} },
        { id: newWidgetId(), type: 'overdue',       w: 1, h: 1, props: {} },
        { id: newWidgetId(), type: 'shared-list',   w: 1, h: 2, props: {} },
        { id: newWidgetId(), type: 'projects',      w: 1, h: 1, props: {} },
      ],
    },
    {
      id: newWidgetId(),
      name: 'Work',
      widgets: [
        { id: newWidgetId(), type: 'stats',            w: 2, h: 1, props: {} },
        { id: newWidgetId(), type: 'clock',             w: 1, h: 2, props: {} },
        { id: newWidgetId(), type: 'pomodoro',          w: 1, h: 2, props: {} },
        { id: newWidgetId(), type: 'calendar',          w: 2, h: 3, props: {} },
        { id: newWidgetId(), type: 'projects',          w: 1, h: 2, props: {} },
        { id: newWidgetId(), type: 'my-tasks',          w: 1, h: 2, props: {} },
        { id: newWidgetId(), type: 'notes',             w: 1, h: 2, props: {} },
        { id: newWidgetId(), type: 'ai-agent',          w: 1, h: 2, props: { agent: 'priority', agentName: 'Priority Focus', agentIcon: null } },
        { id: newWidgetId(), type: 'ai-agent',          w: 1, h: 2, props: { agent: 'bulletin_board', agentName: 'Bulletin Board', agentIcon: null } },
        { id: newWidgetId(), type: 'good-thoughts',     w: 1, h: 1, props: {} },
        { id: newWidgetId(), type: 'pomodoro-heatmap',  w: 2, h: 1, props: {} },
      ],
    },
    {
      id: newWidgetId(),
      name: 'Health',
      widgets: [
        { id: newWidgetId(), type: 'meditate',      w: 1, h: 2, props: {} },
        { id: newWidgetId(), type: 'frame',         w: 2, h: 3, props: {} },
        { id: newWidgetId(), type: 'breathe',       w: 2, h: 2, props: {} },
        { id: newWidgetId(), type: 'routines',      w: 1, h: 3, props: {} },
        { id: newWidgetId(), type: 'good-thoughts', w: 2, h: 1, props: {} },
        { id: newWidgetId(), type: 'mood',          w: 1, h: 1, props: {} },
      ],
    },
  ];

  if (isAdmin) {
    pages.push({
      id: newWidgetId(),
      name: 'Admin',
      widgets: [
        { id: newWidgetId(), type: 'ai-server', w: 1, h: 2, props: {} },
        { id: newWidgetId(), type: 'ai-server', w: 1, h: 1, props: {} },
      ],
    });
  }

  return { pages };
}
